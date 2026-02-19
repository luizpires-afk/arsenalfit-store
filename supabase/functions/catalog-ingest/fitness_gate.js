const SITE_CATEGORIES = {
  ROUPAS_MASC: "roupas_masc",
  ROUPAS_FEM: "roupas_fem",
  ACESSORIOS: "acessorios",
  SUPLEMENTOS: "suplementos",
  EQUIPAMENTOS: "equipamentos",
};

const POSITIVE_TERMS = {
  [SITE_CATEGORIES.ACESSORIOS]: [
    "academia",
    "fitness",
    "treino",
    "gym",
    "musculacao",
    "esportivo",
    "esporte",
    "squeeze",
    "garrafa squeeze",
    "garrafa esportiva",
    "garrafa academia",
    "shaker",
    "coqueteleira",
    "strap",
    "luva",
    "munhequeira",
    "faixa",
    "cinta",
    "cinturao",
    "joelheira",
    "cotoveleira",
    "corda de pular",
    "corda velocidade",
    "smartwatch esportivo",
    "relogio esportivo",
    "frequencimetro",
  ],
  [SITE_CATEGORIES.EQUIPAMENTOS]: [
    "halter",
    "halteres",
    "elastico",
    "mini band",
    "faixa elastica",
    "super band",
    "colchonete",
    "tapete yoga",
    "yoga mat",
    "kettlebell",
    "corda de pular",
    "rolo miofascial",
    "roller",
    "bola de massagem",
    "ab wheel",
    "roda abdominal",
  ],
  [SITE_CATEGORIES.ROUPAS_MASC]: [
    "dry fit",
    "compressao",
    "legging",
    "short",
    "bermuda",
    "regata",
    "camiseta esportiva",
    "conjunto fitness",
    "roupa academia",
    "roupa treino",
    "esportivo",
    "running",
    "crossfit",
    "masculino",
  ],
  [SITE_CATEGORIES.ROUPAS_FEM]: [
    "dry fit",
    "compressao",
    "legging",
    "short",
    "top",
    "conjunto fitness",
    "roupa academia",
    "roupa treino",
    "esportivo",
    "running",
    "crossfit",
    "feminino",
  ],
  [SITE_CATEGORIES.SUPLEMENTOS]: [
    "whey",
    "creatina",
    "pre treino",
    "bcaa",
    "glutamina",
    "multivitaminico",
    "hipercalorico",
    "cafeina",
    "protein",
    "mass gainer",
  ],
};

const NEGATIVE_TERMS = {
  [SITE_CATEGORIES.ACESSORIOS]: [
    "cafe",
    "cafeteira",
    "chimarrao",
    "erva mate",
    "cuia",
    "termica cafe",
    "garrafa de cafe",
    "bule",
    "xicara",
    "coador",
    "cozinha",
    "gourmet",
    "escritorio",
    "home office",
    "garrafa termica",
    "copo termico",
    "stanley",
    "quick flip",
    "termolar",
    "magic pump",
  ],
  [SITE_CATEGORIES.EQUIPAMENTOS]: [
    "profissional",
    "estacao de musculacao",
    "esteira profissional",
    "aparelho",
    "academia completa",
    "usado",
    "seminovo",
    "semi novo",
  ],
  [SITE_CATEGORIES.ROUPAS_MASC]: [
    "social",
    "jeans",
    "vestido",
    "blazer",
    "terno",
    "salto",
  ],
  [SITE_CATEGORIES.ROUPAS_FEM]: [
    "social",
    "jeans",
    "vestido",
    "blazer",
    "terno",
    "salto",
  ],
  [SITE_CATEGORIES.SUPLEMENTOS]: [
    "tarja",
    "controlado",
    "medicamento",
    "anabolizante",
    "esteroide",
    "homeopatia",
  ],
};

const AMBIGUOUS_RULES = {
  [SITE_CATEGORIES.ACESSORIOS]: [
    {
      name: "garrafa_context",
      triggers: ["garrafa"],
      requiresOneOf: [
        "squeeze",
        "shaker",
        "coqueteleira",
        "academia",
        "fitness",
        "treino",
        "gym",
        "musculacao",
        "esportivo",
        "esporte",
      ],
    },
    {
      name: "termica_context",
      triggers: ["termica", "thermal"],
      requiresOneOf: ["squeeze", "shaker", "coqueteleira"],
    },
  ],
};

const KNOWN_FITNESS_BRANDS = [
  "growth",
  "max titanium",
  "integralmedica",
  "dux",
  "black skull",
  "soldiers nutrition",
  "ftw",
  "darkness",
  "demons lab",
  "under armour",
  "nike",
  "adidas",
];

const MIN_POSITIVE_MATCHES = {
  [SITE_CATEGORIES.ACESSORIOS]: 1,
  [SITE_CATEGORIES.EQUIPAMENTOS]: 1,
  [SITE_CATEGORIES.ROUPAS_MASC]: 1,
  [SITE_CATEGORIES.ROUPAS_FEM]: 1,
  [SITE_CATEGORIES.SUPLEMENTOS]: 1,
};

const normalizeFitnessText = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const uniq = (items) => Array.from(new Set(items.filter(Boolean)));

const includesTerm = (text, term) => text.includes(normalizeFitnessText(term));

const matchedTerms = (text, terms) =>
  uniq((terms ?? []).map((term) => (includesTerm(text, term) ? normalizeFitnessText(term) : null)));

