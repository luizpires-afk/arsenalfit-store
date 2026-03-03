const fs = require("fs");
const path = require("path");
const {
  readRunnerEnv,
  createSupabaseRestClient,
  toCsv,
} = require("./_supabase_runner_utils.cjs");

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
};

const envFile = getArg("--env", "supabase/functions/.env.scheduler");
const outDir = getArg("--out-dir", "logs");
const ts = new Date().toISOString().replace(/[:.]/g, "-");

const writeArtifacts = ({ payload, rows, outDirPath }) => {
  const base = path.join(outDirPath, "home-rules-audit");
  const stamped = `${base}-${ts}`;
  const json = `${base}.json`;
  const csv = `${base}.csv`;
  const jsonTs = `${stamped}.json`;
  const csvTs = `${stamped}.csv`;
  fs.writeFileSync(json, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(csv, `${toCsv(rows)}\n`, "utf8");
  fs.writeFileSync(jsonTs, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(csvTs, `${toCsv(rows)}\n`, "utf8");
  return { json, csv, timestamped: { json: jsonTs, csv: csvTs } };
};

const getDayKey = (value, timeZone = "America/Sao_Paulo") => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

const main = async () => {
  const env = readRunnerEnv(envFile);
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente.");
  }
  fs.mkdirSync(outDir, { recursive: true });

  const {
    selectBestDeals,
    selectPriceDropsToday,
    selectEliteProducts,
    selectLatestDiversifiedProducts,
  } = await import("../src/lib/homeCollections.js");
  const { resolvePromotionMetrics } = await import("../src/lib/pricing.js");

  const client = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });

  const selectFields = [
    "id",
    "name",
    "price",
    "pix_price",
    "original_price",
    "previous_price",
    "previous_price_source",
    "previous_price_expires_at",
    "detected_at",
    "last_sync",
    "updated_at",
    "last_price_source",
    "last_price_verified_at",
    "is_active",
    "status",
    "auto_disabled_reason",
    "affiliate_verified",
    "is_featured",
    "is_on_sale",
    "discount_percentage",
    "marketplace",
    "category_id",
    "clicks_count",
    "curation_badges",
    "quality_score",
  ].join(",");

  const products = await client.fetchPagedRows(
    `/products?select=${encodeURIComponent(selectFields)}&marketplace=eq.mercadolivre&removed_at=is.null&is_active=eq.true&status=eq.active&order=updated_at.desc`,
  );

  const bestDeals = selectBestDeals({ products, minDiscountPercent: 20, limit: 16 });
  const bestIds = new Set(bestDeals.map((row) => row.id));
  const drops = selectPriceDropsToday({ products, bestDealIds: bestIds, minDiscountExclusive: 20, limit: 16 });
  const elite = selectEliteProducts({ products, limit: 16 });
  const latest = selectLatestDiversifiedProducts({ products, limit: 12 });

  const today = getDayKey(new Date(), "America/Sao_Paulo");

  const rows = [];
  const pushRows = (section, items, validator) => {
    for (const product of items) {
      const promo = resolvePromotionMetrics(product);
      const valid = validator(product, promo);
      rows.push({
        section,
        id: product.id,
        name: product.name,
        discount_percent: Number(promo.discountPercent || 0),
        has_drop: promo.anchor !== null && promo.anchor > promo.price,
        status: product.status,
        is_active: product.is_active,
        valid,
        reason: valid ? "ok" : "rule_violation",
      });
    }
  };

  pushRows("best_deals_ge_20", bestDeals, (_p, promo) => Number(promo.discountPercent || 0) >= 20);
  pushRows("drops_today_lt_20", drops, (product, promo) => {
    const ref = product.detected_at || product.last_sync || product.updated_at;
    return Number(promo.discountPercent || 0) > 0 && Number(promo.discountPercent || 0) < 20 && getDayKey(ref, "America/Sao_Paulo") === today;
  });
  pushRows("elite", elite, () => true);
  pushRows("latest_12", latest, () => true);

  const invalidRows = rows.filter((row) => !row.valid);
  const payload = {
    ok: true,
    generated_at: new Date().toISOString(),
    totals: {
      products_active_scanned: products.length,
      best_deals_count: bestDeals.length,
      drops_today_count: drops.length,
      elite_count: elite.length,
      latest_12_count: latest.length,
      violations: invalidRows.length,
    },
    examples: {
      best_deals: bestDeals.slice(0, 5).map((p) => ({ id: p.id, name: p.name })),
      drops_today: drops.slice(0, 5).map((p) => ({ id: p.id, name: p.name })),
    },
    rows,
  };

  const outputs = writeArtifacts({ payload, rows, outDirPath: outDir });
  console.log(JSON.stringify({ ok: true, totals: payload.totals, outputs }, null, 2));
};

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
