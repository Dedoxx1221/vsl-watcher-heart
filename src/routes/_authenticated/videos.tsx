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
  if (parts.some(isNaN)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function embedCode(id: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `<div id="vsl-${id}" style="position:relative;width:100%;aspect-ratio:16/9"></div>
<script>(function(){var c=document.getElementById("vsl-${id}");var f=document.createElement("iframe");f.src="${origin}/embed/${id}"+location.search;f.allow="autoplay; fullscreen";f.allowFullscreen=true;f.style.cssText="position:absolute;inset:0;width:100%;height:100%;border:0";c.appendChild(f);})();</script>`;
}

function Videos() {
  const { data: videos } = useSuspenseQuery(videosQuery);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", video_url: "", thumbnail_url: "", checkout_url: "", offer: "" });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("videos").insert({
      owner_id: u.user!.id, name: f.name, video_url: f.video_url,
      thumbnail_url: f.thumbnail_url || null, checkout_url: f.checkout_url || null,
      offer_time_seconds: parseTime(f.offer),
    });
    if (error) return toast.error(error.message);
    toast.success("VSL cadastrada");
    setOpen(false);
    setF({ name: "", video_url: "", thumbnail_url: "", checkout_url: "", offer: "" });
    qc.invalidateQueries({ queryKey: ["videos"] });
  }

  async function remove(id: string) {
    if (!confirm("Excluir esta VSL e todas as suas métricas?")) return;
    await supabase.from("videos").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["videos"] });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Biblioteca</p>
          <h1 className="text-3xl font-bold">Suas VSLs</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>Nova VSL</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Cadastrar VSL</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-3">
              {([
                ["name", "Nome", true], ["video_url", "URL do vídeo (MP4)", true], ["thumbnail_url", "URL da thumbnail", false],
                ["checkout_url", "URL do checkout", false], ["offer", "Momento da oferta (hh:mm:ss)", false],
              ] as const).map(([k, l, req]) => (
                <div key={k} className="space-y-1"><Label>{l}</Label>
                  <Input required={req} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={k === "offer" ? "01:01:45" : ""} /></div>
              ))}
              <Button className="w-full">Salvar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {videos.map((v) => (
          <div key={v.id} className="panel overflow-hidden">
            {v.thumbnail_url && <img src={v.thumbnail_url} alt={v.name} className="aspect-video w-full object-cover" />}
            <div className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{v.name}</h2>
                  <p className="num text-xs text-muted-foreground">
                    Duração {v.duration_seconds ? fmtTime(Number(v.duration_seconds)) : "—"} · Oferta {v.offer_time_seconds != null ? fmtTime(v.offer_time_seconds) : "—"}
                  </p>
                </div>
                <Button asChild size="sm"><Link to="/dashboard" search={{ v: v.id }}>Métricas</Link></Button>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Código de incorporação</Label>
                <Textarea readOnly value={embedCode(v.id)} className="num h-24 text-xs" onFocus={(e) => e.target.select()} />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(embedCode(v.id)); toast.success("Código copiado"); }}>Copiar código</Button>
                <Button size="sm" variant="secondary" asChild><a href={`/embed/${v.id}?utm_campaign=teste`} target="_blank" rel="noreferrer">Testar player</a></Button>
                <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => remove(v.id)}>Excluir</Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Parâmetros da página (ex.: utm_campaign) são repassados ao player para filtro por campanha e ao checkout.</p>
    </div>
  );
}
