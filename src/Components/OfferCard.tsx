import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, ExternalLink, Clock } from 'lucide-react';
import { Button } from '@/Components/ui/button';
import { Card, CardContent } from '@/Components/ui/card';
import { Badge } from '@/Components/ui/badge';
import { useCart } from '@/hooks/useCart';
import { toast } from 'sonner';
import { PriceDisclaimer } from '@/Components/PriceDisclaimer';
import { bounceCartIcon, flyToCartAnimation, showAddToCartToast } from '@/lib/cartFeedback';
import { useRef } from 'react';

// Definindo a Interface localmente para resolver o erro de módulo
interface Product {
  id: string;
  name?: string; // Adicione a interrogação aqui
  slug?: string;
  price: number;
  pix_price?: number | null;
  original_price?: number;
  previous_price?: number | null;
  detected_at?: string | null;
  image_url?: string;
  images?: string[];
  affiliate_link?: string | null;
  last_sync?: string | null;
  updated_at?: string | null;
  ultima_verificacao?: string | null;
  [key: string]: any; // Isso permite que qualquer outra propriedade do hook passe sem erro
}

interface OfferCardProps {
  product: Product;
}

export const OfferCard = ({ product }: OfferCardProps) => {
  const { addToCart, isLoggedIn } = useCart();
  const navigate = useNavigate();
  const imageRef = useRef<HTMLImageElement | null>(null);
  const lastUpdated = product.updated_at
    ? new Date(product.updated_at)
    : product.last_sync
      ? new Date(product.last_sync)
      : product.ultima_verificacao
        ? new Date(product.ultima_verificacao)
        : null;

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn) {
      await addToCart(product.id);
      return;
    }

    const targetEl = document.querySelector("[data-cart-icon]") as HTMLElement | null;
    Promise.resolve(
      flyToCartAnimation({
        sourceEl: imageRef.current,
        targetEl,
        imageSrc: imageUrl,
      })
    ).then(() => bounceCartIcon(targetEl));

    const added = await addToCart(product.id, 1, { silent: true });
    if (added) {
      showAddToCartToast({ onGoToCart: () => navigate("/carrinho") });
    }
  };

  const handleBuyNow = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const link = product.affiliate_link;
    if (!link) {
      toast.error('Link de afiliado indisponível.');
      return;
    }
    window.open(link, '_blank', 'noopener,noreferrer');
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
  const hasDrop = typeof product.previous_price === "number" && product.previous_price > product.price;
  const dropPercent = hasDrop && product.previous_price
    ? Math.round(((product.previous_price - product.price) / product.previous_price) * 100)
    : 0;
  const detectedAt = product.detected_at ? new Date(product.detected_at) : null;
  const isRecentDrop = hasDrop && detectedAt ? Date.now() - detectedAt.getTime() <= 24 * 60 * 60 * 1000 : false;
  const pixPrice =
    typeof product.pix_price === "number" && Number.isFinite(product.pix_price)
      ? product.pix_price
      : null;
  const showPix = pixPrice !== null && pixPrice > 0 && pixPrice < product.price;

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
            ref={imageRef}
            className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-110"
            loading="lazy"
          />
          
          <div className="absolute left-3 top-3 z-10 flex flex-col gap-2">
            {hasDiscount && (
              <Badge className="bg-red-600 text-white font-black text-lg px-3 py-1 rounded-xl shadow-lg border-none">
                -{calculatedDiscount}%
              </Badge>
            )}
            {isRecentDrop && (
              <Badge className="bg-[#a3e635] text-black font-black text-[10px] uppercase tracking-widest px-3 py-1 rounded-xl shadow-lg border-none">
                Baixou {dropPercent > 0 ? `${dropPercent}%` : "agora"}
              </Badge>
            )}
          </div>

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
            {showPix && (
              <span className="text-[11px] text-emerald-400 font-semibold block">
                no Pix: R$ {pixPrice?.toFixed(2).replace('.', ',')}
              </span>
            )}
            <PriceDisclaimer
              lastUpdated={lastUpdated}
              className="text-[10px] text-zinc-500 block mt-1"
            />
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



