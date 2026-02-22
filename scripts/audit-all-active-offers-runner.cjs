const fs = require("fs");
const path = require("path");
const {
  readRunnerEnv,
  isMercadoLivreSecLink,
  extractMlItemIdFromUrl,
  resolveCanonicalMlItemId,
  resolveSiteFinalPrice,
  createSupabaseRestClient,
  classifyDelta,
  toCsv,
} = require("./_supabase_runner_utils.cjs");

const args = process.argv.slice(2);
const hasArg = (name) => args.includes(name);
const getArg = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
};
const toInt = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
};

const envFile = getArg("--env", "supabase/functions/.env.scheduler");
const outJsonPath = getArg("--out-json", ".tmp-audit-all-active-offers.json");
const outCsvPath = getArg("--out-csv", ".tmp-audit-all-active-offers.csv");
const topLimit = Math.max(1, toInt(getArg("--top", "50"), 50));
const includeAuditRpc = hasArg("--with-audit");
const warnPct = Number(getArg("--warn-pct", "25")) || 25;
const warnAbs = Number(getArg("--warn-abs", "20")) || 20;
const criticalPct = Number(getArg("--critical-pct", "50")) || 50;
const criticalAbs = Number(getArg("--critical-abs", "30")) || 30;

const { SUPABASE_URL, SERVICE_ROLE_KEY } = readRunnerEnv(envFile);
if (!SUPABASE_URL) {
  console.error("SUPABASE_URL nao definido. Informe no ambiente ou no arquivo:", envFile);
  process.exit(1);
}
if (!SERVICE_ROLE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY nao definido. Informe no ambiente ou no arquivo:", envFile);
  process.exit(1);
}

const client = createSupabaseRestClient({
  supabaseUrl: SUPABASE_URL,
  serviceRoleKey: SERVICE_ROLE_KEY,
});

const getActiveProducts = async () => {
  const select =
    "id,name,slug,price,pix_price,pix_price_source,marketplace,status,is_active,external_id,ml_item_id,source_url,canonical_offer_url,affiliate_link,data_health_status,last_sync,last_price_verified_at,updated_at,last_health_check_at";
  return client.fetchPagedRows(
    `/products?select=${encodeURIComponent(select)}&marketplace=eq.mercadolivre&removed_at=is.null&is_active=eq.true&status=eq.active&order=updated_at.desc`,
    500,
  );
};

const getOpenMismatchCases = async () => {
  const select =
    "id,product_id,site_price,ml_price,delta_abs,delta_pct,status,source,reason,last_audit_at,updated_at";
  return client.fetchPagedRows(
    `/price_mismatch_cases?select=${encodeURIComponent(select)}&status=eq.OPEN&order=updated_at.desc`,
    500,
  );
};

const evaluateOfferTarget = (product) => {
  const affiliateUrl = typeof product?.affiliate_link === "string" ? product.affiliate_link.trim() : "";
  const canonicalUrl =
    typeof product?.canonical_offer_url === "string" ? product.canonical_offer_url.trim() : "";
  const sourceUrl = typeof product?.source_url === "string" ? product.source_url.trim() : "";
  const canonicalMlItem = resolveCanonicalMlItemId(product);
  if (isMercadoLivreSecLink(affiliateUrl)) {
    const destinationMlItem =
      extractMlItemIdFromUrl(affiliateUrl) ||
      extractMlItemIdFromUrl(canonicalUrl) ||
      extractMlItemIdFromUrl(sourceUrl) ||
      canonicalMlItem;
    return {
      canRedirect: true,
      urlFinal: affiliateUrl,
      reason: "affiliate_validated",
      canonicalMlItem,
      destinationMlItem,
    };
  }
  return {
    canRedirect: false,
    urlFinal: null,
    reason: "awaiting_affiliate_validation",
    canonicalMlItem,
    destinationMlItem:
      extractMlItemIdFromUrl(canonicalUrl) ||
      extractMlItemIdFromUrl(sourceUrl) ||
      canonicalMlItem,
  };
};

const severityRank = (entry) => {
  if (entry.reason_code === "BROKEN_OFFER_URL") return 100;
  if (entry.reason_code === "ACTIVE_WITHOUT_ML_ITEM") return 95;
  if (entry.reason_code === "DESTINATION_ML_MISMATCH") return 90;
  if (entry.reason_code === "PRICE_MISMATCH_CRITICAL") return 80;
  if (entry.reason_code === "PRICE_MISMATCH_WARN") return 70;
  if (entry.reason_code === "SUSPECT_PRICE") return 60;
  return 10;
};

