import { ArrowRight } from "lucide-react";
import { formatPrice } from "@/lib/validators";

interface StickyMobileCTAProps {
  visible: boolean;
  price: number;
  secondaryPrice?: number | null;
  hasPixPrice?: boolean;
  onBuyNow: () => void;
  disabled?: boolean;
}

export function StickyMobileCTA({
  visible,
  price,
  secondaryPrice = null,
  hasPixPrice = false,
  onBuyNow,
  disabled = false,
}: StickyMobileCTAProps) {
  const hasSecondary = secondaryPrice !== null && secondaryPrice > price;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white px-4 py-3 shadow-md transition-transform md:hidden ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            {hasPixPrice && hasSecondary ? "Preco no Pix" : "Preco"}
          </p>
          <p className="text-lg font-semibold text-zinc-900">{formatPrice(price)}</p>
          {hasSecondary && (
            <p className="text-[11px] text-zinc-500">ou {formatPrice(secondaryPrice)} em outros meios</p>
          )}
        </div>
        <button
          type="button"
          onClick={onBuyNow}
          disabled={disabled}
          className={`h-11 rounded-2xl bg-primary text-black font-semibold px-4 flex items-center gap-2 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
            disabled ? "opacity-60 cursor-not-allowed" : ""
          }`}
        >
          {disabled ? "Aguardando validacao" : "Comprar agora"} <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
