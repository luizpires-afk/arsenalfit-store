import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/Components/ui/card";
import { Button } from "@/Components/ui/button";
import { Input } from "@/Components/ui/input";
import { toast } from "sonner";

type CandidateStatus = "new" | "reviewing" | "approved" | "rejected" | "saved";

type DiscoveryCandidate = {
  id: string;
  marketplace: string;
  external_product_id: string;
  title: string;
  category: string | null;
  seller: string | null;
  seller_reputation: string | null;
  affiliate_link: string | null;
  product_url: string | null;
  current_price: number | null;
  original_price: number | null;
  discount_percent: number | null;
  sold_quantity: number | null;
  reviews_count: number | null;
  rating: number | null;
  stock: number | null;
  opportunity_score: number;
  viral_score: number;
  signal_origin: string;
  status: CandidateStatus;
  updated_at: string;
  created_at: string;
};

type PriceHistory = {
  id: number;
  captured_at: string;
  price: number;
};

type CandidateEvent = {
  id: number;
  candidate_id: string;
  event_type: string;
  actor: string | null;
  created_at: string;
  event_payload: Record<string, unknown> | null;
};

const score = (v: number | null | undefined) => Number(v || 0).toFixed(2);

const createSeoPayload = (candidate: DiscoveryCandidate) => {
  const slug = `${String(candidate.title || "produto")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "produto"}-${candidate.external_product_id}`;

  const title = `${candidate.title} em oferta no Mercado Livre`;
  const metaDescription = `Oferta monitorada para ${candidate.title}. Desconto de ${score(candidate.discount_percent)}% e sinais de alta conversao.`;

  const faq = [
    {
      question: "Por que este produto esta na descoberta?",
      answer: `Porque atingiu score de oportunidade ${candidate.opportunity_score}/100 e viralidade ${candidate.viral_score}/100.`,
    },
    {
      question: "A compra e no Mercado Livre?",
      answer: "Sim. O link afiliado redireciona para o Mercado Livre.",
    },
  ];

  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: candidate.title,
    offers: {
      "@type": "Offer",
      priceCurrency: "BRL",
      price: Number(candidate.current_price || 0),
      availability: Number(candidate.stock || 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: candidate.affiliate_link || candidate.product_url || null,
    },
  };

  return {
    slug,
    title,
    meta_description: metaDescription,
    seo_description: `${metaDescription} Categoria: ${candidate.category || "fitness"}.`,
    faq_json: faq,
    schema_json: schema,
  };
};

