const fs = require("fs");
const path = require("path");
const { readRunnerEnv, createSupabaseRestClient } = require("./_supabase_runner_utils.cjs");

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const getArg = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
};

const envPath = getArg("--env", "supabase/functions/.env.scheduler");
const inputPath = getArg("--input", ".tmp-all-products-pricing-check.json");
const limit = Math.max(1, Number(getArg("--limit", "15")) || 15);
const minRisk = Math.max(1, Number(getArg("--min-risk", "40")) || 40);
const force = hasFlag("--force");
const dryRun = hasFlag("--dry-run");
const reason = getArg("--reason", "promo_top_risk_revalidate");

const normalizeId = (value) => {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
};

const loadReport = (filePath) => {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Arquivo de auditoria nao encontrado: ${absolutePath}`);
  }
  const content = fs.readFileSync(absolutePath, "utf8");
  const parsed = JSON.parse(content);
  const topRisk = Array.isArray(parsed?.top_risk) ? parsed.top_risk : [];
  return { absolutePath, topRisk };
};

const shouldEnqueue = (item) => {
  const riskScore = Number(item?.risk_score || 0);
  if (riskScore < minRisk) return false;

  const strikeVisible = item?.strike_visible === true;
  const hasPromoSignal = item?.has_promo_signal === true;
  const declared = Number(item?.declared_discount_percent || 0);
  const display = Number(item?.display_discount_percent || 0);
  const gap = declared - display;

  if (!strikeVisible && declared > 0) return true;
  if (!hasPromoSignal && declared > 0) return true;
  if (gap >= 10) return true;
  return false;
};

const main = async () => {
  const env = readRunnerEnv(envPath);
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente.");
  }

  const { absolutePath, topRisk } = loadReport(inputPath);
  const selected = topRisk
    .filter(shouldEnqueue)
    .slice(0, limit)
    .map((item) => ({
      id: normalizeId(item?.id),
      name: item?.name ?? null,
      ml_item_id: item?.ml_item_id ?? null,
      risk_score: Number(item?.risk_score || 0),
      declared_discount_percent: Number(item?.declared_discount_percent || 0),
      display_discount_percent: Number(item?.display_discount_percent || 0),
    }))
    .filter((item) => item.id);

  const result = {
    ok: true,
    input: absolutePath,
    totals: {
      top_risk_available: topRisk.length,
      selected_total: selected.length,
      queued_total: 0,
      skipped_total: 0,
      error_total: 0,
    },
    selected,
    queued: [],
    skipped: [],
    errors: [],
  };

  if (selected.length === 0) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (dryRun) {
    result.totals.skipped_total = selected.length;
    result.skipped = selected.map((item) => ({
      ...item,
      reason: "dry_run",
    }));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const client = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });

  for (const item of selected) {
    try {
      await client.rpc("enqueue_price_check_refresh", {
        p_product_id: item.id,
        p_force: force,
        p_reason: reason,
      });
      result.totals.queued_total += 1;
      result.queued.push(item);
    } catch (error) {
      result.totals.error_total += 1;
      result.errors.push({
        ...item,
        error: error?.message || String(error),
      });
    }
  }

  result.totals.skipped_total =
    result.totals.selected_total - result.totals.queued_total - result.totals.error_total;

  console.log(JSON.stringify(result, null, 2));

  if (result.totals.error_total > 0) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
