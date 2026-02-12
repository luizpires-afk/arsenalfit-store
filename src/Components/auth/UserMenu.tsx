import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, User, UserCircle, LayoutDashboard } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/Components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { getFirstName } from '@/utils';

const PROFILE_MENU_ITEMS = [
  {
    label: "Minha conta",
    href: "/perfil",
    icon: UserCircle,
    adminOnly: false,
  },
  {
    label: "Painel admin",
    href: "/admin",
    icon: LayoutDashboard,
    adminOnly: true,
  },
];

export const UserMenu = () => {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  const greeting = useMemo(() => {
    const firstName = getFirstName(user);
    return firstName ? `Olá, ${firstName}!` : 'Olá!';
  }, [user]);

  const handleLogout = async () => {
    await signOut();
    toast.success('Sessão encerrada!');
    navigate('/');
  };

  if (!user) {
    return (
      <Link to="/login">
        <Button className="bg-[#FF6A00] text-white font-black uppercase tracking-[0.18em] rounded-xl hover:scale-[1.03] transition-all gap-2 hover:bg-[#e85f00] shadow-md shadow-[#FF6A00]/20">
          <User size={18} /> Entrar
        </Button>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex items-center gap-2 rounded-full border border-zinc-200/70 bg-white px-2 py-1.5 shadow-sm text-zinc-800 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Abrir menu de perfil"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary">
            <User size={16} />
          </span>
          <div className="hidden sm:flex flex-col text-left">
            <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-400">Perfil</span>
            <span className="text-sm font-semibold text-zinc-900 truncate max-w-[160px]">
              {greeting}
            </span>
          </div>
          {isAdmin && (
            <span className="ml-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[9px] font-black tracking-widest text-primary">
              ADMIN
            </span>
          )}
          <ChevronDown size={14} className="text-zinc-400" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-56 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl"
      >
        <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-[0.28em] text-zinc-400 px-3 py-2">
          Minha conta
        </DropdownMenuLabel>

        {PROFILE_MENU_ITEMS.filter((item) => (item.adminOnly ? isAdmin : true)).map(
          (item) => {
            const Icon = item.icon;
            return (
              <DropdownMenuItem key={item.href} asChild className="rounded-xl">
                <Link to={item.href} className="flex items-center gap-3 p-3">
                  <Icon
                    size={18}
                    className={item.adminOnly ? "text-primary" : "text-zinc-500"}
                  />
                  <span className="text-xs font-semibold uppercase tracking-[0.2em]">
                    {item.label}
                  </span>
                </Link>
              </DropdownMenuItem>
            );
          }
        )}

        <DropdownMenuSeparator className="bg-zinc-200/70 my-2" />

        <DropdownMenuItem
          onClick={handleLogout}
          className="rounded-xl flex items-center gap-3 p-3 text-red-600 focus:bg-red-50"
        >
          <LogOut size={18} />
          <span className="text-xs font-semibold uppercase tracking-[0.2em]">Sair</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
