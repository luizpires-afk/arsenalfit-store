import {
  DEFAULT_ENV,
  getArg,
  parseEnvAndClient,
  writeJson,
} from "./_affiliate_catalog_common.js";

const envFile = getArg("--env", DEFAULT_ENV);
const outFile = getArg("--out-file", "reports/system-health.json");

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

const main = async () => {
  const { env, client } = parseEnvAndClient(envFile);
  const url = env.SUPABASE_URL;
  const key = env.SERVICE_ROLE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  const productsScanned = await headCount(url, headers, "/rest/v1/products?select=id&removed_at=is.null&marketplace=eq.mercadolivre");
  const seoPagesGenerated = await headCount(url, headers, "/rest/v1/seo_pages?select=id&is_active=eq.true");

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

  const report = {
    generated_at: new Date().toISOString(),
    ok: true,
    metrics: {
      products_scanned: productsScanned,
      seo_pages_generated: seoPagesGenerated,
      ads_created: adsCreated,
      pricing_updates: pricingUpdates,
      conversion_score_avg: average(conversionRows || [], "conversion_score"),
      profit_score_avg: average(profitRows || [], "profit_score"),
    },
  };

  writeJson(outFile, report);
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
