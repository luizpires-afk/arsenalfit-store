import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/Components/ui/card";
import { Button } from "@/Components/ui/button";

const fmtDate = (value: string | null | undefined) => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
};

export default function AdminSystemExplorer() {
  const [tab, setTab] = useState<"viral_products" | "pipeline_health" | "price_alert_events">("pipeline_health");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-system-explorer"],
    queryFn: async () => {
      const [viralProducts, notificationEvents, priceAlerts] = await Promise.all([
        supabase
          .from("ai_viral_predictions" as any)
          .select("id,product_name,source_platform,viral_score,trend_score,status,created_at")
          .order("updated_at", { ascending: false })
          .limit(500),
        supabase
          .from("notification_events" as any)
          .select("id,event_type,recipient,product_id,created_at")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("price_alerts")
          .select("id,product_id,old_price,new_price,created_at")
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      let pipelineHealth = {
        pipeline_status: "UNKNOWN",
        failed_steps: [] as string[],
        duration_seconds: 0,
        last_pipeline_run_time: null as string | null,
      };
      try {
        const resp = await fetch("/.netlify/functions/pipeline-status");
        if (resp.ok) {
          const payload = await resp.json();
          pipelineHealth = {
            pipeline_status: String(payload?.pipeline_status || "UNKNOWN"),
            failed_steps: Array.isArray(payload?.failed_steps) ? payload.failed_steps : [],
            duration_seconds: Number(payload?.duration_seconds || 0) || 0,
            last_pipeline_run_time: payload?.last_pipeline_run_time || null,
          };
        }
      } catch {
        // keep fallback values
      }

      return {
        viralProducts: viralProducts.data || [],
        notificationEvents: notificationEvents.data || [],
        priceAlerts: priceAlerts.data || [],
        pipelineHealth,
      };
    },
    refetchInterval: 30000,
  });

  const pipelineRows = useMemo(
    () => [
      ["pipeline_status", data?.pipelineHealth?.pipeline_status || "UNKNOWN"],
      ["failed_steps", (data?.pipelineHealth?.failed_steps || []).join(", ") || "-"],
      ["duration_seconds", String(data?.pipelineHealth?.duration_seconds || 0)],
      ["last_pipeline_run_time", data?.pipelineHealth?.last_pipeline_run_time || "-"],
    ],
    [data?.pipelineHealth],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">System Explorer</h1>
        <p className="text-sm text-muted-foreground">
          Operational observability for pipeline health, viral stream and pricing event logs.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>System Explorer</CardTitle>
          <CardDescription>Focused observability module for runtime monitoring.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            SEO management moved to dedicated screens: <strong>/admin/seo-pages</strong> and <strong>/admin/seo-clusters</strong>.
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <Button variant={tab === "viral_products" ? "default" : "outline"} onClick={() => setTab("viral_products")}>VIRAL PRODUCTS</Button>
            <Button variant={tab === "pipeline_health" ? "default" : "outline"} onClick={() => setTab("pipeline_health")}>PIPELINE HEALTH</Button>
            <Button variant={tab === "price_alert_events" ? "default" : "outline"} onClick={() => setTab("price_alert_events")}>PRICE ALERT EVENTS</Button>
            <Button variant="outline" onClick={() => refetch()}>Refresh</Button>
          </div>

          {isLoading ? <p>Loading...</p> : null}

          {tab === "viral_products" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3">product_name</th>
                    <th className="py-2 pr-3">source_platform</th>
                    <th className="py-2 pr-3">viral_score</th>
                    <th className="py-2 pr-3">trend_score</th>
                    <th className="py-2 pr-3">status</th>
                    <th className="py-2 pr-3">created_at</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.viralProducts || []).map((row: any) => (
                    <tr key={String(row.id)} className="border-b align-top">
                      <td className="py-2 pr-3">{String(row.product_name || "-")}</td>
                      <td className="py-2 pr-3">{String(row.source_platform || "-")}</td>
                      <td className="py-2 pr-3">{Number(row.viral_score || 0).toFixed(4)}</td>
                      <td className="py-2 pr-3">{Number(row.trend_score || 0).toFixed(4)}</td>
                      <td className="py-2 pr-3">{String(row.status || "-")}</td>
                      <td className="py-2 pr-3">{fmtDate(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {tab === "pipeline_health" ? (
            <div className="space-y-2 text-sm">
              {pipelineRows.map(([label, value]) => (
                <div key={String(label)} className="border-b pb-2">
                  <strong>{String(label)}:</strong> {String(value)}
                </div>
              ))}
            </div>
          ) : null}

          {tab === "price_alert_events" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3">event_type</th>
                    <th className="py-2 pr-3">recipient</th>
                    <th className="py-2 pr-3">product_id</th>
                    <th className="py-2 pr-3">event_time</th>
                    <th className="py-2 pr-3">price_alert_old_new</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.notificationEvents || []).map((row: any) => (
                    <tr key={String(row.id)} className="border-b align-top">
                      <td className="py-2 pr-3">{String(row.event_type || "-")}</td>
                      <td className="py-2 pr-3">{String(row.recipient || "-")}</td>
                      <td className="py-2 pr-3">{String(row.product_id || "-")}</td>
                      <td className="py-2 pr-3">{fmtDate(row.created_at)}</td>
                      <td className="py-2 pr-3">-</td>
                    </tr>
                  ))}
                  {(data?.priceAlerts || []).map((row: any) => (
                    <tr key={`price-${String(row.id)}`} className="border-b align-top">
                      <td className="py-2 pr-3">price_alert</td>
                      <td className="py-2 pr-3">-</td>
                      <td className="py-2 pr-3">{String(row.product_id || "-")}</td>
                      <td className="py-2 pr-3">{fmtDate(row.created_at)}</td>
                      <td className="py-2 pr-3">{String(row.old_price || "-")} {"->"} {String(row.new_price || "-")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
