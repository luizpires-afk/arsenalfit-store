import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Tag, Bell } from 'lucide-react';

export const PriceAlertListener = () => {
  useEffect(() => {
    const channel = supabase
      .channel('price_alerts_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'price_alerts' },
        async (payload) => {
          const { data: product } = await supabase
            .from('products')
            .select('name')
            .eq('id', payload.new.product_id)
            .single();

          if (product) {
            // Função para marcar como lido
            const markAsRead = async () => {
              await supabase
                .from('price_alerts')
                .update({ read: true })
                .eq('id', payload.new.id);
            };

            toast.success(`OFERTA: ${product.name}`, {
              description: `Baixou para R$ ${payload.new.new_price}!`,
              icon: <Bell className="text-primary w-5 h-5" />, // Usando Bell corretamente
              duration: 8000,
              action: {
                label: "Entendi",
                onClick: () => markAsRead(),
              },
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return null;
};

