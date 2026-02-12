import { ArrowRight, ShieldCheck, ShoppingCart, Star, Truck } from "lucide-react";
import { formatPrice } from "@/lib/validators";
import { PriceDisclaimer } from "@/Components/PriceDisclaimer";

interface PriceTriggerCardProps {
  price: number;
  originalPrice?: number | null;
  pixPrice?: number | null;
  competitorPrice?: number | null;
  installmentText?: string | null;
  onBuyNow: () => void;
  onAddToCart: () => void;
  isBestSeller?: boolean;
  isFastShipping?: boolean;
  showSecure?: boolean;
  lastUpdated: Date | null;
}

export function PriceTriggerCard({
  price,
  originalPrice,
  pixPrice,
  competitorPrice,
  installmentText,
  onBuyNow,
  onAddToCart,
  isBestSeller,
  isFastShipping,
  showSecure = true,
  lastUpdated,
}: PriceTriggerCardProps) {
  const hasOriginal = Boolean(originalPrice && originalPrice > price);
  const savingsValue = hasOriginal ? (originalPrice as number) - price : 0;
  const savingsPercent = hasOriginal ? Math.round((savingsValue / (originalPrice as number)) * 100) : null;
  const showComparator = Boolean(competitorPrice && competitorPrice > price);
  const comparatorSavings = showComparator
    ? Math.round((((competitorPrice as number) - price) / (competitorPrice as number)) * 100)
    : null;

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm space-y-5">
      {showComparator && (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">
            <span>Comparador de preço</span>
            {comparatorSavings !== null && comparatorSavings > 0 && (
              <span className="text-emerald-600 font-bold">-{comparatorSavings}%</span>
            )}
          </div>
          <div className="mt-3 flex items-end justify-between gap-6">
            <div>
              <p className="text-xs text-zinc-500">Concorrência</p>
              <p className="text-lg font-semibold text-zinc-400 line-through">
                {formatPrice(competitorPrice as number)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-500">ArsenalFit</p>
              <p className="text-2xl font-semibold text-zinc-900">{formatPrice(price)}</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 font-semibold">Preço ArsenalFit</p>
            <div className="flex items-end gap-3 flex-wrap">
              <span className="text-4xl md:text-5xl font-bold text-zinc-900">
                {formatPrice(price)}
              </span>
              {hasOriginal && (
                <span className="text-sm text-zinc-400 line-through">{formatPrice(originalPrice as number)}</span>
              )}
            </div>
          </div>
          {hasOriginal && savingsPercent !== null && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700 text-xs font-semibold">
              Economia de {formatPrice(savingsValue)} ({savingsPercent}%)
            </div>
          )}
        </div>

        {pixPrice && pixPrice > 0 && (
          <p className="text-sm text-zinc-700">
            PIX/à vista: <span className="font-semibold text-zinc-900">{formatPrice(pixPrice)}</span>
          </p>
        )}

        <p className="text-sm text-zinc-600">
          {installmentText || "Parcelamento: consulte opções no checkout."}
        </p>

        <PriceDisclaimer lastUpdated={lastUpdated} className="text-xs text-zinc-500" />
      </div>

      <div className="grid gap-3">
        <button
          type="button"
          onClick={onBuyNow}
          className="h-12 rounded-2xl bg-primary text-black font-semibold text-base flex items-center justify-center gap-2 shadow-sm hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          Comprar agora <ArrowRight size={18} />
        </button>
        <button
          type="button"
          onClick={onAddToCart}
          className="h-12 rounded-2xl border border-black text-black font-semibold text-base flex items-center justify-center gap-2 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40"
        >
          <ShoppingCart size={18} /> Adicionar ao carrinho
        </button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        {isFastShipping && (
          <span className="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-1 text-black">
            <Truck size={14} /> Envio rápido
          </span>
        )}
        {showSecure && (
          <span className="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-1 text-black">
            <ShieldCheck size={14} /> Compra segura
          </span>
        )}
        {isBestSeller && (
          <span className="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-1 text-black">
            <Star size={14} /> Mais vendido
          </span>
        )}
      </div>
    </div>
  );
}



