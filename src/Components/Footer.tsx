import { Facebook, Instagram, Twitter } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-secondary/30 border-t border-border mt-auto">
      <div className="container-tight py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-4">
            <h3 className="text-lg font-bold">ArsenalFit</h3>
            <p className="text-sm text-muted-foreground">
              Tecnologia de monitoramento de preços para quem leva o treino a sério.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Loja</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="/categorias" className="hover:text-primary">Categorias</a></li>
              <li><a href="/lancamentos" className="hover:text-primary">Lançamentos</a></li>
              <li><a href="/ofertas" className="hover:text-primary">Ofertas</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Ajuda</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="/faq" className="hover:text-primary">FAQ</a></li>
              <li><a href="/entrega" className="hover:text-primary">Política de Entrega</a></li>
              <li><a href="/privacidade" className="hover:text-primary">Privacidade</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Social</h4>
            <div className="flex space-x-4">
              <a href="#" className="text-muted-foreground hover:text-primary"><Instagram className="h-5 w-5"/></a>
              <a href="#" className="text-muted-foreground hover:text-primary"><Facebook className="h-5 w-5"/></a>
              <a href="#" className="text-muted-foreground hover:text-primary"><Twitter className="h-5 w-5"/></a>
            </div>
          </div>
        </div>
        <div className="border-t border-border mt-8 pt-8 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} ArsenalFit. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
}
