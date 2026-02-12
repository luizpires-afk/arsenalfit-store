import { useState, useEffect, useMemo } from "react";
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
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingDown,
  Mail,
  Activity,
  Timer,
} from "lucide-react";

// Imports de Componentes
import { Layout } from "@/Components/layout/Layout";
import { Button } from "@/Components/ui/button";
import { Input } from "@/Components/ui/input";
import { Label } from "@/Components/ui/label";
import { Textarea } from "@/Components/ui/textarea";
import { Switch } from "@/Components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/Components/ui/tabs";
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

// Hooks e UtilitÃ¡rios
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import type { Product, Category } from "@/types/database";

import {
  isValidAffiliateLink,
  detectMarketplace,
  generateSlug,
  formatPrice,
  extractMercadoLivreId,
} from "@/lib/validators";

import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const isClothingCategory = (name?: string | null, slug?: string | null) => {
  const target = `${name || ""} ${slug || ""}`.toLowerCase();
  return target.includes("roupa") || target.includes("vestu");
};

const CLOTHING_OPTIONS = [
  {
    value: "masculino",
    label: "Masculino",
    description: "Treino, casual e performance.",
    image:
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=1200",
  },
  {
    value: "feminino",
    label: "Feminino",
    description: "Conforto, estilo e mobilidade.",
    image:
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1200",
  },
];

// Tipagem do FormulÃ¡rio
interface ProductFormData {
  name: string;
  description: string;
  short_description: string;
  price: string;
  pix_price: string;
  original_price: string;
  discount_percentage: string;
  image_url: string;
  source_url: string;
  affiliate_link: string;
  external_id: string;
  category_id: string;
  gender: string;
  is_featured: boolean;
  is_active: boolean;
  is_on_sale: boolean;
  free_shipping: boolean;
  advantages: string;
}

interface AuthEmailLog {
  id: string;
  email: string | null;
  user_id: string | null;
  type: string;
  status: string;
  message: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}
interface PriceSyncChange {
  id: string;
  created_at: string;
  product_id: string;
  marketplace: string | null;
  external_id: string | null;
  old_price: number | null;
  new_price: number;
  discount_percentage: number | null;
  is_on_sale: boolean | null;
  source: string | null;
  product?: {
    id: string;
    name: string;
    slug: string;
    image_url: string | null;
  } | null;
}

interface PriceSyncReport {
  id: string;
  sent_at: string;
  recipients: string[];
  total: number;
  drops: number;
  increases: number;
  promos: number;
  status: string;
  error?: string | null;
}

interface PriceSyncAnomaly {
  id: string;
  detected_at: string;
  product_id: string;
  marketplace: string | null;
  external_id: string | null;
  catalog_id: string | null;
  preferred_item_id: string | null;
  source_url: string | null;
  affiliate_link: string | null;
  price_from_catalog: number | null;
  price_from_item: number | null;
  note: string | null;
  product?: {
    id: string;
    name: string;
    slug: string;
    image_url: string | null;
  } | null;
}

const initialFormData: ProductFormData = {
  name: '',
  description: '',
  short_description: '',
  price: '',
  pix_price: '',
  original_price: '',
  discount_percentage: '0',
  image_url: '',
  source_url: '',
  affiliate_link: '',
  external_id: '',
  category_id: '',
  gender: '',
  is_featured: false,
  is_active: true,
  is_on_sale: false,
  free_shipping: false,
  advantages: '',
};

