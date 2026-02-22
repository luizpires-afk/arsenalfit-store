import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/Components/ui/dialog";
import { ArrowRight, CheckCircle2 } from "lucide-react";

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
      <DialogContent className="max-w-3xl rounded-[28px] border border-zinc-200 bg-white p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-black uppercase tracking-[0.2em] text-zinc-900">
            Como monitorar seu produto
          </DialogTitle>
          <p className="text-sm text-zinc-600">
            Escolha um jeito. Todos os monitorados aparecem no carrinho.
          </p>
        </DialogHeader>

        <div className="mt-4 hidden md:grid md:grid-cols-2 gap-4 text-sm text-zinc-700">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">Opção 1</p>
            <h3 className="text-base font-black text-zinc-900">Monitorar pelo produto</h3>
            <ol className="space-y-2 text-sm">
              <li>1. Abra um produto</li>
              <li>2. Clique em <strong>Monitorar produto</strong></li>
              <li>3. Pronto — ele aparece em <strong>Produtos monitorados</strong> no carrinho</li>
            </ol>
            <a
              href="/produtos"
              className="inline-flex items-center text-xs font-bold uppercase tracking-[0.14em] text-[hsl(var(--accent-orange))] hover:underline"
            >
              Ver exemplo na página do produto
            </a>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">Opção 2</p>
            <h3 className="text-base font-black text-zinc-900">Monitorar pelo carrinho</h3>
            <ol className="space-y-2 text-sm">
              <li>1. Clique em <strong>Adicionar ao carrinho</strong></li>
              <li>2. Abra o carrinho</li>
              <li>3. Ative o monitoramento do item</li>
            </ol>
            <a
              href="/carrinho"
              className="inline-flex items-center text-xs font-bold uppercase tracking-[0.14em] text-[hsl(var(--accent-orange))] hover:underline"
            >
              Ir para o carrinho
            </a>
          </div>

          <div className="md:col-span-2 rounded-2xl border border-zinc-200 bg-white p-4 space-y-2">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">O que você recebe</p>
            <p className="text-sm text-zinc-700">Quando houver queda real, você recebe e-mail com:</p>
            <ul className="grid gap-2 sm:grid-cols-3 text-sm text-zinc-700">
              <li className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Preço atual</li>
              <li className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Quanto baixou (R$)</li>
              <li className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Botão direto da oferta</li>
            </ul>
          </div>
        </div>

        <div className="mt-4 md:hidden overflow-x-auto no-scrollbar -mx-2 px-2">
          <div className="flex snap-x snap-mandatory gap-3">
            <article className="snap-start shrink-0 w-[84%] rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
              <h3 className="text-base font-black text-zinc-900">Como monitorar</h3>
              <p className="text-sm text-zinc-700">
                Você pode monitorar pelo Produto ou pelo Carrinho. Todos ficam no carrinho.
              </p>
            </article>

            <article className="snap-start shrink-0 w-[84%] rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
              <h3 className="text-base font-black text-zinc-900">Pelo produto</h3>
              <ol className="space-y-2 text-sm text-zinc-700">
                <li>1. Abra o produto</li>
                <li>2. Toque em <strong>Monitorar produto</strong></li>
                <li>3. Veja em <strong>Carrinho &gt; Produtos monitorados</strong></li>
              </ol>
            </article>

            <article className="snap-start shrink-0 w-[84%] rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
              <h3 className="text-base font-black text-zinc-900">Pelo carrinho</h3>
              <ol className="space-y-2 text-sm text-zinc-700">
                <li>1. Adicione ao carrinho</li>
                <li>2. Abra o carrinho</li>
                <li>3. Ative <strong>Monitorar</strong> no item</li>
              </ol>
            </article>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:flex md:flex-wrap">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.href = "/carrinho";
              }
              setOpen(false);
            }}
            className="inline-flex w-full md:flex-1 items-center justify-center gap-2 rounded-full bg-[hsl(var(--accent-orange))] px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-white"
          >
            Ativar monitoramento <ArrowRight className="h-4 w-4" />
          </button>
          <a
            href="/como-monitorar"
            target="_blank"
            rel="noreferrer"
            className="hidden md:inline-flex md:flex-1 items-center justify-center rounded-full border border-zinc-200 px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-[hsl(var(--accent-orange))] hover:border-[hsl(var(--accent-orange))]/40"
          >
            Como monitorar (passo a passo)
          </a>
          <a
            href="/como-monitorar"
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center rounded-full border border-[hsl(var(--accent-orange))]/35 bg-[hsl(var(--accent-orange))]/10 px-4 py-2 text-[12px] font-black uppercase tracking-[0.14em] text-[hsl(var(--accent-orange))] md:hidden"
          >
            Ver tutorial completo
          </a>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex w-full md:flex-1 items-center justify-center rounded-full border border-zinc-200 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:border-primary/40 hover:text-primary transition-colors"
          >
            Fechar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
