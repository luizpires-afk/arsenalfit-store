import type { MarketplaceSpecField } from "@/lib/productNormalizer";

interface TechSpecPanelProps {
  specs: MarketplaceSpecField[];
}

export function TechSpecPanel({ specs }: TechSpecPanelProps) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-zinc-900">Ficha técnica</h3>
        <span className="text-xs uppercase tracking-[0.2em] text-zinc-400">Marketplace</span>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        {specs.map((spec) => (
          <div key={spec.key} className="rounded-2xl border border-zinc-100 bg-zinc-50/70 p-3">
            <dt className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">{spec.label}</dt>
            <dd className="text-sm font-medium text-zinc-900 mt-1">{spec.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs text-zinc-500">
        Informações exibidas com base no cadastro interno. Itens externos não são publicados sem validação.
      </p>
    </div>
  );
}

