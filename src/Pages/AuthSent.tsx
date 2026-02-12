import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { CheckCircle2, Mail, ArrowLeft } from "lucide-react";
import { Button } from "@/Components/ui/button";
import { toast } from "sonner";

export default function AuthSent() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const mode = params.get("mode") || "signup";
  const email = params.get("email") || "";

  const isReset = mode === "reset";
  const [resending, setResending] = useState(false);

  const handleResend = async () => {
    if (!email) {
      toast.error("Digite um e-mail válido.");
      return;
    }
    setResending(true);
    try {
      const endpoint = isReset ? "/api/auth/send-recovery" : "/api/auth/send-verification";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || "Erro ao reenviar.");
      }
      toast.success("Se existir conta, enviamos um novo e-mail.");
    } catch (error) {
      toast.error(error.message || "Erro ao reenviar.");
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
            disabled={resending}
            variant="outline"
            className="w-full h-12 rounded-2xl font-black uppercase italic"
          >
            {resending ? "Reenviando..." : "Reenviar e-mail"}
          </Button>
          <Link to="/login">
            <Button className="w-full h-12 rounded-2xl font-black uppercase italic">Ir para Login</Button>
          </Link>
          <Link to="/">
            <Button variant="outline" className="w-full h-12 rounded-2xl font-black uppercase italic">
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao site
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
