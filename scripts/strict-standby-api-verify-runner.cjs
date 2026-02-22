const { readRunnerEnv, createSupabaseRestClient } = require("./_supabase_runner_utils.cjs");

const args = process.argv.slice(2);

const getArg = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
};

const hasArg = (name) => args.includes(name);

const envPath = getArg("--env", "supabase/functions/.env.scheduler");
const limit = Math.max(1, Math.min(500, Number(getArg("--limit", "120")) || 120));
const waitMs = Math.max(0, Math.min(3000, Number(getArg("--wait-ms", "120")) || 120));
const warnPct = Number(getArg("--warn-pct", "25")) || 25;
const warnAbs = Number(getArg("--warn-abs", "20")) || 20;
const dryRun = hasArg("--dry-run");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const asNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const computeDelta = (sitePrice, apiPrice) => {
  const site = asNumber(sitePrice);
  const api = asNumber(apiPrice);
  if (!(site !== null && api !== null && site > 0 && api > 0)) {
    return { valid: false, deltaAbs: null, deltaPct: null };
  }
  const deltaAbs = Math.abs(site - api);
  const deltaPct = (deltaAbs / Math.max(site, api)) * 100;
  return { valid: true, deltaAbs, deltaPct };
};

const isStandbyLike = (row) => {
  const status = String(row?.status || "").toLowerCase();
  return (
    ["standby", "pending", "pending_validacao", "pending_validation"].includes(status) ||
    !row?.is_active ||
    !row?.affiliate_verified
  );
};

const isNearEligible = (row) => {
  if (!isStandbyLike(row)) return false;
  if (String(row?.data_health_status || "HEALTHY") !== "HEALTHY") return false;
  if (String(row?.price_mismatch_status || "NONE") === "OPEN") return false;
  if (!(Number(row?.price || 0) > 0)) return false;
  if (!String(row?.ml_item_id || "").trim()) return false;
  const hasUrl = String(row?.source_url || "").trim() || String(row?.affiliate_link || "").trim();
  if (!hasUrl) return false;
  return true;
};

const main = async () => {
  const env = readRunnerEnv(envPath);
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente.");
  }

  const client = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });

  const rows = await client.request(
    "/products?select=id,name,status,is_active,affiliate_verified,data_health_status,price_mismatch_status,price,last_price_source,last_price_verified_at,ml_item_id,source_url,affiliate_link,removed_at,marketplace&marketplace=ilike.mercado*&removed_at=is.null&order=updated_at.asc&limit=3000",
    { method: "GET" },
  );

  const candidates = (Array.isArray(rows) ? rows : [])
    .filter(isNearEligible)
    .filter((row) => !["API_BASE", "API_PIX"].includes(String(row?.last_price_source || "")))
    .slice(0, limit);

  const result = {
    ok: true,
    dry_run: dryRun,
    config: { limit, wait_ms: waitMs, warn_pct: warnPct, warn_abs: warnAbs },
    totals: {
      scanned_candidates: candidates.length,
      api_ok: 0,
      api_fail: 0,
      patched_api_base: 0,
      skipped_mismatch: 0,
      skipped_invalid_price: 0,
    },
    sample_updates: [],
    sample_skips: [],
  };

  for (const row of candidates) {
    const mlItemId = String(row.ml_item_id || "").trim().toUpperCase();
    let apiPrice = null;
    let status = 0;

    try {
      const response = await fetch(`https://api.mercadolibre.com/items/${encodeURIComponent(mlItemId)}`);
      status = response.status;
      if (!response.ok) {
        result.totals.api_fail += 1;
        if (result.sample_skips.length < 20) {
          result.sample_skips.push({
            id: row.id,
            name: row.name,
            reason: `api_http_${status}`,
            ml_item_id: mlItemId,
          });
        }
        if (waitMs > 0) await sleep(waitMs);
        continue;
      }

      const body = await response.json();
      apiPrice = asNumber(body?.price);
      if (!(apiPrice && apiPrice > 0)) {
        result.totals.api_fail += 1;
        result.totals.skipped_invalid_price += 1;
        if (result.sample_skips.length < 20) {
          result.sample_skips.push({
            id: row.id,
            name: row.name,
            reason: "api_price_invalid",
            ml_item_id: mlItemId,
          });
        }
        if (waitMs > 0) await sleep(waitMs);
        continue;
      }

      result.totals.api_ok += 1;

      const delta = computeDelta(row.price, apiPrice);
      if (!delta.valid || delta.deltaAbs > warnAbs || delta.deltaPct > warnPct) {
        result.totals.skipped_mismatch += 1;
        if (result.sample_skips.length < 20) {
          result.sample_skips.push({
            id: row.id,
            name: row.name,
            reason: "price_delta_above_policy",
            site_price: asNumber(row.price),
            api_price: apiPrice,
            delta_abs: delta.deltaAbs,
            delta_pct: delta.deltaPct,
          });
        }
        if (waitMs > 0) await sleep(waitMs);
        continue;
      }

      if (!dryRun) {
        const nowIso = new Date().toISOString();
        await client.patch(`/products?id=eq.${encodeURIComponent(row.id)}`, {
          last_price_source: "API_BASE",
          last_price_verified_at: nowIso,
          last_health_check_at: nowIso,
          updated_at: nowIso,
        });
      }

      result.totals.patched_api_base += 1;
      if (result.sample_updates.length < 20) {
        result.sample_updates.push({
          id: row.id,
          name: row.name,
          ml_item_id: mlItemId,
          site_price: asNumber(row.price),
          api_price: apiPrice,
          delta_abs: delta.deltaAbs,
          delta_pct: delta.deltaPct,
        });
      }
    } catch (error) {
      result.totals.api_fail += 1;
      if (result.sample_skips.length < 20) {
        result.sample_skips.push({
          id: row.id,
          name: row.name,
          reason: `api_error:${error?.message || String(error)}`,
          ml_item_id: mlItemId,
        });
      }
    }

    if (waitMs > 0) await sleep(waitMs);
  }

  console.log(JSON.stringify(result, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
