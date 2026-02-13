import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/Components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuthResendCooldown } from "@/hooks/useAuthResendCooldown";
import { safeErrorMessage, safeMessage } from "@/lib/humanText";
import logoImage from "../assets/arsenalfit-logo.png";

type Status = "loading" | "error" | "success";

const Verify = () => {
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("Validando seu link...");
  const [resending, setResending] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get("token") || "";
  const type = searchParams.get("type") || "signup";
  const email = searchParams.get("email") || "";
  const { cooldown, startCooldown } = useAuthResendCooldown("signup", email);

  useEffect(() => {
    document.title = "Verificar conta - ArsenalFit";

    let mounted = true;

    const consumeToken = async () => {
      if (!token || type !== "signup") {
        setStatus("error");
        setMessage("Link inválido ou expirado.");
        return;
      }

      try {
        const response = await fetch("/api/auth-consume-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, type: "signup" }),
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload?.error || "token_invalid");
        }

        const otp = payload?.otp;
        const otpType = payload?.otpType || "magiclink";
        const userEmail = payload?.email || "";

        const { error } = await supabase.auth.verifyOtp({
          email: userEmail,
          token: otp,
          type: otpType,
        });

        if (error) {
          throw error;
        }

        if (mounted) {
          setStatus("success");
          setMessage("Conta confirmada! Redirecionando...");
        }
        toast.success("Conta confirmada. Bem-vindo!");
        setTimeout(() => navigate("/"), 800);
      } catch {
        if (!mounted) return;
        setStatus("error");
        setMessage("Link inválido ou expirado.");
      }
    };

    consumeToken();

    return () => {
      mounted = false;
    };
  }, [token, type, navigate]);

  const handleResend = async () => {
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
      const response = await fetch("/api/auth-send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(safeMessage(payload?.message, "Erro ao reenviar."));
      }
      startCooldown(60);
      toast.success("Se existir conta, enviamos um novo link.");
    } catch (error: any) {
      toast.error(safeErrorMessage(error, "Erro ao reenviar."));
    } finally {
      setResending(false);
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
            Confirme sua conta para continuar.
          </p>
        </div>

        <div className="bg-card border-2 border-border/50 rounded-[36px] p-8 shadow-2xl text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            {status === "success" ? (
              <CheckCircle2 className="h-8 w-8 text-primary" />
            ) : status === "error" ? (
              <AlertTriangle className="h-8 w-8 text-orange-500" />
            ) : (
              <Mail className="h-8 w-8 text-primary" />
            )}
          </div>
          <h2 className="text-2xl font-black uppercase italic text-foreground">
            {status === "success"
              ? "Conta confirmada"
              : status === "error"
                ? "Link inválido"
                : "Confirmando sua conta"}
          </h2>
          <p className="text-muted-foreground text-sm mt-3">{message}</p>

          <div className="mt-8 flex flex-col gap-3">
            {status === "error" && email && (
              <Button
                type="button"
                onClick={handleResend}
                disabled={resending || cooldown > 0}
                variant="outline"
                className="w-full min-h-[44px] h-12 rounded-2xl font-black uppercase italic"
              >
                {resending
                  ? "Enviando..."
                  : cooldown > 0
                    ? `Reenviar em ${cooldown}s`
                    : "Enviar novo link de verificação"}
              </Button>
            )}
            <Link to="/login">
              <Button
                variant="outline"
                className="w-full min-h-[44px] h-12 rounded-2xl font-black uppercase italic"
              >
                Ir para Login
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Verify;
