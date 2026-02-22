const SITE_CATEGORIES = {
  ROUPAS_MASC: "roupas_masc",
  ROUPAS_FEM: "roupas_fem",
  ACESSORIOS: "acessorios",
  SUPLEMENTOS: "suplementos",
  EQUIPAMENTOS: "equipamentos",
};

const CATEGORY_LIST = Object.values(SITE_CATEGORIES);

const DEFAULT_FILTER_CONFIG = {
  version: 1,
  categories: {
    [SITE_CATEGORIES.ACESSORIOS]: {
      positive_terms: [
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
      allowlist_terms: [],
      blocklist_terms: [
        "cafe",
        "cafeteira",
        "capsula",
        "capsulas",
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
      regex_rules: [
        {
          name: "coffee_context",
          pattern: "\\b(cafe|cafeteira|capsula|capsulas|chimarrao|erva\\s*mate|cuia|bule|coador)\\b",
          flags: "i",
          action: "reject",
          reason: "coffee_context",
        },
      ],
      ambiguous_rules: [
        {
          name: "garrafa_context",
          triggers: ["garrafa"],
          requires_one_of: [
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
          requires_one_of: ["squeeze", "shaker", "coqueteleira", "academia", "fitness", "treino"],
        },
      ],
      known_fitness_brands: [],
      min_positive_matches: 1,
      min_relevance_score: {
        allow: 70,
        standby: 50,
      },
      synonyms: {},
    },
    [SITE_CATEGORIES.EQUIPAMENTOS]: {
      positive_terms: [
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
      allowlist_terms: [],
      blocklist_terms: [
        "profissional",
        "estacao de musculacao",
        "esteira profissional",
        "aparelho",
        "academia completa",
        "usado",
        "seminovo",
        "semi novo",
      ],
      regex_rules: [],
      ambiguous_rules: [],
      known_fitness_brands: [],
      min_positive_matches: 1,
      min_relevance_score: {
        allow: 70,
        standby: 50,
      },
      synonyms: {},
    },
    [SITE_CATEGORIES.ROUPAS_MASC]: {
      positive_terms: [
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
      allowlist_terms: [],
      blocklist_terms: ["social", "jeans", "vestido", "blazer", "terno", "salto"],
      regex_rules: [],
      ambiguous_rules: [],
      known_fitness_brands: [],
      min_positive_matches: 1,
      min_relevance_score: {
        allow: 70,
        standby: 50,
      },
      synonyms: {},
    },
    [SITE_CATEGORIES.ROUPAS_FEM]: {
      positive_terms: [
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
      allowlist_terms: [],
      blocklist_terms: ["social", "jeans", "vestido", "blazer", "terno", "salto"],
      regex_rules: [],
      ambiguous_rules: [],
      known_fitness_brands: [],
      min_positive_matches: 1,
      min_relevance_score: {
        allow: 70,
        standby: 50,
      },
      synonyms: {},
    },
    [SITE_CATEGORIES.SUPLEMENTOS]: {
      positive_terms: [
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
      allowlist_terms: [],
      blocklist_terms: ["tarja", "controlado", "medicamento", "anabolizante", "esteroide", "homeopatia"],
      regex_rules: [],
      ambiguous_rules: [],
      known_fitness_brands: [
        "growth",
        "max titanium",
        "integralmedica",
        "dux",
        "black skull",
        "soldiers nutrition",
        "ftw",
        "darkness",
        "demons lab",
      ],
      min_positive_matches: 1,
      min_relevance_score: {
        allow: 70,
        standby: 50,
      },
      synonyms: {},
    },
  },
  global: {
    allowlist_terms: [],
    blocklist_terms: [],
    regex_rules: [],
    known_fitness_brands: [],
    synonyms: {
      "pre treino": ["pre treino", "pre-treino", "pretreino", "pre treino"],
      "cafeina": ["cafeina", "cafeína"],
      "musculacao": ["musculacao", "musculação"],
      "relogio esportivo": ["relogio esportivo", "relógio esportivo"],
      "termica": ["termica", "térmica"],
      "capsula": ["capsula", "capsula", "cápsula", "capsulas", "cápsulas"],
    },
  },
};

const uniq = (items) => Array.from(new Set((items ?? []).filter(Boolean)));

const normalize = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeFitnessText = normalize;

const deepClone = (value) => {
  if (!value || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
};

const toStringArray = (value) =>
  uniq((Array.isArray(value) ? value : []).map((item) => normalize(item)).filter(Boolean));

const normalizeRuleAction = (value) => {
  const normalized = normalize(value);
  if (normalized === "standby") return "standby";
  return "reject";
};

const normalizeRegexRules = (value, warnings, categoryKey) => {
  const out = [];
  for (const rawRule of Array.isArray(value) ? value : []) {
    if (!rawRule) continue;
    const rule = typeof rawRule === "string"
      ? { pattern: rawRule, action: "reject", reason: "regex_reject" }
      : rawRule;
    const pattern = String(rule.pattern ?? "").trim();
    if (!pattern) continue;
    const flags = String(rule.flags ?? "i")
      .replace(/[^gimsuy]/gi, "")
      .split("")
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .join("") || "i";
    try {
      const compiled = new RegExp(pattern, flags);
      out.push({
        name: String(rule.name ?? `${categoryKey}_regex_${out.length + 1}`),
        reason: String(rule.reason ?? "regex_rule"),
        action: normalizeRuleAction(rule.action),
        pattern,
        flags,
        regex: compiled,
      });
    } catch (error) {
      warnings.push(`invalid_regex:${categoryKey}:${pattern}:${(error?.message ?? "compile_failed").slice(0, 80)}`);
    }
  }
  return out;
};

const normalizeAmbiguousRules = (value) =>
  (Array.isArray(value) ? value : [])
    .map((rawRule, index) => {
      if (!rawRule || typeof rawRule !== "object") return null;
      const triggers = toStringArray(rawRule.triggers);
      const requiresOneOf = toStringArray(rawRule.requires_one_of ?? rawRule.requiresOneOf);
      if (!triggers.length || !requiresOneOf.length) return null;
      return {
        name: String(rawRule.name ?? `ambiguous_${index + 1}`),
        triggers,
        requiresOneOf,
      };
    })
    .filter(Boolean);

const toAllowlist = (allowlist) =>
  uniq((allowlist ?? []).map((raw) => String(raw).trim().toUpperCase()).filter(Boolean));

const passesCategoryAllowlist = (_siteCategory, mlCategoryId, allowlist) => {
  const normalizedAllowlist = toAllowlist(allowlist);
  if (!normalizedAllowlist.length) return true;
  const normalizedCategory = String(mlCategoryId ?? "").trim().toUpperCase();
  if (!normalizedCategory) return false;
  return normalizedAllowlist.includes(normalizedCategory);
};

const collectAttributesText = (attributes) =>
  (Array.isArray(attributes) ? attributes : [])
    .map((raw) => {
      if (!raw || typeof raw !== "object") return "";
      const left = String(raw.name ?? raw.id ?? "").trim();
      const right = String(raw.value_name ?? raw.value ?? "").trim();
      return `${left} ${right}`.trim();
    })
    .filter(Boolean)
    .join(" ");

const extractSynonymMap = (globalSynonyms, categorySynonyms) => {
  const out = new Map();
  const append = (source) => {
    if (!source || typeof source !== "object") return;
    for (const [canonicalRaw, variantsRaw] of Object.entries(source)) {
      const canonical = normalize(canonicalRaw);
      if (!canonical) continue;
      const variants = toStringArray(Array.isArray(variantsRaw) ? variantsRaw : [variantsRaw]);
      const current = out.get(canonical) ?? [];
      out.set(canonical, uniq([...current, canonical, ...variants]));
    }
  };
  append(globalSynonyms);
  append(categorySynonyms);
  return out;
};

const expandTermsWithSynonyms = (terms, synonymMap) => {
  const expanded = new Set();
  for (const raw of toStringArray(terms)) {
    expanded.add(raw);
    for (const [canonical, variants] of synonymMap.entries()) {
      if (raw === canonical || variants.includes(raw)) {
        expanded.add(canonical);
        for (const variant of variants) expanded.add(variant);
      }
    }
  }
  return Array.from(expanded);
};

const matchedTerms = (text, terms) => uniq(terms.filter((term) => text.includes(term)));

const normalizeCategoryConfig = (siteCategory, categoryConfigRaw, warnings) => {
  const raw = categoryConfigRaw && typeof categoryConfigRaw === "object" ? categoryConfigRaw : {};
  const minRelevance = raw.min_relevance_score && typeof raw.min_relevance_score === "object"
    ? raw.min_relevance_score
    : {};
  const allowThreshold = Number(minRelevance.allow ?? 70);
  const standbyThreshold = Number(minRelevance.standby ?? 50);
  const minPositiveMatches = Number(raw.min_positive_matches ?? raw.minPositiveMatches ?? 1);
  return {
    positiveTerms: toStringArray(raw.positive_terms),
    allowlistTerms: toStringArray(raw.allowlist_terms),
    blocklistTerms: toStringArray(raw.blocklist_terms),
    regexRules: normalizeRegexRules(raw.regex_rules, warnings, siteCategory),
    ambiguousRules: normalizeAmbiguousRules(raw.ambiguous_rules),
    knownBrands: toStringArray(raw.known_fitness_brands),
    minPositiveMatches: Math.max(0, Math.floor(Number.isFinite(minPositiveMatches) ? minPositiveMatches : 1)),
    minRelevanceScore: {
      allow: Math.max(0, Math.min(100, Math.floor(Number.isFinite(allowThreshold) ? allowThreshold : 70))),
      standby: Math.max(0, Math.min(100, Math.floor(Number.isFinite(standbyThreshold) ? standbyThreshold : 50))),
    },
    synonyms: raw.synonyms && typeof raw.synonyms === "object" ? raw.synonyms : {},
  };
};

const mergeFilterConfig = (baseConfig, overrideConfig, warnings) => {
  const safeOverride = overrideConfig && typeof overrideConfig === "object" ? overrideConfig : null;
  const merged = deepClone(baseConfig);
  if (!safeOverride) return merged;

  if (safeOverride.global && typeof safeOverride.global === "object") {
    merged.global = {
      ...merged.global,
      ...safeOverride.global,
    };
  }
  if (safeOverride.categories && typeof safeOverride.categories === "object") {
    const nextCategories = { ...merged.categories };
    for (const [key, value] of Object.entries(safeOverride.categories)) {
      const incoming = value && typeof value === "object" ? value : {};
      const base = nextCategories[key] && typeof nextCategories[key] === "object"
        ? nextCategories[key]
        : {};
      nextCategories[key] = {
        ...base,
        ...incoming,
      };
    }
    merged.categories = nextCategories;
  }
  if (safeOverride.version !== undefined) {
    merged.version = Number.isFinite(Number(safeOverride.version))
      ? Number(safeOverride.version)
      : merged.version;
  }
  if (!Number.isFinite(Number(merged.version))) {
    warnings.push("invalid_version");
    merged.version = baseConfig.version;
  }
  return merged;
};

const prepareRuntimeConfig = (rawConfig, warnings) => {
  const merged = mergeFilterConfig(DEFAULT_FILTER_CONFIG, rawConfig, warnings);
  const globalSynonyms = merged?.global?.synonyms ?? {};
  const globalRegexRules = normalizeRegexRules(merged?.global?.regex_rules, warnings, "global");
  const globalKnownBrands = toStringArray(merged?.global?.known_fitness_brands);

  const categories = {};
  for (const siteCategory of CATEGORY_LIST) {
    const rawCategory = merged?.categories?.[siteCategory] ?? {};
    categories[siteCategory] = normalizeCategoryConfig(siteCategory, rawCategory, warnings);
  }

  return {
    version: Number(merged.version ?? DEFAULT_FILTER_CONFIG.version),
    global: {
      allowlistTerms: toStringArray(merged?.global?.allowlist_terms),
      blocklistTerms: toStringArray(merged?.global?.blocklist_terms),
      regexRules: globalRegexRules,
      knownBrands: globalKnownBrands,
      synonyms: globalSynonyms,
    },
    categories,
    __runtime: true,
  };
};

const loadFilterConfig = (rawConfig, options = {}) => {
  const warnings = [];
  const warnOnMissing = options.warnOnMissing === true;
  let fallbackUsed = false;
  let effectiveRawConfig = rawConfig;

  if (effectiveRawConfig === undefined || effectiveRawConfig === null) {
    if (warnOnMissing) warnings.push("missing_filter_config_using_default");
    fallbackUsed = warnOnMissing;
    effectiveRawConfig = null;
  } else if (typeof effectiveRawConfig !== "object" || Array.isArray(effectiveRawConfig)) {
    warnings.push("invalid_filter_config_using_default");
    fallbackUsed = true;
    effectiveRawConfig = null;
  }

  const config = prepareRuntimeConfig(effectiveRawConfig, warnings);
  if (warnings.length && typeof options.logger === "function") {
    options.logger({
      level: "warn",
      message: "catalog_filter_policy_fallback",
      warnings,
      fallback_used: fallbackUsed || warnings.length > 0,
      config_version: config.version,
    });
  }

  return {
    config,
    warnings,
    fallbackUsed: fallbackUsed || warnings.length > 0,
  };
};

const hasNegativeTerms = (siteCategory, text, runtimeConfig) => {
  const categoryKey = CATEGORY_LIST.includes(siteCategory) ? siteCategory : SITE_CATEGORIES.ACESSORIOS;
  const runtime = runtimeConfig?.__runtime ? runtimeConfig : loadFilterConfig(runtimeConfig).config;
  const category = runtime.categories[categoryKey] ?? runtime.categories[SITE_CATEGORIES.ACESSORIOS];
  const synonymMap = extractSynonymMap(runtime.global.synonyms, category.synonyms);
  const negativeTerms = expandTermsWithSynonyms(
    [...runtime.global.blocklistTerms, ...category.blocklistTerms],
    synonymMap,
  );
  const normalizedText = normalize(text);
  const matched = matchedTerms(normalizedText, negativeTerms);
  return {
    blocked: matched.length > 0,
    matched,
  };
};

const passesAmbiguousRules = (siteCategory, text, runtimeConfig) => {
  const categoryKey = CATEGORY_LIST.includes(siteCategory) ? siteCategory : SITE_CATEGORIES.ACESSORIOS;
  const runtime = runtimeConfig?.__runtime ? runtimeConfig : loadFilterConfig(runtimeConfig).config;
  const category = runtime.categories[categoryKey] ?? runtime.categories[SITE_CATEGORIES.ACESSORIOS];
  const normalizedText = normalize(text);
  for (const rule of category.ambiguousRules) {
    const hasTrigger = rule.triggers.some((term) => normalizedText.includes(term));
    if (!hasTrigger) continue;
    const hasRequiredContext = rule.requiresOneOf.some((term) => normalizedText.includes(term));
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

const applyRegexRules = (normalizedText, regexRules) => {
  for (const rule of regexRules) {
    if (rule.regex.test(normalizedText)) {
      return {
        matched: true,
        action: rule.action,
        reason: rule.reason,
        name: rule.name,
      };
    }
  }
  return {
    matched: false,
    action: null,
    reason: null,
    name: null,
  };
};

const shouldAcceptCandidate = (candidate, targetCategory, queryContext = {}, runtimeConfigInput) => {
  const runtime = runtimeConfigInput?.__runtime
    ? runtimeConfigInput
    : loadFilterConfig(runtimeConfigInput ?? null).config;
  const siteCategory = CATEGORY_LIST.includes(targetCategory)
    ? targetCategory
    : SITE_CATEGORIES.ACESSORIOS;
  const category = runtime.categories[siteCategory] ?? runtime.categories[SITE_CATEGORIES.ACESSORIOS];

  const synonymMap = extractSynonymMap(runtime.global.synonyms, category.synonyms);
  const title = String(candidate?.title ?? "").trim();
  const description = String(candidate?.description ?? candidate?.extraText ?? "").trim();
  const brand = String(candidate?.brand ?? "").trim();
  const seller = String(candidate?.seller ?? "").trim();
  const attributesText = collectAttributesText(candidate?.attributes);
  const query = String(queryContext?.query ?? "").trim();
  const normalizedCandidateText = normalize(
    `${title} ${description} ${brand} ${seller} ${attributesText}`,
  );
  const normalizedQuery = normalize(query);
  const normalizedText = normalizedQuery
    ? `${normalizedCandidateText} ${normalizedQuery}`.trim()
    : normalizedCandidateText;

  const mappingIncludeTerms = expandTermsWithSynonyms(queryContext?.includeTerms ?? [], synonymMap);
  const mappingExcludeTerms = expandTermsWithSynonyms(queryContext?.excludeTerms ?? [], synonymMap);
  const includesOk =
    mappingIncludeTerms.length === 0 ||
    mappingIncludeTerms.some((term) => normalizedCandidateText.includes(term));
  const excludeMatch = mappingExcludeTerms.find((term) => normalizedCandidateText.includes(term)) ?? null;

  const allowlistOk = passesCategoryAllowlist(
    siteCategory,
    candidate?.mlCategoryId ?? null,
    candidate?.mlCategoryAllowlist ?? [],
  );

  const positiveTerms = expandTermsWithSynonyms(
    [...runtime.global.allowlistTerms, ...category.allowlistTerms, ...category.positiveTerms],
    synonymMap,
  );
  const negativeTerms = expandTermsWithSynonyms(
    [...runtime.global.blocklistTerms, ...category.blocklistTerms],
    synonymMap,
  );

  const positiveMatches = matchedTerms(normalizedCandidateText, positiveTerms);
  const negativeMatches = matchedTerms(normalizedCandidateText, negativeTerms);
  const ambiguous = passesAmbiguousRules(siteCategory, normalizedCandidateText, runtime);

  const regexEvaluation = applyRegexRules(
    normalizedCandidateText,
    [...runtime.global.regexRules, ...category.regexRules],
  );
  const knownBrands = uniq([...runtime.global.knownBrands, ...category.knownBrands]);
  const normalizedBrand = normalize(brand);
  const brandBonus = knownBrands.some((known) => normalizedBrand.includes(known)) ? 8 : 0;

  let score = 40;
  if (allowlistOk) score += 25;
  else score -= 35;
  score += Math.min(30, positiveMatches.length * 8);
  score -= Math.min(45, negativeMatches.length * 22);
  if (!ambiguous.passed) score -= 28;
  if (!includesOk) score -= 20;
  if (excludeMatch) score -= 30;
  score += brandBonus;

  const minPositiveMatches = category.minPositiveMatches ?? 1;
  if (positiveMatches.length < minPositiveMatches) score -= 18;

  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const allowThreshold = category.minRelevanceScore?.allow ?? 70;
  const standbyThreshold = category.minRelevanceScore?.standby ?? 50;

  const reasons = [];
  if (!allowlistOk) reasons.push("category_allowlist");
  if (!includesOk) reasons.push("mapping_include_terms_miss");
  if (excludeMatch) reasons.push(`mapping_exclude_terms_match:${excludeMatch}`);
  if (negativeMatches.length) reasons.push(`negative_terms:${negativeMatches[0]}`);
  if (!ambiguous.passed) reasons.push(`ambiguous_rule:${ambiguous.rule}`);
  if (regexEvaluation.matched) {
    reasons.push(`regex_rule:${regexEvaluation.name}:${regexEvaluation.reason}`);
  }

  let decision = "reject";
  if (!reasons.length) {
    if (clampedScore >= allowThreshold) decision = "allow";
    else if (clampedScore >= standbyThreshold) decision = "standby";
  } else if (
    reasons.length === 1 &&
    reasons[0].startsWith("regex_rule:") &&
    regexEvaluation.action === "standby"
  ) {
    decision = "standby";
  }

  if (decision === "reject" && clampedScore < standbyThreshold && !reasons.length) {
    reasons.push("low_relevance_score");
  }
  if (decision === "standby" && !reasons.length) {
    reasons.push("borderline_relevance_score");
  }

  return {
    accepted: decision !== "reject",
    decision,
    reason: reasons[0] ?? "accepted",
    reasons,
    score: clampedScore,
    allowThreshold,
    standbyThreshold,
    allowlistOk,
    blockedByAllowlist: !allowlistOk,
    blockedByNegative: negativeMatches.length > 0,
    blockedByAmbiguous: !ambiguous.passed,
    ambiguousPassed: ambiguous.passed,
    ambiguousRule: ambiguous.rule,
    positiveMatches,
    negativeMatches,
    regexMatch: regexEvaluation.matched ? regexEvaluation : null,
    configVersion: runtime.version,
    rankingPenaltyFactor: decision === "standby" ? 0.85 : 1,
  };
};

const computeFitnessRelevanceScore = (siteCategory, item, runtimeConfig) => {
  const result = shouldAcceptCandidate(
    {
      title: item?.title ?? "",
      description: item?.extraText ?? "",
      brand: item?.brand ?? "",
      attributes: item?.attributes ?? [],
      mlCategoryId: item?.mlCategoryId ?? item?.ml_category_id ?? null,
      mlCategoryAllowlist: item?.mlCategoryAllowlist ?? item?.ml_category_allowlist ?? [],
    },
    siteCategory,
    {
      includeTerms: [],
      excludeTerms: [],
      query: "",
    },
    runtimeConfig,
  );
  return {
    score: result.score,
    positiveMatches: result.positiveMatches,
    negativeMatches: result.negativeMatches,
    allowlistOk: result.allowlistOk,
    ambiguousPassed: result.ambiguousPassed,
    ambiguousRule: result.ambiguousRule,
  };
};

const evaluateFitnessGate = (siteCategory, item, runtimeConfig) => {
  const result = shouldAcceptCandidate(
    {
      title: item?.title ?? "",
      description: item?.extraText ?? "",
      brand: item?.brand ?? "",
      attributes: item?.attributes ?? [],
      mlCategoryId: item?.mlCategoryId ?? item?.ml_category_id ?? null,
      mlCategoryAllowlist: item?.mlCategoryAllowlist ?? item?.ml_category_allowlist ?? [],
    },
    siteCategory,
    {
      includeTerms: [],
      excludeTerms: [],
      query: "",
    },
    runtimeConfig,
  );

  return {
    score: result.score,
    positiveMatches: result.positiveMatches,
    negativeMatches: result.negativeMatches,
    allowlistOk: result.allowlistOk,
    ambiguousPassed: result.ambiguousPassed,
    ambiguousRule: result.ambiguousRule,
    blockedByAllowlist: result.blockedByAllowlist,
    blockedByNegative: result.blockedByNegative,
    blockedByAmbiguous: result.blockedByAmbiguous,
    decision: result.decision,
    reason: result.reason,
    reasons: result.reasons,
    configVersion: result.configVersion,
  };
};

const POSITIVE_TERMS = Object.fromEntries(
  CATEGORY_LIST.map((category) => [category, DEFAULT_FILTER_CONFIG.categories[category].positive_terms]),
);

const NEGATIVE_TERMS = Object.fromEntries(
  CATEGORY_LIST.map((category) => [category, DEFAULT_FILTER_CONFIG.categories[category].blocklist_terms]),
);

const AMBIGUOUS_RULES = Object.fromEntries(
  CATEGORY_LIST.map((category) => [category, DEFAULT_FILTER_CONFIG.categories[category].ambiguous_rules]),
);

export {
  SITE_CATEGORIES,
  POSITIVE_TERMS,
  NEGATIVE_TERMS,
  AMBIGUOUS_RULES,
  DEFAULT_FILTER_CONFIG,
  normalize,
  normalizeFitnessText,
  loadFilterConfig,
  passesCategoryAllowlist,
  hasNegativeTerms,
  passesAmbiguousRules,
  computeFitnessRelevanceScore,
  evaluateFitnessGate,
  shouldAcceptCandidate,
};
