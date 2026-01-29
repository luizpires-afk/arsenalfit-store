import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, LayoutDashboard, ShieldCheck } from "lucide-react";
import { Button } from "@/Components/ui/button";
import { useToast } from "@/Components/ui/use-toast";

export const AdminHeader = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      toast({
        title: "Erro ao sair",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Sessão encerrada",
        description: "Até logo!",
      });
      navigate("/auth");
    }
  };

  return (
    <header className="bg-secondary/50 border-b border-border backdrop-blur-md">
      <div className="container-fit h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-primary w-5 h-5" />
            <span className="font-display font-black text-lg tracking-tighter">
              FIT<span className="text-primary">ADMIN</span>
            </span>
          </div>
          <div className="h-4 w-px bg-border hidden md:block" />
          <p className="text-xs text-muted-foreground hidden md:block">
            Ambiente de Gerenciamento Seguro
          </p>
        </div>

        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="text-xs font-bold gap-2 hover:text-primary"
          >
            <LayoutDashboard size={16} /> Ver Loja
          </Button>

          <Button
            variant="destructive"
            size="sm"
            onClick={handleLogout}
            className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white font-bold gap-2 rounded-xl transition-all"
          >
            Sair <LogOut size={16} />
          </Button>
        </div>
      </div>
    </header>
  );
};

