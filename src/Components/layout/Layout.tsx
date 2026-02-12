import { ReactNode } from "react";
import { Instagram } from "lucide-react";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans antialiased">
      {/* Conteúdo Principal (Expandível) */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer Centralizado e Limpo */}
      <footer className="bg-black text-white py-16 border-t border-white/10">
        <div className="container mx-auto px-4 flex flex-col items-center text-center">
          
          {/* Marca ArsenalFit Centralizada e com Alto Contraste */}
          <div className="mb-6">
            <span className="font-display font-black text-4xl tracking-tighter uppercase italic select-none">
              ARSENAL<span className="text-primary">FIT</span>
            </span>
          </div>

          {/* Slogan */}
          <p className="max-w-2xl text-zinc-400 font-medium text-lg leading-relaxed mb-10">
            ArsenalFit é o radar inteligente de ofertas fitness. <br className="hidden md:block" />
            Monitore preços reais e equipe seu treino com confiança.
          </p>

          {/* Redes Sociais */}
          <div className="flex gap-6 mb-10">
            <a 
              href="https://instagram.com" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="p-3 bg-zinc-900 rounded-full hover:bg-primary hover:text-white transition-all duration-300 hover:scale-110"
              aria-label="Instagram"
            >
              <Instagram className="w-6 h-6" />
            </a>
          </div>

          {/* Links Úteis Simplificados */}
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 mb-10 text-sm font-bold uppercase tracking-widest text-zinc-500">
            <a href="#" className="hover:text-primary transition-colors duration-200">Sobre Nós</a>
            <a href="#" className="hover:text-primary transition-colors duration-200">Parceiros Oficiais</a>
            <a href="#" className="hover:text-primary transition-colors duration-200">Aviso de Afiliado</a>
          </div>

          {/* Copyright */}
          <div className="pt-8 border-t border-white/5 w-full max-w-xs text-[10px] text-zinc-600 uppercase tracking-[0.3em]">
            © 2026 ArsenalFit // Todos os direitos reservados
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Layout;




