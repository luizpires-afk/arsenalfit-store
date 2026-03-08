const fs = require("fs");
const path = require("path");
const {
  readRunnerEnv,
  createSupabaseRestClient,
  isMercadoLivreSecLink,
  toCsv,
} = require("./_supabase_runner_utils.cjs");

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
};

const envFile = getArg("--env", "supabase/functions/.env.scheduler");
const outPrefix = getArg("--out-prefix", "logs/launch-validated-products");
const maxReactivate = Math.max(1, Math.min(500, Number(getArg("--max-reactivate", "120")) || 120));

const isShortAffiliate = (value) => /^https?:\/\/(?:www\.)?meli\.la\//i.test(String(value || ""));
const hasValidAffiliateLink = (value) => isMercadoLivreSecLink(value) || isShortAffiliate(value);

const BLOCKED_REASONS = new Set(["blocked", "policy_blocked", "untrusted_drop_unconfirmed"]);
const REACTIVATABLE_REASONS = new Set(["strict_stale_price_trace", "supervisao_automatica_incoerencia", "none"]);

const normalizeReason = (row) =>
  String(row?.auto_disabled_reason || row?.deactivation_reason || "none")
    .trim()
    .toLowerCase();

const normalizeMlItem = (value) => {
  const match = String(value || "").toUpperCase().match(/MLB\d{6,14}/i);
  return match ? match[0].toUpperCase() : "";
};

const asPositivePrice = (value) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Number(n.toFixed(2));
};

const pickMaxPositive = (...values) => {
  const positives = values.map(asPositivePrice).filter((value) => value > 0);
  if (!positives.length) return 0;
  return Math.max(...positives);
};

const buildFallbackPriceMap = async (client, mlItems) => {
  if (!mlItems.length) return new Map();
  const rows = await client.request(
    `/product_catalog_data?select=ml_item_id,price,updated_at&ml_item_id=in.(${mlItems.map(encodeURIComponent).join(",")})&order=updated_at.desc`,
    { method: "GET" },
  );

  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const mlItemId = normalizeMlItem(row?.ml_item_id);
    if (!mlItemId || map.has(mlItemId)) continue;
    const price = Number(row?.price || 0);
    if (!(Number.isFinite(price) && price > 0)) continue;
    map.set(mlItemId, {
      price: Number(price.toFixed(2)),
      updated_at: row?.updated_at || null,
      source: "catalog_fallback",
    });
  }
  return map;
};

const buildDiscoveryFallbackPriceMap = async (client, externalIds) => {
  const map = new Map();
  const unique = [...new Set(externalIds.map((value) => String(value || "").trim()).filter(Boolean))];
  for (const externalId of unique) {
    try {
      const rows = await client.request(
        `/discovery_price_history?select=price,captured_at&external_product_id=eq.${encodeURIComponent(externalId)}&order=captured_at.desc&limit=1`,
        { method: "GET" },
      );
      const row = Array.isArray(rows) ? rows[0] : null;
      const price = asPositivePrice(row?.price);
      if (price <= 0) continue;
      map.set(externalId, {
        price,
        updated_at: row?.captured_at || null,
        source: "discovery_history",
      });
    } catch {
      // Ignore per-id lookup failures to keep the launch flow resilient.
    }
  }
  return map;
};

