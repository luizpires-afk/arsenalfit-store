import { useProducts } from '@/hooks/useProducts';
import { Navbar } from '@/Components/Navbar';
import { ProductCard } from '@/Components/ProductCard'; 
import { Package, Loader2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import SEOHead from '@/Components/SEOHead';

export default function Products() {
  const { products, loading } = useProducts();

  return (
    <div className="min-h-screen bg-zinc-950">
      <SEOHead 
        title="Estoque Completo" 
        description="Explore todo o arsenal de suplementos e equipamentos da ArsenalFit." 
      />
      <Navbar />
      
      <main id="main-content" className="container mx-auto py-24 px-4">
        {/* Navegação e Header */}
        <div className="mb-12">
          <Link to="/" className="text-zinc-500 hover:text-[#a3e635] flex items-center gap-2 mb-8 transition-colors w-fit">
            <ArrowLeft size={16} /> Voltar para Home
          </Link>
          
          <div className="text-center">
            <h1 className="text-5xl md:text-7xl font-black italic text-white mb-4 tracking-tighter uppercase leading-none">
              ESTOQUE <span className="text-[#a3e635]">COMPLETO</span>
            </h1>
            <p className="text-zinc-500 max-w-md mx-auto font-medium">
              Equipe sua rotina com os suplementos de maior pureza e equipamentos de elite do mercado.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4" role="status" aria-live="polite">
            <Loader2 className="h-12 w-12 animate-spin text-[#a3e635]" />
            <p className="text-zinc-500 font-black tracking-widest uppercase animate-pulse">
              Sincronizando Arsenal...
            </p>
          </div>
        ) : products && products.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {products.map((product) => (
              <ProductCard key={product.id} product={product as any} />
            ))}
          </div>
        ) : (
          <div className="text-center py-32 border-2 border-dashed border-zinc-900 rounded-[50px] bg-zinc-900/20" role="status" aria-live="polite">
            <Package className="h-16 w-16 text-zinc-800 mx-auto mb-4" />
            <h3 className="text-2xl font-black italic text-zinc-600 mb-2 uppercase">
              Arsenal Esgotado
            </h3>
            <p className="text-zinc-500 font-bold max-w-xs mx-auto">
              Nossa equipe está reabastecendo o estoque com novas unidades de elite. Volte em breve!
            </p>
          </div>
        )}
      </main>
    </div>
  );
}




