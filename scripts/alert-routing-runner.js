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

const CHANNELS = ["slack", "email", "pager"];

const DEFAULT_CHANNELS_BY_PRIORITY = {
  P1: ["slack", "email", "pager"],
  P2: ["slack", "email"],
  P3: ["slack"],
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

const toChannelWebhook = (env, priority, channel) => {
  const upperChannel = String(channel || "").toUpperCase();
  const prio = String(priority || "P3").toUpperCase();

  const fromEnv =
    process.env[`ALERT_ROUTING_${upperChannel}_${prio}_WEBHOOK`] ||
    env[`ALERT_ROUTING_${upperChannel}_${prio}_WEBHOOK`] ||
    process.env[`ALERT_ROUTING_${upperChannel}_WEBHOOK`] ||
    env[`ALERT_ROUTING_${upperChannel}_WEBHOOK`] ||
    null;

  if (fromEnv) return fromEnv;

  // Compatibility path: old ALERT_ROUTING_P1/P2/P3_WEBHOOK map is treated as slack default.
  if (channel === "slack") {
    return (
      process.env[`ALERT_ROUTING_${prio}_WEBHOOK`] ||
      env[`ALERT_ROUTING_${prio}_WEBHOOK`] ||
      null
    );
  }

  return null;
};

const channelsForPriority = (priority, escalationLevel) => {
  const base = [...(DEFAULT_CHANNELS_BY_PRIORITY[priority] || DEFAULT_CHANNELS_BY_PRIORITY.P3)];
  if (escalationLevel !== "L1" && !base.includes("pager")) {
    base.push("pager");
  }
  return base;
};

const buildRoutingPayload = (alert, nowMs, channelTargets = {}) => {
  const createdMs = Date.parse(String(alert?.created_at || ""));
  const safeCreatedMs = Number.isFinite(createdMs) ? createdMs : nowMs;
  const ageMinutes = Math.max(0, Math.floor((nowMs - safeCreatedMs) / 60000));

  const priority = toPriority(alert?.severity);
  const slaMinutes = SLA_MINUTES[priority] || SLA_MINUTES.P3;
  const escalationLevel = toEscalationLevel(ageMinutes, slaMinutes);
  const breachedSla = ageMinutes > slaMinutes;
  const channels = channelsForPriority(priority, escalationLevel);

  return {
    priority,
    channels,
    channel_targets: channelTargets,
    sla_minutes: slaMinutes,
    age_minutes: ageMinutes,
    escalation_level: escalationLevel,
    breached_sla: breachedSla,
    route_target: channels.join(","),
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

  const output = {
    generated_at: new Date(nowMs).toISOString(),
    ok: true,
    scanned: alerts.length,
    routed: 0,
    escalated: 0,
    sla_breached: 0,
    webhook_failures: 0,
    channel_dispatch: {
      slack: { attempted: 0, delivered: 0, failed: 0 },
      email: { attempted: 0, delivered: 0, failed: 0 },
      pager: { attempted: 0, delivered: 0, failed: 0 },
    },
    priorities: { P1: 0, P2: 0, P3: 0 },
    alerts: [],
  };

  for (const alert of alerts) {
    const priority = toPriority(alert?.severity);
    const preChannels = channelsForPriority(priority, "L1");
    const preTargets = Object.fromEntries(preChannels.map((channel) => [channel, toChannelWebhook(env, priority, channel)]));
    const routing = buildRoutingPayload(alert, nowMs, preTargets);
    output.priorities[routing.priority] += 1;
    if (routing.breached_sla) output.sla_breached += 1;
    if (routing.escalation_level !== "L1") output.escalated += 1;

    const channels = channelsForPriority(routing.priority, routing.escalation_level);
    const channelTargets = Object.fromEntries(
      channels.map((channel) => [channel, toChannelWebhook(env, routing.priority, channel)]),
    );
    routing.channels = channels;
    routing.channel_targets = channelTargets;

    const baseDispatchPayload = {
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

    const dispatches = {};
    for (const channel of channels) {
      const dispatchPayload = {
        ...baseDispatchPayload,
        route_channel: channel,
      };
      const dispatch = await postWebhook(channelTargets[channel], dispatchPayload, webhookTimeoutMs);
      dispatches[channel] = dispatch;

      if (dispatch.attempted) output.channel_dispatch[channel].attempted += 1;
      if (dispatch.ok) {
        output.channel_dispatch[channel].delivered += 1;
      } else if (dispatch.attempted) {
        output.channel_dispatch[channel].failed += 1;
        output.webhook_failures += 1;
      }
    }

    const attemptedChannels = Object.entries(dispatches).filter(([, result]) => result?.attempted).map(([channel]) => channel);
    const deliveredChannels = Object.entries(dispatches).filter(([, result]) => result?.ok).map(([channel]) => channel);
    const dispatchOk = attemptedChannels.length > 0 && deliveredChannels.length === attemptedChannels.length;

    const payload = mergePayload(alert.payload, routing, {
      attempted: attemptedChannels.length > 0,
      delivered: dispatchOk,
      attempted_channels: attemptedChannels,
      delivered_channels: deliveredChannels,
      dispatches,
      delivered_at: dispatchOk ? new Date().toISOString() : null,
    });

    const nextStatus = dispatchOk && String(alert.status) === "new" ? "acknowledged" : String(alert.status || "new");

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
      dispatch_ok: dispatchOk,
      attempted_channels: attemptedChannels,
      delivered_channels: deliveredChannels,
      dispatch_errors: Object.fromEntries(
        Object.entries(dispatches)
          .filter(([, value]) => value?.attempted && !value?.ok)
          .map(([channel, value]) => [channel, value?.error || "webhook_error"]),
      ),
    });
  }

  writeJson(outFile, output);
  console.log(JSON.stringify(output, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
