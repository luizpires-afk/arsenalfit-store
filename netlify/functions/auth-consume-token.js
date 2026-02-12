import {
  jsonResponse,
  parseBody,
  getSupabaseAdmin,
  normalizeEmail,
  hashToken,
  nowIso,
  logEmailAttempt,
} from "./auth-helpers.js";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const body = parseBody(event);
  const token = body.token || "";
  const type = body.type || "signup";

  if (!token || type !== "signup") {
    return jsonResponse(400, { error: "invalid_token" });
  }

  const TOKEN_PEPPER = process.env.TOKEN_PEPPER;
  if (!TOKEN_PEPPER) {
    return jsonResponse(500, { error: "missing_env" });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return jsonResponse(500, { error: "missing_env" });
  }

  const tokenHash = hashToken(token, TOKEN_PEPPER);
  const now = nowIso();

  const { data: tokenRow, error } = await supabase
    .from("auth_email_tokens")
    .select("id, email, user_id, type, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .eq("type", type)
    .is("used_at", null)
    .gt("expires_at", now)
    .maybeSingle();

  if (error || !tokenRow) {
    return jsonResponse(400, { error: "token_invalid_or_expired" });
  }

  await supabase
    .from("auth_email_tokens")
    .update({ used_at: now })
    .eq("id", tokenRow.id);

  const email = normalizeEmail(tokenRow.email);
  let userId = tokenRow.user_id;

  if (!userId) {
    const { data: userData } = await supabase.auth.admin.getUserByEmail(email);
    userId = userData?.user?.id ?? null;
  }

  if (userId) {
    await supabase.auth.admin.updateUserById(userId, { email_confirm: true });
  }

  const { data: linkData, error: linkError } =
    await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

  if (linkError || !linkData?.properties?.email_otp) {
    await logEmailAttempt(supabase, {
      email,
      userId,
      type: "signup",
      status: "error",
      message: linkError?.message || "magiclink_failed",
    });
    return jsonResponse(500, { error: "session_link_failed" });
  }

  await logEmailAttempt(supabase, {
    email,
    userId,
    type: "signup",
    status: "consumed",
    message: "token_consumed",
  });

  return jsonResponse(200, {
    ok: true,
    email,
    otp: linkData.properties.email_otp,
    otpType: linkData.properties.verification_type || "magiclink",
  });
};