const getTermsForCategory = (bag, siteCategory) =>
  bag[siteCategory] ??
  ([]).concat(
    bag[SITE_CATEGORIES.ACESSORIOS] ?? [],
    bag[SITE_CATEGORIES.EQUIPAMENTOS] ?? [],
    bag[SITE_CATEGORIES.ROUPAS_MASC] ?? [],
    bag[SITE_CATEGORIES.ROUPAS_FEM] ?? [],
    bag[SITE_CATEGORIES.SUPLEMENTOS] ?? [],
  );

const toAllowlist = (allowlist) =>
  uniq((allowlist ?? []).map((raw) => String(raw).trim().toUpperCase()).filter(Boolean));

const passesCategoryAllowlist = (siteCategory, mlCategoryId, allowlist) => {
  const normalizedAllowlist = toAllowlist(allowlist);
  if (!normalizedAllowlist.length) return true;
  const normalizedCategory = String(mlCategoryId ?? "").trim().toUpperCase();
  if (!normalizedCategory) return false;
  return normalizedAllowlist.includes(normalizedCategory);
};

const hasNegativeTerms = (siteCategory, text) => {
  const normalizedText = normalizeFitnessText(text);
  const negatives = getTermsForCategory(NEGATIVE_TERMS, siteCategory);
  const matched = matchedTerms(normalizedText, negatives);
  return {
    blocked: matched.length > 0,
    matched,
  };
};

const passesAmbiguousRules = (siteCategory, text) => {
  const normalizedText = normalizeFitnessText(text);
  const rules = AMBIGUOUS_RULES[siteCategory] ?? [];
  for (const rule of rules) {
    const hasTrigger = rule.triggers.some((term) => includesTerm(normalizedText, term));
    if (!hasTrigger) continue;
    const hasRequiredContext = rule.requiresOneOf.some((term) => includesTerm(normalizedText, term));
    if (!hasRequiredContext) {
      return {
        passed: false,
        rule: rule.name,
      };
    }
  }
  return {
    passed: true,
    rule: null,
  };
};

const withArray = (value) => (Array.isArray(value) ? value : []);

const stringifyAttributes = (attributes) =>
  withArray(attributes)
    .map((raw) => {
      if (!raw || typeof raw !== "object") return "";
      const row = raw;
      const left = String(row.name ?? row.id ?? "").trim();
      const right = String(row.value_name ?? row.value ?? "").trim();
      return [left, right].filter(Boolean).join(" ");
    })
    .filter(Boolean)
    .join(" ");

const computeFitnessRelevanceScore = (siteCategory, item) => {
  const title = String(item?.title ?? "").trim();
  const brand = String(item?.brand ?? "").trim();
  const attributesText = stringifyAttributes(item?.attributes);
  const extraText = String(item?.extraText ?? "").trim();
  const combinedText = normalizeFitnessText(`${title} ${brand} ${attributesText} ${extraText}`);

  const allowlistOk = passesCategoryAllowlist(
    siteCategory,
    item?.mlCategoryId ?? null,
    item?.mlCategoryAllowlist ?? [],
  );
  const positiveMatches = matchedTerms(combinedText, getTermsForCategory(POSITIVE_TERMS, siteCategory));
  const negativeCheck = hasNegativeTerms(siteCategory, combinedText);
  const ambiguousCheck = passesAmbiguousRules(siteCategory, combinedText);
  const brandBonus = KNOWN_FITNESS_BRANDS.some((known) => includesTerm(normalizeFitnessText(brand), known))
    ? 8
    : 0;

  let score = 40;
  if (allowlistOk) score += 25;
  else score -= 35;

  score += Math.min(30, positiveMatches.length * 8);
  score -= Math.min(45, negativeCheck.matched.length * 22);
  if (!ambiguousCheck.passed) score -= 28;

  score += brandBonus;

  const minPositive = MIN_POSITIVE_MATCHES[siteCategory] ?? 1;
  if (positiveMatches.length < minPositive) {
    score -= 18;
  }

  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: clamped,
    positiveMatches,
    negativeMatches: negativeCheck.matched,
    allowlistOk,
    ambiguousPassed: ambiguousCheck.passed,
    ambiguousRule: ambiguousCheck.rule,
  };
};

const evaluateFitnessGate = (siteCategory, item) => {
  const scoreResult = computeFitnessRelevanceScore(siteCategory, item);
  const blockedByAllowlist = !scoreResult.allowlistOk;
  const blockedByNegative = scoreResult.negativeMatches.length > 0;
  const blockedByAmbiguous = !scoreResult.ambiguousPassed;

  let decision = "reject";
  if (!blockedByAllowlist && !blockedByNegative && !blockedByAmbiguous) {
    if (scoreResult.score >= 70) decision = "allow";
    else if (scoreResult.score >= 50) decision = "standby";
  }

  return {
    ...scoreResult,
    blockedByAllowlist,
    blockedByNegative,
    blockedByAmbiguous,
    decision,
  };
};

export {
  SITE_CATEGORIES,
  POSITIVE_TERMS,
  NEGATIVE_TERMS,
  AMBIGUOUS_RULES,
  normalizeFitnessText,
  passesCategoryAllowlist,
  hasNegativeTerms,
  passesAmbiguousRules,
  computeFitnessRelevanceScore,
  evaluateFitnessGate,
};
