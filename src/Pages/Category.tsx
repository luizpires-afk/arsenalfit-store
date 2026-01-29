import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Search,
  Dumbbell,
  Pill,
  Shirt,
  LayoutGrid,
  ArrowLeft,
  SlidersHorizontal,
  Watch,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { Button } from "@/Components/ui/button";
import { Header } from "@/Components/Header";
import { ProductCard } from "@/Components/ProductCard";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/Components/ui/select";

import type { Product } from "@/types/database";

// Workaround tipagem Radix/Shadcn
const ST = SelectTrigger as any;
const SC = SelectContent as any;
const SI = SelectItem as any;

type CategoryKey = "suplementos" | "equipamentos" | "roupas" | "acessorios";

const categoryInfo: Record<
  CategoryKey,
  {
    label: string;
    description: string;
    icon: any;
    image: string;
    color: string;
  }
> = {
  suplementos: {
    label: "Suplementos",
    description: "Combustível de alta performance para seus músculos.",
    icon: Pill,
    image: "https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=1200",
    color: "text-primary",
  },
  equipamentos: {
    label: "Equipamentos",
    description: "Forja o teu corpo com ferramentas de aço.",
    icon: Dumbbell,
    image: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200",
    color: "text-blue-500",
  },
  roupas: {
    label: "Vestuário",
    description: "Armadura técnica para o campo de batalha.",
    icon: Shirt,
    image: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200",
    color: "text-purple-500",
  },
  acessorios: {
    label: "Acessórios",
    description: "Tecnologia e precisão para cada repetição.",
    icon: Watch,
    image: "https://images.unsplash.com/photo-1576243345690-4e4b79b63288?w=1200",
    color: "text-orange-500",
  },
};

/**
 * Ajusta o Product (Supabase) para o formato exato que o ProductCard espera.
 * Regra importante:
 * - campos opcionais do card: use undefined
 * - campos que o card tipa como `string | null` (ex.: affiliate_link, image_url): mantenha null (nunca undefined)
 */
function toCardProduct(p: Product) {
  return {
    id: p.id,

    title: (p as any).title ?? undefined,
    name: p.name ?? undefined,

    description: p.description ?? undefined,

    price: p.price,

    // Card espera number | undefined
    original_price: p.original_price ?? undefined,

    // se seu card tipa isso como number | undefined, manter assim
    discount_percentage: p.discount_percentage ?? undefined,

    // Card espera string | null
    image_url: p.image_url ?? null,

    // Card espera string[] | undefined
    images: p.images ?? undefined,

    // OK. Card espera string | null (NUNCA undefined)
    affiliate_link: p.affiliate_link ?? null,

    // se o card usa slug como string | undefined
    slug: p.slug ?? undefined,

    marketplace: (p as any).marketplace ?? undefined,
  };
}

