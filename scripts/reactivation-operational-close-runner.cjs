#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const {
  readRunnerEnv,
  createSupabaseRestClient,
  toCsv,
} = require("./_supabase_runner_utils.cjs");

const HELP_TEXT = `reactivation-operational-close-runner

Uso:
  node scripts/reactivation-operational-close-runner.cjs [opcoes]

Opcoes:
  --env <path>                Arquivo .env do runner (default: supabase/functions/.env.scheduler)
  --limit <n>                 Limite de candidatos para funcao de reativacao (default: 800)
  --window-hours <n>          Janela em horas para elegibilidade e auditoria (default: 72)
  --source <texto>            Source enviado para funcao de reativacao (default: maintenance_backfill)
  --audit-source <texto>      Filtro de auditoria por source (default: valor de --source)
  --audit-note <texto>        Filtro opcional adicional por note
  --out-prefix <path>         Prefixo dos artefatos de saida (default: logs/reactivation-operational-close)
  --project-ref <ref>         Project ref para fallback SQL admin
  --help                      Exibe esta ajuda

Artefatos gerados:
  <out-prefix>.json
  <out-prefix>.csv
  <out-prefix>-reactivated-products.csv
`;

const parseArgs = (argv) => {
  const out = {
    env: "supabase/functions/.env.scheduler",
    limit: 800,
    windowHours: 72,
    source: "maintenance_backfill",
    auditSource: "",
    auditNote: "",
    outPrefix: "logs/reactivation-operational-close",
    projectRef: "",
    showHelp: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const [flag, inlineValue] = token.split("=");
    const nextValue = inlineValue ?? argv[index + 1];
    const consumeNext = inlineValue === undefined;

    if (flag === "--help") {
      out.showHelp = true;
      continue;
    }

    if (flag === "--env" && nextValue) {
      out.env = nextValue;
      if (consumeNext) index += 1;
    } else if (flag === "--limit" && nextValue) {
      out.limit = Number(nextValue);
      if (consumeNext) index += 1;
    } else if (flag === "--window-hours" && nextValue) {
      out.windowHours = Number(nextValue);
      if (consumeNext) index += 1;
    } else if (flag === "--source" && nextValue) {
      out.source = nextValue;
      if (consumeNext) index += 1;
    } else if (flag === "--audit-source" && nextValue) {
      out.auditSource = nextValue;
      if (consumeNext) index += 1;
    } else if (flag === "--audit-note" && nextValue) {
      out.auditNote = nextValue;
      if (consumeNext) index += 1;
    } else if (flag === "--out-prefix" && nextValue) {
      out.outPrefix = nextValue;
      if (consumeNext) index += 1;
    } else if (flag === "--project-ref" && nextValue) {
      out.projectRef = nextValue;
      if (consumeNext) index += 1;
    }
  }

  if (!Number.isFinite(out.limit) || out.limit <= 0) out.limit = 800;
  if (!Number.isFinite(out.windowHours) || out.windowHours <= 0) out.windowHours = 72;
  if (!String(out.auditSource || "").trim()) out.auditSource = out.source;
  return out;
};

const NORMALIZED_PENDING = new Set(["standby", "pending", "pending_validacao", "pending_validation"]);
const RELIABLE_SOURCES = new Set(["api_base", "api_pix", "auth", "public", "catalog", "catalog_ingest"]);

const toIso = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

const normalizeStatus = (value) => String(value || "").trim().toLowerCase();
const normalizeReason = (value) => {
  const text = String(value || "").trim();
  return text || "sem_motivo";
};

const startsWithMercado = (value) => String(value || "").toLowerCase().startsWith("mercado");

const isEligibleToReactivate = (product, nowMs, windowHours) => {
  if (!startsWithMercado(product.marketplace)) return false;
  if (product.removed_at) return false;
  if (String(product.auto_disabled_reason || "") !== "supervisao_automatica_incoerencia") return false;
  const status = normalizeStatus(product.status);
  if (!(NORMALIZED_PENDING.has(status) || !Boolean(product.is_active))) return false;

  const verifiedAtIso = toIso(product.last_price_verified_at);
  if (!verifiedAtIso) return false;
  const verifiedAtMs = Date.parse(verifiedAtIso);
  if (!Number.isFinite(verifiedAtMs)) return false;
  const minMs = nowMs - windowHours * 60 * 60 * 1000;
  if (verifiedAtMs < minMs) return false;

  const source = String(product.last_price_source || "").trim().toLowerCase();
  if (!RELIABLE_SOURCES.has(source)) return false;
  return true;
};

