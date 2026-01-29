import React, { useState } from 'react';
import { Button } from "@/Components/ui/button";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/Components/ui/dialog";
import { Checkbox } from "@/Components/ui/checkbox";
import { Label } from "@/Components/ui/label";

export default function FollowProductButton({ product, user, follows = [] }) {
  const [open, setOpen] = useState(false);
  const [priceDropNotify, setPriceDropNotify] = useState(true);
  const [stockNotify, setStockNotify] = useState(true);
  const queryClient = useQueryClient();

  const isFollowing = follows.some(f => f.product_id === product.id);
  const currentFollow = follows.find(f => f.product_id === product.id);

  const followMutation = useMutation({
    mutationFn: () => base44.entities.ProductFollow.create({
      product_id: product.id,
      notify_price_drop: priceDropNotify,
      notify_back_in_stock: stockNotify,
      last_known_price: product.price
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follows'] });
      toast.success('Você será notificado sobre este produto!');
      setOpen(false);
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async () => {
      if (currentFollow) {
        await base44.entities.ProductFollow.delete(currentFollow.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follows'] });
      toast.success('Notificações desativadas para este produto');
    },
  });

  const handleFollow = () => {
    if (!user) {
      toast.error('Faça login para receber notificações');
      base44.auth.redirectToLogin();
      return;
    }
    
    if (isFollowing) {
      unfollowMutation.mutate();
    } else {
      setOpen(true);
    }
  };

  const confirmFollow = () => {
    followMutation.mutate();
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={handleFollow}
        disabled={followMutation.isPending || unfollowMutation.isPending}
        className={`w-full rounded-xl h-12 ${
          isFollowing 
            ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' 
            : ''
        }`}
      >
        {(followMutation.isPending || unfollowMutation.isPending) ? (
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
        ) : isFollowing ? (
          <BellOff className="w-5 h-5 mr-2" />
        ) : (
          <Bell className="w-5 h-5 mr-2" />
        )}
        {isFollowing ? 'Seguindo' : 'Seguir produto'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Receber notificações</DialogTitle>
            <DialogDescription>
              Escolha quais notificações você deseja receber sobre este produto.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="flex items-center space-x-3">
              <Checkbox 
                id="price-drop" 
                checked={priceDropNotify}
                onCheckedChange={setPriceDropNotify}
              />
              <Label htmlFor="price-drop" className="flex-1 cursor-pointer">
                <span className="font-medium">Queda de preço</span>
                <p className="text-sm text-zinc-500">Notificar quando o preço diminuir</p>
              </Label>
            </div>
            
            <div className="flex items-center space-x-3">
              <Checkbox 
                id="back-stock" 
                checked={stockNotify}
                onCheckedChange={setStockNotify}
              />
              <Label htmlFor="back-stock" className="flex-1 cursor-pointer">
                <span className="font-medium">Volta ao estoque</span>
                <p className="text-sm text-zinc-500">Notificar quando estiver disponível novamente</p>
              </Label>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={confirmFollow}
              disabled={followMutation.isPending || (!priceDropNotify && !stockNotify)}
              className="bg-zinc-900 hover:bg-zinc-800"
            >
              {followMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Ativar notificações
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

