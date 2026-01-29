import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ShoppingCart, Plus, Minus, Trash2, ShoppingBag } from 'lucide-react';
import { Button } from "@/Components/ui/button";
import { Badge } from "@/Components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/Components/ui/sheet";
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ScrollArea } from "@/Components/ui/scroll-area";

export default function CartDropdown({ cartItems = [], products = [], scrolled }) {
  const queryClient = useQueryClient();
  
  const cartProducts = cartItems.map(item => {
    const product = products.find(p => p.id === item.product_id);
    return { ...item, product };
  }).filter(item => item.product);

  const totalItems = cartProducts.reduce((sum, item) => sum + (item.quantity || 1), 0);
  const totalPrice = cartProducts.reduce((sum, item) => {
    return sum + ((item.product?.price || 0) * (item.quantity || 1));
  }, 0);

  const updateQuantityMutation = useMutation({
    mutationFn: ({ id, quantity }) => base44.entities.CartItem.update(id, { quantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: (id) => base44.entities.CartItem.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast.success('Item removido do carrinho');
    },
  });

  const clearCartMutation = useMutation({
    mutationFn: async () => {
      for (const item of cartItems) {
        await base44.entities.CartItem.delete(item.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast.success('Carrinho limpo');
    },
  });

  const increaseQuantity = (item) => {
    updateQuantityMutation.mutate({ id: item.id, quantity: (item.quantity || 1) + 1 });
  };

  const decreaseQuantity = (item) => {
    if ((item.quantity || 1) <= 1) {
      removeItemMutation.mutate(item.id);
    } else {
      updateQuantityMutation.mutate({ id: item.id, quantity: (item.quantity || 1) - 1 });
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className={`relative rounded-full ${
            scrolled ? 'text-zinc-600 hover:bg-zinc-100' : 'text-white hover:bg-white/10'
          }`}
        >
          <ShoppingCart className="w-5 h-5" />
          {totalItems > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-lime-400 text-zinc-900 text-xs">
              {totalItems}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            Carrinho ({totalItems})
          </SheetTitle>
        </SheetHeader>
        
        {cartProducts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
            <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center mb-4">
              <ShoppingBag className="w-8 h-8 text-zinc-400" />
            </div>
            <p className="text-zinc-500 mb-4">Seu carrinho está vazio</p>
            <Link to={createPageUrl('Products')}>
              <Button className="bg-zinc-900 hover:bg-zinc-800">
                Explorar Produtos
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-4 py-4">
                {cartProducts.map((item) => (
                  <div key={item.id} className="flex gap-4 p-3 bg-zinc-50 rounded-xl">
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-white flex-shrink-0">
                      <img
                        src={item.product.images?.[0] || 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200'}
                        alt={item.product.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link 
                        to={createPageUrl('ProductDetail') + `?id=${item.product.id}`}
                        className="font-medium text-zinc-900 text-sm line-clamp-2 hover:text-lime-600"
                      >
                        {item.product.title}
                      </Link>
                      <p className="text-lime-600 font-bold mt-1">
                        R$ {item.product.price?.toFixed(2).replace('.', ',')}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex items-center border rounded-lg">
                          <button
                            onClick={() => decreaseQuantity(item)}
                            className="p-1.5 hover:bg-zinc-100 transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-3 text-sm font-medium">{item.quantity || 1}</span>
                          <button
                            onClick={() => increaseQuantity(item)}
                            className="p-1.5 hover:bg-zinc-100 transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <button
                          onClick={() => removeItemMutation.mutate(item.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Subtotal</span>
                <span className="text-xl font-bold text-zinc-900">
                  R$ {totalPrice.toFixed(2).replace('.', ',')}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant="outline" 
                  onClick={() => clearCartMutation.mutate()}
                  className="rounded-xl"
                >
                  Limpar carrinho
                </Button>
                <Link to={createPageUrl('Checkout')} className="block">
                  <Button className="w-full bg-lime-400 hover:bg-lime-500 text-zinc-900 rounded-xl font-semibold">
                    Finalizar
                  </Button>
                </Link>
              </div>
              
              <p className="text-xs text-zinc-400 text-center">
                Os produtos serão adquiridos em lojas parceiras através de links de afiliado
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