export default function Category() {
  const { slug } = useParams<{ slug?: string }>();
  const [searchParams] = useSearchParams();

  const rawCat = (slug || searchParams.get("cat") || "suplementos") as CategoryKey;
  const categoryId: CategoryKey = categoryInfo[rawCat] ? rawCat : "suplementos";

  const category = categoryInfo[categoryId];
  const Icon = category.icon;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "price_asc" | "price_desc">(
    "newest"
  );

  useEffect(() => {
    let alive = true;

    async function fetchProducts() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("products")
          .select(
            `
            *,
            categories!inner(slug)
          `
          )
          .eq("categories.slug", categoryId);

        if (error) throw error;
        if (!alive) return;

        setProducts(((data as unknown) as Product[]) || []);
      } catch (err) {
        console.error("Erro ao buscar produtos:", err);
        if (!alive) return;
        setProducts([]);
      } finally {
        if (alive) setLoading(false);
      }
    }

    fetchProducts();
    return () => {
      alive = false;
    };
  }, [categoryId]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return [...products]
      .filter((p) => (p.name || "").toLowerCase().includes(q))
      .sort((a, b) => {
        if (sortBy === "price_asc") return (a.price || 0) - (b.price || 0);
        if (sortBy === "price_desc") return (b.price || 0) - (a.price || 0);

        const da = new Date(a.created_at || 0).getTime();
        const db = new Date(b.created_at || 0).getTime();
        return db - da;
      });
  }, [products, searchQuery, sortBy]);

  return (
    <div className="min-h-screen bg-background text-white selection:bg-primary selection:text-black">
      <Header />

      {/* HERO SECTION */}
      <div className="relative h-[45vh] min-h-[350px] overflow-hidden">
        <motion.div
          initial={{ scale: 1.1 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1.5 }}
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${category.image})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-transparent" />

        <div className="relative container h-full flex flex-col justify-end pb-12 px-4">
          <Link
            to="/categorias"
            className="flex items-center gap-2 text-zinc-500 hover:text-primary mb-8 transition-all group w-fit"
          >
            <div className="p-2 rounded-full bg-zinc-900 group-hover:bg-primary group-hover:text-black transition-colors">
              <ArrowLeft size={16} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.3em]">
              Explorar Arsenal
            </span>
          </Link>

          <div className="flex flex-col md:flex-row md:items-end gap-6">
            <motion.div
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              className={`p-6 rounded-[35px] bg-zinc-900/90 backdrop-blur-2xl border border-white/10 shadow-2xl ${category.color} w-fit`}
            >
              <Icon size={48} strokeWidth={2.5} />
            </motion.div>

            <div className="space-y-2">
              <motion.h1
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="text-7xl md:text-8xl font-black uppercase italic tracking-tighter leading-[0.8]"
              >
                {category.label}
              </motion.h1>
              <p className="text-zinc-400 font-bold uppercase tracking-[0.2em] text-xs ml-2">
                {category.description}
              </p>
            </div>
          </div>
        </div>
      </div>

      <main id="main-content" className="container py-12 px-4">
        {/* FILTROS */}
        <div className="flex flex-col lg:flex-row gap-6 items-center justify-between bg-zinc-900/30 p-4 rounded-[40px] border border-white/5 backdrop-blur-sm mb-16">
          <div className="relative w-full lg:max-w-md group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-primary transition-colors h-4 w-4" />
            <input
              type="text"
              placeholder={`Pesquisar em ${category.label.toLowerCase()}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-14 bg-black/40 border border-white/10 rounded-[25px] pl-14 pr-6 text-sm focus:border-primary/50 outline-none transition-all placeholder:text-zinc-700"
            />
          </div>

          <div className="flex items-center gap-4 w-full lg:w-auto">
            <div className="hidden sm:flex items-center gap-2 text-zinc-500 mr-2">
              <SlidersHorizontal size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">Filtrar</span>
            </div>

            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <ST className="w-full lg:w-56 bg-black/40 border-white/10 rounded-[25px] h-14 font-black uppercase italic text-[11px] tracking-widest hover:border-primary/40 transition-all">
                <SelectValue placeholder="Ordenar por" />
              </ST>

              <SC className="bg-zinc-950 border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl">
                <SI value="newest" className="py-3 font-black uppercase italic text-[10px] focus:bg-primary focus:text-black">
                  Novas Entradas
                </SI>
                <SI value="price_asc" className="py-3 font-black uppercase italic text-[10px] focus:bg-primary focus:text-black">
                  Menor Investimento
                </SI>
                <SI value="price_desc" className="py-3 font-black uppercase italic text-[10px] focus:bg-primary focus:text-black">
                  Elite (Maior Preço)
                </SI>
              </SC>
            </Select>
          </div>
        </div>

        {/* GRID */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className="h-[450px] bg-zinc-900/40 rounded-[45px] animate-pulse border border-white/5"
              />
            ))}
          </div>
        ) : (
          <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
            <AnimatePresence mode="popLayout">
              {filteredProducts.map((product) => (
                <motion.div
                  key={product.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3 }}
                >
                  <ProductCard product={toCardProduct(product)} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {/* SEM RESULTADOS */}
        {!loading && filteredProducts.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-32 bg-zinc-900/20 rounded-[50px] border-2 border-dashed border-zinc-800"
            role="status"
            aria-live="polite"
          >
            <LayoutGrid size={48} className="mx-auto text-zinc-800 mb-6" />
            <h3 className="text-3xl font-black uppercase italic text-zinc-600 tracking-tighter">
              Estoque Esgotado
            </h3>
            <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mt-2">
              Tente ajustar seus filtros de busca
            </p>
            <Button
              variant="outline"
              onClick={() => setSearchQuery("")}
              className="mt-8 border-primary text-primary hover:bg-primary hover:text-black font-black uppercase italic rounded-xl transition-all"
            >
              Resetar Arsenal
            </Button>
          </motion.div>
        )}
      </main>
    </div>
  );
}


