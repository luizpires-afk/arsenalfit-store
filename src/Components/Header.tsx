import { Link } from 'react-router-dom';
import { ShoppingCart, Dumbbell, Package, LayoutGrid, User, Home } from 'lucide-react';
import { Button } from '@/Components/ui/button';
import { Badge } from '@/Components/ui/badge';
import { useCart } from '@/hooks/useCart';
import { UserMenu } from '@/Components/auth/UserMenu';

export const Header = () => {
  const { cartCount } = useCart();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-20 items-center justify-between px-4">
        
        {/* LOGO - ESTILO ELITE */}
        <Link to="/" className="flex items-center gap-2 group shrink-0">
          <div className="bg-primary p-1.5 rounded-lg rotate-3 group-hover:rotate-0 transition-all duration-300 shadow-lg shadow-primary/20">
             <Dumbbell className="h-5 w-5 text-black" />
          </div>
          <span className="font-black text-2xl tracking-tighter uppercase italic hidden xs:block">
            <span className="text-zinc-900 dark:text-white">FIT</span>
            <span className="text-primary">STORE</span>
          </span>
        </Link>

        {/* NAVEGAÇÃO CENTRAL - FOCO EM CATEGORIAS E PRODUTOS */}
        <nav className="hidden lg:flex items-center gap-6 text-[10px] font-black uppercase tracking-[0.2em]">
          <Link to="/" className="flex items-center gap-2 text-zinc-500 hover:text-primary transition-all group">
            <Home className="h-3.5 w-3.5" />
            <span>Início</span>
          </Link>
          
          <Link to="/produtos" className="flex items-center gap-2 text-zinc-500 hover:text-primary transition-all">
            <Package className="h-3.5 w-3.5" />
            <span>Produtos</span>
          </Link>

          <Link to="/categorias" className="flex items-center gap-2 text-zinc-500 hover:text-primary transition-all">
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>Categorias</span>
          </Link>

          <Link to="/perfil" className="flex items-center gap-2 text-zinc-500 hover:text-primary transition-all border-l border-white/10 pl-6">
            <User className="h-3.5 w-3.5 text-primary" />
            <span className="text-primary">Meu Arsenal</span>
          </Link>
        </nav>

        {/* AÇÕES DA DIREITA */}
        <div className="flex items-center gap-2 sm:gap-4">
          
          {/* Carrinho com Contador */}
          <Link to="/carrinho" className="relative">
            <Button variant="ghost" size="icon" className="hover:bg-primary/10 hover:text-primary text-zinc-700 dark:text-zinc-300 transition-all rounded-xl">
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <Badge className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 text-[10px] flex items-center justify-center bg-primary text-black font-black border-2 border-background shadow-lg shadow-primary/20">
                  {cartCount}
                </Badge>
              )}
            </Button>
          </Link>

          {/* Separador sutil */}
          <div className="h-8 w-[1px] bg-zinc-200 dark:bg-zinc-800 mx-1 hidden xs:block" />

          {/* USER MENU (Lógica de Login/Perfil/Admin) */}
          <div className="scale-110">
            <UserMenu />
          </div>
          
        </div>
      </div>
    </header>
  );
};


