import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/Components/ui/card";
import { Button } from "@/Components/ui/button";
import { toast } from "sonner";

type TrendProduct = {
  id: string;
  product_name: string;
  source_platform: string;
  trend_score: number;
  mercadolivre_product_url: string;
  price: number | null;
  seller_rating: number | null;
  reviews: number | null;
  status: "pending_review" | "approved" | "rejected";
  ml_item_id?: string | null;
  created_at: string;
};

const toSlug = (value: string) =>
  String(value || "produto")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "produto";

export default function AdminTrendProducts() {
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-trend-products"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("trend_discovered_products")
        .select("id, product_name, source_platform, trend_score, mercadolivre_product_url, price, seller_rating, reviews, status, ml_item_id, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (rows || []) as TrendProduct[];
    },
    refetchInterval: 30000,
  });

  const pendingRows = useMemo(
    () => (data || []).filter((row) => row.status === "pending_review"),
    [data],
  );

  const handleReject = async (row: TrendProduct) => {
    setPendingActionId(row.id);
    try {
      const { error } = await supabase
        .from("trend_discovered_products")
        .update({ status: "rejected" })
        .eq("id", row.id);
      if (error) throw error;
      toast.success("Produto rejeitado.");
      await refetch();
    } catch (error: any) {
      toast.error(error?.message || "Falha ao rejeitar produto.");
    } finally {
      setPendingActionId(null);
    }
  };

  const handleApprove = async (row: TrendProduct) => {
    setPendingActionId(row.id);
    try {
      const now = new Date().toISOString();
      const mlItemId = row.ml_item_id || String(row.mercadolivre_product_url).toUpperCase().match(/MLB\d{6,14}/)?.[0] || null;
      const payload = {
        name: row.product_name,
        slug: `${toSlug(row.product_name)}-${Date.now()}`,
        marketplace: "mercadolivre",
        external_id: mlItemId,
        ml_item_id: mlItemId,
        source_url: row.mercadolivre_product_url,
        canonical_offer_url: row.mercadolivre_product_url,
        affiliate_link: null,
        status: "pending_validation",
        affiliate_validation_status: "PENDING",
        affiliate_verified: false,
        is_active: false,
        price: Number(row.price || 0),
        stock_quantity: 0,
        updated_at: now,
      };

      const { error: insertError } = await supabase
        .from("products")
        .upsert(payload, { onConflict: "ml_item_id" });
      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from("trend_discovered_products")
        .update({ status: "approved" })
        .eq("id", row.id);
      if (updateError) throw updateError;

      const { error: triggerError } = await supabase.rpc("trigger_catalog_ingest_auto");
      if (triggerError) {
        toast.warning("Produto aprovado, mas falhou trigger do pipeline.");
      }

      toast.success("Produto aprovado e enviado para validacao.");
      await refetch();
    } catch (error: any) {
      toast.error(error?.message || "Falha ao aprovar produto.");
    } finally {
      setPendingActionId(null);
    }
  };

  return (
    <div className="container py-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Trend Products</CardTitle>
          <CardDescription>
            Descobertas de tendencias com saida exclusiva de produtos do Mercado Livre.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <p>Carregando...</p> : null}
          {!isLoading && pendingRows.length === 0 ? <p>Nenhum produto pendente no momento.</p> : null}

          {!isLoading && pendingRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3">product_name</th>
                    <th className="py-2 pr-3">trend_score</th>
                    <th className="py-2 pr-3">price</th>
                    <th className="py-2 pr-3">seller_rating</th>
                    <th className="py-2 pr-3">reviews</th>
                    <th className="py-2 pr-3">actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRows.map((row) => (
                    <tr key={row.id} className="border-b align-top">
                      <td className="py-3 pr-3">
                        <a href={row.mercadolivre_product_url} target="_blank" rel="noreferrer" className="underline">
                          {row.product_name}
                        </a>
                      </td>
                      <td className="py-3 pr-3">{Number(row.trend_score || 0).toFixed(2)}</td>
                      <td className="py-3 pr-3">{row.price ?? "-"}</td>
                      <td className="py-3 pr-3">{row.seller_rating ?? "-"}</td>
                      <td className="py-3 pr-3">{row.reviews ?? "-"}</td>
                      <td className="py-3 pr-3">
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleApprove(row)}
                            disabled={pendingActionId === row.id}
                            className="bg-emerald-600 hover:bg-emerald-700"
                          >
                            APPROVE
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => handleReject(row)}
                            disabled={pendingActionId === row.id}
                          >
                            REJECT
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
