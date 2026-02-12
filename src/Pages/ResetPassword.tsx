import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/Components/ui/button";
import { Input } from "@/Components/ui/input";
import { toast } from "sonner";
import { Lock, Eye, EyeOff } from "lucide-react";
import logoImage from "../assets/arsenalfit-logo.png";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get("token") || "";
  const type = searchParams.get("type") || "recovery";

  useEffect(() => {
    document.title = "Redefinir senha - ArsenalFit";
  }, []);

  const handleReset = async (event: React.FormEvent) => {
    event.preventDefault();

    if (password.length < 8) {
      toast.error("Use pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("As senhas nao coincidem.");
      return;
    }
    if (!token || type !== "recovery") {
      toast.error("Link invalido ou expirado.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || "Link invalido ou expirado.");
      }

      const otp = payload?.otp;
      const otpType = payload?.otpType || "magiclink";
      const email = payload?.email || "";

      if (otp && email) {
        const { error } = await supabase.auth.verifyOtp({
          email,
          token: otp,
          type: otpType,
        });
        if (error) throw error;
      }

      toast.success("Senha atualizada. Bem-vindo de volta!");
      navigate("/");
    } catch (error: any) {
      toast.error(error.message || "Erro ao redefinir senha.");
    } finally {
      setLoading(false);
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
            Crie uma nova senha para entrar.
          </p>
        </div>

        <div className="bg-card border-2 border-border/50 rounded-[36px] p-8 shadow-2xl">
          <h2 className="text-2xl font-black uppercase italic text-foreground text-center">
            Nova senha
          </h2>
          <p className="text-muted-foreground text-sm mt-3 text-center">
            Use pelo menos 8 caracteres.
          </p>

          <form onSubmit={handleReset} className="space-y-4 mt-8">
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-600 z-20" />
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Nova senha"
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

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-600 z-20" />
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Confirmar nova senha"
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
              {loading ? "Atualizando..." : "Atualizar senha"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/login" className="text-xs font-black text-muted-foreground hover:text-primary uppercase tracking-widest">
              Voltar ao login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
