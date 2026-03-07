import { useEffect } from 'react';

// Interface para resolver o erro "Property description is missing"
interface SEOHeadProps {
  title: string;
  description?: string; // O "?" torna a descrição opcional
  ogType?: string;
  ogImage?: string;
  canonicalPath?: string;
  noindex?: boolean;
}

const upsertMetaByName = (name: string, content: string) => {
  let tag = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", name);
    document.head.appendChild(tag);
  }
  tag.content = content;
};

const upsertMetaByProperty = (property: string, content: string) => {
  let tag = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("property", property);
    document.head.appendChild(tag);
  }
  tag.content = content;
};

const upsertCanonical = (href: string) => {
  let linkTag = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!linkTag) {
    linkTag = document.createElement("link");
    linkTag.setAttribute("rel", "canonical");
    document.head.appendChild(linkTag);
  }
  linkTag.href = href;
};

export default function SEOHead({ title, description, ogType, ogImage, canonicalPath, noindex }: SEOHeadProps) {
  useEffect(() => {
    // 1. Atualiza o Título do Navegador
    const baseTitle = 'ArsenalFit';
    document.title = title ? `${title} | ${baseTitle}` : `${baseTitle} - Melhores Ofertas Fitness`;

    // 2. Atualiza meta description e robots
    const resolvedDescription =
      description ||
      'Tecnologia de monitoramento de preços para suplementos e equipamentos fitness. Economize com ofertas reais verificadas.';
    upsertMetaByName("description", resolvedDescription);
    upsertMetaByName("robots", noindex ? "noindex, nofollow" : "index, follow");

    const url = typeof window !== 'undefined' ? window.location.href : undefined;
    const canonicalUrl =
      canonicalPath && typeof window !== "undefined"
        ? `${window.location.origin}${canonicalPath}`
        : url;
    if (canonicalUrl) upsertCanonical(canonicalUrl);

    // 3. Atualiza Tags de Redes Sociais (Open Graph)
    const ogTags = [
      { property: 'og:title', content: title || 'ArsenalFit' },
      { property: 'og:description', content: resolvedDescription },
      { property: 'og:type', content: ogType || 'website' },
      { property: 'og:image', content: ogImage || '/og-image.png' }, // Adicione uma imagem na pasta public depois
      ...(canonicalUrl ? [{ property: 'og:url', content: canonicalUrl }] : []),
      { property: 'og:site_name', content: 'ArsenalFit' },
    ];

    ogTags.forEach(({ property, content }) => {
      upsertMetaByProperty(property, content);
    });

    // 4. Twitter cards
    upsertMetaByName("twitter:card", "summary_large_image");
    upsertMetaByName("twitter:title", title || "ArsenalFit");
    upsertMetaByName("twitter:description", resolvedDescription);
    upsertMetaByName("twitter:image", ogImage || "/og-image.png");
  }, [title, description, ogType, ogImage, canonicalPath, noindex]);

  return null;
}
