// @ts-ignore - Remote module resolution is handled by Deno at runtime.
import { createClient } from "npm:@supabase/supabase-js@2";

const Deno = (globalThis as unknown as {
  Deno: {
    env: { get: (key: string) => string | undefined };
    serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  };
}).Deno;

const JSON_HEADERS = { "Content-Type": "application/json" };
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

type PriceSyncChange = {
  created_at: string;
  external_id: string | null;
  old_price: number | null;
  new_price: number;
  discount_percentage: number | null;
  is_on_sale: boolean | null;
  product?: { name: string | null; slug: string | null } | null;
};

const formatPrice = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const htmlEscape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;

const toBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

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

const getSinceIso = (payload: Record<string, any>) => {
  const now = new Date();
  const hours = Number(payload.sinceHours ?? payload.since_hours ?? 24);
  if (Number.isFinite(hours) && hours > 0) {
    return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
  }
  return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
};

const buildCsv = (changes: PriceSyncChange[]) => {
  const header = [
    "Produto",
    "MLB",
    "Antes",
    "Agora",
    "Diferença",
    "Desconto (%)",
    "Em promoção",
    "Quando",
  ].join(",");

  const rows = changes.map((change) => {
    const name = change.product?.name || "Produto";
    const diff =
      change.old_price !== null ? change.new_price - change.old_price : null;
    return [
      escapeCsv(name),
      escapeCsv(change.external_id ?? ""),
      escapeCsv(String(change.old_price ?? "")),
      escapeCsv(String(change.new_price ?? "")),
      escapeCsv(String(diff ?? "")),
      escapeCsv(String(change.discount_percentage ?? "")),
      escapeCsv(change.is_on_sale ? "Sim" : "Não"),
      escapeCsv(change.created_at),
    ].join(",");
  });

  return [header, ...rows].join("\n");
};

