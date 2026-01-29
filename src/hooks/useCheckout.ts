import { useState } from "react"; // Importação necessária
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/hooks/useCart";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export const useCheckout = () => {
  const { cartItems, cartTotal, clearCart } = useCart();
  const [isProcessing, setIsProcessing] = useState(false); // Definição do estado
  const navigate = useNavigate();

  const processCheckout = async () => {
    setIsProcessing(true); // Inicia o loading
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        toast.error("Você precisa estar logado.");
        navigate("/auth");
        return;
      }

      // 1. Criar o Pedido
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: user.id,
          total_amount: cartTotal,
          payment_method: 'digital_access',
          status: 'completed'
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // 2. Preparar Assets (Acessos)
      const athleteAssets = cartItems.map(item => ({
        user_id: user.id,
        order_id: order.id,
        product_name: (item.products as any)?.name || 'Produto Digital',
        category: 'Treino/Elite',
        download_url: (item.products as any)?.affiliate_link || '#'
      }));

      // 3. Inserir Acessos
      const { error: assetsError } = await supabase.from('athlete_assets').insert(athleteAssets);
      if (assetsError) throw assetsError;

      toast.success("ACESSO LIBERADO COM SUCESSO!");
      clearCart();
      navigate('/perfil'); // Redireciona para onde o atleta verá os links

    } catch (error: any) {
      console.error(error);
      toast.error("Falha no processamento: " + error.message);
    } finally {
      setIsProcessing(false); // Finaliza o loading independente de erro ou sucesso
    }
  };

  // RETORNO: Agora o componente Cart vai encontrar o isProcessing
  return { processCheckout, isProcessing }; 
};


