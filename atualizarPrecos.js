import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { mercadolivreProvider } from "./src/providers/marketplaces/mercadolivreProvider.js";
import { processProduct } from "./src/lib/priceUpdater.js";
import { hoursFromNow, randomInt, sleep } from "./src/lib/priceSync.js";
import { createPriceSyncLock } from "./src/lib/priceSyncLock.js";

const LOG_BASE = {
  service: "price-updater",
  env: process.env.NODE_ENV || "development",
};

const log = (payload) => {
  const entry = {
    timestamp: new Date().toISOString(),
    ...LOG_BASE,
    ...payload,
  };
  console.log(JSON.stringify(entry));
};

// Token bucket simples (rate limit global)
const createTokenBucket = ({ ratePerMinute, capacity }) => {
  const ratePerMs = ratePerMinute / 60000;
  let tokens = capacity;
  let lastRefill = Date.now();

  const refill = () => {
    const now = Date.now();
    const elapsed = now - lastRefill;
    if (elapsed > 0) {
      tokens = Math.min(capacity, tokens + elapsed * ratePerMs);
      lastRefill = now;
    }
  };

  const consume = async (count = 1) => {
    let waitedMs = 0;
    while (true) {
      refill();
      if (tokens >= count) {
        tokens -= count;
        return waitedMs;
      }
      const needed = count - tokens;
      const waitFor = Math.ceil(needed / ratePerMs);
      waitedMs += waitFor;
      await sleep(waitFor);
    }
  };

  return { consume };
};

// Carrega .env quando o ambiente ainda não estiver configurado (útil em cron/local).
const loadDotEnvIfNeeded = () => {
  if (process.env.SUPABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalIndex = trimmed.indexOf("=");
    if (equalIndex === -1) continue;
    const key = trimmed.slice(0, equalIndex).trim();
    const rawValue = trimmed.slice(equalIndex + 1).trim();
    if (!key || process.env[key]) continue;
    const value = rawValue.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
    process.env[key] = value;
  }
};

loadDotEnvIfNeeded();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const MELI_ACCESS_TOKEN = process.env.MELI_ACCESS_TOKEN || process.env.MERCADOLIVRE_ACCESS_TOKEN || null;
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 8000);
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 200);
const LOCK_TTL_SECONDS = Number(process.env.LOCK_TTL_SECONDS || 6 * 60 * 60);
const LOCK_KEY = process.env.LOCK_KEY || "price_sync_runner";
const RATE_LIMIT_RPM = Number(process.env.RATE_LIMIT_RPM || 60);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  log({
    level: "error",
    message: "missing_env",
    detail: "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente",
  });
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const providers = new Map([["mercadolivre", mercadolivreProvider]]);
const rateLimiter = createTokenBucket({
  ratePerMinute: RATE_LIMIT_RPM,
  capacity: Math.max(1, RATE_LIMIT_RPM),
});

// Busca apenas produtos elegíveis (next_check_at <= agora e status != paused).
const fetchEligibleProducts = async () => {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, marketplace, external_id, price, original_price, etag, status, last_sync, next_check_at"
    )
    .neq("status", "paused")
    .lte("next_check_at", nowIso)
    .order("next_check_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) throw error;
  return data || [];
};

const updateProduct = async (id, update) => {
  const { error } = await supabase
    .from("products")
    .update(update)
    .eq("id", id);
  if (error) throw error;
};

