const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
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
const hasArg = (name) => args.includes(name);
const toInt = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
};

const envFile = getArg("--env", "supabase/functions/.env.scheduler");
const batchSize = Math.max(10, toInt(getArg("--batch-size", "200"), 200));
const maxContinuations = Math.max(1, toInt(getArg("--max-continuations", "8"), 8));
const autoFixLimit = Math.max(10, toInt(getArg("--auto-fix-limit", "500"), 500));
const suspectCycleLimit = Math.max(1, toInt(getArg("--suspect-cycle-limit", "3"), 3));
const strictMaxStaleHours = Math.max(1, toInt(getArg("--strict-max-stale-hours", "8"), 8));
const untrustedDropPctThreshold = Math.max(
  0,
  Number(getArg("--untrusted-drop-pct", "0.25")) || 0.25,
);
const untrustedDropAbsThreshold = Math.max(
  0,
  Number(getArg("--untrusted-drop-abs", "40")) || 40,
);
const criticalMismatchPctThreshold = Math.max(
  0,
  Number(getArg("--critical-mismatch-pct", "50")) || 50,
);
const criticalMismatchAbsThreshold = Math.max(
  0,
  Number(getArg("--critical-mismatch-abs", "30")) || 30,
);
const criticalRecheckCycles = Math.max(
  1,
  toInt(getArg("--critical-recheck-cycles", "3"), 3),
);
const criticalRecheckWaitMs = Math.max(
  0,
  toInt(getArg("--critical-recheck-wait-ms", "4000"), 4000),
);
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
const divergenceApplyLimit = Math.max(
  1,
  toInt(getArg("--divergence-apply-limit", "120"), 120),
);
const disableSuspectStandby = hasArg("--disable-suspect-standby");
const source = getArg("--source", "manual_price_maintenance");
const skipSync = hasArg("--skip-sync");
const STRICT_STALE_TRUSTED_SOURCES = new Set([
  "manual",
  "auth",
  "public",
  "api_base",
  "api_pix",
  "catalog_ingest",
]);

const env = readRunnerEnv(envFile);
if (!env.SUPABASE_URL) {
  console.error("SUPABASE_URL nao definido. Informe no ambiente ou no arquivo:", envFile);
  process.exit(1);
}
if (!env.SERVICE_ROLE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY nao definido. Informe no ambiente ou no arquivo:", envFile);
  process.exit(1);
}

const client = createSupabaseRestClient({
  supabaseUrl: env.SUPABASE_URL,
  serviceRoleKey: env.SERVICE_ROLE_KEY,
});

const runAuditScript = (outputName) => {
  const outJsonPath = `.tmp-${outputName}.json`;
  const outCsvPath = `.tmp-${outputName}.csv`;
  const result = spawnSync(
    process.execPath,
    [
      "scripts/audit-all-active-offers-runner.cjs",
      "--env",
      envFile,
      "--with-audit",
      "--out-json",
      outJsonPath,
      "--out-csv",
      outCsvPath,
    ],
    {
      cwd: process.cwd(),
      stdio: "inherit",
    },
  );
  if (result.status !== 0) {
    throw new Error(`audit_failed:${outputName}`);
  }
  const report = JSON.parse(fs.readFileSync(path.resolve(outJsonPath), "utf8"));
  return {
    report,
    outJsonPath: path.resolve(outJsonPath),
    outCsvPath: path.resolve(outCsvPath),
  };
};

