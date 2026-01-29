import { useProducts } from '@/hooks/useProducts';
import { Navbar } from '@/Components/Navbar';
import { OfferCard } from '@/Components/OfferCard';
import { Zap, Loader2 } from 'lucide-react';

export default function Offers() {
  // Pegamos os produtos do hook
  const { loading, getOnSaleProducts } = useProducts();
  const onSaleProducts = getOnSaleProducts();

  return (
    <div className="min-h-screen bg-zinc-950">
      <Navbar />
      
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
        ) : onSaleProducts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {onSaleProducts.map((product) => (
              // Usamos o "as any" aqui apenas se o erro de tipagem persistir entre os arquivos
              <OfferCard key={product.id} product={product as any} />
            ))}
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





