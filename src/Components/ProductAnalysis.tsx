import { CheckCircle2, BarChart, ShieldCheck } from "lucide-react";

interface AnalysisProps {
  price: number;
  competitor_price?: number;
  quality_score: number;
  technical_analysis: string;
  best_use_case: string;
}

export const ProductAnalysis = ({ price, competitor_price, quality_score, technical_analysis, best_use_case }: AnalysisProps) => {
  const savings = competitor_price ? ((1 - price / competitor_price) * 100).toFixed(0) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 my-12">
      {/* CARD 1: COMPARADOR DE PREÇOS */}
      <div className="bg-zinc-900 rounded-[32px] p-8 border border-zinc-800 relative overflow-hidden">
        <div className="flex items-center gap-2 mb-6 text-primary uppercase font-black italic tracking-tighter">
          <BarChart size={20} /> Comparador de Preços
        </div>
        
        <div className="space-y-6">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-zinc-500 text-xs uppercase font-bold">Na concorrência</p>
              <p className="text-zinc-400 line-through text-xl font-mono">R$ {competitor_price?.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-primary text-xs uppercase font-black italic">Na ArsenalFit</p>
              <p className="text-white text-4xl font-black font-mono">R$ {price.toFixed(2)}</p>
            </div>
          </div>

          {Number(savings) > 0 && (
            <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex items-center justify-between">
              <span className="text-primary font-bold text-sm">Economia Real de:</span>
              <span className="bg-primary text-black font-black px-3 py-1 rounded-lg text-lg">-{savings}%</span>
            </div>
          )}
        </div>
      </div>

      {/* CARD 2: AVALIAÇÃO DO ESPECIALISTA */}
      <div className="bg-white rounded-[32px] p-8 border border-zinc-200 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-zinc-900 uppercase font-black italic tracking-tighter">
            <ShieldCheck size={20} className="text-primary" /> Avaliação Técnica
          </div>
          <div className="text-3xl font-black italic text-primary">{quality_score}/10</div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-black uppercase text-zinc-400 mb-1">Indicação de Uso</p>
            <div className="flex items-center gap-2 text-zinc-900 font-bold italic">
              <CheckCircle2 size={16} className="text-green-500" /> {best_use_case}
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-100">
            <p className="text-[10px] font-black uppercase text-zinc-400 mb-2">Análise do Tecido/Qualidade</p>
            <p className="text-zinc-700 text-sm leading-relaxed italic">
              "{technical_analysis}"
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};


