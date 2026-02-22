import { useState } from "react";
import { Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/Components/ui/popover";

type MonitorPriceToggleProps = {
  active: boolean;
  onToggle: () => void;
  onLearnMore: () => void;
  loading?: boolean;
};

export function MonitorPriceToggle({
  active,
  onToggle,
  onLearnMore,
  loading = false,
}: MonitorPriceToggleProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={loading}
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] transition-all ${
            active
              ? "border-[var(--cart-accent)] bg-[var(--cart-accent-soft)] text-[var(--cart-accent)]"
              : "border-[rgba(255,106,0,0.45)] bg-[rgba(255,106,0,0.08)] text-[var(--cart-text)] hover:border-[var(--cart-accent)] hover:text-[var(--cart-accent)]"
          } ${loading ? "opacity-60 cursor-not-allowed" : ""}`}
        >
          <Search className="h-4 w-4" />
          Monitorar preço
        </button>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--cart-muted)] hover:text-[var(--cart-accent)] hover:underline hover:underline-offset-4 transition-colors"
            >
              Como monitorar
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            className="w-80 rounded-2xl border border-[var(--cart-border)] bg-white p-4 text-[var(--cart-text)] shadow-[0_18px_40px_rgba(0,0,0,0.12)]"
          >
            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--cart-accent)]">
                Monitoramento de preço
              </p>
              <p className="text-xs text-[var(--cart-muted)]">
                Ative para receber um e-mail quando este produto baixar de preço. Você verá o
                valor atual e quanto economizou desde o último registro.
              </p>
              <p className="text-[10px] text-[var(--cart-muted-2)]">
                Sem spam — enviamos apenas quando houver queda real.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-full border border-[var(--cart-border)] px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--cart-muted)] hover:text-[var(--cart-text)]"
                >
                  Entendi
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onLearnMore();
                  }}
                  className="flex-1 rounded-full bg-[var(--cart-accent)] px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-white"
                >
                  Gerenciar alertas
                </button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <span className="inline-flex items-center gap-2 text-[9px] uppercase tracking-[0.3em] text-[var(--cart-muted-2)]">
          {active && (
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--cart-accent)] shadow-[0_0_8px_rgba(255,106,0,0.45)] animate-cart-pulse" />
          )}
          <span className="font-bold">{active ? "Monitoramento ativado" : "Monitoramento desativado"}</span>
        </span>
      </div>
      <span className="text-[10px] text-[var(--cart-muted)]">
        Ative e acompanhe no carrinho. Você recebe e-mail só quando cair.
      </span>
    </div>
  );
}
