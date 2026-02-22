import fs from "fs";
import path from "path";
import { resolvePricePresentation } from "../src/lib/pricing.js";

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
};

const envFile = getArg("--env", "supabase/functions/.env.scheduler");
const outJsonPath = getArg("--out-json", ".tmp-live-item-price-divergence.json");
const waitMs = Number(getArg("--wait-ms", "120")) || 120;

const refsRegex = [
  /adaptogen/i,
  /iso\s+protein\s+blend\s+probiotica/i,
  /creatina\s+monohidratada\s+-\s+pote\s+300g\s+dux/i,
  /\+\s*mu/i,
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readEnvFile = (filePath) => {
  const env = {};
  const text = fs.readFileSync(path.resolve(filePath), "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return env;
};

const isReference = (name) => refsRegex.some((rx) => rx.test(String(name || "")));

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const main = async () => {
  const env = readEnvFile(envFile);
  const supabaseUrl = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !key) throw new Error("SUPABASE_URL/SERVICE_ROLE_KEY ausentes");

  const select = [
    "id",
    "name",
    "ml_item_id",
    "price",
    "pix_price",
    "pix_price_source",
    "original_price",
    "previous_price",
    "previous_price_source",
    "previous_price_expires_at",
    "last_price_source",
    "status",
    "is_active",
    "data_health_status",
    "affiliate_link",
    "canonical_offer_url",
    "source_url",
    "updated_at",
  ].join(",");

  const url = `${supabaseUrl}/rest/v1/products?select=${encodeURIComponent(select)}&marketplace=eq.mercadolivre&removed_at=is.null&is_active=eq.true&status=eq.active&order=updated_at.desc&limit=1000`;
  const response = await fetch(url, {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
    },
  });

  if (!response.ok) throw new Error(`fetch products failed: ${response.status}`);
  const rows = await response.json();

  const sample = rows.filter((p) => !isReference(p?.name));
  const checks = [];

  for (const product of sample) {
    const mlItemId = String(product?.ml_item_id || "").trim().toUpperCase();
    if (!mlItemId) continue;

    const sitePricing = resolvePricePresentation(product);
    const sitePrice = toNumber(sitePricing.displayPricePrimary);

    let itemStatus = 0;
    let apiPrice = null;
    let error = null;

    try {
      const itemResp = await fetch(`https://api.mercadolibre.com/items/${encodeURIComponent(mlItemId)}`);
      itemStatus = itemResp.status;
      if (itemResp.ok) {
        const body = await itemResp.json();
        apiPrice = toNumber(body?.price);
      } else {
        error = `http_${itemResp.status}`;
      }
    } catch (e) {
      error = String(e?.message || e);
    }

    const diffAbs = sitePrice !== null && apiPrice !== null ? Number((sitePrice - apiPrice).toFixed(2)) : null;
    const diffPct =
      diffAbs !== null && apiPrice !== null && apiPrice > 0
        ? Number((((Math.abs(diffAbs)) / apiPrice) * 100).toFixed(2))
        : null;

    const mismatch = diffAbs !== null && diffPct !== null && (Math.abs(diffAbs) >= 5 || diffPct >= 5);

    checks.push({
      id: product.id,
      name: product.name,
      ml_item_id: mlItemId,
      last_price_source: product.last_price_source,
      data_health_status: product.data_health_status,
      site_price: sitePrice,
      ml_api_price: apiPrice,
      diff_abs: diffAbs,
      diff_pct: diffPct,
      mismatch,
      item_status: itemStatus,
      error,
    });

    if (waitMs > 0) await sleep(waitMs);
  }

  const total = checks.length;
  const success = checks.filter((c) => c.item_status === 200 && c.ml_api_price !== null).length;
  const mismatches = checks.filter((c) => c.mismatch);

  const bySource = {};
  for (const row of checks) {
    const key = String(row.last_price_source || "unknown");
    if (!bySource[key]) bySource[key] = { total: 0, mismatch: 0 };
    bySource[key].total += 1;
    if (row.mismatch) bySource[key].mismatch += 1;
  }

  const report = {
    generated_at: new Date().toISOString(),
    config: { excluded_references: true, wait_ms: waitMs, threshold_abs: 5, threshold_pct: 5 },
    totals: {
      total_checked: total,
      api_success: success,
      mismatch_total: mismatches.length,
      mismatch_rate_pct: total > 0 ? Number(((mismatches.length / total) * 100).toFixed(2)) : 0,
    },
    by_last_price_source: bySource,
    top_mismatches: mismatches
      .sort((a, b) => (b.diff_pct || 0) - (a.diff_pct || 0))
      .slice(0, 40),
  };

  fs.writeFileSync(path.resolve(outJsonPath), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nJSON: ${path.resolve(outJsonPath)}`);
};

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
