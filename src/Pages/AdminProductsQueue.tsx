import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/Components/ui/card";
import { Button } from "@/Components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AdminQuickNav } from "@/Components/admin/AdminQuickNav";

type QueueProduct = {
  id: string;
  name: string;
  price: number | null;
  profit_score: number | null;
  trend_score: number | null;
  conversion_score: number | null;
  status: string | null;
  is_active: boolean;
  affiliate_validation_status: string | null;
};

export default function AdminProductsQueue() {
  const [runningId, setRunningId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-products-queue"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("products")
        .select("id, name, price, profit_score, trend_score, conversion_score, status, is_active, affiliate_validation_status")
        .eq("marketplace", "mercadolivre")
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (rows || []) as QueueProduct[];
    },
    refetchInterval: 30000,
  });

  const setActive = async (row: QueueProduct, active: boolean) => {
    setRunningId(row.id);
    try {
      const patch = {
        is_active: active,
        status: active ? "active" : "standby",
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("products").update(patch).eq("id", row.id);
      if (error) throw error;
      toast.success(active ? "Produto ativado." : "Produto desativado.");
      await refetch();
    } catch (error: any) {
      toast.error(error?.message || "Falha ao atualizar status.");
    } finally {
      setRunningId(null);
    }
  };

  const revalidate = async (row: QueueProduct) => {
    setRunningId(row.id);
    try {
      const { error } = await supabase
        .from("products")
        .update({
          status: "pending_validation",
          affiliate_validation_status: "PENDING",
          affiliate_verified: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) throw error;

      const { error: triggerError } = await supabase.rpc("trigger_catalog_ingest_auto");
      if (triggerError) throw triggerError;

      toast.success("Produto enviado para revalidacao.");
      await refetch();
    } catch (error: any) {
      toast.error(error?.message || "Falha ao revalidar produto.");
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div className="container py-8 space-y-6">
      <AdminQuickNav />
      <Card>
        <CardHeader>
          <CardTitle>Products Queue</CardTitle>
          <CardDescription>Controle manual de ativacao e revalidacao de produtos.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <p>Carregando...</p> : null}
          {!isLoading && !data?.length ? <p>Nenhum produto encontrado.</p> : null}

          {!isLoading && data?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3">product name</th>
                    <th className="py-2 pr-3">price</th>
                    <th className="py-2 pr-3">profit score</th>
                    <th className="py-2 pr-3">trend score</th>
                    <th className="py-2 pr-3">conversion score</th>
                    <th className="py-2 pr-3">status</th>
                    <th className="py-2 pr-3">actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.id} className="border-b align-top">
                      <td className="py-3 pr-3">{row.name}</td>
                      <td className="py-3 pr-3">{row.price ?? "-"}</td>
                      <td className="py-3 pr-3">{row.profit_score ?? "-"}</td>
                      <td className="py-3 pr-3">{row.trend_score ?? "-"}</td>
                      <td className="py-3 pr-3">{row.conversion_score ?? "-"}</td>
                      <td className="py-3 pr-3">{row.status || row.affiliate_validation_status || "-"}</td>
                      <td className="py-3 pr-3">
                        <div className="flex gap-2">
                          <Button
                            onClick={() => setActive(row, true)}
                            disabled={runningId === row.id}
                            className="bg-emerald-600 hover:bg-emerald-700"
                          >
                            ACTIVATE
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => setActive(row, false)}
                            disabled={runningId === row.id}
                          >
                            DEACTIVATE
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => revalidate(row)}
                            disabled={runningId === row.id}
                          >
                            REVALIDATE
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
