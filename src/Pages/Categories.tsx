import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Flame } from "lucide-react";

import { Button } from "@/Components/ui/button";
import { supabase } from "@/lib/supabase";

type CategoryCard = {
  slug: string;
  label: string;
  description: string;
  imagePrimary: string;
  imageFallback: string;
  accentBg: string;
};

const normalizeImageUrl = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/") || trimmed.startsWith("http")) return trimmed;
  return `/${trimmed.replace(/^\.?\//, "")}`;
};

const sanitizeImageUrl = (value: string) => {
  const encoded = encodeURI(value);
  return encoded.replace(/["'()]/g, (char) => {
    const hex = char.charCodeAt(0).toString(16).toUpperCase();
    return `%${hex}`;
  });
};

const normalizeLabel = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const CATEGORY_IMAGE_FALLBACK = [
  {
    key: "suplement",
    image: "https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=1200",
  },
  {
    key: "equip",
    image: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200",
  },
  {
    key: "acessor",
    image: "https://images.unsplash.com/photo-1576243345690-4e4b79b63288?w=1200",
  },
  {
    key: "vitamin",
    image: "https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=1200",
  },
  {
    key: "roupa",
    image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=1200",
  },
];

const getCategoryImage = (label: string, slug?: string | null) => {
  const normalized = normalizeLabel(label);
  const normalizedSlug = normalizeLabel(slug ?? "");
  const found = CATEGORY_IMAGE_FALLBACK.find(
    (item) => normalized.includes(item.key) || normalizedSlug.includes(item.key),
  );
  return found?.image ?? null;
};

const CATEGORY_CARDS: CategoryCard[] = [
  {
    slug: "suplementos",
    label: "Suplementos",
    description: "Combustível de alta performance para seus músculos.",
    imagePrimary: "/hero/hero-5.jpg",
    imageFallback: "/hero/hero-5.jpg",
    accentBg: "bg-lime-400",
  },
  {
    slug: "acessorios",
    label: "Acessórios",
    description: "Tecnologia e precisão para cada repetição.",
    imagePrimary: "/hero/hero-2.jpg",
    imageFallback: "/hero/hero-2.jpg",
    accentBg: "bg-amber-400",
  },
  {
    slug: "roupas",
    label: "Roupas",
    description: "Armadura técnica para o campo de batalha.",
    imagePrimary: "/hero/hero-1.jpg",
    imageFallback: "/hero/hero-1.jpg",
    accentBg: "bg-rose-400",
  },
  {
    slug: "equipamentos",
    label: "Equipamentos",
    description: "Força bruta e controle total no treino.",
    imagePrimary: "/hero/hero-3.jpg",
    imageFallback: "/hero/hero-3.jpg",
    accentBg: "bg-sky-400",
  },
];

