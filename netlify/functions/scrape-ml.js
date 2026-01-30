export default async function handler(event) {
  try {
    const { url, proxy } = JSON.parse(event.body || "{}");
    if (!url) return { statusCode: 400, body: "missing url" };

    const agent = proxy ? new (await import("https-proxy-agent")).HttpsProxyAgent(proxy) : undefined;
    const html = await fetch(url, { agent }).then(r => r.text());

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: html
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: err.message };
  }
}