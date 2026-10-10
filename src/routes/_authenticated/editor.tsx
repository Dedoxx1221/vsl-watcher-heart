import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, Download, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { videosQuery, fmtTime } from "@/lib/videos";
import { parseSettings, DEFAULT_SETTINGS, type PlayerSettings } from "@/lib/player-settings";
import { VslPlayer } from "@/components/VslPlayer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/editor")({
  head: () => ({
    meta: [
      { title: "Editor do player — Retina" },
      { name: "description", content: "Configure autoplay, progresso, headlines, ganchos, pixels, legendas e botões da sua VSL." },
      { property: "og:title", content: "Editor do player — Retina" },
      { property: "og:description", content: "Configure autoplay, progresso, headlines, ganchos, pixels, legendas e botões da sua VSL." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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

type BoolKey = { [K in keyof PlayerSettings]-?: PlayerSettings[K] extends boolean | undefined ? K : never }[keyof PlayerSettings] & keyof PlayerSettings;

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
  const [open, setOpen] = useState<string | null>("style");

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

  function loadFrom(id: string) {
    const src = videos.find((v) => v.id === id);
    if (!src) return;
    setS(parseSettings(src.player_settings));
    toast.success(`Configurações de "${src.name}" carregadas. Clique em Salvar para aplicar.`);
  }

  if (!video) return <div className="panel p-10 text-center text-muted-foreground">Cadastre uma VSL na Biblioteca primeiro.</div>;

  const Toggle = ({ k, label, hint }: { k: BoolKey; label: string; hint?: string }) => (
    <div className="flex items-center justify-between gap-4 py-2">
      <div><p className="text-sm">{label}</p>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
      <Switch checked={!!s[k]} onCheckedChange={(v) => set(k, v)} />
    </div>
  );
  const Color = ({ k, label }: { k: "barColor" | "ctaColor" | "ctaTextColor" | "accentColor" | "headlineColor"; label: string }) => (
    <div className="flex items-center justify-between gap-4 py-2">
      <p className="text-sm">{label}</p>
      <div className="flex items-center gap-2">
        <input type="color" value={s[k]} onChange={(e) => set(k, e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent" />
        <Input value={s[k]} onChange={(e) => set(k, e.target.value)} className="num h-8 w-24 text-xs" />
      </div>
    </div>
  );
  const Text = ({ k, label, placeholder }: { k: "pauseText" | "resumeText" | "ctaText" | "autoplayText" | "autoplayImage" | "headlineText" | "trafficParam" | "trafficRedirect" | "thumbPauseUrl" | "thumbEndUrl" | "fbPixel" | "ga4" | "captionsUrl"; label: string; placeholder?: string }) => (
    <div className="space-y-1.5 py-2"><Label>{label}</Label><Input value={s[k]} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} /></div>
  );
  const Section = ({ id, title, toggle, badge, children }: { id: string; title: string; toggle?: BoolKey; badge?: string; children: ReactNode }) => {
    const isOpen = open === id;
    return (
      <div className="border-b border-border last:border-0">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => setOpen(isOpen ? null : id)} className="flex flex-1 items-center gap-2 text-left text-sm font-medium">
            <ChevronDown className={"h-4 w-4 text-muted-foreground transition-transform " + (isOpen ? "" : "-rotate-90")} />
            {title}
            {badge && <Badge variant="secondary" className="text-[10px]">{badge}</Badge>}
          </button>
          {toggle && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {s[toggle] ? "On" : "Off"}
              <Switch checked={!!s[toggle]} onCheckedChange={(v) => set(toggle, v)} />
            </span>
          )}
        </div>
        {isOpen && <div className="divide-y divide-border px-4 pb-4">{children}</div>}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/dashboard" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Voltar ao vídeo
          </Link>
          <h1 className="text-3xl font-bold">Configurações de Vídeo</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={videoId} onValueChange={setVideoId}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>{videos.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value="" onValueChange={loadFrom}>
            <SelectTrigger className="w-56"><Download className="mr-1 h-4 w-4" /><SelectValue placeholder="Carregar configurações" /></SelectTrigger>
            <SelectContent>{videos.filter((v) => v.id !== videoId).map((v) => <SelectItem key={v.id} value={v.id}>De: {v.name}</SelectItem>)}
              <SelectItem value="__none" disabled>{videos.length < 2 ? "Nenhuma outra VSL" : "—"}</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="panel overflow-hidden">
          <Section id="style" title="Estilo">
            <div className="flex gap-2 py-2">
              {(["9:16", "16:9"] as const).map((a) => (
                <Button key={a} variant={s.aspect === a ? "default" : "secondary"} size="sm" onClick={() => set("aspect", a)}>
                  {a === "9:16" ? "Vertical 9:16" : "Horizontal 16:9"}
                </Button>
              ))}
            </div>
            <Color k="accentColor" label="Cor principal (botões do player)" />
            <Toggle k="rounded" label="Bordas arredondadas" />
          </Section>

          <Section id="bar" title="Progresso Inteligente" toggle="showBar">
            <Toggle k="fastBar" label="Barra acelerada" hint="Anda rápido no início e desacelera — dá sensação de vídeo curto" />
            <Color k="barColor" label="Cor da barra" />
            <div className="flex items-center justify-between gap-4 py-2"><div><p className="text-sm">Aceleração</p><p className="text-xs text-muted-foreground">1 = linear · maior = mais rápido no início (padrão 32)</p></div>
              <Input type="number" min={1} max={100} value={s.barAccel} onChange={(e) => set("barAccel", Math.min(100, Math.max(1, Number(e.target.value) || 1)))} className="num h-8 w-20" /></div>
            <div className="flex items-center justify-between py-2"><p className="text-sm">Altura (px)</p>
              <Input type="number" min={2} max={20} value={s.barHeight} onChange={(e) => set("barHeight", Number(e.target.value) || 5)} className="num h-8 w-20" /></div>
          </Section>

          <Section id="autoplay" title="Smart Autoplay™" toggle="autoplay">
            <p className="py-2 text-xs text-muted-foreground">O vídeo começa mudo em loop; ao tocar, reinicia do zero com som. Desligado, mostra a thumbnail com botão de play.</p>
            <Text k="autoplayImage" label="Imagem ou GIF sobre o vídeo (URL)" placeholder="https://…/imagem.gif — vazio usa a thumbnail" />
            <div className="my-3 rounded-xl border border-border bg-muted/30 p-4">
              <p className="text-sm font-medium">Edite diretamente na prévia</p>
              <p className="mt-1 text-xs text-muted-foreground">Clique e arraste a imagem para posicionar. Arraste a alça redonda no canto para aumentar ou diminuir. As alterações são salvas quando você clicar em Salvar.</p>
              <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={() => { set("autoplayImageSize", 70); set("autoplayImageX", 50); set("autoplayImageY", 50); }}>Restaurar posição e tamanho</Button>
            </div>
            <Text k="autoplayText" label="Mensagem sobre o vídeo (opcional)" placeholder="Seu vídeo já começou — toque para ouvir" />
          </Section>

          <Section id="turbo" title="Turbo" toggle="turbo">
            <p className="py-2 text-xs text-muted-foreground">Pré-carrega o vídeo inteiro assim que a página abre, para começar mais rápido, e permite acelerar a velocidade do vídeo.</p>
            <div className="flex items-center justify-between gap-4 py-2"><div><p className="text-sm">Velocidade</p><p className="text-xs text-muted-foreground">Ex.: 1.1 ou 1.2 (1 = normal)</p></div>
              <Input type="number" step={0.05} min={0.5} max={2} value={s.turboSpeed} onChange={(e) => set("turboSpeed", Math.min(2, Math.max(0.5, Number(e.target.value) || 1)))} className="num h-8 w-20" /></div>
          </Section>

          <Section id="headline" title="Headlines" toggle="headline">
            <Text k="headlineText" label="Texto acima do vídeo" />
            <Color k="headlineColor" label="Cor do texto" />
          </Section>

          <Section id="traffic" title="Filtro de Tráfego" toggle="trafficFilter" badge="novo">
            <p className="py-2 text-xs text-muted-foreground">Só mostra o vídeo para quem chega com o parâmetro no link (ex.: tráfego pago). Os demais são redirecionados ou não veem o player.</p>
            <Text k="trafficParam" label="Parâmetro obrigatório" placeholder="utm_source" />
            <Text k="trafficRedirect" label="Redirecionar para (opcional)" placeholder="https://..." />
          </Section>

          <Section id="cta" title="Botões de ação" toggle="cta">
            <Text k="ctaText" label="Texto do botão" />
            <div className="grid gap-3 py-2 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Aparece em (hh:mm:ss)</Label><Input value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="01:01:45" className="num" /></div>
              <div className="space-y-1.5"><Label>Link do checkout</Label><Input value={checkout} onChange={(e) => setCheckout(e.target.value)} /></div>
            </div>
            <Color k="ctaColor" label="Cor do botão" />
            <Color k="ctaTextColor" label="Cor do texto" />
            <Toggle k="ctaPulse" label="Animação de pulso" />
          </Section>

          <Section id="thumb" title="ThumbSniper™" toggle="thumbSniper">
            <Text k="thumbPauseUrl" label="Imagem ao pausar (link)" placeholder="https://..." />
            <Text k="thumbEndUrl" label="Imagem ao terminar (link)" placeholder="https://..." />
          </Section>

          <Section id="resume" title="Continuar assistindo" toggle="resumePrompt">
            <Text k="resumeText" label="Mensagem" />
          </Section>

          <Section id="hooks" title="Mini-Ganchos™" toggle="hooks">
            <p className="py-2 text-xs text-muted-foreground">Frases curtas que aparecem sobre o vídeo em momentos de queda de retenção.</p>
            <div className="space-y-2 py-2">
              {s.hookList.map((h, i) => (
                <div key={i} className="flex gap-2">
                  <Input defaultValue={fmtTime(h.at)} onBlur={(e) => { const l = [...s.hookList]; l[i] = { ...h, at: parseTime(e.target.value) ?? 0 }; set("hookList", l); }} className="num w-24" placeholder="00:30" />
                  <Input value={h.text} onChange={(e) => { const l = [...s.hookList]; l[i] = { ...h, text: e.target.value }; set("hookList", l); }} placeholder="Não saia agora…" />
                  <Input type="number" value={h.dur} onChange={(e) => { const l = [...s.hookList]; l[i] = { ...h, dur: Number(e.target.value) || 5 }; set("hookList", l); }} className="num w-16" title="Duração (s)" />
                  <Button variant="ghost" size="icon" onClick={() => set("hookList", s.hookList.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={() => set("hookList", [...s.hookList, { at: 30, text: "", dur: 5 }])}><Plus className="mr-1 h-4 w-4" />Adicionar gancho</Button>
            </div>
          </Section>

          <Section id="pixels" title="Pixels" toggle="pixels">
            <p className="py-2 text-xs text-muted-foreground">Dispara ViewContent no play e InitiateCheckout no clique do botão.</p>
            <Text k="fbPixel" label="ID do Pixel da Meta" placeholder="123456789012345" />
            <Text k="ga4" label="ID do Google Analytics 4" placeholder="G-XXXXXXX" />
          </Section>

          <Section id="captions" title="Legendas" toggle="captions">
            <Text k="captionsUrl" label="Link do arquivo de legenda (.vtt)" placeholder="https://.../legenda.vtt" />
          </Section>

          <Section id="playback" title="Opções de Reprodução">
            <div>
              <Toggle k="allowPause" label="Permitir pausar" hint="Toque no vídeo pausa e mostra a tela de pausa" />
              {s.allowPause && <Input value={s.pauseText} onChange={(e) => set("pauseText", e.target.value)} className="mb-2" />}
            </div>
            <Toggle k="blockSeek" label="Bloquear avanço" hint="Impede pular para trechos ainda não assistidos" />
            <Toggle k="lockSpeed" label="Travar velocidade em 1x" />
          </Section>
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
              key={`${video.id}-${previewCta}-${s.autoplay}`}
              video={{ ...video, checkout_url: checkout || video.checkout_url, offer_time_seconds: parseTime(offer) }}
              settings={{ ...s, ctaAlways: previewCta }}
              preview
            />
            <p className="mt-2 text-xs text-muted-foreground">A prévia não gera métricas nem dispara pixels.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
