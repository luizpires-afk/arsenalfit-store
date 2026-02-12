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
  renderVerifyEmail,
} from "./_helpers.js";

const isValidEmail = (value = "") => /\S+@\S+\.\S+/.test(value);

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const body = parseBody(event);
  const rawEmail = body.email || "";
  const email = normalizeEmail(rawEmail);
  const password = body.password || null;
  const fullName = body.fullName || body.full_name || null;

  if (!email || !isValidEmail(email)) {
    return jsonResponse(400, { error: "invalid_email" });
  }

  if (password && String(password).length < 8) {
    return jsonResponse(400, { error: "weak_password" });
  }

  const { ip, userAgent } = getClientInfo(event);

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    return jsonResponse(500, { error: "missing_env" });
  }

  const limit = Number(process.env.AUTH_EMAIL_RATE_LIMIT || "3");
  const windowMinutes = Number(process.env.AUTH_EMAIL_RATE_WINDOW_MINUTES || "60");

  try {
    const rate = await enforceRateLimit(supabase, {
      email,
      ip,
      type: "signup",
      limit,
      windowMinutes,
    });

    if (!rate.allowed) {
      await logEmailAttempt(supabase, {
        email,
        type: "signup",
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
  } catch (error) {
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

  if (!user && password) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    });
    if (error) {
      await logEmailAttempt(supabase, {
        email,
        type: "signup",
        status: "error",
        message: error.message,
        ip,
        userAgent,
      });
      return jsonResponse(200, {
        ok: true,
        message: "Se existir conta, enviamos instruções por e-mail.",
      });
    }
    user = data?.user || null;
  }

  if (user?.email_confirmed_at) {
    await logEmailAttempt(supabase, {
      email,
      userId: user.id,
      type: "signup",
      status: "already_confirmed",
      message: "already_confirmed",
      ip,
      userAgent,
    });
    return jsonResponse(200, {
      ok: true,
      message: "Se existir conta, enviamos instruções por e-mail.",
    });
  }

  if (!user) {
    await logEmailAttempt(supabase, {
      email,
      type: "signup",
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
    type: "signup",
    expires_at: buildExpiry(60),
    created_ip: ip,
    user_agent: userAgent,
  });

  if (insertError) {
    await logEmailAttempt(supabase, {
      email,
      userId: user.id,
      type: "signup",
      status: "error",
      message: insertError.message,
      ip,
      userAgent,
    });
    return jsonResponse(500, { error: "token_insert_failed" });
  }

  const verifyUrl = `${SITE_URL}/verificar?token=${encodeURIComponent(
    token
  )}&type=signup`;
  const html = renderVerifyEmail({ verifyUrl });

  const emailResp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [email],
      subject: "Confirme seu e-mail para ativar sua conta — ArsenalFit",
      html,
      text: `Olá! Falta só um passo para ativar sua conta. Verifique aqui: ${verifyUrl} (expira em 60 minutos). Se você não criou uma conta, ignore este e-mail.`,
    }),
  });

  if (!emailResp.ok) {
    const details = await emailResp.text();
    await logEmailAttempt(supabase, {
      email,
      userId: user.id,
      type: "signup",
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
    type: "signup",
    status: "sent",
    message: "verification_sent",
    ip,
    userAgent,
  });

  return jsonResponse(200, {
    ok: true,
    message: "Se existir conta, enviamos instruções por e-mail.",
  });
};
