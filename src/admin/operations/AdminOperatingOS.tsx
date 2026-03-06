import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/Components/ui/card";
import { Button } from "@/Components/ui/button";
import { Input } from "@/Components/ui/input";

type CandidateStatus = "new" | "reviewing" | "approved" | "rejected" | "saved";

type CandidateRow = {
  id: string;
  title: string;
  category: string | null;
  signal_origin: string;
  status: CandidateStatus;
  opportunity_score: number;
  viral_score: number;
  created_at: string;
  updated_at: string;
};

type EventRow = {
  candidate_id: string;
  event_type: string;
  actor: string | null;
  created_at: string;
};

type WindowMetrics = {
  approvals1h: number;
  approvals24h: number;
  approvals7d: number;
  decisions1h: number;
  decisions24h: number;
  decisions7d: number;
};

const todayStartIso = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

const safeCount = async (table: string, filter?: (query: any) => any) => {
  let query = supabase.from(table as any).select("id", { count: "exact", head: true });
  if (filter) query = filter(query);
  const { count } = await query;
  return count || 0;
};

export default function AdminOperatingOS() {
  const [statusFilter, setStatusFilter] = useState<CandidateStatus | "all">("all");
  const [scoreFilter, setScoreFilter] = useState("0");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [originFilter, setOriginFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-operating-os"],
    queryFn: async () => {
      const now = Date.now();
      const iso1h = new Date(now - 1 * 60 * 60 * 1000).toISOString();
      const iso24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const iso7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [
        candidatesResp,
        eventsResp,
        approvalsToday,
        rejectionsToday,
        seoReleasedToday,
        discoveryCritical,
        approvals1h,
        approvals24h,
        approvals7d,
        decisions1h,
        decisions24h,
        decisions7d,
      ] = await Promise.all([
        supabase
          .from("discovery_candidates" as any)
          .select("id,title,category,signal_origin,status,opportunity_score,viral_score,created_at,updated_at")
          .order("updated_at", { ascending: false })
          .limit(2000),
        supabase
          .from("discovery_candidate_events" as any)
          .select("candidate_id,event_type,actor,created_at")
          .order("created_at", { ascending: false })
          .limit(3000),
        safeCount("discovery_candidate_events", (q) => q.eq("event_type", "approved").gte("created_at", todayStartIso())),
        safeCount("discovery_candidate_events", (q) => q.eq("event_type", "rejected").gte("created_at", todayStartIso())),
        safeCount("seo_pages", (q) => q.eq("release_status", "released").gte("released_at", todayStartIso())),
        safeCount("discovery_alerts", (q) => q.eq("severity", "critical").in("status", ["new", "acknowledged"])),
        safeCount("discovery_candidate_events", (q) => q.eq("event_type", "approved").gte("created_at", iso1h)),
        safeCount("discovery_candidate_events", (q) => q.eq("event_type", "approved").gte("created_at", iso24h)),
        safeCount("discovery_candidate_events", (q) => q.eq("event_type", "approved").gte("created_at", iso7d)),
        safeCount("discovery_candidate_events", (q) => q.in("event_type", ["approved", "rejected", "saved"]).gte("created_at", iso1h)),
        safeCount("discovery_candidate_events", (q) => q.in("event_type", ["approved", "rejected", "saved"]).gte("created_at", iso24h)),
        safeCount("discovery_candidate_events", (q) => q.in("event_type", ["approved", "rejected", "saved"]).gte("created_at", iso7d)),
      ]);

      let deployHealth = { status: "unknown", critical: 0 };
      try {
        const resp = await fetch("/.netlify/functions/pipeline-status");
        if (resp.ok) {
          const payload = await resp.json();
          const status = String(payload?.pipeline_status || "unknown").toUpperCase();
          deployHealth = { status, critical: status === "OK" ? 0 : 1 };
        }
      } catch {
        deployHealth = { status: "unreachable", critical: 1 };
      }

      return {
        candidates: (candidatesResp.data || []) as CandidateRow[],
        events: (eventsResp.data || []) as EventRow[],
        kpis: {
          approvalsToday,
          rejectionsToday,
          seoReleasedToday,
          criticalErrors: discoveryCritical + deployHealth.critical,
          deployStatus: deployHealth.status,
          windows: {
            approvals1h,
            approvals24h,
            approvals7d,
            decisions1h,
            decisions24h,
            decisions7d,
          } as WindowMetrics,
        },
      };
    },
    refetchInterval: 30000,
  });

  const latestOwnerMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const event of data?.events || []) {
      if (!event?.candidate_id || map.has(event.candidate_id)) continue;
      map.set(event.candidate_id, String(event.actor || "system"));
    }
    return map;
  }, [data?.events]);

  const filtered = useMemo(() => {
    const rows = data?.candidates || [];
    const minScore = Number(scoreFilter || 0);
    const catNeedle = categoryFilter.trim().toLowerCase();
    const originNeedle = originFilter.trim().toLowerCase();
    const ownerNeedle = ownerFilter.trim().toLowerCase();
    const fromTs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : 0;
    const toTs = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;

    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      const mergedScore = Math.max(Number(row.opportunity_score || 0), Number(row.viral_score || 0));
      if (mergedScore < minScore) return false;
      if (catNeedle && !String(row.category || "").toLowerCase().includes(catNeedle)) return false;
      if (originNeedle && !String(row.signal_origin || "").toLowerCase().includes(originNeedle)) return false;
      const owner = String(latestOwnerMap.get(row.id) || "system").toLowerCase();
      if (ownerNeedle && !owner.includes(ownerNeedle)) return false;
      const ts = new Date(row.updated_at).getTime();
      if (Number.isFinite(fromTs) && ts < fromTs) return false;
      if (Number.isFinite(toTs) && ts > toTs) return false;
      return true;
    });
  }, [data?.candidates, statusFilter, scoreFilter, categoryFilter, originFilter, ownerFilter, dateFrom, dateTo, latestOwnerMap]);

  const backlog = useMemo(
    () => filtered.filter((row) => row.status === "new" || row.status === "reviewing").length,
    [filtered],
  );

  const nowTs = Date.now();
  const elapsedHoursToday = Math.max(1, (nowTs - new Date(todayStartIso()).getTime()) / (1000 * 60 * 60));

  const decisionEventMap = useMemo(() => {
    const map = new Map<string, EventRow>();
    for (const event of data?.events || []) {
      if (!event?.candidate_id || map.has(event.candidate_id)) continue;
      if (!["approved", "rejected", "saved"].includes(String(event.event_type || ""))) continue;
      map.set(event.candidate_id, event);
    }
    return map;
  }, [data?.events]);

  const avgDecisionMinutesToday = useMemo(() => {
    const rows = (data?.candidates || []).filter((row) => decisionEventMap.has(row.id));
    const minutes = rows
      .map((row) => {
        const event = decisionEventMap.get(row.id);
        if (!event?.created_at) return null;
        const from = new Date(row.created_at || row.updated_at).getTime();
        const to = new Date(event.created_at).getTime();
        if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
        return (to - from) / (1000 * 60);
      })
      .filter((v): v is number => v !== null);
    if (!minutes.length) return 0;
    return Number((minutes.reduce((acc, cur) => acc + cur, 0) / minutes.length).toFixed(1));
  }, [data?.candidates, decisionEventMap]);

  const backlogAging = useMemo(() => {
    const rows = filtered.filter((row) => row.status === "new" || row.status === "reviewing");
    let lt24 = 0;
    let h24to72 = 0;
    let gt72 = 0;
    for (const row of rows) {
      const ageHours = (nowTs - new Date(row.created_at || row.updated_at).getTime()) / (1000 * 60 * 60);
      if (ageHours < 24) lt24 += 1;
      else if (ageHours < 72) h24to72 += 1;
      else gt72 += 1;
    }
    return { lt24, h24to72, gt72 };
  }, [filtered, nowTs]);

  const backlogAgingSeverity = useMemo(() => {
    const rows = filtered.filter((row) => row.status === "new" || row.status === "reviewing");
    let high = 0;
    let medium = 0;
    let low = 0;
    for (const row of rows) {
      const mergedScore = Math.max(Number(row.opportunity_score || 0), Number(row.viral_score || 0));
      if (mergedScore >= 80) high += 1;
      else if (mergedScore >= 60) medium += 1;
      else low += 1;
    }
    return { high, medium, low };
  }, [filtered]);

  const approvalsPerHour = useMemo(() => Number(((data?.kpis?.approvalsToday || 0) / elapsedHoursToday).toFixed(2)), [data?.kpis?.approvalsToday, elapsedHoursToday]);
  const rejectsPerHour = useMemo(() => Number(((data?.kpis?.rejectionsToday || 0) / elapsedHoursToday).toFixed(2)), [data?.kpis?.rejectionsToday, elapsedHoursToday]);

  const ownerLeaderboard = useMemo(() => {
    const todayStart = new Date(todayStartIso()).getTime();
    const counts = new Map<string, number>();
    for (const event of data?.events || []) {
      const eventTs = new Date(event.created_at).getTime();
      if (eventTs < todayStart) continue;
      if (!["approved", "rejected", "saved"].includes(String(event.event_type || ""))) continue;
      const actor = String(event.actor || "system");
      counts.set(actor, (counts.get(actor) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([actor, actions]) => ({ actor, actions }))
      .sort((a, b) => b.actions - a.actions)
      .slice(0, 8);
  }, [data?.events]);

  const operatorEfficiency = useMemo(() => {
    const todayStart = new Date(todayStartIso()).getTime();
    const candidateMap = new Map((data?.candidates || []).map((row) => [row.id, row]));
    const grouped = new Map<string, { actions: number; minutes: number[] }>();

    for (const event of data?.events || []) {
      const ts = new Date(event.created_at).getTime();
      if (ts < todayStart) continue;
      if (!["approved", "rejected", "saved"].includes(String(event.event_type || ""))) continue;
      const actor = String(event.actor || "system");
      const candidate = candidateMap.get(String(event.candidate_id || ""));
      const fromTs = candidate ? new Date(candidate.created_at || candidate.updated_at).getTime() : NaN;
      const decisionMinutes = Number.isFinite(fromTs) && ts >= fromTs ? (ts - fromTs) / (1000 * 60) : null;

      if (!grouped.has(actor)) grouped.set(actor, { actions: 0, minutes: [] });
      const row = grouped.get(actor)!;
      row.actions += 1;
      if (decisionMinutes !== null) row.minutes.push(decisionMinutes);
    }

    return Array.from(grouped.entries())
      .map(([actor, payload]) => ({
        actor,
        actions: payload.actions,
        avgDecisionMinutes: payload.minutes.length
          ? Number((payload.minutes.reduce((acc, cur) => acc + cur, 0) / payload.minutes.length).toFixed(1))
          : 0,
      }))
      .sort((a, b) => b.actions - a.actions)
      .slice(0, 8);
  }, [data?.events, data?.candidates]);

  const applyPreset = (preset: "review_hot" | "high_score" | "seo_today" | "incidents") => {
    if (preset === "review_hot") {
      setStatusFilter("reviewing");
      setScoreFilter("65");
      setDateFrom("");
      setDateTo("");
      return;
    }
    if (preset === "high_score") {
      setStatusFilter("all");
      setScoreFilter("80");
      setDateFrom("");
      setDateTo("");
      return;
    }
    if (preset === "seo_today") {
      setStatusFilter("approved");
      setScoreFilter("0");
      const today = new Date().toISOString().slice(0, 10);
      setDateFrom(today);
      setDateTo(today);
      return;
    }
    setStatusFilter("all");
    setScoreFilter("0");
    setDateFrom("");
    setDateTo("");
  };

  const lanes = [
    {
      title: "Discovery Queue",
      description: "Triagem de oportunidades com score, origem e dono operacional.",
      to: "/admin/discovery",
      metric: `${backlog} em backlog`,
    },
    {
      title: "Products Queue",
      description: "Revisao de fila de catalogo e validacoes pendentes.",
      to: "/admin/products-queue",
      metric: "fila operacional",
    },
    {
      title: "SEO Pipeline",
      description: "Governanca de release e cadencia de publicacao.",
      to: "/admin/seo-health",
      metric: `${data?.kpis?.seoReleasedToday || 0} paginas hoje`,
    },
    {
      title: "Pipeline Health",
      description: "Status do ciclo automatizado e falhas recentes.",
      to: "/admin/pipeline-health",
      metric: `status ${String(data?.kpis?.deployStatus || "unknown").toLowerCase()}`,
    },
    {
      title: "Deploy Health",
      description: "Conferencia de estabilidade e prontidao operacional.",
      to: "/admin/system-explorer",
      metric: `${data?.kpis?.criticalErrors || 0} erros criticos`,
    },
    {
      title: "Logs/Alerts",
      description: "Eventos e alertas para triagem rapida de incidentes.",
      to: "/admin/system-explorer",
      metric: "observabilidade central",
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Operating OS</h1>
        <p className="text-sm text-muted-foreground">
          Painel operacional unico para discovery, fila de produtos, SEO e confiabilidade em escala.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <Card><CardHeader><CardTitle className="text-sm">Backlog</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{backlog}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Aprovados/Dia</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{data?.kpis?.approvalsToday ?? 0}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Rejeitados/Dia</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{data?.kpis?.rejectionsToday ?? 0}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Paginas SEO/Dia</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{data?.kpis?.seoReleasedToday ?? 0}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Erros Criticos</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{data?.kpis?.criticalErrors ?? 0}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
        <Card><CardHeader><CardTitle className="text-sm">Aprovacoes 1h</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{data?.kpis?.windows?.approvals1h ?? 0}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Aprovacoes 24h</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{data?.kpis?.windows?.approvals24h ?? 0}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Aprovacoes 7d</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{data?.kpis?.windows?.approvals7d ?? 0}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Decisoes 1h</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{data?.kpis?.windows?.decisions1h ?? 0}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Decisoes 24h</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{data?.kpis?.windows?.decisions24h ?? 0}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Decisoes 7d</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{data?.kpis?.windows?.decisions7d ?? 0}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-sm">Throughput Aprovacao/H</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{approvalsPerHour}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Throughput Rejeicao/H</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{rejectsPerHour}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Tempo Medio Decisao</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{avgDecisionMinutesToday}m</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Backlog +72h</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{backlogAging.gt72}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Presets Operacionais</CardTitle>
          <CardDescription>Atalhos para triagem rapida em escala.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => applyPreset("review_hot")}>Review Hot Queue</Button>
          <Button variant="outline" size="sm" onClick={() => applyPreset("high_score")}>High Score</Button>
          <Button variant="outline" size="sm" onClick={() => applyPreset("seo_today")}>Aprovados Hoje</Button>
          <Button variant="outline" size="sm" onClick={() => applyPreset("incidents")}>Reset Filtros</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filtros Globais</CardTitle>
          <CardDescription>Status, score, categoria, data, origem e owner operacional.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-7">
          <select className="rounded-md border bg-background px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as CandidateStatus | "all") }>
            <option value="all">all</option>
            <option value="new">new</option>
            <option value="reviewing">reviewing</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
            <option value="saved">saved</option>
          </select>
          <Input value={scoreFilter} onChange={(e) => setScoreFilter(e.target.value)} placeholder="score minimo" />
          <Input value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} placeholder="categoria" />
          <Input value={originFilter} onChange={(e) => setOriginFilter(e.target.value)} placeholder="origem" />
          <Input value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} placeholder="owner" />
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {lanes.map((lane) => (
          <Card key={lane.title}>
            <CardHeader>
              <CardTitle>{lane.title}</CardTitle>
              <CardDescription>{lane.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{lane.metric}</p>
              <Link to={lane.to} className="inline-flex">
                <Button variant="outline" size="sm">Abrir</Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Sample Queue ({filtered.length})</CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Refreshing..." : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? <p>Carregando...</p> : null}
          {!isLoading && !filtered.length ? <p>Sem resultados para os filtros atuais.</p> : null}
          {!isLoading && filtered.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3">title</th>
                    <th className="py-2 pr-3">status</th>
                    <th className="py-2 pr-3">score</th>
                    <th className="py-2 pr-3">categoria</th>
                    <th className="py-2 pr-3">origem</th>
                    <th className="py-2 pr-3">owner</th>
                    <th className="py-2 pr-3">atualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 100).map((row) => (
                    <tr key={row.id} className="border-b align-top">
                      <td className="py-2 pr-3">{row.title}</td>
                      <td className="py-2 pr-3">{row.status}</td>
                      <td className="py-2 pr-3">{Math.max(Number(row.opportunity_score || 0), Number(row.viral_score || 0))}</td>
                      <td className="py-2 pr-3">{row.category || "-"}</td>
                      <td className="py-2 pr-3">{row.signal_origin || "-"}</td>
                      <td className="py-2 pr-3">{latestOwnerMap.get(row.id) || "system"}</td>
                      <td className="py-2 pr-3">{new Date(row.updated_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">SLA Aging Backlog</CardTitle>
            <CardDescription>Distribuicao de fila por idade operacional.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>&lt; 24h:</strong> {backlogAging.lt24}</p>
            <p><strong>24h - 72h:</strong> {backlogAging.h24to72}</p>
            <p><strong>&gt; 72h:</strong> {backlogAging.gt72}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Backlog por Severidade</CardTitle>
            <CardDescription>Priorizacao operacional por score combinado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>Alta (&gt;=80):</strong> {backlogAgingSeverity.high}</p>
            <p><strong>Media (60-79):</strong> {backlogAgingSeverity.medium}</p>
            <p><strong>Baixa (&lt;60):</strong> {backlogAgingSeverity.low}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Owner Throughput Hoje</CardTitle>
            <CardDescription>Atores com maior volume de decisao.</CardDescription>
          </CardHeader>
          <CardContent>
            {!ownerLeaderboard.length ? <p className="text-sm text-muted-foreground">Sem acoes de decisao hoje.</p> : null}
            {ownerLeaderboard.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-3">actor</th>
                      <th className="py-2 pr-3">actions_today</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ownerLeaderboard.map((row) => (
                      <tr key={row.actor} className="border-b">
                        <td className="py-2 pr-3">{row.actor}</td>
                        <td className="py-2 pr-3">{row.actions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eficiencia por Operador</CardTitle>
            <CardDescription>Throughput e tempo medio de decisao no dia.</CardDescription>
          </CardHeader>
          <CardContent>
            {!operatorEfficiency.length ? <p className="text-sm text-muted-foreground">Sem dados de eficiencia hoje.</p> : null}
            {operatorEfficiency.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-3">actor</th>
                      <th className="py-2 pr-3">acoes</th>
                      <th className="py-2 pr-3">tempo medio (m)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {operatorEfficiency.map((row) => (
                      <tr key={row.actor} className="border-b">
                        <td className="py-2 pr-3">{row.actor}</td>
                        <td className="py-2 pr-3">{row.actions}</td>
                        <td className="py-2 pr-3">{row.avgDecisionMinutes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