export default function Admin() {
  const { user, session, isAdmin, loading: authLoading } = useAuth();
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
  const [changesWindow, setChangesWindow] = useState<'24h' | '7d' | '30d'>('24h');
  const [anomaliesWindow, setAnomaliesWindow] = useState<'24h' | '7d' | '30d'>('7d');
  const [productTab, setProductTab] = useState<'all' | 'valid' | 'blocked'>('all');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncAlertShown, setSyncAlertShown] = useState(false);

  // Redirecionamento de seguranÃ§a
  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      toast.error('Acesso negado', {
        description: 'VocÃª nÃ£o tem permissÃ£o para acessar esta pÃ¡gina.',
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

  const filteredCategories = useMemo(() => {
    return categories.filter((category) => {
      const name = (category.name || '').toLowerCase();
      const slug = (category.slug || '').toLowerCase();
      return !name.includes('vitamin') && !slug.includes('vitamin');
    });
  }, [categories]);
  const selectedCategory = useMemo(() => {
    return categories.find((category) => category.id === formData.category_id) || null;
  }, [categories, formData.category_id]);

  const isRoupasSelected = useMemo(
    () => isClothingCategory(selectedCategory?.name, selectedCategory?.slug),
    [selectedCategory],
  );

  const genderMissing = isRoupasSelected && !formData.gender;

  useEffect(() => {
    if (!isRoupasSelected && formData.gender) {
      setFormData((prev) => ({ ...prev, gender: '' }));
    }
  }, [isRoupasSelected, formData.gender]);

  const canSubmit = Boolean(
    formData.name.trim() &&
    formData.price !== '' &&
    !affiliateLinkError &&
    !externalIdError &&
    !isAutoFetching &&
    !genderMissing
  );

  useEffect(() => {
    if (!isAdmin) return;
    if (categories.length === 0) return;

    const hasRoupas = categories.some((category) => {
      const name = (category.name || '').toLowerCase();
      const slug = (category.slug || '').toLowerCase();
      return name.includes('roupa') || name.includes('vestu') || slug.includes('roupa');
    });

    if (hasRoupas) return;

    const ensureRoupas = async () => {
      const { error } = await supabase.from('categories').insert([
        {
          name: 'Roupas',
          slug: 'roupas',
          image_url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=1200',
        },
      ]);

      if (!error) {
        queryClient.invalidateQueries({ queryKey: ['categories'] });
      }
    };

    ensureRoupas();
  }, [isAdmin, categories, queryClient]);

  const changesSince = useMemo(() => {
    const now = new Date();
    const since = new Date(now);
    if (changesWindow === '24h') since.setHours(now.getHours() - 24);
    if (changesWindow === '7d') since.setDate(now.getDate() - 7);
    if (changesWindow === '30d') since.setDate(now.getDate() - 30);
    return since.toISOString();
  }, [changesWindow]);

  const anomaliesSince = useMemo(() => {
    const now = new Date();
    const since = new Date(now);
    if (anomaliesWindow === '24h') since.setHours(now.getHours() - 24);
    if (anomaliesWindow === '7d') since.setDate(now.getDate() - 7);
    if (anomaliesWindow === '30d') since.setDate(now.getDate() - 30);
    return since.toISOString();
  }, [anomaliesWindow]);

  const { data: priceChanges = [], isLoading: loadingPriceChanges } = useQuery({
    queryKey: ['price-sync-changes', changesWindow],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('price_sync_changes')
        .select('id, created_at, product_id, marketplace, external_id, old_price, new_price, discount_percentage, is_on_sale, source, product:products(id, name, slug, image_url)')
        .gte('created_at', changesSince)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data as unknown as PriceSyncChange[]) || [];
    },
    enabled: !!isAdmin,
  });

  const { data: reports = [], isLoading: loadingReports } = useQuery({
    queryKey: ['price-sync-reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('price_sync_reports')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(6);

      if (error) throw error;
      return (data as unknown as PriceSyncReport[]) || [];
    },
    enabled: !!isAdmin,
  });

  const { data: emailLogs = [], isLoading: loadingEmailLogs } = useQuery({
    queryKey: ['auth-email-logs'],
    queryFn: async () => {
      const response = await fetch('/api/auth/get-logs?limit=50', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });
      if (!response.ok) {
        throw new Error('Falha ao carregar logs');
      }
      const payload = await response.json();
      return (payload?.logs as AuthEmailLog[]) || [];
    },
    enabled: !!isAdmin && !!session?.access_token,
  });

  const { data: syncRuns = [] } = useQuery({
    queryKey: ['price-sync-runs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('price_sync_runs')
        .select('id, started_at, finished_at, status, total_verificados, total_produtos, note')
        .order('started_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return data || [];
    },
    enabled: !!isAdmin,
  });

  const { data: anomalies = [], isLoading: loadingAnomalies } = useQuery({
    queryKey: ['price-sync-anomalies', anomaliesWindow],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('price_sync_anomalies')
        .select('id, detected_at, product_id, marketplace, external_id, catalog_id, preferred_item_id, source_url, affiliate_link, price_from_catalog, price_from_item, note, product:products(id, name, slug, image_url)')
        .gte('detected_at', anomaliesSince)
        .order('detected_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data as unknown as PriceSyncAnomaly[]) || [];
    },
    enabled: !!isAdmin,
  });

  const blockedNotes = useMemo(
    () => new Set(['policy_blocked', 'catalog_lookup_failed', 'preferred_item_missing_in_catalog']),
    [],
  );

  const blockedAnomalies = useMemo(
    () => anomalies.filter((row) => blockedNotes.has(row.note || '')),
    [anomalies, blockedNotes],
  );

  const blockedAnomalyIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of blockedAnomalies) {
      if (row.product_id) ids.add(row.product_id);
    }
    return ids;
  }, [blockedAnomalies]);

  const blockedProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const product of products) {
      if (product.auto_disabled_reason === 'blocked') ids.add(product.id);
    }
    return ids;
  }, [products]);

  const anomalyStats = useMemo(() => {
    const total = anomalies.length;
    const blocked = blockedProductIds.size;
    const catalogFallback = anomalies.filter((row) => row.note === 'catalog_fallback').length;
    return { total, blocked, catalogFallback };
  }, [anomalies, blockedProductIds]);

  const priceChangeStats = useMemo(() => {
    const total = priceChanges.length;
    const promos = priceChanges.filter(change => change.is_on_sale).length;
    const reductions = priceChanges.filter(
      change => change.old_price !== null && change.new_price < change.old_price
    ).length;
    const increases = priceChanges.filter(
      change => change.old_price !== null && change.new_price > change.old_price
    ).length;
    return { total, promos, reductions, increases };
  }, [priceChanges]);

  const automationStats = useMemo(() => {
    const now = Date.now();
    const mlProducts = products.filter(
      product => String(product.marketplace || '').toLowerCase().includes('mercado')
    );
    const monitored = mlProducts.length;
    const promos = mlProducts.filter(product => product.is_on_sale).length;
    const lastSync = mlProducts.reduce<string | null>((latest, product) => {
      if (!product.last_sync) return latest;
      if (!latest) return product.last_sync;
      return new Date(product.last_sync).getTime() > new Date(latest).getTime()
        ? product.last_sync
        : latest;
    }, null);
    const nextCheck = mlProducts.reduce<string | null>((earliest, product) => {
      const next = product.next_check_at;
      if (!next) return earliest;
      if (!earliest) return next;
      return new Date(next).getTime() < new Date(earliest).getTime() ? next : earliest;
    }, null);
    const recentDrops = mlProducts.filter(product => {
      const prev = product.previous_price;
      const detectedAt = product.detected_at;
      if (!prev || prev <= product.price || !detectedAt) return false;
      return now - new Date(detectedAt).getTime() <= 24 * 60 * 60 * 1000;
    }).length;

    const overdueCount = mlProducts.filter(product => {
      if (!product.next_check_at) return false;
      if (product.auto_disabled_reason === 'blocked') return false;
      if (product.status === 'paused') return false;
      if (product.is_active === false) return false;
      return new Date(product.next_check_at).getTime() <= now;
    }).length;

    return { monitored, promos, lastSync, nextCheck, recentDrops, overdueCount };
  }, [products]);

  const latestSyncRun = syncRuns[0] ?? null;
  const latestRunStatus = latestSyncRun?.status ?? null;
  const SYNC_INTERVAL_HOURS = 6;
  const SYNC_GRACE_MINUTES = 20;
  const syncIntervalMs = SYNC_INTERVAL_HOURS * 60 * 60 * 1000;
  const syncGraceMs = SYNC_GRACE_MINUTES * 60 * 1000;
  const lastSyncCandidate =
    latestSyncRun?.finished_at ?? latestSyncRun?.started_at ?? automationStats.lastSync ?? null;
  const lastSyncMs = lastSyncCandidate ? new Date(lastSyncCandidate).getTime() : null;
  const lastSyncSource = latestSyncRun ? "ExecuÃ§Ã£o do robÃ´" : "AtualizaÃ§Ã£o dos produtos";
  const nowMs = Date.now();
  const lastCronMs = Math.floor(nowMs / syncIntervalMs) * syncIntervalMs;
  const nextCronMs = lastCronMs + syncIntervalMs;
  const expectedNextSyncMs = nextCronMs;
  const nextCheckMs = automationStats.nextCheck
    ? new Date(automationStats.nextCheck).getTime()
    : null;
  const nextCheckEffectiveMs = expectedNextSyncMs ?? nextCheckMs;
  const nextCheckEffective = nextCheckEffectiveMs
    ? new Date(nextCheckEffectiveMs).toISOString()
    : null;
  const nextProductDueMs = nextCheckMs;
  const syncAgeMs = lastSyncMs ? Date.now() - lastSyncMs : null;
  const showNextProductDue =
    nextProductDueMs !== null &&
    nextCheckEffectiveMs !== null &&
    Math.abs(nextProductDueMs - nextCheckEffectiveMs) > 5 * 60 * 1000;
  const isSyncMissing = automationStats.monitored > 0 && !lastSyncCandidate;
  const isSyncFailed = latestRunStatus === "failed";
  const isSyncStale =
    isSyncMissing ||
    isSyncFailed ||
    (automationStats.overdueCount > 0 &&
      nowMs > lastCronMs + syncGraceMs &&
      (!lastSyncMs || lastSyncMs < lastCronMs));
  const formatAge = (ms?: number | null) => {
    if (!ms && ms !== 0) return "Sem dados";
    if (ms < 60 * 1000) return "Agora";
    if (ms < 60 * 60 * 1000) return `${Math.floor(ms / (60 * 1000))}m atrÃ¡s`;
    const hours = Math.floor(ms / (60 * 60 * 1000));
    return `${hours}h atrÃ¡s`;
  };
  const syncAgeLabel = isSyncMissing
    ? "Sem sync registrado"
    : latestRunStatus === "empty" && automationStats.overdueCount === 0
      ? "Sem itens vencidos"
      : formatAge(syncAgeMs);
  const syncScheduleNote = `Ciclo de ${SYNC_INTERVAL_HOURS}h (UTC)`;

  const [autoSyncAttemptAt, setAutoSyncAttemptAt] = useState<number | null>(null);

  const productHealthStats = useMemo(() => {
    const mlProducts = products.filter(
      product => String(product.marketplace || '').toLowerCase().includes('mercado')
    );
    let ok = 0;
    let blocked = 0;
    let pending = 0;
    let pixManual = 0;
    let pixAuto = 0;
    let pixUnknown = 0;

    for (const product of mlProducts) {
      const isBlocked = blockedProductIds.has(product.id);
      const hasSync = Boolean(product.last_sync);

      if (isBlocked) {
        blocked += 1;
      } else if (hasSync) {
        ok += 1;
      } else {
        pending += 1;
      }

      if (typeof product.pix_price === 'number' && product.pix_price > 0) {
        const source = product.pix_price_source ?? null;
        if (source === 'manual') {
          pixManual += 1;
        } else if (source === 'api' || source === 'scraper') {
          pixAuto += 1;
        } else {
          pixUnknown += 1;
        }
      }
    }

    return {
      total: mlProducts.length,
      ok,
      blocked,
      pending,
      pixManual,
      pixAuto,
      pixUnknown,
    };
  }, [products, blockedProductIds]);

  // Mutation: Criar/Atualizar Produto
  const productMutation = useMutation({
    mutationFn: async (data: ProductFormData & { id?: string }) => {
      const slug = generateSlug(data.name);
      const marketplace = detectMarketplace(data.source_url || data.affiliate_link);
      
      // SanitizaÃ§Ã£o dos dados numÃ©ricos
      const numericPrice = parseFloat(data.price) || 0;
      const numericPixPrice = data.pix_price ? parseFloat(data.pix_price) : null;
      const numericOriginalPrice = data.original_price ? parseFloat(data.original_price) : null;
      const numericDiscount = parseInt(data.discount_percentage) || 0;
      const nowIso = new Date().toISOString();
      const existingPix =
        typeof editingProduct?.pix_price === 'number' ? editingProduct.pix_price : null;
      const nextPix =
        typeof numericPixPrice === 'number' && !Number.isNaN(numericPixPrice)
          ? numericPixPrice
          : null;
      const pixChanged = data.id ? nextPix !== existingPix : nextPix !== null;

      const selectedCategory = categories.find(
        (category) => category.id === data.category_id,
      );
      const isRoupasSelected = isClothingCategory(
        selectedCategory?.name,
        selectedCategory?.slug,
      );
      const genderValue = isRoupasSelected ? data.gender || null : null;
      const productData = {
        name: data.name,
        slug: data.id ? undefined : slug, // NÃ£o atualiza slug na ediÃ§Ã£o para manter SEO
        description: data.description || null,
        short_description: data.short_description || null,
        price: numericPrice,
        pix_price: numericPixPrice,
        original_price: numericOriginalPrice,
        discount_percentage: numericDiscount,
        image_url: data.image_url || null,
        source_url: data.source_url || null,
        affiliate_link: data.affiliate_link || null,
        external_id: data.external_id || null,
        category_id: data.category_id || null,
        gender: genderValue,
        is_featured: data.is_featured,
        is_active: data.is_active,
        is_on_sale: data.is_on_sale,
        free_shipping: data.free_shipping,
        marketplace,
        advantages: data.advantages ? data.advantages.split('\n').filter(a => a.trim()) : [],
        ...(pixChanged
          ? {
              pix_price_source: nextPix !== null ? 'manual' : null,
              pix_price_checked_at: nextPix !== null ? nowIso : null,
            }
          : {}),
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
          .insert({ ...productData, slug, next_check_at: new Date().toISOString() });
        
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
      toast.success('Produto excluÃ­do!');
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
        pix_price: product.pix_price?.toString() || '',
        original_price: product.original_price?.toString() || '',
        discount_percentage: product.discount_percentage?.toString() || '0',
        image_url: product.image_url || '',
        source_url: (product as any).source_url || '',
        affiliate_link: product.affiliate_link || '',
        external_id: product.external_id || '',
        category_id: product.category_id || '',
        gender: (product as any).gender || '',
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

  const normalizeExternalId = (value: string) => {
    const upper = value.toUpperCase().replace(/\s+/g, '');
    if (upper.startsWith('MLB')) return upper.replace(/[^A-Z0-9]/g, '');
    const onlyDigits = upper.replace(/[^0-9]/g, '');
    return onlyDigits ? `MLB${onlyDigits}` : '';
  };

  const isValidMlbId = (value?: string | null) => {
    if (!value) return false;
    return /^MLB\d{8,}$/.test(value);
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
          ? 'ID nÃ£o encontrado no Mercado Livre. Copie o cÃ³digo MLB direto da URL do produto.'
          : 'NÃ£o foi possÃ­vel consultar o Mercado Livre.';
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
        // silencioso: descriÃ§Ã£o Ã© opcional
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
        setAffiliateLinkError(validation.error || 'Link invÃ¡lido');
        return;
      }
      setAffiliateLinkError(null);

      if (validation.marketplace === 'mercadolivre') {
        const mlbId = extractMercadoLivreId(value);
        if (mlbId) {
          setFormData(prev => ({ ...prev, external_id: mlbId, marketplace: 'mercadolivre' }));
          setExternalIdError(null);
        } else if (value !== lastNoIdLink && value.length > 20) {
          setLastNoIdLink(value);
          if (!isValidMlbId(formData.external_id)) {
            setExternalIdError('Link sem MLB. Abra o produto completo e copie o codigo MLB da URL.');
          } else {
            setExternalIdError(null);
          }
        }
      } else if (validation.marketplace) {
        setFormData(prev => ({ ...prev, marketplace: validation.marketplace! }));
      }
    } else {
      setAffiliateLinkError(null);
    }
  };

  const handleSourceUrlChange = (value: string) => {
    const marketplace = detectMarketplace(value);
    setFormData(prev => ({ ...prev, source_url: value, marketplace }));
    setExternalIdError(null);

    if (!value.trim()) {
      return;
    }

    if (marketplace === 'mercadolivre') {
      const mlbId = extractMercadoLivreId(value);
      if (mlbId) {
        setFormData(prev => ({ ...prev, external_id: mlbId }));
        setExternalIdError(null);
        // Para evitar bloqueio/403 no front, deixamos a importaÃ§Ã£o para o robÃ´ (edge function).
        // autoFillFromMercadoLivre(mlbId);
      } else if (value !== lastNoIdLink && value.length > 20) {
        setLastNoIdLink(value);
        if (!isValidMlbId(formData.external_id)) {
          setExternalIdError('Link sem MLB. Abra o produto completo e copie o codigo MLB da URL.');
        } else {
          setExternalIdError(null);
        }
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
    // Para evitar bloqueios no front, deixamos a importaÃ§Ã£o para o robÃ´ server-side.
    // if (normalized !== lastFetchedExternalId) {
    //   autoFillFromMercadoLivre(normalized);
    // }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.affiliate_link.trim()) {
      const validation = isValidAffiliateLink(formData.affiliate_link);
      if (!validation.valid) {
        setAffiliateLinkError(validation.error || 'Link invÃ¡lido');
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

  const handleSyncNow = () => {
    console.warn("DEPRECATED: HTML scraping disabled");
    toast.error("DEPRECATED: HTML scraping disabled");
  };

  const handleForceSync = async () => {
    setIsSyncing(true);
    try {
      const { error } = await supabase
        .from('products')
        .update({ next_check_at: new Date().toISOString() })
        .eq('marketplace', 'mercadolivre')
        .neq('status', 'paused');

      if (error) throw error;
      toast.success('SincronizaÃ§Ã£o agendada para os produtos ativos.');
    } catch (error: any) {
      toast.error('Falha ao agendar sincronizaÃ§Ã£o', {
        description: error.message,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const AUTO_SYNC_RETRY_MS = 30 * 60 * 1000;
    if (!isSyncStale || isSyncing) {
      if (!isSyncStale && autoSyncAttemptAt !== null) {
        setAutoSyncAttemptAt(null);
      }
      return;
    }
    const now = Date.now();
    if (autoSyncAttemptAt && now - autoSyncAttemptAt < AUTO_SYNC_RETRY_MS) return;
    setAutoSyncAttemptAt(now);
    handleForceSync();
  }, [isSyncStale, isSyncing, autoSyncAttemptAt]);

  useEffect(() => {
    if (isSyncStale && !syncAlertShown) {
      setSyncAlertShown(true);
      toast.error('Sync atrasado', {
        description: 'Detectamos atraso e reagendamos automaticamente.',
      });
    }
    if (!isSyncStale && syncAlertShown) {
      setSyncAlertShown(false);
    }
  }, [isSyncStale, syncAlertShown]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!blockedAnomalyIds.size) return;
    const blockedActiveIds = products
      .filter(
        (product) =>
          blockedAnomalyIds.has(product.id) &&
          product.is_active &&
          product.auto_disabled_reason !== 'blocked',
      )
      .map((product) => product.id);
    if (!blockedActiveIds.length) return;

    const deactivate = async () => {
      try {
        const { error } = await supabase
          .from('products')
          .update({
            is_active: false,
            auto_disabled_reason: 'blocked',
            auto_disabled_at: new Date().toISOString(),
          })
          .in('id', blockedActiveIds);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ['admin-products'] });
        toast.success('Produtos bloqueados foram desativados automaticamente.');
      } catch (error: any) {
        toast.error('Falha ao desativar bloqueados', { description: error.message });
      }
    };

    deactivate();
  }, [isAdmin, blockedAnomalyIds, products, queryClient]);

  const handleCopyBlockedLinks = async () => {
    const links = Array.from(
      new Set(
        blockedAnomalies
          .map((row) => row.source_url || row.affiliate_link)
          .filter((url): url is string => Boolean(url)),
      ),
    );

    if (!links.length) {
      toast.error('Nenhum link bloqueado encontrado.');
      return;
    }

    const content = links.join('\n');
    try {
      await navigator.clipboard.writeText(content);
      toast.success('Links bloqueados copiados.');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = content;
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand('copy');
        toast.success('Links bloqueados copiados.');
      } catch (error: any) {
        toast.error('Falha ao copiar links', { description: error.message });
      } finally {
        document.body.removeChild(textarea);
      }
    }
  };

  const handleDeactivateBlocked = async () => {
    if (!blockedProductIds.size) {
      toast.error('Nenhum produto bloqueado encontrado.');
      return;
    }

    if (!confirm('Deseja desativar todos os produtos bloqueados?')) return;

    try {
      const { error } = await supabase
        .from('products')
        .update({
          is_active: false,
          auto_disabled_reason: 'blocked',
          auto_disabled_at: new Date().toISOString(),
        })
        .in('id', Array.from(blockedProductIds));
      if (error) throw error;
      toast.success('Produtos bloqueados desativados.');
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    } catch (error: any) {
      toast.error('Falha ao desativar produtos', { description: error.message });
    }
  };

  const getSourceLabel = (source?: string | null) => {
    if (source === 'catalog') return 'CatÃ¡logo';
    if (source === 'public') return 'PÃºblico';
    if (source === 'auth') return 'Autenticado';
    if (source === 'scraper') return 'Scraper';
    return 'N/D';
  };

  const getSourceBadgeClass = (source?: string | null) => {
    if (source === 'catalog') return 'bg-primary/10 text-primary';
    if (source === 'public') return 'bg-warning/10 text-warning';
    if (source === 'auth') return 'bg-success/10 text-success';
    if (source === 'scraper') return 'bg-cyan-500/10 text-cyan-600';
    return 'bg-muted text-muted-foreground';
  };

  const getPixSourceLabel = (source?: string | null) => {
    if (source === 'manual') return 'Manual';
    if (source === 'api') return 'API';
    if (source === 'scraper') return 'Scraper';
    return null;
  };

  const getPixSourceClass = (source?: string | null) => {
    if (source === 'manual') return 'bg-muted text-muted-foreground';
    if (source === 'api') return 'bg-success/10 text-success';
    if (source === 'scraper') return 'bg-warning/10 text-warning';
    return 'bg-muted text-muted-foreground';
  };

  const getAnomalyLabel = (note?: string | null) => {
    if (note === 'policy_blocked') return 'API bloqueou o anÃºncio';
    if (note === 'catalog_lookup_failed') return 'CatÃ¡logo indisponÃ­vel';
    if (note === 'preferred_item_missing_in_catalog') return 'Item nÃ£o estÃ¡ no catÃ¡logo';
    if (note === 'catalog_fallback') return 'PreÃ§o veio do catÃ¡logo';
    return 'DivergÃªncia';
  };

  
  const getEmailStatusLabel = (status?: string | null) => {
    if (!status) return 'Indefinido';
    if (status === 'sent') return 'Enviado';
    if (status === 'consumed') return 'Consumido';
    if (status === 'password_reset') return 'Senha resetada';
    if (status === 'already_confirmed') return 'Já confirmado';
    if (status === 'rate_limited') return 'Rate limit';
    if (status === 'user_not_found') return 'Sem conta';
    if (status === 'error') return 'Erro';
    return status;
  };

  const getEmailStatusClass = (status?: string | null) => {
    if (status === 'sent' || status === 'consumed' || status === 'password_reset' || status === 'already_confirmed') {
      return 'bg-success/10 text-success';
    }
    if (status === 'rate_limited') return 'bg-warning/10 text-warning';
    if (status === 'error') return 'bg-destructive/10 text-destructive';
    return 'bg-muted text-muted-foreground';
  };

  const getEmailStatusDotClass = (status?: string | null) => {
    if (status === 'sent' || status === 'consumed' || status === 'password_reset' || status === 'already_confirmed') {
      return 'bg-success';
    }
    if (status === 'rate_limited') return 'bg-warning';
    if (status === 'error') return 'bg-destructive';
    return 'bg-muted-foreground';
  };

  const getEmailTypeLabel = (type?: string | null) => {
    if (type === 'signup') return 'Verificacao';
    if (type === 'recovery') return 'Recuperacao';
    return type || 'Outro';
  };

  const getEmailTypeClass = (type?: string | null) => {
    if (type === 'signup') return 'bg-primary/10 text-primary';
    if (type === 'recovery') return 'bg-secondary text-secondary-foreground';
    return 'bg-muted text-muted-foreground';
  };
  const formatDateTime = (value?: string | null) => {
    if (!value) return '-';
    return new Date(value).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    });
  };

  const filteredAllProducts = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return products.filter(product =>
      product.name.toLowerCase().includes(query) ||
      (product.description || '').toLowerCase().includes(query)
    );
  }, [products, searchQuery]);

  const filteredValidProducts = useMemo(
    () =>
      filteredAllProducts.filter(
        product =>
          String(product.marketplace || '').toLowerCase().includes('mercado') &&
          !blockedProductIds.has(product.id) &&
          Boolean(product.last_sync),
      ),
    [filteredAllProducts, blockedProductIds],
  );

  const filteredBlockedProducts = useMemo(
    () =>
      filteredAllProducts.filter(
        product =>
          String(product.marketplace || '').toLowerCase().includes('mercado') &&
          blockedProductIds.has(product.id),
      ),
    [filteredAllProducts, blockedProductIds],
  );

  const activeProductsList =
    productTab === 'blocked'
      ? filteredBlockedProducts
      : productTab === 'valid'
        ? filteredValidProducts
        : filteredAllProducts;

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
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Painel Admin</h1>
              <p className="text-muted-foreground">Gerencie seus produtos</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={handleSyncNow} disabled>
                SincronizaÃ§Ã£o desativada
              </Button>
              <Button variant="outline" onClick={() => navigate('/admin/price-sync')}>
                RelatÃ³rio do robÃ´
              </Button>
              <Button variant="secondary" onClick={() => navigate('/admin/price-adjustments')}>
                Ajustes de preÃ§o
              </Button>
              <Button onClick={() => handleOpenDialog()} className="btn-energy">
                <Plus className="h-4 w-4 mr-2" />
                Novo Produto
              </Button>
            </div>
          </div>

          {/* AutomaÃ§Ã£o do RobÃ´ */}
          <div className="bg-card rounded-xl p-6 mb-6 border border-border">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-semibold text-foreground">AutomaÃ§Ã£o do RobÃ´</h2>
                <p className="text-sm text-muted-foreground">
                  Monitoramento contÃ­nuo de preÃ§os e relatÃ³rios diÃ¡rios.
                </p>
                {isSyncStale && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    {isSyncFailed
                      ? "Falha no Ãºltimo sync. Reagendamos automaticamente."
                      : "Sync atrasado. Reagendamos automaticamente."}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={handleForceSync} disabled={isSyncing}>
                  {isSyncing ? 'Agendando...' : 'Agendar Sync Agora'}
                </Button>
                <Button variant="outline" onClick={() => navigate('/admin/price-sync')}>
                  Ver relatÃ³rio completo
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
              <div className="p-4 rounded-lg border border-border bg-secondary/30">
                <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
                  <Activity className="h-4 w-4" /> Monitorados
                </div>
                <p className="mt-2 text-2xl font-bold">{automationStats.monitored}</p>
              </div>
              <div className="p-4 rounded-lg border border-border bg-secondary/30">
                <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
                  <TrendingDown className="h-4 w-4" /> Quedas 24h
                </div>
                <p className="mt-2 text-2xl font-bold text-success">{automationStats.recentDrops}</p>
              </div>
              <div className="p-4 rounded-lg border border-border bg-secondary/30">
                <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
                  <Activity className="h-4 w-4" /> PromoÃ§Ãµes
                </div>
                <p className="mt-2 text-2xl font-bold text-primary">{automationStats.promos}</p>
              </div>
              <div
                className={`p-4 rounded-lg border ${
                  isSyncStale ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-secondary/30'
                }`}
              >
                <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
                  <Clock className="h-4 w-4" /> Ãltimo sync
                </div>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {formatDateTime(lastSyncCandidate)}
                </p>
                <p className={`mt-1 text-xs ${isSyncStale ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {syncAgeLabel}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">HorÃ¡rio local</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Fonte: {lastSyncSource}</p>
                {isSyncStale && (
                  <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {isSyncFailed ? "Falha no sync" : "Sync atrasado"}
                  </div>
                )}
              </div>
              <div className="p-4 rounded-lg border border-border bg-secondary/30">
                <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
                  <Timer className="h-4 w-4" /> PrÃ³xima checagem
                </div>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {formatDateTime(nextCheckEffective || automationStats.nextCheck)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">HorÃ¡rio local</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{syncScheduleNote}</p>
                {showNextProductDue && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    PrÃ³ximo produto vence: {formatDateTime(new Date(nextProductDueMs as number).toISOString())}
                  </p>
                )}
              </div>
              <div className="p-4 rounded-lg border border-border bg-secondary/30">
                <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
                  <AlertCircle className="h-4 w-4" /> Bloqueados
                </div>
                <p className="mt-2 text-2xl font-bold text-warning">{anomalyStats.blocked}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  403 no Ãºltimo run: {latestSyncRun?.total_403 ?? 0}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Alertas na janela: {blockedAnomalies.length}
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border border-border bg-secondary/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Mail className="h-4 w-4" /> RelatÃ³rios enviados
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/admin/price-sync')}>
                    Ver tudo
                  </Button>
                </div>
                {loadingReports ? (
                  <p className="text-sm text-muted-foreground">Carregando...</p>
                ) : reports.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum relatÃ³rio registrado ainda.</p>
                ) : (
                  <div className="space-y-3">
                    {reports.map((report) => (
                      <div key={report.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                        <div>
                          <p className="font-medium text-foreground">{formatDateTime(report.sent_at)}</p>
                          <p className="text-xs text-muted-foreground">
                            {report.recipients?.join(', ') || 'DestinatÃ¡rio nÃ£o informado'}
                          </p>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {report.total} mudanÃ§as â¢ {report.drops} quedas â¢ {report.promos} promos
                        </div>
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            report.status === 'sent'
                              ? 'bg-success/10 text-success'
                              : 'bg-destructive/10 text-destructive'
                          }`}
                        >
                          {report.status === 'sent' ? 'Enviado' : 'Falhou'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 rounded-lg border border-border bg-secondary/30">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
                  <TrendingDown className="h-4 w-4" /> MudanÃ§as recentes
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Total (janela)</p>
                    <p className="text-lg font-semibold">{priceChangeStats.total}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">PromoÃ§Ãµes</p>
                    <p className="text-lg font-semibold text-primary">{priceChangeStats.promos}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Quedas</p>
                    <p className="text-lg font-semibold text-success">{priceChangeStats.reductions}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Altas</p>
                    <p className="text-lg font-semibold text-destructive">{priceChangeStats.increases}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 rounded-lg border border-border bg-secondary/30">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Mail className="h-4 w-4" /> Logs de e-mail
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['auth-email-logs'] })}
              >
                Atualizar
              </Button>
            </div>
            {loadingEmailLogs ? (
              <p className="text-sm text-muted-foreground">Carregando logs...</p>
            ) : emailLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum envio registrado ainda.</p>
            ) : (
              <div className="space-y-3">
                {emailLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-lg border border-border/60 bg-background/60 p-3"
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-sm">
                      <div className="space-y-1">
                        <div className="flex items-center flex-wrap gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${getEmailStatusDotClass(log.status)}`} />
                          <p className="font-medium text-foreground">{log.email || 'Sem email'}</p>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${getEmailTypeClass(
                              log.type
                            )}`}
                          >
                            {getEmailTypeLabel(log.type)}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {formatDateTime(log.created_at)}
                          {log.ip ? ` | IP ${log.ip}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={`px-2 py-1 rounded-full ${getEmailStatusClass(log.status)}`}>
                          {getEmailStatusLabel(log.status)}
                        </span>
                        {log.message && (
                          <span className="text-muted-foreground">{log.message}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Produtos */}
          <div className="bg-card rounded-xl p-4 mb-6 border border-border">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Produtos</h2>
                <p className="text-sm text-muted-foreground">
                  Status de validaÃ§Ã£o, Pix manual/automÃ¡tico e filtros rÃ¡pidos.
                </p>
              </div>
              <div className="flex items-center gap-2">
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

            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mt-4">
              <div className="p-3 rounded-lg border border-border bg-secondary/30">
                <p className="text-xs text-muted-foreground uppercase">ML Total</p>
                <p className="text-lg font-semibold text-foreground">{productHealthStats.total}</p>
              </div>
              <div className="p-3 rounded-lg border border-border bg-success/10">
                <p className="text-xs text-success uppercase">OK</p>
                <p className="text-lg font-semibold text-foreground">{productHealthStats.ok}</p>
              </div>
              <div className="p-3 rounded-lg border border-border bg-destructive/10">
                <p className="text-xs text-destructive uppercase">Bloqueados</p>
                <p className="text-lg font-semibold text-foreground">{productHealthStats.blocked}</p>
              </div>
              <div className="p-3 rounded-lg border border-border bg-muted">
                <p className="text-xs text-muted-foreground uppercase">Aguardando</p>
                <p className="text-lg font-semibold text-foreground">{productHealthStats.pending}</p>
              </div>
              <div className="p-3 rounded-lg border border-border bg-secondary/30">
                <p className="text-xs text-muted-foreground uppercase">Pix Manual</p>
                <p className="text-lg font-semibold text-foreground">{productHealthStats.pixManual}</p>
              </div>
              <div className="p-3 rounded-lg border border-border bg-secondary/30">
                <p className="text-xs text-muted-foreground uppercase">Pix Auto</p>
                <p className="text-lg font-semibold text-foreground">{productHealthStats.pixAuto}</p>
              </div>
            </div>

            {productHealthStats.pixUnknown > 0 && (
              <div className="mt-3 text-xs text-muted-foreground">
                Pix sem origem registrada: {productHealthStats.pixUnknown} produto(s).
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 mt-5">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar produtos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Tabs
                value={productTab}
                onValueChange={(value) => setProductTab(value as 'all' | 'valid' | 'blocked')}
              >
                <TabsList className="w-full sm:w-auto">
                  <TabsTrigger value="all">Todos ({filteredAllProducts.length})</TabsTrigger>
                  <TabsTrigger value="valid">ValidaÃ§Ã£o ok ({filteredValidProducts.length})</TabsTrigger>
                  <TabsTrigger value="blocked">Bloqueados ({filteredBlockedProducts.length})</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          {/* Price Sync Changes */}
          <div className="bg-card rounded-xl p-4 mb-6 border border-border">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">MudanÃ§as de preÃ§o</h2>
                <p className="text-sm text-muted-foreground">Ãltimas alteraÃ§Ãµes capturadas pelo robÃ´</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleForceSync}
                  disabled={isSyncing}
                >
                  {isSyncing ? 'Agendando...' : 'ForÃ§ar sync'}
                </Button>
                <Select value={changesWindow} onValueChange={(value) => setChangesWindow(value as '24h' | '7d' | '30d')}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="PerÃ­odo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">Ãltimas 24h</SelectItem>
                    <SelectItem value="7d">Ãltimos 7 dias</SelectItem>
                    <SelectItem value="30d">Ãltimos 30 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
              <div className="rounded-lg bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">MudanÃ§as</p>
                <p className="text-lg font-semibold text-foreground">{priceChangeStats.total}</p>
              </div>
              <div className="rounded-lg bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">PromoÃ§Ãµes</p>
                <p className="text-lg font-semibold text-foreground">{priceChangeStats.promos}</p>
              </div>
              <div className="rounded-lg bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">ReduÃ§Ãµes</p>
                <p className="text-lg font-semibold text-foreground">{priceChangeStats.reductions}</p>
              </div>
              <div className="rounded-lg bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">Aumentos</p>
                <p className="text-lg font-semibold text-foreground">{priceChangeStats.increases}</p>
              </div>
            </div>

            <div className="mt-4">
              {loadingPriceChanges ? (
                <div className="text-center py-6">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-2 text-sm text-muted-foreground">Carregando mudanÃ§as...</p>
                </div>
              ) : priceChanges.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  Nenhuma mudanÃ§a registrada nesse perÃ­odo.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-secondary/50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Produto</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Antes</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Agora</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Desconto</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Fonte</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Data</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {priceChanges.map((change) => (
                        <tr key={change.id} className="hover:bg-secondary/30 transition-colors">
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-lg bg-secondary overflow-hidden flex-shrink-0">
                                {change.product?.image_url ? (
                                  <img src={change.product.image_url} alt={change.product?.name || 'Produto'} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                                    <Package className="h-4 w-4" />
                                  </div>
                                )}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground line-clamp-1">
                                  {change.product?.name || change.external_id || 'Produto'}
                                </p>
                                <p className="text-xs text-muted-foreground">{change.external_id || '-'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-sm text-muted-foreground">
                            {change.old_price !== null ? formatPrice(change.old_price) : '-'}
                          </td>
                          <td className="px-3 py-3 text-sm font-medium text-foreground">
                            {formatPrice(change.new_price)}
                          </td>
                          <td className="px-3 py-3 text-sm text-muted-foreground">
                            {typeof change.discount_percentage === 'number' && change.discount_percentage > 0
                              ? `${change.discount_percentage}%`
                              : '-'}
                          </td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getSourceBadgeClass(change.source)}`}>
                              {getSourceLabel(change.source)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right text-xs text-muted-foreground">
                            {new Date(change.created_at).toLocaleString('pt-BR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Avisos de verificaÃ§Ã£o */}
          <div className="bg-card rounded-xl p-4 mb-6 border border-border">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Avisos de verificaÃ§Ã£o</h2>
                <p className="text-sm text-muted-foreground">
                  Produtos com bloqueio de validaÃ§Ã£o de preÃ§o ou inconsistÃªncias detectadas.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => navigate('/admin/price-sync')}>
                  Ver relatÃ³rio completo
                </Button>
                <Button variant="secondary" onClick={handleCopyBlockedLinks} disabled={!blockedAnomalies.length}>
                  Copiar links bloqueados
                </Button>
                <Button variant="outline" onClick={handleDeactivateBlocked} disabled={!blockedProductIds.size}>
                  Desativar bloqueados
                </Button>
              </div>
            </div>

            <div className="mt-4">
              {loadingAnomalies ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : anomalies.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma divergÃªncia registrada.</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 p-3">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="rounded-full bg-primary/10 text-primary px-2 py-1">
                        Total: {anomalyStats.total}
                      </span>
                      <span className="rounded-full bg-warning/10 text-warning px-2 py-1">
                        Bloqueados: {anomalyStats.blocked}
                      </span>
                      <span className="rounded-full bg-muted text-muted-foreground px-2 py-1">
                        CatÃ¡logo: {anomalyStats.catalogFallback}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={anomaliesWindow} onValueChange={(value) => setAnomaliesWindow(value as '24h' | '7d' | '30d')}>
                        <SelectTrigger className="w-[140px]">
                          <SelectValue placeholder="PerÃ­odo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="24h">Ãltimas 24h</SelectItem>
                          <SelectItem value="7d">Ãltimos 7 dias</SelectItem>
                          <SelectItem value="30d">Ãltimos 30 dias</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {anomalies.map((row) => (
                    <div key={row.id} className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 p-3">
                      <div className="flex items-center gap-3">
                        {row.product?.image_url ? (
                          <img src={row.product.image_url} alt={row.product.name || 'Produto'} className="h-12 w-12 rounded-md object-cover" />
                        ) : (
                          <div className="h-12 w-12 rounded-md bg-muted" />
                        )}
                        <div>
                          <p className="font-medium text-foreground">{row.product?.name || 'Produto'}</p>
                          <p className="text-xs text-muted-foreground">
                            MLB: {row.external_id || '-'} â¢ CatÃ¡logo: {row.catalog_id || '-'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Detectado: {formatDateTime(row.detected_at)}
                          </p>
                          <span className="text-xs inline-flex items-center rounded-full bg-warning/10 text-warning px-2 py-1 mt-1">
                            {getAnomalyLabel(row.note)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span className="rounded-full bg-primary/10 text-primary px-2 py-1">
                          CatÃ¡logo: {row.price_from_catalog !== null ? formatPrice(row.price_from_catalog) : '-'}
                        </span>
                        <span className="rounded-full bg-muted text-muted-foreground px-2 py-1">
                          Item: {row.price_from_item !== null ? formatPrice(row.price_from_item) : '-'}
                        </span>
                        {row.source_url && (
                          <a
                            href={row.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline text-sm"
                          >
                            Abrir anÃºncio
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Products List */}
          {loadingProducts ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Carregando produtos...</p>
            </div>
          ) : activeProductsList.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-xl border border-border">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">Nenhum produto encontrado</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery
                  ? 'Tente outro termo de busca'
                  : productTab === 'blocked'
                    ? 'Nenhum produto bloqueado atÃ© o momento.'
                    : productTab === 'valid'
                      ? 'Nenhum produto com validaÃ§Ã£o ok encontrado.'
                      : 'Comece adicionando seu primeiro produto'}
              </p>
              {!searchQuery && productTab === 'all' && (
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">PreÃ§o</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Categoria</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Marketplace</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">AÃ§Ãµes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {activeProductsList.map((product) => {
                      const showPix =
                        typeof product.pix_price === "number" &&
                        product.pix_price > 0 &&
                        product.pix_price < product.price;
                      const isBlocked = blockedProductIds.has(product.id);
                      const isMercadoLivre = String(product.marketplace || '').toLowerCase().includes('mercado');
                      const hasSync = Boolean(product.last_sync);
                      const showOk = isMercadoLivre && !isBlocked && hasSync;
                      const showPending = isMercadoLivre && !hasSync;
                      return (
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
                              <p className="text-sm text-muted-foreground line-clamp-1">{product.short_description || 'Sem descriÃ§Ã£o'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div>
                            <p className="font-medium text-foreground">{formatPrice(product.price)}</p>
                            {product.original_price && product.original_price > product.price && (
                              <p className="text-sm text-muted-foreground line-through">{formatPrice(product.original_price)}</p>
                            )}
                            {showPix && (
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                  Pix {formatPrice(product.pix_price)}
                                </span>
                                {getPixSourceLabel(product.pix_price_source) && (
                                  <span
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${getPixSourceClass(product.pix_price_source)}`}
                                  >
                                    {getPixSourceLabel(product.pix_price_source)}
                                  </span>
                                )}
                              </div>
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
                            {isBlocked && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
                                <AlertCircle className="h-3 w-3" /> Sem validaÃ§Ã£o
                              </span>
                            )}
                            {showOk && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                                <CheckCircle className="h-3 w-3" /> OK
                              </span>
                            )}
                            {showPending && !isBlocked && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                                <Clock className="h-3 w-3" /> Aguardando sync
                              </span>
                            )}
                            {showPix && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                                Pix
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
                    );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {activeProductsList.map((product) => {
                const showPix =
                  typeof product.pix_price === "number" &&
                  product.pix_price > 0 &&
                  product.pix_price < product.price;
                const isBlocked = blockedProductIds.has(product.id);
                const isMercadoLivre = String(product.marketplace || '').toLowerCase().includes('mercado');
                const hasSync = Boolean(product.last_sync);
                const showOk = isMercadoLivre && !isBlocked && hasSync;
                const showPending = isMercadoLivre && !hasSync;
                return (
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
                    {showPix && (
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          Pix {formatPrice(product.pix_price)}
                        </span>
                        {getPixSourceLabel(product.pix_price_source) && (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${getPixSourceClass(product.pix_price_source)}`}
                          >
                            {getPixSourceLabel(product.pix_price_source)}
                          </span>
                        )}
                      </div>
                    )}
                    {isBlocked && (
                      <span className="mt-2 inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                        Sem validaÃ§Ã£o
                      </span>
                    )}
                    {showOk && (
                      <span className="mt-2 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        OK
                      </span>
                    )}
                    {showPending && !isBlocked && (
                      <span className="mt-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        Aguardando
                      </span>
                    )}
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
              );
              })}
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
              <p className="font-medium text-foreground">Dica rÃ¡pida</p>
              <ul className="mt-2 list-disc pl-4 space-y-1 text-xs">
                <li>Para importaÃ§Ã£o automÃ¡tica, use o link do produto que mostre o cÃ³digo <strong>MLB123...</strong> na URL.</li>
                <li>Links encurtados <strong>/sec/</strong> nÃ£o trazem o ID: copie o ID completo e cole no campo ao lado.</li>
                <li>O ID deve comeÃ§ar com <strong>MLB</strong> e ter pelo menos 10 dÃ­gitos numÃ©ricos.</li>
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
                <Label htmlFor="short_description">descriÃ§Ã£o Curta</Label>
                <Input
                  id="short_description"
                  value={formData.short_description}
                  onChange={(e) => setFormData(prev => ({ ...prev, short_description: e.target.value }))}
                  placeholder="Uma linha sobre o produto"
                />
              </div>

              <div>
                <Label htmlFor="description">descriÃ§Ã£o Completa</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="descriÃ§Ã£o detalhada do produto..."
                  rows={4}
                />
              </div>
            </div>

            {/* Pricing */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="price">PreÃ§o *</Label>
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
                <Label htmlFor="pix_price">PreÃ§o Pix (opcional)</Label>
                <Input
                  id="pix_price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.pix_price}
                  onChange={(e) => setFormData(prev => ({ ...prev, pix_price: e.target.value }))}
                  placeholder="95.90"
                />
              </div>
              <div>
                <Label htmlFor="original_price">PreÃ§o Original</Label>
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
                    {filteredCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {isRoupasSelected && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Gênero da Roupa *</Label>
                  <span className="text-xs text-muted-foreground">Obrigatório</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {CLOTHING_OPTIONS.map((option) => {
                    const isActive = formData.gender === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({ ...prev, gender: option.value }))
                        }
                        aria-pressed={isActive}
                        className={`group relative overflow-hidden rounded-2xl border transition-all ${
                          isActive
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        <div className="relative h-28 overflow-hidden">
                          <img
                            src={option.image}
                            alt={option.label}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/10 to-transparent" />
                        </div>
                        <div className="p-3 text-left bg-background/90">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-foreground">
                              {option.label}
                            </span>
                            {isActive && (
                              <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">
                                Selecionado
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{option.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {genderMissing && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Selecione Masculino ou Feminino para salvar.
                  </p>
                )}
              </div>
            )}
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
                  Link vÃ¡lido! Marketplace: {detectMarketplace(formData.affiliate_link)}
                </p>
              )}
            </div>

            {/* External ID manual */}
            <div>
              <Label htmlFor="external_id">
                ID do Marketplace (ex: MLB1234567890)
                <span className="text-xs text-muted-foreground ml-2">(use se o link nÃ£o tiver o MLB)</span>
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
                  Link sem ID MLB. Sem ele o robÃ´ nÃ£o sincroniza PreÃ§o/imagem.
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
                placeholder="Alta concentraÃ§Ã£o de proteÃ­na&#10;Zero aÃ§Ãºcar"
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
                <Label htmlFor="is_on_sale" className="cursor-pointer">Em PromoÃ§Ã£o</Label>
                <Switch
                  id="is_on_sale"
                  checked={formData.is_on_sale}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_on_sale: checked }))}
                />
              </div>
              <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                <Label htmlFor="free_shipping" className="cursor-pointer">Frete GrÃ¡tis</Label>
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
















