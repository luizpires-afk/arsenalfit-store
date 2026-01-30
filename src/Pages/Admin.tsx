import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Package,
  Plus,
  Edit,
  Trash2,
  Search,
  LayoutGrid,
  List,
  ExternalLink,
  Eye,
  EyeOff,
  Save,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

// Imports de Componentes
import { Layout } from "@/Components/layout/Layout";
import { Button } from "@/Components/ui/button";
import { Input } from "@/Components/ui/input";
import { Label } from "@/Components/ui/label";
import { Textarea } from "@/Components/ui/textarea";
import { Switch } from "@/Components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/Components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/Components/ui/dialog";

// Hooks e Utilitários
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import type { Product, Category } from "@/types/database";

import {
  isValidAffiliateLink,
  detectMarketplace,
  generateSlug,
  formatPrice,
} from "@/lib/validators";

import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;


// Tipagem do Formulário
interface ProductFormData {
  name: string;
  description: string;
  short_description: string;
  price: string;
  original_price: string;
  discount_percentage: string;
  image_url: string;
  source_url: string;
  affiliate_link: string;
  external_id: string;
  category_id: string;
  is_featured: boolean;
  is_active: boolean;
  is_on_sale: boolean;
  free_shipping: boolean;
  advantages: string;
}

const initialFormData: ProductFormData = {
  name: '',
  description: '',
  short_description: '',
  price: '',
  original_price: '',
  discount_percentage: '0',
  image_url: '',
  source_url: '',
  affiliate_link: '',
  external_id: '',
  category_id: '',
  is_featured: false,
  is_active: true,
  is_on_sale: false,
  free_shipping: false,
  advantages: '',
};

