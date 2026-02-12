import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Flame, Loader2, Package } from "lucide-react";
import { ProductCard } from "@/Components/ProductCard";
import SEOHead from "@/Components/SEOHead";
import { useProducts } from "@/hooks/useProducts";

const normalize = (value?: string | null) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const resolveCollection = (key?: string) => {
  const normalized = normalize(key);
  if (normalized.includes("whey")) {
    return { key: "whey", title: "Arsenal: Whey", subtitle: "Os melhores Whey do ArsenalFit." };
  }
  if (normalized.includes("roupa") || normalized.includes("vestu")) {
    return {
      key: "roupas",
      title: "Arsenal: Roupas",
      subtitle: "Encontre as melhores roupas para o seu treino.",
    };
  }
  if (normalized.includes("acessor")) {
    return {
      key: "acessorios",
      title: "Arsenal: Acessórios",
      subtitle: "Acessórios essenciais para treinar com performance.",
    };
  }
  if (normalized.includes("equip")) {
    return {
      key: "equipamentos",
      title: "Arsenal: Equipamentos",
      subtitle: "Equipamentos que elevam sua rotina.",
    };
  }
  if (normalized.includes("suplement")) {
    return {
      key: "suplementos",
      title: "Arsenal: Suplementos",
      subtitle: "Suplementos com melhor custo-benefício.",
    };
  }
  return { key: "suplementos", title: "Arsenal: Suplementos", subtitle: "Seleção de elite." };
};

export default function ArsenalCollection() {
  const { collection } = useParams();
  const { products, loading } = useProducts();
  const info = resolveCollection(collection);

  const filtered = useMemo(() => {
    const list = (products || []).filter((product: any) => {
      const name = normalize(product?.name);
      const categoryName = normalize(product?.category?.name || product?.category_name);
      const categorySlug = normalize(product?.category?.slug || "");

      if (info.key === "whey") return name.includes("whey");
      if (info.key === "roupas") return categoryName.includes("roupa") || categoryName.includes("vestu") || categorySlug.includes("roupa");
      if (info.key === "acessorios") return categoryName.includes("acessor") || categorySlug.includes("acessor");
      if (info.key === "equipamentos") return categoryName.includes("equip") || categorySlug.includes("equip");
      if (info.key === "suplementos") return categoryName.includes("suplement") || categorySlug.includes("suplement");
      return false;
    });

    const scored = list.sort((a: any, b: any) => {
      const aDiscount = Number(a.discount_percentage || 0);
      const bDiscount = Number(b.discount_percentage || 0);
      const aBest = aDiscount >= 20 ? 1 : 0;
      const bBest = bDiscount >= 20 ? 1 : 0;
      if (aBest !== bBest) return bBest - aBest;
      const aPromo = aDiscount > 0 || a.is_on_sale ? 1 : 0;
      const bPromo = bDiscount > 0 || b.is_on_sale ? 1 : 0;
      if (aPromo !== bPromo) return bPromo - aPromo;
      const aClicks = Number(a.clicks_count || 0);
      const bClicks = Number(b.clicks_count || 0);
      return bClicks - aClicks;
    });

    return scored.slice(0, 15);
  }, [products, info.key]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <SEOHead title={info.title} description={info.subtitle} />

      <main id="main-content" className="container mx-auto py-24 px-4">
        <div className="mb-12">
          <Link
            to="/"
            className="text-zinc-400 hover:text-[#a3e635] flex items-center gap-2 mb-8 transition-colors w-fit"
          >
            <ArrowLeft size={16} /> Voltar para Home
          </Link>

          <div className="text-center">
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.4em] text-zinc-500 mb-4">
              <Flame className="h-4 w-4 text-[#a3e635]" /> Seleção ArsenalFit
            </div>
            <h1 className="text-5xl md:text-7xl font-black italic text-white mb-4 tracking-tighter uppercase leading-none">
              {info.title.split(":")[0].toUpperCase()}{" "}
              <span className="text-[#a3e635]">{info.title.split(":")[1]?.trim().toUpperCase()}</span>
            </h1>
            <p className="text-zinc-500 max-w-xl mx-auto font-medium">{info.subtitle}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4" role="status" aria-live="polite">
            <Loader2 className="h-12 w-12 animate-spin text-[#a3e635]" />
            <p className="text-zinc-500 font-black tracking-widest uppercase animate-pulse">
              Sincronizando Arsenal...
            </p>
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {filtered.map((product: any) => (
              <ProductCard key={product.id} product={product as any} />
            ))}
          </div>
        ) : (
          <div className="text-center py-32 border-2 border-dashed border-zinc-900 rounded-[50px] bg-zinc-900/20" role="status" aria-live="polite">
            <Package className="h-16 w-16 text-zinc-800 mx-auto mb-4" />
            <h3 className="text-2xl font-black italic text-zinc-600 mb-2 uppercase">
              Arsenal em atualização
            </h3>
            <p className="text-zinc-500 font-bold max-w-xs mx-auto">
              Estamos reabastecendo essa seleção com novas ofertas de elite.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
