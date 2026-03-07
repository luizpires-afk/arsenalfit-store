import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/Components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/Components/ui/card";
import { Input } from "@/Components/ui/input";
import { Textarea } from "@/Components/ui/textarea";
import { useToast } from "@/Components/ui/use-toast";
import { toSlug } from "@/lib/programmaticSeo";

const PAGE_SIZE = 50;

const normalizeSeoSlugInput = (value: string) =>
  String(value || "")
    .split("/")
    .map((chunk) => toSlug(chunk))
    .filter(Boolean)
    .join("/");

type SeoPageRow = {
  id: number;
  slug: string | null;
  title: string | null;
  description: string | null;
  keyword: string | null;
  search_intent: string | null;
  meta_title: string | null;
  meta_description: string | null;
  is_active: boolean | null;
  release_status: string | null;
  index_status: string | null;
  cluster_level: string | null;
  cluster_keyword: string | null;
  traffic_estimate: number | null;
  updated_at: string | null;
};

type SeoPageForm = {
  slug: string;
  title: string;
  description: string;
  keyword: string;
  search_intent: string;
  meta_title: string;
  meta_description: string;
  is_active: boolean;
  release_status: "draft" | "released";
};

const EMPTY_FORM: SeoPageForm = {
  slug: "",
  title: "",
  description: "",
  keyword: "",
  search_intent: "commercial",
  meta_title: "",
  meta_description: "",
  is_active: true,
  release_status: "draft",
};

const fmtDate = (value: string | null | undefined) => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
};

