import {
  DEFAULT_ENV,
  getArg,
  parseEnvAndClient,
  toInt,
  writeJson,
} from "./_affiliate_catalog_common.js";

const envFile = getArg("--env", DEFAULT_ENV);
const outFile = getArg("--out-file", "reports/alert-routing-report.json");
const limit = toInt(getArg("--limit", "300"), 300);
const webhookTimeoutMs = toInt(getArg("--webhook-timeout-ms", "10000"), 10000);

const SLA_MINUTES = {
  P1: 15,
  P2: 60,
  P3: 240,
};

const PRIORITY_FROM_SEVERITY = {
  critical: "P1",
  warning: "P2",
  info: "P3",
};

const toPriority = (severity) => PRIORITY_FROM_SEVERITY[String(severity || "").toLowerCase()] || "P3";

const toEscalationLevel = (ageMinutes, slaMinutes) => {
  if (ageMinutes <= slaMinutes) return "L1";
  if (ageMinutes <= slaMinutes * 2) return "L2";
  return "L3";
};

const toDateIso = (dateLike) => {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

const postWebhook = async (url, payload, timeoutMs) => {
  if (!url) return { attempted: false, ok: false, status: null, error: "missing_webhook" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return {
      attempted: true,
      ok: resp.ok,
      status: resp.status,
      error: resp.ok ? null : `webhook_http_${resp.status}`,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      status: null,
      error: String(error?.message || error || "webhook_error"),
    };
  } finally {
    clearTimeout(timer);
  }
};

const buildRoutingPayload = (alert, nowMs, webhookUrl) => {
  const createdMs = Date.parse(String(alert?.created_at || ""));
  const safeCreatedMs = Number.isFinite(createdMs) ? createdMs : nowMs;
  const ageMinutes = Math.max(0, Math.floor((nowMs - safeCreatedMs) / 60000));

  const priority = toPriority(alert?.severity);
  const slaMinutes = SLA_MINUTES[priority] || SLA_MINUTES.P3;
  const escalationLevel = toEscalationLevel(ageMinutes, slaMinutes);
  const breachedSla = ageMinutes > slaMinutes;

  return {
    priority,
    sla_minutes: slaMinutes,
    age_minutes: ageMinutes,
    escalation_level: escalationLevel,
    breached_sla: breachedSla,
    route_target: webhookUrl ? "webhook" : "unconfigured",
    due_at: toDateIso(safeCreatedMs + slaMinutes * 60000),
    escalated_at: breachedSla ? new Date(nowMs).toISOString() : null,
  };
};

const mergePayload = (basePayload, routingPatch, dispatchPatch) => {
  const base = basePayload && typeof basePayload === "object" ? basePayload : {};
  const previousRouting = base.routing && typeof base.routing === "object" ? base.routing : {};
  return {
    ...base,
    routing: {
      ...previousRouting,
      ...routingPatch,
      dispatch: dispatchPatch,
      last_updated_at: new Date().toISOString(),
    },
  };
};

const main = async () => {
  const { env, client } = parseEnvAndClient(envFile);
  const nowMs = Date.now();

  const alerts = await client.fetchPagedRows(
    `/discovery_alerts?select=id,candidate_id,marketplace,external_product_id,alert_type,severity,status,message,payload,created_at,updated_at&status=in.(new,acknowledged)&order=created_at.asc&limit=${encodeURIComponent(String(limit))}`,
    500,
  );

  const routingWebhooks = {
    P1: process.env.ALERT_ROUTING_P1_WEBHOOK || env.ALERT_ROUTING_P1_WEBHOOK || null,
    P2: process.env.ALERT_ROUTING_P2_WEBHOOK || env.ALERT_ROUTING_P2_WEBHOOK || null,
    P3: process.env.ALERT_ROUTING_P3_WEBHOOK || env.ALERT_ROUTING_P3_WEBHOOK || null,
  };

  const output = {
    generated_at: new Date(nowMs).toISOString(),
    ok: true,
    scanned: alerts.length,
    routed: 0,
    escalated: 0,
    sla_breached: 0,
    webhook_failures: 0,
    priorities: { P1: 0, P2: 0, P3: 0 },
    alerts: [],
  };

  for (const alert of alerts) {
    const routing = buildRoutingPayload(alert, nowMs, routingWebhooks[toPriority(alert?.severity)]);
    output.priorities[routing.priority] += 1;
    if (routing.breached_sla) output.sla_breached += 1;
    if (routing.escalation_level !== "L1") output.escalated += 1;

    const dispatchPayload = {
      incident_type: "discovery_alert",
      alert_id: alert.id,
      priority: routing.priority,
      escalation_level: routing.escalation_level,
      sla_minutes: routing.sla_minutes,
      age_minutes: routing.age_minutes,
      breached_sla: routing.breached_sla,
      candidate_id: alert.candidate_id,
      marketplace: alert.marketplace,
      external_product_id: alert.external_product_id,
      alert_type: alert.alert_type,
      severity: alert.severity,
      message: alert.message,
      occurred_at: alert.created_at,
    };

    const dispatch = await postWebhook(routingWebhooks[routing.priority], dispatchPayload, webhookTimeoutMs);
    if (!dispatch.ok && dispatch.attempted) output.webhook_failures += 1;

    const payload = mergePayload(alert.payload, routing, {
      attempted: dispatch.attempted,
      delivered: dispatch.ok,
      webhook_status: dispatch.status,
      webhook_error: dispatch.error,
      delivered_at: dispatch.ok ? new Date().toISOString() : null,
    });

    const nextStatus = dispatch.ok && String(alert.status) === "new" ? "acknowledged" : String(alert.status || "new");

    await client.request(`/discovery_alerts?id=eq.${encodeURIComponent(alert.id)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        status: nextStatus,
        payload,
        updated_at: new Date().toISOString(),
      }),
    });

    output.routed += 1;
    output.alerts.push({
      id: alert.id,
      status_before: alert.status,
      status_after: nextStatus,
      priority: routing.priority,
      escalation_level: routing.escalation_level,
      breached_sla: routing.breached_sla,
      dispatch_ok: dispatch.ok,
      dispatch_error: dispatch.error,
    });
  }

  writeJson(outFile, output);
  console.log(JSON.stringify(output, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
