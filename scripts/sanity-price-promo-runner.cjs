const fs = require("fs");
const path = require("path");
const {
  readRunnerEnv,
  createSupabaseRestClient,
} = require("./_supabase_runner_utils.cjs");

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
};
const hasArg = (name) => args.includes(name);

const envFile = getArg("--env", "supabase/functions/.env.scheduler");
const outJsonPath = getArg("--out-json", ".tmp-sanity-price-promo.json");
const applyStandby = hasArg("--apply-standby");
const maxFix = Math.max(1, Number(getArg("--max-fix", "100")) || 100);
const liveCheck = hasArg("--live-check");
const liveCheckLimit = Math.max(1, Number(getArg("--live-check-limit", "40")) || 40);
const liveHighRatio = Math.max(1, Number(getArg("--live-high-ratio", "1.8")) || 1.8);
const liveLowRatio = Math.max(0.1, Number(getArg("--live-low-ratio", "0.45")) || 0.45);

const normalizeText = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const TOKEN_ALIASES = new Map([
  ["capsulas", "caps"],
  ["capsula", "caps"],
  ["supplement", "supp"],
  ["supplements", "supp"],
  ["suplemento", "supp"],
  ["suplementos", "supp"],
]);

const STOP_WORDS = new Set([
  "de",
  "do",
  "da",
  "e",
  "em",
  "com",
  "para",
  "nova",
  "novo",
  "formula",
  "rende",
  "meses",
]);

const NON_FITNESS_TERMS = [
  "stanley",
  "garrafa termica",
  "copo termico",
  "quick flip",
  "chimarrao",
  "erva mate",
  "cafeteira",
  "coador",
];

const buildFamilyKey = (name) => {
  const normalized = normalizeText(name);
  if (!normalized) return null;
  const tokens = normalized
    .split(" ")
    .map((token) => TOKEN_ALIASES.get(token) || token)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
  if (tokens.length < 3) return null;
  return tokens.slice(0, 8).join(" ");
};

const toNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const calcDiscountPct = (price, original) => {
  if (!(Number.isFinite(price) && Number.isFinite(original))) return null;
  if (!(original > 0 && price > 0 && original > price)) return null;
  return Math.round(((original - price) / original) * 100);
};

const extractLiveSourcePrice = async (urlValue) => {
  if (!urlValue) return null;
  try {
    const response = await fetch(String(urlValue), {
      headers: { "user-agent": "Mozilla/5.0" },
    });
    if (!response.ok) return null;
    const html = await response.text();
    const matches = [...html.matchAll(/"price"\s*:\s*([0-9]+(?:\.[0-9]+)?)/g)]
      .map((m) => Number(m[1]))
      .filter((n) => Number.isFinite(n) && n > 0)
      .slice(0, 12);
    if (!matches.length) return null;
    return Math.min(...matches);
  } catch {
    return null;
  }
};

const analyzeProduct = (product) => {
  const normalizedName = normalizeText(product.name);
  const price = toNumber(product.price);
  const original = toNumber(product.original_price);
  const declaredDiscount = toNumber(product.discount_percentage) ?? 0;
  const promoFlag = product.is_on_sale === true || declaredDiscount > 0;

  const issues = [];

  if (promoFlag) {
    if (!(original && price && original > price)) {
      issues.push("promo_without_valid_original_price");
    }

    if (original && price && original > price * 4) {
      issues.push("promo_excessive_original_ratio");
    }

    const calculatedDiscount = calcDiscountPct(price, original);
    if (
      calculatedDiscount !== null &&
      declaredDiscount > 0 &&
      Math.abs(calculatedDiscount - declaredDiscount) > 8
    ) {
      issues.push("promo_declared_discount_mismatch");
    }
  }

  if (!promoFlag && original && price && original > price) {
    issues.push("missing_promo_flag_with_price_drop");
  }

  const livePrice = toNumber(product.live_source_price);
  if (livePrice && price) {
    if (price > livePrice * liveHighRatio) {
      issues.push("live_price_divergence_high");
    }
    if (price < livePrice * liveLowRatio) {
      issues.push("live_price_divergence_low");
    }
  }

  if (NON_FITNESS_TERMS.some((term) => normalizedName.includes(term))) {
    issues.push("non_fitness_accessory_term");
  }

  return {
    id: product.id,
    name: product.name,
    ml_item_id: product.ml_item_id,
    price,
    original_price: original,
    discount_percentage: declaredDiscount,
    is_on_sale: product.is_on_sale === true,
    last_price_source: product.last_price_source,
    family_key: buildFamilyKey(product.name),
    updated_at: product.updated_at,
    status: product.status,
    is_active: product.is_active,
    issues,
    hard_issues: issues.filter((issue) =>
      [
        "promo_without_valid_original_price",
        "promo_excessive_original_ratio",
        "promo_declared_discount_mismatch",
        "non_fitness_accessory_term",
        "live_price_divergence_high",
        "live_price_divergence_low",
      ].includes(issue),
    ),
    soft_issues: issues.filter((issue) => issue === "missing_promo_flag_with_price_drop"),
    issue_count: issues.length,
  };
};

