import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Link2, Bot } from 'lucide-react';

export default function ProductForm() {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    price: 0,
    original_price: 0,
    affiliate_link: '',
    image_url: '',
    external_id: '',
    marketplace: 'manual', // Valor padrão
    category_id: '',
  });

  // FUNÇÃO MÁGICA: Extrai ID e ativa o robô
  const handleLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    const mlMatch = url.match(/MLB-?(\d+)/i);
    
    if (mlMatch) {
      const mlid = `MLB${mlMatch[1]}`;
      setFormData(prev => ({
        ...prev,
        affiliate_link: url,
        external_id: mlid,
        marketplace: 'mercadolivre'
      }));
      toast.success(`Robô ativado para o ID: ${mlid}`, {
        icon: <Bot className="text-blue-500" />
      });
    } else {
      setFormData(prev => ({ ...prev, affiliate_link: url }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from('products')
        .insert([formData]);

      if (error) throw error;
      toast.success('Produto salvo e robô configurado!');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto p-8 bg-white rounded-3xl border border-zinc-100 shadow-sm">
      <div className="space-y-2">
        <label className="text-sm font-bold text-zinc-700 flex items-center gap-2">
          <Link2 size={16} /> Link do Mercado Livre
        </label>
        <input 
          type="text" 
          placeholder="Cole a URL do produto aqui..."
          onChange={handleLinkChange}
          className="w-full p-4 rounded-2xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none transition-all"
        />
        <p className="text-[10px] text-zinc-400 italic">O sistema identificará o ID automaticamente para o robô.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-bold text-zinc-700">ID do Robô (Auto)</label>
          <input 
            type="text" 
            value={formData.external_id} 
            readOnly
            className="w-full p-4 rounded-2xl bg-zinc-50 border border-zinc-100 text-zinc-500 cursor-not-allowed"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-zinc-700">Marketplace</label>
          <input 
            type="text" 
            value={formData.marketplace} 
            readOnly
            className="w-full p-4 rounded-2xl bg-zinc-50 border border-zinc-100 text-zinc-500 cursor-not-allowed uppercase"
          />
        </div>
      </div>

      {/* Outros campos (Nome, Preço, etc) */}
      <div className="space-y-2">
        <label className="text-sm font-bold text-zinc-700">Nome do Produto</label>
        <input 
          type="text" 
          value={formData.name}
          onChange={e => setFormData({...formData, name: e.target.value})}
          className="w-full p-4 rounded-2xl border border-zinc-200"
          required
        />
      </div>

      <button 
        type="submit" 
        disabled={loading}
        className="w-full bg-zinc-900 text-white font-black py-5 rounded-2xl hover:bg-primary hover:text-black transition-all flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 className="animate-spin" /> : 'CADASTRAR E ATIVAR MONITORAMENTO'}
      </button>
    </form>
  );
}



