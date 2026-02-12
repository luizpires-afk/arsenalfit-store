import { useProducts } from '@/hooks/useProducts';
import { OfferCard } from '@/Components/OfferCard';
import { Zap, Loader2 } from 'lucide-react';

export default function Offers() {
  // Pegamos os produtos do hook
  const { loading, getOnSaleProducts, getDailyDeals } = useProducts();
  const dailyDeals = getDailyDeals();
  const onSaleProducts = getOnSaleProducts();
  const dailyDealIds = new Set(dailyDeals.map((item) => item.id));
  const otherSales = onSaleProducts.filter((item) => !dailyDealIds.has(item.id));

  return (
    <div className="min-h-screen bg-zinc-950">
      
      <main id="main-content" className="container py-12 px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#a3e635]/10 border border-[#a3e635]/20 mb-6">
            <Zap className="h-4 w-4 text-[#a3e635] fill-[#a3e635]" />
            <span className="text-[#a3e635] font-black italic text-xs uppercase tracking-widest">Radar de Preços</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-black italic text-white mb-4 tracking-tighter">
            MELHORES <span className="text-[#a3e635]">OFERTAS</span>
          </h1>
          <p className="text-zinc-500 max-w-lg mx-auto font-medium">
            Nossa inteligência artificial monitora os preços 24h por dia para garantir o menor valor.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4" role="status" aria-live="polite">
            <Loader2 className="h-10 w-10 animate-spin text-[#a3e635]" />
            <p className="text-zinc-500 font-bold italic animate-pulse">SINCRONIZANDO COM O ROBÔ...</p>
          </div>
        ) : dailyDeals.length > 0 || onSaleProducts.length > 0 ? (
          <div className="space-y-12">
            {dailyDeals.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-black italic text-white">
                      OFERTAS DO <span className="text-[#a3e635]">DIA</span>
                    </h2>
                    <p className="text-zinc-500 text-sm">
                      Produtos que baixaram de preço nas últimas 24h.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                  {dailyDeals.map((product) => (
                    <OfferCard key={product.id} product={product as any} />
                  ))}
                </div>
              </section>
            )}

            {otherSales.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-black italic text-white">
                      PROMOÇÕES ATIVAS
                    </h2>
                    <p className="text-zinc-500 text-sm">
                      Ofertas monitoradas que seguem com desconto.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                  {otherSales.map((product) => (
                    <OfferCard key={product.id} product={product as any} />
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="text-center py-32 border-2 border-dashed border-zinc-900 rounded-[40px]" role="status" aria-live="polite">
            <Zap className="h-16 w-16 text-zinc-800 mx-auto mb-4" />
            <h3 className="text-2xl font-black italic text-zinc-600 mb-2 uppercase">
              Área em Manutenção
            </h3>
            <p className="text-zinc-700 font-bold">
              O robô está caçando novos descontos. Volte em alguns minutos!
            </p>
          </div>
        )}
      </main>
    </div>
  );
}





