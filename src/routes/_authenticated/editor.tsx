import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, Copy, Download, Maximize2, Plus, Trash2 } from "lucide-react";
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


function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function headlineSegmentsToHtml(segments: HeadlineSegment[], text: string, color: string, size: number, bold: boolean, italic: boolean, underline: boolean): string {
  const parts = segments.length && segments.map((part) => part.text).join("") === text ? segments : [{ text }];
  return parts.map((part) => {
    const styles = [
      `color:${part.color || color}`,
      `font-size:${part.size || size}px`,
      `font-weight:${(part.bold ?? bold) ? 700 : 400}`,
      `font-style:${(part.italic ?? italic) ? "italic" : "normal"}`,
      `text-decoration:${[(part.underline ?? underline) ? "underline" : "", part.strike ? "line-through" : ""].filter(Boolean).join(" ") || "none"}`,
      `background-color:${part.backgroundColor || "transparent"}`,
    ].join(";");
    return `<span style="${styles}">${escapeHtml(part.text).replace(/\n/g, "<br>")}</span>`;
  }).join("");
}

function parseHeadlineDom(root: HTMLElement, defaultColor: string, defaultSize: number): HeadlineSegment[] {
  const result: HeadlineSegment[] = [];
  const walk = (node: Node, inherited: Partial<HeadlineSegment> = {}) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      if (!text) return;
      const prev = result[result.length - 1];
      const same = prev && prev.color === inherited.color && prev.backgroundColor === inherited.backgroundColor && prev.size === inherited.size && prev.bold === inherited.bold && prev.italic === inherited.italic && prev.underline === inherited.underline && prev.strike === inherited.strike;
      if (same && prev) prev.text += text;
      else result.push({ text, ...inherited });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const style = el.style;
    const next: Partial<HeadlineSegment> = { ...inherited };
    if (style.color) next.color = style.color;
    if (style.backgroundColor && style.backgroundColor !== "transparent" && style.backgroundColor !== "rgba(0, 0, 0, 0)") next.backgroundColor = style.backgroundColor;
    if (style.fontSize?.endsWith("px")) next.size = Number.parseFloat(style.fontSize);
    if (style.fontWeight) next.bold = style.fontWeight === "bold" || Number(style.fontWeight) >= 600;
    if (style.fontStyle) next.italic = style.fontStyle === "italic";
    if (style.textDecoration || style.textDecorationLine) {
      const decoration = style.textDecoration + " " + style.textDecorationLine;
      next.underline = /underline/.test(decoration);
      next.strike = /line-through/.test(decoration);
    }
    if (tag === "b" || tag === "strong") next.bold = true;
    if (tag === "i" || tag === "em") next.italic = true;
    if (tag === "u") next.underline = true;
    if (tag === "br") { result.push({ text: "\n" }); return; }
    for (const child of Array.from(node.childNodes)) walk(child, next);
    if ((tag === "div" || tag === "p") && node.nextSibling) result.push({ text: "\n" });
  };
  for (const child of Array.from(root.childNodes)) walk(child);
  while (result.length && result[result.length - 1]!.text === "\n") result.pop();
  return result.map((part) => {
    const out = { ...part };
    if (out.color === defaultColor) delete out.color;
    if (out.size === defaultSize) delete out.size;
    return out;
  });
}

function getCaretTextOffset(root: HTMLElement, range: Range): number {
  const before = range.cloneRange();
  before.selectNodeContents(root);
  before.setEnd(range.endContainer, range.endOffset);
  return before.toString().length;
}

