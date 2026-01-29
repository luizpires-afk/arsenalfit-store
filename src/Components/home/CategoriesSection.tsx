import { Dumbbell, Flame, Zap, HeartPulse } from "lucide-react";

const categories = [
  { id: 'massa', name: 'Massa Muscular', icon: Dumbbell, color: 'bg-primary' },
  { id: 'emagrecimento', name: 'Emagrecimento', icon: Flame, color: 'bg-orange-500' },
  { id: 'energia', name: 'Energia e Foco', icon: Zap, color: 'bg-yellow-400' },
  { id: 'saude', name: 'Saúde e Bem-estar', icon: HeartPulse, color: 'bg-forest-500' },
];

export const CategoriesSection = () => {
  return (
    <section className="container-fit py-16">
      <div className="flex flex-col items-center text-center mb-10">
        <h2 className="text-3xl font-display font-black uppercase tracking-tighter">
          Navegue por <span className="text-primary">Objetivo</span>
        </h2>
        <div className="h-1 w-20 bg-primary mt-2 rounded-full" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {categories.map((cat) => (
          <div 
            key={cat.id}
            className="group cursor-pointer p-6 rounded-2xl border border-border bg-card hover:border-primary transition-all duration-300 text-center card-hover"
          >
            <div className={`w-16 h-16 ${cat.color} rounded-2xl mx-auto flex items-center justify-center mb-4 text-white group-hover:scale-110 transition-transform`}>
              <cat.icon size={32} />
            </div>
            <h3 className="font-bold text-lg">{cat.name}</h3>
            <p className="text-xs text-muted-foreground mt-1">Ver produtos</p>
          </div>
        ))}
      </div>
    </section>
  );
};
