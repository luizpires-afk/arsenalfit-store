import {
  DEFAULT_ENV,
  getArg,
  parseEnvAndClient,
  writeJson,
} from "./_affiliate_catalog_common.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const envFile = getArg("--env", DEFAULT_ENV);
const outFile = getArg("--out-file", "reports/seo-release-scheduler-report.json");
const dlqOutFile = getArg("--dlq-out-file", "reports/seo-release-scheduler-dlq.json");
const dailyLimit = Math.max(1, Number(getArg("--limit", process.env.SEO_DAILY_RELEASE_LIMIT || "100")) || 100);
const minContentScore = Number(getArg("--min-content-score", process.env.SEO_MIN_CONTENT_SCORE || "0.5")) || 0.5;
const minQualityScore = Number(getArg("--min-quality-score", process.env.SEO_MIN_QUALITY_SCORE || "0")) || 0;
const maxDlqRatio = Math.max(0, Math.min(1, Number(getArg("--max-dlq-ratio", process.env.SEO_MAX_DLQ_RATIO || "0.25")) || 0.25));
const categoryGateRaw = getArg("--category-min-quality-map", process.env.SEO_CATEGORY_MIN_QUALITY_MAP || "{}");
const lockFile = path.resolve(process.cwd(), ".seo-release-scheduler.lock");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const toN = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toSlug = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

export const parseCategoryGate = (raw) => {
  try {
    const parsed = JSON.parse(String(raw || "{}"));
    if (!parsed || typeof parsed !== "object") return {};
    const out = {};
    for (const [key, value] of Object.entries(parsed)) {
      const normalizedKey = String(key || "").trim().toLowerCase();
      if (!normalizedKey) continue;
      out[normalizedKey] = toN(value, 0);
    }
    return out;
  } catch {
    return {};
  }
};

export const detectCategoryBucket = (row, map) => {
  const haystack = `${String(row?.keyword || "")} ${String(row?.title || "")}`.toLowerCase();
  for (const key of Object.keys(map || {})) {
    if (haystack.includes(key)) return key;
  }
  return "default";
};

const withLock = async (fn) => {
  if (fs.existsSync(lockFile)) {
    throw new Error("scheduler_locked: another release scheduler run is active");
  }
  fs.writeFileSync(lockFile, String(Date.now()), "utf8");
  try {
    return await fn();
  } finally {
    try {
      fs.unlinkSync(lockFile);
    } catch {
      // noop
    }
  }
};

