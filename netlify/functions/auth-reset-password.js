import {
  jsonResponse,
  parseBody,
  getSupabaseAdmin,
  normalizeEmail,
  getAuthUserByEmail,
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
  const password = body.password || "";

  if (!token || !password || password.length < 8) {
    return jsonResponse(400, { error: "invalid_request" });
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
    .eq("type", "recovery")
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
    const user = await getAuthUserByEmail(supabase, email);
    userId = user?.id ?? null;
  }

  if (!userId) {
    return jsonResponse(400, { error: "user_not_found" });
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(
    userId,
    { password }
  );

  if (updateError) {
    await logEmailAttempt(supabase, {
      email,
      userId,
      type: "recovery",
      status: "error",
      message: updateError.message,
    });
    return jsonResponse(500, { error: "password_update_failed" });
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
      type: "recovery",
      status: "error",
      message: linkError?.message || "magiclink_failed",
    });
    return jsonResponse(500, { error: "session_link_failed" });
  }

  await logEmailAttempt(supabase, {
    email,
    userId,
    type: "recovery",
    status: "password_reset",
    message: "password_reset",
  });

  return jsonResponse(200, {
    ok: true,
    email,
    otp: linkData.properties.email_otp,
    otpType: linkData.properties.verification_type || "magiclink",
  });
};

