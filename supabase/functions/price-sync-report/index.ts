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

const SAO_PAULO_UTC_OFFSET_HOURS = 3;
const MAX_EMAIL_RETRIES = 5;
const MIN_HISTORY_PROMO_PERCENT = 10;
const DEFAULT_PREVIOUS_PRICE_TTL_HOURS = 48;

type PriceSyncChange = {
  created_at: string;
  external_id: string | null;
  old_price: number | null;
  new_price: number;
  discount_percentage: number | null;
  is_on_sale: boolean | null;
  source: string | null;
  product?: {
    id?: string | null;
    name?: string | null;
    slug?: string | null;
    price?: number | null;
    pix_price?: number | null;
    pix_price_source?: string | null;
    original_price?: number | null;
    previous_price?: number | null;
    previous_price_source?: string | null;
    previous_price_expires_at?: string | null;
    last_price_source?: string | null;
    last_price_verified_at?: string | null;
    last_sync?: string | null;
    updated_at?: string | null;
    discount_percentage?: number | null;
  } | null;
};

type TopMovement = {
  product_id: string | null;
  product_name: string;
  external_id: string | null;
  old_price: number;
  new_price: number;
  delta_abs: number;
  delta_pct: number;
  source: string | null;
  promo_eligible: boolean;
};

const toFiniteNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const parseDateMs = (value: unknown) => {
  if (!value) return null;
  const ms = new Date(String(value)).getTime();
  return Number.isFinite(ms) ? ms : null;
};

const resolveHistoryPreviousPrice = (product: PriceSyncChange["product"], finalPrice: number) => {
  const previous = toFiniteNumber(product?.previous_price);
  if (!(previous !== null && previous > finalPrice)) return null;

  const source = String(product?.previous_price_source ?? "").trim().toLowerCase();
  if (source && source !== "history") return null;

  const discountPercent = ((previous - finalPrice) / previous) * 100;
  if (!(Number.isFinite(discountPercent) && discountPercent >= MIN_HISTORY_PROMO_PERCENT)) return null;

  const nowMs = Date.now();
  const expiresMs = parseDateMs(product?.previous_price_expires_at);
  if (expiresMs !== null) return expiresMs > nowMs ? previous : null;

  const refMs =
    parseDateMs(product?.last_price_verified_at) ??
    parseDateMs(product?.last_sync) ??
    parseDateMs(product?.updated_at);

  if (refMs === null) return previous;
  return nowMs - refMs <= DEFAULT_PREVIOUS_PRICE_TTL_HOURS * 60 * 60 * 1000 ? previous : null;
};

const resolvePromoEligibility = (product: PriceSyncChange["product"]) => {
  const current = toFiniteNumber(product?.price);
  if (!(current !== null && current > 0)) return { eligible: false, discountPercent: null };

  const pix = toFiniteNumber(product?.pix_price);
  const pixSource = String(product?.pix_price_source ?? "").trim().toLowerCase();
  const hasTrustedPix = pix !== null && pix > 0 && pix < current && (pixSource === "api" || pixSource === "manual");
  const finalPrice = hasTrustedPix ? pix : current;

  const original = toFiniteNumber(product?.original_price);
  const lastPriceSource = String(product?.last_price_source ?? "").trim().toLowerCase();
  const sourceTrusted = !lastPriceSource || ["auth", "public", "manual", "api"].includes(lastPriceSource);
  const listFromSource = sourceTrusted && original !== null && original > finalPrice ? original : null;
  const listFromHistory = lastPriceSource === "scraper" ? null : resolveHistoryPreviousPrice(product, finalPrice);
  const listPrice = listFromSource ?? listFromHistory;

  if (!(listPrice !== null && listPrice > finalPrice)) return { eligible: false, discountPercent: null };
  const discountPercent = Math.round(((listPrice - finalPrice) / listPrice) * 100);
  return {
    eligible: Number.isFinite(discountPercent) && discountPercent > 0,
    discountPercent: Number.isFinite(discountPercent) ? discountPercent : null,
  };
};