const runPriceSyncRefresh = async () => {
  if (skipSync) return { skipped: true };
  if (!env.CRON_SECRET) {
    return { skipped: true, reason: "missing_cron_secret" };
  }

  const base = String(env.SUPABASE_URL).replace(/\/$/, "");
  const endpoint = base.endsWith("/functions/v1")
    ? `${base}/price-sync`
    : `${base}/functions/v1/price-sync`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cron-secret": env.CRON_SECRET,
    },
    body: JSON.stringify({
      source,
      force: true,
      batch_size: batchSize,
      allow_continuation: true,
      max_continuations: maxContinuations,
      skip_alerts: true,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`price_sync_failed:${response.status}:${text}`);
  }
  return text ? JSON.parse(text) : { ok: true };
};

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const TRUSTED_STICKY_SOURCES = new Set([
  "manual",
  "auth",
  "public",
  "api_base",
  "api_pix",
  "api",
  "api_auth",
]);

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
        "[price-maintenance] trusted_sticky_guard_failed",
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

const runMismatchAudit = async () => {
  const auditResult = await callRpcWithFallback([
    {
      name: "run_price_mismatch_audit_service",
      payload: {
        p_lookback_hours: 24,
        p_warn_pct: 25,
        p_warn_abs: 20,
        p_critical_pct: 50,
        p_critical_abs: 30,
        p_apply_critical_policy: false,
      },
    },
    {
      name: "run_price_mismatch_audit",
      payload: {
        p_lookback_hours: 24,
        p_warn_pct: 25,
        p_warn_abs: 20,
        p_critical_pct: 50,
        p_critical_abs: 30,
        p_apply_critical_policy: false,
      },
    },
  ]);
  if (!auditResult.ok) throw auditResult.error;
  return auditResult.data;
};

const runMismatchAutoFix = async () => {
  const guard = await protectTrustedStickyMismatchCases();
  console.log("[price-maintenance] trusted_sticky_guard", JSON.stringify(guard));

  const fixResult = await callRpcWithFallback([
    {
      name: "auto_fix_open_price_mismatch_cases_service",
      payload: { p_limit: autoFixLimit, p_source_only_item: true },
    },
    {
      name: "auto_fix_open_price_mismatch_cases_service",
      payload: { p_limit: autoFixLimit, p_apply_freeze: false },
    },
    {
      name: "auto_fix_open_price_mismatch_cases_service",
      payload: { p_limit: autoFixLimit, p_apply_freeze: true },
    },
    {
      name: "auto_fix_open_price_mismatch_cases",
      payload: { p_limit: autoFixLimit, p_source_only_item: true },
    },
  ]);
  if (!fixResult.ok) throw fixResult.error;
  return fixResult.data;
};

const applyTrustedDivergenceCorrections = async ({ limit }) => {
  const openCases = await client.fetchPagedRows(
    "/price_mismatch_cases?select=id,product_id,site_price,ml_price,delta_abs,delta_pct,status,source,reason,metadata,updated_at&status=eq.OPEN&order=delta_pct.desc",
    500,
  );

  const productIds = [...new Set(openCases.map((row) => row?.product_id).filter(Boolean))];
  const productsById = new Map();
  if (productIds.length) {
    const products = await client.fetchPagedRows(
      `/products?select=id,ml_item_id,price,last_price_source&id=in.(${productIds.join(",")})`,
      500,
    );
    for (const row of products) productsById.set(row.id, row);
  }

  const trustedCases = [];
  for (const row of openCases) {
    if (trustedCases.length >= limit) break;
    const sourceKind = String(row?.source || "").toLowerCase();
    if (sourceKind !== "item") continue;

    const product = productsById.get(row?.product_id);
    const mlItemId = String(product?.ml_item_id || "").trim().toUpperCase();
    if (mlItemId && blockedMlItems.has(mlItemId)) continue;

    const productSource = String(product?.last_price_source || "").trim().toLowerCase();

    const mlPrice = toFiniteNumber(row?.ml_price);
    const sitePrice = toFiniteNumber(row?.site_price ?? product?.price);
    if (!(mlPrice && mlPrice > 0 && sitePrice && sitePrice > 0)) continue;

    if (TRUSTED_STICKY_SOURCES.has(productSource)) {
      const dropAbs = Math.abs(sitePrice - mlPrice);
      const dropPct = sitePrice > 0 ? dropAbs / sitePrice : 0;
      if (dropAbs >= trustedStickyGuardAbs || dropPct >= trustedStickyGuardPct) continue;
    }

    const reason = String(row?.reason || "").toLowerCase();
    if (reason.includes("catalog_fallback")) continue;

    trustedCases.push({
      id: row.id,
      product_id: row.product_id,
      ml_price: mlPrice,
      site_price: sitePrice,
      delta_pct: toFiniteNumber(row?.delta_pct) || 0,
      source: sourceKind,
    });
  }

  let applied = 0;
  let failed = 0;
  const errors = [];

  for (const mismatch of trustedCases) {
    try {
      await client.rpc("admin_resolve_price_mismatch_case", {
        p_case_id: mismatch.id,
        p_action: "APPLY_ML_PRICE",
        p_note: "auto_apply_from_trusted_divergence",
      });
      applied += 1;
    } catch (error) {
      failed += 1;
      if (errors.length < 5) {
        errors.push({
          case_id: mismatch.id,
          product_id: mismatch.product_id,
          message: error?.message || String(error),
        });
      }
    }
  }

  return {
    enabled: true,
    open_cases_seen: openCases.length,
    trusted_candidates: trustedCases.length,
    applied,
    failed,
    sample_errors: errors,
  };
};

