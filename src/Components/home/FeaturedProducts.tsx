import { useState } from "react";
import { RedirectModal } from "@/Components/shared/RedirectModalx";

const products = [
  { id: 1, name: "Whey Protein Isolado", price: "189,90", image: "URL_AQUI", link: "https://link-afiliado.com" },
  // Adicione mais...
];

export const FeaturedProducts = () => {
  const [selectedProduct, setSelectedProduct] = useState<typeof products[0] | null>(null);

  return (
    <section className="container-fit py-16">
      <h2 className="text-3xl font-display font-bold mb-8 text-gradient">Destaques da Semana</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {products.map((product) => (
          <div key={product.id} className="card-hover bg-card rounded-xl overflow-hidden border border-border group">
            <div className="aspect-square bg-muted relative overflow-hidden">
               <img src={product.image} alt={product.name} className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500" />
               <div className="badge-discount absolute top-2 right-2">Oferta</div>
            </div>
            <div className="p-4 space-y-2">
              <h3 className="font-bold text-lg leading-tight">{product.name}</h3>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-display font-black text-foreground">R$ {product.price}</span>
              </div>
              <button 
                onClick={() => setSelectedProduct(product)}
                className="btn-glow w-full bg-secondary text-secondary-foreground py-2 rounded-lg font-bold hover:bg-forest-800 transition-colors"
              >
                Ver Oferta
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedProduct && (
        <RedirectModal 
          isOpen={!!selectedProduct} 
          onClose={() => setSelectedProduct(null)}
          productName={selectedProduct.name}
          externalLink={selectedProduct.link}
        />
      )}
    </section>
  );
};
