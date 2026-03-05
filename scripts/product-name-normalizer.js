const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "for",
  "with",
  "kit",
  "set",
  "pro",
  "max",
  "plus",
  "premium",
  "original",
  "novo",
  "nova",
  "best",
  "viral",
  "top",
  "fitness",
  "gym",
  "home",
  "2025",
  "2026",
  "academia",
  "de",
  "do",
  "da",
  "dos",
  "das",
  "para",
  "com",
]);

const BRAND_TERMS = [
  "nike",
  "adidas",
  "puma",
  "reebok",
  "xiaomi",
  "samsung",
  "apple",
  "generic",
  "importado",
  "branded",
];

const SYNONYM_MAP = {
  dumbbell: ["halter", "peso academia"],
  dumbbells: ["halter", "peso academia"],
  adjustable: ["ajustavel", "regulavel"],
  weights: ["peso academia"],
  barbell: ["barra musculacao"],
  shaker: ["coqueteleira"],
  resistance: ["resistencia", "elastico"],
  bands: ["bandas elasticas", "elastico academia"],
  massager: ["massageador"],
  massage: ["massageador"],
  wheel: ["roda abdominal"],
  stepper: ["mini stepper"],
};

const normalizeText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const removeBrands = (text) => {
  let out = text;
  for (const brand of BRAND_TERMS) {
    out = out.replace(new RegExp(`\\b${brand}\\b`, "gi"), " ");
  }
  return out.replace(/\s+/g, " ").trim();
};

const tokenize = (text) =>
  normalizeText(text)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !STOPWORDS.has(token));

const unique = (arr) => [...new Set(arr.filter(Boolean))];

export const normalizeProductNameToQueries = (rawName, maxQueries = 5) => {
  const baseNoBrands = removeBrands(normalizeText(rawName));
  const tokens = tokenize(baseNoBrands);

  const expanded = [];
  for (const token of tokens) {
    expanded.push(token);
    const syns = SYNONYM_MAP[token] || [];
    for (const syn of syns) expanded.push(...tokenize(syn));
  }

  const coreTokens = unique(expanded);
  const joined = coreTokens.join(" ").trim();
  const primary = joined || normalizeText(rawName);

  const variants = [
    primary,
    `${primary} academia`.trim(),
    `${coreTokens[0] || "produto"} academia`.trim(),
    `kit ${coreTokens.slice(0, 2).join(" ")}`.trim(),
    `${coreTokens.slice(0, 3).join(" ")} ajustavel`.trim(),
  ];

  const cleaned = unique(
    variants
      .map((v) => v.replace(/\s+/g, " ").trim())
      .filter((v) => v.length >= 3),
  ).slice(0, maxQueries);

  return cleaned.length ? cleaned : [normalizeText(rawName)].filter(Boolean);
};

export const normalizeProductNameTokens = (rawName) => unique(tokenize(removeBrands(normalizeText(rawName))));
