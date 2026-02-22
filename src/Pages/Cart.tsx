import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingBag,
  Trash2,
  Minus,
  Plus,
  ArrowLeft,
  ShieldCheck,
  Zap,
  ChevronRight,
  ChevronDown,
  Lock,
  ExternalLink,
  Truck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { Button } from '@/Components/ui/button';
import { Card, CardContent } from '@/Components/ui/card';
import { Skeleton } from '@/Components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/Components/ui/dialog';
import { useCart } from '@/hooks/useCart';
import { MonitorPriceToggle } from '@/Components/cart/MonitorPriceToggle';
import { usePriceMonitoring } from '@/hooks/usePriceMonitoring';
import { openMonitorInfoDialog } from '@/Components/monitoring/MonitorInfoDialog';
import { toast } from 'sonner';
import cartHeroImage from '../assets/cart-hero.png';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/Components/ui/collapsible';
import {
  buildOutProductPath,
  getOfferUnavailableMessage,
  resolveOfferUrl,
} from '@/lib/offer.js';

const formatPrice = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const resolveProductHref = (product: { slug?: string | null; id: string }) =>
  product.slug ? `/produto/${product.slug}` : `/produto/${product.id}`;

const FIRST_MONITOR_NOTICE_KEY = "arsenalfit:monitor:first-activation:v1";

const hasDismissedFirstMonitorNotice = () => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(FIRST_MONITOR_NOTICE_KEY) === "1";
};

const cartThemeVars: CSSProperties = {
  '--cart-bg': '#FFFFFF',
  '--cart-surface': '#F7F7F8',
  '--cart-surface-2': '#EFEFF1',
  '--cart-border': 'rgba(0,0,0,0.08)',
  '--cart-text': '#121212',
  '--cart-muted': 'rgba(18,18,18,0.62)',
  '--cart-muted-2': 'rgba(18,18,18,0.45)',
  '--cart-accent': '#FF6A00',
  '--cart-accent-soft': 'rgba(255,106,0,0.12)',
  '--cart-success': '#19C37D',
  '--cart-shadow': '0 18px 45px rgba(0,0,0,0.08)',
  background: 'radial-gradient(1200px 600px at 70% 0%, rgba(255,106,0,0.08), transparent 55%), #fff',
} as CSSProperties;

