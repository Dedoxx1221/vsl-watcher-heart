import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Sparkles, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { videosQuery } from "@/lib/videos";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/ai")({
  head: () => ({
    meta: [
      { title: "Diagnóstico com IA — Retina" },
      { name: "description", content: "Causas prováveis de abandono e edições recomendadas para sua VSL." },
      { property: "og:title", content: "Diagnóstico com IA — Retina" },
      { property: "og:description", content: "Causas prováveis de abandono e edições recomendadas para sua VSL." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(videosQuery),
  component: AiPage,
});

const PERIODS = { "7": "7 dias", "30": "30 dias", "90": "90 dias", all: "Todo período" } as const;

function AiPage() {
  const { data: videos } = useSuspenseQuery(videosQuery);
  const [videoId, setVideoId] = useState(videos[0]?.id ?? "");
  const [period, setPeriod] = useState<keyof typeof PERIODS>("30");
  const [campaign, setCampaign] = useState("");
  const [notes, setNotes] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  async function run() {
    setText(""); setError(""); setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const { data } = await supabase.auth.getSession();
      const from = period === "all" ? new Date(0) : new Date(Date.now() - Number(period) * 86400000);
      const res = await fetch("/api/diagnosis", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({
          videoId, from: from.toISOString(), to: new Date(Date.now() + 60000).toISOString(),
          campaign: campaign.trim() || null, notes,
          filters: `${PERIODS[period]}${campaign.trim() ? `, campanha ${campaign.trim()}` : ""}`,
        }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Não foi possível gerar a análise.");
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        const i = acc.indexOf("[[ERRO]]");
        if (i >= 0) { setText(acc.slice(0, i)); setError(acc.slice(i + 8).trim()); }
        else setText(acc);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("A conexão foi interrompida.");
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Diagnóstico com IA</p>
        <h1 className="text-3xl font-bold">Por que estão saindo — e o que editar</h1>
        <p className="mt-1 text-sm text-muted-foreground">A IA lê a retenção e o funil reais da VSL e sugere edições com timestamp.</p>
      </div>

      <div className="panel grid gap-4 p-5 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label>VSL</Label>
          <Select value={videoId} onValueChange={setVideoId}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{videos.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Período</Label>
          <Select value={period} onValueChange={(v) => setPeriod(v as keyof typeof PERIODS)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(PERIODS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Campanha (opcional)</Label>
          <Input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="utm_campaign" />
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label>Contexto do roteiro (opcional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={4000}
            placeholder="Ex.: 00:00 hook sobre o anjo · 05:30 história pessoal · 40:00 prova social · 01:01:45 oferta e preço…"
            className="h-24"
          />
        </div>
        <div className="flex gap-2 md:col-span-3">
          <Button onClick={run} disabled={busy || !videoId}><Sparkles className="h-4 w-4" />{busy ? "Analisando…" : "Gerar diagnóstico"}</Button>
          {busy && <Button variant="secondary" onClick={() => abort.current?.abort()}><Square className="h-4 w-4" />Parar</Button>}
        </div>
      </div>

      {error && <div className="panel border-destructive p-4 text-sm text-destructive">{error}</div>}
      {busy && !text && <div className="panel p-6 text-sm text-muted-foreground animate-pulse">Lendo a curva de retenção e o funil…</div>}
      {text && (
        <article className="panel prose-ai p-6">
          <ReactMarkdown>{text}</ReactMarkdown>
        </article>
      )}
    </div>
  );
}
