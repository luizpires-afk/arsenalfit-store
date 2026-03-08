import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/Components/ui/card";
import { Button } from "@/Components/ui/button";

const statusTone = (status) => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "OK") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (normalized === "WARNING") return "bg-amber-100 text-amber-800 border-amber-200";
  if (normalized === "NOT_STARTED") return "bg-blue-100 text-blue-800 border-blue-200";
  return "bg-rose-100 text-rose-800 border-rose-200";
};

const statusLabel = (status) => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "NOT_STARTED") return "NOT STARTED";
  if (!normalized) return "UNKNOWN";
  return normalized;
};

export default function PipelineHealth() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-pipeline-health"],
    queryFn: async () => {
      const resp = await fetch("/.netlify/functions/pipeline-status");
      if (!resp.ok) throw new Error(`pipeline-status HTTP ${resp.status}`);
      return await resp.json();
    },
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pipeline Health</h1>
        <p className="text-sm text-muted-foreground">
          Status endpoint for automated ingestion and processing pipelines.
        </p>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="space-y-2">
            <CardTitle className="text-base">Pipeline Status</CardTitle>
            {!isLoading ? (
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(data?.pipeline_status)}`}>
                {statusLabel(data?.pipeline_status)}
              </span>
            ) : null}
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Refreshing..." : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? <p>Loading pipeline status...</p> : null}
          {!isLoading && data?.pipeline_status === "NOT_STARTED" ? (
            <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <p className="font-semibold">Sem execucao registrada ainda</p>
              <p className="mt-1">Esse status indica ausencia de ciclo detectado neste ambiente, nao uma falha tecnica do pipeline.</p>
            </div>
          ) : null}
          {!isLoading && data?.pipeline_status === "FAILED" ? (
            <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              <p className="font-semibold">Falha detectada no ultimo ciclo</p>
              <p className="mt-1">Considere rodar `npm run ops_production_daily` e revisar `operational_health_snapshot`.</p>
            </div>
          ) : null}
          {!isLoading ? (
            <pre className="overflow-x-auto rounded-md border bg-muted/40 p-4 text-xs">
              {JSON.stringify(data || {}, null, 2)}
            </pre>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
