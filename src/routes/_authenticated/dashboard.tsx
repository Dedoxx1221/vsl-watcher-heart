import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { videosQuery, fmtTime, pct, type Analytics } from "@/lib/videos";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Radio, MapPin, Monitor, Smartphone, Tablet, Globe, MousePointerClick, Compass, ChartNoAxesColumn } from "lucide-react";

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

const PERIODS = { "1": "Hoje", "7": "7 dias", "30": "30 dias", "90": "90 dias", all: "Todo período" } as const;

function Dashboard() {
  const { data: videos } = useSuspenseQuery(videosQuery);
  const search = Route.useSearch();
  const [videoId, setVideoId] = useState(search.v ?? videos[0]?.id);
  const [period, setPeriod] = useState<keyof typeof PERIODS>("30");
  const [campaign, setCampaign] = useState("__all");
  const video = videos.find((v) => v.id === videoId);

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
    queryKey: ["analytics", videoId, period, campaign],
    enabled: !!videoId,
    refetchInterval: 15000,
    queryFn: async () => {
      const from = period === "all" ? new Date(0) : new Date(Date.now() - Number(period) * 86400000);
      if (period === "1") from.setHours(0, 0, 0, 0);
      const { data, error } = await supabase.rpc("get_video_analytics", {
        _video_id: videoId!, _from: from.toISOString(), _to: new Date(Date.now() + 60000).toISOString(),
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
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Analytics de VSL</p>
          <h1 className="text-3xl font-bold">{video?.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={videoId ?? ""} onValueChange={setVideoId}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>{videos.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={period} onValueChange={(v) => setPeriod(v as keyof typeof PERIODS)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(PERIODS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={campaign} onValueChange={setCampaign}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Campanha" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todas campanhas</SelectItem>
              {(a?.campaigns ?? []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-emerald-500" />
            <h2 className="text-xl font-bold">Ao vivo</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-600"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />Atualiza a cada 5 s</span>
          </div>
          <p className="text-xs text-muted-foreground">Sessões vistas nos últimos 35 segundos</p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Espectadores ativos" value={String(live?.active_count ?? 0)} sub="Player aberto recentemente" />
          <Kpi label="Assistindo agora" value={String(live?.playing_count ?? 0)} sub="Reprodução em andamento" />
          <Kpi label="Localizações detectadas" value={String((live?.geo ?? []).filter(g => g.country !== "Desconhecido").length)} sub="País/região/cidade quando disponíveis" />
          <Kpi label="Fontes UTM distintas" value={String(new Set((live?.viewers ?? []).map(v => v.utm_source).filter(Boolean)).size)} sub="Entre as sessões ativas" />
        </div>
        <div className="panel overflow-hidden">
          <div className="border-b border-border p-4">
            <h3 className="font-semibold">Espectadores neste momento</h3>
            <p className="mt-1 text-xs text-muted-foreground">Veja os dados agregados dos espectadores ativos, sem informações desnecessárias por sessão.</p>
          </div>
          <Tabs defaultValue="retencao" className="w-full">
            <div className="overflow-x-auto border-b border-border px-3">
              <TabsList className="h-auto min-w-max bg-transparent p-0">
                <TabsTrigger value="retencao" className="gap-2 rounded-none border-b-2 border-transparent px-3 py-3 data-[state=active]:border-primary"><ChartNoAxesColumn className="h-4 w-4" />Retenção geral</TabsTrigger>
                <TabsTrigger value="paises" className="gap-2 rounded-none border-b-2 border-transparent px-3 py-3 data-[state=active]:border-primary"><Globe className="h-4 w-4" />Países</TabsTrigger>
                <TabsTrigger value="origem" className="gap-2 rounded-none border-b-2 border-transparent px-3 py-3 data-[state=active]:border-primary"><MousePointerClick className="h-4 w-4" />Origem</TabsTrigger>
                <TabsTrigger value="navegadores" className="gap-2 rounded-none border-b-2 border-transparent px-3 py-3 data-[state=active]:border-primary"><Compass className="h-4 w-4" />Navegadores</TabsTrigger>
                <TabsTrigger value="dispositivos" className="gap-2 rounded-none border-b-2 border-transparent px-3 py-3 data-[state=active]:border-primary"><Monitor className="h-4 w-4" />Dispositivos</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="retencao" className="m-0 p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-medium">Posição atual no vídeo</h4><p className="text-xs text-muted-foreground">Distribuição dos espectadores ativos por trecho da VSL.</p></div><span className="text-sm text-muted-foreground">{live?.active_count ?? 0} espectadores</span></div>
              <div className="space-y-4">
                {[
                  { label: "0–25% do vídeo", min: 0, max: 25 },
                  { label: "25–50% do vídeo", min: 25, max: 50 },
                  { label: "50–75% do vídeo", min: 50, max: 75 },
                  { label: "75–100% do vídeo", min: 75, max: 100 },
                ].map((bucket) => {
                  const duration = Number(video?.duration_seconds ?? 0);
                  const viewers = (live?.viewers ?? []).filter(v => {
                    const p = duration > 0 ? (Number(v.position) / duration) * 100 : 0;
                    return p >= bucket.min && (p < bucket.max || bucket.max === 100 && p <= 100);
                  }).length;
                  const total = live?.active_count ?? 0;
                  return <div key={bucket.label}><div className="mb-1.5 flex justify-between gap-3 text-sm"><span>{bucket.label}</span><span className="tabular-nums text-muted-foreground">{viewers} ({total ? (viewers / total * 100).toFixed(0) : 0}%)</span></div><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: total ? `${viewers / total * 100}%` : "0%" }} /></div></div>;
                })}
              </div>
              {!live?.viewers?.length && <p className="pt-4 text-sm text-muted-foreground">Nenhum espectador ativo no momento. Abra uma VSL em outra aba para testar.</p>}
            </TabsContent>
            <TabsContent value="paises" className="m-0 p-4">
              <LiveBreakdown items={aggregateLive(live?.viewers ?? [], v => v.country || "Desconhecido")} total={live?.active_count ?? 0} empty="Os países aparecerão quando houver espectadores ativos e o servidor disponibilizar a localização." />
            </TabsContent>
            <TabsContent value="origem" className="m-0 p-4">
              <LiveBreakdown items={aggregateLive(live?.viewers ?? [], v => {
                const utm = [v.utm_source, v.utm_medium, v.utm_campaign].filter(Boolean).join(" / ");
                if (utm) return utm;
                if (!v.referrer) return "Direto / desconhecido";
                try { return new URL(v.referrer).hostname; } catch { return v.referrer; }
              })} total={live?.active_count ?? 0} empty="As origens aparecerão conforme os espectadores acessarem a VSL." />
            </TabsContent>
            <TabsContent value="navegadores" className="m-0 p-4">
              <LiveBreakdown items={aggregateLive(live?.viewers ?? [], v => v.browser || "Desconhecido")} total={live?.active_count ?? 0} empty="Os navegadores aparecerão quando o endpoint disponibilizar essa informação para cada sessão." />
            </TabsContent>
            <TabsContent value="dispositivos" className="m-0 p-4">
              <LiveBreakdown items={aggregateLive(live?.viewers ?? [], v => v.device_type || "Desconhecido")} total={live?.active_count ?? 0} empty="Os dispositivos aparecerão conforme houver espectadores ativos." />
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {isLoading || !a ? <div className="panel h-96 animate-pulse" /> : <Body a={a} offer={video?.offer_time_seconds ?? null} videoUrl={video?.video_url ?? ""} live={live} />}
    </div>
  );
}

type LiveBreakdownItem = { label: string; count: number };

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
    <div className="panel p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="num mt-1 text-2xl font-semibold">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Body({ a, offer, videoUrl, live }: { a: Analytics; offer: number | null; videoUrl: string; live?: { viewers?: { is_playing: boolean; position: number }[] } | undefined }) {
  const vref = useRef<HTMLVideoElement>(null);
  const [cursor, setCursor] = useState(0);
  const seek = (t: number) => { setCursor(t); if (vref.current) vref.current.currentTime = t; };
  // Ajuste isotônico decrescente: reduz oscilações de amostras pequenas sem
  // inventar uma queda em cada ponto. A curva exibida nunca sobe, como em players de VSL.
  const series = useMemo(() => {
    const raw = a.retention.map(([t, n]) => ({ t, n, r: Math.max(0, Math.min(100, pct(n, a.plays))) }));
    if (raw.length < 3) return raw;
    const blocks: { start: number; end: number; sum: number; weight: number }[] = [];
    raw.forEach((point, i) => {
      blocks.push({ start: i, end: i, sum: point.r, weight: 1 });
      // Para uma curva decrescente, blocos adjacentes não podem subir.
      while (blocks.length > 1) {
        const right = blocks[blocks.length - 1]!;
        const left = blocks[blocks.length - 2]!;
        if (left.sum / left.weight >= right.sum / right.weight) break;
        blocks.splice(blocks.length - 2, 2, {
          start: left.start, end: right.end,
          sum: left.sum + right.sum, weight: left.weight + right.weight,
        });
      }
    });
    const fitted = [...raw];
    for (const block of blocks) {
      const value = block.sum / block.weight;
      for (let i = block.start; i <= block.end; i++) fitted[i] = { ...raw[i]!, r: value };
    }
    return fitted;
  }, [a]);
  const avgRetention = series.length ? series.reduce((s, p) => s + p.r, 0) / series.length : 0;

  // Posição ao vivo: acompanha somente espectadores cuja reprodução está ativa.
  // Se todos pausarem ou saírem, o marcador para no último ponto recebido.
  const livePlaying = (live?.viewers ?? []).filter(v => v.is_playing);
  const livePosition = livePlaying.length
    ? livePlaying.reduce((sum, v) => sum + Number(v.position || 0), 0) / livePlaying.length
    : null;
  const [liveCursor, setLiveCursor] = useState<number | null>(null);
  const [liveCursorRunning, setLiveCursorRunning] = useState(false);
  const livePositionRef = useRef<number | null>(null);
  const liveUpdatedAtRef = useRef<number>(Date.now());

  // Interpola suavemente entre heartbeats do servidor. Pausa/saída congela o traço.
  useEffect(() => {
    if (livePosition == null) {
      setLiveCursorRunning(false);
      return;
    }
    livePositionRef.current = livePosition;
    liveUpdatedAtRef.current = Date.now();
    setLiveCursor(livePosition);
    setLiveCursorRunning(true);
    const timer = window.setInterval(() => {
      const elapsed = (Date.now() - liveUpdatedAtRef.current) / 1000;
      setLiveCursor((livePositionRef.current ?? livePosition) + elapsed);
    }, 100);
    return () => window.clearInterval(timer);
  }, [livePosition, livePlaying.length]);

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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Visualizações" value={String(a.views)} sub={`${a.unique_viewers} espectadores únicos`} />
        <Kpi label="Plays iniciados" value={String(a.plays)} sub={`${pct(a.plays, a.views).toFixed(1)}% play rate`} />
        <Kpi label="Tempo médio assistido" value={fmtTime(a.avg_watched)} sub={`pausado: ${fmtTime(a.avg_paused)}`} />
        <Kpi label="Retenção média" value={`${avgRetention.toFixed(1)}%`} sub="da duração total" />
        <Kpi label="Chegaram à oferta" value={String(a.reached_offer)} sub={`${pct(a.reached_offer, a.plays).toFixed(1)}% dos plays`} />
        <Kpi label="Cliques no checkout" value={String(a.clicked_checkout)} sub={`${pct(a.clicked_checkout, a.plays).toFixed(1)}% dos plays`} />
      </div>

      <div className="panel p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Retenção ao longo do vídeo</h2>
          <p className="text-xs text-muted-foreground">Somente reprodução real — avanços pela barra não contam. Intervalo: {a.bucket_size}s · duração {fmtTime(a.duration)}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="space-y-2">
          <video
            ref={vref}
            src={videoUrl}
            controls
            preload="metadata"
            playsInline
            className="aspect-[9/16] w-full rounded-md bg-background object-contain"
            onTimeUpdate={(e) => setCursor(e.currentTarget.currentTime)}
          />
          <div className="rounded-md bg-secondary p-2 text-center">
            <p className="num text-sm">{fmtTime(cursor)}</p>
            <p className="num text-lg font-semibold text-primary">{(series.reduce((r, p) => (p.t <= cursor ? p.r : r), series[0]?.r ?? 0)).toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">ainda assistindo neste ponto</p>
          </div>
        </div>
        <div className="h-80 lg:h-auto lg:min-h-[420px]">
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
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="t" type="number" domain={[0, a.duration]} tickFormatter={fmtTime} stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip
                cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "4 4" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0]?.payload as { t: number; n: number; r: number } | undefined;
                  if (!point) return null;
                  return (
                    <div className="min-w-[190px] rounded-lg border border-border bg-popover px-3 py-2.5 text-popover-foreground shadow-xl">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">Dados neste ponto</p>
                      <div className="mb-2 flex items-center justify-between gap-5">
                        <span className="text-sm text-muted-foreground">Tempo</span>
                        <span className="num text-sm font-semibold">{fmtTime(Number(label ?? point.t))}</span>
                      </div>
                      <div className="mb-2 flex items-center justify-between gap-5">
                        <span className="text-sm text-muted-foreground">Audiência</span>
                        <span className="num text-sm font-semibold">{Number(point.n).toLocaleString("pt-BR")} pessoas</span>
                      </div>
                      <div className="flex items-center justify-between gap-5 border-t border-border pt-2">
                        <span className="text-sm text-muted-foreground">Retenção</span>
                        <span className="num text-sm font-semibold text-primary">{Number(point.r).toFixed(1)}%</span>
                      </div>
                    </div>
                  );
                }}
              />
              {changes.drops.slice(0, 3).map((d) => <ReferenceLine key={d.to} x={d.to} stroke="var(--destructive)" strokeDasharray="2 4" />)}
              {offer != null && <ReferenceLine x={offer} stroke="var(--warning)" label={{ value: "Oferta", fill: "var(--warning)", fontSize: 11, position: "insideTopRight" }} />}
              <ReferenceLine x={cursor} stroke="var(--foreground)" strokeWidth={1.5} />
              {liveCursor != null && <ReferenceLine x={liveCursor} stroke="var(--chart-3)" strokeWidth={2} strokeDasharray={liveCursorRunning ? undefined : "4 4"} label={{ value: liveCursorRunning ? "Ao vivo" : "Pausado", fill: "var(--chart-3)", fontSize: 11, position: "insideTopLeft" }} />}
              <Area type="monotone" dataKey="r" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#rg)" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Linha cinza: posição do player de análise. Linha colorida: posição média dos espectadores que estão assistindo agora; ela para quando todos pausam ou saem e volta a andar quando retomam.</p>
        <div className="mt-4 grid grid-cols-5 gap-2">
          {["10", "25", "50", "75", "100"].map((k) => (
            <div key={k} className="rounded-md bg-secondary p-3 text-center">
              <p className="text-xs text-muted-foreground">{k}% do vídeo</p>
              <p className="num text-lg font-semibold">{pct(a.marks?.[k] ?? 0, a.plays).toFixed(1)}%</p>
              <p className="num text-xs text-muted-foreground">{a.marks?.[k] ?? 0} sessões</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4">
        <div className="panel p-5">
          <h2 className="mb-3 text-lg font-semibold">Funil de conversão</h2>
          <div className="space-y-3">
            {funnel.map((f, i) => (
              <div key={f.name}>
                <div className="flex justify-between text-sm"><span>{f.name}</span><span className="num">{f.n} · {pct(f.n, a.plays).toFixed(1)}%</span></div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct(f.n, a.plays)}%`, opacity: 1 - i * 0.25 }} />
                </div>
                {i > 0 && <p className="mt-1 text-xs text-muted-foreground">{pct(f.n, funnel[i - 1]!.n).toFixed(1)}% da etapa anterior</p>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel p-5 lg:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">Por dia</h2>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={a.daily}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="d" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} cursor={{ fill: "var(--accent)" }} />
                <Bar dataKey="views" name="Visualizações" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="plays" name="Plays" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="clicks" name="Cliques" fill="var(--chart-3)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="panel p-5">
          <h2 className="mb-3 text-lg font-semibold">Eventos registrados</h2>
          {([
            ["Play", "play"], ["Pausa", "pause"], ["Retomada", "resume"], ["Avanço", "seek_forward"],
            ["Retorno", "seek_backward"], ["Abandono", "abandon"], ["Chegada ao CTA", "cta_reached"],
            ["Clique no checkout", "checkout_click"], ["Assistiu até o fim", "complete"],
          ] as [string, string][]).map(([l, k]) => (
            <div key={k} className="flex justify-between border-b border-border py-1.5 text-sm last:border-0">
              <span className="text-muted-foreground">{l}</span><span className="num">{ev(k)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
