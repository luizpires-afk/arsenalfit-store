import { createClient } from "@supabase/supabase-js";

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

const MAX_LIMIT = 7;
const MOST_CLICKED_LIMIT = 20;
const ACTIVE_FILTER = "is_active.is.null,is_active.eq.true";

const normalize = (value = "") =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const SYNONYMS = {
  blusa: ["camisa", "top", "camiseta"],
  camisa: ["blusa", "camiseta", "top"],
  camiseta: ["camisa", "blusa", "t-shirt"],
  top: ["blusa", "camiseta"],
  calca: ["legging", "jeans", "pants"],
  calcas: ["legging", "jeans", "pants"],
  legging: ["calca", "calcas"],
  short: ["bermuda"],
  bermuda: ["short"],
  tenis: ["sneaker"],
  moletom: ["hoodie", "casaco"],
  jaqueta: ["casaco", "moletom"],
  sutia: ["top"],
};

const buildSynonyms = (term) => {
  if (!term) return [];
  const normalized = normalize(term);
  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  const result = new Set();
  tokens.forEach((token) => {
    const list = SYNONYMS[token] || [];
    list.forEach((entry) => result.add(entry));
  });
  return Array.from(result);
};

const MOST_CLICKED_KEYS = [
  { key: "Suplementos", matchers: ["suplement"] },
  { key: "Acessórios", matchers: ["acessor"] },
  { key: "Roupas", matchers: ["roupa", "vestu"] },
];

const resolveMostClicked = async (supabase, baseSelect, formatItems) => {
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, slug");

  const findCategoryId = (matchers) => {
    const match = (categories || []).find((cat) => {
      const name = normalize(cat.name || "");
      const slug = normalize(cat.slug || "");
      return matchers.some((value) => name.includes(value) || slug.includes(value));
    });
    return match?.id || null;
  };

  const results = {};
  for (const group of MOST_CLICKED_KEYS) {
    const categoryId = findCategoryId(group.matchers);
    if (!categoryId) {
      results[group.key] = [];
      continue;
    }
    const { data } = await supabase
      .from("products")
      .select(baseSelect)
      .or(ACTIVE_FILTER)
      .eq("category_id", categoryId)
      .order("clicks_count", { ascending: false })
      .limit(MOST_CLICKED_LIMIT);
    results[group.key] = formatItems(data || []);
  }
  return results;
};

export const handler = async (event) => {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const SUPABASE_ANON_KEY =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return jsonResponse(500, { error: "missing_env" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  const q = (event.queryStringParameters?.q || "").trim();
  const synonyms = buildSynonyms(q);
  const limit = Math.min(
    Number(event.queryStringParameters?.limit || MAX_LIMIT) || MAX_LIMIT,
    MAX_LIMIT,
  );

  const baseSelect =
    "id, name, slug, price, original_price, image_url, affiliate_link, is_on_sale, clicks_count, category_id, discount_percentage";

  const formatItems = (items = []) =>
    items.map((item) => ({
      id: item.id,
      name: item.name,
      slug: item.slug,
      price: item.price,
      original_price: item.original_price,
      image_url: item.image_url,
      affiliate_link: item.affiliate_link,
      badge: item.is_on_sale ? "promo" : item.clicks_count > 5 ? "popular" : null,
      category_id: item.category_id,
    }));

  let suggestions = [];
  let similar = [];
  let categories = [];
  let completions = [];
  let hot = [];
  let mode = "query";
  let didYouMean = null;
  let mostClicked = {};

  try {
    if (!q) {
      mode = "empty";
      const { data, error } = await supabase
        .from("products")
        .select(baseSelect)
        .or(ACTIVE_FILTER)
        .order("is_on_sale", { ascending: false })
        .order("clicks_count", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      suggestions = formatItems(data);

      const { data: hotRows } = await supabase
        .from("products")
        .select(baseSelect)
        .or(ACTIVE_FILTER)
        .or("discount_percentage.gte.20,is_on_sale.eq.true")
        .order("discount_percentage", { ascending: false })
        .order("clicks_count", { ascending: false })
        .limit(8);
      hot = formatItems(hotRows || []);
      mostClicked = await resolveMostClicked(supabase, baseSelect, formatItems);
    } else {
      const [completionRes, searchRes] = await Promise.all([
        supabase
          .from("products")
          .select("name, clicks_count")
          .or(ACTIVE_FILTER)
          .ilike("name", `${q}%`)
          .order("clicks_count", { ascending: false })
          .limit(5),
        supabase.rpc("search_products", {
          q,
          limit_count: limit,
          synonyms,
        }),
      ]);

      const completionRows = completionRes.data || [];
      completions = completionRows.map((row) => row.name).filter(Boolean);

      const { data, error } = searchRes;

      if (error) throw error;
      suggestions = formatItems(data);

      if (!suggestions.length) {
        const terms = [q, ...synonyms].filter(Boolean);
        const orParts = terms.flatMap((term) => [
          `name.ilike.%${term}%`,
          `description.ilike.%${term}%`,
        ]);
        if (orParts.length) {
          const { data: fallbackRows } = await supabase
            .from("products")
            .select(baseSelect)
            .or(ACTIVE_FILTER)
            .or(orParts.join(","))
            .order("is_on_sale", { ascending: false })
            .order("clicks_count", { ascending: false })
            .limit(limit);
          suggestions = formatItems(fallbackRows || []);
        }
      }

      if (suggestions.length < 3 && suggestions[0]?.category_id) {
        const excludeIds = suggestions.map((item) => item.id);
        const { data: similarRows } = await supabase
          .from("products")
          .select(baseSelect)
          .or(ACTIVE_FILTER)
          .eq("category_id", suggestions[0].category_id)
          .not("id", "in", `(${excludeIds.join(",")})`)
          .order("is_on_sale", { ascending: false })
          .order("clicks_count", { ascending: false })
          .limit(Math.max(0, limit - suggestions.length));
        similar = formatItems(similarRows || []);
      }

      const suggestionCategoryIds = [
        ...new Set(suggestions.map((item) => item.category_id).filter(Boolean)),
      ];
      const { data: categoryRows } = await supabase
        .from("categories")
        .select("id, name, slug, image_url")
        .ilike("name", `%${q}%`)
        .limit(5);

      let categoryFromSuggestions = [];
      if (suggestionCategoryIds.length) {
        const { data } = await supabase
          .from("categories")
          .select("id, name, slug, image_url")
          .in("id", suggestionCategoryIds);
        categoryFromSuggestions = data || [];
      }

      const merged = new Map();
      for (const item of [...(categoryRows || []), ...categoryFromSuggestions]) {
        if (!item?.id) continue;
        merged.set(item.id, item);
      }
      categories = Array.from(merged.values()).slice(0, 5);

      if (!suggestions.length) {
        mode = "no_results";
        const { data: suggestionData } = await supabase.rpc("suggest_search_term", { q });
        if (typeof suggestionData === "string") {
          didYouMean = suggestionData;
        }
      }
    }

    if (q) {
      await supabase.from("search_events").insert({
        term: q,
        event_type: mode === "no_results" ? "no_results" : "search",
        results_count: suggestions.length,
      });
    }

    return jsonResponse(200, {
      query: q,
      suggestions,
      similar,
      categories,
      completions,
      hot,
      mostClicked,
      didYouMean,
      total: suggestions.length,
      mode,
    });
  } catch (error) {
    return jsonResponse(500, { error: error.message || "search_failed" });
  }
};
