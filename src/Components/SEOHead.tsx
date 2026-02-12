import { useEffect } from 'react';

// Interface para resolver o erro "Property description is missing"
interface SEOHeadProps {
  title: string;
  description?: string; // O "?" torna a descrição opcional
  ogType?: string;
  ogImage?: string;
}

export default function SEOHead({ title, description, ogType, ogImage }: SEOHeadProps) {
  useEffect(() => {
    // 1. Atualiza o Título do Navegador
    const baseTitle = 'ArsenalFit';
    document.title = title ? `${title} | ${baseTitle}` : `${baseTitle} - Melhores Ofertas Fitness`;

    // 2. Atualiza ou cria a Meta Description
    let metaDescription = document.querySelector('meta[name="description"]') as HTMLMetaElement;
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.name = 'description';
      document.head.appendChild(metaDescription);
    }
    metaDescription.content = description || 'Tecnologia de monitoramento de preços para suplementos e equipamentos fitness. Economize com ofertas reais verificadas.';

    const url = typeof window !== 'undefined' ? window.location.href : undefined;

    // 3. Atualiza Tags de Redes Sociais (Open Graph)
    const ogTags = [
      { property: 'og:title', content: title || 'ArsenalFit' },
      { property: 'og:description', content: description || 'As melhores ofertas fitness monitoradas em tempo real.' },
      { property: 'og:type', content: ogType || 'website' },
      { property: 'og:image', content: ogImage || '/og-image.png' }, // Adicione uma imagem na pasta public depois
      ...(url ? [{ property: 'og:url', content: url }] : []),
      { property: 'og:site_name', content: 'ArsenalFit' },
    ];

    ogTags.forEach(({ property, content }) => {
      let tag = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement;
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute('property', property);
        document.head.appendChild(tag);
      }
      tag.content = content;
    });
  }, [title, description, ogType, ogImage]);

  return null;
}
