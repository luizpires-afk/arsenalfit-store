import seoSeeds from "@/config/programmaticSeoSeeds.json";

export type ProgrammaticSeed = {
  slug: string;
  keywords: string[];
};

const toWords = (value: string) =>
  String(value || "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const toSlug = (value: string) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

export const keywordSlugToLabel = (keywordSlug: string) => {
  const words = toWords(keywordSlug);
  if (!words) return "ofertas fitness";
  return words
    .split(" ")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
};

export const getProgrammaticSeeds = (): ProgrammaticSeed[] => {
  const categories = (seoSeeds as { categories?: ProgrammaticSeed[] })?.categories || [];
  return categories
    .filter((item) => item && item.slug && Array.isArray(item.keywords))
    .map((item) => ({
      slug: toSlug(item.slug),
      keywords: item.keywords.map((keyword) => toSlug(keyword)).filter(Boolean),
    }))
    .filter((item) => item.keywords.length > 0);
};

export const listRelatedSeoLinks = (categorySlug: string, keywordSlug: string, maxItems = 5) => {
  const category = getProgrammaticSeeds().find((item) => item.slug === toSlug(categorySlug));
  if (!category) return [];
  return category.keywords
    .filter((keyword) => keyword !== toSlug(keywordSlug))
    .slice(0, maxItems)
    .map((keyword) => ({
      href: `/seo/${category.slug}/${keyword}`,
      label: keywordSlugToLabel(keyword),
    }));
};