const buildSnapshot = ({ products, windowHours, nowIso }) => {
  const nowMs = Date.parse(nowIso);
  const statusCounts = {};
  const standbyInactiveByReason = {};
  const eligible = [];

  for (const product of products) {
    if (!startsWithMercado(product.marketplace) || product.removed_at) continue;
    const status = normalizeStatus(product.status) || "unknown";
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    const isStandbyOrInactive = status === "standby" || status === "inactive" || !Boolean(product.is_active);
    if (isStandbyOrInactive) {
      const reason = normalizeReason(product.auto_disabled_reason || product.deactivation_reason);
      standbyInactiveByReason[reason] = (standbyInactiveByReason[reason] || 0) + 1;
    }

    if (isEligibleToReactivate(product, nowMs, windowHours)) {
      eligible.push({
        id: product.id,
        status,
        is_active: Boolean(product.is_active),
        auto_disabled_reason: product.auto_disabled_reason || null,
        deactivation_reason: product.deactivation_reason || null,
        last_price_source: product.last_price_source || null,
        last_price_verified_at: toIso(product.last_price_verified_at),
      });
    }
  }

  return {
    generated_at: nowIso,
    status_counts: statusCounts,
    standby_inactive_by_reason: standbyInactiveByReason,
    eligible_to_reactivation_count: eligible.length,
    eligible_to_reactivation: eligible,
  };
};

const sortObject = (obj) =>
  Object.fromEntries(
    Object.entries(obj || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, value]),
  );

const extractAdminSource = (action) => {
  const detailsSource =
    action?.details && typeof action.details === "object"
      ? action.details.source || action.details.p_source || action.details.note || null
      : null;
  const fallbackNote = String(action?.note || "").trim();
  const source = String(detailsSource || fallbackNote || "sem_source").trim();
  return source || "sem_source";
};

const inWindow = (value, startMs, endMs) => {
  const iso = toIso(value);
  if (!iso) return false;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  return ms >= startMs && ms <= endMs;
};

const fetchAdminActions = async (client) => {
  const fields = ["id", "product_id", "action", "reason", "note", "details", "created_at"].join(",");
  return client.fetchPagedRows(
    `/product_admin_actions?select=${encodeURIComponent(fields)}&action=eq.reactivate_after_coherence_backfill&order=created_at.desc`,
  );
};

const buildAdminAuditMetrics = ({ adminActions, executionStartIso, executionEndIso, windowHours, auditSource, auditNote }) => {
  const endMs = Date.parse(executionEndIso);
  const startMs = endMs - windowHours * 60 * 60 * 1000;
  const executionStartMs = Date.parse(executionStartIso);
  const executionEndMs = Date.parse(executionEndIso);
  const normalizedAuditSource = String(auditSource || "").trim().toLowerCase();
  const normalizedAuditNote = String(auditNote || "").trim().toLowerCase();

  const inAuditWindow = adminActions.filter((row) => inWindow(row.created_at, startMs, endMs));
  const filtered = inAuditWindow.filter((row) => {
    const source = extractAdminSource(row).toLowerCase();
    const note = String(row.note || "").trim().toLowerCase();
    if (normalizedAuditSource && source !== normalizedAuditSource) return false;
    if (normalizedAuditNote && note !== normalizedAuditNote) return false;
    return true;
  });

  const bySource = {};
  for (const row of filtered) {
    const source = extractAdminSource(row);
    bySource[source] = (bySource[source] || 0) + 1;
  }

  const lastExecutionCount = filtered.filter((row) => inWindow(row.created_at, executionStartMs, executionEndMs)).length;

  return {
    window_start: new Date(startMs).toISOString(),
    window_end: new Date(endMs).toISOString(),
    filter_source: auditSource || null,
    filter_note: auditNote || null,
    admin_actions_count: filtered.length,
    admin_actions_by_source: sortObject(bySource),
    admin_actions_last_execution_count: lastExecutionCount,
  };
};

