import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkUser = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  
  // Substitua pelo seu e-mail de administrador
  const adminEmail = "luizfop.31@gmail.com"; 

  if (!session || session.user.email !== adminEmail) {
    console.warn("Acesso negado: Usuário não é o administrador.");
    navigate('/auth');
  } else {
    setAuthenticated(true);
  }
  setLoading(false);
};

    checkUser();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  return authenticated ? <>{children}</> : null;
};


