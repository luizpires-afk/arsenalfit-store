const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const {
  readRunnerEnv,
  createSupabaseRestClient,
} = require("./_supabase_runner_utils.cjs");

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
};
const hasArg = (name) => args.includes(name);

const envPath = getArg("--env", "supabase/functions/.env.scheduler");
const source = getArg("--source", "on_demand");
const outPrefix = getArg("--out-prefix", "logs/operational-health-snapshot");
const limit = Math.max(100, Math.min(5000, Number(getArg("--limit", "2500")) || 2500));
const includeSamples = Math.max(0, Math.min(100, Number(getArg("--sample-size", "20")) || 20));
const failOnCtaUnresolved = hasArg("--fail-on-cta-unresolved");
const failOnHealthyStandbyWithLink = hasArg("--fail-on-healthy-standby-with-link");
const autoEnqueueCtaUnresolved = hasArg("--auto-enqueue-cta-unresolved");

const safeIso = () => new Date().toISOString().replace(/[:.]/g, "-");

const normalizeReason = (value) => {
  const raw = String(value || "").trim();
  return raw ? raw : "none";
};

const countBy = (rows, mapper) => {
  const map = new Map();
  for (const row of rows) {
    const key = mapper(row);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
};

const isPendingStatus = (status) => {
  const normalized = String(status || "").toLowerCase();
  return normalized === "pending" || normalized === "pending_validacao" || normalized === "pending_validation";
};

const main = async () => {
  const env = readRunnerEnv(envPath);
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente.");
  }

  const offerModulePath = path.resolve(process.cwd(), "src/lib/offer.js");
  const offerModule = await import(pathToFileURL(offerModulePath).href);
  const resolveOfferUrl = offerModule?.resolveOfferUrl;
  if (typeof resolveOfferUrl !== "function") {
    throw new Error("resolveOfferUrl indisponivel em src/lib/offer.js");
  }

  const client = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });

  const products = await client.fetchPagedRows(
    `/products?select=id,name,marketplace,status,is_active,data_health_status,auto_disabled_reason,deactivation_reason,ml_item_id,affiliate_verified,affiliate_link,source_url,canonical_offer_url,last_price_source,last_price_verified_at,updated_at&marketplace=eq.mercadolivre&removed_at=is.null&limit=${limit}`,
    1000,
  );

  const activeHealthy = products.filter(
    (row) => String(row.status || "").toLowerCase() === "active" && row.is_active === true && String(row.data_health_status || "").toUpperCase() === "HEALTHY",
  );

  const ctaUnresolved = [];
  const ctaResolutionsByReason = new Map();
  for (const row of activeHealthy) {
    const resolution = resolveOfferUrl(row, { allowRedirectWhileStandby: false });
    const reasonKey = String(resolution?.reason || "unknown");
    ctaResolutionsByReason.set(reasonKey, (ctaResolutionsByReason.get(reasonKey) || 0) + 1);
    if (!resolution?.canRedirect) {
      ctaUnresolved.push({
        id: row.id,
        name: row.name,
        ml_item_id: row.ml_item_id,
        reason: resolution?.reason || "unknown",
      });
    }
  }

  const standby = products.filter((row) => String(row.status || "").toLowerCase() === "standby");
  const pending = products.filter((row) => isPendingStatus(row.status));
  const whey = products.filter((row) => /whey/i.test(String(row.name || "")));
  const wheyStandby = whey.filter((row) => String(row.status || "").toLowerCase() === "standby");
  const healthyStandbyWithLink = standby.filter((row) => {
    const healthy = String(row.data_health_status || "").toUpperCase() === "HEALTHY";
    const resolution = resolveOfferUrl(row, { allowRedirectWhileStandby: false });
    return healthy && Boolean(resolution?.canRedirect);
  });

  let autoQueuedRefresh = 0;
  let autoQueueFailed = 0;
  if (autoEnqueueCtaUnresolved && ctaUnresolved.length > 0) {
    for (const row of ctaUnresolved) {
      if (!row.ml_item_id) continue;
      try {
        await client.rpc("enqueue_price_check_refresh", {
          p_product_id: row.id,
          p_force: true,
          p_reason: "operational_snapshot_cta_unresolved",
        });
        autoQueuedRefresh += 1;
      } catch {
        autoQueueFailed += 1;
      }
    }
  }

  const report = {
    ok: true,
    generated_at: new Date().toISOString(),
    source,
    totals: {
      products: products.length,
      active_healthy: activeHealthy.length,
      cta_unresolved_total: ctaUnresolved.length,
      standby_total: standby.length,
      pending_total: pending.length,
      whey_total: whey.length,
      whey_standby_total: wheyStandby.length,
      healthy_standby_with_link_total: healthyStandbyWithLink.length,
    },
    standby_by_reason: countBy(standby, (row) => normalizeReason(row.auto_disabled_reason || row.deactivation_reason)),
    whey_standby_by_reason: countBy(wheyStandby, (row) => normalizeReason(row.auto_disabled_reason || row.deactivation_reason)),
    cta_resolution_reasons: Array.from(ctaResolutionsByReason.entries()).sort((a, b) => b[1] - a[1]),
    remediation: {
      auto_enqueue_cta_unresolved_enabled: autoEnqueueCtaUnresolved,
      auto_queued_refresh: autoQueuedRefresh,
      auto_queue_failed: autoQueueFailed,
    },
    samples: {
      cta_unresolved: ctaUnresolved.slice(0, includeSamples),
      healthy_standby_with_link: healthyStandbyWithLink.slice(0, includeSamples).map((row) => ({
        id: row.id,
        name: row.name,
        ml_item_id: row.ml_item_id,
        status: row.status,
        is_active: row.is_active,
        data_health_status: row.data_health_status,
        reason: normalizeReason(row.auto_disabled_reason || row.deactivation_reason),
      })),
      whey_standby: wheyStandby.slice(0, includeSamples).map((row) => ({
        id: row.id,
        name: row.name,
        ml_item_id: row.ml_item_id,
        status: row.status,
        is_active: row.is_active,
        data_health_status: row.data_health_status,
        reason: normalizeReason(row.auto_disabled_reason || row.deactivation_reason),
      })),
    },
  };

  const outDir = path.dirname(path.resolve(outPrefix));
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = safeIso();
  const outJson = path.resolve(`${outPrefix}-${stamp}.json`);
  const latestJson = path.resolve(`${outPrefix}-latest.json`);

  fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(latestJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ...report,
        files: {
          snapshot: outJson,
          latest: latestJson,
        },
      },
      null,
      2,
    ),
  );

  if (failOnCtaUnresolved && ctaUnresolved.length > 0) {
    process.exitCode = 2;
  }
  if (failOnHealthyStandbyWithLink && healthyStandbyWithLink.length > 0) {
    process.exitCode = 3;
  }
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