const runSuspectRecheck = async () => {
  const result = await callRpcWithFallback([
    { name: "recheck_suspect_prices_now_service", payload: { p_limit: autoFixLimit } },
    { name: "recheck_suspect_prices_now", payload: { p_limit: autoFixLimit } },
  ]);
  if (!result.ok) {
    console.warn("[price-maintenance] suspect_recheck_failed", result.error?.message || result.error);
    return null;
  }
  return result.data;
};

const getOpenActiveCriticalMismatchCount = async ({ pctThreshold, absThreshold }) => {
  const openCases = await client.fetchPagedRows(
    "/price_mismatch_cases?select=id,product_id,delta_abs,delta_pct,status&status=eq.OPEN",
    500,
  );
  if (!openCases.length) return 0;
  const productIds = [...new Set(openCases.map((row) => row?.product_id).filter(Boolean))];
  const products = await client.fetchPagedRows(
    `/products?select=id,status,is_active&id=in.(${productIds.join(",")})`,
    500,
  );
  const activeIds = new Set(
    products
      .filter((row) => String(row?.status || "").toLowerCase() === "active" && Boolean(row?.is_active))
      .map((row) => row.id),
  );

  return openCases.filter((row) => {
    if (!activeIds.has(row.product_id)) return false;
    const deltaAbs = toFiniteNumber(row?.delta_abs) || 0;
    const deltaPct = toFiniteNumber(row?.delta_pct) || 0;
    return deltaAbs >= absThreshold || deltaPct >= pctThreshold;
  }).length;
};

const runCriticalRecheckLoop = async ({ cycles, waitMs, pctThreshold, absThreshold }) => {
  const loop = [];
  for (let index = 1; index <= cycles; index += 1) {
    const audit = await runMismatchAudit();
    const fix = await runMismatchAutoFix();
    await runSuspectRecheck();
    await closeOpenMismatchForNonActiveProducts();

    const remainingCritical = await getOpenActiveCriticalMismatchCount({ pctThreshold, absThreshold });
    const item = {
      cycle: index,
      remaining_active_critical: remainingCritical,
      audit_opened: Number(audit?.opened ?? 0),
      fix_resolved: Number(fix?.resolved ?? 0),
      fix_processed: Number(fix?.processed ?? 0),
    };
    loop.push(item);
    console.log("[price-maintenance] critical_recheck_cycle", JSON.stringify(item));

    if (remainingCritical <= 0) break;
    if (waitMs > 0 && index < cycles) await sleep(waitMs);
  }

  return {
    enabled: true,
    configured_cycles: cycles,
    wait_ms: waitMs,
    executed_cycles: loop.length,
    final_remaining_active_critical: loop.length ? loop[loop.length - 1].remaining_active_critical : 0,
    loop,
  };
};

