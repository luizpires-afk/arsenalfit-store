import { Zap, Timer } from "lucide-react";

export const PromotionsCarousel = () => {
  return (
    <section className="container-fit py-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Banner 1 - Lime Style */}
        <div className="relative overflow-hidden rounded-3xl bg-primary p-8 text-primary-foreground group cursor-pointer">
          <div className="relative z-10 flex flex-col h-full justify-between gap-8">
            <div className="space-y-2">
              <div className="flex items-center gap-2 bg-white/20 w-fit px-3 py-1 rounded-full text-xs font-bold uppercase">
                <Timer size={14} /> Oferta Limitada
              </div>
              <h3 className="text-3xl font-display font-black leading-tight">
                COMBOS DE WHEY <br /> ATÉ 40% OFF
              </h3>
            </div>
            <button className="bg-secondary text-secondary-foreground w-fit px-6 py-3 rounded-xl font-bold group-hover:scale-105 transition-transform">
              Ver Ofertas Oficiais
            </button>
          </div>
          <Zap className="absolute -right-10 -bottom-10 w-64 h-64 text-white/10 rotate-12" />
        </div>

        {/* Banner 2 - Forest Style */}
        <div className="relative overflow-hidden rounded-3xl bg-secondary p-8 text-secondary-foreground group cursor-pointer">
          <div className="relative z-10 flex flex-col h-full justify-between gap-8">
            <div className="space-y-2">
              <div className="flex items-center gap-2 bg-primary/20 w-fit px-3 py-1 rounded-full text-xs font-bold uppercase text-primary">
                <Zap size={14} /> Performance
              </div>
              <h3 className="text-3xl font-display font-black leading-tight">
                MELHORES CREATINAS <br /> DA SEMANA
              </h3>
            </div>
            <button className="bg-primary text-primary-foreground w-fit px-6 py-3 rounded-xl font-bold group-hover:scale-105 transition-transform">
              Comparar Preços
            </button>
          </div>
          <div className="absolute -right-5 -bottom-5 w-48 h-48 bg-primary/20 rounded-full blur-3xl" />
        </div>
      </div>
    </section>
  );
};

