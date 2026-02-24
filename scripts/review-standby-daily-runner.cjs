const {
  readRunnerEnv,
  createSupabaseRestClient,
  isMercadoLivreSecLink,
} = require("./_supabase_runner_utils.cjs");

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
};

const envFile = getArg("--env", "supabase/functions/.env.scheduler");
const limit = Math.max(1, Math.min(50, Number(getArg("--limit", "15")) || 15));

const resolveManualReason = (row) => {
  if (!row?.ml_item_id) return "missing_ml_item";
  if (!row?.affiliate_link) return "missing_affiliate";
  if (!isMercadoLivreSecLink(row.affiliate_link)) return "affiliate_not_sec";
  return "ok";
};

const rankScore = (row) => {
  const clicks = Number(row?.clicks_count || 0);
  const featured = row?.is_featured ? 40 : 0;
  const freeShipping = row?.free_shipping ? 20 : 0;
  const healthy = String(row?.data_health_status || "").toUpperCase() === "HEALTHY" ? 10 : 0;
  const freshness = row?.updated_at ? 5 : 0;
  return clicks * 5 + featured + freeShipping + healthy + freshness;
};

const main = async () => {
  const env = readRunnerEnv(envFile);
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
  }

  const client = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });

  const rows = await client.request(
    "/products?select=id,name,status,is_active,data_health_status,auto_disabled_reason,deactivation_reason,ml_item_id,affiliate_link,source_url,canonical_offer_url,free_shipping,clicks_count,is_featured,last_price_source,last_price_verified_at,updated_at&marketplace=eq.mercadolivre&removed_at=is.null&status=eq.standby&order=updated_at.desc&limit=500",
    { method: "GET" },
  );

  const manualQueue = (Array.isArray(rows) ? rows : [])
    .filter((row) => !row.auto_disabled_reason && !row.deactivation_reason)
    .map((row) => {
      const manual_reason = resolveManualReason(row);
      return {
        ...row,
        manual_reason,
        score: rankScore(row),
      };
    })
    .filter((row) => row.manual_reason !== "ok")
    .sort((a, b) => (b.score - a.score) || (Number(b.clicks_count || 0) - Number(a.clicks_count || 0)));

  const daily = manualQueue.slice(0, limit).map((row, index) => ({
    position: index + 1,
    id: row.id,
    name: row.name,
    manual_reason: row.manual_reason,
    clicks_count: row.clicks_count,
    free_shipping: row.free_shipping,
    is_featured: row.is_featured,
    source_url: row.source_url,
    affiliate_link: row.affiliate_link,
    ml_item_id: row.ml_item_id,
    score: row.score,
  }));

  const summary = {
    standby_total: Array.isArray(rows) ? rows.length : 0,
    manual_queue_total: manualQueue.length,
    selected_today: daily.length,
    by_reason: {
      affiliate_not_sec: manualQueue.filter((x) => x.manual_reason === "affiliate_not_sec").length,
      missing_affiliate: manualQueue.filter((x) => x.manual_reason === "missing_affiliate").length,
      missing_ml_item: manualQueue.filter((x) => x.manual_reason === "missing_ml_item").length,
    },
  };

  console.log(JSON.stringify({ summary, daily_review: daily }, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
