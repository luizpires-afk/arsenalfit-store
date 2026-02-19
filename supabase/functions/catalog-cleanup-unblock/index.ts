// @ts-ignore - Remote module resolution is handled by Deno at runtime.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  classifyHealthStatus,
  normalizeMlExternalId,
  pickCanonicalProduct,
  resolveDuplicateKey,
  resolveProductIdentifiers,
  shouldReactivateProduct,
} from "./cleanup_policy.js";

const Deno = (globalThis as unknown as {
  Deno: {
    env: { get: (key: string) => string | undefined };
    serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  };
}).Deno;

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const toBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
};

const toPositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
};

const chunkArray = <T>(items: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
};

const parseBody = async (req: Request) => {
  try {
    const text = await req.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    return {};
  }
};

type ProductRow = {
  id: string;
  name: string | null;
  category_id: string | null;
  marketplace: string | null;
  external_id: string | null;
  source_url: string | null;
  affiliate_link: string | null;
  affiliate_verified: boolean | null;
  affiliate_generated_at: string | null;
  validated_at: string | null;
  validated_by: string | null;
  affiliate_url_used: string | null;
  status: string | null;
  is_active: boolean | null;
  is_featured: boolean | null;
  description_manual_override: boolean | null;
  auto_disabled_reason: string | null;
  auto_disabled_at: string | null;
  price: number | null;
  pix_price: number | null;
  original_price: number | null;
  image_url: string | null;
  images: string[] | null;
  description: string | null;
  short_description: string | null;
  specifications: Record<string, unknown> | null;
  clicks_count: number | null;
  created_at: string | null;
  updated_at: string | null;
  last_sync: string | null;
  last_price_verified_at: string | null;
  next_check_at: string | null;
  data_health_status?: string | null;
  deactivation_reason?: string | null;
  last_health_check_at?: string | null;
};

type PriceCheckStateRow = {
  product_id: string;
  fail_count: number | null;
  last_error_code: string | null;
  suspect_price: number | null;
  suspect_reason: string | null;
  last_checked_at: string | null;
};

type AnomalyRow = {
  product_id: string;
  note: string | null;
  detected_at: string;
};

type MonitorRow = {
  product_id: string;
};

type CleanupAction = {
  product_id: string;
  external_id: string | null;
  action:
    | "reactivate"
    | "merge_duplicate"
    | "invalidate_source"
    | "mark_api_missing"
    | "mark_scrape_failed"
    | "mark_suspect_price"
    | "clear_blocked_reason"
    | "health_refresh";
  reason: string | null;
  before_status: string | null;
  before_is_active: boolean | null;
  after_status: string | null;
  after_is_active: boolean | null;
  updates: Record<string, unknown>;
};

const fetchAllMlProducts = async (supabase: ReturnType<typeof createClient>) => {
  const pageSize = 1000;
  let offset = 0;
  const out: ProductRow[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, name, category_id, marketplace, external_id, source_url, affiliate_link, affiliate_verified, affiliate_generated_at, validated_at, validated_by, affiliate_url_used, status, is_active, is_featured, description_manual_override, auto_disabled_reason, auto_disabled_at, price, pix_price, original_price, image_url, images, description, short_description, specifications, clicks_count, created_at, updated_at, last_sync, last_price_verified_at, next_check_at, data_health_status, deactivation_reason, last_health_check_at",
      )
      .eq("marketplace", "mercadolivre")
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);
    const chunk = (data as ProductRow[] | null) ?? [];
    out.push(...chunk);
    if (chunk.length < pageSize) break;
    offset += pageSize;
  }
  return out;
};

