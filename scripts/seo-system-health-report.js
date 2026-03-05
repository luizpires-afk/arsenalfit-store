import {
  DEFAULT_ENV,
  getArg,
  parseEnvAndClient,
  writeJson,
} from "./_affiliate_catalog_common.js";

const envFile = getArg("--env", DEFAULT_ENV);
const outFile = getArg("--out-file", "logs/seo-system-health-report.json");

const countRows = async (client, path) => {
  const rows = await client.fetchPagedRows(path, 1000);
  return Array.isArray(rows) ? rows.length : 0;
};

const main = async () => {
  const { client } = parseEnvAndClient(envFile);

  let totalProducts = 0;
  let visibleProducts = 0;
  let seoPages = 0;
  let trendingProducts = 0;
  let hotDeals = 0;
  let topProfitProducts = 0;

  try {
    totalProducts = await countRows(client, "/products?select=id&marketplace=eq.mercadolivre&removed_at=is.null");
  } catch {
    totalProducts = 0;
  }

  try {
    visibleProducts = await countRows(
      client,
      "/products?select=id&marketplace=eq.mercadolivre&removed_at=is.null&visible=eq.true&is_active=eq.true&status=eq.active",
    );
  } catch {
    visibleProducts = 0;
  }

  try {
    seoPages = await countRows(client, "/seo_pages?select=id&is_active=eq.true");
  } catch {
    seoPages = 0;
  }

  try {
    trendingProducts = await countRows(
      client,
      "/products?select=id&marketplace=eq.mercadolivre&removed_at=is.null&trend_score=gt.0.6",
    );
  } catch {
    trendingProducts = 0;
  }

  try {
    hotDeals = await countRows(
      client,
      "/products?select=id&marketplace=eq.mercadolivre&removed_at=is.null&discount_score=gt.0.7",
    );
  } catch {
    hotDeals = 0;
  }

  try {
    topProfitProducts = await countRows(
      client,
      "/products?select=id&marketplace=eq.mercadolivre&removed_at=is.null&profit_score=gt.0.8",
    );
  } catch {
    topProfitProducts = 0;
  }

  const report = {
    generated_at: new Date().toISOString(),
    ok: true,
    metrics: {
      total_products: totalProducts,
      visible_products: visibleProducts,
      seo_pages: seoPages,
      trending_products: trendingProducts,
      hot_deals: hotDeals,
      top_profit_products: topProfitProducts,
    },
    scale_targets: {
      products_target: 50000,
      visible_target: 1000,
      seo_pages_target: 10000,
    },
  };

  writeJson(outFile, report);
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
