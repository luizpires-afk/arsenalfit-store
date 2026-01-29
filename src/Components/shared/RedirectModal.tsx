import { ExternalLink, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";

interface RedirectModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  externalLink: string;
}

export const RedirectModal = ({ isOpen, onClose, productName, externalLink }: RedirectModalProps) => {
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (isOpen && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (isOpen && countdown === 0) {
      window.open(externalLink, "_blank");
      onClose();
    }
  }, [isOpen, countdown, externalLink, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-card border-2 border-primary/20 p-8 rounded-2xl shadow-glow max-w-sm w-full text-center space-y-4">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto animate-pulse-slow">
          <ShoppingCart className="text-primary w-8 h-8" />
        </div>
        <h3 className="text-xl font-display font-bold">Excelente escolha!</h3>
        <p className="text-muted-foreground text-sm">
          Estamos te redirecionando para a loja oficial do <strong>{productName}</strong>.
        </p>
        <div className="py-2">
          <span className="text-4xl font-bold text-primary">{countdown}</span>
        </div>
        <button 
          onClick={() => window.open(externalLink, "_blank")}
          className="btn-glow w-full bg-primary text-primary-foreground py-3 rounded-xl font-bold flex items-center justify-center gap-2"
        >
          Ir agora <ExternalLink size={18} />
        </button>
      </div>
    </div>
  );
};