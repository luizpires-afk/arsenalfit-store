import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============== ML Auth helper (mantido, mas hoje não usamos auth) ==============
const getMeliAccessToken = async () => {
  const direct = Deno.env.get("ML_ACCESS_TOKEN");
  if (direct) return direct;

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

// ============ ID helpers ============
const extractMLB = (url?: string | null) => {
  if (!url) return null;
  const itemId = url.match(/item_id%3AMLB(\d+)/i) || url.match(/[?&#]item_id=MLB(\d+)/i);
  if (itemId) return `MLB${itemId[1]}`;
  const canonical = url.match(/\/p\/MLB(\d+)/i);
  if (canonical) return `MLB${canonical[1]}`;
  const wid = url.match(/[?&#]wid=MLB(\d+)/i);
  if (wid) return `MLB${wid[1]}`;
  const pid = url.match(/[?&#]id=MLB(\d+)/i);
  if (pid) return `MLB${pid[1]}`;
  const match = url.match(/MLB-?(\d+)/i);
  return match ? `MLB${match[1]}` : null;
};
const isValidMLB = (id?: string | null) => !!id && /^MLB\d{8,}$/.test(id);
const extractCatalog = (url?: string | null) => {
  if (!url) return null;
  const m = url.match(/\/p\/(MLB\d+)/i);
  return m ? m[1] : null;
};

// ============== PRODUCTS API (catalog) ==============
const fetchCatalogPrice = async (catalogId: string) => {
  try {
    const res = await fetch(`https://api.mercadolibre.com/products/${catalogId}`);
    if (!res.ok) {
      console.error(`Catalog fetch fail ${catalogId}: ${res.status}`);
      return null;
    }
    const data = await res.json();
    const winner = data?.buy_box_winner;
    if (winner?.price?.amount !== undefined) {
      return {
        price: winner.price.amount,
        original_price: winner.original_price?.amount ?? winner.price.amount,
        free_shipping: winner.shipping?.free_shipping ?? false,
      };
    }
    return null;
  } catch (err) {
    console.error(`Catalog fetch error ${catalogId}`, err);
    return null;
  }
};

// ============== SEARCH API (public) ==============
const fetchSearchPrice = async (itemId: string) => {
  try {
    const res = await fetch(`https://api.mercadolibre.com/sites/MLB/search?item=${itemId}`);
    if (!res.ok) {
      console.error(`Search fetch fail ${itemId}: ${res.status}`);
      return null;
    }
    const data = await res.json();
    const r0 = data?.results?.[0];
    if (r0 && r0.price !== undefined) {
      return {
        price: r0.price,
        original_price: r0.original_price ?? r0.price,
        free_shipping: r0.shipping?.free_shipping ?? false,
      };
    }
    return null;
  } catch (err) {
    console.error(`Search fetch error ${itemId}`, err);
    return null;
  }
};

// ============== SCRAPER API (proxy) ==============
const fetchViaScraper = async (targetUrl: string) => {
  const key = Deno.env.get("SCRAPER_API_KEY");
  if (!key) return null;
  // Usando Scrape.do (render JS). Doc: https://scrape.do
  // Parâmetros: token, url, render=true
  const url = `https://api.scrape.do?token=${encodeURIComponent(key)}&render=true&url=${encodeURIComponent(targetUrl)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });
    if (!res.ok) {
      console.error(`Scraper fail url=${targetUrl}: ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.error(`Scraper error url=${targetUrl}`, err);
    return null;
  }
};

// ============== SCRAPE FALLBACK (HTML) ==============
const scrapeFromHtml = async (id: string, sourceUrl?: string | null) => {
  const parsePriceBlock = (html: string) => {
    const patterns = [
      /"price"\s*:\s*"?([\d.,]+)"?/i,
      /"original_price"\s*:\s*"?([\d.,]+)"?/i,
      /"price_amount"\s*:\s*"?([\d.,]+)"?/i,
      /"amount"\s*:\s*"?([\d.,]+)"?/i,
      /itemprop="price"\s+content="([\d.,]+)"/i,
      /"sale_price"\s*:\s*"?([\d.,]+)"?/i,
    ];
    const find = (p: RegExp) => {
      const m = html.match(p);
      return m ? m[1] : null;
    };
    const priceRaw = find(patterns[0]) ?? find(patterns[3]) ?? find(patterns[4]) ?? find(patterns[5]);
    const originalRaw = find(patterns[1]);
    const freeShipRaw = html.match(/"free_shipping"\s*:\s*(true|false)/i)?.[1];
    const parseNum = (s: string | null) => (s ? parseFloat(s.replace(/\./g, "").replace(",", ".")) : undefined);
    return {
      price: parseNum(priceRaw),
      original_price: parseNum(originalRaw),
      free_shipping: freeShipRaw ? freeShipRaw.toLowerCase() === "true" : false,
    };
  };

  const candidates: string[] = [];
  // 1) primeiro tenta o permalink original (source_url), que é o mais confiável
  if (sourceUrl) candidates.push(sourceUrl);
  // 2) variações conhecidas
  candidates.push(
    `https://produto.mercadolivre.com.br/p/${id}`,
    `https://www.mercadolivre.com.br/p/${id}`,
    `https://produto.mercadolivre.com.br/${id}`,
    `https://www.mercadolivre.com.br/${id}`
  );

  for (const url of candidates) {
    try {
      // Tenta via ScraperAPI se houver key
      let html: string | null = await fetchViaScraper(url);

      // Se não houver key ou falhar, tenta direto
      if (!html) {
        const res = await fetch(url, {
          redirect: "follow",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          },
        });
        if (!res.ok) {
          console.error(`Fallback HTML fail ${id} url=${url}: ${res.status}`);
          continue;
        }
        html = await res.text();
      }

      const parsed = parsePriceBlock(html);
      if (parsed.price !== undefined) {
        return {
          price: parsed.price,
          original_price: parsed.original_price,
          free_shipping: parsed.free_shipping,
        };
      } else {
        console.error(`Fallback HTML parse fail ${id} url=${url}`);
      }
    } catch (err) {
      console.error(`Fallback HTML error ${id} url=${url}`, err);
    }
  }
  return null;
};

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

      if (product.marketplace === "mercadolivre") {
        try {
          let pricePayload: any = null;

          // 1) Products API (catalog) se houver /p/MLB...
          const catalogId = extractCatalog(product.source_url);
          if (catalogId) {
            pricePayload = await fetchCatalogPrice(catalogId);
          }

          // 2) Search API pública se externalId válido
          if (!pricePayload && isValidMLB(externalId)) {
            pricePayload = await fetchSearchPrice(externalId);
          }

          // 3) Items API pública se externalId válido
          if (!pricePayload && isValidMLB(externalId)) {
            const clientId = Deno.env.get("ML_CLIENT_ID");
            const baseUrl = `https://api.mercadolibre.com/items/${externalId}`;
            const urlWithCaller = clientId ? `${baseUrl}?caller.id=${clientId}` : baseUrl;
            let res = await fetch(urlWithCaller);
            if (res.status === 403) {
              const headers: Record<string, string> = {
                "User-Agent": "Mozilla/5.0 (compatible; ArsenalFitBot/1.0; +https://arsenalf.it)",
                "Accept": "application/json",
                "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
              };
              res = await fetch(urlWithCaller, { headers });
            }
            if (res.ok) {
              const mlData = await res.json();
              if (mlData && mlData.price !== undefined) {
                pricePayload = {
                  price: mlData.price,
                  original_price: mlData.original_price || mlData.price,
                  free_shipping: mlData.shipping?.free_shipping ?? false,
                };
              }
            } else {
              const bodyTxt = await res.text();
              console.error(`Erro API ML para ID ${externalId}: ${res.status} - ${bodyTxt}`);
            }
          }

          // 4) Fallback scrape HTML
          if (!pricePayload) {
            const scraped = await scrapeFromHtml(externalId, product.source_url);
            if (scraped) pricePayload = scraped;
          }

          if (pricePayload) {
            updates.push({
              id: product.id,
              price: pricePayload.price,
              original_price: pricePayload.original_price ?? pricePayload.price,
              free_shipping: pricePayload.free_shipping ?? false,
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
