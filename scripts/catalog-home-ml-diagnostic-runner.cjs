const {
  readRunnerEnv,
  createSupabaseRestClient,
  resolveCanonicalMlItemId,
  resolveSiteFinalPrice,
  classifyDelta,
  toCsv,
} = require("./_supabase_runner_utils.cjs");

const args = process.argv.slice(2);

const getArg = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
};

const envPath = getArg("--env", "supabase/functions/.env.scheduler");
const limit = Math.max(1, Math.min(2000, Number(getArg("--limit", "500")) || 500));
const liveLimit = Math.max(1, Math.min(400, Number(getArg("--live-limit", "120")) || 120));
const concurrency = Math.max(1, Math.min(20, Number(getArg("--concurrency", "6")) || 6));
const warnPct = Number(getArg("--warn-pct", "12")) || 12;
const warnAbs = Number(getArg("--warn-abs", "15")) || 15;
const outPrefix = getArg("--out-prefix", "logs/catalog-home-ml-diagnostic");

const writeFileSafe = async (path, content) => {
  await import("node:fs/promises").then((fs) => fs.writeFile(path, content, "utf8"));
};

const nowIso = () => new Date().toISOString();

const parseNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isSiteVisible = (row) => {
  const status = String(row?.status || "").toLowerCase();
  const health = String(row?.data_health_status || "").toUpperCase();
  const autoReason = String(row?.auto_disabled_reason || "").toLowerCase();
  return (
    row?.is_active === true &&
    status === "active" &&
    health === "HEALTHY" &&
    row?.is_blocked !== true &&
    autoReason !== "blocked"
  );
};

const isDbActiveLike = (row) => {
  const status = String(row?.status || "").toLowerCase();
  return row?.is_active === true || status === "active";
};

const promoConsistency = (row) => {
  const price = resolveSiteFinalPrice(row);
  const original = parseNumber(row?.original_price);
  if (!(price && price > 0) || !(original && original > price)) {
    return {
      calculated_discount_pct: 0,
      declared_discount_pct: parseNumber(row?.discount_percentage) || 0,
      is_on_sale_expected: false,
      is_on_sale_actual: row?.is_on_sale === true,
      mismatch: row?.is_on_sale === true || (parseNumber(row?.discount_percentage) || 0) > 0,
    };
  }

  const calculated = Math.round(((original - price) / original) * 100);
  const declared = parseNumber(row?.discount_percentage);
  const expectedOnSale = calculated > 0;
  const actualOnSale = row?.is_on_sale === true;
  const discountMismatch = declared === null ? true : Math.abs(declared - calculated) >= 1;

  return {
    calculated_discount_pct: calculated,
    declared_discount_pct: declared,
    is_on_sale_expected: expectedOnSale,
    is_on_sale_actual: actualOnSale,
    mismatch: discountMismatch || expectedOnSale !== actualOnSale,
  };
};

const fetchMlItem = async (mlItemId) => {
  const response = await fetch(`https://api.mercadolibre.com/items/${encodeURIComponent(mlItemId)}`);
  const body = await response.json().catch(() => ({}));
  return {
    status: response.status,
    body,
    price: parseNumber(body?.price),
    item_status: String(body?.status || "").toLowerCase(),
    available_quantity: parseNumber(body?.available_quantity),
  };
};

const runPool = async (items, worker, poolSize) => {
  const queue = [...items];
  const out = [];
  const workers = Array.from({ length: Math.min(poolSize, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) continue;
      out.push(await worker(item));
    }
  });
  await Promise.all(workers);
  return out;
};

