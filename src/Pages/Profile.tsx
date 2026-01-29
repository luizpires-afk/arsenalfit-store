import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Mail, Calendar, LogOut, Shield, Loader2, ShoppingBag, Settings } from 'lucide-react';
import { Button } from '@/Components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/Components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/Components/ui/tabs";
import { supabase } from '@/integrations/supabase/client';
import { Navbar } from '@/Components/Navbar';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth');
        return;
      }
      setUser(session.user);
      setLoading(false);
    };
    getUser();
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-[#a3e635]" />
        <p className="text-zinc-500 font-black italic tracking-widest text-[10px]">ACESSANDO ARSENAL...</p>
      </div>
    );
  }

  const createdAt = user?.created_at 
    ? new Date(user.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'N/A';

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Navbar />
      
      <div className="container py-12 px-4 max-w-4xl mx-auto">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="text-zinc-500 hover:text-[#a3e635] hover:bg-zinc-900 gap-2 font-black italic uppercase text-xs"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar ao Radar
          </Button>
          <Link
            to="/"
            className="text-xs font-black uppercase italic text-zinc-500 hover:text-[#a3e635] transition-colors"
          >
            Ir para Home
          </Link>
        </div>

        <h1 className="text-4xl font-black italic mb-8 uppercase text-[#a3e635] tracking-tighter">
          Minha <span className="text-white">Conta</span>
        </h1>

        <Tabs defaultValue="perfil" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-zinc-900 border border-zinc-800 rounded-2xl h-14 p-1">
            <TabsTrigger value="perfil" className="rounded-xl data-[state=active]:bg-[#a3e635] data-[state=active]:text-black font-bold">
              <User className="w-4 h-4 mr-2" /> Perfil
            </TabsTrigger>
            <TabsTrigger value="pedidos" className="rounded-xl data-[state=active]:bg-[#a3e635] data-[state=active]:text-black font-bold">
              <ShoppingBag className="w-4 h-4 mr-2" /> Pedidos
            </TabsTrigger>
            <TabsTrigger value="config" className="rounded-xl data-[state=active]:bg-[#a3e635] data-[state=active]:text-black font-bold">
              <Settings className="w-4 h-4 mr-2" /> Ajustes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="perfil" className="mt-6">
            <Card className="bg-zinc-900 border-zinc-800 rounded-3xl overflow-hidden shadow-2xl">
              <CardContent className="p-8 space-y-6">
                <div className="flex items-center gap-6 mb-4">
                   <div className="w-20 h-20 rounded-2xl bg-[#a3e635]/10 flex items-center justify-center border border-[#a3e635]/20">
                     <User className="h-10 w-10 text-[#a3e635]" />
                   </div>
                   <div>
                     <p className="text-white font-black italic text-xl uppercase tracking-tight">{user?.email?.split('@')[0]}</p>
                     <p className="text-zinc-500 text-sm font-bold">{user?.email}</p>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InfoItem icon={<Mail />} label="E-mail de Login" value={user?.email || ''} />
                  <InfoItem icon={<Calendar />} label="No Arsenal desde" value={createdAt} />
                  <InfoItem icon={<Shield />} label="Status da Conta" value="Membro Verificado" highlight />
                </div>

                <Button
                  onClick={handleSignOut}
                  className="w-full h-14 bg-zinc-800 hover:bg-red-600 text-white rounded-xl font-black italic transition-all group mt-6"
                >
                  <LogOut className="h-5 w-5 mr-2 group-hover:translate-x-1 transition-transform" />
                  ENCERRAR SESSÃO
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pedidos" className="mt-6 text-center py-20 bg-zinc-900/50 rounded-3xl border border-zinc-800 border-dashed">
            <ShoppingBag className="mx-auto h-12 w-12 text-zinc-700 mb-4" />
            <h3 className="text-zinc-400 font-bold uppercase tracking-widest">Nenhum pedido encontrado</h3>
            <p className="text-zinc-600 text-sm mt-2">Suas compras aparecerão aqui após a confirmação.</p>
          </TabsContent>
        </Tabs>

        <p className="text-center mt-12 text-zinc-800 font-black uppercase tracking-[0.5em] text-[10px]">
          ArsenalFit Protocol // Security Level 4
        </p>
      </div>
    </div>
  );
}

// Componente auxiliar para os itens de informação
function InfoItem({ icon, label, value, highlight = false }: { icon: any, label: string, value: string, highlight?: boolean }) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl bg-zinc-950/50 border border-zinc-800 group hover:border-[#a3e635]/20 transition-all">
      <div className={`text-zinc-500 group-hover:text-[#a3e635] transition-colors ${highlight ? 'text-[#a3e635]' : ''}`}>
        {icon}
      </div>
      <div>
        <p className="text-[9px] text-zinc-600 uppercase font-black tracking-widest">{label}</p>
        <p className={`font-bold ${highlight ? 'text-[#a3e635] italic uppercase text-xs' : 'text-zinc-300'}`}>{value}</p>
      </div>
    </div>
  );
}





