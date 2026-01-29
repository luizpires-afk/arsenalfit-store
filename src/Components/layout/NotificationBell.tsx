import React, { useState, useEffect } from 'react';
import { Bell, Tag, Trash2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "@/Components/ui/button";
import { toast } from 'sonner';

export const NotificationBell = () => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        fetchAlerts(data.user.id);
      }
    });

    const channel = supabase
      .channel('price_alerts_bell')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'price_alerts' },
        () => userId && fetchAlerts(userId)
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const fetchAlerts = async (uid: string) => {
    const { data } = await supabase
      .from('price_alerts')
      .select(`id, old_price, new_price, read, products (name)`)
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(5);

    if (data) {
      setAlerts(data);
      setUnreadCount(data.filter(a => !a.read).length);
    }
  };

  const markAllAsRead = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!userId) return;
    await supabase.from('price_alerts').update({ read: true }).eq('user_id', userId);
    fetchAlerts(userId);
    toast.success("Notificações lidas");
  };

  const clearHistory = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!userId) return;
    await supabase.from('price_alerts').delete().eq('user_id', userId);
    setAlerts([]);
    setUnreadCount(0);
    toast.info("Histórico limpo");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative hover:bg-white/10 rounded-full outline-none transition-all">
          <Bell className="w-6 h-6 text-white" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 bg-primary text-black text-[10px] font-black w-4 h-4 flex items-center justify-center rounded-full animate-pulse">
              {unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 bg-zinc-900 border-white/10 rounded-2xl shadow-2xl p-2 z-[60]">
        <div className="flex items-center justify-between p-3">
          <span className="font-display font-black text-sm text-white uppercase italic tracking-tighter">Alertas de Preço</span>
          {unreadCount > 0 && (
            <button onClick={markAllAsRead} className="text-[10px] font-black text-primary hover:text-white uppercase transition-colors">
              Ler tudo
            </button>
          )}
        </div>
        
        <DropdownMenuSeparator className="bg-white/5" />

        <div className="max-h-64 overflow-y-auto p-1">
          {alerts.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-xs italic">
              Nenhuma oferta recente.
            </div>
          ) : (
            alerts.map((alert) => (
              <div 
                key={alert.id} 
                className={`p-3 rounded-xl mb-1 flex flex-col gap-1 transition-all ${
                  !alert.read ? 'bg-primary/10 border-l-2 border-primary' : 'opacity-40'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Tag size={12} className="text-primary" />
                  <span className="font-bold text-xs text-white uppercase truncate">
                    {alert.products?.name}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Caiu para <span className="text-primary font-black">R$ {alert.new_price}</span>
                </p>
              </div>
            ))
          )}
        </div>

        {alerts.length > 0 && (
          <div className="p-2 border-t border-white/5 mt-2">
            <button 
              onClick={clearHistory}
              className="w-full flex items-center justify-center gap-2 py-2 text-zinc-500 text-[10px] font-bold hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all uppercase tracking-widest"
            >
              <Trash2 size={12} /> Limpar Histórico
            </button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};




