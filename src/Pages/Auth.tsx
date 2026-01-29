import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { toast } from "sonner";
import { Dumbbell, Mail, Lock, User, ArrowRight, ChevronLeft, Eye, EyeOff } from 'lucide-react';

type AuthMode = 'login' | 'signup' | 'reset';

type AuthProps = {
  initialMode?: AuthMode;
};

const Auth = ({ initialMode = 'login' }: AuthProps) => {
  const [authMode, setAuthMode] = useState<AuthMode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const mode = new URLSearchParams(location.search).get('mode');
    if (mode === 'login' || mode === 'signup' || mode === 'reset') {
      setAuthMode(mode);
    }
  }, [location.search]);

  useEffect(() => {
    setErrorMessage(null);
  }, [authMode, email, password, fullName]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      setErrorMessage(null);
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            throw new Error("E-mail não vinculado ou senha incorreta.");
          }
          throw error;
        }
        toast.success("Bem-vindo de volta! Acesso liberado.");
        navigate('/ofertas');

      } else if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: { 
            data: { full_name: fullName },
            emailRedirectTo: `${window.location.origin}/auth/confirm`
          }
        });
        if (error) {
          if (error.message.includes("User already registered")) {
            throw new Error("Este e-mail já está sendo usado.");
          }
          throw error;
        }
        if (data.user) {
          toast.success("Cadastro realizado! Verifique seu e-mail.");
          navigate(`/auth/sent?mode=signup&email=${encodeURIComponent(email)}`);
        }

      } else if (authMode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/update-password`,
        });
        if (error) throw error;
        toast.info("Link enviado! Confira sua caixa de entrada.");
        navigate(`/auth/sent?mode=reset&email=${encodeURIComponent(email)}`);
      }
    } catch (error: any) {
      setErrorMessage(error.message || "Ocorreu um erro inesperado.");
      toast.error(error.message || "Ocorreu um erro inesperado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 overflow-hidden relative">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="w-full max-w-md z-10">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <div className="bg-primary p-3 rounded-2xl rotate-3 shadow-lg shadow-primary/20">
              <Dumbbell className="h-8 w-8 text-black" />
            </div>
          </div>
          <h1 className="text-5xl md:text-6xl font-black uppercase italic tracking-tighter text-zinc-900 dark:text-white">
            ARSENAL<span className="text-primary">FIT</span>
          </h1>
          <p className="text-muted-foreground font-bold uppercase text-[10px] tracking-[0.2em] mt-3">
            {authMode === 'login' && 'Acesse sua conta de atleta'}
            {authMode === 'signup' && 'Junte-se ao time de elite'}
            {authMode === 'reset' && 'Recupere seu acesso'}
          </p>
        </div>

        <div className="bg-card border-2 border-border/50 p-8 rounded-[40px] shadow-2xl">
          {authMode === 'reset' && (
            <button onClick={() => setAuthMode('login')} className="flex items-center gap-2 text-zinc-500 hover:text-primary mb-6 font-bold uppercase text-[10px] tracking-widest transition-colors">
              <ChevronLeft size={14} /> Voltar
            </button>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            {errorMessage && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-xs font-bold uppercase tracking-widest">
                {errorMessage}
              </div>
            )}

            {authMode === 'signup' && (
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-600 z-20" />
                <Input 
                  placeholder="Nome Completo" 
                  className="pl-12 h-14 bg-zinc-100 dark:bg-zinc-800 border-none rounded-2xl text-black dark:text-white font-black placeholder:text-zinc-500 placeholder:font-normal focus-visible:ring-2 ring-primary transition-all shadow-inner"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-600 z-20" />
              <Input 
                type="email"
                placeholder="E-mail" 
                className="pl-12 h-14 bg-zinc-100 dark:bg-zinc-800 border-none rounded-2xl text-black dark:text-white font-black placeholder:text-zinc-500 placeholder:font-normal focus-visible:ring-2 ring-primary transition-all shadow-inner"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {authMode !== 'reset' && (
              <div className="space-y-2">
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-600 z-20" />
                  <Input 
                    type={showPassword ? "text" : "password"}
                    placeholder="Senha" 
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

                {authMode === 'login' && (
                  <div className="flex justify-end px-1">
                    <button 
                      type="button" 
                      onClick={() => setAuthMode('reset')}
                      className="text-[10px] font-black uppercase text-primary hover:text-black dark:hover:text-white transition-colors tracking-widest italic"
                    >
                      Esqueceu a senha?
                    </button>
                  </div>
                )}
              </div>
            )}

            <Button disabled={loading} className="w-full h-14 rounded-2xl font-black uppercase italic text-lg bg-primary text-black hover:bg-primary/90 mt-2 transition-all shadow-lg shadow-primary/20 active:scale-[0.98]">
              {loading ? 'Processando...' : (
                <span className="flex items-center gap-2">
                  {authMode === 'login' ? 'Entrar' : authMode === 'signup' ? 'Cadastrar' : 'Enviar Link'} 
                  <ArrowRight size={20} />
                </span>
              )}
            </Button>
          </form>

          <div className="mt-8 text-center border-t border-zinc-200 dark:border-zinc-800 pt-6">
            <button 
              onClick={() => setAuthMode(authMode === 'signup' ? 'login' : 'signup')} 
              className="text-xs font-black text-muted-foreground hover:text-primary uppercase tracking-widest transition-colors"
            >
              {authMode === 'signup' ? 'Já é do time? Login' : 'Novo por aqui? Criar conta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
