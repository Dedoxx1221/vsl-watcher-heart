import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { videosQuery, fmtTime } from "@/lib/videos";
import { parseSettings, DEFAULT_SETTINGS, type PlayerSettings } from "@/lib/player-settings";
import { VslPlayer } from "@/components/VslPlayer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/editor")({
  head: () => ({
    meta: [
      { title: "Editor do player — Retina" },
      { name: "description", content: "Personalize pausa, cores, barra de progresso e botão da oferta." },
      { property: "og:title", content: "Editor do player — Retina" },
      { property: "og:description", content: "Personalize pausa, cores, barra de progresso e botão da oferta." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(videosQuery),
  component: Editor,
});

function parseTime(s: string): number | null {
  if (!s.trim()) return null;
  const parts = s.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  return parts.reduce((a, p) => a * 60 + p, 0);
}

function Editor() {
  const { data: videos } = useSuspenseQuery(videosQuery);
  const qc = useQueryClient();
  const [videoId, setVideoId] = useState(videos[0]?.id ?? "");
  const video = videos.find((v) => v.id === videoId);
  const [s, setS] = useState<PlayerSettings>(DEFAULT_SETTINGS);
  const [offer, setOffer] = useState("");
  const [checkout, setCheckout] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewCta, setPreviewCta] = useState(true);

  useEffect(() => {
    if (!video) return;
    setS(parseSettings(video.player_settings));
    setOffer(video.offer_time_seconds != null ? fmtTime(video.offer_time_seconds) : "");
    setCheckout(video.checkout_url ?? "");
  }, [video]);

  const set = <K extends keyof PlayerSettings>(k: K, v: PlayerSettings[K]) => setS((p) => ({ ...p, [k]: v }));

  async function save() {
    if (!video) return;
    setSaving(true);
    const { ctaAlways: _drop, ...clean } = s;
    const { error } = await supabase.from("videos").update({
      player_settings: clean, offer_time_seconds: parseTime(offer), checkout_url: checkout || null,
    }).eq("id", video.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Player salvo — as mudanças já valem na sua página.");
    qc.invalidateQueries({ queryKey: ["videos"] });
  }

  if (!video) return <div className="panel p-10 text-center text-muted-foreground">Cadastre uma VSL na Biblioteca primeiro.</div>;

  const Toggle = ({ k, label, hint }: { k: "showBar" | "fastBar" | "allowPause" | "blockSeek" | "resumePrompt" | "ctaPulse"; label: string; hint?: string }) => (
    <div className="flex items-center justify-between gap-4 py-2">
      <div><p className="text-sm">{label}</p>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
      <Switch checked={s[k]} onCheckedChange={(v) => set(k, v)} />
    </div>
  );
  const Color = ({ k, label }: { k: "barColor" | "ctaColor" | "ctaTextColor"; label: string }) => (
    <div className="flex items-center justify-between gap-4 py-2">
      <p className="text-sm">{label}</p>
      <div className="flex items-center gap-2">
        <input type="color" value={s[k]} onChange={(e) => set(k, e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent" />
        <Input value={s[k]} onChange={(e) => set(k, e.target.value)} className="num h-8 w-24 text-xs" />
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Editor do player</p>
          <h1 className="text-3xl font-bold">Personalizar player</h1>
        </div>
        <div className="flex gap-2">
          <Select value={videoId} onValueChange={setVideoId}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>{videos.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <section className="panel p-5">
            <h2 className="mb-2 font-semibold">Formato</h2>
            <div className="flex gap-2">
              {(["9:16", "16:9"] as const).map((a) => (
                <Button key={a} variant={s.aspect === a ? "default" : "secondary"} size="sm" onClick={() => set("aspect", a)}>
                  {a === "9:16" ? "Vertical 9:16" : "Horizontal 16:9"}
                </Button>
              ))}
            </div>
          </section>

          <section className="panel divide-y divide-border p-5">
            <h2 className="pb-2 font-semibold">Reprodução</h2>
            <div>
              <Toggle k="allowPause" label="Permitir pausar" hint="Toque no vídeo pausa e mostra a tela de pausa" />
              {s.allowPause && <Input value={s.pauseText} onChange={(e) => set("pauseText", e.target.value)} className="mb-2" />}
            </div>
            <Toggle k="blockSeek" label="Bloquear avanço" hint="Impede pular para trechos ainda não assistidos" />
            <div>
              <Toggle k="resumePrompt" label="Continuar de onde parou" hint="Pergunta se a pessoa quer continuar ao voltar" />
              {s.resumePrompt && <Input value={s.resumeText} onChange={(e) => set("resumeText", e.target.value)} className="mb-2" />}
            </div>
          </section>

          <section className="panel divide-y divide-border p-5">
            <h2 className="pb-2 font-semibold">Barra de progresso</h2>
            <Toggle k="showBar" label="Mostrar barra" />
            <Toggle k="fastBar" label="Barra acelerada" hint="Anda rápido no início e desacelera — dá sensação de vídeo curto" />
            <Color k="barColor" label="Cor da barra" />
          </section>

          <section className="panel divide-y divide-border p-5">
            <h2 className="pb-2 font-semibold">Botão da oferta</h2>
            <div className="space-y-1.5 py-2"><Label>Texto do botão</Label><Input value={s.ctaText} onChange={(e) => set("ctaText", e.target.value)} /></div>
            <div className="grid gap-3 py-2 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Aparece em (hh:mm:ss)</Label><Input value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="01:01:45" className="num" /></div>
              <div className="space-y-1.5"><Label>Link do checkout</Label><Input value={checkout} onChange={(e) => setCheckout(e.target.value)} /></div>
            </div>
            <Color k="ctaColor" label="Cor do botão" />
            <Color k="ctaTextColor" label="Cor do texto" />
            <Toggle k="ctaPulse" label="Animação de pulso" />
          </section>
        </div>

        <div className="lg:sticky lg:top-8 lg:self-start">
          <div className="panel overflow-hidden p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Prévia</p>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Mostrar botão <Switch checked={previewCta} onCheckedChange={setPreviewCta} />
              </label>
            </div>
            <VslPlayer
              key={`${video.id}-${previewCta}`}
              video={{ ...video, checkout_url: checkout || video.checkout_url, offer_time_seconds: parseTime(offer) }}
              settings={{ ...s, ctaAlways: previewCta }}
              preview
            />
            <p className="mt-2 text-xs text-muted-foreground">A prévia não gera métricas.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
