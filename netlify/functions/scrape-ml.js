// Netlify Function: scrape-ml
import https from "https";
import { HttpsProxyAgent } from "https-proxy-agent";

export default async function handler(event) {
  try {
    const { url, proxy } = JSON.parse(event.body || "{}");
    if (!url) return { statusCode: 400, body: "missing url" };

    const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
    const html = await fetchUrl(url, agent);
    return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8" }, body: html };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: err.message };
  }
}

async function fetchUrl(url, agent) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { agent }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk.toString("utf8")));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}