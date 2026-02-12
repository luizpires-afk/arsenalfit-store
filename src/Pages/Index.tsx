import { useMemo } from "react"
import { Dumbbell, TrendingUp, Zap } from "lucide-react"

import { ProductCard } from "@/Components/ProductCard"
import { Skeleton } from "@/Components/ui/skeleton"
import { useProducts } from "@/hooks/useProducts"

export default function Index() {
  const productsState = useProducts()

  // Blindagem contra hook quebrado
  const products = productsState?.products ?? []
  const loading = productsState?.loading ?? false

  const featuredProducts = useMemo(() => {
    return products.filter((p: any) => p.is_featured === true)
  }, [products])

  const activeProducts = useMemo(() => {
    return products.filter((p: any) => p.is_active === true)
  }, [products])

  return (
    <div className="min-h-screen bg-background">

      {/* HERO */}
      <section className="bg-zinc-950 py-24 text-center">
        <div className="flex justify-center mb-6">
          <div className="p-4 rounded-3xl bg-lime-500">
            <Dumbbell className="h-12 w-12 text-black" />
          </div>
        </div>

        <h1 className="text-6xl font-black italic text-white">
          Fit<span className="text-lime-500">Store</span>
        </h1>

        <p className="text-zinc-400 mt-4">
          Plataforma carregada com sucesso.
        </p>

        <div className="flex justify-center gap-4 mt-8">
          <span className="flex items-center gap-2 bg-zinc-900 px-4 py-2 rounded-full text-white text-xs">
            <TrendingUp className="h-4 w-4 text-lime-500" />
            Qualidade Elite
          </span>
          <span className="flex items-center gap-2 bg-zinc-900 px-4 py-2 rounded-full text-white text-xs">
            <Zap className="h-4 w-4 text-lime-500" />
            Entrega Rápida
          </span>
        </div>
      </section>

      {/* PRODUTOS */}
      <section className="container mx-auto px-4 py-16">
        {loading ? (
          <div className="grid grid-cols-4 gap-8">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </div>
        ) : activeProducts.length === 0 ? (
          <div className="text-center text-zinc-400 py-24">
            Nenhum produto ativo encontrado
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-8">
            {activeProducts.map((product: any) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}



