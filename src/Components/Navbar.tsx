import { Link } from "react-router-dom";
import { Menu, X, LogOut } from "lucide-react";
import { useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/Components/ui/button";

const LOGO_URL = "https://pixqurduxqfcujfadkbw.supabase.co/storage/v1/object/public/assets/Logo_LetraA_Transparente.png";

export function Navbar() {
  const { user, signOut, isAdmin } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const displayName =
    user?.user_metadata?.full_name?.split(" ")[0] ||
    user?.email?.split("@")[0] ||
    "Atleta";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <a href="#main-content" className="skip-link">Pular para conteúdo</a>
      <div className="container flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 font-bold text-xl md:text-2xl tracking-tighter hover:opacity-90 transition-opacity">
          <img
            src={LOGO_URL}
            alt="ArsenalFit"
            className="h-9 w-9 rounded-lg bg-white p-1 shadow-sm"
            loading="lazy"
          />
          <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent uppercase">
            Arsenal<span className="text-primary">Fit</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link to="/categorias" className="text-foreground/60 transition-colors hover:text-foreground">Categorias</Link>
          <Link to="/produtos" className="text-foreground/60 transition-colors hover:text-foreground">Produtos</Link>
          {isAdmin && (
            <Link to="/admin" className="text-primary font-bold transition-colors hover:text-primary/80">
              Painel Admin
            </Link>
          )}
        </nav>

        {/* Actions */}
        <div className="hidden md:flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-4">
              <Link to="/perfil" className="text-sm font-medium hover:underline">
                Olá, {displayName}
              </Link>
              <Button variant="ghost" size="icon" onClick={() => signOut()}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login">
                <Button variant="ghost">Entrar</Button>
              </Link>
              <Link to="/cadastro">
                <Button className="btn-energy text-white">Criar Conta</Button>
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
          {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile Nav */}
      {isMenuOpen && (
        <div className="md:hidden border-t p-4 bg-background">
          <div className="flex flex-col space-y-4">
            <Link to="/categorias" onClick={() => setIsMenuOpen(false)}>Categorias</Link>
            <Link to="/produtos" onClick={() => setIsMenuOpen(false)}>Produtos</Link>
            {user ? (
              <>
                <Link to="/perfil" onClick={() => setIsMenuOpen(false)}>Minha Conta</Link>
                <button onClick={() => { signOut(); setIsMenuOpen(false); }} className="text-left text-red-500">Sair</button>
              </>
            ) : (
              <Link to="/login" onClick={() => setIsMenuOpen(false)} className="font-bold text-primary">Entrar / Cadastrar</Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}