const fetchPriceStateMap = async (
  supabase: ReturnType<typeof createClient>,
  productIds: string[],
) => {
  const out = new Map<string, PriceCheckStateRow>();
  for (const chunk of chunkArray(productIds, 500)) {
    const { data, error } = await supabase
      .from("price_check_state")
      .select("product_id, fail_count, last_error_code, suspect_price, suspect_reason, last_checked_at")
      .in("product_id", chunk);
    if (error) throw new Error(error.message);
    for (const row of ((data as PriceCheckStateRow[] | null) ?? [])) {
      out.set(row.product_id, row);
    }
  }
  return out;
};

const fetchLatestAnomalyNoteMap = async (
  supabase: ReturnType<typeof createClient>,
  productIds: string[],
) => {
  const out = new Map<string, string>();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  for (const chunk of chunkArray(productIds, 500)) {
    const { data, error } = await supabase
      .from("price_sync_anomalies")
      .select("product_id, note, detected_at")
      .in("product_id", chunk)
      .gte("detected_at", since)
      .order("detected_at", { ascending: false })
      .limit(3000);
    if (error) throw new Error(error.message);
    for (const row of ((data as AnomalyRow[] | null) ?? [])) {
      if (!out.has(row.product_id)) {
        out.set(row.product_id, String(row.note ?? ""));
      }
    }
  }
  return out;
};

const fetchMonitorCounts = async (
  supabase: ReturnType<typeof createClient>,
  productIds: string[],
) => {
  const out = new Map<string, number>();
  for (const chunk of chunkArray(productIds, 500)) {
    const { data, error } = await supabase
      .from("monitored_items")
      .select("product_id")
      .eq("is_enabled", true)
      .in("product_id", chunk);
    if (error) throw new Error(error.message);
    for (const row of ((data as MonitorRow[] | null) ?? [])) {
      out.set(row.product_id, (out.get(row.product_id) ?? 0) + 1);
    }
  }
  return out;
};

