export type SpecSource = "internal" | "manual" | "external" | "derived" | "unknown";

export interface MarketplaceSpecField {
  key: string;
  label: string;
  value: string;
  source: SpecSource;
}

export interface TechnicalScoreItem {
  key: string;
  label: string;
  score: number | null;
}

export interface TechnicalRatingData {
  scores: TechnicalScoreItem[];
  finalScore: number | null;
  finalLabel: string;
  note: string;
}

export interface MarketplaceProductData {
  specs: MarketplaceSpecField[];
  ingredients: string[];
  allergens: string[];
  usage: string[];
  howToUse: string[];
  warnings: string[];
  benefits: string[];
  faq: { question: string; answer: string }[];
  headline: string;
  subheadline: string;
  isCreatine100g: boolean;
  pixPrice?: number;
  installment?: string;
  technicalRating: TechnicalRatingData;
}

type AnyRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is AnyRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeString = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    const items = value
      .map((item) => normalizeString(item))
      .filter(Boolean) as string[];
    return items.length ? items.join(", ") : undefined;
  }
  if (isRecord(value) && "value" in value) {
    return normalizeString((value as AnyRecord).value);
  }
  return undefined;
};

const normalizeNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const toStringArray = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeString(item))
      .filter(Boolean) as string[];
  }
  const normalized = normalizeString(value);
  return normalized ? [normalized] : [];
};

const extractWeightFromName = (name: string): string | undefined => {
  const match = name.match(/(\d+(?:[.,]\d+)?)\s?(kg|g|ml|l)\b/i);
  if (!match) return undefined;
  const value = match[1].replace(".", ",");
  const unit = match[2].toLowerCase();
  return `${value} ${unit}`;
};

const formatMarketplaceLabel = (marketplace?: string | null) => {
  if (!marketplace) return undefined;
  const normalized = marketplace.toLowerCase();
  if (normalized.includes("mercado")) return "Mercado Livre";
  if (normalized.includes("amazon")) return "Amazon";
  return marketplace;
};

const resolveValue = ({
  internalValue,
  manualValue,
  externalValue,
  derivedValue,
  allowExternal,
  externalApproved,
}: {
  internalValue?: unknown;
  manualValue?: unknown;
  externalValue?: unknown;
  derivedValue?: string;
  allowExternal: boolean;
  externalApproved: boolean;
}): { value: string; source: SpecSource } => {
  const internal = normalizeString(internalValue);
  if (internal) return { value: internal, source: "internal" };

  const manual = normalizeString(manualValue);
  if (manual) return { value: manual, source: "manual" };

  if (allowExternal && externalApproved) {
    const external = normalizeString(externalValue);
    if (external) return { value: external, source: "external" };
  }

  if (derivedValue) return { value: derivedValue, source: "derived" };

  return { value: "Não informado", source: "unknown" };
};

const ensureFourBenefits = (items: string[]): string[] => {
  const placeholders = [
    "Benefício principal não informado",
    "Vantagem complementar não informada",
    "Uso indicado não informado",
    "Diferencial técnico não informado",
  ];

  if (items.length >= 4) return items.slice(0, 4);
  const merged = [...items];
  while (merged.length < 4) {
    merged.push(placeholders[merged.length] || "Benefício não informado");
  }
  return merged;
};

const calculateTechnicalRating = (scores: TechnicalScoreItem[]): TechnicalRatingData => {
  const available = scores.filter((score) => typeof score.score === "number") as Array<
    TechnicalScoreItem & { score: number }
  >;
  if (available.length === 0) {
    return {
      scores,
      finalScore: null,
      finalLabel: "Não informado",
      note: "Sem dados técnicos para compor a nota.",
    };
  }

  const average = available.reduce((sum, item) => sum + item.score, 0) / available.length;
  const missing = scores.length - available.length;
  const penalty = missing * 0.5;
  const final = Math.max(0, Math.round((average - penalty) * 10) / 10);
  const note =
    missing > 0
      ? "Nota reduzida por critérios não informados."
      : "Nota baseada em critérios preenchidos.";

  return {
    scores,
    finalScore: final,
    finalLabel: `${final.toFixed(1)}/10`,
    note,
  };
};

