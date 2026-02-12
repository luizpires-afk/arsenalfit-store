import React from 'react';
import { motion } from "framer-motion";
import { ArrowDown, Zap } from "lucide-react";

export default function HeroSection() {
  const scrollToProducts = () => {
    document.getElementById('best-deals')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative min-h-[58vh] flex items-center justify-center overflow-hidden bg-zinc-950">
      {/* Background Image with Overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-40"
        style={{
          backgroundImage: 'url(https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=2070)'
        }}
      />
      
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/80 via-zinc-950/60 to-zinc-950" />
      
      <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-lime-400/10 border border-lime-400/20 mb-6">
            <Zap className="w-4 h-4 text-lime-400" />
            <span className="text-lime-400 text-sm font-medium">Curadoria fitness com preço monitorado</span>
          </div>
          
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-5 leading-tight">
            Curadoria fitness com o
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-lime-400 to-emerald-400">
              melhor preço real
            </span>
          </h1>
          
          <p className="text-zinc-400 text-base md:text-lg max-w-2xl mx-auto mb-8 leading-relaxed">
            Monitoramos preços automaticamente e te levamos direto ao link oficial.
          </p>
          
          <motion.button
            onClick={scrollToProducts}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="inline-flex items-center gap-3 px-8 py-4 bg-lime-400 text-zinc-900 rounded-full font-bold text-base sm:text-lg hover:bg-lime-300 transition-colors duration-300"
          >
            Ver ofertas de hoje
            <ArrowDown className="w-5 h-5 animate-bounce" />
          </motion.button>
        </motion.div>
      </div>

      {/* Bottom Fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent" />
    </section>
  );
}
