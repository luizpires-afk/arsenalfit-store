import { createClient } from "@supabase/supabase-js";

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

export const handler = async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(500, { error: "missing_env" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc("get_deals", { limit_count: 12 });

  if (error) {
    return jsonResponse(500, { error: error.message || "query_failed" });
  }

  const deals = (data || []).map((item) => ({
    id: item.id,
    name: item.name,
    slug: item.slug,
    image_url: item.image_url,
    preco: item.preco,
    preco_anterior: item.preco_anterior,
    lastUpdated: item.last_updated,
  }));

  return jsonResponse(200, deals);
};