export function normalizeMarketplaceProduct(
  product: {
    name?: string;
    title?: string;
    brand?: string | null;
    subcategory?: string | null;
    sku?: string | null;
    marketplace?: string | null;
    short_description?: string | null;
    description?: string | null;
    advantages?: string[] | null;
    specifications?: Record<string, unknown> | null;
    usage_instructions?: string | null;
    instructions?: string | null;
  },
  options?: { allowExternal?: boolean }
): MarketplaceProductData {
  const allowExternal = options?.allowExternal ?? false;
  const specs = (product.specifications ?? {}) as AnyRecord;
  const manualSpecs = (isRecord(specs.manual) ? specs.manual : specs) as AnyRecord;
  const externalSpecs = (isRecord(specs.external) ? specs.external : {}) as AnyRecord;
  const externalApproved = Boolean(
    specs.external_approved || specs.externalApproved || (specs.external as AnyRecord | undefined)?.approved
  );

  const title = product.name || product.title || "Produto";
  const normalizedTitle = title.toLowerCase();
  const weightFromName = extractWeightFromName(title);
  const isCreatine = normalizedTitle.includes("creatina");
  const is100g = /\b100\s?g\b/.test(normalizedTitle);
  const isCreatine100g = isCreatine && is100g;

  const creatineDefaults = isCreatine100g
    ? {
        portion: "3 g",
        creatinePerServing: "3000 mg",
        ingredients: ["Creatina monohidratada"],
        allergens: ["Não contém glúten"],
        usage: ["1 porção ao dia"],
        howToUse: ["Dissolver 3 g no líquido de sua preferência."],
        warnings: [
          "Indicado para maiores de 19 anos.",
          "Não recomendado para gestantes, lactantes e crianças.",
        ],
        form: "Pó",
      }
    : null;

  const ingredients =
    toStringArray(manualSpecs.ingredients || manualSpecs.ingredientes).length > 0
      ? toStringArray(manualSpecs.ingredients || manualSpecs.ingredientes)
      : creatineDefaults?.ingredients || [];

  const allergens =
    toStringArray(manualSpecs.allergens || manualSpecs.restrictions || manualSpecs.restricoes).length > 0
      ? toStringArray(manualSpecs.allergens || manualSpecs.restrictions || manualSpecs.restricoes)
      : creatineDefaults?.allergens || [];

  const usage =
    toStringArray(manualSpecs.recommended_use || manualSpecs.usage || manualSpecs.recomendacao).length > 0
      ? toStringArray(manualSpecs.recommended_use || manualSpecs.usage || manualSpecs.recomendacao)
      : creatineDefaults?.usage || [];

  const howToUse =
    toStringArray(
      product.instructions ||
        product.usage_instructions ||
        manualSpecs.how_to_use ||
        manualSpecs.instructions ||
        manualSpecs.usage_instructions
    ).length > 0
      ? toStringArray(
          product.instructions ||
            product.usage_instructions ||
            manualSpecs.how_to_use ||
            manualSpecs.instructions ||
            manualSpecs.usage_instructions
        )
      : creatineDefaults?.howToUse || ["Siga a recomendação indicada no rótulo."];

  const warnings =
    toStringArray(manualSpecs.warnings || manualSpecs.avisos).length > 0
      ? toStringArray(manualSpecs.warnings || manualSpecs.avisos)
      : creatineDefaults?.warnings || ["Avisos regulatórios não informados."];

  const headline =
    normalizeString(manualSpecs.headline) ||
    normalizeString(product.short_description) ||
    (isCreatine100g ? "Creatina monohidratada para rotina de treino." : "Benefício principal não informado.");

  const subheadlineParts: string[] = [];
  if (ingredients.length === 1) subheadlineParts.push("Ingrediente único");
  if (allergens.some((item) => item.toLowerCase().includes("glúten"))) subheadlineParts.push("Sem glúten");
  const marketplaceLabel = formatMarketplaceLabel(product.marketplace);
  if (marketplaceLabel) subheadlineParts.push(`Origem: ${marketplaceLabel}`);
  const subheadline =
    subheadlineParts.join(" • ") || "Informações de procedência disponíveis no checkout.";

  const rawBenefits =
    toStringArray(manualSpecs.benefits || manualSpecs.vantagens).length > 0
      ? toStringArray(manualSpecs.benefits || manualSpecs.vantagens)
      : product.advantages?.filter(Boolean) || [];

  const benefits = ensureFourBenefits(
    rawBenefits.length > 0
      ? rawBenefits
      : isCreatine100g
        ? [
            "Creatina monohidratada",
            "Porção de 3 g com 3000 mg de creatina",
            "Não contém glúten",
            "Uso diário simples",
          ]
        : []
  );

  const pixPrice = normalizeNumber(manualSpecs.pix_price || manualSpecs.preco_pix || manualSpecs.cash_price);
  const installment = normalizeString(manualSpecs.installment || manualSpecs.parcelamento);

  const technicalScoresRaw = (manualSpecs.technical_scores || manualSpecs.avaliacao_tecnica) as AnyRecord | undefined;
  const technicalScores: TechnicalScoreItem[] = [
    {
      key: "purity",
      label: "Pureza",
      score: normalizeNumber(technicalScoresRaw?.purity ?? manualSpecs.pureza_score ?? manualSpecs.pureza),
    },
    {
      key: "solubility",
      label: "Solubilidade",
      score: normalizeNumber(technicalScoresRaw?.solubility ?? manualSpecs.solubilidade_score ?? manualSpecs.solubilidade),
    },
    {
      key: "lab_transparency",
      label: "Transparência de laudo",
      score: normalizeNumber(
        technicalScoresRaw?.lab_transparency ?? manualSpecs.transparencia_score ?? manualSpecs.transparencia
      ),
    },
    {
      key: "value",
      label: "Custo-benefício",
      score: normalizeNumber(technicalScoresRaw?.value ?? manualSpecs.custo_beneficio_score ?? manualSpecs.custo_beneficio),
    },
  ];

  const technicalRating = calculateTechnicalRating(technicalScores);

  const resolvedBrand = resolveValue({
    internalValue: product.brand,
    manualValue: manualSpecs.brand,
    externalValue: externalSpecs.brand,
    allowExternal,
    externalApproved,
  });

  const resolvedName = resolveValue({
    internalValue: title,
    manualValue: manualSpecs.name,
    externalValue: externalSpecs.name,
    allowExternal,
    externalApproved,
  });

  const resolvedVariant = resolveValue({
    internalValue: product.subcategory,
    manualValue: manualSpecs.variant || manualSpecs.variacao || manualSpecs.sabor,
    externalValue: externalSpecs.variant || externalSpecs.variacao,
    allowExternal,
    externalApproved,
  });

  const resolvedWeight = resolveValue({
    internalValue: manualSpecs.net_weight || manualSpecs.peso_liquido,
    manualValue: manualSpecs.net_weight || manualSpecs.peso_liquido,
    externalValue: externalSpecs.net_weight || externalSpecs.peso_liquido,
    derivedValue: weightFromName || undefined,
    allowExternal,
    externalApproved,
  });

  const resolvedForm = resolveValue({
    internalValue: manualSpecs.form || manualSpecs.forma,
    manualValue: manualSpecs.form || manualSpecs.forma,
    externalValue: externalSpecs.form || externalSpecs.forma,
    derivedValue: creatineDefaults?.form,
    allowExternal,
    externalApproved,
  });

  const resolvedServing = resolveValue({
    internalValue: manualSpecs.serving_size || manualSpecs.porcao,
    manualValue: manualSpecs.serving_size || manualSpecs.porcao,
    externalValue: externalSpecs.serving_size || externalSpecs.porcao,
    derivedValue: creatineDefaults?.portion,
    allowExternal,
    externalApproved,
  });

  const resolvedCreatine = resolveValue({
    internalValue: manualSpecs.creatine_per_serving || manualSpecs.creatina_por_porcao,
    manualValue: manualSpecs.creatine_per_serving || manualSpecs.creatina_por_porcao,
    externalValue: externalSpecs.creatine_per_serving || externalSpecs.creatina_por_porcao,
    derivedValue: creatineDefaults?.creatinePerServing,
    allowExternal,
    externalApproved,
  });

  const resolvedIngredients = resolveValue({
    internalValue: ingredients.join(", "),
    manualValue: manualSpecs.ingredients || manualSpecs.ingredientes,
    externalValue: externalSpecs.ingredients || externalSpecs.ingredientes,
    allowExternal,
    externalApproved,
  });

  const resolvedAllergens = resolveValue({
    internalValue: allergens.join(", "),
    manualValue: manualSpecs.allergens || manualSpecs.restrictions || manualSpecs.restricoes,
    externalValue: externalSpecs.allergens || externalSpecs.restrictions || externalSpecs.restricoes,
    allowExternal,
    externalApproved,
  });

  const resolvedUsage = resolveValue({
    internalValue: usage.join(" "),
    manualValue: manualSpecs.recommended_use || manualSpecs.uso,
    externalValue: externalSpecs.recommended_use || externalSpecs.uso,
    allowExternal,
    externalApproved,
  });

  const resolvedWarnings = resolveValue({
    internalValue: warnings.join(" "),
    manualValue: manualSpecs.warnings || manualSpecs.avisos,
    externalValue: externalSpecs.warnings || externalSpecs.avisos,
    allowExternal,
    externalApproved,
  });

  const resolvedSku = resolveValue({
    internalValue: product.sku,
    manualValue: manualSpecs.sku,
    externalValue: externalSpecs.sku,
    allowExternal,
    externalApproved,
  });

  const resolvedEan = resolveValue({
    internalValue: manualSpecs.ean,
    manualValue: manualSpecs.ean,
    externalValue: externalSpecs.ean,
    allowExternal,
    externalApproved,
  });

  const specsList: MarketplaceSpecField[] = [
    { key: "brand", label: "Marca", ...resolvedBrand },
    { key: "name", label: "Nome", ...resolvedName },
    { key: "variant", label: "Variação", ...resolvedVariant },
    { key: "net_weight", label: "Peso líquido", ...resolvedWeight },
    { key: "form", label: "Forma do produto", ...resolvedForm },
    { key: "serving_size", label: "Porção", ...resolvedServing },
    { key: "creatine_per_serving", label: "Creatina por porção", ...resolvedCreatine },
    { key: "ingredients", label: "Ingredientes", ...resolvedIngredients },
    { key: "allergens", label: "Alergênicos e restrições", ...resolvedAllergens },
    { key: "recommended_use", label: "Recomendação de uso", ...resolvedUsage },
    { key: "warnings", label: "Avisos regulatórios", ...resolvedWarnings },
    { key: "sku", label: "SKU", ...resolvedSku },
    { key: "ean", label: "EAN", ...resolvedEan },
  ];

  const faq = [
    {
      question: "Qual a porção recomendada?",
      answer:
        resolvedServing.value !== "Não informado"
          ? `Porção sugerida: ${resolvedServing.value}.`
          : "Porção não informada. Consulte o rótulo.",
    },
    {
      question: "Como devo consumir?",
      answer: howToUse.length ? howToUse.join(" ") : "Siga a recomendação indicada no rótulo.",
    },
    {
      question: "Contém glúten?",
      answer:
        resolvedAllergens.value !== "Não informado"
          ? resolvedAllergens.value
          : "Informação sobre glúten não informada.",
    },
    {
      question: "Posso misturar com outros suplementos?",
      answer: "Em geral, sim. Para ajuste individual, consulte um profissional de saúde.",
    },
    {
      question: "Quem não deve consumir?",
      answer:
        resolvedWarnings.value !== "Não informado"
          ? resolvedWarnings.value
          : "Avisos não informados. Consulte o rótulo.",
    },
    {
      question: "Como armazenar?",
      answer: "Siga as orientações do fabricante no rótulo.",
    },
  ];

  return {
    specs: specsList,
    ingredients,
    allergens,
    usage,
    howToUse,
    warnings,
    benefits,
    faq,
    headline,
    subheadline,
    isCreatine100g,
    pixPrice,
    installment,
    technicalRating,
  };
}
