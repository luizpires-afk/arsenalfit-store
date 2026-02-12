import { Link } from "react-router-dom";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/Components/ui/button";

export default function AuthConfirmed() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-card border-2 border-border/50 rounded-[36px] p-10 shadow-2xl text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-black uppercase italic text-foreground">Conta confirmada</h1>
        <p className="text-muted-foreground text-sm mt-3">
          Seu e-mail foi verificado. Agora você pode acessar todas as ofertas do ArsenalFit.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link to="/login">
            <Button className="w-full h-12 rounded-2xl font-black uppercase italic">Fazer Login</Button>
          </Link>
          <Link to="/melhores-ofertas">
            <Button variant="outline" className="w-full h-12 rounded-2xl font-black uppercase italic">
              Ir para Ofertas <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
