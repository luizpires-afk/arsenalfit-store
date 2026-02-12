import { toast } from "sonner";
import { CheckCircle2, Info, ShoppingCart, X } from "lucide-react";
import { openMonitorInfoDialog } from "@/Components/monitoring/MonitorInfoDialog";

type FlyToCartOptions = {
  sourceEl?: HTMLElement | null;
  targetEl?: HTMLElement | null;
  imageSrc?: string | null;
  duration?: number;
  easing?: string;
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const resolveCartIcon = (targetEl?: HTMLElement | null) =>
  targetEl ?? (document.querySelector("[data-cart-icon]") as HTMLElement | null);

export const bounceCartIcon = (targetEl?: HTMLElement | null) => {
  if (typeof window === "undefined" || prefersReducedMotion()) return;
  const target = resolveCartIcon(targetEl);
  if (!target || !target.animate) return;
  target.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(1.08)" },
      { transform: "scale(1)" },
    ],
    { duration: 280, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
  );
};

export const flyToCartAnimation = async ({
  sourceEl,
  targetEl,
  imageSrc,
  duration = 600,
  easing = "cubic-bezier(0.2, 0.8, 0.2, 1)",
}: FlyToCartOptions) => {
  if (typeof window === "undefined" || prefersReducedMotion()) return;
  const source = sourceEl;
  const target = resolveCartIcon(targetEl);
  if (!source || !target) return;

  const sourceRect = source.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  if (!sourceRect.width || !sourceRect.height) return;

  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "9999";

  const clone = document.createElement("img");
  const resolvedSrc =
    imageSrc ??
    (source instanceof HTMLImageElement ? source.currentSrc || source.src : "");
  if (!resolvedSrc) return;
  clone.src = resolvedSrc;
  clone.alt = "";
  clone.style.position = "absolute";
  clone.style.left = `${sourceRect.left}px`;
  clone.style.top = `${sourceRect.top}px`;
  clone.style.width = `${sourceRect.width}px`;
  clone.style.height = `${sourceRect.height}px`;
  clone.style.objectFit = "contain";
  clone.style.borderRadius = "16px";
  clone.style.boxShadow = "0 10px 24px rgba(0,0,0,0.18)";
  clone.style.willChange = "transform, opacity, filter";
  clone.style.transformOrigin = "center center";

  overlay.appendChild(clone);
  document.body.appendChild(overlay);

  const startX = sourceRect.left + sourceRect.width / 2;
  const startY = sourceRect.top + sourceRect.height / 2;
  const targetX = targetRect.left + targetRect.width / 2;
  const targetY = targetRect.top + targetRect.height / 2;
  const deltaX = targetX - startX;
  const deltaY = targetY - startY;

  const animation = clone.animate(
    [
      { transform: "translate(0px, 0px) scale(1)", opacity: 1, filter: "blur(0px)" },
      {
        transform: `translate(${deltaX}px, ${deltaY}px) scale(0.2)`,
        opacity: 0.2,
        filter: "blur(1px)",
      },
    ],
    { duration, easing, fill: "forwards" }
  );

  return new Promise<void>((resolve) => {
    const cleanup = () => {
      overlay.remove();
      resolve();
    };
    animation.onfinish = cleanup;
    animation.oncancel = cleanup;
  });
};

type CartToastOptions = {
  onGoToCart?: () => void;
  onLearnMore?: () => void;
};

export const showAddToCartToast = ({ onGoToCart, onLearnMore }: CartToastOptions = {}) => {
  toast.custom(
    (t) => (
      <div
        role="status"
        aria-live="polite"
        className="w-[320px] rounded-[18px] border border-zinc-200 bg-white p-4 shadow-[0_14px_40px_rgba(0,0,0,0.18)]"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div className="flex-1 space-y-1">
            <p className="text-sm font-semibold text-zinc-900">
              Produto adicionado ao carrinho
            </p>
            <p className="text-xs text-zinc-500">
              No carrinho, você pode monitorar o preço e receber alerta quando baixar.
            </p>
          </div>
          <button
            type="button"
            onClick={() => toast.dismiss(t)}
            className="text-zinc-400 hover:text-zinc-600 transition-colors"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              toast.dismiss(t);
              onGoToCart?.();
            }}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-black transition-transform hover:-translate-y-0.5"
          >
            <ShoppingCart className="h-4 w-4" />
            VER CARRINHO
          </button>
          <button
            type="button"
            onClick={() => {
              toast.dismiss(t);
              if (onLearnMore) {
                onLearnMore();
              } else {
                openMonitorInfoDialog();
              }
            }}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Info className="h-4 w-4" />
            SAIBA MAIS
          </button>
        </div>
      </div>
    ),
    {
      duration: 5000,
      position: "top-right",
      className: "!bg-transparent !border-0 !shadow-none !p-0",
    }
  );
};
