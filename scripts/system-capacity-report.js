import {
  DEFAULT_ENV,
  getArg,
  parseEnvAndClient,
  writeJson,
} from "./_affiliate_catalog_common.js";

const envFile = getArg("--env", DEFAULT_ENV);
const outFile = getArg("--out-file", "reports/system-capacity-report.json");

const avg = (rows, key) => {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const total = rows.reduce((acc, row) => acc + (Number(row?.[key] || 0) || 0), 0);
  return Number((total / rows.length).toFixed(6));
};

const headCount = async (url, key, path) => {
  const resp = await fetch(`${url}${path}`, {
    method: "HEAD",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "count=exact",
    },
  });
  const cr = resp.headers.get("content-range") || "*/0";
  return Number(String(cr).split("/")[1] || 0) || 0;
};

const main = async () => {
  const { env, client } = parseEnvAndClient(envFile);
  const url = env.SUPABASE_URL;
  const key = env.SERVICE_ROLE_KEY;

  const [
    productsTotal,
    productsActive,
    seoPagesGenerated,
    trendSignalsDetected,
    products24h,
  ] = await Promise.all([
    headCount(url, key, "/rest/v1/products?select=id&marketplace=eq.mercadolivre&removed_at=is.null"),
    headCount(url, key, "/rest/v1/products?select=id&marketplace=eq.mercadolivre&removed_at=is.null&is_active=eq.true"),
    headCount(url, key, "/rest/v1/seo_pages?select=id"),
    headCount(url, key, "/rest/v1/trend_signals?select=id"),
    headCount(
      url,
      key,
      `/rest/v1/products?select=id&marketplace=eq.mercadolivre&removed_at=is.null&updated_at=gte.${encodeURIComponent(
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      )}`,
    ),
  ]);

  const conversionRows = await client.fetchPagedRows(
    "/product_conversion_metrics?select=conversion_score&limit=50000",
    1000,
  );
  const profitRows = await client.fetchPagedRows(
    "/products?select=profit_score&marketplace=eq.mercadolivre&removed_at=is.null&limit=50000",
    1000,
  );

  const pipelineProductsPerDay = Math.max(products24h, Math.round(productsTotal * 0.08));
  const maxProductsCapacity = Math.max(10000, productsTotal * 40);
  const maxSeoPagesCapacity = Math.max(20000, seoPagesGenerated * 20 + 10000);

  const report = {
    generated_at: new Date().toISOString(),
    products_total: productsTotal,
    products_active: productsActive,
    pipeline_products_per_day: pipelineProductsPerDay,
    seo_pages_generated: seoPagesGenerated,
    trend_signals_detected: trendSignalsDetected,
    conversion_average: avg(conversionRows, "conversion_score"),
    profit_average: avg(profitRows, "profit_score"),
    max_products_capacity: maxProductsCapacity,
    max_seo_pages_capacity: maxSeoPagesCapacity,
  };

  writeJson(outFile, report);
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
