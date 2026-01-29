import { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  ShoppingBag, 
  Trash2, 
  Minus, 
  Plus, 
  ArrowLeft, 
  ShieldCheck, 
  Zap, 
  Ticket,
  ChevronRight,
  Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { Button } from '@/Components/ui/button';
import { Card, CardContent } from '@/Components/ui/card';
import { Skeleton } from '@/Components/ui/skeleton';
import { Header } from '@/Components/Header';
import { useCart } from '@/hooks/useCart';
import { useCheckout } from '@/hooks/useCheckout';
import { toast } from 'sonner';

const Cart = () => {
  const { cartItems, loading, updateQuantity, removeFromCart, cartTotal, isLoggedIn } = useCart();
  const { processCheckout, isProcessing } = useCheckout();
  
  const [couponCode, setCouponCode] = useState('');
  const [discount, setDiscount] = useState(0);

  const applyCoupon = () => {
    if (couponCode.toUpperCase() === 'ELITE20') {
      setDiscount(0.20);
      toast.success("CUPOM ATIVADO", { description: "Você desbloqueou 20% de desconto elite." });
    } else {
      toast.error("Cupom inválido", { description: "Este código não pertence ao nosso arsenal." });
    }
  };

  const finalTotal = cartTotal * (1 - discount);

  // ESTADO: NÃO LOGADO
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background text-white">
        <Header />
        <div className="container flex flex-col items-center justify-center py-32 px-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-zinc-900/50 p-12 rounded-[50px] border border-white/5 backdrop-blur-xl text-center max-w-lg w-full"
          >
            <div className="bg-zinc-800 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-4xl font-black uppercase italic tracking-tighter mb-4">Acesso Bloqueado</h1>
            <p className="text-zinc-500 font-bold uppercase tracking-widest text-[10px] mb-10 leading-relaxed">
              Você precisa estar no time para recrutar itens para o seu arsenal pessoal.
            </p>
            <Link to="/auth">
              <Button className="w-full h-16 bg-primary hover:bg-white text-black font-black uppercase italic rounded-2xl transition-all duration-300">
                Entrar no Time <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </div>
    );
  }

  // ESTADO: CARREGANDO
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-12 px-4 space-y-8">
          <Skeleton className="h-16 w-3/4 rounded-3xl bg-zinc-900/50" />
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <Skeleton className="h-48 w-full rounded-[40px] bg-zinc-900/50" />
              <Skeleton className="h-48 w-full rounded-[40px] bg-zinc-900/50" />
            </div>
            <Skeleton className="h-[400px] w-full rounded-[40px] bg-zinc-900/50" />
          </div>
        </div>
      </div>
    );
  }

  // ESTADO: CARRINHO VAZIO
  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container flex flex-col items-center justify-center py-40">
          <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 3 }}>
            <ShoppingBag size={80} className="text-zinc-800 mb-8" />
          </motion.div>
          <h1 className="text-6xl font-black uppercase italic text-zinc-800 tracking-tighter mb-8">Arsenal Vazio</h1>
          <Link to="/">
            <Button variant="outline" className="h-14 border-zinc-800 text-zinc-500 hover:border-primary hover:text-primary font-black uppercase italic rounded-2xl transition-all">
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para a Vitrine
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-white pb-24">
      <Header />
      <div className="container py-12 px-4">
        <Link to="/" className="group inline-flex items-center text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 hover:text-primary mb-12 transition-all">
          <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" /> Voltar ao Início
        </Link>

        <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
          <h1 className="text-6xl md:text-7xl font-black uppercase italic tracking-tighter leading-none">
            Meu <span className="text-primary text-glow">Carrinho</span>
          </h1>
          <div className="bg-zinc-900/50 px-6 py-2 rounded-full border border-white/5 backdrop-blur-sm text-zinc-400 font-black uppercase italic text-xs">
            {cartItems.length} Itens Selecionados
          </div>
        </div>

        <div className="grid gap-12 lg:grid-cols-3 items-start">
          {/* LISTAGEM DE PRODUTOS */}
          <div className="lg:col-span-2 space-y-6">
            <AnimatePresence mode="popLayout">
              {cartItems.map((item) => {
                const product = item.products as any;
                if (!product) return null;

                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                  >
                    <Card className="bg-zinc-900/30 border border-white/5 rounded-[40px] overflow-hidden group hover:border-primary/20 transition-all backdrop-blur-sm">
                      <CardContent className="p-6 md:p-8">
                        <div className="flex flex-col sm:flex-row gap-8 items-center">
                          <div className="relative h-32 w-32 flex-shrink-0 bg-black/40 rounded-[30px] p-4 border border-white/5">
                            <img
                              src={product.image_url || '/placeholder.svg'}
                              alt={product.name}
                              className="h-full w-full object-contain group-hover:scale-110 transition-transform duration-500"
                            />
                          </div>
                          
                          <div className="flex-1 w-full text-center sm:text-left">
                            <div className="mb-4">
                              <p className="text-primary text-[9px] font-black uppercase tracking-[0.3em] mb-1">
                                {product.category_id || 'Elite Performance'}
                              </p>
                              <h3 className="text-2xl font-black uppercase italic leading-none tracking-tighter">
                                {product.name}
                              </h3>
                            </div>

                            <div className="flex flex-wrap items-center justify-center sm:justify-between gap-6">
                              <div className="flex items-center bg-black/60 rounded-2xl p-1.5 border border-white/10">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 hover:text-primary"
                                  onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                                >
                                  <Minus size={14} />
                                </Button>
                                <span className="w-12 text-center font-black italic text-lg">{item.quantity}</span>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 hover:text-primary"
                                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                >
                                  <Plus size={14} />
                                </Button>
                              </div>

                              <div className="flex items-center gap-6">
                                <div className="text-right">
                                  <p className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">Investimento</p>
                                  <p className="text-2xl font-black italic">
                                    R$ {Number(product.price).toFixed(2).replace('.', ',')}
                                  </p>
                                </div>
                                <button 
                                  onClick={() => removeFromCart(item.id)}
                                  className="p-3 bg-zinc-800/50 rounded-xl text-zinc-600 hover:text-red-500 hover:bg-red-500/10 transition-all"
                                >
                                  <Trash2 size={20} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* LATERAL: CUPOM E RESUMO */}
          <div className="space-y-6 lg:sticky lg:top-32">
            {/* CARD DE CUPOM */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card className="bg-zinc-900/50 border border-white/5 rounded-[30px] p-6 backdrop-blur-md">
                <div className="flex gap-3">
                  <div className="relative flex-1 group">
                    <Ticket className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600 group-focus-within:text-primary transition-colors" />
                    <input 
                      type="text" 
                      placeholder="CÓDIGO ELITE"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                      className="w-full h-14 bg-black/60 rounded-2xl border border-white/5 pl-12 pr-4 text-xs font-black uppercase tracking-widest focus:border-primary/50 outline-none transition-all placeholder:text-zinc-700"
                    />
                  </div>
                  <Button 
                    onClick={applyCoupon} 
                    className="h-14 px-6 bg-zinc-800 hover:bg-primary hover:text-black text-white font-black uppercase italic rounded-2xl transition-all"
                  >
                    Aplicar
                  </Button>
                </div>
              </Card>
            </motion.div>

            {/* CARD DE RESUMO FINAL */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <Card className="bg-zinc-900 border-2 border-primary/20 rounded-[45px] overflow-hidden shadow-2xl relative">
                <div className="bg-primary px-8 py-5 flex items-center justify-between text-black">
                  <h2 className="text-xl font-black uppercase italic tracking-tighter">Resumo da Missão</h2>
                  <ShieldCheck size={24} strokeWidth={2.5} />
                </div>

                <CardContent className="p-8 space-y-6">
                  <div className="space-y-3">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-zinc-500">
                      <span>Subtotal Bruto</span>
                      <span className="text-zinc-300 font-mono">R$ {cartTotal.toFixed(2).replace('.', ',')}</span>
                    </div>
                    
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-zinc-500">
                      <span>Logística (Frete)</span>
                      <span className="text-primary italic">Grátis</span>
                    </div>

                    {discount > 0 && (
                      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex justify-between text-[10px] font-black uppercase text-green-500 bg-green-500/10 p-2 rounded-lg">
                        <span>Desconto Aplicado</span>
                        <span>- R$ {(cartTotal * discount).toFixed(2).replace('.', ',')}</span>
                      </motion.div>
                    )}
                  </div>

                  <div className="border-t border-white/5 pt-6 flex justify-between items-end">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase italic text-zinc-500 tracking-widest">Total do Arsenal</span>
                      <span className="text-4xl font-black text-primary italic leading-none mt-1">
                        R$ {finalTotal.toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  </div>

                  <Button 
                    disabled={isProcessing}
                    onClick={processCheckout}
                    className="w-full h-20 bg-white hover:bg-primary text-black font-black uppercase italic rounded-[25px] text-xl transition-all duration-500 group relative overflow-hidden shadow-xl"
                  >
                    {isProcessing ? (
                      <Zap className="animate-pulse h-6 w-6" />
                    ) : (
                      <span className="relative z-10 flex items-center gap-3">
                        Finalizar Compra <Zap className="h-6 w-6 fill-current group-hover:scale-125 transition-transform" />
                      </span>
                    )}
                  </Button>

                  <div className="space-y-2">
                    <p className="text-[8px] text-center text-zinc-600 font-black uppercase tracking-[0.2em] leading-relaxed">
                      Pagamento Seguro - Entrega Prioritaria - Qualidade Elite
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cart;





