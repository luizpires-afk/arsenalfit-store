const {
  readRunnerEnv,
  isMercadoLivreSecLink,
  extractMlItemIdFromUrl,
  resolveCanonicalMlItemId,
  createSupabaseRestClient,
  classifyDelta,
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
const dryRun = hasArg("--dry-run") || !hasArg("--apply");
const maxRepairLoops = Math.max(1, toInt(getArg("--loops", "2"), 2));
const autoFixLimit = Math.max(10, toInt(getArg("--auto-fix-limit", "200"), 200));
const schedulerBatchSize = Math.max(10, toInt(getArg("--batch-size", "120"), 120));
const warnPct = Number(getArg("--warn-pct", "25")) || 25;
const warnAbs = Number(getArg("--warn-abs", "20")) || 20;
const criticalPct = Number(getArg("--critical-pct", "50")) || 50;
const criticalAbs = Number(getArg("--critical-abs", "30")) || 30;
const trustedStickyGuardPct = Math.max(
  0,
  Number(getArg("--trusted-sticky-guard-pct", "0.2")) || 0.2,
);
const trustedStickyGuardAbs = Math.max(
  0,
  Number(getArg("--trusted-sticky-guard-abs", "25")) || 25,
);
const blockedMlItemsArg = String(getArg("--blocked-ml-items", process.env.BLOCKED_ML_ITEMS || "") || "");
const blockedMlItems = new Set(
  blockedMlItemsArg
    .split(",")
    .map((value) => String(value || "").trim().toUpperCase())
    .filter((value) => /^MLB\d{6,14}$/.test(value)),
);

const { SUPABASE_URL, SERVICE_ROLE_KEY, CRON_SECRET } = readRunnerEnv(envFile);
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

const callRpcWithFallback = async (attempts) => {
  let lastError = null;
  for (const attempt of attempts) {
    try {
      const data = await client.rpc(attempt.name, attempt.payload);
      return { ok: true, name: attempt.name, payload: attempt.payload, data };
    } catch (error) {
      lastError = error;
    }
  }
  return { ok: false, error: lastError };
};

const TRUSTED_STICKY_SOURCES = new Set([
  "manual",
  "auth",
  "public",
  "api_base",
  "api_pix",
  "api",
  "api_auth",
]);

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getActiveProducts = async () => {
  const select =
    "id,name,status,is_active,marketplace,external_id,ml_item_id,canonical_offer_url,source_url,affiliate_link,price,data_health_status,deactivation_reason,auto_disabled_reason,updated_at";
  return client.fetchPagedRows(
    `/products?select=${encodeURIComponent(select)}&marketplace=eq.mercadolivre&removed_at=is.null&is_active=eq.true&status=eq.active`,
    500,
  );
};

const getOpenMismatchCases = async () => {
  const select = "id,product_id,delta_abs,delta_pct,status,source,reason,ml_price";
  return client.fetchPagedRows(
    `/price_mismatch_cases?select=${encodeURIComponent(select)}&status=eq.OPEN`,
    500,
  );
};

const protectTrustedStickyMismatchCases = async () => {
  const openCases = await client.fetchPagedRows(
    "/price_mismatch_cases?select=id,product_id,ml_price,site_price,delta_abs,delta_pct,source,status&status=eq.OPEN&order=updated_at.asc",
    500,
  );
  if (!openCases.length) {
    return {
      enabled: true,
      open_cases_seen: 0,
      trusted_candidates: 0,
      guarded: 0,
      failed: 0,
    };
  }

  const productIds = [...new Set(openCases.map((row) => row?.product_id).filter(Boolean))];
  if (!productIds.length) {
    return {
      enabled: true,
      threshold_pct: trustedStickyGuardPct,
      threshold_abs: trustedStickyGuardAbs,
      blocked_ml_items: blockedMlItems.size,
      open_cases_seen: openCases.length,
      trusted_candidates: 0,
      guarded: 0,
      failed: 0,
    };
  }

  const products = await client.fetchPagedRows(
    `/products?select=id,ml_item_id,price,last_price_source,is_active,status&id=in.(${productIds.join(",")})`,
    500,
  );
  const productsById = new Map(products.map((row) => [row.id, row]));

  let trustedCandidates = 0;
  let guarded = 0;
  let failed = 0;

  for (const mismatch of openCases) {
    const sourceKind = String(mismatch?.source || "").toLowerCase();
    if (sourceKind !== "item") continue;

    const product = productsById.get(mismatch.product_id);
    if (!product) continue;

    const mlItemId = String(product?.ml_item_id || "").trim().toUpperCase();
    const isBlockedMlItem = mlItemId && blockedMlItems.has(mlItemId);

    const lastPriceSource = String(product?.last_price_source || "").trim().toLowerCase();
    const isTrustedStickySource = TRUSTED_STICKY_SOURCES.has(lastPriceSource);

    const mlPrice = toFiniteNumber(mismatch?.ml_price);
    const sitePrice = toFiniteNumber(mismatch?.site_price ?? product?.price);
    if (!(mlPrice && mlPrice > 0 && sitePrice && sitePrice > 0)) continue;

    const dropAbs = Math.abs(sitePrice - mlPrice);
    const dropPct = sitePrice > 0 ? dropAbs / sitePrice : 0;
    const isLargeMismatch = dropAbs >= trustedStickyGuardAbs || dropPct >= trustedStickyGuardPct;

    if (!isBlockedMlItem && !(isTrustedStickySource && isLargeMismatch)) continue;
    trustedCandidates += 1;

    try {
      const nowIso = new Date().toISOString();
      const note = isBlockedMlItem
        ? "guard_blocked_ml_item_no_auto_apply"
        : "guard_trusted_sticky_source_no_auto_apply";
      await client.patch(`/price_mismatch_cases?id=eq.${encodeURIComponent(mismatch.id)}`, {
        status: "RESOLVED",
        resolved_at: nowIso,
        resolved_by: "service_role",
        resolution_note: note,
        updated_at: nowIso,
      });
      guarded += 1;
    } catch (error) {
      failed += 1;
      console.warn(
        "[repair-all-active-prices] trusted_sticky_guard_failed",
        JSON.stringify({
          case_id: mismatch.id,
          product_id: mismatch.product_id,
          ml_item_id: mlItemId || null,
          source: lastPriceSource || null,
          error: error?.message || String(error),
        }),
      );
    }
  }

  return {
    enabled: true,
    threshold_pct: trustedStickyGuardPct,
    threshold_abs: trustedStickyGuardAbs,
    blocked_ml_items: blockedMlItems.size,
    open_cases_seen: openCases.length,
    trusted_candidates: trustedCandidates,
    guarded,
    failed,
  };
};

const classifyActiveOffer = (product) => {
  const affiliateUrl = typeof product?.affiliate_link === "string" ? product.affiliate_link.trim() : "";
  const canonicalMl = resolveCanonicalMlItemId(product);
  const destinationMl =
    extractMlItemIdFromUrl(affiliateUrl) ||
    extractMlItemIdFromUrl(product?.canonical_offer_url) ||
    extractMlItemIdFromUrl(product?.source_url) ||
    canonicalMl;
  const hasAffiliate = isMercadoLivreSecLink(affiliateUrl);
  if (!hasAffiliate) {
    return {
      ok: false,
      reason: "BROKEN_OFFER_URL",
      detail: "missing_or_invalid_affiliate_sec_link",
      canonicalMl,
      destinationMl,
    };
  }
  if (!canonicalMl) {
    return {
      ok: false,
      reason: "BROKEN_OFFER_URL",
      detail: "missing_canonical_ml_item",
      canonicalMl,
      destinationMl,
    };
  }
  if (destinationMl && destinationMl !== canonicalMl) {
    return {
      ok: false,
      reason: "BROKEN_OFFER_URL",
      detail: `destination_mismatch:${canonicalMl}!=${destinationMl}`,
      canonicalMl,
      destinationMl,
    };
  }
  if (canonicalMl && blockedMlItems.has(canonicalMl)) {
    return {
      ok: false,
      reason: "BROKEN_OFFER_URL",
      detail: `blocked_ml_item:${canonicalMl}`,
      canonicalMl,
      destinationMl,
    };
  }
  return {
    ok: true,
    reason: "HEALTHY",
    detail: "ok",
    canonicalMl,
    destinationMl,
  };
};

const moveBrokenProductsToStandby = async (products) => {
  if (!products.length) return { moved: 0 };
  const nowIso = new Date().toISOString();
  let moved = 0;
  for (const product of products) {
    const updates = {
      status: "standby",
      is_active: false,
      data_health_status: "NEEDS_REVIEW",
      deactivation_reason: "broken_offer_url",
      auto_disabled_reason: "broken_offer_url",
      auto_disabled_at: nowIso,
      last_health_check_at: nowIso,
      updated_at: nowIso,
    };
    const patched = await client.patch(`/products?id=eq.${encodeURIComponent(product.id)}`, updates);
    if (Array.isArray(patched) && patched.length > 0) moved += 1;
  }
  return { moved };
};

const triggerPriceSyncQueue = async () => {
  if (!CRON_SECRET) return { ok: false, error: "missing_cron_secret" };
  const endpoint = `${client.apiBase.functions}/price-sync`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": CRON_SECRET,
    },
    body: JSON.stringify({
      source: "repair_all_active_prices",
      use_queue: true,
      batch_size: schedulerBatchSize,
      allow_continuation: true,
      force: true,
      skip_alerts: true,
      max_runtime_ms: 90000,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    return { ok: false, error: text || `${response.status} ${response.statusText}` };
  }
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }
  return { ok: true, payload };
};