const parseBody = async (req: Request) => {
  try {
    if (!req.body) return {} as Record<string, unknown>;
    const text = await req.text();
    if (!text) return {} as Record<string, unknown>;
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
};

const normalizeDateString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
};

const toSaoPauloDate = (date = new Date()) => {
  const shifted = new Date(date.getTime() - SAO_PAULO_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
};

const buildWindow = (payload: Record<string, unknown>) => {
  const explicitDate =
    normalizeDateString(payload.report_date) ||
    normalizeDateString(payload.reportDate) ||
    normalizeDateString(payload.date);

  if (explicitDate) {
    const sinceIso = `${explicitDate}T03:00:00.000Z`;
    const untilIso = new Date(new Date(sinceIso).getTime() + 24 * 60 * 60 * 1000).toISOString();
    return { reportDate: explicitDate, sinceIso, untilIso };
  }

  const now = new Date();
  const sinceHoursRaw = Number(payload.sinceHours ?? payload.since_hours ?? 24);
  const sinceHours = Number.isFinite(sinceHoursRaw) && sinceHoursRaw > 0 ? sinceHoursRaw : 24;
  const sinceIso = new Date(now.getTime() - sinceHours * 60 * 60 * 1000).toISOString();
  return {
    reportDate: toSaoPauloDate(now),
    sinceIso,
    untilIso: now.toISOString(),
  };
};

const formatPrice = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const htmlEscape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const buildSummaryHtml = (
  reportDate: string,
  stats: { total: number; drops: number; increases: number; promos: number },
  health: {
    suspectCount: number;
    apiMissingCount: number;
    scrapeFailedCount: number;
    checksExecuted: number;
    backoffCount: number;
    errorRate: number;
  },
  topDrops: TopMovement[],
  topIncreases: TopMovement[],
  siteUrl: string,
) => {
  const topDropRows = topDrops
    .slice(0, 8)
    .map(
      (item) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${htmlEscape(item.product_name)}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${formatPrice(item.old_price)}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${formatPrice(item.new_price)}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#16a34a;">-${item.delta_pct.toFixed(1)}%</td></tr>`,
    )
    .join("");

  const topIncreaseRows = topIncreases
    .slice(0, 8)
    .map(
      (item) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${htmlEscape(item.product_name)}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${formatPrice(item.old_price)}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${formatPrice(item.new_price)}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#dc2626;">+${item.delta_pct.toFixed(1)}%</td></tr>`,
    )
    .join("");

  return `
    <div style="background:#0a0a0a;padding:20px;">
      <div style="max-width:760px;margin:0 auto;background:#111;border-radius:16px;overflow:hidden;border:1px solid #262626;">
        <div style="padding:20px 24px;border-bottom:1px solid #262626;">
          <p style="margin:0;color:#a3e635;font-size:11px;letter-spacing:0.22em;font-weight:700;">ARSENALFIT</p>
          <h2 style="margin:8px 0 0;color:#fff;font-size:22px;">Relatorio diario de precos - ${reportDate}</h2>
          <p style="margin:10px 0 0;color:#9ca3af;font-size:12px;">Resumo automatico das ultimas verificacoes.</p>
        </div>

        <div style="padding:16px 24px;background:#111;display:flex;flex-wrap:wrap;gap:10px;">
          <div style="background:#0b0b0b;border:1px solid #262626;border-radius:10px;padding:10px 12px;min-width:120px;"><div style="color:#9ca3af;font-size:10px;text-transform:uppercase;">Mudancas</div><div style="color:#fff;font-size:20px;font-weight:700;">${stats.total}</div></div>
          <div style="background:#0b0b0b;border:1px solid #262626;border-radius:10px;padding:10px 12px;min-width:120px;"><div style="color:#9ca3af;font-size:10px;text-transform:uppercase;">Quedas</div><div style="color:#22c55e;font-size:20px;font-weight:700;">${stats.drops}</div></div>
          <div style="background:#0b0b0b;border:1px solid #262626;border-radius:10px;padding:10px 12px;min-width:120px;"><div style="color:#9ca3af;font-size:10px;text-transform:uppercase;">Altas</div><div style="color:#ef4444;font-size:20px;font-weight:700;">${stats.increases}</div></div>
          <div style="background:#0b0b0b;border:1px solid #262626;border-radius:10px;padding:10px 12px;min-width:120px;"><div style="color:#9ca3af;font-size:10px;text-transform:uppercase;">Promocoes</div><div style="color:#a3e635;font-size:20px;font-weight:700;">${stats.promos}</div></div>
        </div>

        <div style="padding:16px 24px;background:#fff;">
          <p style="margin:0 0 8px;font-weight:700;color:#111827;">Saude do monitoramento</p>
          <p style="margin:0;color:#4b5563;font-size:12px;">Checks: ${health.checksExecuted} | Backoff: ${health.backoffCount} | Erro: ${health.errorRate.toFixed(1)}%</p>
          <p style="margin:6px 0 0;color:#4b5563;font-size:12px;">Suspeitos: ${health.suspectCount} | API missing: ${health.apiMissingCount} | Scrape failed: ${health.scrapeFailedCount}</p>
          <p style="margin:10px 0 0;"><a href="${siteUrl}/admin/price-sync" style="display:inline-block;background:#a3e635;color:#111827;text-decoration:none;font-weight:700;padding:8px 12px;border-radius:8px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">Abrir no Admin</a></p>
        </div>

        <div style="padding:16px 24px;background:#fff;border-top:1px solid #e5e7eb;">
          <h3 style="margin:0 0 8px;font-size:14px;color:#111827;">Top quedas</h3>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">${topDropRows || '<tr><td style="padding:6px 8px;color:#6b7280;">Sem quedas relevantes.</td></tr>'}</table>
        </div>

        <div style="padding:16px 24px;background:#fff;border-top:1px solid #e5e7eb;">
          <h3 style="margin:0 0 8px;font-size:14px;color:#111827;">Top altas</h3>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">${topIncreaseRows || '<tr><td style="padding:6px 8px;color:#6b7280;">Sem altas relevantes.</td></tr>'}</table>
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
  const mode = String(payload.mode ?? payload.action ?? "generate_daily").toLowerCase();
  const source = String(payload.source ?? "price_sync_report");
  const maxRetriesRaw = Number(payload.max_retries ?? payload.maxRetries ?? 3);
  const maxRetries = Math.min(MAX_EMAIL_RETRIES, Math.max(1, Math.floor(maxRetriesRaw || 3)));
  const window = buildWindow(payload);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("price_sync_changes")
    .select(
      "created_at, external_id, old_price, new_price, discount_percentage, is_on_sale, source, product:products(id, name, slug, price, pix_price, pix_price_source, original_price, previous_price, previous_price_source, previous_price_expires_at, last_price_source, last_price_verified_at, last_sync, updated_at, discount_percentage)",
    )
    .gte("created_at", window.sinceIso)
    .lt("created_at", window.untilIso)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, ...JSON_HEADERS },
    });
  }

  const changes = (data as unknown as PriceSyncChange[]) || [];

  const movementRows: TopMovement[] = changes
    .filter((item) => typeof item.old_price === "number" && item.old_price > 0)
    .map((item) => {
      const oldPrice = Number(item.old_price ?? 0);
      const newPrice = Number(item.new_price ?? 0);
      const deltaAbs = newPrice - oldPrice;
      const deltaPct = oldPrice > 0 ? (Math.abs(deltaAbs) / oldPrice) * 100 : 0;
      const promoQuality = resolvePromoEligibility(item.product ?? null);
      return {
        product_id: item.product?.id ?? null,
        product_name: item.product?.name ?? "Produto",
        external_id: item.external_id ?? null,
        old_price: oldPrice,
        new_price: newPrice,
        delta_abs: deltaAbs,
        delta_pct: deltaPct,
        source: item.source ?? null,
        promo_eligible: promoQuality.eligible,
      };
    });

  const topDrops = movementRows
    .filter((item) => item.new_price < item.old_price)
    .sort((a, b) => b.delta_pct - a.delta_pct)
    .slice(0, 10);

  const topIncreases = movementRows
    .filter((item) => item.new_price > item.old_price)
    .sort((a, b) => b.delta_pct - a.delta_pct)
    .slice(0, 10);

  const newPromotions = movementRows
    .filter((item) => item.new_price < item.old_price && item.promo_eligible)
    .sort((a, b) => b.delta_pct - a.delta_pct)
    .slice(0, 10);

  const rawPromoCandidates = movementRows.filter((item) => item.new_price < item.old_price).length;
  const promoRejectedByQuality = Math.max(0, rawPromoCandidates - newPromotions.length);
  const minQualifiedPromotions = Math.max(
    1,
    Math.floor(Number(Deno.env.get("PRICE_REPORT_MIN_QUALIFIED_PROMOTIONS") ?? "5")),
  );
  const promotionQualityPass = newPromotions.length >= minQualifiedPromotions;

  const [suspectCountRes, apiMissingRes, scrapeFailedRes, checksRes, backoffRes] = await Promise.all([
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("data_health_status", "SUSPECT_PRICE"),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("data_health_status", "API_MISSING"),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("data_health_status", "SCRAPE_FAILED"),
    supabase
      .from("price_check_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", window.sinceIso)
      .lt("created_at", window.untilIso),
    supabase
      .from("price_check_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", window.sinceIso)
      .lt("created_at", window.untilIso)
      .in("event_status", ["backoff", "error"]),
  ]);

  const checksExecuted = Number(checksRes.count ?? 0);
  const backoffCount = Number(backoffRes.count ?? 0);
  const errorRate = checksExecuted > 0 ? (backoffCount / checksExecuted) * 100 : 0;

  const stats = {
    total: changes.length,
    drops: changes.filter((item) => item.old_price !== null && item.new_price < item.old_price).length,
    increases: changes.filter((item) => item.old_price !== null && item.new_price > item.old_price).length,
    promos: newPromotions.length,
  };

  const summary = {
    generated_at: new Date().toISOString(),
    mode,
    window: {
      report_date: window.reportDate,
      since_at: window.sinceIso,
      until_at: window.untilIso,
    },
    top_drops: topDrops,
    top_increases: topIncreases,
    new_promotions: newPromotions,
    health: {
      suspect_count: Number(suspectCountRes.count ?? 0),
      api_missing_count: Number(apiMissingRes.count ?? 0),
      scrape_failed_count: Number(scrapeFailedRes.count ?? 0),
      checks_executed: checksExecuted,
      backoff_count: backoffCount,
      error_rate: errorRate,
    },
    promotion_quality: {
      candidates: rawPromoCandidates,
      approved: newPromotions.length,
      rejected: promoRejectedByQuality,
      min_required: minQualifiedPromotions,
      pass: promotionQualityPass,
    },
  };

  let priceAuditSummary: {
    ok: boolean;
    processed: number;
    opened: number;
    critical: number;
    error: string | null;
  } = {
    ok: false,
    processed: 0,
    opened: 0,
    critical: 0,
    error: null,
  };
  let mismatchAutoFixSummary: {
    ok: boolean;
    processed: number;
    resolved: number;
    reactivated: number;
    skipped: number;
    error: string | null;
  } = {
    ok: false,
    processed: 0,
    resolved: 0,
    reactivated: 0,
    skipped: 0,
    error: null,
  };
  const autoFixMismatchEnabled =
    (Deno.env.get("PRICE_MISMATCH_AUTO_FIX_ENABLED") ?? "true").toLowerCase() !== "false";
  const autoFixMismatchLimit = Math.max(
    1,
    Math.floor(Number(Deno.env.get("PRICE_MISMATCH_AUTO_FIX_LIMIT") ?? "50")),
  );
  try {
    const { data: auditData, error: auditError } = await supabase.rpc("run_price_mismatch_audit", {
      p_lookback_hours: 24,
      p_warn_pct: 25,
      p_warn_abs: 20,
      p_critical_pct: 50,
      p_critical_abs: 30,
      p_apply_critical_policy: true,
    });
    if (auditError) throw auditError;
    priceAuditSummary = {
      ok: Boolean((auditData as any)?.ok ?? true),
      processed: Number((auditData as any)?.processed ?? 0),
      opened: Number((auditData as any)?.opened ?? 0),
      critical: Number((auditData as any)?.critical ?? 0),
      error: null,
    };
  } catch (auditErr: any) {
    priceAuditSummary = {
      ok: false,
      processed: 0,
      opened: 0,
      critical: 0,
      error: auditErr?.message || "price_audit_failed",
    };
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "price_audit_daily_failed",
        error: priceAuditSummary.error,
        report_date: window.reportDate,
      }),
    );
  }

  if (autoFixMismatchEnabled) {
    try {
      const { data: autoFixData, error: autoFixError } = await supabase.rpc(
        "auto_fix_open_price_mismatch_cases",
        {
          p_limit: autoFixMismatchLimit,
          p_source_only_item: true,
        },
      );
      if (autoFixError) throw autoFixError;
      mismatchAutoFixSummary = {
        ok: Boolean((autoFixData as any)?.ok ?? true),
        processed: Number((autoFixData as any)?.processed ?? 0),
        resolved: Number((autoFixData as any)?.resolved ?? 0),
        reactivated: Number((autoFixData as any)?.reactivated ?? 0),
        skipped: Number((autoFixData as any)?.skipped ?? 0),
        error: null,
      };
    } catch (autoFixErr: any) {
      mismatchAutoFixSummary = {
        ok: false,
        processed: 0,
        resolved: 0,
        reactivated: 0,
        skipped: 0,
        error: autoFixErr?.message || "price_mismatch_auto_fix_failed",
      };
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "price_mismatch_auto_fix_failed",
          error: mismatchAutoFixSummary.error,
          report_date: window.reportDate,
        }),
      );
    }
  } else {
    mismatchAutoFixSummary = {
      ok: true,
      processed: 0,
      resolved: 0,
      reactivated: 0,
      skipped: 0,
      error: "auto_fix_disabled",
    };
  }

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "ArsenalFit <no-reply@arsenalstore.org>";
  const REPORT_EMAILS = Deno.env.get("REPORT_EMAILS") ?? "powershop.bras@gmail.com";
  const REPORT_SITE_URL = Deno.env.get("REPORT_SITE_URL") ?? "https://www.arsenalstore.org";
  const recipients = REPORT_EMAILS.split(",").map((mail) => mail.trim()).filter(Boolean);
  let lastDailyRunReportError: string | null = null;

  const persistReport = async (params: {
    deliveryStatus: "pending" | "sent" | "failed" | "retrying";
    attempts: number;
    errorText?: string | null;
  }) => {
    const row = {
      report_date: window.reportDate,
      since_at: window.sinceIso,
      until_at: window.untilIso,
      recipients,
      total: stats.total,
      drops: stats.drops,
      increases: stats.increases,
      promos: stats.promos,
      status: params.deliveryStatus === "sent" ? "sent" : "failed",
      delivery_status: params.deliveryStatus,
      delivery_attempts: Math.max(1, params.attempts),
      error: params.errorText ?? null,
      last_error: params.errorText ?? null,
      summary,
      source,
      sent_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from("price_sync_reports")
      .upsert(row, { onConflict: "report_date" });

    if (upsertError) {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "price_sync_report_upsert_failed",
          error: upsertError.message,
          report_date: window.reportDate,
        }),
      );
    }

    if (params.deliveryStatus === "retrying") return;

    const checklistItems = [
      {
        key: "report_generated",
        label: "Relatorio diario gerado",
        pass: true,
        critical: true,
        detail: {
          report_date: window.reportDate,
          total_changes: stats.total,
        },
      },
      {
        key: "email_delivery",
        label: "Entrega de e-mail",
        pass: params.deliveryStatus === "sent",
        critical: true,
        detail: {
          delivery_status: params.deliveryStatus,
          attempts: Math.max(1, params.attempts),
          last_error: params.errorText ?? null,
          source_trigger: source,
          mode,
        },
      },
      {
        key: "price_audit_daily",
        label: "Auditoria diaria de preco",
        pass: priceAuditSummary.ok,
        critical: false,
        detail: priceAuditSummary,
      },
      {
        key: "price_audit_auto_fix",
        label: "Auto correcao de divergencias",
        pass: mismatchAutoFixSummary.ok,
        critical: false,
        detail: mismatchAutoFixSummary,
      },
      {
        key: "promotion_quality_gate",
        label: "Gate de qualidade de promocao",
        pass: promotionQualityPass,
        critical: true,
        detail: summary.promotion_quality,
      },
    ];

    const criticalFailures = checklistItems.filter((item) => item.critical && !item.pass).length;
    const dailyRunRow = {
      run_id: null,
      source: "price_sync_report",
      report_date: window.reportDate,
      overall_status: criticalFailures > 0 ? "FAIL" : "PASS",
      critical_failures: criticalFailures,
      checklist: {
        generated_at: new Date().toISOString(),
        report_date: window.reportDate,
        mode,
        source_trigger: source,
        summary_stats: stats,
        health: summary.health,
        price_audit: priceAuditSummary,
        price_audit_auto_fix: mismatchAutoFixSummary,
        items: checklistItems,
      },
    };

    const { error: dailyReportError } = await supabase.from("daily_run_reports").insert(dailyRunRow);
    if (dailyReportError) {
      lastDailyRunReportError = dailyReportError.message;
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "daily_run_report_insert_failed_price_sync_report",
          error: dailyReportError.message,
          report_date: window.reportDate,
          source,
          mode,
        }),
      );
    } else {
      lastDailyRunReportError = null;
    }
  };

  if (!RESEND_API_KEY) {
    await persistReport({
      deliveryStatus: "failed",
      attempts: 1,
      errorText: "missing_resend_api_key",
    });

    return new Response(
      JSON.stringify({ ok: false, error: "missing_resend_api_key", report_date: window.reportDate, stats }),
      { status: 500, headers: { ...CORS_HEADERS, ...JSON_HEADERS } },
    );
  }

  const promotionGateWarning = !promotionQualityPass
    ? `promotion_quality_gate_failed:${newPromotions.length}/${minQualifiedPromotions}`
    : null;

  const subjectPrefix = mode === "resend" ? "[Reenvio]" : "";
  const subject = `${subjectPrefix} Relatorio diario de precos (${window.reportDate})`.trim();
  const html = buildSummaryHtml(
    window.reportDate,
    stats,
    {
      suspectCount: Number(suspectCountRes.count ?? 0),
      apiMissingCount: Number(apiMissingRes.count ?? 0),
      scrapeFailedCount: Number(scrapeFailedRes.count ?? 0),
      checksExecuted,
      backoffCount,
      errorRate,
    },
    topDrops,
    topIncreases,
    REPORT_SITE_URL,
  );

  let deliveryStatus: "sent" | "failed" = "failed";
  let attempts = 0;
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    attempts = attempt;
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
        text: `Relatorio diario de precos ${window.reportDate}. Mudancas: ${stats.total}. Quedas: ${stats.drops}. Altas: ${stats.increases}. Promocoes: ${stats.promos}.`,
      }),
    });

    if (resendResp.ok) {
      deliveryStatus = "sent";
      lastError = null;
      break;
    }

    const bodyText = await resendResp.text();
    lastError = bodyText.slice(0, 800);

    if (attempt < maxRetries) {
      await persistReport({
        deliveryStatus: "retrying",
        attempts: attempt,
        errorText: lastError,
      });
      await sleep(Math.min(4000, attempt * 800));
    }
  }

  await persistReport({
    deliveryStatus,
    attempts,
    errorText: lastError ?? promotionGateWarning,
  });

  const responseBody = {
    ok: deliveryStatus === "sent",
    mode,
    report_date: window.reportDate,
    warning: promotionGateWarning,
    since_at: window.sinceIso,
    until_at: window.untilIso,
    recipients,
    stats,
    summary,
    attempts,
    delivery_status: deliveryStatus,
    error: lastError,
    daily_run_report_error: lastDailyRunReportError,
  };

  if (deliveryStatus !== "sent") {
    return new Response(JSON.stringify(responseBody), {
      status: 502,
      headers: { ...CORS_HEADERS, ...JSON_HEADERS },
    });
  }

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { ...CORS_HEADERS, ...JSON_HEADERS },
  });
});
