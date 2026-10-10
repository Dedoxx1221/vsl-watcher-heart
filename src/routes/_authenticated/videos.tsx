import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { videosQuery, fmtTime } from "@/lib/videos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/videos")({
  head: () => ({
    meta: [
      { title: "Biblioteca de VSLs — Retina" },
      { name: "description", content: "Cadastre VSLs e gere o código de incorporação." },
      { property: "og:title", content: "Biblioteca de VSLs — Retina" },
      { property: "og:description", content: "Cadastre VSLs e gere o código de incorporação." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(videosQuery),
  component: Videos,
});

function parseTime(s: string): number | null {
  if (!s.trim()) return null;
  const parts = s.split(":").map(Number);
  if (parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function isValidUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function embedCode(id: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `<div id="vsl-${id}" style="position:relative;width:100%;max-width:480px;margin:0 auto"></div>
<script>(function(){var c=document.getElementById("vsl-${id}");var f=document.createElement("iframe");f.src="${origin}/embed/${id}"+location.search;f.allow="autoplay; fullscreen";f.allowFullscreen=true;f.style.cssText="display:block;width:100%;border:0;aspect-ratio:9/16";c.appendChild(f);addEventListener("message",function(e){if(e.source===f.contentWindow&&e.data&&e.data.vslHeight){f.style.aspectRatio="auto";f.style.height=e.data.vslHeight+"px";}});})();</script>`;
}

const emptyForm = { name: "", video_url: "", thumbnail_url: "", checkout_url: "", offer: "" };
type VideoForm = typeof emptyForm;
type FormKey = keyof VideoForm;

function Videos() {
  const { data: videos } = useSuspenseQuery(videosQuery);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState<VideoForm>(emptyForm);

  function startCreate() {
    setEditingId(null);
    setF({ ...emptyForm });
  }

  function startEdit(video: (typeof videos)[number]) {
    setEditingId(video.id);
    setF({
      name: video.name ?? "",
      video_url: video.video_url ?? "",
      thumbnail_url: video.thumbnail_url ?? "",
      checkout_url: video.checkout_url ?? "",
      offer: video.offer_time_seconds != null ? fmtTime(Number(video.offer_time_seconds)) : "",
    });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) {
      toast.error("Informe um nome para a VSL.");
      return;
    }
    if (!isValidUrl(f.video_url) || !f.video_url.trim()) {
      toast.error("Informe uma URL válida para o vídeo.");
      return;
    }
    if (!isValidUrl(f.thumbnail_url) || !isValidUrl(f.checkout_url)) {
      toast.error("Confira os links. Use URLs começando com http:// ou https://.");
      return;
    }
    if (f.offer.trim() && parseTime(f.offer) === null) {
      toast.error("Informe o momento da oferta no formato hh:mm:ss.");
      return;
    }

    setSaving(true);
    const payload = {
      name: f.name.trim(),
      video_url: f.video_url.trim(),
      thumbnail_url: f.thumbnail_url.trim() || null,
      checkout_url: f.checkout_url.trim() || null,
      offer_time_seconds: parseTime(f.offer),
    };

    const result = editingId
      ? await supabase.from("videos").update(payload).eq("id", editingId)
      : await (async () => {
          const { data: auth } = await supabase.auth.getUser();
          if (!auth.user) return { error: { message: "Faça login novamente para cadastrar a VSL." } };
          return supabase.from("videos").insert({ ...payload, owner_id: auth.user.id });
        })();

    setSaving(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }

    toast.success(editingId ? "Links e dados da VSL atualizados. As métricas foram preservadas." : "VSL cadastrada.");
    setOpen(false);
    setEditingId(null);
    setF({ ...emptyForm });
    await qc.invalidateQueries({ queryKey: ["videos"] });
  }

  async function remove(id: string) {
    if (!confirm("Excluir esta VSL e todas as suas métricas?")) return;
    const { error } = await supabase.from("videos").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("VSL excluída.");
    await qc.invalidateQueries({ queryKey: ["videos"] });
  }

  const fields: { key: FormKey; label: string; required?: boolean; type?: string; placeholder?: string }[] = [
    { key: "name", label: "Nome da VSL", required: true },
    { key: "video_url", label: "Link do vídeo (MP4)", required: true, type: "url", placeholder: "https://..." },
    { key: "thumbnail_url", label: "Link da thumbnail", type: "url", placeholder: "https://... (opcional)" },
    { key: "checkout_url", label: "Link do checkout", type: "url", placeholder: "https://... (opcional)" },
    { key: "offer", label: "Momento em que a oferta aparece (hh:mm:ss)", placeholder: "01:01:45" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Biblioteca</p>
          <h1 className="text-3xl font-bold">Suas VSLs</h1>
        </div>
        <Dialog open={open} onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setEditingId(null);
            setF({ ...emptyForm });
          }
        }}>
          <DialogTrigger asChild>
            <Button onClick={startCreate}>Nova VSL</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar VSL e links" : "Cadastrar VSL"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={save} className="space-y-3">
              {fields.map(({ key, label, required, type, placeholder }) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`vsl-${key}`}>{label}</Label>
                  <Input
                    id={`vsl-${key}`}
                    type={type ?? "text"}
                    required={required}
                    value={f[key]}
                    onChange={(e) => setF((current) => ({ ...current, [key]: e.target.value }))}
                    placeholder={placeholder ?? ""}
                  />
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" className="w-full" disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {videos.length === 0 ? (
        <div className="panel p-8 text-center text-muted-foreground">Sua biblioteca está vazia. Clique em “Nova VSL” para cadastrar o primeiro vídeo.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {videos.map((v) => (
            <div key={v.id} className="panel overflow-hidden">
              {v.thumbnail_url && <img src={v.thumbnail_url} alt={v.name} className="aspect-video w-full object-cover" />}
              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold">{v.name}</h2>
                    <p className="num text-xs text-muted-foreground">
                      Duração {v.duration_seconds ? fmtTime(Number(v.duration_seconds)) : "—"} · Oferta {v.offer_time_seconds != null ? fmtTime(Number(v.offer_time_seconds)) : "—"}
                    </p>
                  </div>
                  <Button asChild size="sm"><Link to="/dashboard" search={{ v: v.id }}>Métricas</Link></Button>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Link do vídeo</Label>
                  <a href={v.video_url} target="_blank" rel="noreferrer" className="block truncate text-xs text-primary underline">{v.video_url}</a>
                </div>
                {v.checkout_url && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Link do checkout</Label>
                    <a href={v.checkout_url} target="_blank" rel="noreferrer" className="block truncate text-xs text-primary underline">{v.checkout_url}</a>
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Código de incorporação</Label>
                  <Textarea readOnly value={embedCode(v.id)} className="num h-24 text-xs" onFocus={(e) => e.target.select()} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(embedCode(v.id)); toast.success("Código copiado"); }}>Copiar código</Button>
                  <Button size="sm" variant="secondary" asChild><a href={`/embed/${v.id}?utm_campaign=teste`} target="_blank" rel="noreferrer">Testar player</a></Button>
                  <Button size="sm" variant="outline" onClick={() => startEdit(v)}>Editar links</Button>
                  <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => remove(v.id)}>Excluir</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Editar uma VSL atualiza o registro existente e preserva o histórico de métricas associado a ela. Parâmetros da página (ex.: utm_campaign) são repassados ao player para filtro por campanha e ao checkout.</p>
    </div>
  );
}
