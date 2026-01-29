import React, { useState } from 'react';
import { Button } from "@/Components/ui/button";
import { ShoppingCart, Check, Loader2 } from "lucide-react";
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function AddToCartButton({ product, user, cartItems = [], className = "" }) {
  const queryClient = useQueryClient();
  const [added, setAdded] = useState(false);

  const existingItem = cartItems.find(item => item.product_id === product.id);

  const addToCartMutation = useMutation({
    mutationFn: async () => {
      if (existingItem) {
        await base44.entities.CartItem.update(existingItem.id, { 
          quantity: (existingItem.quantity || 1) + 1 
        });
      } else {
        await base44.entities.CartItem.create({
          product_id: product.id,
          quantity: 1
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      setAdded(true);
      toast.success('Adicionado ao carrinho!');
      setTimeout(() => setAdded(false), 2000);
    },
  });

  const handleAddToCart = () => {
    if (!user) {
      toast.error('Faça login para adicionar ao carrinho');
      base44.auth.redirectToLogin();
      return;
    }
    addToCartMutation.mutate();
  };

  return (
    <Button 
      onClick={handleAddToCart}
      disabled={addToCartMutation.isPending}
      className={`bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl transition-all duration-300 ${className}`}
    >
      {addToCartMutation.isPending ? (
        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
      ) : added ? (
        <Check className="w-5 h-5 mr-2" />
      ) : (
        <ShoppingCart className="w-5 h-5 mr-2" />
      )}
      {added ? 'Adicionado!' : existingItem ? 'Adicionar mais' : 'Adicionar ao carrinho'}
    </Button>
  );
}

