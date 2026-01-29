import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Link, useNavigate } from 'react-router-dom';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { 
  User, 
  LogOut, 
  LayoutDashboard, 
  UserCircle, 
  ChevronDown 
} from 'lucide-react';

// OK. CORREÇÃO APLICADA: Voltando dois níveis para encontrar a pasta Components
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"; 

// OK. CORREÇÃO APLICADA AQUI TAMBÉM
import { Button } from "@/Components/ui/button";
import { toast } from "sonner";

export const UserMenu = () => {
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();

  // Função auxiliar para verificar admin
  const checkIsAdmin = (email: string | undefined) => {
    return email === 'luizfop.31@gmail.com';
  };

  useEffect(() => {
    // 1. Busca usuário inicial
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setIsAdmin(checkIsAdmin(user?.email));
    };

    getUser();

    // 2. Escuta mudanças na autenticação (Login/Logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        setIsAdmin(checkIsAdmin(currentUser?.email));
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada!");
    navigate('/');
  };

  // Estado: Não Logado
  if (!user) {
    return (
      <Link to="/login">
        <Button className="bg-[#a3e635] text-black font-black uppercase italic rounded-xl hover:scale-105 transition-all gap-2 hover:bg-[#8cc629]">
          <User size={18} /> Entrar
        </Button>
      </Link>
    );
  }

  // Estado: Logado
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 bg-zinc-900/50 hover:bg-zinc-800 p-1.5 pr-4 rounded-2xl border border-white/5 transition-all outline-none group focus:ring-2 focus:ring-[#a3e635]/50">
          <div className="bg-[#a3e635] p-2 rounded-xl group-hover:rotate-6 transition-transform">
            <User size={18} className="text-black" />
          </div>
          <div className="text-left hidden sm:block">
            <p className="text-[10px] font-black uppercase text-[#a3e635] leading-none italic tracking-wider">
              {isAdmin ? 'Admin' : 'Membro'}
            </p>
            <p className="text-xs font-bold text-white truncate max-w-[100px]">
              {user.user_metadata?.full_name?.split(' ')[0] || 'Perfil'}
            </p>
          </div>
          <ChevronDown size={14} className="text-zinc-500 group-hover:text-[#a3e635] transition-colors ml-1" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56 bg-zinc-950 border border-zinc-800 rounded-3xl p-2 shadow-xl shadow-black/50 mt-2 overflow-hidden">
        <DropdownMenuLabel className="text-[10px] font-black uppercase italic text-zinc-500 px-3 py-2 tracking-widest">
          Minha Conta
        </DropdownMenuLabel>
        
        {/* Link para Perfil */}
        <DropdownMenuItem disabled className="flex items-center gap-3 p-3 rounded-2xl opacity-50 cursor-not-allowed">
           <UserCircle size={20} className="text-zinc-400" />
           <span className="font-bold uppercase text-xs text-zinc-400">Meu Perfil (Em breve)</span>
        </DropdownMenuItem>

        {isAdmin && (
          <Link to="/admin">
            <DropdownMenuItem className="flex items-center gap-3 p-3 rounded-2xl cursor-pointer hover:bg-zinc-900 focus:bg-[#a3e635] focus:text-black transition-all group">
              <LayoutDashboard size={20} className="text-[#a3e635] group-focus:text-black" />
              <span className="font-black uppercase italic text-xs">Painel Admin</span>
            </DropdownMenuItem>
          </Link>
        )}

        <DropdownMenuSeparator className="bg-white/10 my-1" />

        <DropdownMenuItem 
          onClick={handleLogout}
          className="flex items-center gap-3 p-3 rounded-2xl cursor-pointer hover:bg-red-500/10 focus:bg-red-600 focus:text-white transition-all group text-red-500"
        >
          <LogOut size={20} />
          <span className="font-black uppercase italic text-xs">Sair da Conta</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};






