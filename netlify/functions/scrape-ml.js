export default async function handler(event) {
  try {
    let body = event.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body || "{}"); } catch { body = {}; }
    } else if (!body) {
      body = {};
    }

    const { url, proxy } = body;
    if (!url) return new Response("missing url", { status: 400 });

    const { HttpsProxyAgent } = await import("https-proxy-agent");
    const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;

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

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error(err);
    return new Response(err.message || "error", { status: 500 });
  }
}
