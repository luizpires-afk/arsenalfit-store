import { useState, useEffect, useMemo, useRef } from "react";
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
import logoImage from "../assets/arsenalfit-logo.png";

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

// Hooks e Utilitários
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
import {
  MAX_AFFILIATE_BATCH_SIZE,
  parseAffiliateLinksInput,
} from "@/lib/affiliateBatch.js";
import {
  canSoftRemoveStandbyProduct,
  detectAffiliateNotPermittedSignal,
  evaluatePriceMismatch,
  isMercadoLivreSecLink as isMercadoLivreSecLinkPolicy,
  isStandbyLikeState,
} from "@/lib/adminHealth.js";

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

const DUPLICATE_LINK_MESSAGE = "Este link já foi utilizado";
const REPORTS_PREVIEW_COUNT = 10;
const MAX_BULK_AFFILIATE_LINKS = MAX_AFFILIATE_BATCH_SIZE;
const AFFILIATE_BATCH_ERROR_LABELS: Record<string, string> = {
  invalid_sec_link: "Link invalido: use apenas link curto /sec/ do Mercado Livre.",
  affiliate_link_already_used: "Este link /sec/ ja esta vinculado a outro produto ativo.",
  affiliate_url_not_permitted: "URL nao permitido pelo Programa de Afiliados.",
  product_not_found: "Produto nao encontrado para aplicar este link.",
  missing_input_line: "Faltou link para esta linha do lote.",
  empty_link: "Linha vazia no envio do lote.",
  already_validated: "Produto ja estava validado anteriormente.",
};

const STANDBY_REMOVE_REASONS = [
  { value: "INVALID_AFFILIATE", label: "Afiliado invalido (/sec/ nao permitido)" },
  { value: "IRRELEVANT_RESULT", label: "Resultado irrelevante" },
  { value: "DUPLICATE", label: "Duplicado" },
  { value: "PRICE_MISMATCH", label: "Divergencia de preco" },
  { value: "OUT_OF_STOCK", label: "Sem estoque" },
  { value: "OTHER", label: "Outro motivo" },
] as const;

const HEALTH_STATE_STYLE: Record<string, string> = {
  OK: "bg-success/10 text-success border-success/30",
  ATENCAO: "bg-warning/10 text-warning border-warning/30",
  PROBLEMA: "bg-destructive/10 text-destructive border-destructive/30",
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  try {
    return parsed.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return "-";
  }
}

const isAdminAccessError = (error: unknown) => {
  const status = Number((error as any)?.status || 0);
  const code = String((error as any)?.code || "").toLowerCase();
  const message = String(
    (error as any)?.message || (error as any)?.details || "",
  ).toLowerCase();
  return (
    status === 401 ||
    status === 403 ||
    code.includes("admin_required") ||
    message.includes("admin_required") ||
    message.includes("permission denied") ||
    message.includes("forbidden")
  );
};

const isMercadoLivreSecLink = (value?: string | null) =>
  isMercadoLivreSecLinkPolicy(value);

const isMercadoLivreProduct = (product: Product) =>
  String(product.marketplace || "").toLowerCase().includes("mercado");

const normalizeMlExternalId = (value?: string | null) => {
  if (!value) return null;
  const match = String(value).toUpperCase().match(/MLB\d{6,12}/);
  return match?.[0] ?? null;
};

const extractMlCatalogProductIdFromUrl = (value?: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    const fromPath = url.pathname.match(/\/p\/(MLB\d{6,12})/i);
    if (fromPath?.[1]) return fromPath[1].toUpperCase();

    for (const key of ["item_id", "wid", "id"]) {
      const raw = url.searchParams.get(key);
      const match = raw?.match(/MLB(\d{6,12})/i);
      if (match?.[1]) return `MLB${match[1]}`;
    }

    const encodedItemId = value.match(/item_id%3AMLB(\d{6,12})/i);
    if (encodedItemId?.[1]) return `MLB${encodedItemId[1]}`;
    return null;
  } catch {
    const encodedItemId = String(value).match(/item_id%3AMLB(\d{6,12})/i);
    if (encodedItemId?.[1]) return `MLB${encodedItemId[1]}`;
    return null;
  }
};

const normalizeCanonicalText = (value?: string | null) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildAffiliateCanonicalKey = (product: Product) => {
  const catalogProductId =
    extractMlCatalogProductIdFromUrl(product.source_url) ??
    extractMlCatalogProductIdFromUrl(product.affiliate_link);
  if (catalogProductId) return `catalog:${catalogProductId}`;

  const normalizedSlug = normalizeCanonicalText(product.slug);
  if (normalizedSlug) return `slug:${normalizedSlug}`;

  const normalizedName = normalizeCanonicalText(product.name);
  const categoryId = product.category_id ?? "no-category";
  if (normalizedName) return `name:${categoryId}:${normalizedName.slice(0, 140)}`;

  const externalId = String(product.external_id ?? "").trim().toUpperCase();
  if (externalId) return `external:${externalId}`;
  return `id:${product.id}`;
};

const areSameAffiliateCanonicalProduct = (a: Product, b: Product) =>
  buildAffiliateCanonicalKey(a) === buildAffiliateCanonicalKey(b);

const isArchivedProduct = (product: Product) =>
  ["archived", "removed"].includes(String(product.status || "").toLowerCase()) ||
  Boolean(product.removed_at);

const isStandbyLikeProduct = (product: Product) => {
  return isStandbyLikeState({
    status: product.status,
    isActive: product.is_active,
  });
};

const hasAffiliateValidationError = (product: Product) =>
  String(product.affiliate_validation_status || "").startsWith("INVALID");

const detectMlSourceKind = (product: Product) => {
  const canonical = String((product as any).canonical_offer_url || "").toLowerCase();
  const source = String(product.source_url || "").toLowerCase();
  const combined = `${canonical} ${source}`;
  if (combined.includes("produto.mercadolivre.com.br")) return "ITEM";
  if (combined.includes("/p/mlb")) return "CATALOG";
  return "UNKNOWN";
};

const compareAffiliateRepresentativePriority = (a: Product, b: Product) => {
  const aSec = isMercadoLivreSecLink(a.affiliate_link);
  const bSec = isMercadoLivreSecLink(b.affiliate_link);
  if (aSec !== bSec) return aSec ? -1 : 1;

  const aActive = Boolean(a.is_active || a.status === "active");
  const bActive = Boolean(b.is_active || b.status === "active");
  if (aActive !== bActive) return aActive ? -1 : 1;

  const aHasLink = Boolean(a.affiliate_link && a.affiliate_link.trim());
  const bHasLink = Boolean(b.affiliate_link && b.affiliate_link.trim());
  if (aHasLink !== bHasLink) return aHasLink ? -1 : 1;

  const aLastSync = a.last_sync ? Date.parse(a.last_sync) : 0;
  const bLastSync = b.last_sync ? Date.parse(b.last_sync) : 0;
  const normalizedALastSync = Number.isFinite(aLastSync) ? aLastSync : 0;
  const normalizedBLastSync = Number.isFinite(bLastSync) ? bLastSync : 0;
  if (normalizedALastSync !== normalizedBLastSync) {
    return normalizedBLastSync - normalizedALastSync;
  }

  const byName = a.name.localeCompare(b.name, "pt-BR");
  if (byName !== 0) return byName;
  return a.id.localeCompare(b.id);
};

type DuplicateLinkProduct = { id: string; name: string } | null;

// Tipagem do Formulário
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
  report_date?: string | null;
  since_at?: string | null;
  until_at?: string | null;
  recipients: string[];
  total: number;
  drops: number;
  increases: number;
  promos: number;
  status: string;
  delivery_status?: string | null;
  delivery_attempts?: number | null;
  error?: string | null;
  last_error?: string | null;
  summary?: Record<string, unknown> | null;
}

interface DailyRunChecklistItem {
  key: string;
  label: string;
  pass: boolean;
  critical: boolean;
  detail?: Record<string, unknown> | null;
}

interface DailyRunReport {
  id: string;
  run_id: string | null;
  source: string;
  report_date: string;
  overall_status: "PASS" | "FAIL";
  critical_failures: number;
  checklist?: {
    generated_at?: string;
    items?: DailyRunChecklistItem[];
  } | null;
  created_at: string;
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

interface AffiliateBatchExportRow {
  batch_id: string;
  position: number;
  product_id: string;
  product_name: string;
  external_id: string | null;
  source_url: string | null;
}

interface AffiliateBatchInvalidRow {
  position: number;
  product_id: string;
  product_name: string | null;
  affiliate_url: string | null;
  error_message: string | null;
}

interface HealthDashboardCardItem {
  id: string;
  name?: string | null;
  status?: string | null;
  external_id?: string | null;
  affiliate_validation_status?: string | null;
  affiliate_validation_error?: string | null;
  updated_at?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  site_price?: number | null;
  ml_price?: number | null;
  delta_abs?: number | null;
  delta_pct?: number | null;
  source?: string | null;
  reason?: string | null;
  last_audit_at?: string | null;
}

interface HealthDashboardData {
  generated_at?: string | null;
  go_no_go?: {
    state?: "OK" | "ATENCAO" | "PROBLEMA" | string;
    reason?: string | null;
  } | null;
  automation?: {
    cron_jobs?: Array<{ jobname?: string; schedule?: string; active?: boolean }>;
    price_check_scheduler?: { last_run?: string | null; runs_last_2h?: number | null };
    catalog_ingest?: { last_run?: string | null; last_inserted?: number | null; last_updated?: number | null };
    price_sync_report?: { last_run?: string | null; delivery_status?: string | null; last_error?: string | null };
  } | null;
  catalog?: {
    standby?: number | null;
    active_ok?: number | null;
    blocked?: number | null;
    active_without_affiliate?: number | null;
    affiliate_errors_total?: number | null;
    affiliate_not_permitted?: number | null;
  } | null;
  prices?: {
    suspect_price?: number | null;
    mismatch_open?: number | null;
    mismatch_last_24h?: number | null;
    pix_price?: number | null;
    promotion_ready?: number | null;
  } | null;
  lists?: {
    affiliate_errors?: HealthDashboardCardItem[];
    price_mismatch_top?: HealthDashboardCardItem[];
  } | null;
}

interface PriceMismatchCase {
  id: string;
  product_id: string;
  site_price: number;
  ml_price: number;
  delta_abs: number;
  delta_pct: number;
  status: string;
  source: string | null;
  reason: string | null;
  last_audit_at: string;
  created_at: string;
  product?: {
    id: string;
    name: string;
    slug: string;
    image_url: string | null;
    status: string | null;
    is_active: boolean | null;
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
  const [sourceUrlDuplicate, setSourceUrlDuplicate] =
    useState<DuplicateLinkProduct>(null);
  const [affiliateLinkDuplicate, setAffiliateLinkDuplicate] =
    useState<DuplicateLinkProduct>(null);
  const [isAutoFetching, setIsAutoFetching] = useState(false);
  const [lastFetchedExternalId, setLastFetchedExternalId] = useState<string | null>(null);
  const [lastNoIdLink, setLastNoIdLink] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [changesWindow, setChangesWindow] = useState<'24h' | '7d' | '30d'>('24h');
  const [anomaliesWindow, setAnomaliesWindow] = useState<'24h' | '7d' | '30d'>('7d');
  const [productTab, setProductTab] = useState<'all' | 'valid' | 'blocked' | 'affiliate'>('all');
  const [productQuickFilter, setProductQuickFilter] = useState<
    | "all"
    | "standby"
    | "ok_inactive"
    | "inactive_reason"
    | "source_item"
    | "source_catalog"
    | "mismatch_open"
    | "mismatch_critical"
    | "mismatch_resolved"
    | "affiliate_invalid"
  >("all");
  const [inactiveReasonFilter, setInactiveReasonFilter] = useState<string>("all");
  const [showOnlyAffiliateErrors, setShowOnlyAffiliateErrors] = useState(false);
  const [affiliateDrafts, setAffiliateDrafts] = useState<Record<string, string>>({});
  const [savingAffiliateProductId, setSavingAffiliateProductId] = useState<string | null>(null);
  const [bulkAffiliateLinksInput, setBulkAffiliateLinksInput] = useState('');
  const [isApplyingBulkAffiliateLinks, setIsApplyingBulkAffiliateLinks] = useState(false);
  const [isCreatingAffiliateBatch, setIsCreatingAffiliateBatch] = useState(false);
  const [affiliateBatchId, setAffiliateBatchId] = useState<string | null>(null);
  const [affiliateBatchCount, setAffiliateBatchCount] = useState(0);
  const [lastAffiliateBatchResult, setLastAffiliateBatchResult] = useState<{
    batchId: string;
    applied: number;
    invalid: number;
    skipped: number;
    ignoredExtra: number;
    invalidRows: AffiliateBatchInvalidRow[];
  } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncAlertShown, setSyncAlertShown] = useState(false);
  const [reportsExpanded, setReportsExpanded] = useState(false);
  const [resendingReportDate, setResendingReportDate] = useState<string | null>(null);
  const [isRunningPriceAudit, setIsRunningPriceAudit] = useState(false);
  const [isRecheckingSuspect, setIsRecheckingSuspect] = useState(false);
  const [mismatchActionLoadingId, setMismatchActionLoadingId] = useState<string | null>(null);
  const [selectedStandbyIds, setSelectedStandbyIds] = useState<Record<string, boolean>>({});
  const [removeStandbyDialogOpen, setRemoveStandbyDialogOpen] = useState(false);
  const [standbyRemoveReason, setStandbyRemoveReason] =
    useState<(typeof STANDBY_REMOVE_REASONS)[number]["value"]>("IRRELEVANT_RESULT");
  const [standbyRemoveNote, setStandbyRemoveNote] = useState("");
  const [standbyRemoveTargets, setStandbyRemoveTargets] = useState<string[]>([]);
  const [isRemovingStandby, setIsRemovingStandby] = useState(false);

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
        .limit(30);

