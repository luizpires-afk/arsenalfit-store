import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { toast } from "sonner";
import { Lock, ArrowRight, Dumbbell, Eye, EyeOff } from 'lucide-react';

const UpdatePassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem!");
      return;
    }

    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(false);
    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) throw error;

      toast.success("Senha atualizada com sucesso! Acessando...");
      
      // Redireciona para a home após 2 segundos
      setTimeout(() => {
        navigate('/');
      }, 2000);

    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 overflow-hidden relative">
      {/* Glow Effect */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="w-full max-w-md z-10">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <div className="bg-primary p-3 rounded-2xl rotate-3 shadow-lg shadow-primary/20">
              <Dumbbell className="h-8 w-8 text-black" />
            </div>
          </div>
          <h1 className="text-4xl font-black uppercase italic tracking-tighter text-zinc-900 dark:text-white">
            NOVA <span className="text-primary">SENHA</span>
          </h1>
          <p className="text-muted-foreground font-bold uppercase text-[10px] tracking-[0.2em] mt-3">
            Crie uma credencial de acesso forte
          </p>
        </div>

        <div className="bg-card border-2 border-border/50 p-8 rounded-[40px] shadow-2xl">
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            
            {/* Campo Nova Senha */}
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-600 z-20" />
              <Input 
                type={showPassword ? "text" : "password"}
                placeholder="Nova Senha" 
                className="pl-12 pr-12 h-14 bg-zinc-100 dark:bg-zinc-800 border-none rounded-2xl text-black dark:text-white font-black placeholder:text-zinc-500 placeholder:font-normal focus-visible:ring-2 ring-primary transition-all shadow-inner"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-primary transition-colors z-20"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            {/* Confirmar Nova Senha */}
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-600 z-20" />
              <Input 
                type={showPassword ? "text" : "password"}
                placeholder="Confirmar Nova Senha" 
                className="pl-12 h-14 bg-zinc-100 dark:bg-zinc-800 border-none rounded-2xl text-black dark:text-white font-black placeholder:text-zinc-500 placeholder:font-normal focus-visible:ring-2 ring-primary transition-all shadow-inner"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <Button 
              disabled={loading} 
              className="w-full h-14 rounded-2xl font-black uppercase italic text-lg bg-primary text-black hover:bg-primary/90 mt-2 transition-all shadow-lg shadow-primary/20 active:scale-[0.98]"
            >
              {loading ? 'Salvando...' : (
                <span className="flex items-center gap-2">
                  Atualizar Senha <ArrowRight size={20} />
                </span>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UpdatePassword;




