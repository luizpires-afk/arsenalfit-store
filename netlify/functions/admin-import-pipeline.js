import { spawnSync } from "child_process";
import { createClient } from "@supabase/supabase-js";

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

const runStepWithRetry = (step, retries = 2) => {
  const maxAttempts = retries + 1;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = spawnSync("npm", ["run", step], {
      cwd: process.cwd(),
      stdio: "pipe",
      encoding: "utf8",
    });

    if (result.status === 0) {
      return {
        ok: true,
        step,
        attempt,
      };
    }

    lastError = (result.stderr || result.stdout || "step_failed").slice(-1200);
  }

  return {
    ok: false,
    step,
    attempt: maxAttempts,
    error: lastError,
  };
};

const countByProductIds = async (supabase, table, productIds, extraFilter = null) => {
  if (!Array.isArray(productIds) || productIds.length === 0) return 0;
  let query = supabase.from(table).select("id", { count: "exact", head: true }).in("id", productIds);
  if (extraFilter) query = extraFilter(query);
  const { count, error } = await query;
  if (error) return 0;
  return count || 0;
};

const countParsed = async (supabase, productIds) => {
  if (!Array.isArray(productIds) || productIds.length === 0) return 0;
  const { count, error } = await supabase
    .from("product_catalog_data")
    .select("id", { count: "exact", head: true })
    .in("product_id", productIds);
  if (error) return 0;
  return count || 0;
};

const computeRejected = async (supabase, productIds) => {
  if (!Array.isArray(productIds) || productIds.length === 0) return 0;
  const { data, error } = await supabase
    .from("products")
    .select("id, affiliate_validation_status, status, is_active")
    .in("id", productIds);
  if (error || !Array.isArray(data)) return 0;

  return data.filter((row) => {
    const av = String(row?.affiliate_validation_status || "").toUpperCase();
    const st = String(row?.status || "").toLowerCase();
    if (av.startsWith("INVALID") || av.startsWith("ERROR")) return true;
    if (st === "rejected" || st === "blocked") return true;
    return false;
  }).length;
};

export const handler = async (event) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, { error: "missing_env" });
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const productIds = Array.isArray(body?.productIds) ? body.productIds : [];

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const steps = [
      "catalog_ingest_auto",
      "mercadolivre_product_parser",
      "product_validator_auto",
      "price_history_update",
      "deal_detector_30m",
      "ai_profit_predictor",
      "conversion_optimizer",
      "auto_activate_high_quality",
    ];

    const stepResults = steps.map((step) => runStepWithRetry(step, 2));
    const failed = stepResults.filter((r) => !r.ok);

    const [parsed, validated, activated, rejected] = await Promise.all([
      countParsed(supabase, productIds),
      countByProductIds(supabase, "products", productIds, (q) =>
        q.in("affiliate_validation_status", ["VALIDATED", "PENDING"]),
      ),
      countByProductIds(supabase, "products", productIds, (q) => q.eq("is_active", true)),
      computeRejected(supabase, productIds),
    ]);

    return jsonResponse(200, {
      ok: failed.length === 0,
      steps: stepResults,
      summary: {
        products_imported: productIds.length,
        products_parsed: parsed,
        products_validated: validated,
        products_activated: activated,
        products_rejected: rejected,
      },
    });
  } catch (error) {
    return jsonResponse(500, {
      error: String(error?.message || error),
    });
  }
};