const parseReactivatedFromExecution = (execution) => {
  if (!execution) return 0;
  if (execution.mode === "rpc") {
    return Number(execution?.payload?.reactivated || 0);
  }
  if (execution.mode === "admin_sql_api") {
    const first = Array.isArray(execution.payload) ? execution.payload[0] : null;
    const nested = first?.result;
    return Number(nested?.reactivated || 0);
  }
  return 0;
};

const buildDiffRows = ({
  before,
  after,
  effectivelyReactivatedRunner,
  reactivatedViaAdminSql,
  reconciledTotal,
  adminAudit,
}) => {
  const rows = [];
  const statusKeys = new Set([...Object.keys(before.status_counts || {}), ...Object.keys(after.status_counts || {})]);
  for (const key of [...statusKeys].sort()) {
    const b = Number(before.status_counts?.[key] || 0);
    const a = Number(after.status_counts?.[key] || 0);
    rows.push({ metric: `status:${key}`, before: b, after: a, delta: a - b });
  }

  const reasonKeys = new Set([
    ...Object.keys(before.standby_inactive_by_reason || {}),
    ...Object.keys(after.standby_inactive_by_reason || {}),
  ]);
  for (const key of [...reasonKeys].sort()) {
    const b = Number(before.standby_inactive_by_reason?.[key] || 0);
    const a = Number(after.standby_inactive_by_reason?.[key] || 0);
    rows.push({ metric: `standby_or_inactive_reason:${key}`, before: b, after: a, delta: a - b });
  }

  rows.push({
    metric: "eligible_to_reactivation_count",
    before: Number(before.eligible_to_reactivation_count || 0),
    after: Number(after.eligible_to_reactivation_count || 0),
    delta: Number(after.eligible_to_reactivation_count || 0) - Number(before.eligible_to_reactivation_count || 0),
  });
  rows.push({
    metric: "total_effectively_reactivated",
    before: 0,
    after: Number(effectivelyReactivatedRunner || 0),
    delta: Number(effectivelyReactivatedRunner || 0),
  });

  rows.push({
    metric: "reactivated_via_admin_sql",
    before: 0,
    after: Number(reactivatedViaAdminSql || 0),
    delta: Number(reactivatedViaAdminSql || 0),
  });

  rows.push({
    metric: "reactivated_consolidated_total",
    before: 0,
    after: Number(reconciledTotal || 0),
    delta: Number(reconciledTotal || 0),
  });

  rows.push({
    metric: "admin_actions_count",
    before: 0,
    after: Number(adminAudit?.admin_actions_count || 0),
    delta: Number(adminAudit?.admin_actions_count || 0),
  });

  rows.push({
    metric: "admin_actions_last_execution_count",
    before: 0,
    after: Number(adminAudit?.admin_actions_last_execution_count || 0),
    delta: Number(adminAudit?.admin_actions_last_execution_count || 0),
  });

  for (const [source, count] of Object.entries(adminAudit?.admin_actions_by_source || {})) {
    rows.push({
      metric: `admin_actions_source:${source}`,
      before: 0,
      after: Number(count || 0),
      delta: Number(count || 0),
    });
  }

  const annotatedRows = rows.map((row) => ({
    ...row,
    admin_actions_count: Number(adminAudit?.admin_actions_count || 0),
    admin_actions_last_execution_count: Number(adminAudit?.admin_actions_last_execution_count || 0),
    effectively_reactivated_runner: Number(effectivelyReactivatedRunner || 0),
    reactivated_via_admin_sql: Number(reactivatedViaAdminSql || 0),
    reactivated_consolidated_total: Number(reconciledTotal || 0),
  }));

  return annotatedRows;
};