const toNumberOr = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const applySuspectStandbyPolicy = async ({ cycleLimit }) => {
  const nowIso = new Date().toISOString();

  let suspectRows = [];
  try {
    suspectRows = await client.fetchPagedRows(
      "/products?select=id,ml_item_id,name,status,is_active,data_health_status,price_pending_count,price_pending_seen_at&marketplace=eq.mercadolivre&removed_at=is.null&is_active=eq.true&status=eq.active&data_health_status=eq.SUSPECT_PRICE",
      500,
    );
  } catch (error) {
    const fallbackRows = await client.fetchPagedRows(
      "/products?select=id,ml_item_id,name,status,is_active,data_health_status&marketplace=eq.mercadolivre&removed_at=is.null&is_active=eq.true&status=eq.active&data_health_status=eq.SUSPECT_PRICE",
      500,
    );
    suspectRows = fallbackRows.map((row) => ({
      ...row,
      price_pending_count: 0,
      price_pending_seen_at: null,
    }));
    console.warn(
      "[price-maintenance] suspect_policy_fallback",
      error?.message || String(error),
    );
  }

  let updatedCycles = 0;
  let movedToStandby = 0;

  for (const row of suspectRows) {
    const nextCount = toNumberOr(row?.price_pending_count, 0) + 1;
    const shouldStandby = nextCount >= cycleLimit;

    const payload = shouldStandby
      ? {
          price_pending_count: nextCount,
          price_pending_seen_at: row?.price_pending_seen_at || nowIso,
          status: "standby",
          is_active: false,
          data_health_status: "NEEDS_REVIEW",
          deactivation_reason: "suspect_price_consecutive",
          auto_disabled_reason: "suspect_price_consecutive",
          auto_disabled_at: nowIso,
          last_health_check_at: nowIso,
          updated_at: nowIso,
        }
      : {
          price_pending_count: nextCount,
          price_pending_seen_at: row?.price_pending_seen_at || nowIso,
          last_health_check_at: nowIso,
          updated_at: nowIso,
        };

    const patched = await client.patch(`/products?id=eq.${encodeURIComponent(row.id)}`, payload);
    if (Array.isArray(patched) && patched.length > 0) {
      updatedCycles += 1;
      if (shouldStandby) movedToStandby += 1;
    }
  }

  let resetCount = 0;
  try {
    const resetRows = await client.patch(
      "/products?marketplace=eq.mercadolivre&removed_at=is.null&price_pending_count=gt.0&data_health_status=neq.SUSPECT_PRICE",
      {
        price_pending_count: 0,
        price_pending_seen_at: null,
        updated_at: nowIso,
      },
    );
    resetCount = Array.isArray(resetRows) ? resetRows.length : 0;
  } catch (error) {
    console.warn(
      "[price-maintenance] suspect_policy_reset_skipped",
      error?.message || String(error),
    );
  }

  return {
    enabled: true,
    cycle_limit: cycleLimit,
    active_suspects_seen: suspectRows.length,
    cycle_updates: updatedCycles,
    moved_to_standby: movedToStandby,
    cycle_resets: resetCount,
  };
};

const toFiniteNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toDateMs = (value) => {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};

