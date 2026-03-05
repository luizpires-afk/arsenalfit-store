import {
  DEFAULT_ENV,
  getArg,
  parseEnvAndClient,
  chunk,
  writeJson,
} from "./_affiliate_catalog_common.js";

const envFile = getArg("--env", DEFAULT_ENV);
const outFile = getArg("--out-file", "logs/ai-ads-optimizer.json");
const limit = Math.max(100, Number(getArg("--limit", "50000")) || 50000);

const PLATFORMS = ["google_ads", "meta_ads", "tiktok_ads"];

const normalize = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseMissingColumn = (error) => {
  const text = String(error?.message || error || "");
  const a = text.match(/column\s+([a-zA-Z0-9_\.]+)\s+does not exist/i);
  if (a?.[1]) return a[1].split(".").pop();
  const b = text.match(/Could not find the '([^']+)' column/i);
  if (b?.[1]) return b[1];
  return null;
};

const tokenize = (title = "") =>
  [...new Set(normalize(title).split(" ").filter((w) => w.length >= 4))].slice(0, 12);

const main = async () => {
  const { client } = parseEnvAndClient(envFile);
  const nowIso = new Date().toISOString();

  try {
    await client.request("/ad_campaigns?select=id&limit=1", { method: "GET" });
  } catch {
    const report = {
      generated_at: nowIso,
      ok: true,
      skipped: true,
      reason: "ads_tables_missing_apply_migrations_first",
      totals: {
        products_selected: 0,
        campaigns_created: 0,
      },
    };
    writeJson(outFile, report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const required = ["id"];
  const optional = [
    "title",
    "name",
    "trend_score",
    "profit_score",
    "conversion_score",
    "marketplace",
    "removed_at",
  ];

  const excluded = new Set();
  let products = [];
  for (let i = 0; i < 20; i += 1) {
    const selectCols = [...required, ...optional.filter((c) => !excluded.has(c))].join(",");
    try {
      products = await client.fetchPagedRows(
        `/products?select=${selectCols}&marketplace=eq.mercadolivre&removed_at=is.null&trend_score=gt.0.6&profit_score=gt.0.5&conversion_score=gt.0.5&order=rank_score.desc&limit=${limit}`,
        1000,
      );
      break;
    } catch (error) {
      const missing = parseMissingColumn(error);
      if (!missing || required.includes(missing) || excluded.has(missing)) throw error;
      excluded.add(missing);
    }
  }

  const campaignRows = [];
  for (const p of products || []) {
    const title = String(p?.title || p?.name || "Produto Fitness").trim();
    const keywords = tokenize(title);
    const trendScore = Number(p?.trend_score || 0) || 0;
    const profitScore = Number(p?.profit_score || 0) || 0;
    const conversionScore = Number(p?.conversion_score || 0) || 0;
    const campaignScore = Number(((trendScore * 0.4) + (profitScore * 0.3) + (conversionScore * 0.3)).toFixed(6));
    const dailyBudget = Number((Math.max(0, profitScore) * 50).toFixed(2));

    for (const platform of PLATFORMS) {
      campaignRows.push({
        product_id: p.id,
        platform,
        campaign_name: `${platform}_${normalize(title).replace(/\s+/g, "_").slice(0, 40)}_${p.id.slice(0, 8)}`,
        ad_copy: `Oferta em destaque: ${title}. Compare beneficios, preco e entrega rapida hoje mesmo.`,
        target_keywords: keywords,
        daily_budget: dailyBudget,
        campaign_score: campaignScore,
        created_at: nowIso,
      });
    }
  }

  let campaignsCreated = 0;
  for (const part of chunk(campaignRows, 500)) {
    const inserted = await client.request("/ad_campaigns", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(part),
    });
    if (Array.isArray(inserted)) campaignsCreated += inserted.length;
  }

  const report = {
    generated_at: nowIso,
    ok: true,
    totals: {
      products_selected: (products || []).length,
      campaigns_created: campaignsCreated,
    },
    missing_columns_ignored: [...excluded],
    sample_campaigns: campaignRows.slice(0, 20).map((row) => ({
      product_id: row.product_id,
      platform: row.platform,
      campaign_name: row.campaign_name,
      daily_budget: row.daily_budget,
      campaign_score: row.campaign_score,
    })),
  };

  writeJson(outFile, report);
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
