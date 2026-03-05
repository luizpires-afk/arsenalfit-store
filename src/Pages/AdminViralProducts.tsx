import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/Components/ui/card";
import { Button } from "@/Components/ui/button";
import { toast } from "sonner";


type ViralRow = {
  id: string;
  product_name: string;
  source_platform: string | null;
  trend_score: number;
  viral_score: number;
  profit_score: number;
  conversion_score: number;
  ml_product_url: string | null;
  status: string;
  created_at: string;
};

export default function AdminViralProducts() {
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["admin-viral-products"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("ai_viral_predictions" as any)
        .select("id,product_name,source_platform,trend_score,viral_score,profit_score,conversion_score,ml_product_url,status,created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (rows || []) as ViralRow[];
    },
    refetchInterval: 30000,
  });

  const setStatus = async (row: ViralRow, status: "pending_activation" | "rejected" | "watchlist") => {
    setPendingId(row.id);
    try {
      const { error } = await supabase
        .from("ai_viral_predictions" as any)
        .update({ status })
        .eq("id", row.id);
      if (error) throw error;
      toast.success(`Status set to ${status}`);
      await refetch();
    } catch (error: any) {
      toast.error(error?.message || "Failed to update status");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Viral Products</h1>
        <p className="text-sm text-muted-foreground">
          Manual controls for viral candidates with approve/reject/watchlist actions.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Viral Products</CardTitle>
          <CardDescription>
            Manual panel for viral candidates with APPROVE/REJECT/WATCHLIST controls.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <p>Loading...</p> : null}
          {!isLoading && data.length === 0 ? <p>No viral candidates found.</p> : null}

          {!isLoading && data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3">product_name</th>
                    <th className="py-2 pr-3">viral_score</th>
                    <th className="py-2 pr-3">trend_score</th>
                    <th className="py-2 pr-3">profit_score</th>
                    <th className="py-2 pr-3">conversion_score</th>
                    <th className="py-2 pr-3">status</th>
                    <th className="py-2 pr-3">actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.id} className="border-b align-top">
                      <td className="py-3 pr-3">
                        {row.ml_product_url ? (
                          <a href={row.ml_product_url} target="_blank" rel="noreferrer" className="underline">
                            {row.product_name}
                          </a>
                        ) : row.product_name}
                      </td>
                      <td className="py-3 pr-3">{Number(row.viral_score || 0).toFixed(4)}</td>
                      <td className="py-3 pr-3">{Number(row.trend_score || 0).toFixed(4)}</td>
                      <td className="py-3 pr-3">{Number(row.profit_score || 0).toFixed(4)}</td>
                      <td className="py-3 pr-3">{Number(row.conversion_score || 0).toFixed(4)}</td>
                      <td className="py-3 pr-3">{row.status}</td>
                      <td className="py-3 pr-3">
                        <div className="flex gap-2">
                          <Button
                            onClick={() => setStatus(row, "pending_activation")}
                            disabled={pendingId === row.id}
                            className="bg-emerald-600 hover:bg-emerald-700"
                          >
                            APPROVE
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => setStatus(row, "rejected")}
                            disabled={pendingId === row.id}
                          >
                            REJECT
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setStatus(row, "watchlist")}
                            disabled={pendingId === row.id}
                          >
                            WATCHLIST
                          </Button>
                        </div>
                      </td>
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