const applyStrictActiveEligibilityGuard = async ({ maxStaleHours }) => {
  const now = new Date();
  const nowIso = now.toISOString();
  const maxStaleMs = Math.max(1, maxStaleHours) * 60 * 60 * 1000;
  const activeRows = await client.fetchPagedRows(
    "/products?select=id,name,status,is_active,free_shipping,ml_item_id,last_price_verified_at,last_price_source,data_health_status,affiliate_verified,affiliate_link&marketplace=eq.mercadolivre&removed_at=is.null&is_active=eq.true&status=eq.active",
    500,
  );

  let moved = 0;
  let missingTrace = 0;
  let staleTrace = 0;
  let noFreeShipping = 0;
  let staleTraceTrustedBypassed = 0;

  for (const row of activeRows) {
    const hasMlItem = Boolean(String(row?.ml_item_id || "").trim());
    const verifiedAtMs = toDateMs(row?.last_price_verified_at);
    const isStale = verifiedAtMs === null || now.getTime() - verifiedAtMs > maxStaleMs;
    const hasFreeShipping = row?.free_shipping === true;
    const priceSource = String(row?.last_price_source || "").toLowerCase();
    const affiliateVerified = row?.affiliate_verified === true;
    const hasSecAffiliate = isMercadoLivreSecLink(String(row?.affiliate_link || ""));
    const isHealthy = String(row?.data_health_status || "").toUpperCase() === "HEALTHY";
    const trustedStaleBypass =
      hasMlItem &&
      isStale &&
      hasFreeShipping &&
      isHealthy &&
      affiliateVerified &&
      hasSecAffiliate &&
      STRICT_STALE_TRUSTED_SOURCES.has(priceSource);

    if (!hasMlItem) missingTrace += 1;
    if (isStale) staleTrace += 1;
    if (!hasFreeShipping) noFreeShipping += 1;

    if (trustedStaleBypass) {
      staleTraceTrustedBypassed += 1;
      continue;
    }

    if (hasMlItem && !isStale && hasFreeShipping) continue;

    const reason = !hasMlItem
      ? "strict_no_trace_ml_item"
      : isStale
        ? "strict_stale_price_trace"
        : "strict_no_free_shipping";

    const patched = await client.patch(`/products?id=eq.${encodeURIComponent(row.id)}`, {
      status: "standby",
      is_active: false,
      data_health_status: "NEEDS_REVIEW",
      deactivation_reason: reason,
      auto_disabled_reason: reason,
      auto_disabled_at: nowIso,
      last_health_check_at: nowIso,
      updated_at: nowIso,
    });
    if (Array.isArray(patched) && patched.length > 0) moved += 1;
  }

  return {
    enabled: true,
    max_stale_hours: maxStaleHours,
    active_seen: activeRows.length,
    missing_trace_ml_item: missingTrace,
    stale_trace: staleTrace,
    stale_trace_trusted_bypassed: staleTraceTrustedBypassed,
    no_free_shipping: noFreeShipping,
    moved_to_standby: moved,
  };
};

const applyUntrustedDropGuard = async ({ pctThreshold, absThreshold }) => {
  const nowIso = new Date().toISOString();
  const activeRows = await client.fetchPagedRows(
    "/products?select=id,name,status,is_active,price,previous_price,previous_price_source,last_price_source,data_health_status&marketplace=eq.mercadolivre&removed_at=is.null&is_active=eq.true&status=eq.active",
    500,
  );

  const candidates = [];
  for (const row of activeRows) {
    const source = String(row?.last_price_source || "").toLowerCase();
    if (source !== "catalog" && source !== "scraper") continue;

    const prevSource = String(row?.previous_price_source || "").toUpperCase();
    if (prevSource !== "HISTORY") continue;

    const price = toFiniteNumber(row?.price);
    const previous = toFiniteNumber(row?.previous_price);
    if (!(price && previous && previous > price)) continue;

    const dropAbs = previous - price;
    const dropPct = previous > 0 ? dropAbs / previous : 0;
    if (dropAbs < absThreshold && dropPct < pctThreshold) continue;

    candidates.push({ id: row.id, name: row.name, source, price, previous, dropAbs, dropPct });
  }

  let moved = 0;
  for (const item of candidates) {
    const patched = await client.patch(`/products?id=eq.${encodeURIComponent(item.id)}`, {
      status: "standby",
      is_active: false,
      data_health_status: "NEEDS_REVIEW",
      deactivation_reason: "untrusted_drop_unconfirmed",
      auto_disabled_reason: "untrusted_drop_unconfirmed",
      auto_disabled_at: nowIso,
      last_health_check_at: nowIso,
      updated_at: nowIso,
    });
    if (Array.isArray(patched) && patched.length > 0) moved += 1;
  }

  return {
    enabled: true,
    threshold_pct: pctThreshold,
    threshold_abs: absThreshold,
    active_rows_seen: activeRows.length,
    candidates: candidates.length,
    moved_to_standby: moved,
  };
};

