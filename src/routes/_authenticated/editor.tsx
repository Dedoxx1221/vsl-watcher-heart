import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, Copy, Download, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { videosQuery, fmtTime } from "@/lib/videos";
import { parseSettings, DEFAULT_SETTINGS, type PlayerSettings, type HeadlineSegment } from "@/lib/player-settings";
import { VslPlayer } from "@/components/VslPlayer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/editor")({
  validateSearch: (search: Record<string, unknown>): { v?: string } => (typeof search["v"] === "string" ? { v: search["v"] } : {}),
  head: () => ({
    meta: [
      { title: "Editor do player — Vexora" },
      { name: "description", content: "Configure autoplay, progresso, headlines, ganchos, pixels, legendas e botões da sua VSL." },
      { property: "og:title", content: "Editor do player — Vexora" },
      { property: "og:description", content: "Configure autoplay, progresso, headlines, ganchos, pixels, legendas e botões da sua VSL." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(videosQuery),
  component: Editor,
});

function ImageUrlPreview({ url, title, aspect }: { url: string; title: string; aspect: "9:16" | "16:9" }) {
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const src = url.trim();

  useEffect(() => {
    setStatus(src ? "loading" : "idle");
  }, [src]);

  return (
    <div className="my-2 space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {!src ? (
        <div className="flex items-center justify-center rounded-md border border-dashed border-border bg-background/50 px-3 py-8 text-center text-xs text-muted-foreground">
          Cole uma URL direta de imagem para ver a prévia.
        </div>
      ) : (
        <div className="flex w-full items-center justify-center overflow-hidden rounded-md bg-black" style={{ aspectRatio: aspect === "9:16" ? "9 / 16" : "16 / 9", maxHeight: 280 }}>
          <img
            key={src}
            src={src}
            alt={title}
            loading="eager"
            referrerPolicy="no-referrer"
            onLoad={() => setStatus("loaded")}
            onError={() => setStatus("error")}
            className="h-full w-full object-contain"
            style={{ display: status === "error" ? "none" : "block" }}
          />
          {status === "loading" && <span className="absolute text-xs text-white/80">Carregando prévia…</span>}
          {status === "error" && (
            <div className="px-4 py-6 text-center text-xs text-white/90">
              Não foi possível carregar esta imagem. Use o link direto do arquivo (.jpg, .png, .webp ou .gif), não a página de compartilhamento.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function parseTime(s: string): number | null {
  if (!s.trim()) return null;
  const parts = s.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  return parts.reduce((a, p) => a * 60 + p, 0);
}

type BoolKey = { [K in keyof PlayerSettings]-?: PlayerSettings[K] extends boolean | undefined ? K : never }[keyof PlayerSettings] & keyof PlayerSettings;

function Editor() {
  const search = Route.useSearch();
  const { data: videos } = useSuspenseQuery(videosQuery);
  const qc = useQueryClient();
  const [videoId, setVideoId] = useState(() => search.v && videos.some((v) => v.id === search.v) ? search.v : (videos[0]?.id ?? ""));
  const video = videos.find((v) => v.id === videoId);
  const [s, setS] = useState<PlayerSettings>(DEFAULT_SETTINGS);
  const [offer, setOffer] = useState("");
  const [checkout, setCheckout] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewCta, setPreviewCta] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [headlineSelection, setHeadlineSelection] = useState({ start: 0, end: 0 });
  const [headlineWordColor, setHeadlineWordColor] = useState("#ffdf00");
  const [headlineWordSize, setHeadlineWordSize] = useState(32);

  useEffect(() => {
    if (search.v && videos.some((v) => v.id === search.v)) setVideoId(search.v);
  }, [search.v, videos]);

  useEffect(() => {
    if (!video) return;
    setS(parseSettings(video.player_settings));
    setOffer(video.offer_time_seconds != null ? fmtTime(video.offer_time_seconds) : "");
    setCheckout(video.checkout_url ?? "");
  }, [video]);

  const set = <K extends keyof PlayerSettings>(k: K, v: PlayerSettings[K]) => setS((p) => ({ ...p, [k]: v }));

  function applyHeadlineStyle(patch: Partial<HeadlineSegment>) {
    const text = s.headlineText;
    if (!text) return;
    let start = Math.max(0, Math.min(text.length, Math.min(headlineSelection.start, headlineSelection.end)));
    let end = Math.max(0, Math.min(text.length, Math.max(headlineSelection.start, headlineSelection.end)));
    if (start === end) {
      start = Math.min(start, text.length);
      while (start > 0 && !/\s/.test(text[start - 1])) start--;
      end = Math.max(start, Math.min(text.length, headlineSelection.start));
      while (end < text.length && !/\s/.test(text[end])) end++;
      if (start === end) return;
    }
    const source: HeadlineSegment[] = s.headlineSegments.length && s.headlineSegments.map((part) => part.text).join("") === text
      ? s.headlineSegments
      : [{ text }];
    const next: HeadlineSegment[] = [];
    let offset = 0;
    for (const part of source) {
      const partStart = offset;
      const partEnd = offset + part.text.length;
      offset = partEnd;
      const cuts = [...new Set([partStart, Math.max(partStart, Math.min(partEnd, start)), Math.max(partStart, Math.min(partEnd, end)), partEnd])].sort((a, b) => a - b);
      for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i];
        const b = cuts[i + 1];
        if (b <= a) continue;
        const selected = a < end && b > start;
        next.push({ ...part, ...(selected ? patch : {}), text: text.slice(a, b) });
      }
    }
    set("headlineSegments", next);
  }

  async function save() {
    if (!video || saving) return;
    setSaving(true);
    try {
      const { ctaAlways: _drop, ...clean } = s;
      const { data, error } = await supabase.from("videos").update({
        player_settings: clean, offer_time_seconds: parseTime(offer), checkout_url: checkout || null,
      }).eq("id", video.id).select("id").maybeSingle();

      if (error) {
        console.error("[Vexora] Falha ao salvar configurações do player:", error);
        toast.error("Não foi possível atualizar", { description: error.message });
        return;
      }
      if (!data) {
        console.error("[Vexora] Nenhum vídeo foi atualizado. Verifique a sessão e as políticas de acesso do Supabase.");
        toast.error("Não foi possível atualizar", {
          description: "Nenhum registro foi alterado. Verifique se sua sessão está ativa e se o Supabase permite atualizar este vídeo.",
        });
        return;
      }

      await qc.invalidateQueries({ queryKey: ["videos"] });
      toast.success("Player salvo — as mudanças já valem na sua página.");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[Vexora] Erro inesperado ao salvar:", err);
      toast.error("Não foi possível atualizar", { description: message });
    } finally {
      setSaving(false);
    }
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
          <Link to="/videos" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Voltar à biblioteca
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Editor do vídeo</h1>
          <p className="mt-1 text-sm text-muted-foreground">Faça as alterações, confira ao lado e clique em Salvar.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={videoId} onValueChange={setVideoId}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Escolher vídeo" /></SelectTrigger>
            <SelectContent>{videos.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value="" onValueChange={loadFrom}>
            <SelectTrigger className="w-52"><Download className="mr-1 h-4 w-4" /><SelectValue placeholder="Copiar ajustes de…" /></SelectTrigger>
            <SelectContent>{videos.filter((v) => v.id !== videoId).map((v) => <SelectItem key={v.id} value={v.id}>De: {v.name}</SelectItem>)}
              <SelectItem value="__none" disabled>{videos.length < 2 ? "Nenhuma outra VSL" : "—"}</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={save} disabled={saving} className="min-w-28">{saving ? "Salvando…" : "Salvar alterações"}</Button>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="panel overflow-hidden rounded-xl">
          <Section id="video-settings" title="Configurações de Vídeo">
            <div className="space-y-3 py-3">
              <div>
                <p className="text-sm font-medium">Código de incorporação (Embed)</p>
                <p className="mt-1 text-xs text-muted-foreground">Copie o código para incorporar esta VSL em uma página externa. O código usa o vídeo selecionado.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={async () => {
                  const origin = window.location.origin;
                  const id = video.id;
                  const code = `<div id="vsl-${id}" style="position:relative;width:100%;max-width:480px;margin:0 auto;overflow:hidden;background:#000;aspect-ratio:${s.aspect === "9:16" ? "9/16" : "16/9"}"></div>
<script>(function(){var c=document.getElementById("vsl-${id}");var psrc=${JSON.stringify(video.thumbnail_url || "")};var p;if(psrc){p=document.createElement("img");p.src=psrc;p.alt="";p.loading="eager";p.style.cssText="position:absolute;inset:0;width:100%;height:100%;object-fit:cover";c.appendChild(p);}var f=document.createElement("iframe");f.src="${origin}/embed/${id}"+location.search;f.loading="eager";f.allow="autoplay; fullscreen";f.allowFullscreen=true;f.title="Vexora video player";f.style.cssText="position:absolute;inset:0;display:block;width:100%;height:100%;border:0;opacity:0;transition:opacity .12s";c.appendChild(f);addEventListener("message",function(e){if(e.source===f.contentWindow&&e.data&&e.data.vslHeight){f.style.height=e.data.vslHeight+"px";f.style.aspectRatio="auto";f.style.opacity="1";c.style.aspectRatio="auto";c.style.background="transparent";if(p)p.style.display="none";}});})();</script>`;
                  try {
                    await navigator.clipboard.writeText(code);
                    toast.success("Código embed copiado.");
                  } catch {
                    toast.error("Não foi possível copiar. Verifique a permissão de área de transferência do navegador.");
                  }
                }}
              >
                <Copy className="mr-2 h-4 w-4" /> Copiar código embed
              </Button>
            </div>
          </Section>

          <Section id="style" title="Aparência">
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

          <Section id="bar" title="Barra de progresso" toggle="showBar">
            <Toggle k="fastBar" label="Barra acelerada" hint="Anda rápido no início e desacelera — dá sensação de vídeo curto" />
            <Color k="barColor" label="Cor da barra" />
            <div className="flex items-center justify-between gap-4 py-2"><div><p className="text-sm">Aceleração</p><p className="text-xs text-muted-foreground">1 = linear · maior = mais rápido no início (padrão 32)</p></div>
              <Input type="number" min={1} max={100} value={s.barAccel} onChange={(e) => set("barAccel", Math.min(100, Math.max(1, Number(e.target.value) || 1)))} className="num h-8 w-20" /></div>
            <div className="flex items-center justify-between py-2"><p className="text-sm">Altura (px)</p>
              <Input type="number" min={2} max={20} value={s.barHeight} onChange={(e) => set("barHeight", Number(e.target.value) || 5)} className="num h-8 w-20" /></div>
          </Section>

          <Section id="autoplay" title="Início automático" toggle="autoplay">
            <p className="py-2 text-xs text-muted-foreground">O vídeo começa mudo em loop; ao tocar, reinicia do zero com som. Desligado, mostra a thumbnail com botão de play.</p>
            <Text k="autoplayImage" label="Imagem ou GIF sobre o vídeo (URL)" placeholder="https://…/imagem.gif — vazio usa a thumbnail" />
            <div className="my-3 rounded-xl border border-border bg-muted/30 p-4">
              <p className="text-sm font-medium">Posição da imagem</p>
              <p className="mt-1 text-xs text-muted-foreground">Arraste a imagem na prévia para mudar a posição. Use os botões abaixo para ajustar rapidamente.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => { set("autoplayImageX", 50); set("autoplayImageY", 50); }}>Centralizar</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => set("autoplayImageSize", 70)}>Tamanho padrão</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => {
                  const ratio = s.aspect === "9:16" ? 16 / 9 : 9 / 16;
                  const image = new Image();
                  image.onload = () => set("autoplayImageSize", Math.min(95, 95 * ratio * image.naturalWidth / Math.max(1, image.naturalHeight)));
                  image.src = s.autoplayImage || video.thumbnail_url || "";
                }}>Enquadrar largura</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => {
                  const ratio = s.aspect === "9:16" ? 16 / 9 : 9 / 16;
                  const image = new Image();
                  image.onload = () => set("autoplayImageSize", Math.min(100, 95 * ratio * image.naturalWidth / Math.max(1, image.naturalHeight)));
                  image.src = s.autoplayImage || video.thumbnail_url || "";
                }}>Enquadrar altura</Button>
              </div>
            </div>
            <Text k="autoplayText" label="Mensagem sobre o vídeo (opcional)" placeholder="Seu vídeo já começou — toque para ouvir" />
          </Section>

          <Section id="turbo" title="Velocidade e carregamento" toggle="turbo">
            <p className="py-2 text-xs text-muted-foreground">Pré-carrega o vídeo inteiro assim que a página abre, para começar mais rápido, e permite acelerar a velocidade do vídeo.</p>
            <div className="flex items-center justify-between gap-4 py-2"><div><p className="text-sm">Velocidade</p><p className="text-xs text-muted-foreground">Ex.: 1.1 ou 1.2 (1 = normal)</p></div>
              <Input type="number" step={0.05} min={0.5} max={2} value={s.turboSpeed} onChange={(e) => set("turboSpeed", Math.min(2, Math.max(0.5, Number(e.target.value) || 1)))} className="num h-8 w-20" /></div>
          </Section>

          <Section id="headline" title="Headline acima do vídeo" toggle="headline">
            <div className="space-y-2 py-3">
              <Label>Texto da headline</Label>
              <textarea
                value={s.headlineText}
                onChange={(e) => { set("headlineText", e.target.value); set("headlineSegments", []); }}
                onSelect={(e) => setHeadlineSelection({ start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd })}
                onClick={(e) => setHeadlineSelection({ start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd })}
                rows={3}
                placeholder="Digite sua headline. Selecione uma palavra ou trecho para formatar individualmente."
                className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">Para formatar palavras diferentes, selecione o trecho no campo acima e aplique a cor, tamanho ou estilo desejado.</p>
            </div>
            <Color k="headlineColor" label="Cor padrão do texto" />
            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="space-y-1.5"><Label>Alinhamento</Label><select value={s.headlineAlign} onChange={(e) => set("headlineAlign", e.target.value as PlayerSettings["headlineAlign"])} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="left">À esquerda</option><option value="center">Centralizado</option><option value="right">À direita</option></select></div>
              <div className="space-y-1.5"><Label>Tamanho padrão (px)</Label><Input type="number" min={10} max={72} value={s.headlineFontSize} onChange={(e) => set("headlineFontSize", Math.min(72, Math.max(10, Number(e.target.value) || 24)))} /></div>
            </div>
            <div className="flex flex-wrap gap-2 py-2">
              <Button type="button" size="sm" variant={s.headlineBold ? "default" : "outline"} onClick={() => set("headlineBold", !s.headlineBold)}><span className="font-bold">B</span> Negrito geral</Button>
              <Button type="button" size="sm" variant={s.headlineUnderline ? "default" : "outline"} onClick={() => set("headlineUnderline", !s.headlineUnderline)}><span className="underline">U</span> Sublinhado geral</Button>
            </div>
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div><p className="text-sm font-medium">Formatação por palavra ou trecho</p><p className="mt-1 text-xs text-muted-foreground">Selecione o texto acima. Se nada estiver selecionado, o editor tenta aplicar ao redor do cursor.</p></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Cor da seleção</Label><div className="flex items-center gap-2"><input type="color" value={headlineWordColor} onChange={(e) => setHeadlineWordColor(e.target.value)} className="h-9 w-11 cursor-pointer rounded border border-border bg-transparent" /><Input value={headlineWordColor} onChange={(e) => setHeadlineWordColor(e.target.value)} /></div></div>
                <div className="space-y-1.5"><Label>Tamanho da seleção (px)</Label><Input type="number" min={10} max={96} value={headlineWordSize} onChange={(e) => setHeadlineWordSize(Math.min(96, Math.max(10, Number(e.target.value) || 32)))} /></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => applyHeadlineStyle({ color: headlineWordColor })}>Aplicar cor</Button>
                <Button type="button" size="sm" onClick={() => applyHeadlineStyle({ size: headlineWordSize })}>Aplicar tamanho</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => applyHeadlineStyle({ bold: true })}><span className="font-bold">B</span> Negrito</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => applyHeadlineStyle({ underline: true })}><span className="underline">U</span> Sublinhado</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => applyHeadlineStyle({ italic: true })}><span className="italic">I</span> Itálico</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => applyHeadlineStyle({ color: s.headlineColor, size: undefined, bold: undefined, underline: undefined, italic: undefined })}>Limpar estilo da seleção</Button>
              </div>
            </div>
          </Section>

          <Section id="traffic" title="Filtro de visitantes" toggle="trafficFilter" badge="novo">
            <p className="py-2 text-xs text-muted-foreground">Use esta opção apenas se souber configurar parâmetros de URL.</p>
            <Text k="trafficParam" label="Parâmetro obrigatório" placeholder="utm_source" />
            <Text k="trafficRedirect" label="Redirecionar para (opcional)" placeholder="https://..." />
          </Section>

          <Section id="cta" title="Botão de compra" toggle="cta">
            <Text k="ctaText" label="Texto do botão" />
            <div className="grid gap-3 py-2 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Aparece em (hh:mm:ss)</Label><Input value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="01:01:45" className="num" /></div>
              <div className="space-y-1.5"><Label>Link do checkout</Label><Input value={checkout} onChange={(e) => setCheckout(e.target.value)} /></div>
            </div>
            <Color k="ctaColor" label="Cor do botão" />
            <Color k="ctaTextColor" label="Cor do texto" />
            <Toggle k="ctaPulse" label="Animação de pulso" />
          </Section>

          <Section id="thumb" title="Imagem ao pausar ou terminar" toggle="thumbSniper">
            <Text k="thumbPauseUrl" label="Imagem ao pausar (URL direta da imagem)" placeholder="https://site.com/imagem.jpg" />
            <ImageUrlPreview url={s.thumbPauseUrl} title="Prévia da imagem de pausa" aspect={s.aspect} />
            <Text k="thumbEndUrl" label="Imagem ao terminar (URL direta da imagem)" placeholder="https://site.com/imagem.jpg" />
            <ImageUrlPreview url={s.thumbEndUrl} title="Prévia da imagem final" aspect={s.aspect} />
          </Section>

          <Section id="resume" title="Retomar vídeo" toggle="resumePrompt">
            <Text k="resumeText" label="Mensagem" />
          </Section>

          <Section id="hooks" title="Mensagens durante o vídeo" toggle="hooks">
            <p className="py-2 text-xs text-muted-foreground">Adicione mensagens que aparecem em momentos específicos do vídeo.</p>
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

          <Section id="pixels" title="Rastreamento e métricas" toggle="pixels">
            <p className="py-2 text-xs text-muted-foreground">Eventos enviados para suas ferramentas de análise.</p>
            <Text k="fbPixel" label="ID do Pixel da Meta" placeholder="123456789012345" />
            <Text k="ga4" label="ID do Google Analytics 4" placeholder="G-XXXXXXX" />
          </Section>

          <Section id="captions" title="Legendas" toggle="captions">
            <Text k="captionsUrl" label="Link do arquivo de legenda (.vtt)" placeholder="https://.../legenda.vtt" />
          </Section>

          <Section id="playback" title="Controles do vídeo">
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
              <div><p className="text-sm font-medium">Prévia ao vivo</p><p className="text-xs text-muted-foreground">Atualiza enquanto você edita</p></div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Botão visível <Switch checked={previewCta} onCheckedChange={setPreviewCta} />
              </label>
            </div>
            <VslPlayer
              key={`${video.id}-${previewCta}-${s.autoplay}`}
              video={{ ...video, checkout_url: checkout || video.checkout_url, offer_time_seconds: parseTime(offer) }}
              settings={{ ...s, ctaAlways: previewCta }}
              onAutoplayImageTransform={open === "autoplay" ? ({ x, y, size }) => setS((prev) => ({ ...prev, autoplayImageX: Math.round(x * 10) / 10, autoplayImageY: Math.round(y * 10) / 10, autoplayImageSize: Math.round(size * 10) / 10 })) : undefined}
              preview
            />
            <p className="mt-2 text-xs text-muted-foreground">Prévia de teste: não registra visitas nem dispara pixels.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
