import {
  jsonResponse,
  getSupabaseAdmin,
  normalizeEmail,
} from "./_helpers.js";

const parseAdminEmails = () =>
  (process.env.ADMIN_EMAILS || "")
    .split(/[,;\n]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

export const handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const authHeader =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.replace("Bearer ", "")
    : "";

  if (!token) {
    return jsonResponse(401, { error: "missing_token" });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return jsonResponse(500, { error: "missing_env" });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return jsonResponse(401, { error: "invalid_token" });
  }

  const user = userData.user;
  const email = normalizeEmail(user.email || "");

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  const adminEmails = new Set(parseAdminEmails());
  const isAdmin = roleRow?.role === "admin" || (email && adminEmails.has(email));

  if (!isAdmin) {
    return jsonResponse(403, { error: "forbidden" });
  }

  const limit = Math.min(
    Number(event.queryStringParameters?.limit || 50),
    200
  );
  const type = event.queryStringParameters?.type || null;

  let query = supabase
    .from("auth_email_logs")
    .select("id, email, user_id, type, status, message, ip, user_agent, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (type) {
    query = query.eq("type", type);
  }

  const { data, error } = await query;
  if (error) {
    return jsonResponse(500, { error: "query_failed" });
  }

  return jsonResponse(200, { logs: data || [] });
};