const applyCriticalMismatchGuard = async ({ pctThreshold, absThreshold }) => {
  const nowIso = new Date().toISOString();
  const openCases = await client.fetchPagedRows(
    "/price_mismatch_cases?select=id,product_id,delta_abs,delta_pct,status,reason,source&status=eq.OPEN",
    500,
  );

  const criticalCases = openCases.filter((row) => {
    const deltaAbs = toFiniteNumber(row?.delta_abs) || 0;
    const deltaPct = toFiniteNumber(row?.delta_pct) || 0;
    return deltaAbs >= absThreshold || deltaPct >= pctThreshold;
  });

  const affectedIds = [...new Set(criticalCases.map((row) => row?.product_id).filter(Boolean))];
  if (!affectedIds.length) {
    return {
      enabled: true,
      threshold_pct: pctThreshold,
      threshold_abs: absThreshold,
      open_cases_seen: openCases.length,
      critical_cases: 0,
      active_untrusted_products: 0,
      moved_to_standby: 0,
    };
  }

  const activeRows = await client.fetchPagedRows(
    "/products?select=id,status,is_active,last_price_source,data_health_status,price,ml_item_id,name&marketplace=eq.mercadolivre&removed_at=is.null&is_active=eq.true&status=eq.active",
    500,
  );
  const activeMap = new Map(activeRows.map((row) => [row.id, row]));

  const candidates = [];
  for (const productId of affectedIds) {
    const row = activeMap.get(productId);
    if (!row) continue;
    const source = String(row?.last_price_source || "").toLowerCase();
    if (source !== "catalog" && source !== "scraper") continue;
    candidates.push(row);
  }

  let moved = 0;
  for (const row of candidates) {
    const patched = await client.patch(`/products?id=eq.${encodeURIComponent(row.id)}`, {
      status: "standby",
      is_active: false,
      data_health_status: "NEEDS_REVIEW",
      deactivation_reason: "critical_price_mismatch_untrusted",
      auto_disabled_reason: "critical_price_mismatch_untrusted",
      auto_disabled_at: nowIso,
      last_health_check_at: nowIso,
      updated_at: nowIso,
    });
    if (Array.isArray(patched) && patched.length > 0) moved += 1;
  }

  return {
    enabled: true,
    threshold_pct: pctThreshold,
    threshold_abs: absThreshold,
    open_cases_seen: openCases.length,
    critical_cases: criticalCases.length,
    active_untrusted_products: candidates.length,
    moved_to_standby: moved,
  };
};

const closeOpenMismatchForNonActiveProducts = async () => {
  const openCases = await client.fetchPagedRows(
    "/price_mismatch_cases?select=id,product_id,status,updated_at&status=eq.OPEN",
    500,
  );
  if (!openCases.length) {
    return { enabled: true, open_cases_seen: 0, closed_non_active: 0 };
  }

  const productIds = [...new Set(openCases.map((row) => row?.product_id).filter(Boolean))];
  const products = await client.fetchPagedRows(
    `/products?select=id,status,is_active&id=in.(${productIds.join(",")})`,
    500,
  );
  const byId = new Map(products.map((row) => [row.id, row]));

  let closed = 0;
  for (const mismatch of openCases) {
    const product = byId.get(mismatch.product_id);
    const isActive = String(product?.status || "").toLowerCase() === "active" && Boolean(product?.is_active);
    if (isActive) continue;
    const patched = await client.patch(`/price_mismatch_cases?id=eq.${encodeURIComponent(mismatch.id)}`, {
      status: "RESOLVED",
      reason: "auto_closed_non_active_product",
    });
    if (Array.isArray(patched) && patched.length > 0) closed += 1;
  }

  return {
    enabled: true,
    open_cases_seen: openCases.length,
    closed_non_active: closed,
  };
};

