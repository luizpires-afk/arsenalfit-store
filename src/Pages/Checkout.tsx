import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '@/hooks/useCart'; 
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Loader2, CreditCard, Truck, ShieldCheck, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion'; 
import SEOHead from '@/Components/SEOHead';
import { toast } from 'sonner';

export default function Checkout() {
  const { cartItems, clearCart } = useCart(); 
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // CORRECAO: Acessando 'products' (plural) conforme o erro de tipagem indicou
  const total = useMemo(() => {
    return cartItems.reduce((acc, item) => {
      const price = item.products?.price || 0;
      return acc + (price * item.quantity);
    }, 0);
  }, [cartItems]);

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    address: '',
    city: '',
    zipCode: '',
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleProcessOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cartItems.length === 0) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('orders')
        .insert({
          user_id: user?.id,
          total_amount: total,
          status: 'pending',
          shipping_address: `${formData.address}, ${formData.city} - ${formData.zipCode}`,
          // Salvamos os itens para referencia historica
          items: cartItems.map(item => ({
            product_id: item.product_id,
            title: item.products?.title,
            price: item.products?.price,
            quantity: item.quantity
          }))
        });

      if (error) throw error;

      toast.success('Arsenal reservado com sucesso!');
      clearCart();
      navigate('/profile'); 
    } catch (error: any) {
      toast.error('Erro ao processar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (cartItems.length === 0) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
        <div className="text-center bg-white p-10 rounded-[40px] shadow-sm border border-zinc-100">
          <Truck className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
          <h2 className="text-2xl font-black uppercase italic tracking-tighter">Carrinho Vazio</h2>
          <p className="text-zinc-500 mb-6">Seu arsenal está aguardando produtos.</p>
          <Button onClick={() => navigate('/')} className="bg-[#a3e635] text-black hover:bg-[#bef264] rounded-full px-8 font-bold">
            Voltar para a loja
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBFBFB] pt-24 pb-12 px-4">
      <SEOHead title="Checkout" description="Finalize sua compra com segurança na ArsenalFit." />
      
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-zinc-400 hover:text-black mb-8 transition-colors">
            <ArrowLeft size={18} /> Voltar
          </button>

          <h1 className="text-3xl font-black uppercase italic tracking-tighter mb-8">
            Finalizar <span className="text-[#a3e635]">Compra</span>
          </h1>

          <form onSubmit={handleProcessOrder} className="space-y-6">
            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-zinc-100 space-y-4">
              <h3 className="font-bold text-sm uppercase tracking-widest text-zinc-400 mb-4">Dados de Entrega</h3>
              <Input name="fullName" placeholder="Nome Completo" required onChange={handleInputChange} className="rounded-xl border-zinc-200" />
              <Input name="email" type="email" placeholder="E-mail" required onChange={handleInputChange} className="rounded-xl border-zinc-200" />
              <Input name="address" placeholder="Endereço completo" required onChange={handleInputChange} className="rounded-xl border-zinc-200" />
              <div className="grid grid-cols-2 gap-4">
                <Input name="city" placeholder="Cidade" required onChange={handleInputChange} className="rounded-xl border-zinc-200" />
                <Input name="zipCode" placeholder="CEP" required onChange={handleInputChange} className="rounded-xl border-zinc-200" />
              </div>
            </div>
            
            <Button type="submit" disabled={loading} className="w-full h-16 bg-zinc-900 text-white hover:bg-black rounded-2xl font-black text-lg transition-all shadow-xl shadow-zinc-200">
              {loading ? <Loader2 className="animate-spin" /> : "CONFIRMAR PEDIDO"}
            </Button>
            
            <div className="flex items-center justify-center gap-4 text-zinc-400 text-xs mt-4">
              <span className="flex items-center gap-1"><ShieldCheck size={14} /> Seguro</span>
              <span className="flex items-center gap-1"><CreditCard size={14} /> Criptografado</span>
            </div>
          </form>
        </motion.div>

        {/* Resumo do Pedido */}
        <div className="bg-zinc-900 text-white p-8 md:p-10 rounded-[48px] shadow-2xl h-fit lg:sticky lg:top-24">
          <h3 className="text-xl font-bold mb-8 flex items-center gap-2">
            <div className="w-2 h-2 bg-[#a3e635] rounded-full" /> Resumo do Arsenal
          </h3>
          
          <div className="space-y-6 mb-8">
            {cartItems.map((item) => (
              <div key={item.id} className="flex justify-between items-start border-b border-zinc-800 pb-4">
                <div className="flex flex-col">
                  {/* CORRECAO: Acessando item.products?.title */}
                  <span className="font-bold text-sm">{item.products?.title || 'Produto'}</span>
                  <span className="text-zinc-500 text-xs">{item.quantity}x R$ {item.products?.price?.toFixed(2)}</span>
                </div>
                <span className="font-black text-[#a3e635]">
                  R$ {((item.products?.price || 0) * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div className="flex justify-between text-zinc-400 text-sm">
              <span>Subtotal</span>
              <span>R$ {total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-zinc-400 text-sm">
              <span>Frete</span>
              <span className="text-[#a3e635] font-bold">GRÁTIS</span>
            </div>
            <div className="border-t border-zinc-800 pt-6 flex justify-between items-end">
              <span className="text-zinc-400 font-bold uppercase text-xs tracking-widest">Total Final</span>
              <span className="text-3xl font-black text-[#a3e635]">R$ {total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}







