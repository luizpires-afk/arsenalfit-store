import { createClient } from "@supabase/supabase-js";

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const SUPABASE_ANON_KEY =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return jsonResponse(500, { error: "missing_env" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const payload = JSON.parse(event.body || "{}");
    const { event_type, product_id, term } = payload;
    if (!event_type) {
      return jsonResponse(400, { error: "missing_event_type" });
    }

    await supabase.from("search_events").insert({
      term: term || null,
      event_type,
      product_id: product_id || null,
    });

    return jsonResponse(200, { ok: true });
  } catch (error) {
    return jsonResponse(500, { error: error.message || "track_failed" });
  }
};
