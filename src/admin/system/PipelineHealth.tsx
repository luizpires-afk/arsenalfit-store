import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/Components/ui/card";
import { Button } from "@/Components/ui/button";

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
          <CardTitle className="text-base">Pipeline Status</CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Refreshing..." : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? <p>Loading pipeline status...</p> : null}
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
