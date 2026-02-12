import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/Components/ui/dialog";
import { ArrowRight } from "lucide-react";

const MONITOR_INFO_EVENT = "arsenalfit:monitor-info";

export const openMonitorInfoDialog = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MONITOR_INFO_EVENT));
};

export function MonitorInfoDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener(MONITOR_INFO_EVENT, handleOpen);
    return () => window.removeEventListener(MONITOR_INFO_EVENT, handleOpen);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg rounded-[28px] border border-zinc-200 bg-white p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-black uppercase tracking-[0.2em] text-zinc-900">
            Como funciona o monitoramento de preço?
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-4 text-sm text-zinc-600">
          <p>
            Ao ativar, o ArsenalFit acompanha o preço automaticamente. Quando o valor cair,
            você recebe um e-mail com:
          </p>
          <ul className="space-y-2 text-sm text-zinc-600">
            <li>• Preço atual</li>
            <li>• Quanto baixou em R$ (economia)</li>
            <li>• Botão para ver a oferta rapidamente</li>
          </ul>
          <p className="text-xs text-zinc-500">
            Você pode desativar a qualquer momento no carrinho.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.href = "/carrinho";
              }
              setOpen(false);
            }}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[hsl(var(--accent-orange))] px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-white"
          >
            Ativar monitoramento <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex flex-1 items-center justify-center rounded-full border border-zinc-200 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:border-primary/40 hover:text-primary transition-colors"
          >
            Fechar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
