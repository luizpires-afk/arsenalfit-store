import React, { useState } from 'react';
import { Button } from "@/Components/ui/button";
import { Textarea } from "@/Components/ui/textarea";
import { Star, Loader2 } from "lucide-react";
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export default function ReviewForm({ productId, user, onSuccess }) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const queryClient = useQueryClient();

  const submitMutation = useMutation({
    mutationFn: () => base44.entities.Review.create({
      product_id: productId,
      rating,
      comment,
      user_name: user.full_name || user.email.split('@')[0]
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews', productId] });
      toast.success('Avaliação enviada com sucesso!');
      setRating(0);
      setComment('');
      if (onSuccess) onSuccess();
    },
    onError: () => {
      toast.error('Erro ao enviar avaliação');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (rating === 0) {
      toast.error('Por favor, selecione uma nota');
      return;
    }
    submitMutation.mutate();
  };

  if (!user) {
    return (
      <div className="bg-zinc-50 rounded-2xl p-6 text-center">
        <p className="text-zinc-600 mb-4">Faça login para avaliar este produto</p>
        <Button 
          onClick={() => base44.auth.redirectToLogin()}
          className="bg-zinc-900 hover:bg-zinc-800"
        >
          Entrar
        </Button>
      </div>
    );
  }

  return (
    <motion.form 
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-zinc-50 rounded-2xl p-6"
    >
      <h4 className="font-semibold text-zinc-900 mb-4">Deixe sua avaliação</h4>
      
      {/* Star Rating */}
      <div className="flex items-center gap-1 mb-4">
        <span className="text-sm text-zinc-600 mr-2">Sua nota:</span>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(0)}
            className="p-0.5 transition-transform hover:scale-110"
          >
            <Star 
              className={`w-7 h-7 transition-colors ${
                star <= (hoverRating || rating)
                  ? 'fill-amber-400 text-amber-400'
                  : 'text-zinc-300'
              }`}
            />
          </button>
        ))}
        {rating > 0 && (
          <span className="ml-2 text-sm font-medium text-zinc-700">
            {rating === 1 && 'Ruim'}
            {rating === 2 && 'Regular'}
            {rating === 3 && 'Bom'}
            {rating === 4 && 'Muito bom'}
            {rating === 5 && 'Excelente'}
          </span>
        )}
      </div>

      {/* Comment */}
      <Textarea
        placeholder="Conte sua experiência com este produto... (opcional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        className="mb-4 min-h-[100px] resize-none border-zinc-200 focus:border-zinc-400 focus:ring-zinc-400"
      />

      <Button 
        type="submit"
        disabled={submitMutation.isPending || rating === 0}
        className="bg-zinc-900 hover:bg-zinc-800 rounded-xl"
      >
        {submitMutation.isPending ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Enviando...
          </>
        ) : (
          'Enviar avaliação'
        )}
      </Button>
    </motion.form>
  );
}

