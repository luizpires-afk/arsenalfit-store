import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/Components/ui/card";
import { Button } from "@/Components/ui/button";

const safeCount = async (table: string, filter?: (query: any) => any) => {
  let query = supabase.from(table as any).select("id", { count: "exact", head: true });
  if (filter) query = filter(query);
  const { count } = await query;
  return count || 0;
};

export default function OperationalReliability() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-operational-reliability"],
    queryFn: async () => {
      const [discoveryBacklog, seoDrafts, seoReleasedToday, p1FromDiscovery, p2FromDiscovery, p3FromDiscovery] = await Promise.all([
        safeCount("discovery_candidates", (q) => q.in("status", ["new", "reviewing"])),
        safeCount("seo_pages", (q) => q.eq("release_status", "draft")),
        safeCount("seo_pages", (q) => q.eq("release_status", "released").gte("released_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString())),
        safeCount("discovery_alerts", (q) => q.eq("severity", "critical").in("status", ["new", "acknowledged"])),
        safeCount("discovery_alerts", (q) => q.eq("severity", "warning").in("status", ["new", "acknowledged"])),
        safeCount("discovery_alerts", (q) => q.eq("severity", "info").in("status", ["new", "acknowledged"])),
      ]);

      let pipeline = {
        status: "UNKNOWN",
        durationSeconds: 0,
        failedSteps: [] as string[],
        lastRun: null as string | null,
      };

      try {
        const resp = await fetch("/.netlify/functions/pipeline-status");
        if (resp.ok) {
          const payload = await resp.json();
          pipeline = {
            status: String(payload?.pipeline_status || "UNKNOWN"),
            durationSeconds: Number(payload?.duration_seconds || 0) || 0,
            failedSteps: Array.isArray(payload?.steps_failed) ? payload.steps_failed : [],
            lastRun: payload?.last_pipeline_run_time || null,
          };
        }
      } catch {
        pipeline = {
          status: "UNREACHABLE",
          durationSeconds: 0,
          failedSteps: ["pipeline_status_unreachable"],
          lastRun: null,
        };
      }

      const p1 = p1FromDiscovery + (pipeline.status === "OK" ? 0 : 1);
      const p2 = p2FromDiscovery + (pipeline.failedSteps.length ? 1 : 0);
      const p3 = p3FromDiscovery;

      return {
        discoveryBacklog,
        seoDrafts,
        seoReleasedToday,
        pipeline,
        incidents: { p1, p2, p3 },
      };
    },
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Operational Reliability</h1>
        <p className="text-sm text-muted-foreground">
          Dashboard consolidado de deploy, pipeline, discovery e SEO com severidade P1/P2/P3.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle className="text-sm">P1 Critico</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{data?.incidents?.p1 ?? 0}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">P2 Alto</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{data?.incidents?.p2 ?? 0}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">P3 Medio</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{data?.incidents?.p3 ?? 0}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-sm">Discovery Backlog</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{data?.discoveryBacklog ?? 0}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">SEO Drafts</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{data?.seoDrafts ?? 0}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">SEO Released Today</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{data?.seoReleasedToday ?? 0}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Pipeline Status</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{String(data?.pipeline?.status || "UNKNOWN")}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Health Snapshot</CardTitle>
            <CardDescription>Atualizacao automatica a cada 30 segundos.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Refreshing..." : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {isLoading ? <p>Carregando snapshot...</p> : null}
          {!isLoading ? (
            <>
              <p><strong>last_pipeline_run:</strong> {data?.pipeline?.lastRun || "-"}</p>
              <p><strong>duration_seconds:</strong> {data?.pipeline?.durationSeconds ?? 0}</p>
              <p><strong>failed_steps:</strong> {(data?.pipeline?.failedSteps || []).join(", ") || "-"}</p>
              <p>
                <strong>runbook:</strong> <Link to="/admin/system-explorer" className="underline">System Explorer</Link> + arquivo
                <code className="ml-1">docs/operational-runbook.md</code>
              </p>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
