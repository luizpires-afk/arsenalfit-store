import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/Components/ui/button";
import { Card, CardHeader, CardContent } from "@/Components/ui/card";
import { Skeleton } from "@/Components/ui/skeleton";
import { Layout } from "@/Components/layout/Layout";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface Diff {
  id: string;
  name: string;
  current_price: number | null;
  collected_price: number | null;
  price_diff: number | null;
  detected_at: string | null;
  updated_at: string | null;
}

export default function PriceAdjustments() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Diff[]>([]);
  const [applying, setApplying] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from<Diff>("products_price_diffs")
      .select("*")
      .order("detected_at", { ascending: false });

    if (error) toast.error("Erro ao carregar: " + error.message);
    else setItems(data ?? []);
    setLoading(false);
  };

  const apply = async (id: string) => {
    setApplying(id);
    const { error } = await supabase.rpc("admin_apply_detected_price", {
      _product_id: id,
    });
    if (error) toast.error("Erro ao aplicar preço: " + error.message);
    else {
      toast.success("Preço aplicado");
      await load();
    }
    setApplying(null);
  };

  useEffect(() => {
    load();
  }, []);

  if (authLoading) return null;
  if (!isAdmin) return null;

  return (
    <Layout>
      <div className="container-tight py-8 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Ajustes de preço</h1>
            <p className="text-muted-foreground">
              Compare preços coletados e aplique manualmente no admin.
            </p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? "Atualizando..." : "Recarregar"}
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="border-border/60">
                <CardHeader className="space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : items.length === 0 ? (
          <Card className="p-6 text-center border-border/60">
            <p className="text-muted-foreground">
              Nenhuma diferença de preço encontrada.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((item) => (
              <Card key={item.id} className="border-border/60">
                <CardHeader>
                  <div className="flex justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">{item.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        Última coleta:{" "}
                        {item.detected_at
                          ? new Date(item.detected_at).toLocaleString()
                          : "-"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">
                        Atualizado:{" "}
                        {item.updated_at
                          ? new Date(item.updated_at).toLocaleDateString()
                          : "-"}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Preço atual</p>
                      <p className="text-lg font-semibold">
                        {item.current_price !== null
                          ? item.current_price.toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Preço coletado</p>
                      <p className="text-lg font-semibold text-amber-600">
                        {item.collected_price !== null
                          ? item.collected_price.toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })
                          : "-"}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-muted-foreground text-sm">Diferença</p>
                      <p className="text-xl font-bold">
                        {item.price_diff !== null
                          ? item.price_diff.toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })
                          : "-"}
                      </p>
                    </div>
                    <Button
                      onClick={() => apply(item.id)}
                      disabled={
                        applying === item.id || item.collected_price === null
                      }
                    >
                      {applying === item.id ? "Aplicando..." : "Aplicar preço"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
