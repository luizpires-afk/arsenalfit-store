import { Link } from 'react-router-dom';
import { ShoppingCart, ExternalLink, Clock, Zap } from 'lucide-react';
import { Button } from '@/Components/ui/button';
import { Card, CardContent } from '@/Components/ui/card';
import { Badge } from '@/Components/ui/badge';
import { useCart } from '@/hooks/useCart';

// Definindo a Interface localmente para resolver o erro de módulo
interface Product {
  id: string;
  name?: string; // Adicione a interrogação aqui
  slug?: string;
  price: number;
  original_price?: number;
  image_url?: string;
  images?: string[];
  [key: string]: any; // Isso permite que qualquer outra propriedade do hook passe sem erro
}

interface OfferCardProps {
  product: Product;
}

export const OfferCard = ({ product }: OfferCardProps) => {
  const { addToCart } = useCart();

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await addToCart(product.id);
  };

  const handleBuyNow = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const link = product.affiliate_link || product.source_url || product.instructions;
    if (link) {
      window.open(link, '_blank');
    }
  };

  // Ajuste de lógica para pegar a imagem correta
  const imageUrl = product.image_url 
    ? product.image_url 
    : (product.images && product.images.length > 0 ? product.images[0] : '/placeholder.svg');

  const discountPercentage = product.discount_percentage || 0;
  
  // Cálculo de desconto em tempo real
  const calculatedDiscount = product.original_price && product.original_price > product.price
    ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
    : discountPercentage;

  const hasDiscount = calculatedDiscount > 0;

  const productLink = product.slug ? `/produto/${product.slug}` : "#";

  return (
    <Card className="group overflow-hidden bg-zinc-900 border-zinc-800 transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 hover:border-[#a3e635]/50 rounded-[26px] focus-within:ring-2 focus-within:ring-[#a3e635]/40">
      {/* Soft glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120px_120px_at_80%_0%,rgba(163,230,53,0.08),transparent_60%)] opacity-0 group-hover:opacity-100 transition-opacity" />
      <Link to={productLink}>
        <div className="relative aspect-square overflow-hidden bg-white p-4">
          <img
            src={imageUrl}
            alt={product.name}
            className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-110"
            loading="lazy"
          />
          
          {/* Discount Badge */}
          {hasDiscount && (
            <Badge className="absolute left-3 top-3 bg-red-600 text-white font-black text-lg px-3 py-1 rounded-xl shadow-lg border-none">
              -{calculatedDiscount}%
            </Badge>
          )}

          {/* Robot Update Badge */}
          <div className="absolute right-3 top-3 flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-950/80 backdrop-blur-sm border border-zinc-700">
            <Clock className="h-3 w-3 text-[#a3e635]" />
            <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-tighter">Robô Ativo</span>
          </div>
        </div>

        <CardContent className="p-5 bg-zinc-900">
          <h3 className="mb-2 line-clamp-2 text-sm font-black italic uppercase text-white group-hover:text-[#a3e635] transition-colors">
            {product.name}
          </h3>

          {/* Price Section */}
          <div className="mb-4 space-y-0">
            {hasDiscount && (
              <span className="text-xs text-zinc-500 line-through block font-bold">
                R$ {product.original_price?.toFixed(2).replace('.', ',')}
              </span>
            )}
            <span className="text-2xl font-black text-[#a3e635] italic">
              R$ {product.price.toFixed(2).replace('.', ',')}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-[#a3e635] hover:border-[#a3e635] rounded-xl font-bold uppercase text-[10px]"
              onClick={handleAddToCart}
              aria-label={`Adicionar ${product.name || 'produto'} ao carrinho`}
            >
              <ShoppingCart className="mr-1 h-3 w-3" />
              + Carrinho
            </Button>
            
            <Button
              size="sm"
              className="flex-1 bg-white text-black hover:bg-[#a3e635] font-black uppercase italic rounded-xl text-[10px] transition-colors"
              onClick={handleBuyNow}
              aria-label={`Comprar ${product.name || 'produto'}`}
            >
              <ExternalLink className="mr-1 h-3 w-3" />
              Comprar
            </Button>
          </div>
        </CardContent>
      </Link>
    </Card>
  );
};