const chooseFamilyWinner = (items) => {
  if (!items.length) return null;
  const ranked = [...items].sort((a, b) => {
    const aHard = a.hard_issues.length > 0 ? 1 : 0;
    const bHard = b.hard_issues.length > 0 ? 1 : 0;
    if (aHard !== bHard) return aHard - bHard;

    const aPromo = a.is_on_sale && a.original_price && a.price && a.original_price > a.price ? 1 : 0;
    const bPromo = b.is_on_sale && b.original_price && b.price && b.original_price > b.price ? 1 : 0;
    if (aPromo !== bPromo) return bPromo - aPromo;

    const aPrice = Number.isFinite(a.price) ? a.price : Number.MAX_SAFE_INTEGER;
    const bPrice = Number.isFinite(b.price) ? b.price : Number.MAX_SAFE_INTEGER;
    if (aPrice !== bPrice) return aPrice - bPrice;

    const aUpdated = new Date(a.updated_at || 0).getTime();
    const bUpdated = new Date(b.updated_at || 0).getTime();
    return bUpdated - aUpdated;
  });
  return ranked[0];
};

const main = async () => {
  const env = readRunnerEnv(envFile);
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/SERVICE_ROLE_KEY ausentes no ambiente");
  }

  const client = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });

  const select = [
    "id",
    "name",
    "ml_item_id",
    "price",
    "original_price",
    "discount_percentage",
    "is_on_sale",
    "last_price_source",
    "last_price_verified_at",
    "is_active",
    "status",
    "data_health_status",
    "updated_at",
    "is_blocked",
    "auto_disabled_reason",
    "source_url",
    "marketplace",
  ].join(",");

  const rows = await client.fetchPagedRows(
    `/products?select=${encodeURIComponent(select)}&is_active=eq.true&status=eq.active&data_health_status=eq.HEALTHY&is_blocked=eq.false&order=updated_at.desc`,
    1000,
  );

  let liveCheckedCount = 0;
  if (liveCheck) {
    for (const row of rows) {
      if (liveCheckedCount >= liveCheckLimit) break;
      const sourceKind = String(row.last_price_source || "").toLowerCase();
      const marketplace = normalizeText(row.marketplace || "");
      if (!(sourceKind === "scraper" || sourceKind === "catalog")) continue;
      if (!marketplace.includes("mercado")) continue;
      if (!String(row.source_url || "").startsWith("http")) continue;

      const livePrice = await extractLiveSourcePrice(row.source_url);
      if (!livePrice) continue;
      row.live_source_price = livePrice;
      liveCheckedCount += 1;
    }
  }

  const analyzed = rows.map(analyzeProduct);

  const byFamily = new Map();
  for (const item of analyzed) {
    if (!item.family_key) continue;
    const list = byFamily.get(item.family_key) || [];
    list.push(item);
    byFamily.set(item.family_key, list);
  }

  for (const [, list] of byFamily.entries()) {
    if (list.length <= 1) continue;
    const winner = chooseFamilyWinner(list);
    if (!winner) continue;
    for (const item of list) {
      if (item.id === winner.id) continue;
      item.issues.push("duplicate_family_active");
      item.hard_issues.push("duplicate_family_active");
      item.issue_count = item.issues.length;
    }
  }

  const flagged = analyzed.filter((item) => item.issue_count > 0);
  const hardFlagged = flagged.filter((item) => item.hard_issues.length > 0);
  const softFlagged = flagged.filter(
    (item) => item.hard_issues.length === 0 && item.soft_issues.length > 0,
  );

  let applied = [];
  if (applyStandby && hardFlagged.length > 0) {
    for (const item of hardFlagged.slice(0, maxFix)) {
      try {
        const patch = {
          is_active: false,
          status: "standby",
          is_on_sale: false,
          discount_percentage: 0,
          deactivation_reason: "promo_sanity_failed",
          data_health_status: "NEEDS_REVIEW",
        };
        await client.patch(`/products?id=eq.${item.id}`, patch);
        applied.push({ id: item.id, name: item.name, action: "standby" });
      } catch (error) {
        applied.push({
          id: item.id,
          name: item.name,
          action: "error",
          message: error?.message || String(error),
        });
      }
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    total_active_checked: rows.length,
    total_flagged: flagged.length,
    total_hard_flagged: hardFlagged.length,
    total_soft_flagged: softFlagged.length,
    live_check_enabled: liveCheck,
    live_checked_count: liveCheckedCount,
    apply_standby: applyStandby,
    applied_count: applied.filter((x) => x.action === "standby").length,
    sample_hard_flagged: hardFlagged.slice(0, 25),
    sample_soft_flagged: softFlagged.slice(0, 25),
    applied,
  };

  const absOut = path.resolve(outJsonPath);
  fs.writeFileSync(absOut, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nJSON: ${absOut}`);
};

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
