// @ts-ignore - Remote module resolution is handled by Deno at runtime.
import { createClient } from "npm:@supabase/supabase-js@2";

const Deno = (globalThis as unknown as {
  Deno: {
    env: { get: (key: string) => string | undefined };
    serve: (handler: (req: Request) => Response | Promise<Response>) => void;
    readTextFile: (path: URL | string) => Promise<string>;
  };
}).Deno;

const JSON_HEADERS = { "Content-Type": "application/json" };
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const formatPrice = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const htmlEscape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const parseBody = async (req: Request) => {
  try {
    if (!req.body) return {};
    const text = await req.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    return {};
  }
};

const loadTemplate = async () => {
  const url = new URL("./arsenalfit-price-drop.html", import.meta.url);
  return await Deno.readTextFile(url);
};

type MonitoredRow = {
  id: string;
  user_id: string;
  user_email: string | null;
  product_id: string;
  baseline_price: number | null;
  last_notified_price: number | null;
  last_notified_at: string | null;
  is_enabled: boolean;
  product?: {
    name: string | null;
    slug: string | null;
    price: number | null;
    image_url: string | null;
    affiliate_link: string | null;
  } | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? Deno.env.get("X_CRON_SECRET");
  if (CRON_SECRET) {
    const headerSecret = req.headers.get("x-cron-secret");
    if (!headerSecret || headerSecret !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, ...JSON_HEADERS },
      });
    }
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "missing_supabase_env" }), {
      status: 500,
      headers: { ...CORS_HEADERS, ...JSON_HEADERS },
    });
  }

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "ArsenalFit <no-reply@arsenalstore.org>";
  const RESEND_REPLY_TO =
    Deno.env.get("RESEND_REPLY_TO") ??
    Deno.env.get("EMAIL_REPLY_TO") ??
    "powershop.bras@gmail.com";
  const SITE_URL =
    Deno.env.get("SITE_URL") ??
    Deno.env.get("REPORT_SITE_URL") ??
    "https://www.arsenalstore.org";
  const LOGO_URL =
    Deno.env.get("EMAIL_LOGO_URL") ??
    Deno.env.get("REPORT_LOGO_URL") ??
    "https://pixqurduxqfcujfadkbw.supabase.co/storage/v1/object/public/assets/Logo_LetraA_Transparente.png";
  const MIN_DROP = Number(Deno.env.get("MIN_PRICE_DROP") ?? "1");
  const MIN_HOURS = Number(Deno.env.get("MIN_ALERT_INTERVAL_HOURS") ?? "24");

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "missing_resend_api_key" }), {
      status: 500,
      headers: { ...CORS_HEADERS, ...JSON_HEADERS },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const ensureCronSecret = async () => {
    if (!CRON_SECRET) return;
    try {
      await supabase.rpc("set_cron_secret", {
        p_key: "price-drop-alerts",
        p_value: CRON_SECRET,
      });
      await supabase.rpc("set_cron_secret", {
        p_key: "price-sync",
        p_value: CRON_SECRET,
      });
    } catch {
      // If RPC isn't available yet, don't block email sending.
    }
  };

  await ensureCronSecret();

  const payload = await parseBody(req);
  const testEmail = payload?.email ?? payload?.testEmail ?? payload?.userEmail ?? null;
  const testProductId = payload?.productId ?? payload?.product_id ?? null;
  const testMode = Boolean(payload?.test || payload?.forceSend || testEmail);

  const { data, error } = await supabase
    .from("monitored_items")
    .select(
      "id, user_id, user_email, product_id, baseline_price, last_notified_price, last_notified_at, is_enabled, product:products(name, slug, price, image_url, affiliate_link)"
    )
    .eq("is_enabled", true);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, ...JSON_HEADERS },
    });
  }

  const template = await loadTemplate();
  const now = new Date();
  let sent = 0;

  if (testMode && testEmail) {
    let product = null as MonitoredRow["product"] | null;
    if (testProductId) {
      const { data: exact } = await supabase
        .from("products")
        .select("name, slug, price, image_url, affiliate_link")
        .eq("id", testProductId)
        .maybeSingle();
      if (exact) {
        product = exact as MonitoredRow["product"];
      } else if (String(testProductId).length < 36) {
        const { data: prefix } = await supabase
          .from("products")
          .select("name, slug, price, image_url, affiliate_link")
          .ilike("id", `${testProductId}%`)
          .limit(1)
          .maybeSingle();
        if (prefix) product = prefix as MonitoredRow["product"];
      }
    }

    const currentPrice =
      Number(payload?.currentPrice) ||
      Number(payload?.price) ||
      (product?.price ?? 99);
    const baselinePrice =
      Number(payload?.baselinePrice) ||
      Number(payload?.previousPrice) ||
      currentPrice + 10;
    const dropValue = baselinePrice - currentPrice;
    const savingsLabel = formatPrice(dropValue);
    const percent =
      baselinePrice > 0 ? Math.round((dropValue / baselinePrice) * 100) : null;
    const productName = product?.name ?? "Produto ArsenalFit";
    const productLink =
      product?.affiliate_link ||
      (product?.slug ? `${SITE_URL}/produto/${product?.slug}` : SITE_URL);

    const preheader = `Economia de ${savingsLabel} - veja o valor atual e aproveite a oferta.`;
    const html = template
      .replace(/{{preheader}}/g, htmlEscape(preheader))
      .replace(/{{logo_url}}/g, LOGO_URL)
      .replace(/{{product_name}}/g, htmlEscape(productName))
      .replace(/{{product_image}}/g, product?.image_url ?? "")
      .replace(/{{current_price}}/g, formatPrice(currentPrice))
      .replace(/{{baseline_price}}/g, formatPrice(baselinePrice))
      .replace(/{{savings_amount}}/g, savingsLabel)
      .replace(/{{savings_percent}}/g, percent ? `${percent}%` : "")
      .replace(/{{cta_url}}/g, productLink)
      .replace(/{{site_url}}/g, SITE_URL)
      .replace(/{{year}}/g, String(new Date().getFullYear()));

    const subject = `Baixou! Seu produto no ArsenalFit est\u00e1 mais barato (-${savingsLabel})`;

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [testEmail],
        reply_to: RESEND_REPLY_TO,
        subject,
        html,
        text: `Pre\u00e7o caiu! ${productName} agora est\u00e1 por ${formatPrice(currentPrice)}. Economia de ${savingsLabel}.`,
      }),
    });

    if (!resendResp.ok) {
      const bodyText = await resendResp.text();
      return new Response(
        JSON.stringify({ ok: false, error: "resend_failed", details: bodyText }),
        { status: 502, headers: { ...CORS_HEADERS, ...JSON_HEADERS } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, sent: 1, mode: "test", email: testEmail }),
      { status: 200, headers: { ...CORS_HEADERS, ...JSON_HEADERS } }
    );
  }

  for (const row of (data as MonitoredRow[]) || []) {
    if (!row.product || row.product.price === null || row.product.price === undefined) continue;
    const currentPrice = Number(row.product.price);
    const baselinePrice = row.last_notified_price ?? row.baseline_price ?? currentPrice;
    const dropValue = baselinePrice - currentPrice;

    if (dropValue < MIN_DROP) continue;

    if (row.last_notified_at) {
      const last = new Date(row.last_notified_at);
      const hours = (now.getTime() - last.getTime()) / (1000 * 60 * 60);
      if (hours < MIN_HOURS) continue;
    }

    const recipient = row.user_email;
    if (!recipient) continue;

    const savingsLabel = formatPrice(dropValue);
    const percent =
      baselinePrice > 0 ? Math.round((dropValue / baselinePrice) * 100) : null;
    const productName = row.product.name ?? "Produto ArsenalFit";
    const productLink =
      row.product.affiliate_link ||
      (row.product.slug ? `${SITE_URL}/produto/${row.product.slug}` : SITE_URL);

    const preheader = `Economia de ${savingsLabel} - veja o valor atual e aproveite a oferta.`;
    const html = template
      .replace(/{{preheader}}/g, htmlEscape(preheader))
      .replace(/{{logo_url}}/g, LOGO_URL)
      .replace(/{{product_name}}/g, htmlEscape(productName))
      .replace(/{{product_image}}/g, row.product.image_url ?? "")
      .replace(/{{current_price}}/g, formatPrice(currentPrice))
      .replace(/{{baseline_price}}/g, formatPrice(baselinePrice))
      .replace(/{{savings_amount}}/g, savingsLabel)
      .replace(/{{savings_percent}}/g, percent ? `${percent}%` : "")
      .replace(/{{cta_url}}/g, productLink)
      .replace(/{{site_url}}/g, SITE_URL)
      .replace(/{{year}}/g, String(new Date().getFullYear()));

    const subject = `Baixou! Seu produto no ArsenalFit est\u00e1 mais barato (-${savingsLabel})`;

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [recipient],
        reply_to: RESEND_REPLY_TO,
        subject,
        html,
        text: `Pre\u00e7o caiu! ${productName} agora est\u00e1 por ${formatPrice(currentPrice)}. Economia de ${savingsLabel}.`,
      }),
    });

    if (!resendResp.ok) {
      continue;
    }

    sent += 1;
    await supabase
      .from("monitored_items")
      .update({
        last_notified_price: currentPrice,
        last_notified_at: now.toISOString(),
      })
      .eq("id", row.id);

    await supabase.from("price_alerts").insert({
      user_id: row.user_id,
      product_id: row.product_id,
      old_price: baselinePrice,
      new_price: currentPrice,
    });
  }

  return new Response(JSON.stringify({ ok: true, sent }), {
    status: 200,
    headers: { ...CORS_HEADERS, ...JSON_HEADERS },
  });
});

