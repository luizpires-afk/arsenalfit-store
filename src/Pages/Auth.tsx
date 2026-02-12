import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { toast } from "sonner";
import { Mail, Lock, User, ArrowRight, ChevronLeft, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import logoImage from '../assets/arsenalfit-logo.png';

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
  const [resendLoading, setResendLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const isValidEmail = (value: string) => /\S+@\S+\.\S+/.test(value);
  const emailError = email.length > 0 && !isValidEmail(email);
  const passwordError = authMode === 'signup' && password.length > 0 && password.length < 8;

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

    if (emailError || passwordError) {
      return;
    }

    setLoading(true);

    try {
      setErrorMessage(null);
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            throw new Error("E-mail não vinculado ou senha incorreta.");
          }
          if (error.message.toLowerCase().includes("email") && error.message.toLowerCase().includes("confirm")) {
            throw new Error("Conta ainda não verificada. Enviamos um novo link se você desejar.");
          }
          throw error;
        }
        toast.success("Bem-vindo de volta! Acesso liberado.");
        navigate('/');

      } else if (authMode === 'signup') {
        const response = await fetch("/api/auth/send-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, fullName }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (payload?.error === "invalid_email") {
            throw new Error("Digite um e-mail válido.");
          }
          if (payload?.error === "weak_password") {
            throw new Error("Use pelo menos 8 caracteres.");
          }
          if (payload?.error === "rate_limited") {
            throw new Error("Muitas solicitações. Tente novamente em alguns minutos.");
          }
          throw new Error(payload?.message || "Erro ao enviar verificação.");
        }
        toast.success("Cadastro realizado! Verifique seu e-mail.");
        navigate(`/auth/sent?mode=signup&email=${encodeURIComponent(email)}`);

      } else if (authMode === 'reset') {
        const response = await fetch("/api/auth/send-recovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (payload?.error === "invalid_email") {
            throw new Error("Digite um e-mail válido.");
          }
          if (payload?.error === "rate_limited") {
            throw new Error("Muitas solicitações. Tente novamente em alguns minutos.");
          }
          throw new Error(payload?.message || "Erro ao enviar link.");
        }
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

  const handleResendRecovery = async () => {
    if (!isValidEmail(email)) {
      toast.error("Digite um e-mail válido.");
      return;
    }
    setResendLoading(true);
    try {
      const response = await fetch("/api/auth/send-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || "Erro ao reenviar.");
      }
      toast.success("Se existir conta, enviamos um novo e-mail.");
    } catch (error: any) {
      toast.error(error.message || "Erro ao reenviar.");
    } finally {
      setResendLoading(false);
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 overflow-hidden relative">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="w-full max-w-md z-10">
        <div className="flex flex-col items-center text-center mb-8 pt-6">
          <div className="flex justify-center -mb-5">
            <img
              src={logoImage}
              alt="ArsenalFit"
              className="h-24 w-24 sm:h-28 sm:w-28 md:h-32 md:w-32 object-contain drop-shadow-lg"
            />
          </div>
          <h1 className="text-5xl md:text-6xl font-black uppercase italic tracking-tighter text-zinc-900 dark:text-white mt-0 leading-none">
            ARSENAL<span className="text-primary">FIT</span>
          </h1>
          <p className="text-muted-foreground font-bold uppercase text-[11px] sm:text-[13px] tracking-[0.12em] mt-1.5 px-4">
            {authMode === 'login'
              ? 'Acesse sua conta de atleta'
              : 'Curadoria premium com os menores preços do mercado.'}
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
                  placeholder="Digite seu nome completo" 
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
                placeholder="Digite seu e-mail" 
                className={`pl-12 h-14 bg-zinc-100 dark:bg-zinc-800 border-none rounded-2xl text-black dark:text-white font-black placeholder:text-zinc-500 placeholder:font-normal focus-visible:ring-2 ring-primary transition-all shadow-inner ${
                  emailError ? 'ring-2 ring-orange-200' : ''
                }`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={emailError}
                aria-describedby={emailError ? 'auth-email-error' : undefined}
                required
              />
              {emailError && (
                <p id="auth-email-error" className="mt-2 text-[10px] font-semibold text-orange-500">
                  Digite um e-mail válido
                </p>
              )}
            </div>

            {authMode !== 'reset' && (
              <div className="space-y-2">
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-600 z-20" />
                  <Input 
                    type={showPassword ? "text" : "password"}
                    placeholder="Digite sua senha" 
                    className={`pl-12 pr-12 h-14 bg-zinc-100 dark:bg-zinc-800 border-none rounded-2xl text-black dark:text-white font-black placeholder:text-zinc-500 placeholder:font-normal focus-visible:ring-2 ring-primary transition-all shadow-inner ${
                      passwordError ? 'ring-2 ring-orange-200' : ''
                    }`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={passwordError}
                    aria-describedby={passwordError ? 'auth-password-error' : undefined}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-primary transition-colors z-20"
                  >
                    {showPassword ? <Eye size={20} /> : <EyeOff size={20} />}
                  </button>
                </div>
                {passwordError && (
                  <p id="auth-password-error" className="text-[10px] font-semibold text-orange-500">
                    Use pelo menos 8 caracteres
                  </p>
                )}

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
                  {authMode === 'login' ? 'Entrar' : authMode === 'signup' ? 'COMEÇAR AGORA' : 'Enviar Link'} 
                  <ArrowRight size={20} />
                </span>
              )}
            </Button>
            {authMode === 'reset' && (
              <button
                type="button"
                onClick={handleResendRecovery}
                disabled={resendLoading}
                className="w-full text-[10px] font-black uppercase tracking-widest text-primary hover:text-black dark:hover:text-white transition-colors mt-2 disabled:opacity-60"
              >
                {resendLoading ? 'Enviando...' : 'Reenviar recuperação'}
              </button>
            )}
            {authMode === 'signup' && (
              <>
                <p className="mt-3 text-center text-[11px] text-muted-foreground">
                  Ao criar uma conta, você concorda com nossos Termos e Política de Privacidade
                </p>
                <p className="mt-3 flex items-center justify-center gap-2 text-[10px] text-muted-foreground font-bold uppercase tracking-[0.2em]">
                  <ShieldCheck size={14} className="text-primary" />
                  Seus dados estão protegidos e nunca serão compartilhados
                </p>
              </>
            )}
          </form>

          <div className="mt-8 text-center border-t border-zinc-200 dark:border-zinc-800 pt-6">
            <button 
              onClick={() => setAuthMode(authMode === 'signup' ? 'login' : 'signup')} 
              className="text-xs font-black text-muted-foreground hover:text-primary uppercase tracking-widest transition-colors"
            >
              {authMode === 'signup' ? 'JÁ FAZ PARTE DO TIME? ENTRAR' : 'NOVO POR AQUI? CRIAR CONTA'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
