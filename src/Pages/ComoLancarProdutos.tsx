import { Link } from "react-router-dom";
import { CheckCircle2, TerminalSquare } from "lucide-react";
import SEOHead from "@/Components/SEOHead";
import { Button } from "@/Components/ui/button";

const STEPS = [
  {
    title: "1) Rodar preparacao cautelosa",
    command: "npm run robo_agora_cauteloso",
    detail:
      "Executa ingestao, limpeza, reparos e manutencao de precos para preparar base segura.",
  },
  {
    title: "2) Listar pendencias de validacao",
    command: "npm run affiliate_validation_list",
    detail:
      "Mostra links/produtos que ainda precisam de validacao antes de ativar na loja.",
  },
  {
    title: "3) Abrir lote de validacao (se houver)",
    command: "npm run affiliate_validation_open_batch",
    detail:
      "Monta o lote operacional para validacao de afiliados pendentes.",
  },
  {
    title: "4) Aplicar lote validado",
    command: "npm run affiliate_validation_apply_batch",
    detail:
      "Promove para a loja apenas o que passou na validacao.",
  },
  {
    title: "5) Auditar regras da vitrine",
    command: "npm run home_rules_audit",
    detail:
      "Confere regras comerciais da home (descontos, consistencia e qualidade).",
  },
  {
    title: "6) Rodar guarda de comercio",
    command: "npm run root_commerce_guard",
    detail:
      "Valida consistencia geral de ativos e evita produto incoerente no storefront.",
  },
  {
    title: "7) Auditar ativos publicados",
    command: "npm run audit_all_active_offers",
    detail:
      "Verifica se os ativos finais estao com oferta e preco coerentes.",
  },
  {
    title: "8) Snapshot operacional final",
    command: "npm run operational_health_snapshot",
    detail:
      "Gera panorama final da saude operacional apos o lancamento.",
  },
];

export default function ComoLancarProdutos() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <SEOHead
        title="Como lancar produtos validados na loja"
        description="Passo a passo operacional para publicar produtos validados com seguranca no ArsenalFit."
        ogType="article"
      />

      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">Operacao da loja</p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-black tracking-tight text-zinc-900">
            Lancar produtos validados
          </h1>
          <p className="mt-3 text-zinc-600">
            Siga esta ordem para publicar com seguranca e manter coerencia de precos, links e vitrine.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild className="rounded-full bg-[hsl(var(--accent-orange))] hover:bg-[hsl(var(--accent-orange))]/90">
              <Link to="/admin/products">Abrir Admin Produtos</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/admin/operational-reliability">Abrir Confiabilidade</Link>
            </Button>
          </div>
        </header>

        <section className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-sm">
          <h2 className="text-2xl font-black text-zinc-900">Checklist de lancamento</h2>
          <div className="mt-6 grid gap-4">
            {STEPS.map((step) => (
              <article key={step.title} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <h3 className="text-base font-black text-zinc-900">{step.title}</h3>
                <p className="mt-1 text-sm text-zinc-700">{step.detail}</p>
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-zinc-200 bg-white p-3">
                  <TerminalSquare className="mt-0.5 h-4 w-4 text-zinc-500" />
                  <code className="text-xs sm:text-sm text-zinc-800 break-all">{step.command}</code>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-sm">
          <h2 className="text-2xl font-black text-zinc-900">Verificacao final no site</h2>
          <ul className="mt-4 grid gap-3 text-zinc-700">
            <li className="inline-flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
              Home carregando sem erros e com cards coerentes.
            </li>
            <li className="inline-flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
              Produtos ativos com link afiliado valido.
            </li>
            <li className="inline-flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
              Sem mismatch critico em auditoria de ativos.
            </li>
            <li className="inline-flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
              Snapshot operacional com status aceitavel para publicacao.
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