const main = async () => {
  const runId = randomUUID();
  const startedAt = new Date();
  const stats = {
    run_id: runId,
    started_at: startedAt.toISOString(),
    finished_at: null,
    total_produtos: 0,
    total_verificados: 0,
    total_skipped: 0,
    total_200: 0,
    total_304: 0,
    total_403: 0,
    total_429: 0,
    total_404: 0,
    total_timeout: 0,
    total_erros_desconhecidos: 0,
  };

  const lock = createPriceSyncLock(supabase, { lockKey: LOCK_KEY, ttlSeconds: LOCK_TTL_SECONDS });
  let lockAcquired = false;

  try {
    lockAcquired = await lock.acquire(runId);
  } catch (error) {
    log({
      level: "error",
      message: "lock_acquire_failed",
      run_id: runId,
      error: error?.message || String(error),
    });
    return;
  }

  if (!lockAcquired) {
    log({
      level: "info",
      message: "runner already running",
      run_id: runId,
    });
    return;
  }

  log({ level: "info", message: "run_start", run_id: runId, started_at: stats.started_at });

  try {
    const products = await fetchEligibleProducts();
    stats.total_produtos = products.length;
    log({ level: "info", message: "eligible_products", count: products.length, run_id: runId });

    // Processa sequencialmente para respeitar o rate-limit e o delay entre produtos.
    for (const product of products) {
      const now = new Date();
      const nextCheck = product?.next_check_at ? new Date(product.next_check_at) : null;

      // Garantia extra: nunca chamar API antes do horário permitido.
      if (nextCheck && now < nextCheck) {
        stats.total_skipped += 1;
        log({
          level: "info",
          message: "skip_not_due",
          item_id: product.external_id,
          marketplace: product.marketplace,
          next_check: nextCheck.toISOString(),
          run_id: runId,
        });
        continue;
      }

      const provider = providers.get(String(product.marketplace || "").toLowerCase()) || null;

      try {
        const waitedMs = await rateLimiter.consume(1);
        if (waitedMs > 0) {
          log({
            level: "info",
            message: "rate_limited",
            wait_ms: waitedMs,
            run_id: runId,
          });
        }

        const { result } = await processProduct({
          product,
          provider,
          now,
          accessToken: MELI_ACCESS_TOKEN,
          timeoutMs: FETCH_TIMEOUT_MS,
          onUpdate: updateProduct,
          log: (payload) => log({ ...payload, run_id: runId }),
        });

        stats.total_verificados += 1;

        if (result?.statusCode === 200) stats.total_200 += 1;
        else if (result?.statusCode === 304) stats.total_304 += 1;
        else if (result?.statusCode === 403) stats.total_403 += 1;
        else if (result?.statusCode === 429) stats.total_429 += 1;
        else if (result?.statusCode === 404) stats.total_404 += 1;

        if (result?.isTimeout) stats.total_timeout += 1;
        if (!result?.statusCode && !result?.isTimeout) stats.total_erros_desconhecidos += 1;
      } catch (error) {
        // Falha inesperada: tenta agendar backoff para garantir next_check_at.
        const fallbackUpdate = {
          last_sync: now.toISOString(),
          next_check_at: hoursFromNow(now, 12),
        };

        try {
          await updateProduct(product.id, fallbackUpdate);
        } catch (updateErr) {
          log({
            level: "error",
            message: "update_failed",
            item_id: product.external_id,
            marketplace: product.marketplace,
            error: updateErr?.message || String(updateErr),
          });
        }

        log({
          level: "error",
          message: "process_failed",
          item_id: product.external_id,
          marketplace: product.marketplace,
          error: error?.message || String(error),
          run_id: runId,
        });

        stats.total_verificados += 1;
        stats.total_erros_desconhecidos += 1;
      }

      const delayMs = randomInt(300, 500);
      await sleep(delayMs);
    }

    const finishedAt = new Date();
    stats.finished_at = finishedAt.toISOString();

    log({
      level: "info",
      message: "run_complete",
      run_id: runId,
      started_at: stats.started_at,
      finished_at: stats.finished_at,
      total_produtos: stats.total_produtos,
      total_verificados: stats.total_verificados,
      total_skipped: stats.total_skipped,
      total_200: stats.total_200,
      total_304: stats.total_304,
      total_403: stats.total_403,
      total_429: stats.total_429,
      total_404: stats.total_404,
      total_timeout: stats.total_timeout,
      total_erros_desconhecidos: stats.total_erros_desconhecidos,
    });

    try {
      await supabase.from("price_sync_runs").insert({
        id: runId,
        started_at: stats.started_at,
        finished_at: stats.finished_at,
        stats_json: stats,
      });
    } catch (error) {
      log({
        level: "warn",
        message: "run_persist_failed",
        run_id: runId,
        error: error?.message || String(error),
      });
    }
  } finally {
    try {
      await lock.release(runId);
    } catch (error) {
      log({
        level: "warn",
        message: "lock_release_failed",
        run_id: runId,
        error: error?.message || String(error),
      });
    }
  }
};

main().catch((error) => {
  log({
    level: "error",
    message: "run_failed",
    error: error?.message || String(error),
  });
  process.exit(1);
});