export default function DiscoveryQueue() {
  const [statusFilter, setStatusFilter] = useState<CandidateStatus | "all">("new");
  const [minOpportunity, setMinOpportunity] = useState("0");
  const [minDiscount, setMinDiscount] = useState("0");
  const [search, setSearch] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [selected, setSelected] = useState<DiscoveryCandidate | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchRejectReason, setBatchRejectReason] = useState("");
  const [actorLabel, setActorLabel] = useState("admin_ui");
  const [operationKey, setOperationKey] = useState("");

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["admin-discovery-candidates"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("discovery_candidates" as any)
        .select(
          "id,marketplace,external_product_id,title,category,seller,seller_reputation,affiliate_link,product_url,current_price,original_price,discount_percent,sold_quantity,reviews_count,rating,stock,opportunity_score,viral_score,signal_origin,status,updated_at,created_at",
        )
        .order("updated_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (rows || []) as DiscoveryCandidate[];
    },
    refetchInterval: 30000,
  });

  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ["admin-discovery-price-history", selected?.external_product_id],
    enabled: Boolean(selected?.external_product_id),
    queryFn: async () => {
      if (!selected?.external_product_id) return [];
      const { data: rows, error } = await supabase
        .from("discovery_price_history" as any)
        .select("id,captured_at,price")
        .eq("marketplace", "mercadolivre")
        .eq("external_product_id", selected.external_product_id)
        .order("captured_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (rows || []) as PriceHistory[];
    },
  });

  const { data: recentEvents = [] } = useQuery({
    queryKey: ["admin-discovery-events-recent"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("discovery_candidate_events" as any)
        .select("id,candidate_id,event_type,actor,created_at,event_payload")
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      return (rows || []) as CandidateEvent[];
    },
    refetchInterval: 30000,
  });

  const filtered = useMemo(() => {
    const minOpp = Number(minOpportunity || 0);
    const minDisc = Number(minDiscount || 0);
    const q = search.trim().toLowerCase();

    return data.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (Number(row.opportunity_score || 0) < minOpp) return false;
      if (Number(row.discount_percent || 0) < minDisc) return false;
      if (!q) return true;
      const composed = `${row.title || ""} ${row.category || ""} ${row.external_product_id || ""}`.toLowerCase();
      return composed.includes(q);
    });
  }, [data, statusFilter, minOpportunity, minDiscount, search]);

  const writeEvent = async (
    candidate: DiscoveryCandidate,
    eventType: "reviewing" | "approved" | "rejected" | "saved",
    nextStatus: CandidateStatus,
    payload: Record<string, unknown> = {},
    actor = "admin_ui",
  ) => {
    const { error } = await supabase.from("discovery_candidate_events" as any).insert({
      candidate_id: candidate.id,
      event_type: eventType,
      previous_status: candidate.status,
      next_status: nextStatus,
      event_payload: payload,
      actor,
    });
    if (error) throw error;
  };

  const eventAlreadyApplied = async (
    candidateId: string,
    eventType: "approved" | "rejected" | "saved",
    operationId: string,
  ) => {
    const { data, error } = await supabase
      .from("discovery_candidate_events" as any)
      .select("id")
      .eq("candidate_id", candidateId)
      .eq("event_type", eventType)
      .filter("event_payload->>operation_id", "eq", operationId)
      .limit(1);
    if (error) return false;
    return Boolean((data || []).length);
  };

  const upsertProductFromCandidate = async (candidate: DiscoveryCandidate) => {
    const slug = `${candidate.title || "produto"}-${candidate.external_product_id}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96);

    const payload = {
      name: candidate.title,
      slug,
      marketplace: "mercadolivre",
      external_id: candidate.external_product_id,
      ml_item_id: candidate.external_product_id,
      source_url: candidate.product_url,
      canonical_offer_url: candidate.product_url,
      affiliate_link: candidate.affiliate_link,
      status: "pending_validation",
      affiliate_validation_status: "PENDING",
      affiliate_verified: false,
      is_active: false,
      price: Number(candidate.current_price || 0),
      stock_quantity: Number(candidate.stock || 0),
      updated_at: new Date().toISOString(),
      specifications: {
        discovery_origin: candidate.signal_origin,
        discovery_opportunity_score: candidate.opportunity_score,
        discovery_viral_score: candidate.viral_score,
      },
    };

    const { data: rows, error } = await supabase
      .from("products")
      .upsert(payload as any, { onConflict: "ml_item_id" })
      .select("id")
      .limit(1);
    if (error) throw error;
    return rows?.[0]?.id || null;
  };

  const setStatus = async (
    candidate: DiscoveryCandidate,
    nextStatus: CandidateStatus,
    options?: { reason?: string; operationId?: string; actor?: string },
  ) => {
    setPendingId(candidate.id);
    try {
      const actor = String(options?.actor || actorLabel || "admin_ui");
      const operationId = String(options?.operationId || `single-${Date.now()}-${candidate.id}`);
      const reason = String(options?.reason || "").trim();
      if (nextStatus === "rejected" && !reason) {
        toast.error("Motivo obrigatorio para rejeicao.");
        return { ok: false, skipped: false };
      }

      const eventType: "approved" | "rejected" | "saved" =
        nextStatus === "approved" ? "approved" : nextStatus === "rejected" ? "rejected" : "saved";

      const alreadyApplied = await eventAlreadyApplied(candidate.id, eventType, operationId);
      if (alreadyApplied) return { ok: true, skipped: true };

      let publishedProductId: string | null = null;
      const previousStatus = candidate.status;

      if (nextStatus === "approved") {
        publishedProductId = await upsertProductFromCandidate(candidate);
        const seo = createSeoPayload(candidate);

        const { error: seoError } = await supabase.from("seo_generated_pages" as any).upsert(
          {
            candidate_id: candidate.id,
            marketplace: candidate.marketplace,
            external_product_id: candidate.external_product_id,
            slug: seo.slug,
            title: seo.title,
            meta_description: seo.meta_description,
            seo_description: seo.seo_description,
            faq_json: seo.faq_json,
            schema_json: seo.schema_json,
            affiliate_link: candidate.affiliate_link,
            publication_status: "published",
            published_product_id: publishedProductId,
          },
          { onConflict: "slug" },
        );
        if (seoError) throw seoError;
      }

      const { error: statusError } = await supabase
        .from("discovery_candidates" as any)
        .update({ status: nextStatus, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", candidate.id);
      if (statusError) throw statusError;

      await writeEvent(candidate, eventType, nextStatus, {
        published_product_id: publishedProductId,
        reason: reason || null,
        operation_id: operationId,
        context: {
          source: "admin_discovery_queue",
          status_filter: statusFilter,
          min_opportunity: Number(minOpportunity || 0),
          min_discount: Number(minDiscount || 0),
          search: search || null,
        },
      }, actor);

      if (nextStatus === "approved") {
        const { error: triggerError } = await supabase.rpc("trigger_catalog_ingest_auto");
        if (triggerError) {
          toast.warning("Aprovado com SEO, mas trigger de ingestao falhou.");
        }
      }

      toast.success(`Candidato atualizado para ${nextStatus}.`);
      await refetch();
      return { ok: true, skipped: false };
    } catch (error: any) {
      // Best-effort rollback if a partial status update happened during batch/single actions.
      await supabase
        .from("discovery_candidates" as any)
        .update({ status: candidate.status, updated_at: new Date().toISOString() })
        .eq("id", candidate.id);
      toast.error(error?.message || "Falha ao atualizar candidato.");
      return { ok: false, skipped: false };
    } finally {
      setPendingId(null);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAllFiltered = () => {
    const ids = filtered.map((row) => row.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? selectedIds.filter((id) => !ids.includes(id)) : Array.from(new Set([...selectedIds, ...ids])));
  };

  const runBatchAction = async (nextStatus: CandidateStatus) => {
    if (!selectedIds.length) {
      toast.warning("Selecione ao menos um candidato para operar em lote.");
      return;
    }
    if (nextStatus === "rejected" && !batchRejectReason.trim()) {
      toast.error("Motivo obrigatorio para rejeicao em lote.");
      return;
    }
    if (nextStatus === "rejected") {
      const confirmed = window.confirm("Confirmar rejeicao em lote? Esta acao e destrutiva.");
      if (!confirmed) return;
    }

    const operationId = operationKey.trim() || `batch-${nextStatus}-${Date.now()}`;
    const targets = filtered.filter((row) => selectedIds.includes(row.id));
    if (!targets.length) {
      toast.warning("Nenhum item selecionado nos filtros atuais.");
      return;
    }

    setBatchRunning(true);
    try {
      let okCount = 0;
      let skippedCount = 0;
      let failCount = 0;

      for (const candidate of targets) {
        const result = await setStatus(candidate, nextStatus, {
          reason: nextStatus === "rejected" ? batchRejectReason : "",
          operationId,
          actor: actorLabel,
        });
        if (result?.ok && result?.skipped) skippedCount += 1;
        else if (result?.ok) okCount += 1;
        else failCount += 1;
      }

      toast.success(`Lote concluido: ${okCount} sucesso, ${skippedCount} idempotentes, ${failCount} falhas.`);
      setSelectedIds([]);
      setOperationKey("");
      await refetch();
    } finally {
      setBatchRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Discovery Queue</h1>
        <p className="text-sm text-muted-foreground">
          Oportunidades Mercado Livre com scoring, viralidade e fluxo de aprovacao para SEO.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Filtre por status, score minimo, desconto e busca textual.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-6">
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as CandidateStatus | "all")}
          >
            <option value="all">all</option>
            <option value="new">new</option>
            <option value="reviewing">reviewing</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
            <option value="saved">saved</option>
          </select>
          <Input value={minOpportunity} onChange={(e) => setMinOpportunity(e.target.value)} placeholder="min opportunity" />
          <Input value={minDiscount} onChange={(e) => setMinDiscount(e.target.value)} placeholder="min discount" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="titulo/categoria/id" />
          <Input value={actorLabel} onChange={(e) => setActorLabel(e.target.value)} placeholder="actor" />
          <Button variant="outline" onClick={() => refetch()}>Refresh</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Acoes Em Lote</CardTitle>
          <CardDescription>Selecione itens e aplique decisao em massa com trilha de auditoria e idempotencia.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-5">
            <Input
              value={batchRejectReason}
              onChange={(e) => setBatchRejectReason(e.target.value)}
              placeholder="motivo obrigatorio para lote rejeitado"
            />
            <Input
              value={operationKey}
              onChange={(e) => setOperationKey(e.target.value)}
              placeholder="operation key (idempotencia)"
            />
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={batchRunning}
              onClick={() => runBatchAction("approved")}
            >
              Aprovar Selecionados
            </Button>
            <Button variant="destructive" disabled={batchRunning} onClick={() => runBatchAction("rejected")}>Rejeitar Selecionados</Button>
            <Button variant="outline" disabled={batchRunning} onClick={() => runBatchAction("saved")}>Salvar Selecionados</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Selecionados: {selectedIds.length}. Rejeicao exige motivo e confirmacao. Informe operation key para reruns idempotentes controlados.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auditoria Recente</CardTitle>
          <CardDescription>Ultimas operacoes com actor, action e operation_id para rastreabilidade.</CardDescription>
        </CardHeader>
        <CardContent>
          {!recentEvents.length ? <p className="text-sm text-muted-foreground">Sem eventos recentes.</p> : null}
          {recentEvents.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3">created_at</th>
                    <th className="py-2 pr-3">event_type</th>
                    <th className="py-2 pr-3">actor</th>
                    <th className="py-2 pr-3">candidate_id</th>
                    <th className="py-2 pr-3">operation_id</th>
                    <th className="py-2 pr-3">reason</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.slice(0, 40).map((event) => {
                    const operationId = String((event.event_payload || {})["operation_id"] || "-");
                    const reason = String((event.event_payload || {})["reason"] || "-");
                    return (
                      <tr key={event.id} className="border-b">
                        <td className="py-2 pr-3">{new Date(event.created_at).toLocaleString()}</td>
                        <td className="py-2 pr-3">{event.event_type}</td>
                        <td className="py-2 pr-3">{event.actor || "system"}</td>
                        <td className="py-2 pr-3">{event.candidate_id}</td>
                        <td className="py-2 pr-3">{operationId}</td>
                        <td className="py-2 pr-3">{reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Candidates ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <p>Carregando discovery queue...</p> : null}
          {!isLoading && !filtered.length ? <p>Nenhum candidato encontrado.</p> : null}

          {!isLoading && filtered.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && filtered.every((row) => selectedIds.includes(row.id))}
                        onChange={toggleSelectAllFiltered}
                      />
                    </th>
                    <th className="py-2 pr-3">title</th>
                    <th className="py-2 pr-3">status</th>
                    <th className="py-2 pr-3">opportunity</th>
                    <th className="py-2 pr-3">viral</th>
                    <th className="py-2 pr-3">discount%</th>
                    <th className="py-2 pr-3">price</th>
                    <th className="py-2 pr-3">actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className="border-b align-top">
                      <td className="py-2 pr-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(row.id)}
                          onChange={() => toggleSelection(row.id)}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <button className="text-left underline" onClick={() => setSelected(row)}>
                          {row.title}
                        </button>
                      </td>
                      <td className="py-2 pr-3">{row.status}</td>
                      <td className="py-2 pr-3">{row.opportunity_score}</td>
                      <td className="py-2 pr-3">{row.viral_score}</td>
                      <td className="py-2 pr-3">{score(row.discount_percent)}</td>
                      <td className="py-2 pr-3">{score(row.current_price)}</td>
                      <td className="py-2 pr-3">
                        <div className="flex gap-2">
                          <Button
                            className="bg-emerald-600 hover:bg-emerald-700"
                            disabled={pendingId === row.id}
                            onClick={() => setStatus(row, "approved")}
                          >
                            APROVAR
                          </Button>
                          <Button
                            variant="destructive"
                            disabled={pendingId === row.id}
                            onClick={() => {
                              const reason = window.prompt("Motivo da rejeicao (obrigatorio):", "") || "";
                              if (!reason.trim()) {
                                toast.error("Motivo obrigatorio para rejeicao.");
                                return;
                              }
                              const confirmed = window.confirm("Confirmar rejeicao deste candidato?");
                              if (!confirmed) return;
                              setStatus(row, "rejected", { reason });
                            }}
                          >
                            REJEITAR
                          </Button>
                          <Button variant="outline" disabled={pendingId === row.id} onClick={() => setStatus(row, "saved")}>
                            SALVAR
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

      {selected ? (
        <Card>
          <CardHeader>
            <CardTitle>Detalhes: {selected.title}</CardTitle>
            <CardDescription>{selected.external_product_id}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>seller:</strong> {selected.seller || "-"}</p>
            <p><strong>rating/reviews:</strong> {score(selected.rating)} / {selected.reviews_count || 0}</p>
            <p><strong>signal origin:</strong> {selected.signal_origin}</p>
            <p><strong>affiliate link:</strong> {selected.affiliate_link || "-"}</p>
            <div className="pt-2">
              <h3 className="font-semibold">Historico de preco</h3>
              {historyLoading ? <p>Carregando historico...</p> : null}
              {!historyLoading && !history.length ? <p>Sem historico.</p> : null}
              {!historyLoading && history.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 pr-3">captured_at</th>
                        <th className="py-2 pr-3">price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.id} className="border-b">
                          <td className="py-2 pr-3">{new Date(h.captured_at).toLocaleString()}</td>
                          <td className="py-2 pr-3">{score(h.price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
