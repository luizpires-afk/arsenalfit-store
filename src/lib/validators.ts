// Validadores de links de afiliado - ACEITA links encurtados como /sec/

/**
 * Valida links do Mercado Livre
 * Aceita formatos:
 * - https://www.mercadolivre.com.br/produto-xxx
 * - https://mercadolivre.com.br/produto-xxx
 * - https://mercadolivre.com/sec/xxxxx (links encurtados de afiliado)
 * - https://www.mercadolivre.com/sec/xxxxx
 * - https://produto.mercadolivre.com.br/MLB-xxxxx
 */
export function isValidMercadoLivreLink(url: string): boolean {
  if (!url) return false;
  
  const patterns = [
    // Links de produto padrão
    /^https?:\/\/(www\.)?mercadolivre\.com\.br\/.+/i,
    // Links encurtados de afiliado (/sec/)
    /^https?:\/\/(www\.)?mercadolivre\.com\/sec\/[a-zA-Z0-9]+/i,
    // Links de produto com subdomain
    /^https?:\/\/produto\.mercadolivre\.com\.br\/MLB-\d+/i,
    // Links de item
    /^https?:\/\/(www\.)?mercadolivre\.com\.br\/p\/MLB\d+/i,
  ];

  return patterns.some(pattern => pattern.test(url));
}

/**
 * Extrai o ID MLB de um link do Mercado Livre (ou texto contendo MLB)
 */
export function extractMercadoLivreId(input: string): string | null {
  if (!input) return null;
  const value = input.trim();
  // 0) item_id=MLB123... (pdp_filters etc.)
  const itemId = value.match(/item_id%3AMLB(\d+)/i) || value.match(/[?&#]item_id=MLB(\d+)/i);
  if (itemId) return `MLB${itemId[1]}`;
  // 1) ID canônico no caminho: .../p/MLB123...
  const canonical = value.match(/\/p\/MLB(\d+)/i);
  if (canonical) return `MLB${canonical[1]}`;
  // 2) Parâmetro wid=MLB123...
  const wid = value.match(/[?&#]wid=MLB(\d+)/i);
  if (wid) return `MLB${wid[1]}`;
  // 3) Parâmetro id=MLB123...
  const pid = value.match(/[?&#]id=MLB(\d+)/i);
  if (pid) return `MLB${pid[1]}`;
  // 4) Qualquer MLB-123/MLB123 no texto
  const match = value.match(/MLB-?(\d+)/i);
  return match ? `MLB${match[1]}` : null;
}

/**
 * Valida links da Amazon
 * Aceita formatos:
 * - https://www.amazon.com.br/dp/ASIN
 * - https://amazon.com.br/produto-xxx
 * - https://amzn.to/xxxxx (links encurtados)
 * - https://www.amazon.com/dp/ASIN
 */
export function isValidAmazonLink(url: string): boolean {
  if (!url) return false;
  
  const patterns = [
    // Links padrão Amazon Brasil e EUA
    /^https?:\/\/(www\.)?amazon\.com(\.br)?\/.*$/i,
    // Links encurtados
    /^https?:\/\/amzn\.to\/[a-zA-Z0-9]+/i,
    // Links de afiliado com tag
    /^https?:\/\/(www\.)?amazon\.com(\.br)?\/.*[?&]tag=/i,
  ];

  return patterns.some(pattern => pattern.test(url));
}

/**
 * Valida qualquer link de afiliado suportado
 */
export function isValidAffiliateLink(url: string): { valid: boolean; marketplace: string | null; error?: string } {
  if (!url || url.trim() === '') {
    return { valid: true, marketplace: null }; // Link vazio é válido (produto manual)
  }

  const trimmedUrl = url.trim();

  // Verifica se é uma URL válida
  try {
    new URL(trimmedUrl);
  } catch {
    return { valid: false, marketplace: null, error: 'URL inválida. Verifique o formato do link.' };
  }

  // Verifica Mercado Livre
  if (trimmedUrl.includes('mercadolivre') || trimmedUrl.includes('mercadolibre')) {
    if (isValidMercadoLivreLink(trimmedUrl)) {
      return { valid: true, marketplace: 'mercadolivre' };
    }
    return { 
      valid: false, 
      marketplace: null, 
      error: 'Link do Mercado Livre inválido. Aceitos: links de produto, /sec/ ou MLB.' 
    };
  }

  // Verifica Amazon
  if (trimmedUrl.includes('amazon') || trimmedUrl.includes('amzn.to')) {
    if (isValidAmazonLink(trimmedUrl)) {
      return { valid: true, marketplace: 'amazon' };
    }
    return { 
      valid: false, 
      marketplace: null, 
      error: 'Link da Amazon inválido. Use o link direto do produto ou amzn.to.' 
    };
  }

  // Qualquer outro link é tratado como manual
  return { valid: true, marketplace: 'manual' };
}

/**
 * Detecta o marketplace baseado na URL
 */
export function detectMarketplace(url: string): 'amazon' | 'mercadolivre' | 'manual' {
  if (!url) return 'manual';
  
  if (url.includes('amazon') || url.includes('amzn.to')) return 'amazon';
  if (url.includes('mercadolivre') || url.includes('mercadolibre')) return 'mercadolivre';
  
  return 'manual';
}

/**
 * Gera um slug a partir do nome do produto
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9\s-]/g, '') // Remove caracteres especiais
    .replace(/\s+/g, '-') // Substitui espaços por hífens
    .replace(/-+/g, '-') // Remove hífens duplicados
    .replace(/^-|-$/g, ''); // Remove hífens do início e fim
}

/**
 * Formata preço em BRL
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(price);
}

/**
 * Calcula desconto percentual
 */
export function calculateDiscount(originalPrice: number, currentPrice: number): number {
  if (!originalPrice || originalPrice <= currentPrice) return 0;
  return Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
}