const main = async () => {
  const env = readRunnerEnv(envFile);
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente.");
  }

  const client = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });

  const products = await client.fetchPagedRows(
    "/products?select=id,name,ml_item_id,external_id,status,is_active,marketplace,affiliate_verified,affiliate_link,affiliate_validation_status,affiliate_validation_error,price,original_price,previous_price,last_price_source,last_price_verified_at,auto_disabled_reason,deactivation_reason,removed_at&marketplace=eq.mercadolivre&removed_at=is.null&order=updated_at.desc",
  );

  const validated = products.filter((row) => {
    const validationStatus = String(row?.affiliate_validation_status || "").toUpperCase();
    if (validationStatus !== "VALIDATED") return false;
    if (!Boolean(row?.affiliate_verified)) return false;
    if (!hasValidAffiliateLink(row?.affiliate_link)) return false;
    return true;
  });

  const standbyValidated = validated.filter(
    (row) => !(String(row?.status || "").toLowerCase() === "active" && Boolean(row?.is_active)),
  );

  const fallbackMap = await buildFallbackPriceMap(
    client,
    [...new Set(standbyValidated.map((row) => normalizeMlItem(row?.ml_item_id)).filter(Boolean))],
  );

  const discoveryFallbackMap = await buildDiscoveryFallbackPriceMap(
    client,
    standbyValidated.flatMap((row) => {
      const mlItemId = normalizeMlItem(row?.ml_item_id);
      const externalId = String(row?.external_id || "").trim();
      const values = [];
      if (mlItemId) values.push(mlItemId);
      if (externalId && externalId !== mlItemId) values.push(externalId);
      return values;
    }),
  );

  const nowIso = new Date().toISOString();
  const candidates = [];
  const skipped = [];

  for (const row of standbyValidated) {
    const reason = normalizeReason(row);
    const mlItemId = normalizeMlItem(row?.ml_item_id);
    if (BLOCKED_REASONS.has(reason)) {
      skipped.push({ id: row.id, ml_item_id: mlItemId, reason: "blocked_reason", raw_reason: reason });
      continue;
    }
    if (!REACTIVATABLE_REASONS.has(reason)) {
      skipped.push({ id: row.id, ml_item_id: mlItemId, reason: "reason_not_allowed", raw_reason: reason });
      continue;
    }

    const ownPrice = asPositivePrice(row?.price);
    const previousPrice = asPositivePrice(row?.previous_price);
    const originalPrice = asPositivePrice(row?.original_price);
    const fallback = fallbackMap.get(mlItemId) || null;
    const discoveryFallback =
      discoveryFallbackMap.get(mlItemId) ||
      discoveryFallbackMap.get(String(row?.external_id || "").trim()) ||
      null;
    const effectivePrice = pickMaxPositive(
      ownPrice,
      previousPrice,
      originalPrice,
      fallback?.price,
      discoveryFallback?.price,
    );
    if (!(Number.isFinite(effectivePrice) && effectivePrice > 0)) {
      skipped.push({ id: row.id, ml_item_id: mlItemId, reason: "no_positive_price" });
      continue;
    }

    let priceSource = "manual";
    let fallbackUpdatedAt = null;
    if (effectivePrice === ownPrice && ownPrice > 0) {
      priceSource = "manual";
    } else if (effectivePrice === previousPrice && previousPrice > 0) {
      priceSource = "previous_price";
    } else if (effectivePrice === originalPrice && originalPrice > 0) {
      priceSource = "original_price";
    } else if (effectivePrice === asPositivePrice(fallback?.price)) {
      priceSource = fallback?.source || "catalog_fallback";
      fallbackUpdatedAt = fallback?.updated_at || null;
    } else if (effectivePrice === asPositivePrice(discoveryFallback?.price)) {
      priceSource = discoveryFallback?.source || "discovery_history";
      fallbackUpdatedAt = discoveryFallback?.updated_at || null;
    }

    candidates.push({
      id: row.id,
      name: row.name,
      ml_item_id: mlItemId,
      old_reason: reason,
      price_old: ownPrice > 0 ? ownPrice : 0,
      price_new: effectivePrice,
      price_source_new: priceSource,
      fallback_price_updated_at: fallbackUpdatedAt,
    });
  }

  const appliedRows = [];
  const errors = [];

  for (const candidate of candidates.slice(0, maxReactivate)) {
    try {
      await client.patch(`/products?id=eq.${encodeURIComponent(candidate.id)}`, {
        status: "active",
        is_active: true,
        price: candidate.price_new,
        auto_disabled_reason: null,
        deactivation_reason: null,
        affiliate_verified: true,
        affiliate_validation_status: "VALIDATED",
        affiliate_validation_error: null,
        last_price_source: candidate.price_source_new,
        last_price_verified_at: nowIso,
        last_health_check_at: nowIso,
        price_mismatch_status: "RESOLVED",
        price_mismatch_reason: null,
        price_mismatch_resolved_at: nowIso,
        updated_at: nowIso,
      });
      appliedRows.push(candidate);
    } catch (error) {
      errors.push({
        id: candidate.id,
        ml_item_id: candidate.ml_item_id,
        error: String(error?.message || error),
      });
    }
  }

  const payload = {
    ok: errors.length === 0,
    generated_at: nowIso,
    totals: {
      validated_total: validated.length,
      standby_validated_total: standbyValidated.length,
      candidates_total: candidates.length,
      max_reactivate: maxReactivate,
      applied_total: appliedRows.length,
      skipped_total: skipped.length,
      failed_total: errors.length,
    },
    applied: appliedRows,
    skipped,
    errors,
  };

  fs.mkdirSync(path.dirname(outPrefix), { recursive: true });
  fs.writeFileSync(`${outPrefix}.json`, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(`${outPrefix}.csv`, `${toCsv(appliedRows)}\n`, "utf8");
  fs.writeFileSync(`${outPrefix}-skipped.csv`, `${toCsv(skipped)}\n`, "utf8");
  fs.writeFileSync(`${outPrefix}-errors.csv`, `${toCsv(errors)}\n`, "utf8");

  console.log(JSON.stringify(payload, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
