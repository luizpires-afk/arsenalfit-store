import { createClient } from "@supabase/supabase-js";

const toBoolean = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
};

const htmlResponse = (statusCode, title, message) => ({
  statusCode,
  headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  },
  body: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:Arial,sans-serif;background:#0f1118;color:#f5f6f7;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:20px"><div style="max-width:520px;background:#171a22;border:1px solid #2b3040;border-radius:12px;padding:24px"><h1 style="margin:0 0 12px;font-size:20px">${title}</h1><p style="margin:0 0 16px;line-height:1.5;color:#cfd5e1">${message}</p><a href="/" style="display:inline-block;padding:10px 14px;background:#9be21a;color:#101217;text-decoration:none;border-radius:10px;font-weight:700">Voltar para a loja</a></div></body></html>`,
});

export const handler = async (event) => {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return htmlResponse(500, "Erro de configuracao", "Parametros internos ausentes.");
  }

  const productId =
    event.queryStringParameters?.id ||
    event.path?.split("/")?.pop() ||
    null;

  if (!productId) {
    return htmlResponse(400, "Oferta invalida", "Produto nao informado.");
  }

  const source = String(event.queryStringParameters?.src || "offer_click");
  const allowStandbyRedirect = toBoolean(
    process.env.ALLOW_REDIRECT_WHILE_STANDBY ||
      process.env.VITE_ALLOW_REDIRECT_WHILE_STANDBY,
    false,
  );

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const metadata = {
    user_agent: event.headers["user-agent"] || null,
    referer: event.headers.referer || null,
    ip: event.headers["x-forwarded-for"] || null,
    runtime: "netlify_function",
  };

  const { data, error } = await supabase.rpc("resolve_product_offer_url", {
    p_product_id: productId,
    p_allow_redirect_while_standby: allowStandbyRedirect,
    p_click_source: source,
    p_metadata: metadata,
  });

  if (error) {
    return htmlResponse(500, "Falha ao abrir oferta", error.message || "Erro interno.");
  }

  const payload = Array.isArray(data) ? data[0] : data;
  const destination = payload?.url;
  const canRedirect = Boolean(payload?.can_redirect && destination);

  if (!canRedirect) {
    const reason = String(payload?.reason || "indisponivel");
    if (reason === "awaiting_affiliate_validation") {
      return htmlResponse(404, "Aguardando validacao", "Este produto ainda aguarda validacao do link de afiliado.");
    }
    if (reason === "blocked_by_policy") {
      return htmlResponse(404, "Oferta bloqueada", "Este anuncio foi bloqueado e nao pode ser exibido no momento.");
    }
    return htmlResponse(404, "Oferta indisponivel", "Nao foi possivel resolver um destino valido para este produto.");
  }

  try {
    await supabase.rpc("enqueue_price_check_refresh", {
      p_product_id: productId,
      p_force: false,
      p_reason: source,
    });
  } catch {
    // non-blocking
  }

  return {
    statusCode: 302,
    headers: {
      Location: destination,
      "Cache-Control": "no-store",
    },
    body: "",
  };
};
