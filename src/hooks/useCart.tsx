import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Tipagem manual para evitar o erro de 'module not found' caso o arquivo de types do Supabase suma
export interface Product {
  id: string;
  title?: string;
  name?: string;
  price: number;
  image_url: string;
  slug: string;
}

export interface CartItem {
  id: string;
  product_id: string;
  user_id: string;
  quantity: number;
  created_at?: string;
  products: Product | null;
}

export const useCart = () => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchCart = useCallback(async () => {
    if (!userId) {
      setCartItems([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cart_items')
        .select('*, products(*)')
        .eq('user_id', userId);

      if (error) throw error;
      // Forçamos o tipo para CartItem[]
      setCartItems((data as any) || []);
    } catch (error) {
      console.error('Erro ao carregar carrinho:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  const addToCart = async (productId: string, quantity: number = 1) => {
    if (!userId) {
      toast.error('Você precisa estar logado para adicionar ao carrinho!');
      return false;
    }

    try {
      // Lógica de Soma: verifica se o item já existe no estado local
      const existingItem = cartItems.find(item => item.product_id === productId);

      if (existingItem) {
        const newQuantity = existingItem.quantity + quantity;
        return await updateQuantity(existingItem.id, newQuantity);
      }

      const { error } = await supabase
        .from('cart_items')
        .insert({ user_id: userId, product_id: productId, quantity });

      if (error) throw error;
      
      toast.success('Produto adicionado ao carrinho!');
      await fetchCart();
      return true;
    } catch (error) {
      console.error('Erro ao adicionar ao carrinho:', error);
      toast.error('Erro ao adicionar produto.');
      return false;
    }
  };

  const updateQuantity = async (cartItemId: string, quantity: number) => {
    if (quantity < 1) return removeFromCart(cartItemId);

    try {
      const { error } = await supabase
        .from('cart_items')
        .update({ quantity })
        .eq('id', cartItemId);

      if (error) throw error;
      await fetchCart();
      return true;
    } catch (error) {
      console.error('Erro ao atualizar quantidade:', error);
      return false;
    }
  };

  const removeFromCart = async (cartItemId: string) => {
    try {
      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('id', cartItemId);

      if (error) throw error;
      
      toast.success('Removido do carrinho');
      await fetchCart();
      return true;
    } catch (error) {
      console.error('Erro ao remover:', error);
      return false;
    }
  };

  const clearCart = async () => {
    if (!userId) return false;
    try {
      const { error } = await supabase.from('cart_items').delete().eq('user_id', userId);
      if (error) throw error;
      setCartItems([]);
      return true;
    } catch (error) {
      return false;
    }
  };

  const cartTotal = cartItems.reduce((total, item) => {
    const price = item.products?.price || 0;
    return total + price * item.quantity;
  }, 0);

  const cartCount = cartItems.reduce((count, item) => count + item.quantity, 0);

  return {
    cartItems,
    loading,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    fetchCart,
    cartTotal,
    cartCount,
    isLoggedIn: !!userId,
    user,
  };
};

