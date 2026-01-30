function extractAllIds(url) {
  const ids = new Set();
  const pathMatches = url.match(/MLB\d+/gi);
  if (pathMatches) pathMatches.forEach((id) => ids.add(id.toUpperCase()));
  try {
    const u = new URL(url);
    u.searchParams.forEach((v) => {
      const m = v.match(/MLB\d+/i);
      if (m) ids.add(m[0].toUpperCase());
    });
  } catch {}
  return Array.from(ids);
}

async function fetchItemApi(id, agent) {
  const apiUrl = `https://api.mercadolibre.com/items/${id}`;
  const resp = await fetch(apiUrl, { agent });
  if (!resp.ok) throw new Error(`API ${resp.status}`);
  const json = await resp.json();
  return {
    title: json.title || null,
    price: json.price != null ? json.price.toString() : null,
    image: json.thumbnail || (json.pictures && json.pictures[0]?.url) || null,
    source: "api-item",
  };
}

async function fetchProductApi(id, agent) {
  const apiUrl = `https://api.mercadolibre.com/products/${id}`;
  const resp = await fetch(apiUrl, { agent });
  if (!resp.ok) throw new Error(`API ${resp.status}`);
  const json = await resp.json();
  const bb = json.buy_box_winner || {};
  return {
    title: json.name || json.title || bb.title || null,
    price:
      (bb.price && bb.price.amount != null && bb.price.amount.toString()) ||
      (json.price && json.price.amount != null && json.price.amount.toString()) ||
      null,
    image:
      (bb.images && bb.images[0]) ||
      (json.pictures && json.pictures[0]?.url) ||
      (json.main_picture && json.main_picture.url) ||
      null,
    source: "api-product",
  };
}

export default async function handler(event) {
  try {
    let body = {};

    if (typeof Request !== "undefined" && event instanceof Request) {
      try { body = await event.json(); } catch { body = {}; }
    } else if (event && typeof event.body === "string") {
      try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }
    } else if (event && event.body) {
      body = event.body;
    }

    const { url, proxy } = body || {};
    if (!url) return new Response("missing url", { status: 400 });

    const { HttpsProxyAgent } = await import("https-proxy-agent");
    const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;

    // tenta APIs oficiais com todos os IDs encontrados
    const ids = extractAllIds(url);
    for (const id of ids) {
      try {
        const data = await fetchItemApi(id, agent);
        return new Response(JSON.stringify({ status: 200, ...data }), {
          status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      } catch {}
      try {
        const data = await fetchProductApi(id, agent);
        return new Response(JSON.stringify({ status: 200, ...data }), {
          status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      } catch {}
    }

    // Fallback: scrape HTML
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      "Cache-Control": "no-cache",
    };

    const resp = await fetch(url, { agent, headers });
    const html = await resp.text();

    const getMeta = (property) => {
      const re = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i");
      const m = html.match(re);
      return m ? m[1].trim() : null;
    };

    const title =
      getMeta("og:title") ||
      (() => {
        const m = html.match(/<title>([^<]+)<\/title>/i);
        return m ? m[1].trim() : null;
      })();

    const image = getMeta("og:image") || null;

    const price = (() => {
      const og = getMeta("product:price:amount") || getMeta("og:price:amount");
      if (og) return og;
      const m = html.match(/"price"\s*:\s*"?([0-9.,]+)"?/i);
      return m ? m[1] : null;
    })();

    const data = { status: resp.status, title, price, image, source: "scrape" };

    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    console.error(err);
    return new Response(err.message || "error", { status: 500 });
  }
}