export default function Admin() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);
  const [affiliateLinkError, setAffiliateLinkError] = useState<string | null>(null);
  const [externalIdError, setExternalIdError] = useState<string | null>(null);
  const [isAutoFetching, setIsAutoFetching] = useState(false);
  const [lastFetchedExternalId, setLastFetchedExternalId] = useState<string | null>(null);
  const [lastNoIdLink, setLastNoIdLink] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [isSyncing, setIsSyncing] = useState(false);
  const canSubmit = Boolean(
    formData.name.trim() &&
    formData.price !== '' &&
    !affiliateLinkError &&
    !externalIdError &&
    !isAutoFetching
  );

  // Redirecionamento de segurança
  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      toast.error('Acesso negado', {
        description: 'Você não tem permissão para acessar esta página.',
      });
      navigate('/');
    }
  }, [user, isAdmin, authLoading, navigate]);

  // Buscar produtos
  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['admin-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, category:categories(*)')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data as unknown as Product[]) || [];
    },
    enabled: !!isAdmin,
  });

  // Buscar categorias
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*');
      
      if (error) throw error;
      return (data as Category[]) || [];
    },
    enabled: !!isAdmin,
  });

  // Mutation: Criar/Atualizar Produto
  const productMutation = useMutation({
    mutationFn: async (data: ProductFormData & { id?: string }) => {
      const slug = generateSlug(data.name);
      const marketplace = detectMarketplace(data.source_url || data.affiliate_link);
      
      // Sanitização dos dados numéricos
      const numericPrice = parseFloat(data.price) || 0;
      const numericOriginalPrice = data.original_price ? parseFloat(data.original_price) : null;
      const numericDiscount = parseInt(data.discount_percentage) || 0;

      const productData = {
        name: data.name,
        slug: data.id ? undefined : slug, // Não atualiza slug na edição para manter SEO
        description: data.description || null,
        short_description: data.short_description || null,
        price: numericPrice,
        original_price: numericOriginalPrice,
        discount_percentage: numericDiscount,
        image_url: data.image_url || null,
        source_url: data.source_url || null,
        affiliate_link: data.affiliate_link || null,
        external_id: data.external_id || null,
        category_id: data.category_id || null,
        is_featured: data.is_featured,
        is_active: data.is_active,
        is_on_sale: data.is_on_sale,
        free_shipping: data.free_shipping,
        marketplace,
        advantages: data.advantages ? data.advantages.split('\n').filter(a => a.trim()) : [],
      };

      if (data.id) {
        // Update
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', data.id);
        
        if (error) throw error;
      } else {
        // Create
        const { error } = await supabase
          .from('products')
          .insert({ ...productData, slug });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      toast.success(editingProduct ? 'Produto atualizado!' : 'Produto criado!');
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast.error('Erro ao salvar produto', {
        description: error.message,
      });
    },
  });

  // Mutation: Excluir Produto
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      toast.success('Produto excluído!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao excluir produto', {
        description: error.message,
      });
    },
  });

  const handleOpenDialog = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        description: product.description || '',
        short_description: product.short_description || '',
        price: product.price.toString(),
        original_price: product.original_price?.toString() || '',
        discount_percentage: product.discount_percentage?.toString() || '0',
        image_url: product.image_url || '',
        source_url: (product as any).source_url || '',
        affiliate_link: product.affiliate_link || '',
        external_id: product.external_id || '',
        category_id: product.category_id || '',
        is_featured: product.is_featured,
        is_active: product.is_active,
        is_on_sale: product.is_on_sale,
        free_shipping: product.free_shipping,
        advantages: product.advantages?.join('\n') || '',
      });
    } else {
      setEditingProduct(null);
      setFormData(initialFormData);
    }
    setAffiliateLinkError(null);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingProduct(null);
    setFormData(initialFormData);
    setAffiliateLinkError(null);
    setExternalIdError(null);
  };

  const extractMercadoLivreId = (url: string): string | null => {
    // 0) item_id=MLB123... (pdp_filters etc.)
    const itemId = url.match(/item_id%3AMLB(\d+)/i) || url.match(/[?&#]item_id=MLB(\d+)/i);
    if (itemId) return `MLB${itemId[1]}`;
    // 1) ID canônico no caminho: .../p/MLB123...
    const canonical = url.match(/\/p\/MLB(\d+)/i);
    if (canonical) return `MLB${canonical[1]}`;
    // 2) Parâmetro wid=MLB123...
    const wid = url.match(/[?&#]wid=MLB(\d+)/i);
    if (wid) return `MLB${wid[1]}`;
    // 3) Parâmetro id=MLB123...
    const pid = url.match(/[?&#]id=MLB(\d+)/i);
    if (pid) return `MLB${pid[1]}`;
    // 4) Qualquer MLB-123/MLB123 na URL
    const match = url.match(/MLB-?(\d+)/i);
    return match ? `MLB${match[1]}` : null;
  };

  const normalizeExternalId = (value: string) => {
    const upper = value.toUpperCase().replace(/\s+/g, '');
    if (upper.startsWith('MLB')) return upper.replace(/[^A-Z0-9]/g, '');
    const onlyDigits = upper.replace(/[^0-9]/g, '');
    return onlyDigits ? `MLB${onlyDigits}` : '';
  };

  const autoFillFromMercadoLivre = async (externalId: string) => {
    if (!externalId || externalId === lastFetchedExternalId) return;
    if (!/^MLB\d{8,}$/.test(externalId)) {
      setExternalIdError('Use o ID completo do Mercado Livre (ex: MLB12345678...).');
      return;
    }
    setExternalIdError(null);
    setIsAutoFetching(true);
    try {
      const itemRes = await fetch(`https://api.mercadolibre.com/items/${externalId}`);
      if (!itemRes.ok) {
        const msg = itemRes.status === 404 
          ? 'ID não encontrado no Mercado Livre. Copie o código MLB direto da URL do produto.'
          : 'Não foi possível consultar o Mercado Livre.';
        throw new Error(msg);
      }
      const itemData = await itemRes.json();

      let description = '';
      try {
        const descRes = await fetch(`https://api.mercadolibre.com/items/${externalId}/description`);
        if (descRes.ok) {
          const descData = await descRes.json();
          description = descData?.plain_text || '';
        }
      } catch {
        // silencioso: descrição é opcional
      }

      const price = itemData?.price ?? '';
      const originalPrice = itemData?.original_price ?? '';
      const imageUrl =
        itemData?.pictures?.[0]?.secure_url ||
        itemData?.pictures?.[0]?.url ||
        itemData?.thumbnail ||
        '';

      setFormData(prev => ({
        ...prev,
        name: prev.name || itemData?.title || '',
        short_description: prev.short_description || itemData?.title || '',
        description: prev.description || description,
        price: prev.price || (price ? String(price) : ''),
        original_price: prev.original_price || (originalPrice ? String(originalPrice) : ''),
        image_url: prev.image_url || imageUrl,
        external_id: externalId,
        is_on_sale: Boolean(originalPrice && price && originalPrice > price) || prev.is_on_sale,
      }));

      setLastFetchedExternalId(externalId);
      toast.success("Dados importados do Mercado Livre.");
    } catch (error: any) {
      setExternalIdError(error.message);
      toast.error("Falha ao importar dados do Mercado Livre.", {
        description: error.message,
      });
    } finally {
      setIsAutoFetching(false);
    }
  };

  const handleAffiliateLinkChange = (value: string) => {
    setFormData(prev => ({ ...prev, affiliate_link: value }));
    setExternalIdError(null);

    if (value.trim()) {
      const validation = isValidAffiliateLink(value);
      if (!validation.valid) {
        setAffiliateLinkError(validation.error || 'Link inválido');
        return;
      }
      setAffiliateLinkError(null);
    } else {
      setAffiliateLinkError(null);
    }
  };

  const handleSourceUrlChange = (value: string) => {
    setFormData(prev => ({ ...prev, source_url: value }));
    setExternalIdError(null);

    if (!value.trim()) {
      return;
    }

    const marketplace = detectMarketplace(value);
    if (marketplace === 'mercadolivre') {
      const mlbId = extractMercadoLivreId(value);
      if (mlbId) {
        setFormData(prev => ({ ...prev, external_id: mlbId }));
        // Para evitar bloqueio/403 no front, deixamos a importação para o robô (edge function).
        // autoFillFromMercadoLivre(mlbId);
      } else if (value !== lastNoIdLink && value.length > 20) {
        setLastNoIdLink(value);
        setExternalIdError('Link sem MLB. Abra o produto completo e copie o código MLB da URL.');
      }
    }
  };

  const handleExternalIdChange = (value: string) => {
    const normalized = normalizeExternalId(value);
    setFormData(prev => ({ ...prev, external_id: normalized }));
    setExternalIdError(null);

    if (!normalized) return;
    if (!/^MLB\d{8,}$/.test(normalized)) {
      setExternalIdError('Use o ID completo do Mercado Livre (ex: MLB12345678...).');
      return;
    }
    // Para evitar bloqueios no front, deixamos a importação para o robô server-side.
    // if (normalized !== lastFetchedExternalId) {
    //   autoFillFromMercadoLivre(normalized);
    // }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.affiliate_link.trim()) {
      const validation = isValidAffiliateLink(formData.affiliate_link);
      if (!validation.valid) {
        setAffiliateLinkError(validation.error || 'Link inválido');
        return;
      }
    }

    productMutation.mutate({
      ...formData,
      id: editingProduct?.id,
    });
  };

  const handleDelete = (product: Product) => {
    if (confirm(`Tem certeza que deseja excluir "${product.name}"?`)) {
      deleteMutation.mutate(product.id);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      // Tentativa padrão via SDK
      const { data, error } = await supabase.functions.invoke('sync-affiliate-data');
      if (error) throw error;
      toast.success('Robô sincronizado!', {
        description: `Atualizados: ${data?.updated_count ?? 0}`,
      });
    } catch (error: any) {
      // Fallback: chamada direta com ANON (útil se invoke falhar por CORS/SDK)
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/sync-affiliate-data`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${SUPABASE_ANON}`,
            apikey: SUPABASE_ANON,
          },
        });
        if (!resp.ok) {
          const txt = await resp.text();
          throw new Error(txt || `HTTP ${resp.status}`);
        }
        const json = await resp.json();
        toast.success('Robô sincronizado!', {
          description: `Atualizados: ${json?.updated_count ?? 0}`,
        });
      } catch (fallbackErr: any) {
        toast.error('Falha ao sincronizar', { description: fallbackErr.message || error?.message });
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (authLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Carregando...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!isAdmin) return null;

  return (
    <Layout>
      <div className="min-h-screen bg-secondary/30">
        <div className="container-tight py-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Painel Admin</h1>
              <p className="text-muted-foreground">Gerencie seus produtos</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={handleSyncNow}
                disabled={isSyncing}
              >
                {isSyncing ? 'Sincronizando...' : 'Atualizar preços'}
              </Button>
              <Button onClick={() => handleOpenDialog()} className="btn-energy">
                <Plus className="h-4 w-4 mr-2" />
                Novo Produto
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-card rounded-xl p-4 mb-6 border border-border">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar produtos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={viewMode === 'list' ? 'default' : 'outline'}
                  size="icon"
                  onClick={() => setViewMode('list')}
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'outline'}
                  size="icon"
                  onClick={() => setViewMode('grid')}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Products List */}
          {loadingProducts ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Carregando produtos...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-xl border border-border">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">Nenhum produto encontrado</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery ? 'Tente outro termo de busca' : 'Comece adicionando seu primeiro produto'}
              </p>
              {!searchQuery && (
                <Button onClick={() => handleOpenDialog()} className="btn-energy">
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Produto
                </Button>
              )}
            </div>
          ) : viewMode === 'list' ? (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-secondary/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Produto</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Preço</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Categoria</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Marketplace</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredProducts.map((product) => (
                      <tr key={product.id} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-lg bg-secondary overflow-hidden flex-shrink-0">
                              {product.image_url ? (
                                <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                                  <Package className="h-5 w-5" />
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-foreground line-clamp-1">{product.name}</p>
                              <p className="text-sm text-muted-foreground line-clamp-1">{product.short_description || 'Sem descrição'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div>
                            <p className="font-medium text-foreground">{formatPrice(product.price)}</p>
                            {product.original_price && product.original_price > product.price && (
                              <p className="text-sm text-muted-foreground line-through">{formatPrice(product.original_price)}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm text-muted-foreground">{product.category?.name || '-'}</span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            {product.is_active ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-success/10 text-success">
                                <Eye className="h-3 w-3" /> Ativo
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                                <EyeOff className="h-3 w-3" /> Inativo
                              </span>
                            )}
                            {product.is_featured && (
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-warning/10 text-warning">Destaque</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm text-muted-foreground capitalize">{product.marketplace || 'manual'}</span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-end gap-2">
                            {product.affiliate_link && (
                              <a href={product.affiliate_link} target="_blank" rel="noopener noreferrer" className="p-2 text-muted-foreground hover:text-primary transition-colors">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                            <button onClick={() => handleOpenDialog(product)} className="p-2 text-muted-foreground hover:text-primary transition-colors">
                              <Edit className="h-4 w-4" />
                            </button>
                            <button onClick={() => handleDelete(product)} className="p-2 text-muted-foreground hover:text-destructive transition-colors">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredProducts.map((product) => (
                <div key={product.id} className="bg-card rounded-xl border border-border overflow-hidden">
                  <div className="aspect-square bg-secondary relative">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                        <Package className="h-12 w-12" />
                      </div>
                    )}
                    {!product.is_active && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <span className="text-white font-medium">Inativo</span>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-medium text-foreground line-clamp-1">{product.name}</h3>
                    <p className="text-lg font-bold text-primary mt-1">{formatPrice(product.price)}</p>
                    <div className="flex items-center gap-2 mt-4">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => handleOpenDialog(product)}>
                        <Edit className="h-4 w-4 mr-1" /> Editar
                      </Button>
                      <Button variant="outline" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(product)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Product Form Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? 'Editar Produto' : 'Novo Produto'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="rounded-xl border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Dica rápida</p>
              <ul className="mt-2 list-disc pl-4 space-y-1 text-xs">
                <li>Para importação automática, use o link do produto que mostre o código <strong>MLB123...</strong> na URL.</li>
                <li>Links encurtados <strong>/sec/</strong> não trazem o ID: copie o ID completo e cole no campo ao lado.</li>
                <li>O ID deve começar com <strong>MLB</strong> e ter pelo menos 10 dígitos numéricos.</li>
              </ul>
            </div>

            {/* Basic Info */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Nome do Produto *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Whey Protein Isolado 900g"
                  required
                />
              </div>

              <div>
                <Label htmlFor="short_description">Descrição Curta</Label>
                <Input
                  id="short_description"
                  value={formData.short_description}
                  onChange={(e) => setFormData(prev => ({ ...prev, short_description: e.target.value }))}
                  placeholder="Uma linha sobre o produto"
                />
              </div>

              <div>
                <Label htmlFor="description">Descrição Completa</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Descrição detalhada do produto..."
                  rows={4}
                />
              </div>
            </div>

            {/* Pricing */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="price">Preço *</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price}
                  onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                  placeholder="99.90"
                  required
                />
              </div>
              <div>
                <Label htmlFor="original_price">Preço Original</Label>
                <Input
                  id="original_price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.original_price}
                  onChange={(e) => setFormData(prev => ({ ...prev, original_price: e.target.value }))}
                  placeholder="149.90"
                />
              </div>
              <div>
                <Label htmlFor="discount_percentage">Desconto %</Label>
                <Input
                  id="discount_percentage"
                  type="number"
                  min="0"
                  max="100"
                  value={formData.discount_percentage}
                  onChange={(e) => setFormData(prev => ({ ...prev, discount_percentage: e.target.value }))}
                  placeholder="20"
                />
              </div>
            </div>

            {/* Image & Category */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="image_url">URL da Imagem</Label>
                <Input
                  id="image_url"
                  type="url"
                  value={formData.image_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, image_url: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
              <div>
                <Label>Categoria</Label>
                <Select
                  value={formData.category_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, category_id: value }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Fonte (link do produto) */}
            <div>
              <Label htmlFor="source_url">
                Link do Produto (fonte)
                <span className="text-xs text-muted-foreground ml-2">
                  (use o link completo do ML/Amazon para importar dados)
                </span>
              </Label>
              <Input
                id="source_url"
                type="url"
                value={formData.source_url}
                onChange={(e) => handleSourceUrlChange(e.target.value)}
                placeholder="https://produto.mercadolivre.com.br/.../MLB1234567890"
              />
            </div>

            {/* Affiliate Link */}
            <div>
              <Label htmlFor="affiliate_link">
                Link de Afiliado
                <span className="text-xs text-muted-foreground ml-2">
                  (Amazon, Mercado Livre - incluindo links /sec/)
                </span>
              </Label>
              <Input
                id="affiliate_link"
                type="url"
                value={formData.affiliate_link}
                onChange={(e) => handleAffiliateLinkChange(e.target.value)}
                placeholder="https://mercadolivre.com/sec/xxxxx"
                className={affiliateLinkError ? 'border-destructive' : ''}
              />
              {affiliateLinkError ? (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {affiliateLinkError}
                </p>
              ) : formData.affiliate_link && !affiliateLinkError && (
                <p className="text-xs text-success mt-1 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Link válido! Marketplace: {detectMarketplace(formData.affiliate_link)}
                </p>
              )}
            </div>

            {/* External ID manual */}
            <div>
              <Label htmlFor="external_id">
                ID do Marketplace (ex: MLB1234567890)
                <span className="text-xs text-muted-foreground ml-2">(use se o link não tiver o MLB)</span>
              </Label>
              <Input
                id="external_id"
                value={formData.external_id}
                onChange={(e) => handleExternalIdChange(e.target.value)}
                placeholder="MLB1234567890"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[11px] text-muted-foreground">
                  ID Mercado Livre: <span className="font-medium">{formData.external_id || '-'}</span>
                </p>
                {isAutoFetching && (
                  <p className="text-[11px] text-muted-foreground animate-pulse">Importando dados...</p>
                )}
              </div>
              {externalIdError && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {externalIdError}
                </p>
              )}
              {!externalIdError && formData.external_id && formData.external_id === lastFetchedExternalId && (
                <p className="text-[11px] text-success mt-1 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  ID validado e dados importados.
                </p>
              )}
              {detectMarketplace(formData.source_url) === 'mercadolivre' && formData.external_id === '' && formData.source_url && (
                <p className="text-[11px] text-warning mt-1">
                  Link sem ID MLB. Sem ele o robô não sincroniza preço/imagem.
                </p>
              )}
            </div>

            {/* Advantages */}
            <div>
              <Label htmlFor="advantages">Vantagens (uma por linha)</Label>
              <Textarea
                id="advantages"
                value={formData.advantages}
                onChange={(e) => setFormData(prev => ({ ...prev, advantages: e.target.value }))}
                placeholder="Alta concentração de proteína&#10;Zero açúcar"
                rows={3}
              />
            </div>

            {/* Toggles */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                <Label htmlFor="is_active" className="cursor-pointer">Produto Ativo</Label>
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                />
              </div>
              <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                <Label htmlFor="is_featured" className="cursor-pointer">Em Destaque</Label>
                <Switch
                  id="is_featured"
                  checked={formData.is_featured}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_featured: checked }))}
                />
              </div>
              <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                <Label htmlFor="is_on_sale" className="cursor-pointer">Em Promoção</Label>
                <Switch
                  id="is_on_sale"
                  checked={formData.is_on_sale}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_on_sale: checked }))}
                />
              </div>
              <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                <Label htmlFor="free_shipping" className="cursor-pointer">Frete Grátis</Label>
                <Switch
                  id="free_shipping"
                  checked={formData.free_shipping}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, free_shipping: checked }))}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                className="btn-energy"
                disabled={productMutation.isPending || isAutoFetching || !canSubmit}
              >
                <Save className="h-4 w-4 mr-2" />
                {productMutation.isPending ? 'Salvando...' : 'Salvar Produto'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}