      if (error) throw error;
      return (data as unknown as PriceSyncReport[]) || [];
    },
    enabled: !!isAdmin,
  });

  const { data: dailyRunReports = [], isLoading: loadingDailyRunReports } = useQuery({
    queryKey: ['daily-run-reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_run_reports')
        .select('id, run_id, source, report_date, overall_status, critical_failures, checklist, created_at')
        .order('created_at', { ascending: false })
        .limit(15);

      if (error) throw error;
      return (data as unknown as DailyRunReport[]) || [];
    },
    enabled: !!isAdmin,
  });

  const visibleReports = reportsExpanded ? reports : reports.slice(0, REPORTS_PREVIEW_COUNT);
  const hasMoreReports = reports.length > REPORTS_PREVIEW_COUNT;
  const latestDailyRunReport = dailyRunReports[0] ?? null;
  const latestChecklistItems = Array.isArray(latestDailyRunReport?.checklist?.items)
    ? latestDailyRunReport?.checklist?.items || []
    : [];
  const failedChecklistItems = latestChecklistItems.filter((item) => item?.pass === false);
  const criticalChecklistFails = failedChecklistItems.filter((item) => item?.critical);

  const { data: emailLogs = [], isLoading: loadingEmailLogs } = useQuery({
    queryKey: ['auth-email-logs'],
    queryFn: async () => {
      const response = await fetch('/api/auth-get-logs?limit=50', {
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

  const {
    data: healthDashboard,
    isLoading: loadingHealthDashboard,
    error: healthDashboardError,
    refetch: refetchHealthDashboard,
  } = useQuery({
    queryKey: ['admin-health-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_admin_health_dashboard', {
        p_lookback_hours: 24,
      });
      if (error) throw error;
      return (data as unknown as HealthDashboardData) || null;
    },
    enabled: !!isAdmin,
    refetchInterval: 60_000,
  });

  const { data: priceMismatchCases = [], isLoading: loadingPriceMismatchCases } = useQuery({
    queryKey: ['price-mismatch-cases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('price_mismatch_cases')
        .select('id, product_id, site_price, ml_price, delta_abs, delta_pct, status, source, reason, last_audit_at, created_at, product:products(id, name, slug, image_url, status, is_active)')
        .eq('status', 'OPEN')
        .order('delta_pct', { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data as unknown as PriceMismatchCase[]) || [];
    },
    enabled: !!isAdmin,
    refetchInterval: 60_000,
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
    () => new Set(['policy_blocked']),
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

  const blockedAnomalyExternalIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of blockedAnomalies) {
      const normalized = normalizeMlExternalId(row.external_id);
      if (normalized) ids.add(normalized);
    }
    return ids;
  }, [blockedAnomalies]);

  const blockedProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const product of products) {
      if (product.auto_disabled_reason === 'blocked') {
        ids.add(product.id);
      }
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
  const lastSyncSource = latestSyncRun ? "Execução do robô" : "Atualização dos produtos";
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
    if (ms < 60 * 60 * 1000) return `${Math.floor(ms / (60 * 1000))}m atrás`;
    const hours = Math.floor(ms / (60 * 60 * 1000));
    return `${hours}h atrás`;
  };
  const syncAgeLabel = isSyncMissing
    ? "Sem sync registrado"
    : latestRunStatus === "empty" && automationStats.overdueCount === 0
      ? "Sem itens vencidos"
      : formatAge(syncAgeMs);
  const syncScheduleNote = `Ciclo de ${SYNC_INTERVAL_HOURS}h (UTC)`;

  const autoSyncAttemptAtRef = useRef<number>(0);

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

  const healthGoNoGoState = String(healthDashboard?.go_no_go?.state || "OK").toUpperCase();
  const healthGoNoGoReason =
    healthDashboard?.go_no_go?.reason || "Sem alertas criticos registrados.";
  const healthGoNoGoClass =
    HEALTH_STATE_STYLE[healthGoNoGoState] || HEALTH_STATE_STYLE.OK;
  const healthUpdatedAtLabel = healthDashboard?.generated_at
    ? formatDateTime(healthDashboard.generated_at)
    : "sem horario";
  const activeProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const product of products) {
      const isActive = String(product?.status || "").toLowerCase() === "active" && Boolean(product?.is_active);
      if (isActive) ids.add(product.id);
    }
    return ids;
  }, [products]);
  const healthAffiliateErrors =
    (healthDashboard?.lists?.affiliate_errors as HealthDashboardCardItem[] | undefined) || [];
  const healthMismatchTopRaw =
    (healthDashboard?.lists?.price_mismatch_top as HealthDashboardCardItem[] | undefined) || [];
  const healthMismatchTop = useMemo(
    () =>
      healthMismatchTopRaw.filter((item: any) => {
        const productId = String(item?.product_id || item?.id || "").trim();
        if (!productId) return true;
        return activeProductIds.has(productId);
      }),
    [healthMismatchTopRaw, activeProductIds],
  );

  // Mutation: Criar/Atualizar Produto
  const productMutation = useMutation({
    mutationFn: async (data: ProductFormData & { id?: string }) => {
      const slug = generateSlug(data.name);
      const marketplace = detectMarketplace(data.source_url || data.affiliate_link);
      
      // Sanitização dos dados numéricos
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
        slug: data.id ? undefined : slug, // Não atualiza slug na edição para manter SEO
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
        const candidateLinks = Array.from(
          new Set([data.source_url?.trim() || '', data.affiliate_link?.trim() || ''].filter(Boolean)),
        );

        const isLinkAlreadyUsedByAnotherProduct = async (link: string) => {
          const [sourceRes, affiliateRes] = await Promise.all([
            supabase.from('products').select('id').eq('source_url', link).neq('id', data.id).limit(1),
            supabase.from('products').select('id').eq('affiliate_link', link).neq('id', data.id).limit(1),
          ]);
          if (sourceRes.error) throw sourceRes.error;
          if (affiliateRes.error) throw affiliateRes.error;
          return Boolean((sourceRes.data || []).length || (affiliateRes.data || []).length);
        };

        for (const link of candidateLinks) {
          if (await isLinkAlreadyUsedByAnotherProduct(link)) {
            throw new Error(DUPLICATE_LINK_MESSAGE);
          }
        }

        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', data.id);
        
        if (error) throw error;
      } else {
        // Create
        const candidateLinks = Array.from(
          new Set([data.source_url?.trim() || '', data.affiliate_link?.trim() || ''].filter(Boolean)),
        );

        const isLinkAlreadyUsed = async (link: string) => {
          const [sourceRes, affiliateRes] = await Promise.all([
            supabase.from('products').select('id').eq('source_url', link).limit(1),
            supabase.from('products').select('id').eq('affiliate_link', link).limit(1),
          ]);
          if (sourceRes.error) throw sourceRes.error;
          if (affiliateRes.error) throw affiliateRes.error;
          return Boolean((sourceRes.data || []).length || (affiliateRes.data || []).length);
        };

        for (const link of candidateLinks) {
          if (await isLinkAlreadyUsed(link)) {
            throw new Error(DUPLICATE_LINK_MESSAGE);
          }
        }

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
      if (error.message === DUPLICATE_LINK_MESSAGE) {
        toast.error(DUPLICATE_LINK_MESSAGE);
        return;
      }
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
    setSourceUrlDuplicate(null);
    setAffiliateLinkDuplicate(null);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingProduct(null);
    setFormData(initialFormData);
    setAffiliateLinkError(null);
    setExternalIdError(null);
    setSourceUrlDuplicate(null);
    setAffiliateLinkDuplicate(null);
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

  const getLinkVariants = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return [];

    const variants = new Set<string>([trimmed]);

    // Normalize only the most common case (product URLs without query/hash).
    if (!trimmed.includes("?") && !trimmed.includes("#")) {
      const withoutTrailing = trimmed.replace(/\/+$/, "");
      if (withoutTrailing) {
        variants.add(withoutTrailing);
        variants.add(`${withoutTrailing}/`);
      }
    }

    return Array.from(variants).filter(Boolean);
  };

  const isValidUrl = (value: string) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  };

  const lookupDuplicateProductByLinks = async (
    links: string[],
    excludeId?: string,
  ): Promise<DuplicateLinkProduct> => {
    if (!links.length) return null;

    const select = "id, name";

    let sourceQuery = supabase
      .from("products")
      .select(select)
      .in("source_url", links)
      .limit(1);

    let affiliateQuery = supabase
      .from("products")
      .select(select)
      .in("affiliate_link", links)
      .limit(1);

    if (excludeId) {
      sourceQuery = sourceQuery.neq("id", excludeId);
      affiliateQuery = affiliateQuery.neq("id", excludeId);
    }

    const [sourceRes, affiliateRes] = await Promise.all([
      sourceQuery,
      affiliateQuery,
    ]);

    if (sourceRes.error) throw sourceRes.error;
    if (affiliateRes.error) throw affiliateRes.error;

    const found = (sourceRes.data?.[0] || affiliateRes.data?.[0]) as any;
    if (!found?.id || !found?.name) return null;
    return { id: String(found.id), name: String(found.name) };
  };

  useEffect(() => {
    if (!isDialogOpen) return;

    const link = formData.source_url.trim();
    if (!link || !isValidUrl(link)) {
      setSourceUrlDuplicate(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const variants = getLinkVariants(link);
        const existing = await lookupDuplicateProductByLinks(
          variants,
          editingProduct?.id,
        );
        if (cancelled) return;
        setSourceUrlDuplicate(existing);
      } catch {
        if (cancelled) return;
        setSourceUrlDuplicate(null);
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isDialogOpen, formData.source_url, editingProduct?.id]);

  useEffect(() => {
    if (!isDialogOpen) return;

    const link = formData.affiliate_link.trim();
    if (!link || !isValidUrl(link)) {
      setAffiliateLinkDuplicate(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const variants = getLinkVariants(link);
        const existing = await lookupDuplicateProductByLinks(
          variants,
          editingProduct?.id,
        );
        if (cancelled) return;
        setAffiliateLinkDuplicate(existing);
      } catch {
        if (cancelled) return;
        setAffiliateLinkDuplicate(null);
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isDialogOpen, formData.affiliate_link, editingProduct?.id]);

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
    setAffiliateLinkDuplicate(null);

    if (value.trim()) {
      const validation = isValidAffiliateLink(value);
      if (!validation.valid) {
        setAffiliateLinkError(validation.error || 'Link inválido');
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
    setSourceUrlDuplicate(null);

    if (!value.trim()) {
      return;
    }

    if (marketplace === 'mercadolivre') {
      const mlbId = extractMercadoLivreId(value);
      if (mlbId) {
        setFormData(prev => ({ ...prev, external_id: mlbId }));
        setExternalIdError(null);
        // Para evitar bloqueio/403 no front, deixamos a importação para o robô (edge function).
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

  const handleSyncNow = () => {
    console.warn("DEPRECATED: HTML scraping disabled");
    toast.error("DEPRECATED: HTML scraping disabled");
  };

  const handleForceSync = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .update({ next_check_at: new Date().toISOString() })
        .eq('marketplace', 'mercadolivre')
        .eq('is_active', true)
        .select('id');

      if (error) throw error;
      const updatedCount = data?.length ?? 0;
      if (updatedCount === 0) {
        toast.error('Nenhum produto elegível para sincronização.');
      } else {
        toast.success('Sincronização agendada para os produtos ativos.');
      }
    } catch (error: any) {
      toast.error('Falha ao agendar sincronização', {
        description: error.message,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const AUTO_SYNC_RETRY_MS = 30 * 60 * 1000;
    if (!isSyncStale || isSyncing) {
      if (!isSyncStale) {
        autoSyncAttemptAtRef.current = 0;
      }
      return;
    }
    const now = Date.now();
    if (autoSyncAttemptAtRef.current && now - autoSyncAttemptAtRef.current < AUTO_SYNC_RETRY_MS) {
      return;
    }
    autoSyncAttemptAtRef.current = now;
    void handleForceSync();
  }, [isSyncStale, isSyncing]);

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

  // Guardrail: anomalies alone should not auto-disable products.
  // Blocking is now explicit (manual action or backend cleanup policy).

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

  const getAffiliateDraftValue = (product: Product) =>
    affiliateDrafts[product.id] ?? product.affiliate_link ?? '';

  const parseMultilineLinks = (value: string) => parseAffiliateLinksInput(value);

  const saveAffiliateLinkForProduct = async (
    product: Product,
    rawLink: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    const link = rawLink.trim();
    if (!link) {
      return { ok: false, error: 'Informe o link de afiliado.' };
    }

    const validation = isValidAffiliateLink(link);
    if (!validation.valid) {
      return { ok: false, error: validation.error || 'Link de afiliado invalido.' };
    }

    if (validation.marketplace && validation.marketplace !== 'mercadolivre') {
      return { ok: false, error: 'Esta aba aceita apenas links de afiliado do Mercado Livre.' };
    }

    if (!isMercadoLivreSecLink(link)) {
      return {
        ok: false,
        error: 'Use o link curto de afiliado do Mercado Livre (mercadolivre.com/sec/...).',
      };
    }

    const duplicate = await lookupDuplicateProductByLinks(
      getLinkVariants(link),
      product.id,
    );
    if (duplicate) {
      return { ok: false, error: 'Este link ja esta em uso por: ' + duplicate.name };
    }

    const nowIso = new Date().toISOString();
    const validatedBy = user?.id ?? null;
    const parsedExternalId = extractMercadoLivreId(link);
    const updates: Record<string, unknown> = {
      affiliate_link: link,
      affiliate_verified: true,
      affiliate_generated_at: nowIso,
      validated_at: nowIso,
      validated_by: validatedBy,
      affiliate_url_used: link,
      affiliate_validation_status: 'VALIDATED',
      affiliate_validation_error: null,
      is_active: true,
      status: 'active',
      auto_disabled_reason: null,
      auto_disabled_at: null,
      removed_at: null,
      removed_reason: null,
      removed_by: null,
      removed_note: null,
      next_check_at: nowIso,
    };

    if (!product.external_id && parsedExternalId) {
      updates.external_id = parsedExternalId;
    }

    const { error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', product.id);
    if (error) throw error;

    // Keep exactly one canonical Mercado Livre row after validation.
    const duplicateIds = products
      .filter(
        (row) =>
          row.id !== product.id &&
          isMercadoLivreProduct(row) &&
          areSameAffiliateCanonicalProduct(row, product),
      )
      .map((row) => row.id);

    if (duplicateIds.length > 0) {
      const { error: duplicateError } = await supabase
        .from('products')
        .update({
          is_active: false,
          status: 'standby',
        })
        .in('id', duplicateIds);
      if (duplicateError) throw duplicateError;
    }

    return { ok: true };
  };

  const handleAffiliateDraftChange = (productId: string, value: string) => {
    setAffiliateDrafts((prev) => ({ ...prev, [productId]: value }));
  };

  const handleSaveAffiliateLink = async (product: Product) => {
    const link = getAffiliateDraftValue(product);
    try {
      setSavingAffiliateProductId(product.id);
      const result = await saveAffiliateLinkForProduct(product, link);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setAffiliateDrafts((prev) => {
        if (!(product.id in prev)) return prev;
        const next = { ...prev };
        delete next[product.id];
        return next;
      });

      toast.success('Link salvo. Produto ativado e reagendado para sincronizacao.');
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    } catch (error: any) {
      toast.error('Falha ao salvar link de afiliado.', { description: error.message });
    } finally {
      setSavingAffiliateProductId(null);
    }
  };

  const getSourceLabel = (source?: string | null) => {
    if (source === 'catalog') return 'Catálogo';
    if (source === 'public') return 'Público';
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
    if (note === 'policy_blocked') return 'API bloqueou o anúncio';
    if (note === 'catalog_lookup_failed') return 'Catálogo indisponível';
    if (note === 'preferred_item_missing_in_catalog') return 'Item não está no catélogo';
    if (note === 'catalog_fallback') return 'Preço veio do catélogo';
    return 'Divergência';
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
  const getReportDateKey = (report: PriceSyncReport) => {
    if (typeof report.report_date === 'string' && report.report_date.trim()) {
      return report.report_date.trim();
    }
    if (!report.sent_at) return null;
    const ms = new Date(report.sent_at).getTime();
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toISOString().slice(0, 10);
  };

  const handleResendPriceReport = async (report: PriceSyncReport) => {
    const reportDate = getReportDateKey(report);
    if (!reportDate) {
      toast.error('Data do relatório indisponível para reenvio.');
      return;
    }
    setResendingReportDate(reportDate);
    try {
      const { error } = await supabase.rpc('request_price_sync_report_resend', {
        p_report_date: reportDate,
      });
      if (error) throw error;
      toast.success('Reenvio solicitado. O relatório será processado em instantes.');
      queryClient.invalidateQueries({ queryKey: ['price-sync-reports'] });
    } catch (error: any) {
      toast.error('Falha ao solicitar reenvio', {
        description: error?.message || 'Tente novamente.',
      });
    } finally {
      setResendingReportDate(null);
    }
  };

  const openRemoveStandbyDialog = (productIds: string[]) => {
    const uniqueIds = Array.from(new Set(productIds.filter(Boolean)));
    if (!uniqueIds.length) {
      toast.error("Nenhum produto selecionado para excluir.");
      return;
    }
    setStandbyRemoveTargets(uniqueIds);
    setStandbyRemoveReason("IRRELEVANT_RESULT");
    setStandbyRemoveNote("");
    setRemoveStandbyDialogOpen(true);
  };

  const handleToggleStandbySelection = (productId: string, checked: boolean) => {
    setSelectedStandbyIds((prev) => {
      const next = { ...prev };
      if (checked) next[productId] = true;
      else delete next[productId];
      return next;
    });
  };

  const handleBulkRemoveStandby = async () => {
    if (!standbyRemoveTargets.length) return;
    setIsRemovingStandby(true);
    try {
      const { data, error } = await supabase.rpc("admin_soft_remove_standby_products", {
        p_product_ids: standbyRemoveTargets,
        p_reason: standbyRemoveReason,
        p_note: standbyRemoveNote.trim() || null,
      });
      if (error) throw error;

      const removed = Number((data as any)?.removed ?? 0);
      const skipped = Number((data as any)?.skipped_active ?? 0);
      const summary =
        removed > 0
          ? `${removed} produto(s) removido(s) do standby.`
          : "Nenhum produto removido.";
      const suffix = skipped > 0 ? ` ${skipped} ativo(s) foram preservados.` : "";
      toast.success(summary + suffix);

      setRemoveStandbyDialogOpen(false);
      setStandbyRemoveTargets([]);
      setSelectedStandbyIds({});
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["admin-health-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["price-mismatch-cases"] });
    } catch (error: any) {
      toast.error("Falha ao remover produtos do standby.", {
        description: error?.message || "Tente novamente.",
      });
    } finally {
      setIsRemovingStandby(false);
    }
  };

  const handleRunPriceAuditSample = async () => {
    setIsRunningPriceAudit(true);
    try {
      const { data, error } = await supabase.rpc("queue_price_audit_sample", {
        p_limit: 80,
        p_include_suspect: true,
      });
      if (error) throw error;
      const queued = Number((data as any)?.queued ?? 0);
      toast.success(`Auditoria iniciada: ${queued} produto(s) enfileirado(s).`);
      queryClient.invalidateQueries({ queryKey: ["price-mismatch-cases"] });
      queryClient.invalidateQueries({ queryKey: ["admin-health-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["price-sync-anomalies"] });
    } catch (error: any) {
      toast.error("Falha ao iniciar auditoria de precos.", {
        description: error?.message || "Tente novamente.",
      });
    } finally {
      setIsRunningPriceAudit(false);
    }
  };

  const handleRecheckSuspectPricesNow = async () => {
    setIsRecheckingSuspect(true);
    try {
      const { data, error } = await supabase.rpc("recheck_suspect_prices_now", {
        p_limit: 200,
      });
      if (error) throw error;
      const queued = Number((data as any)?.queued ?? 0);
      toast.success(`Rechecagem acionada para ${queued} produto(s).`);
      queryClient.invalidateQueries({ queryKey: ["admin-health-dashboard"] });
    } catch (error: any) {
      toast.error("Falha ao acionar rechecagem de suspeitos.", {
        description: error?.message || "Tente novamente.",
      });
    } finally {
      setIsRecheckingSuspect(false);
    }
  };

  const handlePriceMismatchAction = async (
    caseId: string,
    action: "RECHECK_NOW" | "APPLY_ML_PRICE" | "MARK_RESOLVED" | "MOVE_TO_STANDBY",
  ) => {
    setMismatchActionLoadingId(`${caseId}:${action}`);
    try {
      const { error } = await supabase.rpc("admin_resolve_price_mismatch_case", {
        p_case_id: caseId,
        p_action: action,
        p_note: null,
      });
      if (error) throw error;
      toast.success("Ação aplicada.");
      queryClient.invalidateQueries({ queryKey: ["price-mismatch-cases"] });
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["admin-health-dashboard"] });
    } catch (error: any) {
      toast.error("Falha ao aplicar ação da divergência.", {
        description: error?.message || "Tente novamente.",
      });
    } finally {
      setMismatchActionLoadingId(null);
    }
  };

  const filteredAllProducts = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return products.filter((product) => {
      if (isArchivedProduct(product)) return false;
      return (
        product.name.toLowerCase().includes(query) ||
        (product.description || '').toLowerCase().includes(query)
      );
    });
  }, [products, searchQuery]);

  const dedupedMercadoLists = useMemo(() => {
    const mercadoProducts = filteredAllProducts.filter((product) =>
      isMercadoLivreProduct(product),
    );
    const grouped = new Map<string, Product[]>();
    for (const product of mercadoProducts) {
      const key = buildAffiliateCanonicalKey(product);
      const current = grouped.get(key);
      if (current) current.push(product);
      else grouped.set(key, [product]);
    }

    const productOrder = new Map<string, number>();
    filteredAllProducts.forEach((product, index) => {
      productOrder.set(product.id, index);
    });

    const pickRepresentative = (
      rows: Product[],
      predicate: (row: Product) => boolean,
    ) => {
      const eligible = rows.filter(predicate);
      if (!eligible.length) return null;
      const ordered = [...eligible].sort(compareAffiliateRepresentativePriority);
      return ordered[0] ?? null;
    };

    const allProducts: Product[] = [];
    const validProducts: Product[] = [];
    const blockedProducts: Product[] = [];

    for (const groupProducts of grouped.values()) {
      const allRepresentative = pickRepresentative(groupProducts, () => true);
      if (allRepresentative) {
        allProducts.push(allRepresentative);
      }

      const validRepresentative = pickRepresentative(
        groupProducts,
        (product) => !blockedProductIds.has(product.id) && Boolean(product.last_sync),
      );
      if (validRepresentative) validProducts.push(validRepresentative);

      const blockedRepresentative = pickRepresentative(
        groupProducts,
        (product) => blockedProductIds.has(product.id),
      );
      if (blockedRepresentative) blockedProducts.push(blockedRepresentative);
    }

    const sortByOriginalOrder = (rows: Product[]) =>
      rows.sort((a, b) => {
        const aIndex = productOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bIndex = productOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return aIndex - bIndex;
      });

    return {
      allProducts: sortByOriginalOrder(allProducts),
      validProducts: sortByOriginalOrder(validProducts),
      blockedProducts: sortByOriginalOrder(blockedProducts),
    };
  }, [filteredAllProducts, blockedProductIds]);

  const filteredValidProducts = dedupedMercadoLists.validProducts;
  const filteredBlockedProducts = dedupedMercadoLists.blockedProducts;
  const filteredAllProductsDeduped = useMemo(() => {
    const nonMercadoProducts = filteredAllProducts.filter(
      (product) => !isMercadoLivreProduct(product),
    );
    const productOrder = new Map<string, number>();
    filteredAllProducts.forEach((product, index) => {
      productOrder.set(product.id, index);
    });
    return [...nonMercadoProducts, ...dedupedMercadoLists.allProducts].sort((a, b) => {
      const aIndex = productOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bIndex = productOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return aIndex - bIndex;
    });
  }, [filteredAllProducts, dedupedMercadoLists.allProducts]);

  const affiliateGrouped = useMemo(() => {
    const eligibleProducts = dedupedMercadoLists.allProducts.filter(
      (product) => !blockedProductIds.has(product.id) && !isArchivedProduct(product),
    );

    const filteredByError = showOnlyAffiliateErrors
      ? eligibleProducts.filter((product) => hasAffiliateValidationError(product))
      : eligibleProducts;

    const products = [...filteredByError].sort((a, b) => {
      const aPending = isMercadoLivreSecLink(a.affiliate_link) ? 0 : 1;
      const bPending = isMercadoLivreSecLink(b.affiliate_link) ? 0 : 1;
      if (aPending !== bPending) return bPending - aPending;

      const aHasLink = Boolean(a.affiliate_link && a.affiliate_link.trim());
      const bHasLink = Boolean(b.affiliate_link && b.affiliate_link.trim());
      if (aHasLink !== bHasLink) return Number(aHasLink) - Number(bHasLink);

      return a.name.localeCompare(b.name, "pt-BR");
    });

    return {
      products,
      hiddenBlockedByApi: Math.max(0, dedupedMercadoLists.allProducts.length - eligibleProducts.length),
    };
  }, [dedupedMercadoLists, blockedProductIds, showOnlyAffiliateErrors]);

  const filteredAffiliateProducts = affiliateGrouped.products;

  const affiliateStatusStats = useMemo(() => {
    let ok = 0;
    let pending = 0;
    for (const product of filteredAffiliateProducts) {
      if (isMercadoLivreSecLink(product.affiliate_link)) ok += 1;
      else pending += 1;
    }
    return {
      ok,
      pending,
      total: filteredAffiliateProducts.length,
      hiddenBlockedByApi: affiliateGrouped.hiddenBlockedByApi,
    };
  }, [
    filteredAffiliateProducts,
    affiliateGrouped.hiddenBlockedByApi,
  ]);

  const pendingAffiliateProducts = useMemo(
    () =>
      filteredAffiliateProducts.filter(
        (product) => !isMercadoLivreSecLink(product.affiliate_link),
      ),
    [filteredAffiliateProducts],
  );

  const removableStandbyProducts = useMemo(
    () =>
      pendingAffiliateProducts.filter((product) =>
        canSoftRemoveStandbyProduct({
          status: product.status,
          isActive: product.is_active,
          affiliateLink: product.affiliate_link,
        }),
      ),
    [pendingAffiliateProducts],
  );

  const selectedStandbyProductIds = useMemo(
    () =>
      removableStandbyProducts
        .map((product) => product.id)
        .filter((id) => Boolean(selectedStandbyIds[id])),
    [removableStandbyProducts, selectedStandbyIds],
  );

  useEffect(() => {
    setSelectedStandbyIds((prev) => {
      const valid = new Set(removableStandbyProducts.map((product) => product.id));
      const next: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(prev)) {
        if (value && valid.has(key)) next[key] = true;
      }
      return next;
    });
  }, [removableStandbyProducts]);

  const productNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of products) {
      map.set(product.id, product.name);
    }
    return map;
  }, [products]);

  const bulkAffiliateLinksParsed = useMemo(
    () => parseMultilineLinks(bulkAffiliateLinksInput),
    [bulkAffiliateLinksInput],
  );
  const hasOpenAffiliateBatch = Boolean(affiliateBatchId && affiliateBatchCount > 0);
  const formatAffiliateBatchError = (errorCode?: string | null) => {
    if (!errorCode) return "Erro nao especificado.";
    return AFFILIATE_BATCH_ERROR_LABELS[errorCode] ?? errorCode.replace(/_/g, ' ');
  };

  const handleCopyPendingAffiliateSourceUrls = async () => {
    setIsCreatingAffiliateBatch(true);
    try {
      const { data: launchOpenBatches, error: launchOpenBatchesError } = await supabase
        .from('affiliate_validation_batches')
        .select('id, created_at, source, status')
        .eq('status', 'OPEN')
        .like('source', 'launch_book_60_unique_wave_%')
        .order('created_at', { ascending: true })
        .limit(10);

      if (launchOpenBatchesError) throw launchOpenBatchesError;

      const launchCandidates = (launchOpenBatches ?? []) as Array<{
        id: string;
        created_at?: string | null;
        source?: string | null;
        status?: string | null;
      }>;

      for (const candidate of launchCandidates) {
        if (!candidate?.id) continue;
        const { data: pendingItems, error: pendingItemsError } = await supabase
          .from('affiliate_validation_batch_items')
          .select('position, source_url, apply_status')
          .eq('batch_id', candidate.id)
          .eq('apply_status', 'PENDING')
          .order('position', { ascending: true });

        if (pendingItemsError) throw pendingItemsError;

        const launchUrls = ((pendingItems as Array<{
          position?: number | null;
          source_url?: string | null;
          apply_status?: string | null;
        }> | null) ?? [])
          .map((item) => (item.source_url ?? '').trim())
          .filter(Boolean);

        if (!launchUrls.length) continue;

        const launchContent = launchUrls.join('\n');
        try {
          await navigator.clipboard.writeText(launchContent);
        } catch {
          const textarea = document.createElement('textarea');
          textarea.value = launchContent;
          textarea.style.position = 'fixed';
          textarea.style.top = '-9999px';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }

        setAffiliateBatchId(candidate.id);
        setAffiliateBatchCount(launchUrls.length);
        setLastAffiliateBatchResult(null);
        setBulkAffiliateLinksInput('');
        toast.success(
          `Lote pronto copiado: ${candidate.id.slice(0, 8)} com ${launchUrls.length} URL(s).`,
        );
        return;
      }

      if (!pendingAffiliateProducts.length) {
        toast.error('Nenhum produto pendente para copiar.');
        return;
      }

      const { data, error } = await supabase.rpc('export_standby_affiliate_batch', {
        p_limit: MAX_BULK_AFFILIATE_LINKS,
        p_source: 'admin_affiliate_tab',
      });
      if (error) throw error;

      const rows = ((data as AffiliateBatchExportRow[] | null) ?? [])
        .filter((row) => Boolean(row.source_url && row.source_url.trim()))
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

      if (!rows.length) {
        const { data: openBatches, error: openBatchesError } = await supabase
          .from('affiliate_validation_batches')
          .select('id, created_at, source, status')
          .eq('status', 'OPEN')
          .order('created_at', { ascending: false })
          .limit(10);

        if (openBatchesError) throw openBatchesError;

        const batchCandidates = (openBatches ?? []) as Array<{
          id: string;
          created_at?: string | null;
          source?: string | null;
          status?: string | null;
        }>;

        let reusedBatchId: string | null = null;
        let reusedUrls: string[] = [];

        for (const candidate of batchCandidates) {
          if (!candidate?.id) continue;
          const { data: pendingItems, error: pendingItemsError } = await supabase
            .from('affiliate_validation_batch_items')
            .select('position, source_url, apply_status')
            .eq('batch_id', candidate.id)
            .eq('apply_status', 'PENDING')
            .order('position', { ascending: true });

          if (pendingItemsError) throw pendingItemsError;

          const urls = ((pendingItems as Array<{
            position?: number | null;
            source_url?: string | null;
            apply_status?: string | null;
          }> | null) ?? [])
            .map((item) => (item.source_url ?? '').trim())
            .filter(Boolean);

          if (!urls.length) continue;

          reusedBatchId = candidate.id;
          reusedUrls = urls;
          break;
        }

        if (!reusedBatchId || !reusedUrls.length) {
          setAffiliateBatchId(null);
          setAffiliateBatchCount(0);
          toast.error('Nenhum item elegivel para lote de afiliados.');
          return;
        }

        const reusedContent = reusedUrls.join('\n');
        try {
          await navigator.clipboard.writeText(reusedContent);
        } catch {
          const textarea = document.createElement('textarea');
          textarea.value = reusedContent;
          textarea.style.position = 'fixed';
          textarea.style.top = '-9999px';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }

        setAffiliateBatchId(reusedBatchId);
        setAffiliateBatchCount(reusedUrls.length);
        setLastAffiliateBatchResult(null);
        setBulkAffiliateLinksInput('');
        toast.success(
          `Batch aberto reaproveitado: ${reusedBatchId.slice(0, 8)} com ${reusedUrls.length} URL(s).`,
        );
        return;
      }

      const batchId = rows[0]?.batch_id ?? null;
      if (!batchId) {
        toast.error('Falha ao gerar lote de validacao.');
        return;
      }

      const linksForBatch = rows
        .map((row) => (row.source_url ?? '').trim())
        .filter(Boolean);
      const content = linksForBatch.join('\n');

      try {
        await navigator.clipboard.writeText(content);
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = content;
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      setAffiliateBatchId(batchId);
      setAffiliateBatchCount(linksForBatch.length);
      setLastAffiliateBatchResult(null);
      setBulkAffiliateLinksInput('');
      toast.success(
        `Lote ${batchId.slice(0, 8)} gerado com ${linksForBatch.length} URL(s).`,
      );
    } catch (error: any) {
      toast.error('Falha ao gerar lote de afiliados.', { description: error.message });
    } finally {
      setIsCreatingAffiliateBatch(false);
    }
  };

  const handleSaveAffiliateLinksBulk = async () => {
    if (!affiliateBatchId) {
      toast.error('Gere um lote antes de validar em bloco.');
      return;
    }
    const batchId = affiliateBatchId;
    if (!bulkAffiliateLinksParsed.length) {
      toast.error('Cole ao menos um link de afiliado em lote.');
      return;
    }
    if (bulkAffiliateLinksParsed.length > MAX_BULK_AFFILIATE_LINKS) {
      toast.error(
        `Maximo de ${MAX_BULK_AFFILIATE_LINKS} links por envio. Divida em mais de um lote.`,
      );
      return;
    }

    const seen = new Set<string>();
    for (let index = 0; index < bulkAffiliateLinksParsed.length; index += 1) {
      const normalized = bulkAffiliateLinksParsed[index]
        .trim()
        .toLowerCase()
        .replace(/\/+$/, '');
      if (seen.has(normalized)) {
        toast.error(`Link repetido no lote (linha ${index + 1}).`);
        return;
      }
      seen.add(normalized);
    }

    const notPermittedSignals = bulkAffiliateLinksParsed.filter((line) =>
      detectAffiliateNotPermittedSignal(line),
    ).length;
    if (notPermittedSignals > 0) {
      toast.warning(
        `${notPermittedSignals} linha(s) parecem conter erro de afiliado ("URL nao permitido").`,
        {
          description: "O lote sera processado, e as linhas invalidas ficarao em standby com erro.",
        },
      );
    }

    setIsApplyingBulkAffiliateLinks(true);
    try {
      const { data, error } = await supabase.rpc('apply_affiliate_validation_batch', {
        p_batch_id: batchId,
        p_affiliate_urls: bulkAffiliateLinksParsed,
      });
      if (error) throw error;

      const payload = (Array.isArray(data) ? data[0] : data) as
        | {
            ok?: boolean;
            error?: string | null;
            applied?: number | null;
            invalid?: number | null;
            skipped?: number | null;
            ignored_extra?: number | null;
          }
        | null;

      if (!payload?.ok) {
        toast.error('Lote nao aplicado.', {
          description: payload?.error || 'Falha na validacao do batch.',
        });
        return;
      }

      const applied = Number(payload.applied ?? 0);
      const invalid = Number(payload.invalid ?? 0);
      const skipped = Number(payload.skipped ?? 0);
      const ignoredExtra = Number(payload.ignored_extra ?? 0);
      let invalidRows: AffiliateBatchInvalidRow[] = [];

      if (invalid > 0) {
        const { data: invalidData, error: invalidFetchError } = await supabase
          .from('affiliate_validation_batch_items')
          .select('position, product_id, affiliate_url, error_message')
          .eq('batch_id', batchId)
          .eq('apply_status', 'INVALID')
          .order('position', { ascending: true });

        if (invalidFetchError) {
          toast.warning('Lote aplicado, mas sem detalhes de invalidacao.', {
            description: invalidFetchError.message,
          });
        } else {
          invalidRows = ((invalidData as Array<{
            position: number | null;
            product_id: string;
            affiliate_url: string | null;
            error_message: string | null;
          }> | null) ?? []).map((row) => ({
            position: Number(row.position ?? 0),
            product_id: row.product_id,
            product_name: productNameById.get(row.product_id) ?? null,
            affiliate_url: row.affiliate_url ?? null,
            error_message: row.error_message ?? null,
          }));
        }
      }

      setLastAffiliateBatchResult({
        batchId,
        applied,
        invalid,
        skipped,
        ignoredExtra,
        invalidRows,
      });

      if (applied > 0) {
        setBulkAffiliateLinksInput('');
      }
      setAffiliateBatchId(null);
      setAffiliateBatchCount(0);
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });

      if (applied > 0) {
        const invalidLabel = invalid > 0 ? `, ${invalid} invalida(s)` : '';
        const skippedLabel = skipped > 0 ? `, ${skipped} pendente(s)` : '';
        const extraLabel = ignoredExtra > 0 ? `, ${ignoredExtra} excedente(s)` : '';
        toast.success(`Lote aplicado: ${applied} validado(s)${invalidLabel}${skippedLabel}${extraLabel}.`);
      } else {
        toast.warning('Nenhum produto foi validado neste lote.', {
          description: 'Confira links invalidos ou gere um novo batch.',
        });
      }
    } catch (error: any) {
      toast.error('Falha ao aplicar validacao em lote.', { description: error.message });
      const message = String(error?.message ?? '').toLowerCase();
      if (message.includes('batch_expired') || message.includes('batch_not_found')) {
        setAffiliateBatchId(null);
        setAffiliateBatchCount(0);
      }
    } finally {
      setIsApplyingBulkAffiliateLinks(false);
    }
  };

  const activeProductsList =
    productTab === 'affiliate'
      ? filteredAffiliateProducts
      : productTab === 'blocked'
      ? filteredBlockedProducts
      : productTab === 'valid'
        ? filteredValidProducts
        : filteredAllProductsDeduped;

  const openMismatchByProductId = useMemo(() => {
    const map = new Map<string, PriceMismatchCase>();
    for (const item of priceMismatchCases) {
      if (!item.product_id) continue;
      const current = map.get(item.product_id);
      if (!current || Number(item.delta_pct ?? 0) > Number(current.delta_pct ?? 0)) {
        map.set(item.product_id, item);
      }
    }
    return map;
  }, [priceMismatchCases]);

  const criticalMismatchIds = useMemo(() => {
    const set = new Set<string>();
    for (const item of priceMismatchCases) {
      const deltaAbs = Number(item.delta_abs ?? 0);
      const deltaPct = Number(item.delta_pct ?? 0);
      if (deltaPct >= 50 || deltaAbs >= 30) {
        set.add(item.product_id);
      }
    }
    return set;
  }, [priceMismatchCases]);

  const inactiveReasons = useMemo(() => {
    const values = new Set<string>();
    for (const product of products) {
      const reason = String((product as any).deactivation_reason || "").trim();
      if (reason) values.add(reason);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [products]);

  const quickFilteredProducts = useMemo(() => {
    const matchesQuickFilter = (product: Product) => {
      const status = String(product.status || "").toLowerCase();
      const isInactive = !Boolean(product.is_active);
      const isStandby = isStandbyLikeProduct(product);
      const hasAffiliateInvalid = hasAffiliateValidationError(product);
      const sourceKind = detectMlSourceKind(product);
      const hasOpenMismatch =
        String((product as any).price_mismatch_status || "").toUpperCase() === "OPEN" ||
        openMismatchByProductId.has(product.id);
      const hasResolvedMismatch =
        String((product as any).price_mismatch_status || "").toUpperCase() === "RESOLVED" &&
        !openMismatchByProductId.has(product.id);
      const hasCriticalMismatch = criticalMismatchIds.has(product.id);
      const inactiveReason = String((product as any).deactivation_reason || "").trim();

      switch (productQuickFilter) {
        case "standby":
          return isStandby;
        case "ok_inactive":
          return status === "ok" && isInactive;
        case "inactive_reason":
          return isInactive && (inactiveReasonFilter === "all" || inactiveReason === inactiveReasonFilter);
        case "source_item":
          return sourceKind === "ITEM";
        case "source_catalog":
          return sourceKind === "CATALOG";
        case "mismatch_open":
          return hasOpenMismatch;
        case "mismatch_critical":
          return hasCriticalMismatch;
        case "mismatch_resolved":
          return hasResolvedMismatch;
        case "affiliate_invalid":
          return hasAffiliateInvalid;
        default:
          return true;
      }
    };
    return activeProductsList.filter(matchesQuickFilter);
  }, [
    activeProductsList,
    criticalMismatchIds,
    inactiveReasonFilter,
    openMismatchByProductId,
    productQuickFilter,
  ]);

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

  if (isAdminAccessError(healthDashboardError)) {
    return (
      <Layout>
        <div className="min-h-screen bg-secondary/30">
          <div className="container-tight py-8">
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-6">
              <h1 className="text-xl font-semibold text-foreground">Acesso restrito ao administrador</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Sua sessão não possui permissão para acessar este painel.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => navigate('/')}>Voltar Home</Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    navigate('/');
                  }}
                >
                  Sair
                </Button>
                <Button variant="outline" onClick={() => window.location.reload()}>Recarregar</Button>
              </div>
            </div>
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
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shadow-sm">
                <img
                  src={logoImage}
                  alt="ArsenalFit"
                  className="h-8 w-8 object-contain"
                />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">Painel Admin</h1>
                <p className="text-muted-foreground">Automação, curadoria e monitoramento premium</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={handleSyncNow} disabled>
                Sincronização desativada
              </Button>
              <Button variant="outline" onClick={() => navigate('/admin/price-sync')}>
                Relatório do robô
              </Button>
              <Button variant="secondary" onClick={() => navigate('/admin/price-adjustments')}>
                Ajustes de preço
              </Button>
              <Button onClick={() => handleOpenDialog()} className="btn-energy">
                <Plus className="h-4 w-4 mr-2" />
                Novo Produto
              </Button>
            </div>
          </div>

          {/* Automação do Robô */}
          <div className="bg-card rounded-2xl p-6 mb-6 border border-border shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center shadow-sm mt-0.5">
                  <img
                    src={logoImage}
                    alt="ArsenalFit"
                    className="h-6 w-6 object-contain"
                  />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Automação do Robô</h2>
                  <p className="text-sm text-muted-foreground">
                    Monitoramento contínuo de preços e relatórios diários.
                  </p>
                  {isSyncStale && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      {isSyncFailed
                        ? "Falha no último sync. Reagendamos automaticamente."
                        : "Sync atrasado. Reagendamos automaticamente."}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={handleForceSync} disabled={isSyncing}>
                  {isSyncing ? 'Agendando...' : 'Agendar Sync Agora'}
                </Button>
                <Button variant="outline" onClick={() => navigate('/admin/price-sync')}>
                  Ver relatório completo
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
                  <Activity className="h-4 w-4" /> Promoções
                </div>
                <p className="mt-2 text-2xl font-bold text-primary">{automationStats.promos}</p>
              </div>
              <div
                className={`p-4 rounded-lg border ${
                  isSyncStale ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-secondary/30'
                }`}
              >
                <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
                  <Clock className="h-4 w-4" /> último sync
                </div>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {formatDateTime(lastSyncCandidate)}
                </p>
                <p className={`mt-1 text-xs ${isSyncStale ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {syncAgeLabel}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">Horário local</p>
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
                  <Timer className="h-4 w-4" /> Próxima checagem
                </div>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {formatDateTime(nextCheckEffective || automationStats.nextCheck)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">Horário local</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{syncScheduleNote}</p>
                {showNextProductDue && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Próximo produto vence: {formatDateTime(new Date(nextProductDueMs as number).toISOString())}
                  </p>
                )}
              </div>
              <div className="p-4 rounded-lg border border-border bg-secondary/30">
                <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
                  <AlertCircle className="h-4 w-4" /> Bloqueados
                </div>
                <p className="mt-2 text-2xl font-bold text-warning">{anomalyStats.blocked}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  403 no último run: {latestSyncRun?.total_403 ?? 0}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Alertas na janela: {blockedAnomalies.length}
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg border border-border bg-secondary/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Mail className="h-4 w-4" /> Relatórios enviados
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/admin/price-sync')}>
                    Ver tudo
                  </Button>
                </div>
                {loadingReports ? (
                  <p className="text-sm text-muted-foreground">Carregando...</p>
                ) : reports.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum relatório registrado ainda.</p>
                ) : (
                  <div className="space-y-3">
                    {visibleReports.map((report) => (
                      <div key={report.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                        <div>
                          <p className="font-medium text-foreground">{formatDateTime(report.sent_at)}</p>
                          <p className="text-xs text-muted-foreground">
                            {report.recipients?.join(', ') || 'Destinatário não informado'}
                          </p>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {report.total} mudanças . {report.drops} quedas . {report.promos} promos
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs px-2 py-1 rounded-full ${
                              (report.delivery_status || report.status) === 'sent'
                                ? 'bg-success/10 text-success'
                                : 'bg-destructive/10 text-destructive'
                            }`}
                          >
                            {(report.delivery_status || report.status) === 'sent' ? 'Enviado' : 'Falhou'}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 text-xs"
                            disabled={Boolean(resendingReportDate && resendingReportDate === getReportDateKey(report))}
                            onClick={() => handleResendPriceReport(report)}
                          >
                            {resendingReportDate && resendingReportDate === getReportDateKey(report)
                              ? 'Reenviando...'
                              : 'Reenviar'}
                          </Button>
                        </div>
                      </div>
                    ))}
                    {hasMoreReports && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full justify-center"
                        onClick={() => setReportsExpanded((current) => !current)}
                      >
                        {reportsExpanded
                          ? 'Ver menos'
                          : `Ver mais (${reports.length - REPORTS_PREVIEW_COUNT})`}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <div className="p-4 rounded-lg border border-border bg-secondary/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <CheckCircle className="h-4 w-4" /> Checklist diario
                  </div>
                  {latestDailyRunReport && (
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        latestDailyRunReport.overall_status === 'PASS'
                          ? 'bg-success/10 text-success'
                          : 'bg-destructive/10 text-destructive'
                      }`}
                    >
                      {latestDailyRunReport.overall_status}
                    </span>
                  )}
                </div>
                {loadingDailyRunReports ? (
                  <p className="text-sm text-muted-foreground">Carregando...</p>
                ) : !latestDailyRunReport ? (
                  <p className="text-sm text-muted-foreground">Nenhum checklist diario salvo ainda.</p>
                ) : (
                  <div className="space-y-2 text-sm">
                    <p className="text-xs text-muted-foreground">
                      Run: {latestDailyRunReport.run_id ? latestDailyRunReport.run_id.slice(0, 8) : 'N/D'} .{' '}
                      {formatDateTime(latestDailyRunReport.created_at)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Falhas criticas: {criticalChecklistFails.length} / {latestDailyRunReport.critical_failures ?? 0}
                    </p>
                    {failedChecklistItems.length === 0 ? (
                      <p className="text-xs text-success">Todos os itens do checklist passaram.</p>
                    ) : (
                      <div className="space-y-1">
                        {failedChecklistItems.slice(0, 4).map((item) => (
                          <p key={item.key} className="text-xs text-destructive">
                            - {item.label}
                            {item.critical ? ' (critico)' : ''}
                          </p>
                        ))}
                        {failedChecklistItems.length > 4 && (
                          <p className="text-xs text-muted-foreground">
                            +{failedChecklistItems.length - 4} item(ns) com falha
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>


              <div className="p-4 rounded-lg border border-border bg-secondary/30">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
                  <TrendingDown className="h-4 w-4" /> Mudanças recentes
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Total (janela)</p>
                    <p className="text-lg font-semibold">{priceChangeStats.total}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Promoções</p>
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
          {/* Saúde do Sistema */}
          <div className="bg-card rounded-xl p-4 mb-6 border border-border">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Saude do Sistema</h2>
                <p className="text-sm text-muted-foreground">
                  Semaforo operacional de automacao, afiliado e qualidade de preco.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${healthGoNoGoClass}`}>
                  GO/NO-GO: {healthGoNoGoState}
                </span>
                <Button
                  variant="outline"
                  onClick={() => refetchHealthDashboard()}
                  disabled={loadingHealthDashboard}
                >
                  {loadingHealthDashboard ? "Atualizando..." : "Atualizar painel"}
                </Button>
              </div>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">{healthGoNoGoReason}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Atualizado em: {healthUpdatedAtLabel}
            </p>
            {healthDashboardError && (
              <p className="mt-1 text-[11px] text-destructive">
                Falha ao atualizar painel: {(healthDashboardError as Error).message || "erro desconhecido"}
              </p>
            )}

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-xs uppercase text-muted-foreground">Price check</p>
                <p className="mt-1 text-base font-semibold text-foreground">
                  Runs 2h: {healthDashboard?.automation?.price_check_scheduler?.runs_last_2h ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  Ultimo run: {formatDateTime(healthDashboard?.automation?.price_check_scheduler?.last_run ?? null)}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-xs uppercase text-muted-foreground">Catalog ingest</p>
                <p className="mt-1 text-base font-semibold text-foreground">
                  +{healthDashboard?.automation?.catalog_ingest?.last_inserted ?? 0} inseridos
                </p>
                <p className="text-xs text-muted-foreground">
                  Ultimo run: {formatDateTime(healthDashboard?.automation?.catalog_ingest?.last_run ?? null)}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-xs uppercase text-muted-foreground">Price report</p>
                <p className="mt-1 text-base font-semibold text-foreground">
                  {healthDashboard?.automation?.price_sync_report?.delivery_status || 'sem status'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Ultimo: {formatDateTime(healthDashboard?.automation?.price_sync_report?.last_run ?? null)}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-xs uppercase text-muted-foreground">Catalogo</p>
                <p className="mt-1 text-base font-semibold text-foreground">
                  Standby: {healthDashboard?.catalog?.standby ?? 0} . Ativo: {healthDashboard?.catalog?.active_ok ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  Erros afiliado: {healthDashboard?.catalog?.affiliate_errors_total ?? 0}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-xs uppercase text-muted-foreground">Suspect price</p>
                <p className="mt-1 text-lg font-semibold text-warning">
                  {healthDashboard?.prices?.suspect_price ?? 0}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-xs uppercase text-muted-foreground">Divergencias abertas</p>
                <p className="mt-1 text-lg font-semibold text-destructive">
                  {healthDashboard?.prices?.mismatch_open ?? 0}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-xs uppercase text-muted-foreground">Com Pix</p>
                <p className="mt-1 text-lg font-semibold text-success">
                  {healthDashboard?.prices?.pix_price ?? 0}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-xs uppercase text-muted-foreground">Com promocao</p>
                <p className="mt-1 text-lg font-semibold text-primary">
                  {healthDashboard?.prices?.promotion_ready ?? 0}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={handleRunPriceAuditSample} disabled={isRunningPriceAudit}>
                {isRunningPriceAudit ? 'Auditando...' : 'Rodar auditoria de precos agora (amostra)'}
              </Button>
              <Button
                variant="outline"
                onClick={handleRecheckSuspectPricesNow}
                disabled={isRecheckingSuspect}
              >
                {isRecheckingSuspect ? 'Rechecando...' : 'Rechecar precos SUSPECT agora'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setProductTab('affiliate');
                  setShowOnlyAffiliateErrors(true);
                }}
              >
                Abrir lista de STANDBY com erros
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const latest = reports[0];
                  if (!latest) {
                    toast.error('Nenhum relatorio disponivel para reenvio.');
                    return;
                  }
                  handleResendPriceReport(latest);
                }}
                disabled={!reports.length}
              >
                Reenviar relatorio diario
              </Button>
              <Button
                variant="outline"
                onClick={handleCopyPendingAffiliateSourceUrls}
                disabled={isCreatingAffiliateBatch || !pendingAffiliateProducts.length}
              >
                Exportar batch /sec/ (30)
              </Button>
            </div>

            <div className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                <h3 className="text-sm font-semibold text-foreground">Falhas de afiliado (top 10)</h3>
                {healthAffiliateErrors.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">Sem falhas de afiliado abertas.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {healthAffiliateErrors.map((item) => (
                      <div key={item.id} className="rounded border border-warning/30 bg-warning/5 p-2">
                        <p className="text-xs font-medium text-foreground">{item.name || item.id}</p>
                        <p className="text-[11px] text-warning">
                          {item.affiliate_validation_error || item.affiliate_validation_status || 'Erro de afiliado'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                <h3 className="text-sm font-semibold text-foreground">Divergencias criticas (top 10)</h3>
                {healthMismatchTop.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">Sem divergencias abertas.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {healthMismatchTop.map((item) => (
                      <div key={item.id} className="rounded border border-destructive/30 bg-destructive/5 p-2">
                        <p className="text-xs font-medium text-foreground">{item.product_name || item.id}</p>
                        <p className="text-[11px] text-destructive">
                          Site: {formatPrice(item.site_price ?? null)} . ML: {formatPrice(item.ml_price ?? null)} . Delta: {Number(item.delta_pct ?? 0).toFixed(1)}%
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Produtos */}
          <div className="bg-card rounded-xl p-4 mb-6 border border-border">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Produtos</h2>
                <p className="text-sm text-muted-foreground">
                  Status de validação, Pix manual/automático e filtros rápidos.
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
                onValueChange={(value) =>
                  setProductTab(value as 'all' | 'valid' | 'blocked' | 'affiliate')
                }
              >
                <TabsList className="w-full sm:w-auto">
                  <TabsTrigger value="all">Todos ({filteredAllProductsDeduped.length})</TabsTrigger>
                  <TabsTrigger value="valid">Validação ok ({filteredValidProducts.length})</TabsTrigger>
                  <TabsTrigger value="blocked">Bloqueados ({filteredBlockedProducts.length})</TabsTrigger>
                  <TabsTrigger value="affiliate">
                    Afiliado ({filteredAffiliateProducts.length})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <Select
                value={productQuickFilter}
                onValueChange={(value) =>
                  setProductQuickFilter(
                    value as
                      | "all"
                      | "standby"
                      | "ok_inactive"
                      | "inactive_reason"
                      | "source_item"
                      | "source_catalog"
                      | "mismatch_open"
                      | "mismatch_critical"
                      | "mismatch_resolved"
                      | "affiliate_invalid",
                  )
                }
              >
                <SelectTrigger className="w-full sm:w-[260px]">
                  <SelectValue placeholder="Filtro rapido" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Filtro: Todos</SelectItem>
                  <SelectItem value="standby">Standby</SelectItem>
                  <SelectItem value="ok_inactive">OK + Inativo</SelectItem>
                  <SelectItem value="inactive_reason">Inativo por motivo</SelectItem>
                  <SelectItem value="source_item">Source ITEM</SelectItem>
                  <SelectItem value="source_catalog">Source CATALOG</SelectItem>
                  <SelectItem value="mismatch_open">Divergencias abertas</SelectItem>
                  <SelectItem value="mismatch_critical">Divergencias criticas</SelectItem>
                  <SelectItem value="mismatch_resolved">Divergencias resolvidas</SelectItem>
                  <SelectItem value="affiliate_invalid">Afiliado invalido</SelectItem>
                </SelectContent>
              </Select>
              {productQuickFilter === "inactive_reason" && (
                <Select value={inactiveReasonFilter} onValueChange={setInactiveReasonFilter}>
                  <SelectTrigger className="w-full sm:w-[240px]">
                    <SelectValue placeholder="Motivo de inativacao" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os motivos</SelectItem>
                    {inactiveReasons.map((reason) => (
                      <SelectItem key={reason} value={reason}>
                        {reason}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Price Sync Changes */}
          <div className="bg-card rounded-xl p-4 mb-6 border border-border">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Mudanças de preço</h2>
                <p className="text-sm text-muted-foreground">últimas alterações capturadas pelo robô</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleForceSync}
                  disabled={isSyncing}
                >
                  {isSyncing ? 'Agendando...' : 'Forçar sync'}
                </Button>
                <Select value={changesWindow} onValueChange={(value) => setChangesWindow(value as '24h' | '7d' | '30d')}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">últimas 24h</SelectItem>
                    <SelectItem value="7d">últimos 7 dias</SelectItem>
                    <SelectItem value="30d">últimos 30 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
              <div className="rounded-lg bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">Mudanças</p>
                <p className="text-lg font-semibold text-foreground">{priceChangeStats.total}</p>
              </div>
              <div className="rounded-lg bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">Promoções</p>
                <p className="text-lg font-semibold text-foreground">{priceChangeStats.promos}</p>
              </div>
              <div className="rounded-lg bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">Reduções</p>
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
                  <p className="mt-2 text-sm text-muted-foreground">Carregando mudanças...</p>
                </div>
              ) : priceChanges.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  Nenhuma mudança registrada nesse período.
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

          {/* Avisos de verificação */}
          <div className="bg-card rounded-xl p-4 mb-6 border border-border">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Avisos de verificação</h2>
                <p className="text-sm text-muted-foreground">
                  Produtos com bloqueio de validação de preço ou inconsistências detectadas.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => navigate('/admin/price-sync')}>
                  Ver relatório completo
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
                <p className="text-sm text-muted-foreground">Nenhuma divergência registrada.</p>
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
                        Catálogo: {anomalyStats.catalogFallback}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={anomaliesWindow} onValueChange={(value) => setAnomaliesWindow(value as '24h' | '7d' | '30d')}>
                        <SelectTrigger className="w-[140px]">
                          <SelectValue placeholder="Período" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="24h">últimas 24h</SelectItem>
                          <SelectItem value="7d">últimos 7 dias</SelectItem>
                          <SelectItem value="30d">últimos 30 dias</SelectItem>
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
                            MLB: {row.external_id || '-'} . Catálogo: {row.catalog_id || '-'}
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
                          Catálogo: {row.price_from_catalog !== null ? formatPrice(row.price_from_catalog) : '-'}
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
                            Abrir anúncio
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Divergências de Preço */}
          <div className="bg-card rounded-xl p-4 mb-6 border border-border">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Divergencias de preco</h2>
                <p className="text-sm text-muted-foreground">
                  Casos abertos de diferenca relevante entre preco salvo e referencia do Mercado Livre.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full bg-secondary/40 px-3 py-1 text-xs font-semibold text-foreground">
                Abertos: {priceMismatchCases.length}
              </span>
            </div>

            <div className="mt-4">
              {loadingPriceMismatchCases ? (
                <p className="text-sm text-muted-foreground">Carregando divergencias...</p>
              ) : priceMismatchCases.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma divergencia aberta no momento.</p>
              ) : (
                <div className="space-y-3">
                  {priceMismatchCases.map((item) => {
                    const mismatchEval = evaluatePriceMismatch({
                      sitePrice: item.site_price,
                      mlPrice: item.ml_price,
                    });
                    const canRemoveMismatchFromStandby = canSoftRemoveStandbyProduct({
                      status: item.product?.status,
                      isActive: item.product?.is_active,
                      affiliateLink: null,
                    });
                    return (
                    <div
                      key={item.id}
                      className={`rounded-lg border p-3 ${
                        mismatchEval.isCritical
                          ? "border-destructive/40 bg-destructive/5"
                          : "border-border bg-secondary/30"
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">{item.product?.name || item.product_id}</p>
                          <p className="text-xs text-muted-foreground">
                            Site: {formatPrice(item.site_price)} . ML: {formatPrice(item.ml_price)} . Delta: {item.delta_pct.toFixed(1)}% ({formatPrice(item.delta_abs)})
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Fonte: {item.source || '-'} . Ultima auditoria: {formatDateTime(item.last_audit_at)}
                          </p>
                          <p className={`text-[11px] mt-1 ${mismatchEval.isCritical ? "text-destructive" : "text-warning"}`}>
                            {mismatchEval.isCritical ? "Critico" : "Alerta"} . delta calculado: {mismatchEval.deltaPct.toFixed(1)}%
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={mismatchActionLoadingId === `${item.id}:RECHECK_NOW`}
                            onClick={() => handlePriceMismatchAction(item.id, "RECHECK_NOW")}
                          >
                            Rechecar agora
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={mismatchActionLoadingId === `${item.id}:APPLY_ML_PRICE`}
                            onClick={() => handlePriceMismatchAction(item.id, "APPLY_ML_PRICE")}
                          >
                            Aplicar preco ML
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={mismatchActionLoadingId === `${item.id}:MARK_RESOLVED`}
                            onClick={() => handlePriceMismatchAction(item.id, "MARK_RESOLVED")}
                          >
                            Marcar resolvido
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={mismatchActionLoadingId === `${item.id}:MOVE_TO_STANDBY`}
                            onClick={() => handlePriceMismatchAction(item.id, "MOVE_TO_STANDBY")}
                          >
                            Mover para standby
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-destructive border-destructive/30 hover:text-destructive"
                            disabled={!item.product_id || !canRemoveMismatchFromStandby}
                            onClick={() => openRemoveStandbyDialog([item.product_id])}
                          >
                            Excluir (standby)
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

          {/* Products List */}
          {loadingProducts ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Carregando produtos...</p>
            </div>
          ) : quickFilteredProducts.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-xl border border-border">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">Nenhum produto encontrado</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery
                  ? 'Tente outro termo de busca'
                  : productQuickFilter !== 'all'
                    ? 'Nenhum produto corresponde ao filtro rápido selecionado.'
                  : productTab === 'affiliate'
                    ? 'Nenhum produto do Mercado Livre encontrado para vincular afiliado.'
                  : productTab === 'blocked'
                    ? 'Nenhum produto bloqueado até o momento.'
                    : productTab === 'valid'
                      ? 'Nenhum produto com validação ok encontrado.'
                      : 'Comece adicionando seu primeiro produto'}
              </p>
              {!searchQuery && productTab === 'all' && (
                <Button onClick={() => handleOpenDialog()} className="btn-energy">
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Produto
                </Button>
              )}
            </div>
          ) : productTab === 'affiliate' ? (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="p-4 border-b border-border bg-secondary/40 text-sm text-muted-foreground space-y-3">
                <p>
                  Aba de afiliados: somente link curto <code>mercadolivre.com/sec/...</code> é
                  considerado validado para vitrine.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="rounded-md bg-background border border-border px-3 py-2">
                    <p className="text-[11px] uppercase text-muted-foreground">Total ML</p>
                    <p className="text-base font-semibold text-foreground">{affiliateStatusStats.total}</p>
                  </div>
                  <div className="rounded-md bg-success/10 border border-success/20 px-3 py-2">
                    <p className="text-[11px] uppercase text-success">Afiliado OK</p>
                    <p className="text-base font-semibold text-foreground">{affiliateStatusStats.ok}</p>
                  </div>
                  <div className="rounded-md bg-warning/10 border border-warning/20 px-3 py-2">
                    <p className="text-[11px] uppercase text-warning">Pendentes</p>
                    <p className="text-base font-semibold text-foreground">{affiliateStatusStats.pending}</p>
                  </div>
                </div>
                {affiliateStatusStats.hiddenBlockedByApi > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Bloqueados pela API ocultados nesta aba: {affiliateStatusStats.hiddenBlockedByApi}.
                  </p>
                )}
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant={showOnlyAffiliateErrors ? "default" : "outline"}
                      size="sm"
                      onClick={() => setShowOnlyAffiliateErrors((prev) => !prev)}
                    >
                      {showOnlyAffiliateErrors ? "Mostrando apenas erros" : "Mostrar somente erros de afiliado"}
                    </Button>
                    {selectedStandbyProductIds.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {selectedStandbyProductIds.length} standby selecionado(s).
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!removableStandbyProducts.length}
                      onClick={() =>
                        setSelectedStandbyIds((prev) => {
                          const hasUnselected = removableStandbyProducts.some(
                            (product) => !prev[product.id],
                          );
                          if (!hasUnselected) return {};
                          const next: Record<string, boolean> = {};
                          removableStandbyProducts.forEach((product) => {
                            next[product.id] = true;
                          });
                          return next;
                        })
                      }
                    >
                      {selectedStandbyProductIds.length === removableStandbyProducts.length &&
                      removableStandbyProducts.length > 0
                        ? "Limpar selecao"
                        : "Selecionar standby"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/30 hover:text-destructive"
                      disabled={!selectedStandbyProductIds.length}
                      onClick={() => openRemoveStandbyDialog(selectedStandbyProductIds)}
                    >
                      Excluir selecionados
                    </Button>
                  </div>
                </div>
                <div className="rounded-md border border-border bg-background p-3 space-y-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <p className="text-xs text-muted-foreground">
                      Fluxo em lote: copie as URLs pendentes em ordem, gere os links no Mercado Livre
                      e cole os links curtos <code>/sec/</code> na mesma ordem (1 por linha, maximo
                      de {MAX_BULK_AFFILIATE_LINKS} links por envio).
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCopyPendingAffiliateSourceUrls}
                      disabled={isCreatingAffiliateBatch || !pendingAffiliateProducts.length}
                    >
                      {isCreatingAffiliateBatch
                        ? 'Gerando lote...'
                        : `Gerar lote e copiar ${MAX_BULK_AFFILIATE_LINKS} URLs`}
                    </Button>
                  </div>
                  {hasOpenAffiliateBatch && (
                    <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground">
                      Batch atual: <code>{affiliateBatchId}</code> ({affiliateBatchCount} item(ns)).
                      Cole os links <code>/sec/</code> na mesma ordem deste batch.
                    </div>
                  )}
                  <Textarea
                    value={bulkAffiliateLinksInput}
                    onChange={(e) => setBulkAffiliateLinksInput(e.target.value)}
                    placeholder={
                      "https://mercadolivre.com/sec/abc123\nhttps://mercadolivre.com/sec/def456"
                    }
                    rows={5}
                  />
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <p className="text-xs text-muted-foreground">
                      Pendentes: <span className="font-semibold text-foreground">{pendingAffiliateProducts.length}</span>
                      {" "}| Lote maximo:{" "}
                      <span className="font-semibold text-foreground">{MAX_BULK_AFFILIATE_LINKS}</span>
                      {" "}| Linhas coladas:{" "}
                      <span className="font-semibold text-foreground">{bulkAffiliateLinksParsed.length}</span>
                    </p>
                    <Button
                      type="button"
                      onClick={handleSaveAffiliateLinksBulk}
                      disabled={
                        isApplyingBulkAffiliateLinks ||
                        !hasOpenAffiliateBatch ||
                        !bulkAffiliateLinksParsed.length ||
                        bulkAffiliateLinksParsed.length > MAX_BULK_AFFILIATE_LINKS
                      }
                    >
                      {isApplyingBulkAffiliateLinks ? "Validando..." : "Validar em lote na ordem"}
                    </Button>
                  </div>
                  {lastAffiliateBatchResult && (
                    <div className="rounded-md border border-border bg-secondary/30 p-3 space-y-2">
                      <p className="text-xs text-foreground">
                        Ultimo lote: <code>{lastAffiliateBatchResult.batchId}</code> |{" "}
                        {lastAffiliateBatchResult.applied} validado(s),{" "}
                        {lastAffiliateBatchResult.invalid} invalida(s),{" "}
                        {lastAffiliateBatchResult.skipped} pendente(s),{" "}
                        {lastAffiliateBatchResult.ignoredExtra} excedente(s).
                      </p>
                      {lastAffiliateBatchResult.invalidRows.length > 0 && (
                        <div className="space-y-2">
                          {lastAffiliateBatchResult.invalidRows.map((row) => (
                            <div
                              key={`${lastAffiliateBatchResult.batchId}-${row.position}-${row.product_id}`}
                              className="rounded-md border border-warning/30 bg-warning/5 px-2 py-2"
                            >
                              <p className="text-xs font-semibold text-foreground">
                                Linha {row.position}: {row.product_name || row.product_id}
                              </p>
                              <p className="text-xs text-warning">
                                Motivo: {formatAffiliateBatchError(row.error_message)}
                              </p>
                              {row.affiliate_url && (
                                <p className="text-[11px] text-muted-foreground break-all">
                                  Link informado: <code>{row.affiliate_url}</code>
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="divide-y divide-border">
                {filteredAffiliateProducts.map((product) => {
                  const draftValue = getAffiliateDraftValue(product);
                  const validation =
                    draftValue.trim().length > 0
                      ? isValidAffiliateLink(draftValue)
                      : { valid: false, error: null as string | null, marketplace: null as string | null };
                  const isSecLink = isMercadoLivreSecLink(draftValue);
                  const isSaving = savingAffiliateProductId === product.id;
                  const isStandbyRemovable = canSoftRemoveStandbyProduct({
                    status: product.status,
                    isActive: product.is_active,
                    affiliateLink: product.affiliate_link,
                  });
                  const isSelectedForRemoval = Boolean(selectedStandbyIds[product.id]);
                  return (
                    <div key={product.id} className="p-4 space-y-3">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0 flex items-start gap-2">
                          {isStandbyRemovable ? (
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                              checked={isSelectedForRemoval}
                              onChange={(event) =>
                                handleToggleStandbySelection(product.id, event.target.checked)
                              }
                              aria-label={`Selecionar ${product.name}`}
                            />
                          ) : (
                            <span className="mt-1 inline-flex h-4 w-4 rounded-full border border-border/60 bg-secondary/60" />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-foreground line-clamp-1">{product.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {product.external_id || "Sem MLB"} . {product.status || (product.is_active ? "active" : "inativo")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {product.is_active ? (
                            <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-1 text-xs font-semibold text-success">
                              Ativo
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                              Inativo
                            </span>
                          )}
                          {isMercadoLivreSecLink(product.affiliate_link) ? (
                            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                              Afiliado OK
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-warning/10 px-2 py-1 text-xs font-semibold text-warning">
                              Pendente
                            </span>
                          )}
                          {hasAffiliateValidationError(product) && (
                            <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">
                              Erro afiliado
                            </span>
                          )}
                        </div>
                      </div>

                      {product.affiliate_validation_error && (
                        <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2">
                          <p className="text-xs text-warning">{product.affiliate_validation_error}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]">
                        <Input
                          value={draftValue}
                          onChange={(e) => handleAffiliateDraftChange(product.id, e.target.value)}
                          placeholder="https://mercadolivre.com/sec/xxxxx"
                        />
                        <Button
                          type="button"
                          onClick={() => handleSaveAffiliateLink(product)}
                          disabled={isSaving || !draftValue.trim() || !validation.valid || !isSecLink}
                        >
                          {isSaving ? "Salvando..." : "Salvar e ativar"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="text-destructive border-destructive/30 hover:text-destructive"
                          disabled={!isStandbyRemovable}
                          onClick={() => openRemoveStandbyDialog([product.id])}
                        >
                          Excluir
                        </Button>
                      </div>
                      {draftValue.trim().length > 0 && !validation.valid && (
                        <p className="text-xs text-destructive">
                          {validation.error || "Link de afiliado inválido."}
                        </p>
                      )}
                      {draftValue.trim().length > 0 && validation.valid && !isSecLink && (
                        <p className="text-xs text-warning">
                          Cole o link curto <code>/sec/</code> para validar sua vitrine.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
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
                    {quickFilteredProducts.map((product) => {
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
                                <AlertCircle className="h-3 w-3" /> Sem validação
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
              {quickFilteredProducts.map((product) => {
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
                        Sem validação
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
                <Label htmlFor="short_description">Descrição curta</Label>
                <Input
                  id="short_description"
                  value={formData.short_description}
                  onChange={(e) => setFormData(prev => ({ ...prev, short_description: e.target.value }))}
                  placeholder="Uma linha sobre o produto"
                />
              </div>

              <div>
                <Label htmlFor="description">Descrição completa</Label>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                <Label htmlFor="pix_price">Preço Pix (opcional)</Label>
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
                  <Label>Gênero da roupa *</Label>
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
                className={sourceUrlDuplicate ? "border-destructive" : ""}
              />
              {sourceUrlDuplicate && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1" role="alert">
                  <AlertCircle className="h-3 w-3" />
                  Já existe um produto com este link: {sourceUrlDuplicate.name}
                </p>
              )}
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
                className={affiliateLinkError || affiliateLinkDuplicate ? "border-destructive" : ""}
              />
              {affiliateLinkError ? (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {affiliateLinkError}
                </p>
              ) : affiliateLinkDuplicate ? (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1" role="alert">
                  <AlertCircle className="h-3 w-3" />
                  Já existe um produto com este link: {affiliateLinkDuplicate.name}
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
                  Link sem ID MLB. Sem ele o robô não sincroniza Preço/imagem.
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

      <Dialog
        open={removeStandbyDialogOpen}
        onOpenChange={(open) => {
          setRemoveStandbyDialogOpen(open);
          if (!open && !isRemovingStandby) {
            setStandbyRemoveTargets([]);
            setStandbyRemoveNote("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Excluir produto(s) em standby</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Essa acao remove da fila e da vitrine via soft delete (status arquivado), mantendo historico para auditoria.
            </p>
            <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
              Produtos selecionados: <span className="font-semibold text-foreground">{standbyRemoveTargets.length}</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="standby-remove-reason">Motivo *</Label>
              <Select
                value={standbyRemoveReason}
                onValueChange={(value) =>
                  setStandbyRemoveReason(value as (typeof STANDBY_REMOVE_REASONS)[number]["value"])
                }
              >
                <SelectTrigger id="standby-remove-reason">
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {STANDBY_REMOVE_REASONS.map((reason) => (
                    <SelectItem key={reason.value} value={reason.value}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="standby-remove-note">Observacao (opcional)</Label>
              <Textarea
                id="standby-remove-note"
                rows={3}
                value={standbyRemoveNote}
                onChange={(event) => setStandbyRemoveNote(event.target.value)}
                placeholder="Detalhe adicional para auditoria..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRemoveStandbyDialogOpen(false)}
                disabled={isRemovingStandby}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={isRemovingStandby || !standbyRemoveTargets.length}
                onClick={handleBulkRemoveStandby}
              >
                {isRemovingStandby ? "Excluindo..." : "Confirmar exclusao"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
