const Cart = () => {
  const { cartItems, loading, updateQuantity, removeFromCart, isLoggedIn, user, authReady } = useCart();
  const { isMonitoring, toggleMonitoring, monitoredList, loading: monitoringLoading } =
    usePriceMonitoring(user);

  const [offerDialogOpen, setOfferDialogOpen] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [heroSrc, setHeroSrc] = useState(cartHeroImage);
  const [monitoredOpen, setMonitoredOpen] = useState(false);
  const [showFirstMonitorNotice, setShowFirstMonitorNotice] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia?.("(min-width: 1024px)");
    if (!mq) return;
    setMonitoredOpen(mq.matches);
  }, []);

  useEffect(() => {
    if (hasDismissedFirstMonitorNotice()) {
      setShowFirstMonitorNotice(false);
    }
  }, []);

  const dismissFirstMonitorNotice = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FIRST_MONITOR_NOTICE_KEY, "1");
    }
    setShowFirstMonitorNotice(false);
  };

  const handleToggleMonitoring = async (product: { id: string; title: string; imageUrl?: string | null; price: number }) => {
    if (!isLoggedIn) {
      toast.info('Faça login para ativar monitoramento.', {
        description: 'Você receberá alertas por e-mail quando o preço baixar.',
      });
      return;
    }

    const enabled = await toggleMonitoring(product);
    if (enabled) {
      if (monitoredProducts.length === 0 && !hasDismissedFirstMonitorNotice()) {
        setShowFirstMonitorNotice(true);
      }
      toast.success('Monitoramento ativado', {
        description: 'Veja em Carrinho > Produtos monitorados. Avisamos por e-mail quando cair.',
      });
    } else {
      toast.success('Monitoramento desativado', {
        description: 'Você não receberá alertas deste produto.',
      });
    }
  };

  const cartSubtotal = useMemo(() => {
    return cartItems.reduce((total, item) => {
      const price = Number(item.products?.price) || 0;
      return total + price * item.quantity;
    }, 0);
  }, [cartItems]);

  const monitoredProducts = useMemo(() => {
    return monitoredList
      .slice()
      .sort((a, b) => {
        const at = new Date(a.updated_at || a.created_at || 0).getTime();
        const bt = new Date(b.updated_at || b.created_at || 0).getTime();
        return bt - at;
      });
  }, [monitoredList]);

  const offerItems = useMemo(() => {
    return cartItems
      .map((item) => {
        const product = item.products as any;
        if (!product) return null;
        const resolution = resolveOfferUrl(product);
        const outPath = resolution.canRedirect ? buildOutProductPath(product.id, 'cart') : null;
        const unavailableMessage = getOfferUnavailableMessage(
          resolution,
          product.marketplace || '',
        );
        return { item, product, outPath, unavailableMessage };
      })
      .filter(Boolean) as Array<{
        item: any;
        product: any;
        outPath: string | null;
        unavailableMessage: string;
      }>;
  }, [cartItems]);

  const availableOffers = offerItems.filter((offer) => Boolean(offer.outPath));

  const openOffer = (offer: { outPath: string | null; unavailableMessage: string }) => {
    if (!offer.outPath) {
      toast.error(offer.unavailableMessage || 'Oferta indisponivel no momento.');
      return;
    }
    setIsRedirecting(true);
    window.location.assign(offer.outPath);
    setTimeout(() => setIsRedirecting(false), 600);
  };

  const handlePrimaryOffer = () => {
    if (!availableOffers.length) {
      toast.error('Nenhuma oferta disponível para redirecionamento.');
      return;
    }

    if (availableOffers.length === 1) {
      openOffer(availableOffers[0]);
      return;
    }

    setOfferDialogOpen(true);
  };

  // ESTADO: AGUARDANDO AUTH
  if (!authReady) {
    return (
      <div className="min-h-screen" style={cartThemeVars}>
        <div className="container py-12 px-4 space-y-8">
          <Skeleton className="h-16 w-3/4 rounded-3xl bg-[var(--cart-surface)]" />
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <Skeleton className="h-48 w-full rounded-[32px] bg-[var(--cart-surface)]" />
              <Skeleton className="h-48 w-full rounded-[32px] bg-[var(--cart-surface)]" />
            </div>
            <Skeleton className="h-[400px] w-full rounded-[32px] bg-[var(--cart-surface)]" />
          </div>
        </div>
      </div>
    );
  }

  // ESTADO: NAO LOGADO
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen text-[var(--cart-text)]" style={cartThemeVars}>
        <div className="container flex flex-col items-center justify-center py-32 px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[var(--cart-surface)] p-12 rounded-[40px] border border-[var(--cart-border)] shadow-[var(--cart-shadow)] text-center max-w-lg w-full"
          >
            <div className="bg-white w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8 border border-[var(--cart-border)]">
              <Lock className="h-8 w-8 text-[var(--cart-accent)]" />
            </div>
            <h1 className="text-4xl font-black uppercase italic tracking-tighter mb-4">Acesso Bloqueado</h1>
            <p className="text-[var(--cart-muted)] font-bold uppercase tracking-widest text-[10px] mb-10 leading-relaxed">
              Você precisa estar no time para recrutar itens para o seu arsenal pessoal.
            </p>
            <Link to="/auth">
              <Button className="w-full h-16 bg-[var(--cart-accent)] hover:bg-[#e85f00] text-white font-black uppercase italic rounded-2xl transition-all duration-300">
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
      <div className="min-h-screen" style={cartThemeVars}>
        <div className="container py-12 px-4 space-y-8">
          <Skeleton className="h-16 w-3/4 rounded-3xl bg-[var(--cart-surface)]" />
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <Skeleton className="h-48 w-full rounded-[32px] bg-[var(--cart-surface)]" />
              <Skeleton className="h-48 w-full rounded-[32px] bg-[var(--cart-surface)]" />
            </div>
            <Skeleton className="h-[400px] w-full rounded-[32px] bg-[var(--cart-surface)]" />
          </div>
        </div>
      </div>
    );
  }

  // ESTADO: CARRINHO VAZIO
  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen" style={cartThemeVars}>
        <div className="container flex flex-col items-center justify-center py-40">
          <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 3 }}>
            <ShoppingBag size={80} className="text-[var(--cart-muted-2)] mb-8" />
          </motion.div>
          <h1 className="text-5xl md:text-6xl font-black uppercase italic tracking-tighter mb-8">Arsenal Vazio</h1>
          <Link to="/">
            <Button
              variant="outline"
              className="h-14 border-[var(--cart-border)] text-[var(--cart-muted)] hover:border-[var(--cart-accent)] hover:text-[var(--cart-accent)] font-black uppercase italic rounded-2xl transition-all"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para a Vitrine
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28 text-[var(--cart-text)]" style={cartThemeVars}>
      <section className="relative h-[240px] sm:h-[250px] lg:h-[300px] w-full">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 z-0 pointer-events-none">
            <img
              src={heroSrc}
              alt=""
              aria-hidden="true"
              onError={() => setHeroSrc('/images/cart-hero.png')}
              className="absolute inset-0 h-full w-full object-cover object-center sm:object-[center_84%] opacity-[0.58]"
              style={{
                filter: 'blur(3px) grayscale(0.3) saturate(1.18) contrast(1.12)',
              }}
            />
            <img
              src={heroSrc}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover object-center sm:object-[center_86%] opacity-[0.62] scale-[1.04]"
              style={{
                filter: 'blur(14px) grayscale(0.2) saturate(1.12) contrast(1.08)',
                maskImage: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.0) 45%, black 100%)',
                WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.0) 45%, black 100%)',
              }}
            />
            <div className="absolute inset-0 bg-[radial-gradient(900px_420px_at_80%_0%,rgba(255,106,0,0.24),transparent_62%)]" />
            <div className="absolute inset-0 bg-gradient-to-b from-white/45 via-white/25 to-white/95" />
          </div>
        </div>

        <div className="relative z-10 h-full">
          <div className="container relative h-full px-4 pt-6 sm:pt-10">
            <Link
              to="/"
              className="group inline-flex items-center gap-2 rounded-full border border-[var(--cart-border)] bg-white/90 px-3 py-2 text-[10px] font-black uppercase tracking-[0.35em] text-[var(--cart-muted)] hover:text-[var(--cart-accent)] hover:border-[var(--cart-accent)] transition-all shadow-sm"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--cart-surface-2)] text-[var(--cart-muted)] group-hover:bg-[var(--cart-accent-soft)] group-hover:text-[var(--cart-accent)] transition-colors">
                <ArrowLeft size={14} />
              </span>
              Voltar ao Arsenal
            </Link>

            <div className="absolute left-1/2 bottom-[-32px] sm:bottom-[-42px] w-full max-w-6xl -translate-x-1/2">
              <div className="rounded-[28px] sm:rounded-[32px] border-2 border-[rgba(255,106,0,0.55)] bg-white/90 px-4 py-4 sm:px-10 sm:py-8 shadow-[var(--cart-shadow)] backdrop-blur-md">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <h1 className="text-2xl sm:text-4xl md:text-6xl font-black uppercase italic tracking-tighter leading-none text-[var(--cart-text)]">
                    Meu <span className="text-[var(--cart-accent)]">Carrinho</span>
                  </h1>
                  <div className="inline-flex items-center rounded-full border border-[var(--cart-border)] bg-[var(--cart-surface-2)] px-4 py-2 text-[9px] sm:text-[11px] font-black uppercase italic tracking-[0.2em] text-[var(--cart-muted)]">
                    {cartItems.length} Itens Selecionados
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {showFirstMonitorNotice && (
        <div className="container px-4 pt-14 sm:pt-16 lg:pt-20">
          <div className="rounded-[22px] border border-[rgba(255,106,0,0.32)] bg-[rgba(255,106,0,0.08)] px-4 py-4 sm:px-6 sm:py-5 shadow-[var(--cart-shadow)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--cart-accent)]">
                  Monitoramento ativado
                </p>
                <p className="mt-1 text-sm sm:text-base font-semibold text-[var(--cart-text)]">
                  Perfeito! Quando este produto baixar, você recebe aviso no e-mail.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={openMonitorInfoDialog}
                  className="h-10 rounded-full border-[var(--cart-border)] bg-white text-[var(--cart-text)] hover:border-[var(--cart-accent)] hover:text-[var(--cart-accent)]"
                >
                  Ver tutorial
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={dismissFirstMonitorNotice}
                  className="h-10 rounded-full text-[var(--cart-muted)] hover:text-[var(--cart-text)]"
                >
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="container mt-20 sm:mt-24 lg:mt-28 px-4 pb-12">
        <div className="grid gap-10 lg:grid-cols-3 items-start">
          {/* LISTAGEM DE PRODUTOS */}
          <div className="lg:col-span-2 space-y-6">
            <AnimatePresence mode="popLayout">
              {cartItems.map((item) => {
                const product = item.products as any;
                if (!product) return null;
                const currentPrice = Number(product.price) || 0;
                const originalPrice =
                  typeof product.original_price === 'number'
                    ? product.original_price
                    : typeof product.previous_price === 'number'
                      ? product.previous_price
                      : null;
                const hasDiscount =
                  typeof originalPrice === 'number' && originalPrice > currentPrice;
                const savings = hasDiscount ? originalPrice - currentPrice : 0;
                const productHref = resolveProductHref(product);

                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                  >
                    <Card className="bg-[var(--cart-surface)] border border-[var(--cart-border)] rounded-[28px] overflow-hidden shadow-[var(--cart-shadow)]">
                      <CardContent className="p-4 sm:p-6 md:p-7">
                        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-center">
                          <div className="relative h-20 w-20 sm:h-24 sm:w-24 flex-shrink-0 bg-white rounded-[18px] sm:rounded-[20px] p-2 sm:p-3 border border-[var(--cart-border)]">
                            <img
                              src={product.image_url || '/placeholder.svg'}
                              alt={product.name}
                              className="h-full w-full object-contain"
                            />
                          </div>

                          <div className="flex-1 w-full text-center sm:text-left">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-[var(--cart-accent)] text-[9px] font-black uppercase tracking-[0.3em] mb-1">
                                  {product.category_id || 'Elite Performance'}
                                </p>
                                <h3 className="text-lg sm:text-2xl font-black uppercase italic leading-tight tracking-tighter line-clamp-2">
                                  {product.name}
                                </h3>
                              </div>
                              <button
                                onClick={() => removeFromCart(item.id)}
                                className="self-center sm:self-start p-3 rounded-xl text-[var(--cart-muted-2)] hover:text-red-500 hover:bg-red-500/10 transition-all"
                                aria-label="Remover item"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>

                            <div className="mt-5 flex flex-wrap items-center justify-center sm:justify-between gap-6">
                              <div className="flex items-center bg-[var(--cart-surface-2)] rounded-2xl p-1.5 border border-[var(--cart-border)]">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-11 w-11 sm:h-8 sm:w-8 text-[var(--cart-muted)] hover:text-[var(--cart-accent)]"
                                  onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                                >
                                  <Minus size={14} />
                                </Button>
                                <span className="w-10 sm:w-12 text-center font-black italic text-base sm:text-lg">{item.quantity}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-11 w-11 sm:h-8 sm:w-8 text-[var(--cart-muted)] hover:text-[var(--cart-accent)]"
                                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                >
                                  <Plus size={14} />
                                </Button>
                              </div>

                              <div className="text-right">
                                <p className="text-[10px] font-black uppercase text-[var(--cart-muted-2)] tracking-widest">
                                  Investimento
                                </p>
                                {hasDiscount && (
                                  <p className="text-xs text-[var(--cart-muted-2)] line-through">
                                    R$ {formatPrice(originalPrice)}
                                  </p>
                                )}
                                <p className="text-xl sm:text-2xl font-black italic">
                                  R$ {formatPrice(currentPrice)}
                                </p>
                                {savings > 0 && (
                                  <span className="inline-flex mt-2 items-center rounded-full bg-[rgba(25,195,125,0.12)] px-3 py-1 text-[10px] font-bold text-[#0F7A4B]">
                                    Economia de R$ {formatPrice(savings)}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-3">
                              <Button
                                asChild
                                variant="outline"
                                className="h-10 rounded-full border-[var(--cart-border)] bg-white text-[var(--cart-text)] hover:border-[var(--cart-accent)] hover:text-[var(--cart-accent)]"
                              >
                                <Link to={productHref} className="inline-flex items-center gap-2">
                                  <ExternalLink className="h-4 w-4" />
                                  Ver produto
                                </Link>
                              </Button>

                              <MonitorPriceToggle
                                active={isMonitoring(product.id)}
                                onToggle={() =>
                                  handleToggleMonitoring({
                                    id: product.id,
                                    title: product.name || product.title || 'Produto',
                                    imageUrl: product.image_url,
                                    price: Number(product.price),
                                  })
                                }
                                onLearnMore={openMonitorInfoDialog}
                              />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            <Collapsible open={monitoredOpen} onOpenChange={setMonitoredOpen}>
              <Card className="bg-[var(--cart-surface)] border border-[var(--cart-border)] rounded-[28px] overflow-hidden shadow-[var(--cart-shadow)]">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="w-full px-5 py-4 sm:px-6 sm:py-5 flex items-center justify-between gap-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cart-accent-soft)]"
                    aria-label="Alternar produtos monitorados"
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--cart-muted)]">
                        Produtos monitorados
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[var(--cart-text)]">
                        {monitoringLoading
                          ? "Carregando..."
                          : `${monitoredProducts.length} ativo(s)`}
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--cart-muted)]">
                        Avisamos por e-mail quando o preço cair.
                      </p>
                    </div>
                    <ChevronDown
                      className={`h-5 w-5 text-[var(--cart-muted)] transition-transform ${
                        monitoredOpen ? "rotate-180" : ""
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <CardContent className="px-5 pb-6 sm:px-6">
                    {monitoringLoading ? (
                      <div className="rounded-2xl border border-[var(--cart-border)] bg-white px-4 py-4 text-sm text-[var(--cart-muted)]">
                        Carregando monitoramentos...
                      </div>
                    ) : monitoredProducts.length === 0 ? (
                      <div className="rounded-2xl border border-[var(--cart-border)] bg-white px-4 py-4 text-sm text-[var(--cart-muted)]">
                        <p>Você ainda não monitora nenhum produto.</p>
                        <Button asChild variant="outline" className="mt-3 h-10 rounded-full border-[var(--cart-border)] bg-white hover:border-[var(--cart-accent)] hover:text-[var(--cart-accent)]">
                          <Link to="/categorias">Ver produtos para monitorar</Link>
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {monitoredProducts.map((item) => (
                          <div
                            key={item.product_id}
                            className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--cart-border)] bg-white p-4"
                          >
                            <Link
                              to={resolveProductHref({ id: item.product_id })}
                              className="flex min-w-0 items-center gap-3"
                            >
                              <div className="h-16 w-16 sm:h-14 sm:w-14 rounded-xl border border-[var(--cart-border)] bg-[var(--cart-surface-2)] p-2 overflow-hidden flex items-center justify-center">
                                <img
                                  src={item.image_url || "/placeholder.svg"}
                                  alt={item.product_title || "Produto"}
                                  className="h-full w-full object-contain"
                                  loading="lazy"
                                />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-[var(--cart-text)] line-clamp-2">
                                  {item.product_title || "Produto"}
                                </p>
                                <p className="mt-1 text-[11px] text-[var(--cart-muted)]">
                                  Base:{" "}
                                  {typeof item.baseline_price === "number"
                                    ? `R$ ${formatPrice(item.baseline_price)}`
                                    : "N/D"}
                                </p>
                              </div>
                            </Link>
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleMonitoring({
                                  id: item.product_id,
                                  title: item.product_title || "Produto",
                                  imageUrl: item.image_url ?? null,
                                  price: Number(item.baseline_price) || 0,
                                })
                              }
                              className="shrink-0 inline-flex min-h-[44px] items-center justify-center rounded-full border border-[var(--cart-border)] bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--cart-muted)] hover:border-[var(--cart-accent)] hover:text-[var(--cart-accent)] transition-colors"
                            >
                              Desativar
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </div>

          {/* RESUMO */}
          <div className="space-y-6 lg:sticky lg:top-24">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card className="bg-[var(--cart-surface)] border border-[var(--cart-border)] rounded-[28px] overflow-hidden shadow-[var(--cart-shadow)]">
                <div
                  className="px-6 py-4 flex items-center justify-between"
                  style={{
                    background:
                      'linear-gradient(90deg, rgba(255,106,0,0.16), rgba(255,106,0,0.06))',
                  }}
                >
                  <h2 className="text-base font-black uppercase italic tracking-tight text-[var(--cart-text)]">
                    Resumo da Missão
                  </h2>
                  <ShieldCheck size={20} className="text-[var(--cart-accent)]" />
                </div>

                <CardContent className="p-6 space-y-6">
                  <div className="space-y-3">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-[var(--cart-muted)]">
                      <span>Subtotal Atualizado</span>
                      <span className="text-[var(--cart-text)] font-mono">R$ {formatPrice(cartSubtotal)}</span>
                    </div>

                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-[var(--cart-muted)]">
                      <span>Logística (Frete)</span>
                      <span className="text-[var(--cart-success)] italic">Grátis</span>
                    </div>
                  </div>

                  <div className="border-t border-[var(--cart-border)] pt-5 flex justify-between items-end">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase italic text-[var(--cart-muted)] tracking-widest">
                        Total do Arsenal
                      </span>
                      <span className="text-4xl font-black text-[var(--cart-accent)] italic leading-none mt-1">
                        R$ {formatPrice(cartSubtotal)}
                      </span>
                    </div>
                  </div>

                  <Button
                    disabled={isRedirecting}
                    onClick={handlePrimaryOffer}
                    className="hidden sm:inline-flex w-full h-16 bg-[var(--cart-accent)] hover:bg-[#e85f00] text-white font-black uppercase italic rounded-[22px] text-lg transition-all duration-200 group shadow-[0_16px_32px_rgba(255,106,0,0.25)] focus-visible:ring-4 focus-visible:ring-[var(--cart-accent-soft)]"
                  >
                    <span className="relative z-10 flex items-center gap-3">
                      Ver oferta <Zap className="h-5 w-5 fill-current" />
                    </span>
                  </Button>

                  <p className="text-[10px] text-center text-[var(--cart-muted-2)] font-semibold uppercase tracking-[0.2em]">
                    Oferta monitorada automaticamente pelo ArsenalFit
                  </p>

                  <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--cart-muted)]">
                    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--cart-border)] bg-white px-3 py-2">
                      <Truck className="h-3.5 w-3.5 text-[var(--cart-accent)]" /> Frete grátis
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--cart-border)] bg-white px-3 py-2">
                      <ShieldCheck className="h-3.5 w-3.5 text-[var(--cart-accent)]" /> Compra segura
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--cart-border)] bg-white px-3 py-2">
                      <Lock className="h-3.5 w-3.5 text-[var(--cart-accent)]" /> Checkout protegido
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>

      <Dialog open={offerDialogOpen} onOpenChange={setOfferDialogOpen}>
        <DialogContent className="max-w-xl rounded-[24px] border border-[var(--cart-border)] bg-white text-[var(--cart-text)] shadow-[var(--cart-shadow)]">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase tracking-[0.2em]">
              Escolha a oferta
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2 space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {offerItems.map((offer) => {
              const product = offer.product;
              const price = Number(product.price) || 0;
              return (
                <div
                  key={offer.item.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border border-[var(--cart-border)] bg-[var(--cart-surface-2)] p-4 min-h-[92px]"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="h-16 w-16 shrink-0 rounded-xl bg-white border border-[var(--cart-border)] p-2 overflow-hidden flex items-center justify-center">
                      <img
                        src={product.image_url || '/placeholder.svg'}
                        alt={product.name}
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--cart-text)] line-clamp-2">
                        {product.name}
                      </p>
                      <p className="text-xs text-[var(--cart-muted)]">R$ {formatPrice(price)}</p>
                    </div>
                  </div>
                  <Button
                    onClick={() => openOffer(offer)}
                    variant="outline"
                    className="h-10 min-w-[120px] rounded-full border-[var(--cart-border)] bg-white text-[var(--cart-text)] hover:border-[var(--cart-accent)] hover:text-[var(--cart-accent)]"
                    disabled={!offer.outPath}
                  >
                    {offer.outPath ? 'Ver oferta' : 'Aguardando validacao'}
                  </Button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[var(--cart-border)] shadow-[0_-12px_30px_rgba(0,0,0,0.08)] px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:hidden">
        <Button
          disabled={isRedirecting}
          onClick={handlePrimaryOffer}
          className="w-full h-14 bg-[var(--cart-accent)] hover:bg-[#e85f00] text-white font-black uppercase italic rounded-[18px] text-base transition-all duration-200 focus-visible:ring-4 focus-visible:ring-[var(--cart-accent-soft)]"
        >
          Ver oferta <Zap className="h-4 w-4 ml-2 fill-current" />
        </Button>
      </div>
    </div>
  );
};

export default Cart;

