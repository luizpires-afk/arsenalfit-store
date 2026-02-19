const toNonNegativeInt = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return Math.max(0, Math.floor(fallback));
  return Math.max(0, Math.floor(parsed));
};

export const resolveDailyQuotaRange = (value, fallbackMin, fallbackMax) => {
  if (typeof value === "number" || typeof value === "string") {
    const exact = toNonNegativeInt(value, fallbackMax);
    return { min: exact, max: exact };
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const row = value;
    const min = toNonNegativeInt(row.min, fallbackMin);
    const max = toNonNegativeInt(row.max, fallbackMax);
    return { min: Math.min(min, max), max: Math.max(min, max) };
  }

  const min = toNonNegativeInt(fallbackMin, 0);
  const max = Math.max(min, toNonNegativeInt(fallbackMax, min));
  return { min, max };
};

export const resolveDailyQuotaValue = (range, seed) => {
  const min = toNonNegativeInt(range?.min, 0);
  const max = Math.max(min, toNonNegativeInt(range?.max, min));
  if (max === min) return min;
  const span = max - min + 1;
  return min + (Math.abs(Math.floor(Number(seed) || 0)) % span);
};

export const dedupeCandidatesByExternalId = (candidates) => {
  const out = [];
  const seen = new Set();
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const key = String(candidate?.externalId ?? candidate?.external_id ?? "").trim().toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
};

export const applyBrandDailyLimit = (candidates, options = {}) => {
  const maxPerBrand = Math.max(1, Math.floor(Number(options.maxPerBrand ?? 2) || 2));
  const minTarget = Math.max(0, Math.floor(Number(options.minTarget ?? 0) || 0));
  const initialUsage = options.initialUsage instanceof Map ? options.initialUsage : new Map();

  const selected = [];
  const rejected = [];
  const runtimeUsage = new Map();

  const getUsage = (brandKey) =>
    (initialUsage.get(brandKey) ?? 0) + (runtimeUsage.get(brandKey) ?? 0);

  const bumpUsage = (brandKey) =>
    runtimeUsage.set(brandKey, (runtimeUsage.get(brandKey) ?? 0) + 1);

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const brandKey = String(candidate?.brandKey ?? "").trim().toLowerCase();
    if (!brandKey) {
      selected.push(candidate);
      continue;
    }

    const usage = getUsage(brandKey);
    if (usage < maxPerBrand) {
      selected.push(candidate);
      bumpUsage(brandKey);
      continue;
    }

    // Fallback: allow overflow while still below minimum daily target.
    if (selected.length < minTarget) {
      selected.push(candidate);
      bumpUsage(brandKey);
      continue;
    }

    rejected.push(candidate);
  }

  return {
    selected,
    rejected,
    runtimeUsage,
  };
};