export default function Categories() {
  const [hotMap, setHotMap] = useState<Record<string, boolean>>({});
  const [imageMap, setImageMap] = useState<Record<string, string>>({});
  const reduceMotion = useReducedMotion();
  const [heroIndex, setHeroIndex] = useState(0);

  const slugs = useMemo(() => CATEGORY_CARDS.map((card) => card.slug), []);
  const cards = useMemo(
    () =>
      CATEGORY_CARDS.map((card) => ({
        ...card,
        imagePrimary: (() => {
          const fallbackFromHome =
            getCategoryImage(card.label, card.slug) || card.imageFallback;
          return sanitizeImageUrl(
            normalizeImageUrl(imageMap[card.slug]) || fallbackFromHome,
          );
        })(),
        imageFallback: sanitizeImageUrl(
          getCategoryImage(card.label, card.slug) || card.imageFallback,
        ),
      })),
    [imageMap],
  );

  useEffect(() => {
    let alive = true;

    const loadHot = async () => {
      try {
        const { data: categories, error } = await supabase
          .from("categories")
          .select("id, slug, image_url")
          .in("slug", slugs);

        if (error || !categories?.length) {
          if (!alive) return;
          setHotMap({});
          setImageMap({});
          return;
        }

        const idBySlug = new Map<string, string>();
        const slugById = new Map<string, string>();
        const nextImages: Record<string, string> = {};

        categories.forEach((cat) => {
          if (!cat?.id || !cat?.slug) return;
          idBySlug.set(cat.slug, cat.id);
          slugById.set(cat.id, cat.slug);
          const normalizedImage = normalizeImageUrl(cat.image_url);
          if (normalizedImage) {
            nextImages[cat.slug] = normalizedImage;
          }
        });

        if (!alive) return;
        setImageMap(nextImages);

        const ids = Array.from(idBySlug.values());
        if (!ids.length) {
          setHotMap({});
          return;
        }

        try {
          const { data: promoRows } = await supabase
            .from("products")
            .select("id, category_id, is_on_sale, discount_percentage")
            .in("category_id", ids)
            .or("is_on_sale.eq.true,discount_percentage.gte.10");

          const nextMap: Record<string, boolean> = {};
          slugs.forEach((slug) => {
            nextMap[slug] = false;
          });

          (promoRows || []).forEach((row) => {
            const slug = row.category_id ? slugById.get(row.category_id) : null;
            if (!slug) return;
            nextMap[slug] = true;
          });

          if (!alive) return;
          setHotMap(nextMap);
        } catch {
          if (!alive) return;
          setHotMap({});
        }
      } catch {
        if (!alive) return;
        setHotMap({});
      }
    };

    loadHot();
    return () => {
      alive = false;
    };
  }, [slugs]);

  const heroSlides = useMemo(
    () =>
      cards.map((card) => ({
        label: card.label,
        imagePrimary: card.imagePrimary,
        imageFallback: card.imageFallback,
      })),
    [cards],
  );

  useEffect(() => {
    if (reduceMotion) return;
    if (heroSlides.length <= 1) return;
    const id = window.setInterval(() => {
      setHeroIndex((current) => (current + 1) % heroSlides.length);
    }, 6500);
    return () => window.clearInterval(id);
  }, [reduceMotion, heroSlides.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (heroSlides.length <= 1) return;
    const next = heroSlides[(heroIndex + 1) % heroSlides.length];
    const imgPrimary = new Image();
    imgPrimary.src = next.imagePrimary;
    const imgFallback = new Image();
    imgFallback.src = next.imageFallback;
  }, [heroIndex, heroSlides]);

  const heroSlide = heroSlides[heroIndex % heroSlides.length] ?? heroSlides[0];

  return (
    <div className="min-h-screen bg-background text-white selection:bg-primary selection:text-black">

      <div className="relative min-h-[260px] overflow-hidden">
        <div className="absolute inset-0 bg-zinc-900 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={heroSlide?.label}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.8 }}
              className="absolute inset-0"
            >
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `url("${sanitizeImageUrl(heroSlide.imagePrimary)}"), url("${sanitizeImageUrl(heroSlide.imageFallback)}")`,
                  backgroundSize: "cover, cover",
                  backgroundPosition: "center, center",
                  backgroundRepeat: "no-repeat, no-repeat",
                }}
              />
              <div className="absolute inset-0 bg-black/35" />
            </motion.div>
          </AnimatePresence>
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/65 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/85 via-transparent to-transparent" />
        </div>

        <div className="relative container h-full flex flex-col gap-6 pt-6 pb-10 px-4">
          <Link
            to="/"
            className="group inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-[10px] font-black uppercase tracking-[0.35em] text-zinc-300 hover:text-white hover:border-white/30 transition-all"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white group-hover:bg-primary group-hover:text-black transition-colors">
              <ArrowLeft size={14} />
            </span>
            Voltar para o Arsenal
          </Link>

          <div className="relative max-w-4xl w-full mx-auto">
            <div className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-black/60 via-black/40 to-black/25 p-6 sm:p-7 shadow-[0_20px_56px_rgba(0,0,0,0.32)] backdrop-blur-sm">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_60%)]" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-transparent to-black/20" />
              <div className="absolute inset-0 rounded-[30px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]" />
              <div className="relative z-10">
                <div className="flex flex-wrap items-center gap-3 text-[10px] font-black uppercase tracking-[0.35em] text-zinc-400">
                  <span className="rounded-full border border-white/10 bg-black/40 px-3 py-1">
                    Linha ArsenalFit
                  </span>
                  <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1">
                    Categorias
                  </span>
                  <span className="rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-primary">
                    Arsenal Completo
                  </span>
                </div>
                <h1 className="mt-4 text-3xl sm:text-4xl md:text-5xl font-black uppercase italic tracking-tight">
                  Explore as categorias
                </h1>
                <p className="mt-3 text-sm text-zinc-300 max-w-2xl">
                  Selecione uma categoria para abrir o estoque completo, com destaques de promoções e novidades.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main id="main-content" className="container px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {cards.map((card, index) => {
            const isHot = Boolean(hotMap[card.slug]);
            return (
              <motion.div
                key={card.slug}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06 }}
              >
                <Link
                  to={`/categoria/${card.slug}`}
                  className="group relative block overflow-hidden rounded-[24px] border border-white/10 shadow-[0_22px_48px_rgba(0,0,0,0.35)] transition-transform duration-300 hover:-translate-y-1"
                >
                  <div
                    className="absolute inset-0 bg-zinc-900"
                    style={{
                      backgroundImage: `url("${card.imagePrimary}"), url("${card.imageFallback}")`,
                      backgroundSize: "cover, cover",
                      backgroundPosition: "center, center",
                      backgroundRepeat: "no-repeat, no-repeat",
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-br from-black/90 via-black/60 to-black/35" />
                  <div className="relative flex h-full min-h-[200px] flex-col justify-between p-6 sm:p-7">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`h-1.5 w-8 rounded-full ${card.accentBg}`} />
                        <span className="text-[10px] font-black uppercase tracking-[0.35em] text-white/60">
                          Categoria
                        </span>
                      </div>
                      {isHot && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-red-400/50 bg-red-500/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-red-200 shadow-[0_0_12px_rgba(248,113,113,0.35)]">
                          <Flame className="h-3 w-3" />
                          HOT
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tight text-white">
                        {card.label}
                      </h2>
                      <p className="text-sm text-white/75 max-w-md">{card.description}</p>
                    </div>
                    <Button
                      variant="outline"
                      className="mt-4 w-fit rounded-full border-white/60 bg-white/95 text-zinc-900 hover:bg-white hover:text-black text-[10px] font-semibold uppercase tracking-widest shadow-sm"
                    >
                      Ver ofertas
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
