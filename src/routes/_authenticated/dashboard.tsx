import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { videosQuery, fmtTime, pct, type Analytics } from "@/lib/videos";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Radio, MapPin, Globe, ChartNoAxesColumn } from "lucide-react";

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
            <Select value={period} onValueChange={(v) => setPeriod(v as keyof typeof PERIODS)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(PERIODS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={campaign} onValueChange={setCampaign}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Filtrar campanha" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todas campanhas</SelectItem>
                {(a?.campaigns ?? []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border pb-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Dados ao vivo</span>
          <span>·</span><span>Atualização em tempo real</span>
          <span>·</span><span>Período: {PERIODS[period]}</span>
          {campaign !== "__all" && <><span>·</span><span className="max-w-48 truncate">Campanha: {campaign}</span></>}
        </div>
      </header>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Audiência agora</h2>
            <p className="text-xs text-muted-foreground">Sessões vistas nos últimos 35 segundos · sincronizado a cada 5 s</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-emerald-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Ao vivo
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <div className="panel flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Radio className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Espectadores ativos</p><p className="num text-2xl font-semibold">{live?.active_count ?? 0}</p></div>
          </div>
          <div className="panel flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600"><ChartNoAxesColumn className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Assistindo neste instante</p><p className="num text-2xl font-semibold">{live?.playing_count ?? 0}</p></div>
          </div>
          <div className="panel flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600"><Globe className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Origens identificadas</p><p className="num text-2xl font-semibold">{new Set((live?.viewers ?? []).map(v => v.utm_source || (v.referrer ? (() => { try { return new URL(v.referrer!).hostname; } catch { return v.referrer; } })() : null)).filter(Boolean)).size}</p></div>
          </div>
          <div className="panel flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600"><MapPin className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Localizações conhecidas</p><p className="num text-2xl font-semibold">{new Set((live?.viewers ?? []).map(v => [v.city, v.region, v.country].filter(Boolean).join(", ")).filter(Boolean)).size}</p></div>
          </div>
        </div>
        <details className="panel group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
            <div><p className="text-sm font-semibold">Explorar audiência ao vivo</p><p className="mt-0.5 text-xs text-muted-foreground">Países, origens, navegadores e dispositivos sem poluir a visão principal</p></div>
            <span className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground group-open:bg-secondary">Ver detalhes <span className="ml-1 inline-block transition-transform group-open:rotate-180">⌄</span></span>
          </summary>
          <div className="grid gap-5 border-t border-border p-4 md:grid-cols-2 xl:grid-cols-4">
            <div><h3 className="mb-3 text-sm font-semibold">Países</h3><LiveBreakdown items={aggregateLive(live?.viewers ?? [], v => countryDisplayName(v.country))} total={live?.active_count ?? 0} empty="Sem localização disponível." /></div>
            <div><h3 className="mb-3 text-sm font-semibold">Origem / UTM</h3><LiveBreakdown items={aggregateLive(live?.viewers ?? [], v => { const utm = [v.utm_source, v.utm_medium, v.utm_campaign].filter(Boolean).join(" / "); if (utm) return utm; if (!v.referrer) return "Direto / desconhecido"; try { return new URL(v.referrer).hostname; } catch { return v.referrer; } })} total={live?.active_count ?? 0} empty="Sem origem identificada." /></div>
            <div><h3 className="mb-3 text-sm font-semibold">Navegadores</h3><LiveBreakdown items={aggregateLive(live?.viewers ?? [], v => v.browser || "Desconhecido")} total={live?.active_count ?? 0} empty="Sem dados de navegador." /></div>
            <div><h3 className="mb-3 text-sm font-semibold">Dispositivos</h3><LiveBreakdown items={aggregateLive(live?.viewers ?? [], v => v.device_type || "Desconhecido")} total={live?.active_count ?? 0} empty="Sem dados de dispositivo." /></div>
          </div>
        </details>
      </section>

      {isLoading || !a ? <div className="panel h-96 animate-pulse" /> : <Body a={a} offer={video?.offer_time_seconds ?? null} videoUrl={video?.video_url ?? ""} live={live} />}
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
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
                  const hovered = payload[0]?.payload as { t?: number; n?: number; r?: number; id?: string; position?: number; retention?: number } | undefined;
                  if (!hovered) return null;
                  if (hovered.id) {
                    return (
                      <div className="rounded-xl border border-border bg-popover px-3 py-2.5 text-popover-foreground shadow-2xl">
                        <p className="text-sm font-semibold">{liveMarkers.length === 1 ? "1 pessoa assistindo agora" : `${liveMarkers.length} pessoas assistindo agora`}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Posição na VSL: {fmtTime(Number(hovered.position ?? 0))}</p>
                      </div>
                    );
                  }
                  const point = hovered as { t: number; n: number; r: number };
                  return (
                    <div className="w-[210px] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl">
                      <div className="border-b border-border px-3 py-2">
                        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Detalhes da audiência</p>
                      </div>
                      <div className="space-y-3 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm text-muted-foreground">Tempo</span>
                          <span className="num text-sm font-semibold">{fmtTime(Number(label ?? point.t))}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm text-muted-foreground">Audiência</span>
                          <span className="num text-sm font-semibold">{Math.max(0, Number(point.n) || 0).toLocaleString("pt-BR")} pessoas</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                          <span className="text-sm text-muted-foreground">Retenção</span>
                          <span className="num rounded-md bg-primary/10 px-2 py-1 text-sm font-bold text-primary">{Number(point.r).toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              {offer != null && <ReferenceLine x={offer} stroke="var(--warning)" label={{ value: "Oferta", fill: "var(--warning)", fontSize: 11, position: "insideTopRight" }} />}
              <ReferenceLine x={cursor} stroke="var(--foreground)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="r" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#rg)" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
              {liveMarkers.length > 0 && <Scatter xAxisId={0} yAxisId={0} name="Espectadores ao vivo" data={liveMarkers} dataKey="y" fill="#22c55e" shape={(props: { cx?: number; cy?: number }) => props.cx == null || props.cy == null ? <g /> : <circle cx={props.cx} cy={props.cy} r={6} fill="#22c55e" stroke="#ffffff" strokeWidth={2} /> } isAnimationActive={false} />}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        </div>
        <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--chart-3)]" /> Cada ponto colorido representa uma pessoa assistindo agora e avança pelo tempo do vídeo. Total ao vivo: {liveMarkers.length}.</p>
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

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="panel p-5 md:p-6">
          <h2 className="mb-1 text-lg font-semibold">Funil de conversão</h2>
          <p className="mb-4 text-xs text-muted-foreground">Veja quantas pessoas avançam de uma etapa para a próxima.</p>
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

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="panel p-5 md:p-6">
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
        <div className="panel p-5 md:p-6">
          <h2 className="mb-1 text-lg font-semibold">Eventos registrados</h2>
          <p className="mb-3 text-xs text-muted-foreground">Ações detectadas dentro do player.</p>
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