function restoreCaretTextOffset(root: HTMLElement, offset: number): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, offset);
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  root.focus();
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
  const [headlineWordSize, setHeadlineWordSize] = useState(18);
  const [headlineMode, setHeadlineMode] = useState<"visual" | "code">("visual");
  const [headlineCode, setHeadlineCode] = useState("");
  const [headlineExpanded, setHeadlineExpanded] = useState(false);
  const [headlineBackground, setHeadlineBackground] = useState("#ff9800");
  const headlineEditorRef = useRef<HTMLDivElement>(null);
  const headlineExpandedRef = useRef<HTMLDivElement>(null);
  const skipHeadlineDomSync = useRef(false);

  useEffect(() => {
    if (search.v && videos.some((v) => v.id === search.v)) setVideoId(search.v);
  }, [search.v, videos]);

  useEffect(() => {
    if (!video) return;
    const loadedSettings = parseSettings(video.player_settings);
    setS(loadedSettings);
    if (headlineEditorRef.current) headlineEditorRef.current.innerHTML = headlineSegmentsToHtml(loadedSettings.headlineSegments, loadedSettings.headlineText, loadedSettings.headlineColor, loadedSettings.headlineFontSize, loadedSettings.headlineBold, loadedSettings.headlineItalic, loadedSettings.headlineUnderline);
    setOffer(video.offer_time_seconds != null ? fmtTime(video.offer_time_seconds) : "");
    setCheckout(video.checkout_url ?? "");
  }, [video]);

  const set = <K extends keyof PlayerSettings>(k: K, v: PlayerSettings[K]) => setS((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (skipHeadlineDomSync.current) { skipHeadlineDomSync.current = false; return; }
    if (headlineEditorRef.current && open === "headline") {
      const el = headlineEditorRef.current;
      const selection = window.getSelection();
      const active = document.activeElement === el;
      const offset = active && selection?.rangeCount ? getCaretTextOffset(el, selection.getRangeAt(0).cloneRange()) : null;
      const html = headlineSegmentsToHtml(s.headlineSegments, s.headlineText, s.headlineColor, s.headlineFontSize, s.headlineBold, s.headlineItalic, s.headlineUnderline);
      el.innerHTML = html;
      if (headlineExpandedRef.current) headlineExpandedRef.current.innerHTML = html;
      if (active && offset != null) restoreCaretTextOffset(el, offset);
    }
  }, [s.headlineSegments, s.headlineText, s.headlineColor, s.headlineFontSize, s.headlineBold, s.headlineItalic, s.headlineUnderline, open]);

  function isHeadlineStyleActive(key: "bold" | "italic" | "underline" | "strike"): boolean {
    const text = s.headlineText;
    let start = Math.max(0, Math.min(headlineSelection.start, headlineSelection.end));
    let end = Math.min(text.length, Math.max(headlineSelection.start, headlineSelection.end));
    if (start === end) {
      while (start > 0 && !/\\s/.test(text[start - 1] ?? "")) start--;
      end = Math.max(end, headlineSelection.start);
      while (end < text.length && !/\\s/.test(text[end] ?? "")) end++;
    }
    const source = s.headlineSegments.length && s.headlineSegments.map((part) => part.text).join("") === text ? s.headlineSegments : [{ text }];
    let offset = 0;
    const selected: HeadlineSegment[] = [];
    for (const part of source) {
      const a = offset;
      const b = offset + part.text.length;
      offset = b;
      if (a < end && b > start) selected.push(part);
    }
    if (!selected.length) return key === "bold" ? s.headlineBold : key === "italic" ? s.headlineItalic : key === "underline" ? s.headlineUnderline : false;
    return selected.every((part) => key === "bold" ? (part.bold ?? s.headlineBold) : key === "italic" ? (part.italic ?? s.headlineItalic) : key === "underline" ? (part.underline ?? s.headlineUnderline) : (part.strike ?? false));
  }

  function toggleHeadlineStyle(key: "bold" | "italic" | "underline" | "strike") {
    applyHeadlineStyle({ [key]: !isHeadlineStyleActive(key) });
  }

  function applyHeadlineStyle(patch: Partial<HeadlineSegment>) {
    const text = s.headlineText;
    if (!text) return;
    let start = Math.max(0, Math.min(text.length, Math.min(headlineSelection.start, headlineSelection.end)));
    let end = Math.max(0, Math.min(text.length, Math.max(headlineSelection.start, headlineSelection.end)));
    if (start === end) {
      start = Math.min(start, text.length);
      while (start > 0 && !/\s/.test(text[start - 1] ?? "")) start--;
      end = Math.max(start, Math.min(text.length, headlineSelection.start));
      while (end < text.length && !/\s/.test(text[end] ?? "")) end++;
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
        const a = cuts[i]!;
        const b = cuts[i + 1]!;
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

  async function copyEmbed() {
    if (!video) return;
    const origin = window.location.origin;
    const id = video.id;
    const ratio = s.aspect === "9:16" ? "9 / 16" : "16 / 9";
    const code = `<div style="position:relative;width:100%;max-width:960px;margin:0 auto;aspect-ratio:${ratio};background:#111;overflow:hidden">
  <iframe
    src="${origin}/embed/${id}"
    title="Vexora video player"
    loading="eager"
    allow="autoplay; fullscreen; picture-in-picture"
    allowfullscreen
    style="position:absolute;inset:0;width:100%;height:100%;border:0;display:block"
  ></iframe>
</div>`;
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Código embed copiado.");
    } catch {
      toast.error("Não foi possível copiar. Verifique a permissão de área de transferência do navegador.");
    }
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
  const Text = ({ k, label, placeholder }: { k: "pauseText" | "resumeText" | "ctaText" | "autoplayText" | "autoplayImage" | "headlineText" | "headlineImageUrl" | "trafficParam" | "trafficRedirect" | "thumbPauseUrl" | "thumbEndUrl" | "fbPixel" | "ga4" | "captionsUrl"; label: string; placeholder?: string }) => (
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
          <Button type="button" variant="outline" onClick={copyEmbed} className="min-w-28"><Copy className="mr-2 h-4 w-4" />Copiar embed</Button>
          <Button onClick={save} disabled={saving} className="min-w-28">{saving ? "Salvando…" : "Salvar alterações"}</Button>
        </div>
      </div>

      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
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
                onClick={copyEmbed}
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

          <div className="border-b border-border last:border-0">
            <div className="flex items-center gap-3 px-4 py-3">
              <button type="button" onClick={() => setOpen(open === "headline" ? null : "headline")} className="flex flex-1 items-center gap-2 text-left text-sm font-medium">
                <ChevronDown className={"h-4 w-4 text-muted-foreground transition-transform " + (open === "headline" ? "" : "-rotate-90")} />
                Headline acima do vídeo
              </button>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {s.headline ? "On" : "Off"}
                <Switch checked={s.headline} onCheckedChange={(v) => set("headline", v)} />
              </span>
            </div>
            {open === "headline" && <div className="divide-y divide-border bg-card px-4 pb-4 text-foreground">
              <div className="space-y-2 py-3">
                <p className="text-sm font-semibold">Selecione o melhor modo de edição</p>
                <p className="text-xs leading-relaxed text-muted-foreground">Visual e Código editam a mesma headline. A prévia é atualizada enquanto você edita.</p>
                <div className="grid grid-cols-2 rounded-md border border-border bg-muted/30 p-1">
                  <button type="button" onClick={() => { if (headlineMode === "code") { const root = document.createElement("div"); root.innerHTML = headlineCode; const parsed = parseHeadlineDom(root, s.headlineColor, s.headlineFontSize); set("headlineText", parsed.map(p => p.text).join("")); set("headlineSegments", parsed); } setHeadlineMode("visual"); }} className={"rounded px-3 py-2 text-sm " + (headlineMode === "visual" ? "border border-primary text-primary" : "text-muted-foreground")}>Visual</button>
                  <button type="button" onClick={() => { if (headlineMode === "visual") setHeadlineCode(headlineSegmentsToHtml(s.headlineSegments, s.headlineText, s.headlineColor, s.headlineFontSize, s.headlineBold, s.headlineItalic, s.headlineUnderline)); setHeadlineMode("code"); }} className={"rounded px-3 py-2 text-sm " + (headlineMode === "code" ? "border border-primary text-primary" : "text-muted-foreground")}>Código HTML</button>
                </div>
              </div>
              {s.headlineUseImage ? (
                <div className="space-y-2 py-3">
                  <Label className="text-foreground">Tipo de headline</Label>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => set("headlineUseImage", false)}>Texto</Button>
                    <Button type="button" size="sm" variant="default">Imagem</Button>
                  </div>
                  <Label className="text-foreground">URL direta da imagem da headline</Label>
                  <Input value={s.headlineImageUrl} onChange={(e) => set("headlineImageUrl", e.target.value)} placeholder="https://site.com/headline.webp" />
                  <ImageUrlPreview url={s.headlineImageUrl} title="Prévia da imagem da headline" aspect={s.aspect} />
                </div>
              ) : (
                <>
                  <div className="space-y-2 py-3">
                    <Label className="text-foreground">Tipo de headline</Label>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="default">Texto</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => set("headlineUseImage", true)}>Imagem</Button>
                    </div>
                    {headlineMode === "visual" ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1 rounded-md border border-border bg-muted/30 p-2">
                          <Button type="button" size="icon" variant="ghost" aria-pressed={isHeadlineStyleActive("bold")} title="Negrito" onClick={() => toggleHeadlineStyle("bold")} className={"h-8 w-8 border " + (isHeadlineStyleActive("bold") ? "border-primary/40 bg-primary/10 text-primary" : "border-transparent text-muted-foreground")}>B</Button>
                          <Button type="button" size="icon" variant="ghost" aria-pressed={isHeadlineStyleActive("italic")} title="Itálico" onClick={() => toggleHeadlineStyle("italic")} className={"h-8 w-8 border italic " + (isHeadlineStyleActive("italic") ? "border-primary/40 bg-primary/10 text-primary" : "border-transparent text-muted-foreground")}>I</Button>
                          <Button type="button" size="icon" variant="ghost" aria-pressed={isHeadlineStyleActive("underline")} title="Sublinhado" onClick={() => toggleHeadlineStyle("underline")} className={"h-8 w-8 border underline " + (isHeadlineStyleActive("underline") ? "border-primary/40 bg-primary/10 text-primary" : "border-transparent text-muted-foreground")}>U</Button>
                          <Button type="button" size="icon" variant="ghost" aria-pressed={isHeadlineStyleActive("strike")} title="Tachado" onClick={() => toggleHeadlineStyle("strike")} className={"h-8 w-8 border line-through " + (isHeadlineStyleActive("strike") ? "border-primary/40 bg-primary/10 text-primary" : "border-transparent text-muted-foreground")}>S</Button>
                          <label title="Cor do texto" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded hover:bg-accent">A<input type="color" value={headlineWordColor} onChange={(e) => { setHeadlineWordColor(e.target.value); applyHeadlineStyle({ color: e.target.value }); }} className="absolute h-0 w-0 opacity-0" /></label>
                          <label title="Destaque de fundo" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded hover:bg-accent">▰<input type="color" value={headlineBackground} onChange={(e) => { setHeadlineBackground(e.target.value); applyHeadlineStyle({ backgroundColor: e.target.value }); }} className="absolute h-0 w-0 opacity-0" /></label>
                          <span className="mx-1 h-8 w-px bg-[#3a3a3a]" />
                          {(["left","center","right","justify"] as const).map((align) => <Button key={align} type="button" size="icon" variant={s.headlineAlign === align ? "default" : "ghost"} title={"Alinhar " + align} onClick={() => set("headlineAlign", align)} className="h-8 w-8 text-xs">{align === "left" ? "⇤" : align === "center" ? "↔" : align === "right" ? "⇥" : "☷"}</Button>)}
                        </div>
                        <div className="flex items-center gap-2 rounded-md border border-[#3a3a3a] p-2">
                          <span className="text-xs text-muted-foreground">Aa</span>
                          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => set("headlineFontSize", Math.max(8, s.headlineFontSize - 1))}>−</Button>
                          <Input type="number" min={8} max={96} value={s.headlineFontSize} onChange={(e) => set("headlineFontSize", Math.min(96, Math.max(8, Number(e.target.value) || 18)))} className="h-8 w-16 text-center" />
                          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => set("headlineFontSize", Math.min(96, s.headlineFontSize + 1))}>+</Button>
                          <span className="text-xs text-white/50">px</span>
                        </div>
                        <div className="relative">
                          <div ref={headlineEditorRef} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true"
                            onInput={(e) => { const el=e.currentTarget; const parsed=parseHeadlineDom(el,s.headlineColor,s.headlineFontSize); skipHeadlineDomSync.current=true; set("headlineText",parsed.map(p=>p.text).join("")); set("headlineSegments",parsed); const sel=window.getSelection(); if(sel?.rangeCount){const r=sel.getRangeAt(0); const pos=getCaretTextOffset(el,r.cloneRange()); setHeadlineSelection({start:pos,end:pos});} }}
                            onMouseUp={(e) => { const el=e.currentTarget; const sel=window.getSelection(); if(sel?.rangeCount&&el.contains(sel.anchorNode)){const r=sel.getRangeAt(0).cloneRange();const end=getCaretTextOffset(el,r);r.collapse(true);setHeadlineSelection({start:getCaretTextOffset(el,r),end});} }}
                            onKeyUp={(e) => { const el=e.currentTarget; const sel=window.getSelection(); if(sel?.rangeCount&&el.contains(sel.anchorNode)){const r=sel.getRangeAt(0).cloneRange();const end=getCaretTextOffset(el,r);r.collapse(true);setHeadlineSelection({start:getCaretTextOffset(el,r),end});} }}
                            data-placeholder="Digite ou cole sua headline…" style={{fontFamily:s.headlineFontFamily,fontWeight:s.headlineFontWeight,lineHeight:s.headlineLineHeight,letterSpacing:s.headlineLetterSpacing+"px",textTransform:s.headlineTransform,textAlign:s.headlineAlign,backgroundColor:s.headlineBackgroundColor}} className="min-h-32 w-full whitespace-pre-wrap rounded-md border border-[#3a3a3a] bg-[#1b1b1b] px-3 py-3 text-sm leading-relaxed text-white outline-none focus-visible:border-sky-500 [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-white/35" />
                          <button type="button" onClick={() => setHeadlineExpanded(true)} title="Expandir editor" className="absolute bottom-2 right-2 rounded border border-[#3a3a3a] bg-[#222] p-1.5 text-muted-foreground hover:text-sky-400"><Maximize2 className="h-4 w-4" /></button>
                        </div>
                        <p className="text-[11px] text-white/50">Selecione um trecho antes de usar as ferramentas para formatar somente aquela parte.</p>
                      </div>
                    ) : (
                      <textarea value={headlineCode} onChange={(e) => { const code=e.target.value; setHeadlineCode(code); const root=document.createElement("div"); root.innerHTML=code; const parsed=parseHeadlineDom(root,s.headlineColor,s.headlineFontSize); set("headlineText",parsed.map(p=>p.text).join("")); set("headlineSegments",parsed); }} spellCheck={false} className="min-h-48 w-full rounded-md border border-[#3a3a3a] bg-[#171717] p-3 font-mono text-xs text-emerald-300 outline-none focus:border-sky-500" />
                    )}
                  </div>
                  <details className="py-3">
                    <summary className="cursor-pointer list-none text-sm font-medium">Tipografia <span className="float-right text-white/50">⌄</span></summary>
                    <div className="grid grid-cols-2 gap-3 pt-3">
                      <div className="space-y-1"><Label className="text-muted-foreground">Família</Label><select value={s.headlineFontFamily} onChange={e=>set("headlineFontFamily",e.target.value)} className="h-9 w-full rounded-md border border-[#3a3a3a] bg-[#1b1b1b] px-2 text-xs"><option value="Inter, Arial, sans-serif">Inter</option><option value="Arial, sans-serif">Arial</option><option value="Georgia, serif">Georgia</option><option value="Impact, sans-serif">Impact</option><option value="'Trebuchet MS', sans-serif">Trebuchet MS</option></select></div>
                      <div className="space-y-1"><Label className="text-muted-foreground">Peso</Label><select value={s.headlineFontWeight} onChange={e=>set("headlineFontWeight",Number(e.target.value))} className="h-9 w-full rounded-md border border-[#3a3a3a] bg-[#1b1b1b] px-2 text-xs"><option value={400}>Normal</option><option value={500}>Médio</option><option value={600}>Semibold</option><option value={700}>Negrito</option><option value={800}>Extra negrito</option><option value={900}>Preto</option></select></div>
                      <div className="space-y-1"><Label className="text-muted-foreground">Altura da linha</Label><Input type="number" min={0.8} max={2.5} step={0.1} value={s.headlineLineHeight} onChange={e=>set("headlineLineHeight",Math.min(2.5,Math.max(0.8,Number(e.target.value)||1.2)))} /></div>
                      <div className="space-y-1"><Label className="text-muted-foreground">Espaçamento letras</Label><Input type="number" min={-2} max={10} step={0.1} value={s.headlineLetterSpacing} onChange={e=>set("headlineLetterSpacing",Number(e.target.value)||0)} /></div>
                      <div className="col-span-2 space-y-1"><Label className="text-muted-foreground">Transformação</Label><select value={s.headlineTransform} onChange={e=>set("headlineTransform",e.target.value as PlayerSettings["headlineTransform"])} className="h-9 w-full rounded-md border border-[#3a3a3a] bg-[#1b1b1b] px-2 text-xs"><option value="none">Original</option><option value="uppercase">MAIÚSCULAS</option><option value="lowercase">minúsculas</option><option value="capitalize">Iniciais maiúsculas</option></select></div>
                    </div>
                  </details>
                  <details className="py-3">
                    <summary className="cursor-pointer list-none text-sm font-medium">Layout <span className="float-right text-white/50">⌄</span></summary>
                    <div className="grid grid-cols-2 gap-3 pt-3">
                      <div className="space-y-1"><Label className="text-muted-foreground">Largura (%)</Label><Input type="number" min={30} max={100} value={s.headlineWidth} onChange={e=>set("headlineWidth",Math.min(100,Math.max(30,Number(e.target.value)||100)))} /></div>
                      <div className="space-y-1"><Label className="text-muted-foreground">Margem interna (px)</Label><Input type="number" min={0} max={48} value={s.headlinePadding} onChange={e=>set("headlinePadding",Math.min(48,Math.max(0,Number(e.target.value)||0)))} /></div>
                      <div className="col-span-2 space-y-1"><Label className="text-muted-foreground">Fundo do texto</Label><div className="flex items-center gap-2"><input type="color" value={s.headlineBackgroundColor === "transparent" ? "#222222" : s.headlineBackgroundColor} onChange={e=>set("headlineBackgroundColor",e.target.value)} /><Button size="sm" variant="outline" type="button" onClick={()=>set("headlineBackgroundColor","transparent")}>Sem fundo</Button></div></div>
                    </div>
                  </details>
                </>
              )}
            </div>}
            {headlineExpanded && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 sm:p-8">
              <div className="flex max-h-full w-full max-w-4xl flex-col rounded-xl border border-[#3a3a3a] bg-[#222] p-4 text-white shadow-2xl">
                <div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold">Editor de headline expandido</p><Button type="button" variant="ghost" size="sm" onClick={()=>setHeadlineExpanded(false)}>Fechar ✕</Button></div>
                <div ref={headlineExpandedRef} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" onInput={(e)=>{const el=e.currentTarget;const parsed=parseHeadlineDom(el,s.headlineColor,s.headlineFontSize);skipHeadlineDomSync.current=true;set("headlineText",parsed.map(p=>p.text).join(""));set("headlineSegments",parsed);if(headlineEditorRef.current)headlineEditorRef.current.innerHTML=el.innerHTML;}} className="min-h-64 flex-1 overflow-auto whitespace-pre-wrap rounded-md border border-[#3a3a3a] bg-[#171717] p-5 text-lg outline-none" style={{fontFamily:s.headlineFontFamily,fontWeight:s.headlineFontWeight,lineHeight:s.headlineLineHeight,letterSpacing:s.headlineLetterSpacing+"px",textTransform:s.headlineTransform,textAlign:s.headlineAlign,backgroundColor:s.headlineBackgroundColor}}>{s.headlineText}</div>
              </div>
            </div>}
          </div>

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

        <div className="min-w-0 max-w-full lg:sticky lg:top-8 lg:self-start">
          <div className="panel min-w-0 max-w-full overflow-hidden p-3">
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
