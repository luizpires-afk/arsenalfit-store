import React from 'react';
import { Star, User } from "lucide-react";
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';

export default function ReviewList({ reviews }) {
  if (!reviews || reviews.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500">
        <p>Nenhuma avaliação ainda. Seja o primeiro a avaliar!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reviews.map((review, index) => (
        <motion.div
          key={review.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="bg-white border border-zinc-100 rounded-xl p-5"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center">
                <User className="w-5 h-5 text-zinc-500" />
              </div>
              <div>
                <p className="font-medium text-zinc-900">{review.user_name}</p>
                <p className="text-xs text-zinc-400">
                  {format(new Date(review.created_date), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star 
                  key={star}
                  className={`w-4 h-4 ${
                    star <= review.rating
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-zinc-200'
                  }`}
                />
              ))}
            </div>
          </div>
          {review.comment && (
            <p className="text-zinc-600 text-sm leading-relaxed">{review.comment}</p>
          )}
        </motion.div>
      ))}
    </div>
  );
}
