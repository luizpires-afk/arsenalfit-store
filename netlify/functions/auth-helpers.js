import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: JSON_HEADERS,
  body: JSON.stringify(body),
});

export const parseBody = (event) => {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    return {};
  }
};

export const getClientInfo = (event) => {
  const headers = event.headers || {};
  const forwarded = headers["x-forwarded-for"] || headers["X-Forwarded-For"];
  const ip =
    headers["x-nf-client-connection-ip"] ||
    (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : null) ||
    headers["client-ip"] ||
    headers["Client-Ip"] ||
    "unknown";
  const userAgent = headers["user-agent"] || headers["User-Agent"] || null;
  return { ip, userAgent };
};

export const getSupabaseAdmin = () => {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("missing_supabase_env");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
};

export const getSupabaseAnon = () => {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("missing_supabase_env");
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
};

export const getSiteUrl = () =>
  process.env.SITE_URL ||
  process.env.URL ||
  process.env.DEPLOY_PRIME_URL ||
  process.env.VITE_SITE_URL ||
  "";

export const getEmailFrom = () =>
  process.env.EMAIL_FROM ||
  process.env.RESEND_FROM ||
  "ArsenalFit <onboarding@resend.dev>";

export const normalizeEmail = (email = "") => email.trim().toLowerCase();

export const generateToken = () => crypto.randomBytes(32).toString("hex");

export const hashToken = (token, pepper) =>
  crypto.createHash("sha256").update(`${token}:${pepper}`).digest("hex");

export const buildExpiry = (minutes = 60) =>
  new Date(Date.now() + minutes * 60 * 1000).toISOString();

export const nowIso = () => new Date().toISOString();

export const enforceRateLimit = async (
  supabase,
  { email, ip, type, limit = 3, windowMinutes = 60 }
) => {
  const windowStart = new Date(
    Date.now() - (Date.now() % (windowMinutes * 60 * 1000))
  ).toISOString();

  const { data, error } = await supabase
    .from("auth_email_rate_limits")
    .select("id, count")
    .eq("email", email)
    .eq("ip", ip)
    .eq("type", type)
    .eq("window_start", windowStart)
    .maybeSingle();

  if (error) throw error;

  if (data?.count >= limit) {
    return { allowed: false, retryAfterMinutes: windowMinutes };
  }

  if (data?.id) {
    await supabase
      .from("auth_email_rate_limits")
      .update({ count: data.count + 1, updated_at: nowIso() })
      .eq("id", data.id);
  } else {
    await supabase.from("auth_email_rate_limits").insert({
      email,
      ip,
      type,
      window_start: windowStart,
      count: 1,
    });
  }

  return { allowed: true };
};

export const logEmailAttempt = async (
  supabase,
  { email, userId, type, status, message, ip, userAgent }
) => {
  try {
    await supabase.from("auth_email_logs").insert({
      email,
      user_id: userId ?? null,
      type,
      status,
      message: message ?? null,
      ip,
      user_agent: userAgent ?? null,
    });
  } catch {
    // ignore logging errors
  }
};

export const renderVerifyEmail = ({ verifyUrl }) => {
  return `<!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Confirme seu e-mail</title>
    </head>
    <body style="margin:0;padding:0;background:#f7f7f8;font-family:Arial,sans-serif;color:#111;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f8;padding:24px 0;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:24px;padding:28px 26px;box-shadow:0 18px 45px rgba(0,0,0,0.08);">
              <tr>
                <td style="font-size:20px;font-weight:700;letter-spacing:0.02em;">ArsenalFit</td>
              </tr>
              <tr>
                <td style="padding-top:18px;font-size:22px;font-weight:700;">Ol&aacute;! Falta s&oacute; um passo para ativar sua conta.</td>
              </tr>
              <tr>
                <td style="padding-top:12px;font-size:15px;line-height:1.6;color:#444;">
                  Clique no bot&atilde;o abaixo para confirmar seu e-mail.
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:22px 0 12px;">
                  <a href="${verifyUrl}" style="display:inline-block;background:#ff6a00;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:999px;">
                    Verificar conta
                  </a>
                </td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#666;line-height:1.5;">
                  Este link expira em 60 minutos.
                </td>
              </tr>
              <tr>
                <td style="padding-top:12px;font-size:12px;color:#666;line-height:1.5;">
                  Se voc&ecirc; n&atilde;o criou uma conta, ignore este e-mail.
                </td>
              </tr>
              <tr>
                <td style="padding-top:16px;font-size:12px;color:#666;">
                  D&uacute;vidas? Fale com a gente: <strong>powershop.bras@gmail.com</strong>
                </td>
              </tr>
              <tr>
                <td style="padding-top:16px;font-size:11px;color:#999;">ArsenalFit</td>
              </tr>
            </table>
            <div style="max-width:560px;padding:10px 0;font-size:12px;color:#777;">
              Se o bot&atilde;o n&atilde;o funcionar, copie e cole este link no navegador:<br/>
              <a href="${verifyUrl}" style="color:#ff6a00;">${verifyUrl}</a>
            </div>
          </td>
        </tr>
      </table>
    </body>
  </html>`;
};

export const renderRecoveryEmail = ({ recoveryUrl }) => {
  return `<!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Redefini&ccedil;&atilde;o de senha</title>
    </head>
    <body style="margin:0;padding:0;background:#f7f7f8;font-family:Arial,sans-serif;color:#111;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f8;padding:24px 0;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:24px;padding:28px 26px;box-shadow:0 18px 45px rgba(0,0,0,0.08);">
              <tr>
                <td style="font-size:20px;font-weight:700;letter-spacing:0.02em;">ArsenalFit</td>
              </tr>
              <tr>
                <td style="padding-top:18px;font-size:22px;font-weight:700;">Recebemos um pedido para redefinir sua senha.</td>
              </tr>
              <tr>
                <td style="padding-top:12px;font-size:15px;line-height:1.6;color:#444;">
                  Clique no bot&atilde;o abaixo para criar uma nova senha.
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:22px 0 12px;">
                  <a href="${recoveryUrl}" style="display:inline-block;background:#ff6a00;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:999px;">
                    Redefinir senha
                  </a>
                </td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#666;line-height:1.5;">
                  Este link expira em 60 minutos.
                </td>
              </tr>
              <tr>
                <td style="padding-top:12px;font-size:12px;color:#666;line-height:1.5;">
                  Se n&atilde;o foi voc&ecirc;, ignore este e-mail.
                </td>
              </tr>
              <tr>
                <td style="padding-top:16px;font-size:12px;color:#666;">
                  D&uacute;vidas? Fale com a gente: <strong>powershop.bras@gmail.com</strong>
                </td>
              </tr>
              <tr>
                <td style="padding-top:16px;font-size:11px;color:#999;">ArsenalFit</td>
              </tr>
            </table>
            <div style="max-width:560px;padding:10px 0;font-size:12px;color:#777;">
              Se o bot&atilde;o n&atilde;o funcionar, copie e cole este link no navegador:<br/>
              <a href="${recoveryUrl}" style="color:#ff6a00;">${recoveryUrl}</a>
            </div>
          </td>
        </tr>
      </table>
    </body>
  </html>`;
};