const buildHtml = (
  changes: PriceSyncChange[],
  sinceLabel: string,
  stats: { total: number; drops: number; increases: number; promos: number },
  siteUrl: string,
  logoUrl: string,
) => {
  const rows = changes
    .map((change) => {
      const name = change.product?.name || "Produto";
      const diff =
        change.old_price !== null ? change.new_price - change.old_price : null;
      const diffLabel =
        diff === null
          ? "-"
          : diff.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      return `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee;">${htmlEscape(name)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;">${change.external_id ?? "-"}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;">${formatPrice(change.old_price)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;">${formatPrice(change.new_price)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;">${diffLabel}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;">${change.is_on_sale ? "Sim" : "Não"}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;">${new Date(change.created_at).toLocaleString("pt-BR")}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div style="background:#0a0a0a;padding:24px;">
      <div style="max-width:720px;margin:0 auto;background:#111;border-radius:18px;overflow:hidden;border:1px solid #1f1f1f;">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#0f0f0f,#161616);border-bottom:1px solid #1f1f1f;">
          <div style="display:flex;align-items:center;gap:14px;">
            <img src="${logoUrl}" alt="ArsenalFit" width="56" height="56" style="display:block;border-radius:12px;" />
            <div>
              <p style="margin:0;color:#a3e635;font-size:12px;letter-spacing:0.24em;font-weight:700;">ARSENALFIT</p>
              <h2 style="margin:6px 0 0;color:#fff;font-size:22px;font-weight:800;">Relatório diário de preços</h2>
            </div>
          </div>
          <p style="margin:14px 0 0;color:#9ca3af;font-size:13px;">Período: ${sinceLabel}</p>
        </div>

        <div style="padding:20px 28px;background:#111;">
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <div style="background:#0b0b0b;border:1px solid #1f1f1f;border-radius:12px;padding:12px 16px;min-width:120px;">
              <p style="margin:0;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.2em;">Mudanças</p>
              <p style="margin:6px 0 0;color:#fff;font-size:18px;font-weight:800;">${stats.total}</p>
            </div>
            <div style="background:#0b0b0b;border:1px solid #1f1f1f;border-radius:12px;padding:12px 16px;min-width:120px;">
              <p style="margin:0;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.2em;">Quedas</p>
              <p style="margin:6px 0 0;color:#22c55e;font-size:18px;font-weight:800;">${stats.drops}</p>
            </div>
            <div style="background:#0b0b0b;border:1px solid #1f1f1f;border-radius:12px;padding:12px 16px;min-width:120px;">
              <p style="margin:0;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.2em;">Altas</p>
              <p style="margin:6px 0 0;color:#ef4444;font-size:18px;font-weight:800;">${stats.increases}</p>
            </div>
            <div style="background:#0b0b0b;border:1px solid #1f1f1f;border-radius:12px;padding:12px 16px;min-width:120px;">
              <p style="margin:0;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.2em;">Promoções</p>
              <p style="margin:6px 0 0;color:#a3e635;font-size:18px;font-weight:800;">${stats.promos}</p>
            </div>
          </div>

          <div style="margin-top:16px;">
            <a href="${siteUrl}/admin/price-sync" style="display:inline-block;background:#a3e635;color:#0b0b0b;text-decoration:none;font-weight:800;padding:10px 16px;border-radius:10px;font-size:12px;text-transform:uppercase;letter-spacing:0.2em;">
              Ver relatório no admin
            </a>
          </div>
        </div>

        <div style="padding:20px 28px;background:#fff;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb;">Produto</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb;">MLB</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb;">Antes</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb;">Agora</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb;">Diferença</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb;">Promoção</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb;">Quando</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="7" style="padding:12px;">Sem mudanças no período.</td></tr>`}
            </tbody>
          </table>
        </div>

        <div style="padding:16px 28px;background:#0f0f0f;color:#9ca3af;font-size:11px;">
          ArsenalFit — relatório automático do robô de preços.
        </div>
      </div>
    </div>
  `;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const CRON_SECRET = Deno.env.get("CRON_SECRET");
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

  const payload = await parseBody(req);
  const sinceIso = getSinceIso(payload);
  const sinceLabel = new Date(sinceIso).toLocaleString("pt-BR");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("price_sync_changes")
    .select(
      "created_at, external_id, old_price, new_price, discount_percentage, is_on_sale, product:products(name, slug)",
    )
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, ...JSON_HEADERS },
    });
  }

  const changes = (data as unknown as PriceSyncChange[]) || [];
  const drops = changes.filter((item) => item.old_price !== null && item.new_price < item.old_price);
  const increases = changes.filter((item) => item.old_price !== null && item.new_price > item.old_price);
  const promos = changes.filter((item) => item.is_on_sale);

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "ArsenalFit <no-reply@arsenalstore.org>";
  const REPORT_EMAILS =
    Deno.env.get("REPORT_EMAILS") ?? "powershop.bras@gmail.com";
  const REPORT_SITE_URL = Deno.env.get("REPORT_SITE_URL") ?? "https://www.arsenalstore.org";
  const REPORT_LOGO_URL =
    Deno.env.get("REPORT_LOGO_URL") ??
    "https://pixqurduxqfcujfadkbw.supabase.co/storage/v1/object/public/assets/Logo_LetraA_Transparente.png";
  const recipients = REPORT_EMAILS.split(",").map((mail) => mail.trim()).filter(Boolean);

  const stats = {
    total: changes.length,
    drops: drops.length,
    increases: increases.length,
    promos: promos.length,
  };

  const logReport = async (status: "sent" | "failed", error?: string | null) => {
    const { error: logError } = await supabase.from("price_sync_reports").insert({
      recipients,
      total: stats.total,
      drops: stats.drops,
      increases: stats.increases,
      promos: stats.promos,
      status,
      error: error ?? null,
    });
    if (logError) {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "price_sync_report_log_failed",
          error: logError.message,
        }),
      );
    }
  };

  if (!RESEND_API_KEY) {
    await logReport("failed", "missing_resend_api_key");
    return new Response(
      JSON.stringify({
        ok: false,
        error: "RESEND_API_KEY não configurado",
        stats,
      }),
      { status: 500, headers: { ...CORS_HEADERS, ...JSON_HEADERS } },
    );
  }

  const subject = `Relatório diário de preços (${new Date().toLocaleDateString("pt-BR")})`;
  const html = buildHtml(changes, sinceLabel, stats, REPORT_SITE_URL, REPORT_LOGO_URL);
  const csv = buildCsv(changes);
  const csvBase64 = toBase64(csv);

  const resendResp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: recipients,
      subject,
      html,
      text: `Relatório diário de preços (${new Date().toLocaleDateString("pt-BR")}). Mudanças: ${stats.total}. Quedas: ${stats.drops}. Altas: ${stats.increases}. Promoções: ${stats.promos}.`,
      attachments: [
        {
          filename: `relatorio-precos-${new Date().toISOString().slice(0, 10)}.csv`,
          content: csvBase64,
        },
      ],
    }),
  });

  if (!resendResp.ok) {
    const bodyText = await resendResp.text();
    await logReport("failed", bodyText.slice(0, 500));
    return new Response(
      JSON.stringify({ ok: false, error: "resend_failed", details: bodyText }),
      { status: 502, headers: { ...CORS_HEADERS, ...JSON_HEADERS } },
    );
  }

  await logReport("sent", null);
  return new Response(
    JSON.stringify({
      ok: true,
      recipients,
      stats,
    }),
    { status: 200, headers: { ...CORS_HEADERS, ...JSON_HEADERS } },
  );
});