export default function SeoPages() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [page, setPage] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<SeoPageForm>(EMPTY_FORM);

  const isEditing = editingId !== null;

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-seo-pages", page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data: rows, error, count } = await supabase
        .from("seo_pages" as any)
        .select("id,slug,title,description,keyword,search_intent,meta_title,meta_description,is_active,release_status,index_status,cluster_level,cluster_keyword,traffic_estimate,updated_at", { count: "exact" })
        .order("updated_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      return {
        rows: (rows || []) as SeoPageRow[],
        total: count || 0,
      };
    },
    refetchInterval: 30000,
  });

  const upsertMutation = useMutation({
    mutationFn: async (payload: SeoPageForm) => {
      const nowIso = new Date().toISOString();
      const cleanSlug = normalizeSeoSlugInput(payload.slug || payload.keyword);
      const cleanKeyword = String(payload.keyword || "").trim().toLowerCase();

      if (!cleanSlug || !cleanKeyword || !payload.title.trim() || !payload.description.trim()) {
        throw new Error("Preencha slug, keyword, title e description.");
      }

      const base = {
        slug: cleanSlug,
        keyword: cleanKeyword,
        title: payload.title.trim(),
        description: payload.description.trim(),
        search_intent: payload.search_intent.trim() || "commercial",
        meta_title: (payload.meta_title || payload.title).trim(),
        meta_description: (payload.meta_description || payload.description).trim(),
        is_active: payload.is_active,
        release_status: payload.release_status,
        updated_at: nowIso,
      };

      if (editingId) {
        const { error } = await supabase.from("seo_pages" as any).update(base).eq("id", editingId);
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from("seo_pages" as any)
        .insert({
          ...base,
          cluster_level: "seed",
          cluster_keyword: cleanKeyword,
          index_status: "pending",
          traffic_estimate: 0,
          released_at: payload.release_status === "released" ? nowIso : null,
        });
      if (error) throw error;
    },
    onSuccess: async () => {
      setEditingId(null);
      setForm(EMPTY_FORM);
      await queryClient.invalidateQueries({ queryKey: ["admin-seo-pages"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-seo-health"] });
      toast({ title: "SEO page salva", description: "Cadastro atualizado com sucesso." });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar SEO page",
        description: String(error?.message || error || "Falha inesperada"),
        variant: "destructive",
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, releaseStatus, isActive }: { id: number; releaseStatus: "draft" | "released"; isActive: boolean }) => {
      const payload: Record<string, any> = {
        release_status: releaseStatus,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      };
      if (releaseStatus === "released") payload.released_at = new Date().toISOString();
      const { error } = await supabase.from("seo_pages" as any).update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-seo-pages"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-seo-health"] });
      toast({ title: "Status atualizado" });
    },
    onError: (error: any) => {
      toast({
        title: "Falha ao atualizar status",
        description: String(error?.message || error || "Erro desconhecido"),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("seo_pages" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-seo-pages"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-seo-health"] });
      toast({ title: "SEO page removida" });
      if (isEditing) {
        setEditingId(null);
        setForm(EMPTY_FORM);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Falha ao excluir",
        description: String(error?.message || error || "Erro desconhecido"),
        variant: "destructive",
      });
    },
  });

  const pendingMutation = upsertMutation.isPending || statusMutation.isPending || deleteMutation.isPending;

  const rows = useMemo(() => data?.rows || [], [data?.rows]);

  const handleEdit = (row: SeoPageRow) => {
    setEditingId(row.id);
    setForm({
      slug: String(row.slug || ""),
      title: String(row.title || ""),
      description: String(row.description || ""),
      keyword: String(row.keyword || ""),
      search_intent: String(row.search_intent || "commercial"),
      meta_title: String(row.meta_title || row.title || ""),
      meta_description: String(row.meta_description || row.description || ""),
      is_active: row.is_active !== false,
      release_status: row.release_status === "released" ? "released" : "draft",
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const seoPath = (slug: string) => {
    const normalized = String(slug || "").trim();
    if (!normalized) return "#";
    if (normalized.startsWith("/")) return normalized;
    if (normalized.startsWith("seo/")) return `/${normalized}`;
    return `/seo/${normalized}`;
  };

  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = page > 0;
  const hasNext = page + 1 < totalPages;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">SEO Pages</h1>
        <p className="text-sm text-muted-foreground">
          CRUD de paginas programaticas: crie, publique e paute indexacao sem sair do painel.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{isEditing ? `Editar SEO Page #${editingId}` : "Nova SEO Page"}</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={resetForm} disabled={pendingMutation}>
              Limpar
            </Button>
            <Button
              size="sm"
              onClick={() => upsertMutation.mutate(form)}
              disabled={pendingMutation}
            >
              {pendingMutation ? "Salvando..." : isEditing ? "Salvar alteracoes" : "Criar page"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-muted-foreground">Keyword</label>
            <Input
              value={form.keyword}
              onChange={(e) => {
                const keyword = e.target.value;
                setForm((prev) => {
                  const next = { ...prev, keyword };
                  if (!prev.slug.trim()) next.slug = toSlug(keyword);
                  return next;
                });
              }}
              placeholder="ex: creatina monohidratada"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-muted-foreground">Slug</label>
            <Input value={form.slug} onChange={(e) => setForm((prev) => ({ ...prev, slug: normalizeSeoSlugInput(e.target.value) }))} placeholder="ex: suplementos/creatina-monohidratada" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold uppercase text-muted-foreground">Title</label>
            <Input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Titulo principal da pagina" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold uppercase text-muted-foreground">Description</label>
            <Textarea value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} rows={4} placeholder="Descricao base da pagina" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold uppercase text-muted-foreground">Meta Title</label>
            <Input value={form.meta_title} onChange={(e) => setForm((prev) => ({ ...prev, meta_title: e.target.value }))} placeholder="Meta title (opcional, usa title por padrao)" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold uppercase text-muted-foreground">Meta Description</label>
            <Textarea value={form.meta_description} onChange={(e) => setForm((prev) => ({ ...prev, meta_description: e.target.value }))} rows={3} placeholder="Meta description (opcional, usa description por padrao)" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-muted-foreground">Search Intent</label>
            <Input value={form.search_intent} onChange={(e) => setForm((prev) => ({ ...prev, search_intent: e.target.value }))} placeholder="commercial | informational" />
          </div>
          <div className="flex items-center gap-4 pt-6 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
              />
              Ativa
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.release_status === "released"}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    release_status: e.target.checked ? "released" : "draft",
                  }))
                }
              />
              Released
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">seo_pages</CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Refreshing..." : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? <p>Loading SEO pages...</p> : null}

          {!isLoading ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3">slug</th>
                    <th className="py-2 pr-3">keyword</th>
                    <th className="py-2 pr-3">release_status</th>
                    <th className="py-2 pr-3">is_active</th>
                    <th className="py-2 pr-3">cluster_level</th>
                    <th className="py-2 pr-3">cluster_keyword</th>
                    <th className="py-2 pr-3">index_status</th>
                    <th className="py-2 pr-3">traffic_estimate</th>
                    <th className="py-2 pr-3">updated_at</th>
                    <th className="py-2 pr-3">actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={String(row.id)} className="border-b align-top">
                      <td className="py-2 pr-3">{String(row.slug || "-")}</td>
                      <td className="py-2 pr-3">{String(row.keyword || "-")}</td>
                      <td className="py-2 pr-3">{String(row.release_status || "draft")}</td>
                      <td className="py-2 pr-3">{row.is_active === false ? "no" : "yes"}</td>
                      <td className="py-2 pr-3">{String(row.cluster_level || "-")}</td>
                      <td className="py-2 pr-3">{String(row.cluster_keyword || "-")}</td>
                      <td className="py-2 pr-3">{String(row.index_status || "draft")}</td>
                      <td className="py-2 pr-3">{Number(row.traffic_estimate || 0).toFixed(2)}</td>
                      <td className="py-2 pr-3">{fmtDate(row.updated_at)}</td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEdit(row)} disabled={pendingMutation}>
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => statusMutation.mutate({ id: row.id, releaseStatus: "released", isActive: true })}
                            disabled={pendingMutation}
                          >
                            Release
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => statusMutation.mutate({ id: row.id, releaseStatus: "draft", isActive: false })}
                            disabled={pendingMutation}
                          >
                            Pause
                          </Button>
                          <a
                            className="inline-flex h-9 items-center rounded-md border border-input px-3 text-xs"
                            href={seoPath(String(row.slug || ""))}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Preview
                          </a>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteMutation.mutate(row.id)}
                            disabled={pendingMutation}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
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
