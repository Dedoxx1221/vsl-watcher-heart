import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { videosQuery, fmtTime, pct, type Analytics } from "@/lib/videos";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingDown, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Analytics — Retina" },
      { name: "description", content: "Retenção, abandono e funil da sua VSL." },
      { property: "og:title", content: "Analytics — Retina" },
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

      {isLoading || !a ? <div className="panel h-96 animate-pulse" /> : <Body a={a} offer={video?.offer_time_seconds ?? null} videoUrl={video?.video_url ?? ""} />}
    </div>
  );
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

function Body({ a, offer, videoUrl }: { a: Analytics; offer: number | null; videoUrl: string }) {
  const vref = useRef<HTMLVideoElement>(null);
  const [cursor, setCursor] = useState(0);
  const seek = (t: number) => { setCursor(t); if (vref.current) vref.current.currentTime = t; };
  // Ajuste isotônico decrescente: reduz oscilações de amostras pequenas sem
  // inventar uma queda em cada ponto. A curva exibida nunca sobe, como em players de VSL.
  const series = useMemo(() => {
    const raw = a.retention.map(([t, n]) => ({ t, r: Math.max(0, Math.min(100, pct(n, a.plays))) }));
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
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }}
                labelFormatter={(t) => fmtTime(Number(t))}
                formatter={(v) => [`${Number(v).toFixed(1)}%`, "Retenção"]}
              />
              {changes.drops.slice(0, 3).map((d) => <ReferenceLine key={d.to} x={d.to} stroke="var(--destructive)" strokeDasharray="2 4" />)}
              {offer != null && <ReferenceLine x={offer} stroke="var(--warning)" label={{ value: "Oferta", fill: "var(--warning)", fontSize: 11, position: "insideTopRight" }} />}
              <ReferenceLine x={cursor} stroke="var(--foreground)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="r" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#rg)" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Clique em qualquer ponto do gráfico para ver o trecho do vídeo naquele momento.</p>
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

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel p-5 lg:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">Momentos críticos</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-xs uppercase tracking-wider text-destructive">Maiores quedas</p>
              {changes.drops.length === 0 && <p className="text-sm text-muted-foreground">Sem quedas relevantes.</p>}
              {changes.drops.map((d) => (
                <div key={d.to} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
                  <span className="num flex items-center gap-2"><TrendingDown className="h-4 w-4 text-destructive" />{fmtTime(d.from)} → {fmtTime(d.to)}</span>
                  <span className="num text-destructive">{d.d.toFixed(1)} p.p.</span>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-2 text-xs uppercase tracking-wider text-success">Trechos que recuperam (re-assistidos)</p>
              {changes.gains.length === 0 && <p className="text-sm text-muted-foreground">Nenhum trecho com aumento.</p>}
              {changes.gains.map((d) => (
                <div key={d.to} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
                  <span className="num flex items-center gap-2"><TrendingUp className="h-4 w-4 text-success" />{fmtTime(d.from)} → {fmtTime(d.to)}</span>
                  <span className="num text-success">+{d.d.toFixed(1)} p.p.</span>
                </div>
              ))}
            </div>
          </div>
        </div>

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
