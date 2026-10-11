import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { VslPlayer } from "@/components/VslPlayer";
import { videosQuery, fmtTime, pct, type Analytics } from "@/lib/videos";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Radio, MapPin, Globe, ChartNoAxesColumn, RotateCcw, Download, Share2, Eye, ChevronLeft, ChevronRight, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Analytics — Vexora" },
      { name: "description", content: "Retenção, abandono e funil da sua VSL." },
      { property: "og:title", content: "Analytics — Vexora" },
      { property: "og:description", content: "Retenção, abandono e funil da sua VSL." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { v?: string } => (typeof s['v'] === "string" ? { v: s['v'] } : {}),
  loader: ({ context }) => context.queryClient.ensureQueryData(videosQuery),
  component: Dashboard,
});

const PERIODS = { today: "Hoje", yesterday: "Ontem", "7": "7 dias", "30": "30 dias", custom: "Escolher data" } as const;
type PeriodKey = keyof typeof PERIODS;

function localDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDayStart(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function Dashboard() {
  const { data: videos } = useSuspenseQuery(videosQuery);
  const queryClient = useQueryClient();
  const [resettingMetrics, setResettingMetrics] = useState(false);
  const search = Route.useSearch();
  const [videoId, setVideoId] = useState(search.v ?? videos[0]?.id);
  const [period, setPeriod] = useState<PeriodKey>("today");
  const [selectedDate, setSelectedDate] = useState(() => localDateInputValue(new Date()));
  const [campaign, setCampaign] = useState("__all");
  const [compareMode, setCompareMode] = useState(false);
  const [showConversions, setShowConversions] = useState(false);
  const [metricsView, setMetricsView] = useState<"retention" | "countries" | "devices" | "browsers" | "sources">("retention");
  const [metricsVisible, setMetricsVisible] = useState(true);
  const video = videos.find((v) => v.id === videoId);

  const resetMetrics = async () => {
    if (!videoId || !video) return;
    const confirmed = window.confirm(`Tem certeza que deseja apagar todas as métricas da VSL "${video.name}"? Essa ação é irreversível e não excluirá o vídeo.`);
    if (!confirmed) return;

    setResettingMetrics(true);
    try {
      // Executa a limpeza em uma única transação no banco, validando a propriedade da VSL.
      const { error: resetError } = await supabase.rpc("reset_video_metrics", { _video_id: videoId });
      if (resetError) throw resetError;

      // Invalida todas as consultas de analytics, incluindo chaves com filtros/parâmetros.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
        queryClient.invalidateQueries({ queryKey: ["live-vsl-analytics"] }),
      ]);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["analytics", videoId], type: "active" }),
        queryClient.refetchQueries({ queryKey: ["live-vsl-analytics", videoId], type: "active" }),
      ]);
      toast.success("Todas as métricas e visualizações desta VSL foram apagadas. A contagem recomeçará do zero.");
    } catch (error) {
      console.error("Erro ao resetar métricas:", error);
      toast.error("Não foi possível resetar as métricas. Verifique as permissões do banco de dados.");
    } finally {
      setResettingMetrics(false);
    }
  };

  const { data: live } = useQuery({
    queryKey: ["live-vsl-analytics", videoId],
    enabled: !!videoId,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_live_vsl_analytics", { _video_id: videoId! });
      if (error) throw error;
      return data as unknown as {
        active_count: number; playing_count: number;
        viewers: { session_id: string; viewer_id: string; position: number; is_playing: boolean; last_seen_at: string; country: string | null; region: string | null; city: string | null; device_type: string | null; browser?: string | null; referrer: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null }[];
        geo: { country: string; region: string; city: string; viewers: number }[];
      };
    },
  });

  const { data: a, isLoading } = useQuery({
    queryKey: ["analytics", videoId, period, selectedDate, campaign],
    enabled: !!videoId,
    refetchInterval: 15000,
    queryFn: async () => {
      const now = new Date();
      let from: Date;
      let to: Date;
      if (period === "custom") {
        from = localDayStart(selectedDate);
        to = new Date(from);
        to.setDate(to.getDate() + 1);
      } else if (period === "yesterday") {
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else {
        const days = period === "today" ? 1 : Number(period);
        to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);
      }
      const { data, error } = await supabase.rpc("get_video_analytics", {
        _video_id: videoId!, _from: from.toISOString(), _to: to.toISOString(),
        _campaign: campaign === "__all" ? (null as unknown as string) : campaign,
      });
      if (error) throw error;
      return data as unknown as Analytics;
    },
  });

  if (!videos.length) {
    return <div className="panel p-10 text-center text-muted-foreground">Nenhuma VSL cadastrada. <Link to="/videos" className="text-primary">Cadastrar</Link></div>;
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-7 pb-8">
      <header className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <ChartNoAxesColumn className="h-4 w-4" /> Central de inteligência
            </div>
            <h1 className="truncate text-3xl font-bold tracking-tight">{video?.name ?? "Analytics"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Entenda onde a audiência continua, onde abandona e o que leva ao checkout.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={videoId ?? ""} onValueChange={setVideoId}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Selecionar VSL" /></SelectTrigger>
              <SelectContent>{videos.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(PERIODS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
            {period === "custom" && <input aria-label="Selecionar data das métricas" type="date" value={selectedDate} max={localDateInputValue(new Date())} onChange={(event) => setSelectedDate(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground" />}
            <Select value={campaign} onValueChange={setCampaign}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Filtrar campanha" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todas campanhas</SelectItem>
                {(a?.campaigns ?? []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={resetMetrics}
              disabled={resettingMetrics || !videoId}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
              title="Apagar as métricas da VSL selecionada"
            >
              <RotateCcw className={`h-4 w-4 ${resettingMetrics ? "animate-spin" : ""}`} />
              {resettingMetrics ? "Resetando..." : "Resetar métricas"}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Dados ao vivo</span>
            <span>·</span><span>Período: {period === "custom" ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString("pt-BR") : PERIODS[period]}</span>
            {campaign !== "__all" && <><span>·</span><span className="max-w-48 truncate">Campanha: {campaign}</span></>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setCompareMode(v => !v)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${compareMode ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"}`}><ArrowLeftRight className="h-4 w-4" /> Comparar {compareMode ? "ativado" : ""}</button>
            <button type="button" onClick={() => { const rows = [["Métrica","Valor"],["Visualizações",a?.views ?? 0],["Espectadores únicos",a?.unique_viewers ?? 0],["Plays",a?.plays ?? 0],["Tempo médio assistido",a?.avg_watched ?? 0],["Chegaram à oferta",a?.reached_offer ?? 0],["Cliques no checkout",a?.clicked_checkout ?? 0]]; const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g,'""')}"`).join(";")).join("\\n"); const url = URL.createObjectURL(new Blob(["\\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })); const link = document.createElement("a"); link.href = url; link.download = `vexora-metricas-${video?.name ?? "vsl"}.csv`; link.click(); URL.revokeObjectURL(url); }} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary"><Download className="h-4 w-4" /> Baixar métricas</button>
            <button type="button" onClick={() => { void navigator.clipboard.writeText(window.location.href).then(() => toast.success("Link do relatório copiado.")).catch(() => toast.error("Não foi possível copiar o link.")); }} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary"><Share2 className="h-4 w-4" /> Compartilhar</button>
            <button type="button" onClick={() => setMetricsVisible(v => !v)} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary"><Eye className="h-4 w-4" /> {metricsVisible ? "Ocultar métricas" : "Visualizar métricas"}</button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1 border-b border-border pb-0">
          {([{id:"retention",label:"Retenção geral"},{id:"countries",label:"Países"},{id:"devices",label:"Dispositivos"},{id:"browsers",label:"Navegadores"},{id:"sources",label:"Origem do tráfego"}] as const).map(tab => <button key={tab.id} type="button" onClick={() => setMetricsView(tab.id)} className={`border-b-2 px-3 py-3 text-sm font-medium transition-colors ${metricsView === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>)}
          <button type="button" onClick={() => setShowConversions(v => !v)} className="ml-auto flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground"><span>Conversões</span><span className={`relative h-5 w-9 rounded-full transition-colors ${showConversions ? "bg-primary" : "bg-muted"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${showConversions ? "translate-x-4" : "translate-x-0.5"}`} /></span></button>
        </div>
      </header>


      {isLoading || !a ? <div className="panel h-96 animate-pulse" /> : (
        <>
          {metricsVisible && (metricsView === "retention" ? <Body a={a} offer={video?.offer_time_seconds ?? null} video={video ? { id: video.id, video_url: video.video_url, thumbnail_url: video.thumbnail_url ?? null, checkout_url: video.checkout_url ?? null, offer_time_seconds: video.offer_time_seconds ?? null, player_settings: video.player_settings } : null} live={live} /> : (
            <div className="panel p-5">
              <h2 className="mb-1 text-lg font-semibold">{({countries:"Países",devices:"Dispositivos",browsers:"Navegadores",sources:"Origem do tráfego"} as const)[metricsView]}</h2>
              <p className="mb-4 text-sm text-muted-foreground">Dados históricos no período {period === "custom" ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString("pt-BR") : PERIODS[period]}{campaign !== "__all" ? ` · Campanha: ${campaign}` : ""}. Os números abaixo não representam apenas espectadores ao vivo.</p>
              <LiveBreakdown items={((({countries:a.countries,devices:a.devices,browsers:a.browsers,sources:a.sources} as const)[metricsView]) ?? []).map(item => metricsView === "countries" ? { ...item, label: countryDisplayName(item.label) } : item)} total={a.views} empty="Não há dados para este período." />
            </div>
          ))}
          {showConversions && <div className="panel p-5"><h2 className="mb-4 text-lg font-semibold">Conversões</h2><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label="Plays iniciados" value={String(a.plays)} /><Kpi label="Chegaram à oferta" value={String(a.reached_offer)} /><Kpi label="Cliques no checkout" value={String(a.clicked_checkout)} /><Kpi label="Taxa de clique no checkout" value={`${pct(a.clicked_checkout, a.plays).toFixed(2)}%`} /></div></div>}
          {compareMode && <p className="text-xs text-muted-foreground">Modo comparar ativado. Para comparar duas VSLs/períodos com duas séries independentes, essa visualização ainda precisa de uma segunda consulta de dados.</p>}
        </>
      )}
    </div>
  );
}

type LiveBreakdownItem = { label: string; count: number };

function countryDisplayName(code: string | null | undefined): string {
  const value = (code ?? "").trim();
  if (!value) return "Desconhecido";
  if (!/^[a-z]{2}$/i.test(value)) return value;
  try {
    return new Intl.DisplayNames(["pt-BR"], { type: "region" }).of(value.toUpperCase()) ?? value.toUpperCase();
  } catch {
    return value.toUpperCase();
  }
}

function aggregateLive<T extends { }>(viewers: T[], getLabel: (viewer: T) => string): LiveBreakdownItem[] {
  const counts = new Map<string, number>();
  viewers.forEach(viewer => {
    const label = getLabel(viewer).trim() || "Desconhecido";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

function LiveBreakdown({ items, total, empty }: { items: LiveBreakdownItem[]; total: number; empty: string }) {
  if (!items.length) return <p className="py-6 text-sm text-muted-foreground">{empty}</p>;
  return <div className="space-y-4">{items.map(item => (
    <div key={item.label}>
      <div className="mb-1.5 flex justify-between gap-3 text-sm"><span className="truncate">{item.label}</span><span className="shrink-0 tabular-nums text-muted-foreground">{item.count} ({total ? (item.count / total * 100).toFixed(0) : 0}%)</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: total ? `${item.count / total * 100}%` : "0%" }} /></div>
    </div>
  ))}</div>;
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="panel group relative overflow-hidden p-4 transition-colors hover:border-primary/30 hover:bg-card/80 md:p-5">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-primary/0 transition-colors group-hover:bg-primary/50" />
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="num mt-2 text-2xl font-semibold tracking-tight md:text-[1.75rem]">{value}</p>
      {sub && <p className="mt-1.5 min-h-4 text-xs leading-relaxed text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Body({ a, offer, video, live }: { a: Analytics; offer: number | null; video: { id: string; video_url: string; thumbnail_url: string | null; checkout_url: string | null; offer_time_seconds: number | null; player_settings?: unknown } | null; live?: { viewers?: { is_playing: boolean; position: number; session_id: string; last_seen_at: string }[] } | undefined }) {
  const vref = useRef<HTMLVideoElement>(null);
  const [cursor, setCursor] = useState(0);
  const [hoveredLiveMarker, setHoveredLiveMarker] = useState<{ id: string; position: number } | null>(null);
  const seek = (t: number) => { setCursor(t); if (vref.current) vref.current.currentTime = t; };
  // Mostra os valores reais de audiência de cada bucket. Não aplica mínimo
  // acumulado: isso achatava toda a curva quando um bucket inicial vinha baixo.
  const series = useMemo(() => {
    const observed = a.retention
      .map(([t, n]) => ({ t, n: Math.max(0, Number(n) || 0), r: Math.max(0, Math.min(100, pct(Number(n) || 0, a.plays))) }))
      .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.r) && point.t >= 0 && point.t <= a.duration)
      .sort((left, right) => left.t - right.t);
    if (!a.plays || !a.duration) return observed;

    const byTime = new Map<number, { t: number; n: number; r: number }>();
    byTime.set(0, { t: 0, n: a.plays, r: 100 });
    observed.forEach((point) => byTime.set(point.t, point));
    // Retention is the share of plays that reached each timestamp. It must never
    // rise later in the video; enforce that invariant as a guard against bad legacy data.
    const ordered = [...byTime.values()].sort((left, right) => left.t - right.t);
    let previousCount = a.plays;
    return ordered.map((point) => {
      const n = Math.min(previousCount, Math.max(0, point.n));
      previousCount = n;
      return { ...point, n, r: a.plays > 0 ? (n / a.plays) * 100 : 0 };
    });
  }, [a.retention, a.plays, a.duration]);
  const avgRetention = series.length ? series.reduce((s, p) => s + p.r, 0) / series.length : 0;

  // Cada espectador ativo avança individualmente no eixo do tempo entre atualizações do servidor.
  const liveViewers = (live?.viewers ?? []).filter(v => v.is_playing);
  const [liveTick, setLiveTick] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setLiveTick(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  const liveMarkers = liveViewers.map(viewer => {
    const elapsed = Math.max(0, Math.min(5, (liveTick - new Date(viewer.last_seen_at).getTime()) / 1000));
    const position = Math.max(0, Math.min(a.duration, Number(viewer.position || 0) + elapsed));
    let retention = series[0]?.r ?? 0;
    for (let i = 0; i < series.length; i++) {
      const point = series[i]!;
      if (point.t > position) {
        const previous = series[Math.max(0, i - 1)]!;
        const span = point.t - previous.t;
        const ratio = span > 0 ? (position - previous.t) / span : 0;
        retention = previous.r + (point.r - previous.r) * Math.max(0, Math.min(1, ratio));
        break;
      }
      retention = point.r;
    }
    return { id: viewer.session_id, x: position, y: retention, position, retention };
  });

  const changes = useMemo(() => {
    const step = Math.max(1, Math.round(series.length / 60)); // ~60 windows
    const w: { from: number; to: number; d: number }[] = [];
    for (let i = step; i < series.length; i += step) {
      const a0 = series[i - step]!, a1 = series[i]!;
      w.push({ from: a0.t, to: a1.t, d: a1.r - a0.r });
    }
    return {
      drops: [...w].filter((x) => x.d < 0).sort((x, y) => x.d - y.d).slice(0, 5),
      gains: [...w].filter((x) => x.d > 0).sort((x, y) => y.d - x.d).slice(0, 3),
    };
  }, [series]);

  if (a.views === 0) {
    return (
      <div className="panel p-10 text-center">
        <p className="text-lg font-semibold">Ainda não há dados neste período.</p>
        <p className="mt-2 text-sm text-muted-foreground">Incorpore o player na sua página (Biblioteca → Código) e os eventos aparecerão aqui em tempo real.</p>
      </div>
    );
  }

  const funnel = [
    { name: "Play iniciado", n: a.plays },
    { name: "Chegou à oferta", n: a.reached_offer },
    { name: "Clicou no checkout", n: a.clicked_checkout },
  ];
  const ev = (k: string) => String(a.events[k] ?? 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <Kpi label="Visualizações" value={String(a.views)} sub={`${a.unique_viewers} espectadores únicos`} />
        <Kpi label="Plays iniciados" value={String(a.plays)} sub={`${pct(a.plays, a.views).toFixed(1)}% play rate`} />
        <Kpi label="Tempo médio assistido" value={fmtTime(a.avg_watched)} sub={`pausado: ${fmtTime(a.avg_paused)}`} />
        <Kpi label="Retenção média" value={`${avgRetention.toFixed(1)}%`} sub="da duração total" />
        <Kpi label="Chegaram à oferta" value={String(a.reached_offer)} sub={`${pct(a.reached_offer, a.plays).toFixed(1)}% dos plays`} />
        <Kpi label="Cliques no checkout" value={String(a.clicked_checkout)} sub={`${pct(a.clicked_checkout, a.plays).toFixed(1)}% dos plays`} />
      </div>

      <div className="panel overflow-hidden border-border/80 p-0 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/70 px-5 py-5 md:px-6">
          <div>
            <div className="mb-1 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-primary" /><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Comportamento da audiência</p></div>
            <h2 className="text-xl font-semibold tracking-tight">Retenção da VSL</h2>
            <p className="mt-1 text-xs text-muted-foreground">Passe o cursor para inspecionar cada instante · clique no gráfico para navegar no vídeo.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-lg border border-border bg-background px-3 py-2 text-muted-foreground">Duração <strong className="ml-1 font-semibold text-foreground">{fmtTime(a.duration)}</strong></span>
            <span className="rounded-lg border border-border bg-background px-3 py-2 text-muted-foreground">Amostragem <strong className="ml-1 font-semibold text-foreground">{a.bucket_size}s</strong></span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 font-medium text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {liveMarkers.length} ao vivo</span>
          </div>
        </div>
        <div className="grid gap-5 p-4 md:p-5 lg:grid-cols-[210px_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-border/70 bg-black shadow-sm">
            {video ? <VslPlayer video={video} preview /> : <div className="aspect-[9/16] w-full" />}
          </div>
          <div className="rounded-xl border border-border/70 bg-secondary/35 p-4 text-center">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Posição selecionada</p>
            <p className="num mt-1 text-sm">{fmtTime(cursor)}</p>
            <p className="num text-2xl font-semibold text-primary">{(series.reduce((r, p) => (p.t <= cursor ? p.r : r), series[0]?.r ?? 0)).toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">ainda assistindo neste ponto</p>
          </div>
          <details className="rounded-xl border border-border/70 bg-background/50">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3">
              <span className="flex items-center gap-2 text-sm font-semibold"><Radio className="h-4 w-4 text-emerald-500" /> Audiência ao vivo <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600">{live?.active_count ?? 0}</span></span>
              <span className="text-xs text-muted-foreground">⌄</span>
            </summary>
            <div className="space-y-4 border-t border-border p-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-secondary/60 p-2"><p className="text-[11px] text-muted-foreground">Ativos</p><p className="num text-lg font-semibold">{live?.active_count ?? 0}</p></div>
                <div className="rounded-lg bg-secondary/60 p-2"><p className="text-[11px] text-muted-foreground">Assistindo</p><p className="num text-lg font-semibold">{live?.playing_count ?? 0}</p></div>
              </div>
              <div><h3 className="mb-2 text-xs font-semibold">Países</h3><LiveBreakdown items={aggregateLive(live?.viewers ?? [], v => countryDisplayName(v.country))} total={live?.active_count ?? 0} empty="Sem localização disponível." /></div>
              <div><h3 className="mb-2 text-xs font-semibold">Origem / UTM</h3><LiveBreakdown items={aggregateLive(live?.viewers ?? [], v => { const utm = [v.utm_source, v.utm_medium, v.utm_campaign].filter(Boolean).join(" / "); if (utm) return utm; if (!v.referrer) return "Direto / desconhecido"; try { return new URL(v.referrer).hostname; } catch { return v.referrer; } })} total={live?.active_count ?? 0} empty="Sem origem identificada." /></div>
              <div><h3 className="mb-2 text-xs font-semibold">Navegadores</h3><LiveBreakdown items={aggregateLive(live?.viewers ?? [], v => v.browser || "Desconhecido")} total={live?.active_count ?? 0} empty="Sem dados de navegador." /></div>
              <div><h3 className="mb-2 text-xs font-semibold">Dispositivos</h3><LiveBreakdown items={aggregateLive(live?.viewers ?? [], v => v.device_type || "Desconhecido")} total={live?.active_count ?? 0} empty="Sem dados de dispositivo." /></div>
            </div>
          </details>
        </div>
        <div className="min-w-0 rounded-xl border border-border/70 bg-background/50 p-2 pt-4 md:p-4 md:pt-5">
          <ResponsiveContainer>
            <AreaChart
              data={series}
              margin={{ left: -10, right: 10 }}
              className="cursor-crosshair"
              onClick={(st) => { const t = Number((st as { activeLabel?: number | string })?.activeLabel); if (!isNaN(t)) seek(t); }}
            >
              <defs>
                <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeDasharray="2 6" vertical={false} />
              <XAxis dataKey="t" type="number" domain={[0, a.duration]} tickFormatter={fmtTime} stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} width={42} />
              <Tooltip
                cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3", strokeWidth: 1 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload.find((entry) => entry.dataKey === "r")?.payload as { t?: number; n?: number; r?: number } | undefined;
                  if (!point) return null;
                  return (
                    <div className="w-[190px] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl">
                      <div className="border-b border-border px-3 py-2"><p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Audiência</p></div>
                      <div className="space-y-2 p-3">
                        <div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">Tempo</span><span className="num text-sm font-semibold">{fmtTime(Number(label ?? point.t))}</span></div>
                        <div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">Espectadores</span><span className="num text-sm font-semibold">{Math.max(0, Number(point.n) || 0).toLocaleString("pt-BR")}</span></div>
                        <div className="flex items-center justify-between gap-3 border-t border-border pt-2"><span className="text-xs text-muted-foreground">Retenção</span><span className="num text-sm font-bold text-primary">{Number(point.r).toFixed(1)}%</span></div>
                      </div>
                    </div>
                  );
                }}
              />
              {offer != null && <ReferenceLine x={offer} stroke="var(--warning)" label={{ value: "Oferta", fill: "var(--warning)", fontSize: 11, position: "insideTopRight" }} />}
              <ReferenceLine x={cursor} stroke="var(--foreground)" strokeWidth={1.5} />
              <Area type="linear" dataKey="r" name="Retenção" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#rg)" dot={false} activeDot={{ r: 4, stroke: "var(--background)", strokeWidth: 2 }} isAnimationActive={false} />
              {liveMarkers.map((marker) => <ReferenceDot key={marker.id} x={marker.position} y={marker.retention} r={3.5} fill="#22c55e" stroke="#ffffff" strokeWidth={1} ifOverflow="extendDomain" shape={(props: { cx?: number; cy?: number }) => props.cx == null || props.cy == null ? <g /> : <circle cx={props.cx} cy={props.cy} r={3.5} fill="#22c55e" stroke="#ffffff" strokeWidth={1} style={{ cursor: "pointer" }} onMouseEnter={() => setHoveredLiveMarker({ id: marker.id, position: marker.position })} onMouseLeave={() => setHoveredLiveMarker(null)} /> } />)}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        </div>
        {hoveredLiveMarker && <div className="mt-2 inline-flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm shadow-sm"><span className="h-2 w-2 rounded-full bg-emerald-500" /><span className="font-semibold">{liveMarkers.length === 1 ? "1 pessoa assistindo agora" : `${liveMarkers.length} pessoas assistindo agora`}</span><span className="text-muted-foreground">Posição na VSL: {fmtTime(hoveredLiveMarker.position)}</span></div>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-5 py-3 text-xs text-muted-foreground md:px-6"><span className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Cada ponto verde representa uma sessão reproduzindo neste momento.</span><span>Retenção calculada sobre os plays registrados; avanço manual não conta.</span></div>
        <div className="grid grid-cols-2 gap-2 border-t border-border/70 px-4 py-4 sm:grid-cols-5 md:px-6">
          {["10", "25", "50", "75", "100"].map((k) => (
            <div key={k} className="rounded-md bg-secondary p-3 text-center">
              <p className="text-xs text-muted-foreground">{k}% do vídeo</p>
              <p className="num text-lg font-semibold">{pct(a.marks?.[k] ?? 0, a.plays).toFixed(1)}%</p>
              <p className="num text-xs text-muted-foreground">{a.marks?.[k] ?? 0} sessões</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="panel overflow-hidden p-0">
          <div className="border-b border-border/70 px-5 py-4 md:px-6"><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Conversão</p><h2 className="text-lg font-semibold tracking-tight">Funil de conversão</h2>
          <p className="mt-1 text-xs text-muted-foreground">Acompanhe a progressão entre reprodução, oferta e checkout.</p></div>
          <div className="space-y-5 p-5 md:p-6">
          <div className="space-y-5">
            {funnel.map((f, i) => (
              <div key={f.name}>
                <div className="mb-2 flex items-end justify-between gap-3"><div><p className="text-sm font-medium">{f.name}</p><p className="mt-0.5 text-xs text-muted-foreground">Etapa {i + 1} de {funnel.length}</p></div><div className="text-right"><p className="num text-base font-semibold">{f.n.toLocaleString("pt-BR")}</p><p className="num text-xs text-muted-foreground">{pct(f.n, a.plays).toFixed(1)}%</p></div></div>
                <div className="h-3 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct(f.n, a.plays)}%`, opacity: 1 - i * 0.22 }} />
                </div>
                {i > 0 && <p className="mt-1 text-xs text-muted-foreground">{pct(f.n, funnel[i - 1]!.n).toFixed(1)}% da etapa anterior</p>}
              </div>
            ))}
          </div>
        </div>
        <div className="panel overflow-hidden p-0">
          <div className="border-b border-border/70 px-5 py-4 md:px-6"><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Diagnóstico</p><h2 className="text-lg font-semibold tracking-tight">Momentos críticos</h2><p className="mt-1 text-xs text-muted-foreground">Maiores quedas e recuperações de retenção ao longo da VSL.</p></div>
          <div className="space-y-5 p-5 md:p-6">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-destructive">Maiores quedas</p>
              {changes.drops.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma queda relevante neste período.</p> : (
                <div className="space-y-2">
                  {changes.drops.map((w) => (
                    <button key={`d-${w.from}`} type="button" onClick={() => seek(w.from)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-left text-sm transition-colors hover:border-destructive/40">
                      <span className="num font-medium">{fmtTime(w.from)} → {fmtTime(w.to)}</span>
                      <span className="num font-semibold text-destructive">{w.d.toFixed(1)} pts</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-600">Recuperações</p>
              {changes.gains.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma recuperação relevante neste período.</p> : (
                <div className="space-y-2">
                  {changes.gains.map((w) => (
                    <button key={`g-${w.from}`} type="button" onClick={() => seek(w.from)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-left text-sm transition-colors hover:border-emerald-500/40">
                      <span className="num font-medium">{fmtTime(w.from)} → {fmtTime(w.to)}</span>
                      <span className="num font-semibold text-emerald-600">+{w.d.toFixed(1)} pts</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="panel overflow-hidden p-0">
          <div className="border-b border-border/70 px-5 py-4 md:px-6"><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Tendência</p><h2 className="text-lg font-semibold tracking-tight">Desempenho por dia</h2><p className="mt-1 text-xs text-muted-foreground">Compare visualizações, reproduções e cliques no período selecionado.</p></div>
          <div className="p-4 md:p-5">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={a.daily}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="2 6" vertical={false} />
                <XAxis dataKey="d" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} cursor={{ fill: "var(--accent)" }} />
                <Bar dataKey="views" name="Visualizações" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="plays" name="Plays" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="clicks" name="Cliques" fill="var(--chart-3)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        </div>
        <div className="panel overflow-hidden p-0">
          <div className="border-b border-border/70 px-5 py-4 md:px-6"><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Interações</p><h2 className="text-lg font-semibold tracking-tight">Eventos registrados</h2><p className="mt-1 text-xs text-muted-foreground">Ações detectadas dentro do player no período selecionado.</p></div>
          <div className="px-5 py-3 md:px-6">
          {([
            ["Play", "play"], ["Pausa", "pause"], ["Retomada", "resume"], ["Avanço", "seek_forward"],
            ["Retorno", "seek_backward"], ["Abandono", "abandon"], ["Chegada ao CTA", "cta_reached"],
            ["Clique no checkout", "checkout_click"], ["Assistiu até o fim", "complete"],
          ] as [string, string][]).map(([l, k]) => (
            <div key={k} className="flex items-center justify-between gap-3 border-b border-border/70 py-2.5 text-sm last:border-0">
              <span className="text-muted-foreground">{l}</span><span className="num rounded-md bg-secondary px-2 py-1 text-xs font-semibold">{ev(k)}</span>
            </div>
          ))}
        </div>
        </div>
      </div>
    </>
  );
}
