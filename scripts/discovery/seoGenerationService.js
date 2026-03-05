const slugify = (value) =>
  String(value || "produto-fitness")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "produto-fitness";

export function seoGenerationService(candidate) {
  const slugBase = `${slugify(candidate?.title)}-${String(candidate?.external_product_id || "ml")}`
    .toLowerCase();

  const title = `${candidate?.title || "Produto Fitness"} com melhor preco no Mercado Livre`;
  const metaDescription = `Oferta monitorada para ${candidate?.title || "produto fitness"}. Compare preco, desconto e sinais de demanda para decidir a compra.`;

  const faq = [
    {
      question: "Este produto esta em promocao real?",
      answer: `Sim. O sistema detectou desconto aproximado de ${Number(candidate?.discount_percent || 0).toFixed(2)}% com sinais de demanda.`,
    },
    {
      question: "Este link leva para o Mercado Livre?",
      answer: "Sim. O link afiliado leva direto para a pagina do produto no Mercado Livre.",
    },
  ];

  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: candidate?.title || "Produto Fitness",
    offers: {
      "@type": "Offer",
      priceCurrency: "BRL",
      price: Number(candidate?.current_price || 0),
      availability: Number(candidate?.stock || 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: candidate?.affiliate_link || candidate?.product_url || null,
    },
  };

  return {
    slug: slugBase,
    title,
    meta_description: metaDescription,
    seo_description: `${metaDescription} Score de oportunidade ${candidate?.opportunity_score || 0}/100 e viralidade ${candidate?.viral_score || 0}/100.`,
    faq_json: faq,
    schema_json: schema,
  };
}
