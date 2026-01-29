import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ShoppingCart,
  ChevronLeft,
  ShieldCheck,
  Zap,
  Heart,
  Star,
  ArrowRight,
  TrendingDown,
} from "lucide-react";

import { Button } from "@/Components/ui/button";
import { Skeleton } from "@/Components/ui/skeleton";
import { Layout } from "@/Components/layout/Layout";

import { useProduct } from "@/hooks/useProducts";
import { useCart } from "@/hooks/useCart";
import { supabase } from "@/lib/supabase";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ProductAnalysis } from "@/Components/ProductAnalysis";
import { motion } from "framer-motion";


const ProductDetails = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { product, loading, error } = useProduct(slug || '');
  const { addToCart } = useCart();
  const [user, setUser] = useState<any>(null);
  const queryClient = useQueryClient();

  const p = product as any;

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
  }, []);

  const { data: favorites = [] } = useQuery({
    queryKey: ['favorites', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('favorites')
        .select('*')
        .eq('user_id', user.id);
      return data || [];
    },
    enabled: !!user,
  });

  const isFavorited = favorites.some((f: any) => f.product_id === p?.id);

  const handleFavorite = async () => {
    if (!p) return;
    if (!user) {
      toast.error('Monitore este preço!', {
        description: 'Faça login para avisarmos você se o valor baixar.'
      });
      return;
    }

    try {
      if (isFavorited) {
        await supabase.from('favorites').delete().eq('product_id', p.id).eq('user_id', user.id);
        toast.success('Removido do monitoramento');
      } else {
        await supabase.from('favorites').insert({ product_id: p.id, user_id: user.id });
        toast.success('Preço Monitorado!', {
          description: 'Avisaremos você via e-mail se este valor cair.',
        });
      }
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    } catch (err) {
      toast.error('Erro ao processar favorito.');
    }
  };

  if (loading) return (
    <Layout>
      <div className="container-fit py-12 space-y-12">
        <Skeleton className="h-8 w-48 rounded-full" />
        <div className="grid gap-12 lg:grid-cols-2">
          <Skeleton className="aspect-square w-full rounded-[50px]" />
          <div className="space-y-6">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-3xl" />
            <Skeleton className="h-24 w-full rounded-[30px]" />
          </div>
        </div>
      </div>
    </Layout>
  );

  if (error || !p) return (
    <Layout>
      <div className="container-fit flex flex-col items-center justify-center py-32 text-center">
        <Zap className="h-16 w-16 text-zinc-800 mb-6" />
        <h1 className="text-4xl font-black uppercase italic tracking-tighter text-white">Produto Extraviado</h1>
        <p className="text-zinc-500 mt-2 mb-8 uppercase text-xs font-bold tracking-widest">Não encontramos este item no nosso arsenal.</p>
        <Link to="/produtos">
          <Button className="bg-primary text-black font-black uppercase italic rounded-xl px-8 h-14">Voltar para a Vitrine</Button>
        </Link>
      </div>
    </Layout>
  );

  return (
    <Layout>
      <div className="container-fit py-8 md:py-12">
        {/* NAVEGAÇÃO SUPERIOR */}
        <button 
          onClick={() => navigate(-1)} 
          className="group flex items-center gap-2 text-zinc-500 hover:text-primary mb-12 transition-all font-black uppercase italic text-[10px] tracking-widest"
        >
          <div className="p-2 rounded-full bg-zinc-900 group-hover:bg-primary group-hover:text-black transition-colors">
            <ChevronLeft size={14} />
          </div>
          Voltar ao Arsenal
        </button>

        <div className="grid gap-12 lg:gap-20 lg:grid-cols-2 items-start">
          
          {/* LADO ESQUERDO: VISUAL DO PRODUTO */}
          <motion.div 
            initial={{ opacity: 0, x: -30 }} 
            animate={{ opacity: 1, x: 0 }}
            className="relative"
          >
            <div className="absolute -inset-4 bg-primary/10 blur-[100px] rounded-full opacity-30" />
            <div className="aspect-square overflow-hidden rounded-[50px] bg-zinc-900/50 border border-white/5 backdrop-blur-3xl flex items-center justify-center p-12 relative group">
              <img 
                src={p.image_url || '/placeholder.svg'} 
                alt={p.title} 
                className="h-full w-full object-contain transition-transform duration-700 group-hover:scale-110 drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)]" 
                loading="lazy"
              />
              
              {/* TAG DE DESCONTO SE EXISTIR */}
              {p.competitor_price > p.price && (
                <div className="absolute top-8 right-8 bg-green-500 text-black font-black text-[10px] px-4 py-2 rounded-full flex items-center gap-1 shadow-lg animate-bounce">
                  <TrendingDown size={12} /> {Math.round(((p.competitor_price - p.price) / p.competitor_price) * 100)}% OFF
                </div>
              )}
            </div>
          </motion.div>

          {/* LADO DIREITO: INFOS DE PERFORMANCE */}
          <motion.div 
            initial={{ opacity: 0, y: 30 }} 
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col space-y-10"
          >
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <span className="bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full border border-primary/20">
                  <Zap size={10} className="inline mr-1 fill-current" /> Curadoria de Elite
                </span>
                <span className="text-zinc-600 text-[10px] font-black uppercase tracking-widest italic">REF: {p.id.slice(0,8)}</span>
              </div>

              <h1 className="text-5xl md:text-7xl font-black leading-[0.85] tracking-tighter text-white uppercase italic">
                {p.title}
              </h1>

                <div className="flex items-end gap-4 bg-zinc-900/30 w-fit p-6 rounded-[30px] border border-white/5">
                  <div className="flex flex-col">
                   <span className="text-[10px] font-black uppercase text-zinc-500 mb-1 tracking-widest">Preço ArsenalFit</span>
                   <span className="text-5xl font-black text-white italic">
                     R$ {Number(p.price).toFixed(2).replace('.', ',')}
                   </span>
                </div>
                {p.competitor_price && (
                  <div className="flex flex-col border-l border-white/10 pl-4 pb-1">
                    <span className="text-[9px] font-black uppercase text-zinc-600 tracking-widest">No Concorrente</span>
                    <span className="text-xl font-bold text-zinc-500 line-through italic">
                      R$ {Number(p.competitor_price).toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <p className="text-zinc-400 text-lg leading-relaxed font-medium italic border-l-4 border-primary/50 pl-6 py-2">
              "{p.description}"
            </p>

            {/* AÇÕES DE CONVERSÃO */}
            <div className="space-y-4">
              <div className="flex gap-4">
                <button 
                  onClick={() => (p.affiliate_link || p.source_url) && window.open(p.affiliate_link || p.source_url, '_blank')}
                  className="flex-[3] h-20 bg-primary hover:bg-white text-black rounded-[25px] font-black text-xl flex items-center justify-center gap-4 transition-all duration-500 group shadow-2xl shadow-primary/20 uppercase italic tracking-widest overflow-hidden relative"
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                  <span className="relative z-10 flex items-center gap-3">
                    RESGATAR OFERTA <ArrowRight size={22} className="group-hover:translate-x-2 transition-transform" />
                  </span>
                </button>
                
                <button 
                  onClick={handleFavorite}
                  className={`flex-1 h-20 rounded-[25px] flex flex-col items-center justify-center border-2 transition-all gap-1 ${
                    isFavorited 
                      ? 'bg-primary border-primary text-black' 
                      : 'border-white/10 bg-zinc-900/50 text-zinc-500 hover:border-primary hover:text-primary'
                  }`}
                >
                  <Heart className={isFavorited ? 'fill-current' : ''} size={20} />
                  <span className="text-[8px] font-black uppercase tracking-tighter">
                    {isFavorited ? 'Monitorando' : 'Monitorar'}
                  </span>
                </button>
              </div>
              
              <Button 
                onClick={() => addToCart(p.id, 1)}
                variant="ghost"
                className="w-full h-14 bg-zinc-900/50 text-zinc-400 rounded-2xl font-bold hover:bg-zinc-800 hover:text-white transition-all uppercase text-[10px] tracking-[0.3em] border border-white/5"
              >
                <ShoppingCart size={14} className="mr-2" /> Salvar no Carrinho de Compras
              </Button>

              <div className="flex items-center justify-center gap-8 pt-4">
                <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                  <ShieldCheck size={14} className="text-primary" /> Link Seguro
                </div>
                <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                  <Star size={14} className="text-primary fill-primary" /> Qualidade Verificada
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* SEÇÃO DE ANÁLISE TÉCNICA */}
        <motion.div 
          initial={{ opacity: 0 }} 
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-32 pt-16 border-t border-white/5"
        >
          <div className="flex items-center justify-between mb-12">
            <h2 className="text-4xl md:text-5xl font-black text-white uppercase italic tracking-tighter flex items-center gap-4">
               <div className="p-3 bg-primary rounded-2xl"><Star className="text-black h-6 w-6 fill-black" /></div>
               Análise do <span className="text-primary">Especialista</span>
            </h2>
            <div className="h-[1px] flex-1 bg-white/5 mx-8 hidden lg:block" />
          </div>
          
          <div className="bg-zinc-900/20 rounded-[50px] border border-white/5 p-2 sm:p-4">
            <ProductAnalysis 
              price={p.price}
              competitor_price={p.competitor_price}
              quality_score={p.quality_score}
              technical_analysis={p.technical_analysis}
              best_use_case={p.best_use_case}
            />
          </div>
        </motion.div>
      </div>
    </Layout>
  );
};

export default ProductDetails;





