import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/Components/ui/button";
import { useAuthResendCooldown } from "@/hooks/useAuthResendCooldown";
import { startAuthResendCooldown } from "@/lib/authResendCooldown";
import { safeErrorMessage, safeMessage } from "@/lib/humanText";

const COOLDOWN_SECONDS = 60;

export default function AuthSent() {
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const mode = params.get("mode") === "reset" ? "reset" : "signup";
  const email = params.get("email") || "";
  const sentAtRaw = Number(params.get("sentAt") || 0);
  const isReset = mode === "reset";
  const resendKind = isReset ? "recovery" : "signup";
  const endpoint = isReset ? "/api/auth-send-recovery" : "/api/auth-send-verification";

  const [resending, setResending] = useState(false);
  const { cooldown, startCooldown, syncCooldown } = useAuthResendCooldown(
    resendKind,
    email,
  );

  useEffect(() => {
    if (!email) return;
    if (!Number.isFinite(sentAtRaw) || sentAtRaw <= 0) return;
    const elapsed = Math.floor((Date.now() - sentAtRaw) / 1000);
    const remaining = COOLDOWN_SECONDS - elapsed;
    if (remaining > 0) {
      startAuthResendCooldown(resendKind, email, remaining);
      syncCooldown();
    }
  }, [email, resendKind, sentAtRaw, syncCooldown]);

  const handleResend = async () => {
    if (!email) {
      toast.error("Digite um e-mail válido.");
      return;
    }
    if (cooldown > 0) {
      toast.error(`Aguarde ${cooldown}s para reenviar.`);
      return;
    }

    setResending(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(safeMessage(payload?.message, "Erro ao reenviar."));
      }
      startCooldown(COOLDOWN_SECONDS);
      toast.success("Se existir conta, enviamos um novo e-mail.");
    } catch (error: any) {
      toast.error(safeErrorMessage(error, "Erro ao reenviar."));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-card border-2 border-border/50 rounded-[36px] p-10 shadow-2xl text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-black uppercase italic text-foreground">
          {isReset ? "Link enviado" : "Verificação enviada"}
        </h1>
        <p className="text-muted-foreground text-sm mt-3">
          {isReset
            ? "Enviamos um link para redefinir sua senha."
            : "Enviamos um link para confirmar sua conta."}
        </p>
        {email && (
          <div className="mt-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
            <Mail className="h-4 w-4" /> {email}
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3">
          <Button
            onClick={handleResend}
            disabled={!email || resending || cooldown > 0}
            variant="outline"
            className="w-full min-h-[44px] h-12 rounded-2xl font-black uppercase italic"
          >
            {resending
              ? "Enviando..."
              : cooldown > 0
                ? `Enviar novo link em ${cooldown}s`
                : isReset
                  ? "Enviar novo link de recuperação"
                  : "Enviar novo link de verificação"}
          </Button>
          <Link to="/login">
            <Button className="w-full min-h-[44px] h-12 rounded-2xl font-black uppercase italic">
              Ir para Login
            </Button>
          </Link>
          <Link to="/">
            <Button
              variant="outline"
              className="w-full min-h-[44px] h-12 rounded-2xl font-black uppercase italic"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao site
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
