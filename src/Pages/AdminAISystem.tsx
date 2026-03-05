import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/Components/ui/card";
import { supabase } from "@/integrations/supabase/client";

const num = (value: any) => Number(value || 0);

const safeCount = async (table: string, configure?: (q: any) => any) => {
  try {
    let query = supabase.from(table as any).select("id", { count: "exact", head: true });
    if (configure) query = configure(query);
    const { count, error } = await query;
    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
};

const safeAvg = async (table: string, column: string) => {
  try {
    const { data, error } = await supabase.from(table as any).select(column).limit(50000);
    if (error) return 0;
    const rows = data || [];
    if (!rows.length) return 0;
    const avg = rows.reduce((acc: number, row: any) => acc + num(row?.[column]), 0) / rows.length;
    return Number(avg.toFixed(6));
  } catch {
    return 0;
  }
};

export default function AdminAISystem() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-ai-system-metrics"],
    queryFn: async () => {
      const [
        productsTotal,
        seoPagesTotal,
        seoKeywordsTotal,
        adsCampaignsTotal,
        avgConversionScore,
        avgProfitScore,
      ] = await Promise.all([
        safeCount("products"),
        safeCount("seo_pages"),
        safeCount("seo_keyword_universe"),
        safeCount("ad_campaigns"),
        safeAvg("product_conversion_metrics", "conversion_score"),
        safeAvg("products", "profit_score"),
      ]);

      const [pricing24hCount, rankedCount, visibleCount] = await Promise.all([
        safeCount("product_price_intelligence", (q) =>
          q.gte("updated_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
        ),
        safeCount("products", (q) => q.gt("rank_score", 0)),
        safeCount("products", (q) => q.eq("visible", true)),
      ]);

      return {
        products_total: productsTotal,
        products_ranked: rankedCount,
        products_visible: visibleCount,
        seo_pages_total: seoPagesTotal,
        seo_keywords_total: seoKeywordsTotal,
        ads_campaigns_total: adsCampaignsTotal,
        avg_conversion_score: avgConversionScore,
        avg_profit_score: avgProfitScore,
        pricing_updates_last_24h: pricing24hCount || 0,
      };
    },
    refetchInterval: 30000,
  });

  if (isLoading) return <div className="container py-8">Carregando...</div>;
  if (error) return <div className="container py-8 text-destructive">Falha ao carregar metricas.</div>;

  const metrics = data!;

  const items = [
    ["products_total", metrics.products_total],
    ["products_ranked", metrics.products_ranked],
    ["products_visible", metrics.products_visible],
    ["seo_pages_total", metrics.seo_pages_total],
    ["seo_keywords_total", metrics.seo_keywords_total],
    ["ads_campaigns_total", metrics.ads_campaigns_total],
    ["avg_conversion_score", metrics.avg_conversion_score],
    ["avg_profit_score", metrics.avg_profit_score],
    ["pricing_updates_last_24h", metrics.pricing_updates_last_24h],
  ];

  return (
    <div className="container py-8 space-y-6">
      <h1 className="text-2xl font-bold">AI System Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-3">
        {items.map(([label, value]) => (
          <Card key={String(label)}>
            <CardHeader>
              <CardTitle className="text-sm uppercase text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{String(value)}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
