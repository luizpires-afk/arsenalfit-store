import { ArrowRight, Zap } from "lucide-react";

export const HeroSection = () => {
  return (
    <div className="relative min-h-[80vh] flex items-center overflow-hidden bg-gradient-hero">
      {/* Círculos decorativos de fundo usando suas cores lime */}
      <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] animate-pulse-slow" />
      
      <div className="container-fit relative z-10">
        <div className="max-w-2xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary animate-fade-in">
            <Zap size={16} />
            <span className="text-xs font-bold uppercase tracking-wider">As melhores ofertas fitness</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-display font-black text-white leading-tight animate-slide-up">
            TRANSFORME SEU <br />
            <span className="text-gradient">SHAPE HOJE</span>
          </h1>
          
          <p className="text-muted-foreground text-lg md:text-xl max-w-lg animate-slide-up" style={{ animationDelay: '0.1s' }}>
            Curadoria exclusiva dos melhores suplementos e acessórios com descontos que você só encontra aqui. Redirecionamos você para as lojas oficiais.
          </p>
          
          <div className="flex flex-wrap gap-4 pt-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <button className="btn-glow bg-primary text-primary-foreground px-8 py-4 rounded-xl font-bold flex items-center gap-2 text-lg">
              Explorar Produtos <ArrowRight size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Imagem Flutuante (Exemplo) */}
      <div className="hidden lg:block absolute right-10 top-1/2 -translate-y-1/2 w-[500px] h-[500px] animate-float">
        <div className="w-full h-full bg-primary/5 rounded-3xl border border-white/10 backdrop-blur-3xl p-8 flex items-center justify-center">
             <span className="text-white/20 font-black text-8xl">FIT</span>
        </div>
      </div>
    </div>
  );
};