const normalizeStatus = (value: string | null | undefined) => String(value ?? "").trim().toLowerCase();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: JSON_HEADERS });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cronSecret = Deno.env.get("CRON_SECRET") ?? Deno.env.get("X_CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "Missing Supabase env vars" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
  if (!cronSecret) {
    return new Response(JSON.stringify({ ok: false, error: "CRON_SECRET missing" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
  if (providedSecret !== cronSecret) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  const payload = await parseBody(req);
  const dryRun = (payload as any)?.apply === true
    ? false
    : toBoolean((payload as any)?.dry_run ?? (payload as any)?.dryRun, true);
  const maxFailuresBeforeApiMissing = toPositiveInt(
    (payload as any)?.max_failures_before_api_missing ??
      (payload as any)?.maxFailuresBeforeApiMissing ??
      3,
    3,
  );
  const source = typeof (payload as any)?.source === "string"
    ? String((payload as any).source)
    : "catalog_cleanup_and_unblock";

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const nowIso = new Date().toISOString();
  const recheckAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const products = await fetchAllMlProducts(supabase);
    const productIds = products.map((item) => item.id);
    const [priceStateMap, anomalyMap, monitorCountMap] = await Promise.all([
      fetchPriceStateMap(supabase, productIds),
      fetchLatestAnomalyNoteMap(supabase, productIds),
      fetchMonitorCounts(supabase, productIds),
    ]);

    const duplicateGroups = new Map<string, ProductRow[]>();
    for (const product of products) {
      const key = resolveDuplicateKey(product);
      if (!key) continue;
      if (!duplicateGroups.has(key)) duplicateGroups.set(key, []);
      duplicateGroups.get(key)?.push(product);
    }

    const canonicalIdByGroup = new Map<string, string>();
    const duplicateIds = new Set<string>();
    for (const [key, group] of duplicateGroups.entries()) {
      if (group.length <= 1) continue;
      const canonical = pickCanonicalProduct(group, monitorCountMap);
      if (!canonical) continue;
      canonicalIdByGroup.set(key, canonical.id);
      for (const item of group) {
        if (item.id !== canonical.id) duplicateIds.add(item.id);
      }
    }

    const diagnostics = {
      total_products: products.length,
      standby_count: products.filter((item) => normalizeStatus(item.status) === "standby").length,
      blocked_count: products.filter((item) => String(item.auto_disabled_reason ?? "").toLowerCase() === "blocked")
        .length,
      ok_but_inactive_count: products.filter((item) =>
        item.is_active === false &&
        Boolean(item.last_sync) &&
        String(item.auto_disabled_reason ?? "").toLowerCase() !== "blocked"
      ).length,
      duplicate_group_count: Array.from(duplicateGroups.values()).filter((group) => group.length > 1).length,
      duplicate_items_count: duplicateIds.size,
    };

    const actions: CleanupAction[] = [];

    for (const product of products) {
      const ids = resolveProductIdentifiers(product);
      const duplicateKey = resolveDuplicateKey(product);
      const canonicalId = duplicateKey ? canonicalIdByGroup.get(duplicateKey) ?? null : null;
      const isDuplicate = duplicateIds.has(product.id);

      const health = classifyHealthStatus({
        product,
        identifiers: ids,
        isDuplicate,
        priceCheckState: priceStateMap.get(product.id) ?? null,
        latestAnomalyNote: anomalyMap.get(product.id) ?? null,
        maxFailuresBeforeApiMissing,
      });

      const updates: Record<string, unknown> = {
        data_health_status: health.status,
        last_health_check_at: nowIso,
      };

      let action: CleanupAction["action"] = "health_refresh";
      let reason: string | null = health.reason ?? null;
      let nextStatus = product.status;
      let nextIsActive = product.is_active;

      if (isDuplicate) {
        action = "merge_duplicate";
        reason = canonicalId ? `duplicate_of:${canonicalId}` : "duplicate_non_canonical";
        updates.is_active = false;
        updates.status = "standby";
        updates.deactivation_reason = reason;
        nextStatus = "standby";
        nextIsActive = false;
      } else if (health.status === "INVALID_SOURCE") {
        action = "invalidate_source";
        updates.is_active = false;
        updates.status = "standby";
        updates.deactivation_reason = health.reason ?? "invalid_source";
        nextStatus = "standby";
        nextIsActive = false;
      } else if (health.status === "API_MISSING") {
        action = "mark_api_missing";
        updates.is_active = false;
        updates.status = "standby";
        updates.deactivation_reason = health.reason ?? "api_missing";
        updates.next_check_at = recheckAt;
        nextStatus = "standby";
        nextIsActive = false;
      } else if (health.status === "SCRAPE_FAILED") {
        action = "mark_scrape_failed";
        updates.is_active = false;
        updates.status = "standby";
        updates.deactivation_reason = health.reason ?? "scrape_failed";
        updates.next_check_at = recheckAt;
        nextStatus = "standby";
        nextIsActive = false;
      } else if (health.status === "SUSPECT_PRICE") {
        action = "mark_suspect_price";
        updates.deactivation_reason = health.reason ?? "suspect_price";
        updates.next_check_at = recheckAt;
      } else {
        updates.deactivation_reason = null;
      }

      const shouldReactivate = shouldReactivateProduct({
        product,
        healthStatus: health.status,
        isDuplicate,
      });

      if (shouldReactivate) {
        action = "reactivate";
        reason = "recovered_valid_product";
        updates.is_active = true;
        updates.status = "active";
        updates.auto_disabled_reason = null;
        updates.auto_disabled_at = null;
        updates.deactivation_reason = null;
        updates.next_check_at = nowIso;
        nextStatus = "active";
        nextIsActive = true;
      } else if (
        !["INVALID_SOURCE", "DUPLICATE", "API_MISSING", "SCRAPE_FAILED"].includes(health.status) &&
        String(product.auto_disabled_reason ?? "").toLowerCase() === "blocked"
      ) {
        action = "clear_blocked_reason";
        reason = "blocked_reason_cleared";
        updates.auto_disabled_reason = null;
        updates.auto_disabled_at = null;
      }

      const hasMaterialChange =
        String(product.data_health_status ?? "") !== String(updates.data_health_status ?? "") ||
        String(product.deactivation_reason ?? "") !== String(updates.deactivation_reason ?? "") ||
        String(product.auto_disabled_reason ?? "") !== String(updates.auto_disabled_reason ?? product.auto_disabled_reason ?? "") ||
        (updates.is_active !== undefined && updates.is_active !== product.is_active) ||
        (updates.status !== undefined && updates.status !== product.status) ||
        action !== "health_refresh";

      if (!hasMaterialChange) {
        continue;
      }

      actions.push({
        product_id: product.id,
        external_id: normalizeMlExternalId(product.external_id),
        action,
        reason,
        before_status: product.status,
        before_is_active: product.is_active,
        after_status: nextStatus,
        after_is_active: nextIsActive,
        updates,
      });
    }

    const report = {
      run_id: runId,
      dry_run: dryRun,
      source,
      diagnostics,
      reactivated_count: actions.filter((item) => item.action === "reactivate").length,
      merged_duplicates_count: actions.filter((item) => item.action === "merge_duplicate").length,
      invalidated_count: actions.filter((item) => item.action === "invalidate_source").length,
      api_missing_count: actions.filter((item) => item.action === "mark_api_missing").length,
      scrape_failed_count: actions.filter((item) => item.action === "mark_scrape_failed").length,
      suspect_price_count: actions.filter((item) => item.action === "mark_suspect_price").length,
      clear_blocked_count: actions.filter((item) => item.action === "clear_blocked_reason").length,
      total_actions: actions.length,
    };

    const persistRun = async (status: string, finishedAt: string, errorText: string | null = null) => {
      try {
        await supabase.from("catalog_cleanup_runs").insert({
          id: runId,
          source,
          dry_run: dryRun,
          status,
          started_at: startedAt,
          finished_at: finishedAt,
          report,
          error: errorText,
        });
      } catch {
        // non-blocking
      }
    };

    if (!dryRun) {
      for (const chunk of chunkArray(actions, 100)) {
        for (const action of chunk) {
          const { error } = await supabase
            .from("products")
            .update(action.updates)
            .eq("id", action.product_id);
          if (error) throw new Error(error.message);
        }
      }

      if (actions.length) {
        try {
          for (const chunk of chunkArray(actions, 200)) {
            const rows = chunk.map((action) => ({
              run_id: runId,
              product_id: action.product_id,
              external_id: action.external_id,
              action: action.action,
              reason: action.reason,
              before_status: action.before_status,
              before_is_active: action.before_is_active,
              after_status: action.after_status,
              after_is_active: action.after_is_active,
              metadata: action.updates,
              created_at: nowIso,
            }));
            const { error } = await supabase.from("catalog_cleanup_actions").insert(rows);
            if (error) throw error;
          }
        } catch {
          // non-blocking
        }
      }

      if (actions.some((item) => item.action === "reactivate" || item.action === "mark_suspect_price")) {
        try {
          await supabase.rpc("enqueue_price_sync", {
            p_payload: {
              source: "catalog_cleanup_and_unblock",
              force: false,
            },
          });
        } catch {
          // non-blocking
        }
      }
    }

    await persistRun("success", new Date().toISOString(), null);

    return new Response(
      JSON.stringify({
        ok: true,
        ...report,
        sample_actions: actions.slice(0, 120),
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  } catch (error) {
    const message = (error as Error)?.message ?? String(error);
    try {
      await supabase.from("catalog_cleanup_runs").insert({
        id: runId,
        source,
        dry_run: dryRun,
        status: "failed",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        report: null,
        error: message,
      });
    } catch {
      // non-blocking
    }

    return new Response(
      JSON.stringify({
        ok: false,
        run_id: runId,
        error: message,
      }),
      { status: 500, headers: JSON_HEADERS },
    );
  }
});
