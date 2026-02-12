import { Link } from "react-router-dom";
import { Button } from "@/Components/ui/button";
import { Frown, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-center px-4 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#a3e635]/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-zinc-900 border border-zinc-800 rounded-3xl flex items-center justify-center rotate-6 shadow-2xl">
            <Frown className="w-10 h-10 text-[#a3e635]" />
          </div>
        </div>

        <h1 className="text-8xl md:text-9xl font-black text-white italic tracking-tighter leading-none">
          404
        </h1>
        
        <h2 className="text-xl md:text-2xl font-black text-[#a3e635] uppercase italic mt-4 tracking-widest">
          Fora do Radar
        </h2>

        <p className="text-zinc-500 mt-4 mb-8 max-w-sm mx-auto font-medium">
          A oferta ou página que você está buscando não existe ou foi removida pelo sistema.
        </p>

        <div className="flex flex-col gap-3 items-center">
          <Link to="/">
            <Button className="bg-white hover:bg-[#a3e635] text-black font-black italic px-8 h-14 rounded-2xl transition-all flex gap-2 group">
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
              Voltar para Home
            </Button>
          </Link>
          <Link to="/melhores-ofertas" className="text-xs font-bold uppercase text-[#a3e635] hover:underline tracking-[0.2em]">
            Ir direto para Ofertas
          </Link>
        </div>
      </div>

      <p className="absolute bottom-8 text-zinc-800 font-black uppercase tracking-[0.5em] text-[10px]">
        ArsenalFit // Protocolo de Erro
      </p>
    </div>
  );
}
