import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/Components/ui/card";
import { Button } from "@/Components/ui/button";

const safeCount = async (table: string, filter?: (query: any) => any) => {
  let query = supabase.from(table as any).select("id", { count: "exact", head: true });
  if (filter) query = filter(query);
  const { count } = await query;
  return count || 0;
};

export default function SeoHealth() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-seo-health"],
    queryFn: async () => {
      const [totalPages, releasedPages, indexedPages, totalClusters] = await Promise.all([
        safeCount("seo_pages"),
        safeCount("seo_pages", (q) => q.eq("release_status", "released")),
        safeCount("seo_pages", (q) => q.eq("index_status", "indexed")),
        safeCount("seo_clusters"),
      ]);

      return {
        totalPages,
        releasedPages,
        indexedPages,
        totalClusters,
      };
    },
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">SEO Health</h1>
        <p className="text-sm text-muted-foreground">
          High-level SEO pipeline health and publication coverage.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-sm">Total SEO Pages</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{data?.totalPages ?? 0}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Released Pages</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{data?.releasedPages ?? 0}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Indexed Pages</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{data?.indexedPages ?? 0}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Total Clusters</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{data?.totalClusters ?? 0}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Observability Links</CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Refreshing..." : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {isLoading ? <p>Loading health metrics...</p> : null}
          <p>Use <strong>/admin/system-explorer</strong> for event stream and operational observability.</p>
          <p>Use <strong>/admin/seo-pages</strong> and <strong>/admin/seo-clusters</strong> for paginated SEO management.</p>
        </CardContent>
      </Card>
    </div>
  );
}
