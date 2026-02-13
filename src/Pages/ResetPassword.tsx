import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/Components/ui/button";
import { Input } from "@/Components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuthResendCooldown } from "@/hooks/useAuthResendCooldown";
import { safeErrorMessage, safeMessage } from "@/lib/humanText";
import logoImage from "../assets/arsenalfit-logo.png";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get("token") || "";
  const type = searchParams.get("type") || "recovery";
  const email = searchParams.get("email") || "";
  const isLinkStructValid = Boolean(token) && type === "recovery";
  const [linkInvalid, setLinkInvalid] = useState(!isLinkStructValid);

  const { cooldown, startCooldown } = useAuthResendCooldown("recovery", email);
  const passwordHasMinLength = password.length >= 8;
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  useEffect(() => {
    document.title = "Redefinir senha - ArsenalFit";
    setLinkInvalid(!isLinkStructValid);
  }, [isLinkStructValid]);

  const handleResendRecovery = async () => {
    if (!email) {
      toast.error("E-mail não encontrado no link.");
      return;
    }
    if (cooldown > 0) {
      toast.error(`Aguarde ${cooldown}s para reenviar.`);
      return;
    }

    setResending(true);
    try {
      const response = await fetch("/api/auth-send-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(safeMessage(payload?.message, "Erro ao reenviar."));
      }
      startCooldown(60);
      toast.success("Se existir conta, enviamos um novo link de recuperação.");
    } catch (error: any) {
      toast.error(safeErrorMessage(error, "Erro ao reenviar."));
    } finally {
      setResending(false);
    }
  };

  const handleReset = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!isLinkStructValid || linkInvalid) {
      toast.error("Link inválido ou expirado.");
      setLinkInvalid(true);
      return;
    }
    if (!passwordHasMinLength) {
      toast.error("Use pelo menos 8 caracteres.");
      return;
    }
    if (!passwordsMatch) {
      toast.error("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth-reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload?.error === "token_invalid_or_expired") {
          setLinkInvalid(true);
          throw new Error("Link inválido ou expirado.");
        }
        throw new Error(safeMessage(payload?.message, "Não foi possível redefinir a senha."));
      }

      const otp = payload?.otp;
      const otpType = payload?.otpType || "magiclink";
      const userEmail = payload?.email || "";

      if (otp && userEmail) {
        const { error } = await supabase.auth.verifyOtp({
          email: userEmail,
          token: otp,
          type: otpType,
        });
        if (error) throw error;
      }

      toast.success("Senha atualizada com sucesso.");
      navigate("/");
    } catch (error: any) {
      toast.error(safeErrorMessage(error, "Erro ao redefinir senha."));
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
            Digite e confirme sua nova senha.
          </p>

          {linkInvalid && (
            <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-4 text-orange-700">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4" />
                Link inválido ou expirado
              </div>
              <p className="mt-2 text-xs">
                Solicite um novo e-mail para redefinir sua senha com segurança.
              </p>
              {email && (
                <div className="mt-3 flex items-center gap-1 text-xs font-semibold">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 break-all">{email}</span>
                </div>
              )}
            </div>
          )}

          {!linkInvalid && (
            <form onSubmit={handleReset} className="space-y-4 mt-8">
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-600 z-20" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Nova senha"
                  className="pl-12 pr-12 h-14 bg-zinc-100 dark:bg-zinc-800 border-none rounded-2xl text-black dark:text-white font-black placeholder:text-zinc-500 placeholder:font-normal focus-visible:ring-2 ring-primary transition-all shadow-inner"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby="password-rules"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-primary transition-colors z-20"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
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

              <div
                id="password-rules"
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs text-zinc-600"
              >
                <p className={passwordHasMinLength ? "text-emerald-600 font-semibold" : ""}>
                  Mínimo de 8 caracteres
                </p>
                <p className={passwordsMatch ? "text-emerald-600 font-semibold" : ""}>
                  Confirmação deve ser igual à senha
                </p>
              </div>

              <Button
                disabled={loading || !passwordHasMinLength || !passwordsMatch}
                className="w-full h-14 rounded-2xl font-black uppercase italic text-lg bg-primary text-black hover:bg-primary/90 mt-2 transition-all shadow-lg shadow-primary/20 active:scale-[0.98]"
              >
                {loading ? "Atualizando..." : "Atualizar senha"}
              </Button>
            </form>
          )}

          <div className="mt-6 flex flex-col gap-3">
            {email && (
              <Button
                type="button"
                onClick={handleResendRecovery}
                disabled={resending || cooldown > 0}
                variant="outline"
                className="w-full min-h-[44px] h-12 rounded-2xl font-black uppercase italic"
              >
                {resending
                  ? "Enviando..."
                    : cooldown > 0
                      ? `Reenviar em ${cooldown}s`
                    : "Enviar novo link de recuperação"}
              </Button>
            )}
            <div className="text-center">
              <Link
                to="/login"
                className="text-xs font-black text-muted-foreground hover:text-primary uppercase tracking-widest"
              >
                Voltar ao login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