const main = async () => {
  const env = readRunnerEnv(envPath);
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente.");
  }

  const client = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });

  const rows = await client.request(
    `/products?select=id,name,slug,marketplace,external_id,ml_item_id,source_url,affiliate_link,status,is_active,is_blocked,data_health_status,auto_disabled_reason,price,pix_price,original_price,discount_percentage,is_on_sale,last_price_source,last_price_verified_at,updated_at,last_sync,detected_at&marketplace=ilike.mercado*&removed_at=is.null&order=updated_at.desc&limit=${limit}`,
    { method: "GET" },
  );

  const products = (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    ml_item_id_resolved: resolveCanonicalMlItemId(row),
    site_visible: isSiteVisible(row),
    db_active_like: isDbActiveLike(row),
  }));

  const promoAudit = products.map((row) => ({
    id: row.id,
    name: row.name,
    ml_item_id_resolved: row.ml_item_id_resolved,
    price: parseNumber(row.price),
    pix_price: parseNumber(row.pix_price),
    original_price: parseNumber(row.original_price),
    discount_percentage: parseNumber(row.discount_percentage),
    is_on_sale: row.is_on_sale === true,
    ...promoConsistency(row),
  }));

  const liveCandidates = products
    .filter((row) => row.ml_item_id_resolved)
    .slice(0, liveLimit);

  const liveAudit = await runPool(
    liveCandidates,
    async (row) => {
      const ml = await fetchMlItem(row.ml_item_id_resolved);
      const sitePrice = resolveSiteFinalPrice(row);
      const deltaAbs =
        sitePrice !== null && ml.price !== null ? Math.abs(sitePrice - ml.price) : null;
      const deltaPct =
        sitePrice !== null && ml.price !== null && Math.max(sitePrice, ml.price) > 0
          ? (Math.abs(sitePrice - ml.price) / Math.max(sitePrice, ml.price)) * 100
          : null;
      const mismatch = classifyDelta(deltaAbs, deltaPct, {
        warnPct,
        warnAbs,
        criticalPct: warnPct * 2,
        criticalAbs: warnAbs * 2,
      });
      const mlActiveLike =
        ml.status === 200 &&
        ml.item_status !== "paused" &&
        ml.item_status !== "closed" &&
        (ml.available_quantity === null || ml.available_quantity > 0);

      return {
        id: row.id,
        name: row.name,
        ml_item_id_resolved: row.ml_item_id_resolved,
        status: row.status,
        is_active: row.is_active,
        site_visible: row.site_visible,
        db_active_like: row.db_active_like,
        auto_disabled_reason: row.auto_disabled_reason,
        data_health_status: row.data_health_status,
        last_price_source: row.last_price_source,
        last_price_verified_at: row.last_price_verified_at,
        site_price: sitePrice,
        ml_http_status: ml.status,
        ml_status: ml.item_status,
        ml_available_quantity: ml.available_quantity,
        ml_price: ml.price,
        delta_abs: deltaAbs,
        delta_pct: deltaPct,
        price_mismatch: mismatch.mismatch,
        price_mismatch_critical: mismatch.critical,
        standby_or_inactive_on_site_but_active_db_ml:
          row.site_visible === false && row.db_active_like === true && mlActiveLike,
        captured_at: nowIso(),
      };
    },
    concurrency,
  );

  const standbyButActive = liveAudit.filter(
    (row) => row.standby_or_inactive_on_site_but_active_db_ml,
  );
  const priceMismatches = liveAudit.filter((row) => row.price_mismatch);
  const promoMismatches = promoAudit.filter((row) => row.mismatch);

  const report = {
    ok: true,
    generated_at: nowIso(),
    config: {
      limit,
      live_limit: liveLimit,
      concurrency,
      warn_pct: warnPct,
      warn_abs: warnAbs,
      env: envPath,
    },
    totals: {
      products_scanned: products.length,
      products_live_checked: liveAudit.length,
      standby_or_inactive_on_site_but_active_db_ml: standbyButActive.length,
      price_mismatch_count: priceMismatches.length,
      promo_mismatch_count: promoMismatches.length,
    },
    evidence: {
      standby_or_inactive_on_site_but_active_db_ml: standbyButActive.slice(0, 50),
      price_mismatch: priceMismatches.slice(0, 50),
      promo_mismatch: promoMismatches.slice(0, 50),
    },
  };

  const jsonPath = `${outPrefix}.json`;
  const csvPath = `${outPrefix}.csv`;
  await writeFileSafe(jsonPath, JSON.stringify(report, null, 2));
  await writeFileSafe(csvPath, toCsv(liveAudit));

  console.log(JSON.stringify({
    ...report,
    outputs: {
      json: jsonPath,
      csv: csvPath,
    },
  }, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