const main = async () => {
  const startedAt = new Date().toISOString();
  console.log(`\\n[price-maintenance] started_at=${startedAt}`);

  const before = runAuditScript("price-maintenance-before");

  const syncResult = await runPriceSyncRefresh();
  console.log("[price-maintenance] sync", JSON.stringify(syncResult));

  const auditData = await runMismatchAudit();
  console.log("[price-maintenance] mismatch_audit", JSON.stringify(auditData));

  const fixData = await runMismatchAutoFix();
  console.log("[price-maintenance] mismatch_autofix", JSON.stringify(fixData));

  const trustedDivergencePolicy = await applyTrustedDivergenceCorrections({
    limit: divergenceApplyLimit,
  });
  console.log("[price-maintenance] trusted_divergence_policy", JSON.stringify(trustedDivergencePolicy));

  await runSuspectRecheck();

  const criticalRecheck = await runCriticalRecheckLoop({
    cycles: criticalRecheckCycles,
    waitMs: criticalRecheckWaitMs,
    pctThreshold: criticalMismatchPctThreshold,
    absThreshold: criticalMismatchAbsThreshold,
  });
  console.log("[price-maintenance] critical_recheck", JSON.stringify({
    executed_cycles: criticalRecheck.executed_cycles,
    final_remaining_active_critical: criticalRecheck.final_remaining_active_critical,
  }));

  let suspectPolicy = { enabled: false, reason: "disabled_by_flag" };
  if (!disableSuspectStandby) {
    suspectPolicy = await applySuspectStandbyPolicy({ cycleLimit: suspectCycleLimit });
    console.log("[price-maintenance] suspect_policy", JSON.stringify(suspectPolicy));
  }

  const untrustedDropPolicy = await applyUntrustedDropGuard({
    pctThreshold: untrustedDropPctThreshold,
    absThreshold: untrustedDropAbsThreshold,
  });
  console.log("[price-maintenance] untrusted_drop_policy", JSON.stringify(untrustedDropPolicy));

  const criticalMismatchPolicy = await applyCriticalMismatchGuard({
    pctThreshold: criticalMismatchPctThreshold,
    absThreshold: criticalMismatchAbsThreshold,
  });
  console.log("[price-maintenance] critical_mismatch_policy", JSON.stringify(criticalMismatchPolicy));

  const strictEligibilityPolicy = await applyStrictActiveEligibilityGuard({
    maxStaleHours: strictMaxStaleHours,
  });
  console.log("[price-maintenance] strict_active_eligibility", JSON.stringify(strictEligibilityPolicy));

  const closeNonActiveMismatch = await closeOpenMismatchForNonActiveProducts();
  console.log("[price-maintenance] close_non_active_mismatch", JSON.stringify(closeNonActiveMismatch));

  const after = runAuditScript("price-maintenance-after");
  const beforeTotals = before.report?.totals || {};
  const afterTotals = after.report?.totals || {};

  console.log("\\n[price-maintenance] summary");
  console.log(JSON.stringify({
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    before: beforeTotals,
    after: afterTotals,
    trusted_divergence_policy: trustedDivergencePolicy,
    suspect_policy: suspectPolicy,
    untrusted_drop_policy: untrustedDropPolicy,
    critical_mismatch_policy: criticalMismatchPolicy,
    strict_active_eligibility: strictEligibilityPolicy,
    close_non_active_mismatch: closeNonActiveMismatch,
    critical_recheck: criticalRecheck,
    before_report: before.outJsonPath,
    after_report: after.outJsonPath,
  }, null, 2));
};

main().catch((error) => {
  console.error("[price-maintenance] failed", error?.message || error);
  process.exit(1);
});
