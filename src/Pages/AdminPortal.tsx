import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Link as LinkIcon, Package, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/Components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/Components/ui/card';
import { Input } from "@/Components/ui/input";
import { Label } from "@/Components/ui/label";
import { supabase } from '@/integrations/supabase/client';
import { Navbar } from '@/Components/Navbar'; 
import { toast } from 'sonner';

export default function AdminPortal() {
  const navigate = useNavigate();
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate('/auth');
        return;
      }

      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (!data) {
        toast.error('Acesso negado. Você não tem permissão de administrador.');
        navigate('/');
        return;
      }

      setIsAdmin(true);
      setCheckingAuth(false);
    };

    checkAdmin();
  }, [navigate]);

  const extractMLBId = (url: string): string | null => {
    const regex = /MLB-?(\d+)/i;
    const match = url.match(regex);
    return match ? `MLB${match[1]}` : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!link.trim()) {
      toast.error('Cole um link válido do Mercado Livre');
      return;
    }

    const mlbId = extractMLBId(link);
    
    if (!mlbId) {
      toast.error('Link inválido. Use um link do Mercado Livre.');
      return;
    }

    setLoading(true);

    try {
      // Slug único baseado no ID e timestamp
      const slug = `produto-${mlbId.toLowerCase()}-${Date.now()}`;
      
      const { error } = await supabase
        .from('products')
        .insert({
          name: `Pendente: ${mlbId}`,
          slug,
          price: 0,
          original_price: 1, // Ativa a lógica de "oferta" para o robô atualizar
          affiliate_link: link,
          external_id: mlbId, // ESSENCIAL para o robô identificar o produto
          marketplace: 'mercadolivre',
          description: `Importado via Portal Admin - ID ${mlbId}`,
          short_description: 'Aguardando atualização do robô...',
          is_active: true, // Deixamos true para aparecer no Radar, mas com preço 0
          is_on_sale: true,
          category_id: '86927956-2586-455c-a567-28565f147a46' // ID da sua categoria padrão (Suplementos)
        });

      if (error) throw error;

      toast.success(
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-[#a3e635]" />
          <div>
            <p className="font-bold">Produto na fila!</p>
            <p className="text-sm opacity-80">O robô atualizará os dados em breve.</p>
          </div>
        </div>
      );

      setLink('');
    } catch (error: any) {
      console.error('Erro ao cadastrar:', error);
      toast.error('Erro ao cadastrar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-[#a3e635]" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-zinc-950">
      <Navbar />
      
      <div className="container py-12 px-4">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-6 text-zinc-500 hover:text-[#a3e635] hover:bg-zinc-900 gap-2 font-bold italic uppercase text-xs"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>

        <div className="max-w-xl mx-auto">
          <Card className="bg-zinc-900 border-zinc-800 shadow-2xl rounded-[40px] overflow-hidden border-t-4 border-t-[#a3e635]">
            <CardHeader className="text-center pt-10 pb-6">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-[#a3e635]/10 border border-[#a3e635]/20 flex items-center justify-center mb-4">
                <Package className="h-8 w-8 text-[#a3e635]" />
              </div>
              <CardTitle className="text-3xl font-black italic text-white uppercase tracking-tighter">
                Portal <span className="text-[#a3e635]">Admin</span>
              </CardTitle>
              <CardDescription className="text-zinc-500 font-medium">
                O robô buscará Nome, Imagem e Preço automaticamente.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-3">
                  <Label htmlFor="link" className="text-zinc-400 font-bold uppercase text-xs ml-1">
                    Link do Mercado Livre
                  </Label>
                  <div className="relative">
                    <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-600" />
                    <Input
                      id="link"
                      type="url"
                      placeholder="https://produto.mercadolivre.com.br/..."
                      value={link}
                      onChange={(e) => setLink(e.target.value)}
                      className="pl-12 h-16 bg-zinc-800 border-none text-white placeholder:text-zinc-600 rounded-2xl focus:ring-2 focus:ring-[#a3e635] transition-all"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-16 bg-white hover:bg-[#a3e635] text-black font-black italic text-xl rounded-2xl transition-all shadow-xl active:scale-95"
                >
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    "CADASTRAR AGORA"
                  )}
                </Button>
              </form>

              <div className="mt-8 p-6 rounded-3xl bg-zinc-950/50 border border-zinc-800">
                <h4 className="text-xs font-black text-[#a3e635] uppercase italic mb-3">Radar System v1.0</h4>
                <ul className="text-[11px] text-zinc-500 space-y-2 font-medium">
                  <li className="flex gap-2">- <span>O ID (MLB) é validado em tempo real.</span></li>
                  <li className="flex gap-2">- <span>O robô sincroniza os dados a cada ciclo.</span></li>
                  <li className="flex gap-2">- <span>Produtos com preço 0 ficam em "Stand-by".</span></li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}






