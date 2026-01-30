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

    const resp = await fetch(url, { agent });
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
