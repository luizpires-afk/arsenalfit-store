import { useMemo, useState } from "react";
import { Layout } from "@/Components/layout/Layout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/Components/ui/button";
import { Input } from "@/Components/ui/input";
import { Badge } from "@/Components/ui/badge";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { LineChart, TrendingDown, TrendingUp, RefreshCcw, Search } from "lucide-react";

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
    price: number;
    previous_price: number | null;
  } | null;
}

const windowOptions = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
];

const formatPrice = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const getSourceLabel = (source?: string | null) => {
  if (source === "catalog") return "Catálogo";
  if (source === "public") return "Público";
  if (source === "auth") return "Autenticado";
  if (source === "scraper") return "Scraper";
  return "N/D";
};

const getSourceBadgeClass = (source?: string | null) => {
  if (source === "catalog") return "bg-primary/10 text-primary";
  if (source === "public") return "bg-warning/10 text-warning";
  if (source === "auth") return "bg-success/10 text-success";
  if (source === "scraper") return "bg-cyan-500/10 text-cyan-600";
  return "bg-muted text-muted-foreground";
};

export default function PriceSyncReport() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [windowFilter, setWindowFilter] = useState<"24h" | "7d" | "30d">("24h");
  const [search, setSearch] = useState("");
  const [onlyDrops, setOnlyDrops] = useState(false);

  const since = useMemo(() => {
    const now = new Date();
    const date = new Date(now);
    if (windowFilter === "24h") date.setHours(now.getHours() - 24);
    if (windowFilter === "7d") date.setDate(now.getDate() - 7);
    if (windowFilter === "30d") date.setDate(now.getDate() - 30);
    return date.toISOString();
  }, [windowFilter]);

  const { data: changes = [], isLoading, refetch } = useQuery({
    queryKey: ["price-sync-report", windowFilter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_sync_changes")
        .select(
          "id, created_at, product_id, marketplace, external_id, old_price, new_price, discount_percentage, is_on_sale, source, product:products(id, name, slug, image_url, price, previous_price)",
        )
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      return (data as unknown as PriceSyncChange[]) || [];
    },
    enabled: isAdmin,
  });

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return changes.filter((item) => {
      if (onlyDrops && !(item.old_price !== null && item.new_price < item.old_price)) {
        return false;
      }
      if (!query) return true;
      const name = item.product?.name?.toLowerCase() ?? "";
      const external = item.external_id?.toLowerCase() ?? "";
      return name.includes(query) || external.includes(query);
    });
  }, [changes, search, onlyDrops]);

  const stats = useMemo(() => {
    const total = changes.length;
    const drops = changes.filter((item) => item.old_price !== null && item.new_price < item.old_price).length;
    const increases = changes.filter((item) => item.old_price !== null && item.new_price > item.old_price).length;
    const promos = changes.filter((item) => item.is_on_sale).length;
    return { total, drops, increases, promos };
  }, [changes]);

  const handleRefresh = async () => {
    try {
      await refetch();
      toast.success("Relatório atualizado.");
    } catch (error: any) {
      toast.error("Falha ao atualizar relatório", { description: error.message });
    }
  };

  if (authLoading) return null;
  if (!isAdmin) return null;

  return (
    <Layout>
      <div className="min-h-screen bg-secondary/30">
        <div className="container-tight py-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Relatório do Robô</h1>
              <p className="text-muted-foreground">
                Mudanças de preço capturadas pelo sincronizador.
              </p>
            </div>
            <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
              <RefreshCcw className="h-4 w-4 mr-2" />
              {isLoading ? "Atualizando..." : "Atualizar"}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase">
                <LineChart className="h-4 w-4" /> Mudanças
              </div>
              <p className="text-2xl font-bold mt-2">{stats.total}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase">
                <TrendingDown className="h-4 w-4" /> Quedas
              </div>
              <p className="text-2xl font-bold mt-2 text-success">{stats.drops}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase">
                <TrendingUp className="h-4 w-4" /> Altas
              </div>
              <p className="text-2xl font-bold mt-2 text-destructive">{stats.increases}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase">
                Promoções
              </div>
              <p className="text-2xl font-bold mt-2 text-primary">{stats.promos}</p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              <div className="flex items-center gap-2">
                {windowOptions.map((option) => (
                  <Button
                    key={option.value}
                    size="sm"
                    variant={windowFilter === option.value ? "default" : "outline"}
                    onClick={() => setWindowFilter(option.value as any)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por produto ou MLB..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                variant={onlyDrops ? "default" : "outline"}
                onClick={() => setOnlyDrops((prev) => !prev)}
              >
                Somente quedas
              </Button>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {isLoading ? (
              <div className="p-6 text-muted-foreground">Carregando relatório...</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-muted-foreground">
                Nenhuma mudança encontrada nesse período.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-secondary/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Produto</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Antes</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Agora</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Variação</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Promoção</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Fonte</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Quando</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((item) => {
                      const diff =
                        item.old_price !== null ? item.new_price - item.old_price : null;
                      const isDrop = diff !== null && diff < 0;
                      return (
                        <tr key={item.id} className="hover:bg-secondary/30">
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="h-12 w-12 rounded-lg bg-secondary overflow-hidden flex-shrink-0">
                                {item.product?.image_url ? (
                                  <img
                                    src={item.product.image_url}
                                    alt={item.product.name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">
                                    N/A
                                  </div>
                                )}
                              </div>
                              <div>
                                <p className="font-medium text-foreground line-clamp-1">
                                  {item.product?.name || "Produto"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {item.external_id || "Sem ID"}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-muted-foreground">
                            {formatPrice(item.old_price)}
                          </td>
                          <td className="px-4 py-4 text-sm font-semibold text-foreground">
                            {formatPrice(item.new_price)}
                          </td>
                          <td className="px-4 py-4">
                            {diff === null ? (
                              <span className="text-xs text-muted-foreground">N/D</span>
                            ) : (
                              <span
                                className={`text-sm font-semibold ${
                                  isDrop ? "text-success" : "text-destructive"
                                }`}
                              >
                                {diff.toLocaleString("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                })}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            {item.is_on_sale ? (
                              <Badge className="bg-success/10 text-success">Em oferta</Badge>
                            ) : (
                              <Badge variant="outline">Normal</Badge>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <span className={`text-xs px-2 py-1 rounded-full ${getSourceBadgeClass(item.source)}`}>
                              {getSourceLabel(item.source)}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-xs text-muted-foreground">
                            {new Date(item.created_at).toLocaleString("pt-BR")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
