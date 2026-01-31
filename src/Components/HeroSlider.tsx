import React from 'react';
import useEmblaCarousel from 'embla-carousel-react';
// @ts-ignore - Ignora erro de tipo caso o pacote de tipos não esteja instalado
import Autoplay from 'embla-carousel-autoplay';
import { Zap, ArrowRight, Target } from 'lucide-react';
import { Button } from '@/Components/ui/button';

const BANNERS = [
  {
    title: "PURA PERFORMANCE",
    subtitle: "A CURADORIA DEFINITIVA PARA O TOPO",
    image: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=2070",
    accent: "PERFORMANCE",
    cta: "Explorar Coleção"
  },
  {
    title: "FORCE MODE",
    subtitle: "EQUIPAMENTOS DE ELITE PARA O SEU TREINO",
    image: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=2070",
    accent: "MODE",
    cta: "Ver Equipamentos"
  }
];

export const HeroSlider = () => {
  // Inicialização do Carousel com Autoplay seguro
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, duration: 30 }, 
    [Autoplay({ delay: 5000, stopOnInteraction: false })]
  );

  const [selectedIndex, setSelectedIndex] = React.useState(0);

  // Lógica para atualizar a "bolinha" indicadora
  const onSelect = React.useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  React.useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', onSelect);
    onSelect();
  }, [emblaApi, onSelect]);

  return (
    <section className="relative bg-zinc-950 overflow-hidden border-b border-primary/10">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {BANNERS.map((banner, index) => (
            <div key={index} className="relative flex-[0_0_100%] min-w-0 py-24 md:py-36">
              {/* Imagem de Fundo com Zoom Suave */}
              <div 
                className="absolute inset-0 bg-cover bg-center grayscale opacity-20 transition-transform duration-\[10000ms\] scale-110" 
                style={{ 
                  backgroundImage: `url(${banner.image})`,
                  transform: selectedIndex === index ? 'scale(1)' : 'scale(1.1)'
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />

              <div className="container-fit relative z-10 text-center">
                <div className="flex justify-center mb-8">
                  <div className="p-4 rounded-3xl bg-primary shadow-[0_0_30px_rgba(163,230,53,0.3)] animate-pulse">
                    <Target className="h-10 w-10 text-black" />
                  </div>
                </div>
                
                <h2 className="text-6xl md:text-9xl font-display font-black mb-6 uppercase tracking-tighter text-white leading-[0.85]">
                  {banner.title.includes(banner.accent) ? (
                    <>
                      {banner.title.split(banner.accent)[0]}
                      <span className="text-primary italic">{banner.accent}</span>
                      {banner.title.split(banner.accent)[1]}
                    </>
                  ) : banner.title}
                </h2>
                
                <p className="text-xl md:text-2xl text-zinc-400 max-w-3xl mx-auto mb-12 font-medium tracking-tight px-4">
                  {banner.subtitle}
                </p>

                <div className="flex flex-col md:flex-row items-center justify-center gap-6">
                  <Button className="h-16 px-10 rounded-2xl bg-primary text-black font-black uppercase italic tracking-widest text-lg hover:bg-primary/80 transition-all group border-none shadow-xl shadow-primary/10">
                    {banner.cta} <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                  
                  <div className="px-6 py-4 bg-zinc-900/50 backdrop-blur-md rounded-2xl border border-zinc-800 flex items-center gap-3">
                    <Zap className="h-5 w-5 text-primary" />
                    <span className="text-white font-black uppercase text-[10px] tracking-[0.2em]">Equipe Elite</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Indicadores (Dots) */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex gap-2">
        {BANNERS.map((_, i) => (
          <button
            key={i}
            onClick={() => emblaApi?.scrollTo(i)}
            className={`h-1.5 transition-all duration-500 rounded-full ${
              i === selectedIndex ? 'w-8 bg-primary' : 'w-2 bg-zinc-700'
            }`}
          />
        ))}
      </div>
    </section>
  );
};


