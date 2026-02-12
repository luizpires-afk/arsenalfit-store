import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ShoppingCart, User, Menu, X } from 'lucide-react';
import { Button } from '@/Components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { NotificationBell } from '@/Components/layout/NotificationBell';

export const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isAdminArea = location.pathname.startsWith('/admin');
  const brandText = isAdminArea ? 'ARSENAL ADMIN' : 'ARSENALFIT';
  const brandLetter = 'A';

  useEffect(() => {
    // Verificar sess?o inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // Escutar mudan?as na autentica??o
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-background/80 backdrop-blur-xl">
      <div className="container-fit h-20 flex items-center justify-between gap-4">
        {/* LOGO */}
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-10 h-10 bg-primary rounded-2xl flex items-center justify-center group-hover:rotate-12 transition-transform shadow-lg">
            <span className="text-black font-black text-xl">{brandLetter}</span>
          </div>
          <span className="text-2xl font-display font-black tracking-tight text-white uppercase">
            {brandText}
          </span>
        </Link>

        {/* NAVEGA??O DESKTOP */}
        <nav className="hidden md:flex items-center gap-8">
          <Link to="/" className="text-sm font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">Vitrine</Link>
          <Link to="/suplementos" className="text-sm font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">Suplementos</Link>
          <Link to="/admin" className="text-sm font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">Painel</Link>
        </nav>

        {/* A??ES (BUSCA, NOTIFICA??O, USER) */}
        <div className="flex items-center gap-2 md:gap-4">
          <NotificationBell />

          <Link to="/carrinho">
            <Button variant="ghost" size="icon" className="relative hover:bg-primary/10 rounded-full" aria-label="Abrir carrinho">
              <ShoppingCart className="w-6 h-6 text-foreground" />
            </Button>
          </Link>

          {user ? (
            <Button
              variant="outline"
              className="hidden md:flex items-center gap-2 border-primary/20 hover:bg-primary hover:text-black rounded-xl font-bold transition-all"
              onClick={() => navigate('/admin')}
            >
              <User size={18} />
              Minha Conta
            </Button>
          ) : (
            <Link to="/auth">
              <Button className="bg-primary text-black font-black px-6 rounded-xl hover:scale-105 transition-transform uppercase">
                Entrar
              </Button>
            </Link>
          )}

          {/* MENU MOBILE */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label={isMenuOpen ? 'Fechar menu' : 'Abrir menu'}
          >
            {isMenuOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      {/* MOBILE MENU OVERLAY */}
      {isMenuOpen && (
        <div className="md:hidden absolute top-20 left-0 w-full bg-background border-b border-white/5 p-6 animate-in slide-in-from-top duration-300">
          <nav className="flex flex-col gap-6">
            <Link to="/" onClick={() => setIsMenuOpen(false)} className="text-xl font-black uppercase">Vitrine</Link>
            <Link to="/suplementos" onClick={() => setIsMenuOpen(false)} className="text-xl font-black uppercase text-primary">Suplementos</Link>
            <Link to="/carrinho" onClick={() => setIsMenuOpen(false)} className="text-xl font-black uppercase">Meu Carrinho</Link>
            {!user && <Link to="/auth" onClick={() => setIsMenuOpen(false)} className="text-xl font-black uppercase text-primary">Fazer Login</Link>}
          </nav>
        </div>
      )}
    </header>
  );
};
