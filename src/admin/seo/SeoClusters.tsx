import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/Components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/Components/ui/card";

const PAGE_SIZE = 50;

const fmtDate = (value: string | null | undefined) => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
};

export default function SeoClusters() {
  const [page, setPage] = useState(0);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-seo-clusters", page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data: rows, error, count } = await supabase
        .from("seo_clusters" as any)
        .select("id,cluster_level,cluster_keyword,pages_generated,traffic_estimate,updated_at", { count: "exact" })
        .order("updated_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      return {
        rows: rows || [],
        total: count || 0,
      };
    },
    refetchInterval: 30000,
  });

  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = page > 0;
  const hasNext = page + 1 < totalPages;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">SEO Clusters</h1>
        <p className="text-sm text-muted-foreground">
          Paged listing of cluster hierarchy and estimated traffic.
        </p>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">seo_clusters</CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Refreshing..." : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? <p>Loading SEO clusters...</p> : null}

          {!isLoading ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3">cluster_level</th>
                    <th className="py-2 pr-3">cluster_keyword</th>
                    <th className="py-2 pr-3">pages_generated</th>
                    <th className="py-2 pr-3">traffic_estimate</th>
                    <th className="py-2 pr-3">updated_at</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.rows || []).map((row: any) => (
                    <tr key={String(row.id)} className="border-b align-top">
                      <td className="py-2 pr-3">{String(row.cluster_level || "-")}</td>
                      <td className="py-2 pr-3">{String(row.cluster_keyword || "-")}</td>
                      <td className="py-2 pr-3">{String(row.pages_generated || 0)}</td>
                      <td className="py-2 pr-3">{Number(row.traffic_estimate || 0).toFixed(2)}</td>
                      <td className="py-2 pr-3">{fmtDate(row.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Page {page + 1} of {totalPages} | {total} rows
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={!hasPrev || isFetching}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={!hasNext || isFetching}>
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