const fetchMercadoProducts = async (client) => {
  const fields = [
    "id",
    "status",
    "is_active",
    "deactivation_reason",
    "auto_disabled_reason",
    "last_price_source",
    "last_price_verified_at",
    "marketplace",
    "removed_at",
    "updated_at",
  ].join(",");

  return client.fetchPagedRows(`/products?select=${encodeURIComponent(fields)}&order=updated_at.desc`);
};

const tryRpcReactivation = async (client, { limit, windowHours, source }) => {
  const data = await client.rpc("reactivate_auto_disabled_coherence_products", {
    p_limit: limit,
    p_window_hours: windowHours,
    p_source: source,
  });
  return { mode: "rpc", payload: data };
};

const runAdminSqlFallback = async ({ projectRef, accessToken, limit, windowHours, source }) => {
  const safeSource = String(source || "maintenance_backfill").replace(/'/g, "''");
  const query = `select set_config('request.jwt.claim.role','service_role', true); select public.reactivate_auto_disabled_coherence_products(${Math.trunc(limit)}, ${Math.trunc(windowHours)}, '${safeSource}') as result;`;
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!response.ok) {
    throw new Error(`admin_sql_fallback_failed: ${response.status} ${response.statusText} ${typeof parsed === "string" ? parsed : JSON.stringify(parsed || {})}`);
  }
  return { mode: "admin_sql_api", payload: parsed };
};

