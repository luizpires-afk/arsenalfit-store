import {
  DEFAULT_ENV,
  getArg,
  parseEnvAndClient,
  writeJson,
} from "./_affiliate_catalog_common.js";
import fs from "fs";

const envFile = getArg("--env", DEFAULT_ENV);
const outFile = getArg("--out-file", "reports/ai-system-health-report.json");

const average = (rows, key) => {
  if (!rows.length) return 0;
  const total = rows.reduce((acc, row) => acc + (Number(row?.[key] || 0) || 0), 0);
  return Number((total / rows.length).toFixed(6));
};

const headCount = async (url, headers, path) => {
  const resp = await fetch(`${url}${path}`, {
    method: "HEAD",
    headers: { ...headers, Prefer: "count=exact" },
  });
  const cr = resp.headers.get("content-range") || "*/0";
  const total = Number(String(cr).split("/")[1] || 0) || 0;
  return total;
};

const parseLastPipelineStatus = (logPath = "logs/ml-30m-sync-cycle.log") => {
  try {
    if (!fs.existsSync(logPath)) return { pipeline_status: "FAILED", last_run_time: null, duration_seconds: 0 };
    const lines = String(fs.readFileSync(logPath, "utf8")).split(/\r?\n/).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (/completed_ok/i.test(line)) {
        const ts = line.match(/^\[([^\]]+)\]/)?.[1] || null;
        const healthLine = lines.slice(Math.max(0, i - 5), i + 1).find((x) => /pipeline_duration=\d+s/i.test(x));
        const duration = Number(healthLine?.match(/pipeline_duration=(\d+)s/i)?.[1] || 0) || 0;
        return { pipeline_status: "OK", last_run_time: ts, duration_seconds: duration };
      }
      if (/completed_with_errors/i.test(line)) {
        const ts = line.match(/^\[([^\]]+)\]/)?.[1] || null;
        const healthLine = lines.slice(Math.max(0, i - 5), i + 1).find((x) => /pipeline_duration=\d+s/i.test(x));
        const duration = Number(healthLine?.match(/pipeline_duration=(\d+)s/i)?.[1] || 0) || 0;
        return { pipeline_status: "WARNING", last_run_time: ts, duration_seconds: duration };
      }
    }
    return { pipeline_status: "FAILED", last_run_time: null, duration_seconds: 0 };
  } catch {
    return { pipeline_status: "FAILED", last_run_time: null, duration_seconds: 0 };
  }
};

const main = async () => {
  const { env, client } = parseEnvAndClient(envFile);
  const url = env.SUPABASE_URL;
  const key = env.SERVICE_ROLE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  const productsScanned = await headCount(url, headers, "/rest/v1/products?select=id&removed_at=is.null&marketplace=eq.mercadolivre");
  const activeProducts = await headCount(url, headers, "/rest/v1/products?select=id&removed_at=is.null&marketplace=eq.mercadolivre&is_active=eq.true");
  const seoPagesGenerated = await headCount(url, headers, "/rest/v1/seo_pages?select=id&is_active=eq.true");
  const trendProducts = await headCount(url, headers, "/rest/v1/trend_discovered_products?select=id&status=eq.pending_review");
  const predictedTrends = await headCount(url, headers, "/rest/v1/predicted_trends?select=id");

  let adsCreated = 0;
  try {
    adsCreated = await headCount(url, headers, "/rest/v1/ad_campaigns?select=id");
  } catch {
    adsCreated = 0;
  }

  let pricingUpdates = 0;
  try {
    pricingUpdates = await headCount(url, headers, "/rest/v1/product_price_intelligence?select=id");
  } catch {
    pricingUpdates = 0;
  }

  const conversionRows = await client.fetchPagedRows(
    "/product_conversion_metrics?select=conversion_score&limit=50000",
    1000,
  );
  const profitRows = await client.fetchPagedRows(
    "/products?select=profit_score&marketplace=eq.mercadolivre&removed_at=is.null&limit=50000",
    1000,
  );

  const pipeline = parseLastPipelineStatus();

  const report = {
    generated_at: new Date().toISOString(),
    ok: true,
    pipeline_status: pipeline.pipeline_status,
    last_pipeline_run_time: pipeline.last_run_time,
    duration_seconds: pipeline.duration_seconds,
    products_active: activeProducts,
    seo_pages: seoPagesGenerated,
    trend_products: trendProducts,
    trend_signals: productsScanned,
    predicted_trends: predictedTrends,
    ads_campaigns: adsCreated,
    conversion_average: average(conversionRows || [], "conversion_score"),
    profit_average: average(profitRows || [], "profit_score"),
    legacy_metrics: {
      products_scanned: productsScanned,
      pricing_updates: pricingUpdates,
    },
  };

  writeJson(outFile, report);
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
