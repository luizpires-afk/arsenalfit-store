const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

const parseBody = (event) => {
  try {
    return JSON.parse(event?.body || "{}");
  } catch {
    return null;
  }
};

const toEmailList = (value) =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const sendResendEmail = async ({ apiKey, from, to, subject, html, text }) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`resend_http_${response.status}:${details.slice(0, 300)}`);
  }

  const data = await response.json().catch(() => ({}));
  return data?.id || null;
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const payload = parseBody(event);
  if (!payload || typeof payload !== "object") {
    return jsonResponse(400, { error: "invalid_json" });
  }

  const expectedToken = String(process.env.ALERT_WEBHOOK_TOKEN || "").trim();
  if (expectedToken) {
    const headerToken = String(event.headers?.["x-alert-token"] || event.headers?.["X-Alert-Token"] || "").trim();
    const queryToken = String(event.queryStringParameters?.token || "").trim();
    if (headerToken !== expectedToken && queryToken !== expectedToken) {
      return jsonResponse(401, { error: "unauthorized" });
    }
  }

  const priority = String(payload.priority || "P3").toUpperCase();
  const alertId = String(payload.alert_id || "unknown");
  const message = String(payload.message || "sem mensagem");
  const escalation = String(payload.escalation_level || "L1");
  const severity = String(payload.severity || "info");

  const resendApiKey = String(process.env.RESEND_API_KEY || "").trim();
  const resendTo = toEmailList(process.env.ALERT_WEBHOOK_TO_EMAIL || process.env.ALERT_ROUTING_EMAIL_TO || "");
  const resendFrom = String(process.env.ALERT_WEBHOOK_FROM_EMAIL || process.env.EMAIL_FROM || "ArsenalFit Alerts <onboarding@resend.dev>").trim();
  const logOnly = ["1", "true", "yes", "on"].includes(
    String(process.env.ALERT_WEBHOOK_LOG_ONLY || "true").toLowerCase().trim(),
  );

  const subject = `[${priority}] Discovery Alert ${alertId}`;
  const text = [
    `priority: ${priority}`,
    `severity: ${severity}`,
    `escalation_level: ${escalation}`,
    `alert_id: ${alertId}`,
    `candidate_id: ${payload.candidate_id || "-"}`,
    `marketplace: ${payload.marketplace || "-"}`,
    `external_product_id: ${payload.external_product_id || "-"}`,
    `alert_type: ${payload.alert_type || "-"}`,
    `breached_sla: ${String(Boolean(payload.breached_sla))}`,
    "",
    `message: ${message}`,
  ].join("\n");

  const html = `
    <h2>ArsenalFit Discovery Alert</h2>
    <p><strong>Priority:</strong> ${priority}</p>
    <p><strong>Severity:</strong> ${severity}</p>
    <p><strong>Escalation:</strong> ${escalation}</p>
    <p><strong>Alert ID:</strong> ${alertId}</p>
    <p><strong>Type:</strong> ${String(payload.alert_type || "-")}</p>
    <p><strong>Message:</strong> ${message}</p>
    <pre>${JSON.stringify(payload, null, 2)}</pre>
  `;

  if (resendApiKey && resendTo.length > 0) {
    try {
      const emailId = await sendResendEmail({
        apiKey: resendApiKey,
        from: resendFrom,
        to: resendTo,
        subject,
        html,
        text,
      });
      return jsonResponse(200, {
        ok: true,
        mode: "resend",
        email_id: emailId,
      });
    } catch (error) {
      if (!logOnly) {
        return jsonResponse(502, {
          error: "resend_failed",
          message: String(error?.message || error),
        });
      }
      console.error("alert-webhook resend_failed_fallback_log_only", String(error?.message || error));
      console.log("alert-webhook payload", JSON.stringify(payload));
      return jsonResponse(200, {
        ok: true,
        mode: "log_only_fallback",
      });
    }
  }

  if (!logOnly) {
    return jsonResponse(500, {
      error: "missing_resend_config",
      message: "Set RESEND_API_KEY and ALERT_WEBHOOK_TO_EMAIL or enable ALERT_WEBHOOK_LOG_ONLY=true",
    });
  }

  console.log("alert-webhook payload", JSON.stringify(payload));
  return jsonResponse(200, {
    ok: true,
    mode: "log_only",
  });
};