const main = async () => {
  const args = parseArgs(process.argv);
  if (args.showHelp) {
    console.log(HELP_TEXT);
    return;
  }
  const env = readRunnerEnv(args.env);

  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("missing_supabase_env: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const client = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });

  const executionStartedAt = new Date().toISOString();
  const nowBefore = executionStartedAt;
  const beforeProducts = await fetchMercadoProducts(client);
  const before = buildSnapshot({ products: beforeProducts, windowHours: args.windowHours, nowIso: nowBefore });

  let execution = null;
  let fallbackLog = null;
  try {
    execution = await tryRpcReactivation(client, {
      limit: args.limit,
      windowHours: args.windowHours,
      source: args.source,
    });
  } catch (error) {
    const message = String(error?.message || error);
    if (!/admin_required/i.test(message)) {
      throw error;
    }
    const projectRef =
      args.projectRef ||
      process.env.SUPABASE_PROJECT_REF ||
      env.SUPABASE_PROJECT_REF ||
      (fs.existsSync("supabase/.temp/project-ref")
        ? String(fs.readFileSync("supabase/.temp/project-ref", "utf8")).trim()
        : "");
    const accessToken = process.env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN || "";
    if (!projectRef || !accessToken) {
      throw new Error(
        "admin_required and fallback_unavailable: set SUPABASE_ACCESS_TOKEN (and project ref if needed) to use SQL admin API fallback",
      );
    }
    fallbackLog = {
      trigger: "rpc_admin_required",
      project_ref: projectRef,
      at: new Date().toISOString(),
      error: message,
    };
    execution = await runAdminSqlFallback({
      projectRef,
      accessToken,
      limit: args.limit,
      windowHours: args.windowHours,
      source: args.source,
    });
  }

  const nowAfter = new Date().toISOString();
  const afterProducts = await fetchMercadoProducts(client);
  const after = buildSnapshot({ products: afterProducts, windowHours: args.windowHours, nowIso: nowAfter });
  const executionFinishedAt = new Date().toISOString();
  const adminActions = await fetchAdminActions(client);

  const beforeEligibleById = new Map(before.eligible_to_reactivation.map((row) => [row.id, row]));
  const afterById = new Map(afterProducts.map((row) => [row.id, row]));
  const effectivelyReactivated = [];

  for (const [id, snapshot] of beforeEligibleById.entries()) {
    const current = afterById.get(id);
    if (!current) continue;
    const status = normalizeStatus(current.status);
    const isActive = Boolean(current.is_active);
    const autoDisabled = String(current.auto_disabled_reason || "").trim();
    if (status === "active" && isActive && !autoDisabled) {
      effectivelyReactivated.push({
        id,
        from_status: snapshot.status,
        to_status: status,
        from_is_active: snapshot.is_active,
        to_is_active: isActive,
        from_auto_disabled_reason: snapshot.auto_disabled_reason,
        to_auto_disabled_reason: current.auto_disabled_reason || null,
        last_price_source: current.last_price_source || null,
        last_price_verified_at: toIso(current.last_price_verified_at),
      });
    }
  }

  const adminAudit = buildAdminAuditMetrics({
    adminActions,
    executionStartIso: executionStartedAt,
    executionEndIso: executionFinishedAt,
    windowHours: args.windowHours,
    auditSource: args.auditSource,
    auditNote: args.auditNote,
  });

  const reactivatedViaAdminSql = parseReactivatedFromExecution(execution);
  const effectivelyReactivatedRunner = effectivelyReactivated.length;
  const reconciledTotal = Math.max(
    effectivelyReactivatedRunner,
    reactivatedViaAdminSql,
    Number(adminAudit.admin_actions_last_execution_count || 0),
  );

  const diffRows = buildDiffRows({
    before,
    after,
    effectivelyReactivatedRunner,
    reactivatedViaAdminSql,
    reconciledTotal,
    adminAudit,
  });
  const outDir = path.dirname(args.outPrefix);
  if (outDir && outDir !== ".") fs.mkdirSync(outDir, { recursive: true });

  const summary = {
    ok: true,
    generated_at: new Date().toISOString(),
    config: {
      env: args.env,
      limit: args.limit,
      window_hours: args.windowHours,
      source: args.source,
      audit_source: args.auditSource,
      audit_note: args.auditNote || null,
      out_prefix: args.outPrefix,
    },
    execution_window: {
      started_at: executionStartedAt,
      finished_at: executionFinishedAt,
    },
    execution: {
      mode: execution.mode,
      rpc_or_sql_result: execution.payload,
      fallback: fallbackLog,
    },
    before: {
      generated_at: before.generated_at,
      status_counts: sortObject(before.status_counts),
      standby_inactive_by_reason: sortObject(before.standby_inactive_by_reason),
      eligible_to_reactivation_count: before.eligible_to_reactivation_count,
    },
    after: {
      generated_at: after.generated_at,
      status_counts: sortObject(after.status_counts),
      standby_inactive_by_reason: sortObject(after.standby_inactive_by_reason),
      eligible_to_reactivation_count: after.eligible_to_reactivation_count,
    },
    admin_audit: {
      window_start: adminAudit.window_start,
      window_end: adminAudit.window_end,
      filter_source: adminAudit.filter_source,
      filter_note: adminAudit.filter_note,
      admin_actions_count: adminAudit.admin_actions_count,
      admin_actions_by_source: adminAudit.admin_actions_by_source,
      admin_actions_last_execution_count: adminAudit.admin_actions_last_execution_count,
    },
    reconciliation: {
      effectively_reactivated_runner: effectivelyReactivatedRunner,
      reactivated_via_admin_sql: reactivatedViaAdminSql,
      reconciled_reactivated_total: reconciledTotal,
    },
    totals: {
      effectively_reactivated: effectivelyReactivatedRunner,
      admin_actions_count: adminAudit.admin_actions_count,
      admin_actions_last_execution_count: adminAudit.admin_actions_last_execution_count,
      reactivated_via_admin_sql: reactivatedViaAdminSql,
      reactivated_consolidated_total: reconciledTotal,
      before_eligible: before.eligible_to_reactivation_count,
      after_eligible: after.eligible_to_reactivation_count,
    },
    diff_rows: diffRows,
    reactivated_products: effectivelyReactivated,
  };

  const jsonPath = `${args.outPrefix}.json`;
  const csvPath = `${args.outPrefix}.csv`;
  const reactivatedCsvPath = `${args.outPrefix}-reactivated-products.csv`;
  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  fs.writeFileSync(csvPath, `${toCsv(diffRows)}\n`, "utf8");
  fs.writeFileSync(reactivatedCsvPath, `${toCsv(effectivelyReactivated)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        execution_mode: execution.mode,
        totals: summary.totals,
        reconciliation: summary.reconciliation,
        admin_audit: summary.admin_audit,
        outputs: {
          json: jsonPath,
          csv: csvPath,
          reactivated_csv: reactivatedCsvPath,
        },
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
