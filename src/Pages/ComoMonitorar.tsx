import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import SEOHead from "@/Components/SEOHead";
import { Button } from "@/Components/ui/button";

export default function ComoMonitorar() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <SEOHead
        title="Como monitorar preço no ArsenalFit"
        description="Aprenda em poucos passos como monitorar preços pelo produto ou carrinho no ArsenalFit."
        ogType="article"
      />

      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">Tutorial rápido</p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-black tracking-tight text-zinc-900">
            Como monitorar preço no ArsenalFit
          </h1>
          <p className="mt-3 text-zinc-600">
            Você monitora pelo Produto ou pelo Carrinho — e vê tudo no carrinho.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild className="rounded-full bg-[hsl(var(--accent-orange))] hover:bg-[hsl(var(--accent-orange))]/90">
              <Link to="/carrinho">Abrir carrinho</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/produtos">Ver produtos</Link>
            </Button>
          </div>
        </header>

        <section className="mt-8 grid gap-8">
          <article className="rounded-3xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-sm">
            <h2 className="text-2xl font-black text-zinc-900">1) Monitorar pelo produto</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 md:items-start">
              <img
                src="/hero/hero-2.jpg"
                alt="Exemplo de produto para monitorar"
                className="h-52 w-full rounded-2xl object-cover"
                loading="lazy"
              />
              <ol className="space-y-3 text-zinc-700">
                <li>1. Abra um produto.</li>
                <li>2. Clique em <strong>Monitorar produto</strong>.</li>
                <li>3. Pronto: ele aparece em <strong>Carrinho &gt; Produtos monitorados</strong>.</li>
              </ol>
            </div>
          </article>

          <article className="rounded-3xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-sm">
            <h2 className="text-2xl font-black text-zinc-900">2) Monitorar pelo carrinho</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 md:items-start">
              <img
                src="/hero/hero-4.jpg"
                alt="Exemplo de carrinho para ativar monitoramento"
                className="h-52 w-full rounded-2xl object-cover"
                loading="lazy"
              />
              <ol className="space-y-3 text-zinc-700">
                <li>1. Clique em <strong>Adicionar ao carrinho</strong>.</li>
                <li>2. Abra o carrinho.</li>
                <li>3. Ative <strong>Monitorar</strong> no item desejado.</li>
              </ol>
            </div>
          </article>

          <article className="rounded-3xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-sm">
            <h2 className="text-2xl font-black text-zinc-900">3) Onde ficam os monitorados</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 md:items-start">
              <img
                src="/images/cart-hero.png"
                alt="Lista de produtos monitorados no carrinho"
                className="h-52 w-full rounded-2xl object-cover"
                loading="lazy"
              />
              <div className="space-y-3 text-zinc-700">
                <p>
                  Todos os itens monitorados aparecem no bloco <strong>Produtos monitorados</strong> dentro do carrinho.
                </p>
                <p>Você pode desativar quando quiser.</p>
                <Button asChild variant="outline" className="rounded-full">
                  <Link to="/carrinho">Ir para produtos monitorados</Link>
                </Button>
              </div>
            </div>
          </article>

          <article className="rounded-3xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-sm">
            <h2 className="text-2xl font-black text-zinc-900">FAQ rápida</h2>
            <div className="mt-4 space-y-4 text-zinc-700">
              <div>
                <p className="font-bold">Recebo muitos e-mails?</p>
                <p>Não. Só quando houver queda real confirmada.</p>
              </div>
              <div>
                <p className="font-bold">Como desativar?</p>
                <p>No carrinho, em Produtos monitorados.</p>
              </div>
              <div>
                <p className="font-bold">Posso monitorar vários?</p>
                <p>Sim, pelo carrinho é o mais rápido.</p>
              </div>
            </div>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Monitoramento pronto para uso
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