const summarize = async () => {
  const [activeProducts, openCases] = await Promise.all([getActiveProducts(), getOpenMismatchCases()]);
  const broken = activeProducts.filter((product) => !classifyActiveOffer(product).ok).length;
  const activeWithoutCanonical = activeProducts.filter((product) => !resolveCanonicalMlItemId(product)).length;
  const mismatchCritical = openCases.filter((row) => {
    const deltaAbs = Number(row?.delta_abs ?? 0);
    const deltaPct = Number(row?.delta_pct ?? 0);
    const result = classifyDelta(deltaAbs, deltaPct, {
      warnPct,
      warnAbs,
      criticalPct,
      criticalAbs,
    });
    return result.critical;
  }).length;

  const suspectRows = await client.fetchPagedRows(
    `/products?select=id&marketplace=eq.mercadolivre&removed_at=is.null&data_health_status=eq.SUSPECT_PRICE`,
    500,
  );

  return {
    active_total: activeProducts.length,
    active_with_broken_link: broken,
    active_without_ml_item: activeWithoutCanonical,
    mismatch_open_total: openCases.length,
    mismatch_critical_total: mismatchCritical,
    suspect_total: suspectRows.length,
  };
};

const main = async () => {
  const startedAt = new Date();
  const initialSummary = await summarize();
  const allActive = await getActiveProducts();
  const brokenActiveProducts = allActive.filter((product) => !classifyActiveOffer(product).ok);

  const result = {
    dry_run: dryRun,
    started_at: startedAt.toISOString(),
    initial: initialSummary,
    actions: {
      broken_offer_candidates: brokenActiveProducts.length,
      broken_offer_moved_to_standby: 0,
      recheck_suspect_queued: 0,
      price_sync_queue_triggered: false,
      mismatch_audit_runs: 0,
      mismatch_guard_runs: 0,
      mismatch_guarded_pre_autofix: 0,
      mismatch_guard_failures: 0,
      mismatch_autofix_runs: 0,
      mismatch_autofix_resolved: 0,
      mismatch_autofix_reactivated: 0,
    },
    loops: [],
    final: null,
  };

  if (!dryRun && brokenActiveProducts.length > 0) {
    const moveResult = await moveBrokenProductsToStandby(brokenActiveProducts);
    result.actions.broken_offer_moved_to_standby = Number(moveResult.moved ?? 0);
  }

  for (let loop = 1; loop <= maxRepairLoops; loop += 1) {
    if (!dryRun) {
      const audit = await callRpcWithFallback([
        {
          name: "run_price_mismatch_audit_service",
          payload: {
            p_lookback_hours: 24,
            p_warn_pct: warnPct,
            p_warn_abs: warnAbs,
            p_critical_pct: criticalPct,
            p_critical_abs: criticalAbs,
            p_apply_critical_policy: true,
          },
        },
        {
          name: "run_price_mismatch_audit",
          payload: {
            p_lookback_hours: 24,
            p_warn_pct: warnPct,
            p_warn_abs: warnAbs,
            p_critical_pct: criticalPct,
            p_critical_abs: criticalAbs,
            p_apply_critical_policy: true,
          },
        },
      ]);
      if (!audit.ok) throw audit.error;
      result.actions.mismatch_audit_runs += 1;

      const guard = await protectTrustedStickyMismatchCases();
      result.actions.mismatch_guard_runs += 1;
      result.actions.mismatch_guarded_pre_autofix += Number(guard?.guarded ?? 0);
      result.actions.mismatch_guard_failures += Number(guard?.failed ?? 0);

      const autoFix = await callRpcWithFallback([
        {
          name: "auto_fix_open_price_mismatch_cases_service",
          payload: {
            p_limit: autoFixLimit,
            p_source_only_item: true,
          },
        },
        {
          name: "auto_fix_open_price_mismatch_cases",
          payload: {
            p_limit: autoFixLimit,
            p_source_only_item: true,
          },
        },
      ]);
      if (!autoFix.ok) throw autoFix.error;
      result.actions.mismatch_autofix_runs += 1;
      result.actions.mismatch_autofix_resolved += Number(autoFix.data?.resolved ?? 0);
      result.actions.mismatch_autofix_reactivated += Number(autoFix.data?.reactivated ?? 0);

      const recheck = await callRpcWithFallback([
        {
          name: "recheck_suspect_prices_now_service",
          payload: {
            p_limit: autoFixLimit,
          },
        },
        {
          name: "recheck_suspect_prices_now",
          payload: {
            p_limit: autoFixLimit,
          },
        },
      ]);
      if (!recheck.ok) throw recheck.error;
      result.actions.recheck_suspect_queued += Number(recheck.data?.queued ?? 0);

      const trigger = await triggerPriceSyncQueue();
      if (trigger.ok) result.actions.price_sync_queue_triggered = true;
      result.loops.push({
        pass: loop,
        audit: audit.data,
        guard,
        auto_fix: autoFix.data,
        recheck: recheck.data,
        trigger,
      });
    } else {
      result.loops.push({ pass: loop, skipped: "dry_run" });
    }
  }

  result.final = await summarize();
  result.finished_at = new Date().toISOString();
  result.duration_ms = Date.now() - startedAt.getTime();

  console.log(JSON.stringify(result, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
