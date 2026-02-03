import { ArrowRight } from "lucide-react";
import { formatPrice } from "@/lib/validators";

interface StickyMobileCTAProps {
  visible: boolean;
  price: number;
  onBuyNow: () => void;
}

export function StickyMobileCTA({ visible, price, onBuyNow }: StickyMobileCTAProps) {
  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white px-4 py-3 shadow-md transition-transform md:hidden ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Preço</p>
          <p className="text-lg font-semibold text-zinc-900">{formatPrice(price)}</p>
        </div>
        <button
          type="button"
          onClick={onBuyNow}
          className="h-11 rounded-2xl bg-primary text-black font-semibold px-4 flex items-center gap-2 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          Comprar agora <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

