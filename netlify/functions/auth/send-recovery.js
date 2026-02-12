import {
  jsonResponse,
  parseBody,
  getClientInfo,
  getSupabaseAdmin,
  normalizeEmail,
  generateToken,
  hashToken,
  buildExpiry,
  enforceRateLimit,
  logEmailAttempt,
  renderRecoveryEmail,
} from "./_helpers.js";

const isValidEmail = (value = "") => /\S+@\S+\.\S+/.test(value);

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const body = parseBody(event);
  const rawEmail = body.email || "";
  const email = normalizeEmail(rawEmail);

  if (!email || !isValidEmail(email)) {
    return jsonResponse(400, { error: "invalid_email" });
  }

  const { ip, userAgent } = getClientInfo(event);

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return jsonResponse(500, { error: "missing_env" });
  }

  const limit = Number(process.env.AUTH_EMAIL_RATE_LIMIT || "3");
  const windowMinutes = Number(process.env.AUTH_EMAIL_RATE_WINDOW_MINUTES || "60");

  try {
    const rate = await enforceRateLimit(supabase, {
      email,
      ip,
      type: "recovery",
      limit,
      windowMinutes,
    });

    if (!rate.allowed) {
      await logEmailAttempt(supabase, {
        email,
        type: "recovery",
        status: "rate_limited",
        message: "rate_limit",
        ip,
        userAgent,
      });
      return jsonResponse(429, {
        error: "rate_limited",
        message: "Tente novamente em alguns minutos.",
      });
    }
  } catch {
    return jsonResponse(500, { error: "rate_limit_failed" });
  }

  let user = null;
  try {
    const { data, error } = await supabase.auth.admin.getUserByEmail(email);
    if (error) throw error;
    user = data?.user || null;
  } catch {
    user = null;
  }

  if (!user) {
    await logEmailAttempt(supabase, {
      email,
      type: "recovery",
      status: "user_not_found",
      message: "user_not_found",
      ip,
      userAgent,
    });
    return jsonResponse(200, {
      ok: true,
      message: "Se existir conta, enviamos instruções por e-mail.",
    });
  }

  const TOKEN_PEPPER = process.env.TOKEN_PEPPER;
  const SITE_URL = process.env.SITE_URL || process.env.VITE_SITE_URL || "";
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const EMAIL_FROM =
    process.env.EMAIL_FROM ||
    process.env.RESEND_FROM ||
    "ArsenalFit <no-reply@arsenalfit.com>";

  if (!TOKEN_PEPPER || !SITE_URL || !RESEND_API_KEY) {
    return jsonResponse(500, { error: "missing_env" });
  }

  const token = generateToken();
  const tokenHash = hashToken(token, TOKEN_PEPPER);

  const { error: insertError } = await supabase.from("auth_email_tokens").insert({
    email,
    user_id: user.id,
    token_hash: tokenHash,
    type: "recovery",
    expires_at: buildExpiry(60),
    created_ip: ip,
    user_agent: userAgent,
  });

  if (insertError) {
    await logEmailAttempt(supabase, {
      email,
      userId: user.id,
      type: "recovery",
      status: "error",
      message: insertError.message,
      ip,
      userAgent,
    });
    return jsonResponse(500, { error: "token_insert_failed" });
  }

  const recoveryUrl = `${SITE_URL}/redefinir-senha?token=${encodeURIComponent(
    token
  )}&type=recovery`;
  const html = renderRecoveryEmail({ recoveryUrl });

  const emailResp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [email],
      subject: "Redefinição de senha — ArsenalFit",
      html,
      text: `Recebemos um pedido para redefinir sua senha. Redefina aqui: ${recoveryUrl} (expira em 60 minutos). Se não foi você, ignore.`,
    }),
  });

  if (!emailResp.ok) {
    const details = await emailResp.text();
    await logEmailAttempt(supabase, {
      email,
      userId: user.id,
      type: "recovery",
      status: "error",
      message: details,
      ip,
      userAgent,
    });
    return jsonResponse(500, { error: "email_send_failed" });
  }

  await logEmailAttempt(supabase, {
    email,
    userId: user.id,
    type: "recovery",
    status: "sent",
    message: "recovery_sent",
    ip,
    userAgent,
  });

  return jsonResponse(200, {
    ok: true,
    message: "Se existir conta, enviamos instruções por e-mail.",
  });
};