const patchWithRetry = async (client, id, payload, maxAttempts = 3) => {
  let attempts = 0;
  let retried = 0;
  let lastError = null;

  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      await client.request(`/seo_pages?id=eq.${id}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload),
      });
      return { ok: true, attempts, retried };
    } catch (error) {
      lastError = error;
      if (attempts < maxAttempts) {
        retried += 1;
        await sleep(250 * 2 ** (attempts - 1));
      }
    }
  }

  return {
    ok: false,
    attempts,
    retried,
    error: String(lastError?.message || lastError || "patch_failed"),
  };
};

const main = async () => {
  return withLock(async () => {
    const { client } = parseEnvAndClient(envFile);
    const now = new Date();
    const nowIso = now.toISOString();
    const today = nowIso.slice(0, 10);
    const categoryGateMap = parseCategoryGate(categoryGateRaw);

    const [releasedToday, drafts] = await Promise.all([
      client.fetchPagedRows(
        `/seo_pages?select=id&release_batch_date=eq.${today}&release_status=eq.released&limit=5000`,
        1000,
      ),
      client.fetchPagedRows(
        "/seo_pages?select=id,slug,title,keyword,content_score,quality_score,created_at,release_status&release_status=eq.draft&order=created_at.asc&limit=5000",
        1000,
      ),
    ]);

    const remaining = Math.max(0, dailyLimit - (releasedToday?.length || 0));

    const activePages = await client.fetchPagedRows(
      "/seo_pages?select=id,slug,keyword,release_status&release_status=eq.released&limit=250000",
      1000,
    );

    const usedSlugs = new Set((activePages || []).map((row) => String(row?.slug || "").trim()).filter(Boolean));
    const usedKeywords = new Set((activePages || []).map((row) => String(row?.keyword || "").trim().toLowerCase()).filter(Boolean));

    const selected = [];
    const dlq = [];
    const metrics = {
      drafted: (drafts || []).length,
      queued: 0,
      published: 0,
      failed: 0,
      retried: 0,
      skipped_by_quality: 0,
      skipped_by_category_gate: 0,
      skipped_by_cannibalization: 0,
      fallback_slug_used: 0,
    };

    for (const row of drafts || []) {
      if (selected.length >= remaining) break;

      let slug = String(row?.slug || "").trim();
      const keyword = String(row?.keyword || "").trim().toLowerCase();
      const contentScore = toN(row?.content_score, 0);
      const qualityScore = toN(row?.quality_score, 0);

      if (!slug && (keyword || row?.title)) {
        const fallbackBase = toSlug(keyword || row?.title || "pagina-seo");
        if (fallbackBase) {
          slug = `${fallbackBase}-${String(row?.id || "tmp").slice(-8)}`;
          metrics.fallback_slug_used += 1;
        }
      }

      if (!slug || !keyword) {
        metrics.failed += 1;
        dlq.push({ id: row?.id, slug, keyword, reason: "missing_slug_or_keyword", created_at: nowIso });
        continue;
      }

      if (usedSlugs.has(slug) || usedKeywords.has(keyword)) {
        metrics.skipped_by_cannibalization += 1;
        dlq.push({ id: row?.id, slug, keyword, reason: "duplicate_slug_or_keyword", created_at: nowIso });
        continue;
      }

      if (contentScore < minContentScore || qualityScore < minQualityScore) {
        metrics.skipped_by_quality += 1;
        dlq.push({
          id: row?.id,
          slug,
          keyword,
          reason: "quality_gate_not_met",
          quality: { content_score: contentScore, quality_score: qualityScore },
          created_at: nowIso,
        });
        continue;
      }

      const bucket = detectCategoryBucket(row, categoryGateMap);
      const bucketMin = bucket === "default"
        ? minQualityScore
        : toN(categoryGateMap[bucket], minQualityScore);
      if (qualityScore < bucketMin) {
        metrics.skipped_by_category_gate += 1;
        dlq.push({
          id: row?.id,
          slug,
          keyword,
          reason: "category_quality_gate_not_met",
          quality: { quality_score: qualityScore, min_required: bucketMin, bucket },
          created_at: nowIso,
        });
        continue;
      }

      selected.push(row);
      usedSlugs.add(slug);
      usedKeywords.add(keyword);
    }

    metrics.queued = selected.length;

    const attempts = [];
    for (const row of selected) {
      const result = await patchWithRetry(client, row.id, {
        release_status: "released",
        released_at: nowIso,
        release_batch_date: today,
        is_active: true,
        updated_at: nowIso,
      });

      attempts.push({
        page_id: row.id,
        slug: row.slug,
        keyword: row.keyword,
        ok: result.ok,
        attempts: result.attempts,
        retried: result.retried,
        error: result.error || null,
      });

      metrics.retried += result.retried;
      if (result.ok) {
        metrics.published += 1;
      } else {
        metrics.failed += 1;
        dlq.push({
          id: row.id,
          slug: row.slug,
          keyword: row.keyword,
          reason: "publish_retry_exhausted",
          error: result.error || "unknown_error",
          attempts: result.attempts,
          created_at: nowIso,
        });
      }
    }

    const report = {
      generated_at: nowIso,
      ok: true,
      governance: {
        daily_limit: dailyLimit,
        min_content_score: minContentScore,
        min_quality_score: minQualityScore,
        max_dlq_ratio: maxDlqRatio,
        category_min_quality_map: categoryGateMap,
      },
      released_today_before_run: releasedToday?.length || 0,
      released_today_after_run: (releasedToday?.length || 0) + metrics.published,
      stages: metrics,
      attempts,
      dlq_count: dlq.length,
      risk: {
        dlq_ratio: Number((dlq.length / Math.max(1, metrics.drafted)).toFixed(4)),
        status: dlq.length / Math.max(1, metrics.drafted) > maxDlqRatio ? "warning" : "ok",
      },
    };

    writeJson(outFile, report);
    writeJson(dlqOutFile, {
      generated_at: nowIso,
      failed_items: dlq,
    });
    console.log(JSON.stringify(report, null, 2));
  });
};

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}
