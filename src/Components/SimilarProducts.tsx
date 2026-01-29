import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import ProductCard from '@/Components/ProductCard';

export default function SimilarProducts({ currentProduct, allProducts = [] }) {
  const [similarProducts, setSimilarProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const findSimilarProducts = async () => {
      if (!currentProduct || allProducts.length <= 1) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      const otherProducts = allProducts.filter(p => p.id !== currentProduct.id);
      
      if (otherProducts.length === 0) {
        setIsLoading(false);
        return;
      }

      const productsList = otherProducts.map(p => ({
        id: p.id,
        title: p.title,
        category: p.category,
        brand: p.brand || '',
        price: p.price,
        description: p.description || ''
      }));

      const prompt = `Analise o seguinte produto fitness e encontre os produtos mais similares ou complementares da lista abaixo.

PRODUTO ATUAL:
- Título: ${currentProduct.title}
- Categoria: ${currentProduct.category}
- Marca: ${currentProduct.brand || 'Não especificada'}
- Preço: R$ ${currentProduct.price}
- Descrição: ${currentProduct.description || 'Sem descrição'}

LISTA DE PRODUTOS DISPONÍVEIS:
${JSON.stringify(productsList, null, 2)}

Considere:
1. Mesma categoria ou categorias complementares (ex: suplemento + acessório para treino)
2. Mesma marca ou marcas similares
3. Faixa de preço similar (+-50%)
4. Produtos que combinem bem juntos

Retorne os IDs dos 4 produtos mais similares ou complementares, ordenados por relevância.`;

      try {
        const response = await base44.integrations.Core.InvokeLLM({
          prompt,
          response_json_schema: {
            type: "object",
            properties: {
              similar_product_ids: {
                type: "array",
                items: { type: "string" },
                description: "IDs dos produtos similares ordenados por relevância"
              },
              reasoning: {
                type: "string",
                description: "Breve explicação das escolhas"
              }
            },
            required: ["similar_product_ids"]
          }
        });

        const similarIds = response.similar_product_ids || [];
        const similar = similarIds
          .map(id => otherProducts.find(p => p.id === id))
          .filter(Boolean)
          .slice(0, 4);

        setSimilarProducts(similar);
      } catch (error) {
        console.error('Error finding similar products:', error);
        // Fallback: produtos da mesma categoria
        const fallback = otherProducts
          .filter(p => p.category === currentProduct.category)
          .slice(0, 4);
        setSimilarProducts(fallback);
      }

      setIsLoading(false);
    };

    findSimilarProducts();
  }, [currentProduct?.id, allProducts.length]);

  if (isLoading) {
    return (
      <div className="mt-16">
        <h2 className="text-2xl font-bold text-zinc-900 mb-6 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-lime-500" />
          Produtos Similares
        </h2>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          <span className="ml-2 text-zinc-500">Analisando produtos similares com IA...</span>
        </div>
      </div>
    );
  }

  if (similarProducts.length === 0) {
    return null;
  }

  return (
    <motion.div 
      className="mt-16"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h2 className="text-2xl font-bold text-zinc-900 mb-2 flex items-center gap-2">
        <Sparkles className="w-6 h-6 text-lime-500" />
        Produtos Similares
      </h2>
      <p className="text-zinc-500 mb-6">Recomendados com base em IA</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {similarProducts.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </motion.div>
  );
}


