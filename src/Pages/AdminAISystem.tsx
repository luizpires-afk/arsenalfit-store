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
        activeProducts,
        pendingValidation,
        highConversionProducts,
        seoPagesTotal,
        trendSignalsDetected,
        predictedTrends,
        adsCampaignsActive,
        avgConversionScore,
        avgProfitScore,
      ] = await Promise.all([
        safeCount("products"),
        safeCount("products", (q) => q.eq("is_active", true)),
        safeCount("products", (q) => q.eq("affiliate_validation_status", "PENDING")),
        safeCount("products", (q) => q.gt("conversion_score", 0.6)),
        safeCount("seo_pages"),
        safeCount("trend_signals"),
        safeCount("predicted_trends"),
        safeCount("ad_campaigns", (q) => q.eq("status", "active")),
        safeAvg("product_conversion_metrics", "conversion_score"),
        safeAvg("products", "profit_score"),
      ]);

      let pipelineMeta = {
        pipeline_status: "FAILED",
        last_pipeline_run_time: null as string | null,
        duration_seconds: 0,
      };
      try {
        const resp = await fetch("/.netlify/functions/pipeline-status");
        if (resp.ok) {
          const payload = await resp.json();
          pipelineMeta = {
            pipeline_status: String(payload?.pipeline_status || "FAILED"),
            last_pipeline_run_time: payload?.last_pipeline_run_time || null,
            duration_seconds: Number(payload?.duration_seconds || 0) || 0,
          };
        }
      } catch {
        // Ignore and keep fallback values.
      }

      return {
        products_total: productsTotal,
        products_active: activeProducts,
        pending_validation: pendingValidation,
        high_conversion_products: highConversionProducts,
        seo_pages_total: seoPagesTotal,
        trend_signals_detected: trendSignalsDetected,
        predicted_trends: predictedTrends,
        ads_campaigns_active: adsCampaignsActive,
        avg_conversion_score: avgConversionScore,
        avg_profit_score: avgProfitScore,
        pipeline_status: pipelineMeta.pipeline_status,
        last_pipeline_run_time: pipelineMeta.last_pipeline_run_time,
        pipeline_duration_seconds: pipelineMeta.duration_seconds,
      };
    },
    refetchInterval: 30000,
  });

  if (isLoading) return <div className="container py-8">Carregando...</div>;
  if (error) return <div className="container py-8 text-destructive">Falha ao carregar metricas.</div>;

  const metrics = data!;

  const items = [
    ["products_total", metrics.products_total],
    ["products_active", metrics.products_active],
    ["pending_validation", metrics.pending_validation],
    ["high_conversion_products", metrics.high_conversion_products],
    ["seo_pages_total", metrics.seo_pages_total],
    ["trend_signals_detected", metrics.trend_signals_detected],
    ["predicted_trends", metrics.predicted_trends],
    ["ads_campaigns_active", metrics.ads_campaigns_active],
    ["avg_conversion_score", metrics.avg_conversion_score],
    ["avg_profit_score", metrics.avg_profit_score],
    ["pipeline_status", metrics.pipeline_status],
    ["last_pipeline_run_time", metrics.last_pipeline_run_time || "-"],
    ["pipeline_duration_seconds", metrics.pipeline_duration_seconds],
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
