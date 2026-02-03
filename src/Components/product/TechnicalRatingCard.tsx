import type { TechnicalRatingData } from "@/lib/productNormalizer";

interface TechnicalRatingCardProps {
  rating: TechnicalRatingData;
}

export function TechnicalRatingCard({ rating }: TechnicalRatingCardProps) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm max-w-xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Avaliação técnica</p>
          <h3 className="text-lg font-semibold text-zinc-900 mt-1">Critérios de qualidade</h3>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-500">Nota final</p>
          <p className="text-2xl font-semibold text-zinc-900">
            {rating.finalScore !== null ? rating.finalLabel : "Não informado"}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {rating.scores.map((score) => (
          <div key={score.key} className="flex items-center justify-between text-sm">
            <span className="text-zinc-700">{score.label}</span>
            <span className="font-medium text-zinc-900">
              {score.score !== null ? `${score.score}/10` : "Não informado"}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-zinc-500">{rating.note}</p>
    </div>
  );
}

