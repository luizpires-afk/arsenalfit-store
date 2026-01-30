export default async function handler(event) {
  try {
    let body = {};

    // Caso o runtime entregue um Request (Fetch API)
    if (typeof Request !== "undefined" && event instanceof Request) {
      try {
        body = await event.json();
      } catch {
        body = {};
      }
    } else {
      // Caso antigo (event.body string ou objeto)
      let raw = event && event.body;
      if (typeof raw === "string") {
        try {
          body = JSON.parse(raw || "{}");
        } catch {
          body = {};
        }
      } else if (raw) {
        body = raw;
      }
    }

    const { url, proxy } = body || {};
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
