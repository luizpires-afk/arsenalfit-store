import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Zap, TrendingDown, Timer } from 'lucide-react';
import { PriceDisclaimer } from '@/Components/PriceDisclaimer';
import {
  buildOutProductPath,
  resolveOfferUrl,
} from '@/lib/offer.js';
import { resolvePricePresentation } from '@/lib/pricing.js';

// Interface para remover o erro de "any"
interface Product {
  id: string;
  name: string;
  price: number;
  original_price: number | null;
  pix_price?: number | null;
  pix_price_source?: string | null;
  image_url: string;
  affiliate_link: string | null;
  source_url?: string | null;
  marketplace?: string | null;
  status?: string | null;
  is_active?: boolean | null;
  updated_at: string;
  ultima_verificacao?: string | null;
}

export default function MelhoresOfertas() {
  const { data: products, isLoading } = useQuery({
    queryKey: ['best-offers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .eq('is_blocked', false)
        .or('auto_disabled_reason.is.null,auto_disabled_reason.neq.blocked')
        .lt('price', 'original_price') 
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      return data as Product[]; // Tipagem forçada para o array de produtos
    }
  });

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-zinc-950 text-white py-16 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-primary/20 text-primary px-4 py-2 rounded-full mb-6 border border-primary/30">
            <Zap size={16} className="fill-current text-[#a3e635]" />
            <span className="text-xs font-black uppercase italic text-[#a3e635]">Radar de Preços Ativo</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black italic uppercase tracking-tighter">
            Melhores <span className="text-[#a3e635]">Ofertas</span>
          </h1>
          <p className="text-zinc-400 mt-4 max-w-xl mx-auto font-medium">
            Nosso robô monitora os preços do Mercado Livre 24h por dia e lista aqui as maiores quedas de preço em tempo real.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-12">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="h-80 bg-zinc-100 rounded-[32px]" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {products?.map((product: Product) => {
              const pricing = resolvePricePresentation(product);
              const finalPrice = pricing.displayPricePrimary;
              const listPrice = pricing.displayStrikethrough;
              const secondaryPrice = pricing.displayPriceSecondary;
              const discount = pricing.discountPercent ?? 0;
              const offerResolution = resolveOfferUrl(product);
              const canOpen = Boolean(offerResolution.canRedirect && product.id);
              const lastUpdated = product.updated_at
                ? new Date(product.updated_at)
                : product.ultima_verificacao
                  ? new Date(product.ultima_verificacao)
                  : null;
              
              return (
                <div key={product.id} className="group relative bg-white border border-zinc-100 rounded-[40px] p-6 hover:shadow-2xl transition-all hover:-translate-y-2">
                  <div className="absolute top-6 right-6 z-10 bg-red-600 text-white px-4 py-2 rounded-2xl font-black italic flex items-center gap-1 shadow-lg">
                    <TrendingDown size={16} /> -{discount}%
                  </div>
                  
                  <img 
                    src={product.image_url || '/placeholder.svg'} 
                    alt={product.name}
                    className="w-full h-64 object-contain mb-6 group-hover:scale-105 transition-transform"
                  />
                  
                  <h3 className="font-black italic uppercase text-xl mb-2 line-clamp-2">{product.name}</h3>
                  
                  <div className="flex items-end gap-3 mb-6">
                    <span className="text-3xl font-black text-zinc-900 italic">R$ {finalPrice.toFixed(2).replace('.', ',')}</span>
                    {listPrice && listPrice > finalPrice && (
                      <span className="text-zinc-400 line-through font-bold mb-1">R$ {listPrice.toFixed(2).replace('.', ',')}</span>
                    )}
                  </div>
                  {secondaryPrice !== null && secondaryPrice > finalPrice && (
                    <p className="text-xs text-zinc-500 -mt-4 mb-4">
                      ou R$ {secondaryPrice.toFixed(2).replace('.', ',')} em outros meios
                    </p>
                  )}

                  <a 
                    href={canOpen ? buildOutProductPath(product.id, 'melhores_ofertas') : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`block w-full text-center py-5 rounded-2xl font-black uppercase italic transition-colors ${
                      canOpen
                        ? 'bg-zinc-900 text-white hover:bg-[#a3e635] hover:text-black'
                        : 'bg-zinc-300 text-zinc-500 cursor-not-allowed pointer-events-none'
                    }`}
                  >
                    {canOpen ? 'Aproveitar Agora' : 'Aguardando validacao'}
                  </a>

                  <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-zinc-400 font-semibold">
                    <Timer size={12} />
                    <PriceDisclaimer
                      lastUpdated={lastUpdated}
                      className="text-[10px] text-zinc-400 font-semibold"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

