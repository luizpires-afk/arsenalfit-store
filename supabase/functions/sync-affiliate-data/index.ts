import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ==============
// ML Auth helper
// ==============
const getMeliAccessToken = async () => {
  // 1) token direto (se você colar um access_token manualmente)
  const direct = Deno.env.get("ML_ACCESS_TOKEN");
  if (direct) return direct;

  // 2) refresh token flow
  const refresh = Deno.env.get("ML_REFRESH_TOKEN");
  const clientId = Deno.env.get("ML_CLIENT_ID");
  const clientSecret = Deno.env.get("ML_CLIENT_SECRET");
  if (!refresh || !clientId || !clientSecret) return null;

  try {
    const resp = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refresh,
      }),
    });
    if (!resp.ok) {
      console.error("Falha ao renovar token ML:", resp.status);
      return null;
    }
    const json = await resp.json();
    return json.access_token as string;
  } catch (err) {
    console.error("Erro ao renovar token ML:", err);
    return null;
  }
};

// ============
// ID helpers ML
// ============
const extractMLB = (url?: string | null) => {
  if (!url) return null;
  // item_id=MLB..., codificado ou não
  const itemId = url.match(/item_id%3AMLB(\d+)/i) || url.match(/[?&#]item_id=MLB(\d+)/i);
  if (itemId) return `MLB${itemId[1]}`;
  // /p/MLB... no caminho
  const canonical = url.match(/\/p\/MLB(\d+)/i);
  if (canonical) return `MLB${canonical[1]}`;
  // wid=MLB...
  const wid = url.match(/[?&#]wid=MLB(\d+)/i);
  if (wid) return `MLB${wid[1]}`;
  // id=MLB...
  const pid = url.match(/[?&#]id=MLB(\d+)/i);
  if (pid) return `MLB${pid[1]}`;
  // MLB-123 ou MLB123 em qualquer lugar
  const match = url.match(/MLB-?(\d+)/i);
  return match ? `MLB${match[1]}` : null;
};

const isValidMLB = (id?: string | null) => !!id && /^MLB\d{8,}$/.test(id);

// ===================================================
// Função principal
// ===================================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const projectUrl = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(projectUrl, serviceRoleKey);

    const meliToken = await getMeliAccessToken();

    const { data: products, error: fetchError } = await supabase
      .from("products")
      .select("id, external_id, marketplace, source_url")
      .neq("marketplace", "manual");

    if (fetchError) throw fetchError;

    const updates: any[] = [];
    const now = new Date().toISOString();

    for (const product of products || []) {
      let externalId = product.external_id;

      if (!externalId && product.marketplace === "mercadolivre") {
        const mlb = extractMLB(product.source_url);
        if (isValidMLB(mlb)) {
          externalId = mlb!;
          updates.push({ id: product.id, external_id: mlb, updated_at: now });
        } else {
          console.error(`ID ML inválido para produto ${product.id}: ${mlb || "none"}`);
          continue;
        }
      }

      if (product.marketplace === "mercadolivre" && isValidMLB(externalId)) {
        try {
          const headers: Record<string, string> = {
            "User-Agent": "Mozilla/5.0 (compatible; ArsenalFitBot/1.0; +https://arsenalf.it)",
          };
          if (meliToken) headers["Authorization"] = `Bearer ${meliToken}`;

          const res = await fetch(`https://api.mercadolibre.com/items/${externalId}`, { headers });
          if (!res.ok) {
            console.error(`Erro API ML para ID ${externalId}: ${res.status}`);
            continue;
          }

          const mlData = await res.json();
          if (mlData && mlData.price !== undefined) {
            updates.push({
              id: product.id,
              price: mlData.price,
              original_price: mlData.original_price || mlData.price,
              free_shipping: mlData.shipping?.free_shipping ?? false,
              last_sync: now,
              updated_at: now,
            });
          }
        } catch (err) {
          console.error(`Falha de conexão (Produto: ${product.id}):`, err);
        }
      }
    }

    if (updates.length > 0) {
      const { error: updateError } = await supabase.from("products").upsert(updates, { onConflict: "id" });
      if (updateError) throw updateError;
    }

    return new Response(JSON.stringify({ success: true, updated_count: updates.length, timestamp: now }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