const ensureOutputDir = (filePath) => {
  const dir = path.dirname(path.resolve(filePath));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const main = async () => {
  const startedAt = new Date();
  let auditRpcResult = null;

  if (includeAuditRpc) {
    auditRpcResult = await client.rpc("run_price_mismatch_audit_service", {
      p_lookback_hours: 24,
      p_warn_pct: warnPct,
      p_warn_abs: warnAbs,
      p_critical_pct: criticalPct,
      p_critical_abs: criticalAbs,
      p_apply_critical_policy: false,
    });
  }

  const [activeProducts, openMismatch] = await Promise.all([getActiveProducts(), getOpenMismatchCases()]);
  const mismatchByProduct = new Map();
  for (const row of openMismatch) {
    if (!row?.product_id) continue;
    const current = mismatchByProduct.get(row.product_id);
    if (!current) {
      mismatchByProduct.set(row.product_id, row);
      continue;
    }
    const currentDelta = Number(current?.delta_pct ?? 0);
    const nextDelta = Number(row?.delta_pct ?? 0);
    if (nextDelta > currentDelta) mismatchByProduct.set(row.product_id, row);
  }

  const rows = [];
  let mismatchTotal = 0;
  let mismatchCritical = 0;
  let brokenLinkTotal = 0;
  let activeWithoutMlItemTotal = 0;
  let destinationMismatchTotal = 0;
  let suspectTotal = 0;

  for (const product of activeProducts) {
    const offerTarget = evaluateOfferTarget(product);
    const sitePrice = resolveSiteFinalPrice(product);
    const mismatch = mismatchByProduct.get(product.id);
    const canonicalMlItem = offerTarget.canonicalMlItem;
    const destinationMlItem = offerTarget.destinationMlItem;
    const mismatchDeltaAbs = mismatch ? Number(mismatch.delta_abs ?? 0) : null;
    const mismatchDeltaPct = mismatch ? Number(mismatch.delta_pct ?? 0) : null;
    const mismatchClass = classifyDelta(mismatchDeltaAbs, mismatchDeltaPct, {
      warnPct,
      warnAbs,
      criticalPct,
      criticalAbs,
    });
    if (String(product?.data_health_status || "").toUpperCase() === "SUSPECT_PRICE") {
      suspectTotal += 1;
    }

    let reasonCode = "HEALTHY";
    let reasonDetail = "ok";

    if (!offerTarget.canRedirect || !offerTarget.urlFinal) {
      reasonCode = "BROKEN_OFFER_URL";
      reasonDetail = offerTarget.reason || "missing_offer_url";
      brokenLinkTotal += 1;
    } else if (!canonicalMlItem) {
      reasonCode = "ACTIVE_WITHOUT_ML_ITEM";
      reasonDetail = "missing_canonical_ml_item";
      activeWithoutMlItemTotal += 1;
    } else if (destinationMlItem && canonicalMlItem && destinationMlItem !== canonicalMlItem) {
      reasonCode = "DESTINATION_ML_MISMATCH";
      reasonDetail = `${canonicalMlItem}!=${destinationMlItem}`;
      destinationMismatchTotal += 1;
    } else if (mismatchClass.critical) {
      reasonCode = "PRICE_MISMATCH_CRITICAL";
      reasonDetail = mismatch?.reason || "critical_delta";
      mismatchTotal += 1;
      mismatchCritical += 1;
    } else if (mismatchClass.mismatch) {
      reasonCode = "PRICE_MISMATCH_WARN";
      reasonDetail = mismatch?.reason || "warn_delta";
      mismatchTotal += 1;
    } else if (String(product?.data_health_status || "").toUpperCase() === "SUSPECT_PRICE") {
      reasonCode = "SUSPECT_PRICE";
      reasonDetail = "pending_recheck";
    }

    rows.push({
      id: product.id,
      name: product.name,
      ml_item_id: canonicalMlItem,
      destination_ml_item_id: destinationMlItem,
      site_price: sitePrice,
      ml_price: mismatch ? Number(mismatch.ml_price ?? 0) || null : null,
      delta_abs: mismatchDeltaAbs,
      delta_pct: mismatchDeltaPct,
      url_final: offerTarget.urlFinal,
      data_health_status: product.data_health_status || null,
      reason_code: reasonCode,
      reason_detail: reasonDetail,
      last_sync: product.last_sync || null,
      updated_at: product.updated_at || null,
    });
  }

  const topCases = rows
    .filter((row) => row.reason_code !== "HEALTHY")
    .sort((a, b) => {
      const rankDiff = severityRank(b) - severityRank(a);
      if (rankDiff !== 0) return rankDiff;
      return Number(b.delta_pct ?? 0) - Number(a.delta_pct ?? 0);
    })
    .slice(0, topLimit);

  const report = {
    generated_at: new Date().toISOString(),
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    config: {
      warn_pct: warnPct,
      warn_abs: warnAbs,
      critical_pct: criticalPct,
      critical_abs: criticalAbs,
      top_limit: topLimit,
      include_audit_rpc: includeAuditRpc,
    },
    totals: {
      total_active: activeProducts.length,
      mismatch_total: mismatchTotal,
      mismatch_critical: mismatchCritical,
      broken_link_total: brokenLinkTotal,
      active_without_ml_item_total: activeWithoutMlItemTotal,
      destination_ml_mismatch_total: destinationMismatchTotal,
      suspect_total: suspectTotal,
    },
    audit_rpc_result: auditRpcResult,
    top_cases: topCases,
  };

  ensureOutputDir(outJsonPath);
  fs.writeFileSync(outJsonPath, JSON.stringify(report, null, 2), "utf8");

  const csvRows = topCases.map((row) => ({
    id: row.id,
    name: row.name,
    reason_code: row.reason_code,
    reason_detail: row.reason_detail,
    ml_item_id: row.ml_item_id || "",
    destination_ml_item_id: row.destination_ml_item_id || "",
    site_price: row.site_price ?? "",
    ml_price: row.ml_price ?? "",
    delta_abs: row.delta_abs ?? "",
    delta_pct: row.delta_pct ?? "",
    url_final: row.url_final || "",
    data_health_status: row.data_health_status || "",
    updated_at: row.updated_at || "",
  }));
  ensureOutputDir(outCsvPath);
  fs.writeFileSync(outCsvPath, toCsv(csvRows), "utf8");

  console.log(JSON.stringify(report, null, 2));
  console.log(`\nJSON: ${path.resolve(outJsonPath)}`);
  console.log(`CSV: ${path.resolve(outCsvPath)}`);
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
