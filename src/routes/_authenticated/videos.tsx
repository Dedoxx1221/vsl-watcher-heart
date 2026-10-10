import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BarChart3, Code2, ExternalLink, Eye, Files, Folder, FolderPlus, MoreHorizontal, Pencil, Play, ArrowRightLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { videosQuery, fmtTime } from "@/lib/videos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
  const [folders, setFolders] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("retina-vsl-folders") || "[]"); } catch { return []; } });
  const [folderMap, setFolderMap] = useState<Record<string,string>>(() => { try { return JSON.parse(localStorage.getItem("retina-vsl-folder-map") || "{}"); } catch { return {}; } });
  const [activeFolder, setActiveFolder] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameTarget, setRenameTarget] = useState<(typeof videos)[number] | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [moveFolder, setMoveFolder] = useState("");
  function saveFolders(next: string[]) { setFolders(next); localStorage.setItem("retina-vsl-folders", JSON.stringify(next)); }
  function saveFolderMap(next: Record<string,string>) { setFolderMap(next); localStorage.setItem("retina-vsl-folder-map", JSON.stringify(next)); }
  async function renameSelected() { if (!renameTarget || !renameValue.trim()) return; const { error } = await supabase.from("videos").update({ name: renameValue.trim() }).eq("id", renameTarget.id); if (error) { toast.error(error.message); return; } setRenameTarget(null); toast.success("VSL renomeada."); await qc.invalidateQueries({queryKey:["videos"]}); }
  async function duplicateSelected(video: (typeof videos)[number]) { const { data: auth } = await supabase.auth.getUser(); if (!auth.user) { toast.error("Faça login novamente."); return; } const { error } = await supabase.from("videos").insert({ name: video.name + " (cópia)", video_url: video.video_url, thumbnail_url: video.thumbnail_url, checkout_url: video.checkout_url, offer_time_seconds: video.offer_time_seconds, player_settings: video.player_settings, owner_id: auth.user.id }); if (error) { toast.error(error.message); return; } toast.success("VSL duplicada."); await qc.invalidateQueries({queryKey:["videos"]}); }

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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/60 p-3">
        <div className="flex flex-wrap gap-2"><Button size="sm" variant={activeFolder === "" ? "secondary" : "ghost"} onClick={() => setActiveFolder("")}><Folder className="mr-2 h-4 w-4" />Todas / raiz</Button>{folders.map(folder => <Button key={folder} size="sm" variant={activeFolder === folder ? "secondary" : "ghost"} onClick={() => setActiveFolder(folder)}><Folder className="mr-2 h-4 w-4" />{folder}</Button>)}</div>
        <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}><DialogTrigger asChild><Button size="sm" variant="outline"><FolderPlus className="mr-2 h-4 w-4" />Nova pasta</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Criar pasta</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={e => {e.preventDefault(); const n=newFolderName.trim(); if(!n)return; if(folders.some(x=>x.toLowerCase()===n.toLowerCase())){toast.error("Já existe uma pasta com esse nome.");return;} saveFolders([...folders,n]);setNewFolderName("");setNewFolderOpen(false);toast.success("Pasta criada.");}}><div className="space-y-2"><Label>Nome da pasta</Label><Input value={newFolderName} onChange={e=>setNewFolderName(e.target.value)} placeholder="Ex.: VSLs vencedoras" /></div><Button className="w-full" type="submit">Criar pasta</Button></form></DialogContent></Dialog>
      </div>
      {videos.filter(v => (folderMap[v.id] || "") === activeFolder).length === 0 ? (
        <div className="panel p-10 text-center"><Folder className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">{activeFolder ? "Esta pasta está vazia" : "Sua biblioteca está vazia"}</p><p className="mt-1 text-sm text-muted-foreground">Cadastre uma VSL ou mova vídeos para organizar sua biblioteca.</p></div>
      ) : (
        <div className="space-y-2">
          <div className="hidden grid-cols-[minmax(0,1fr)_130px_250px_40px] items-center gap-4 px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground md:grid"><span>Nome</span><span>Criado em</span><span className="text-right">Ações rápidas</span><span /></div>
          {videos.filter(v => (folderMap[v.id] || "") === activeFolder).map(v => <div key={v.id} className="group flex flex-col gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/20 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
            <div className="flex min-w-0 flex-1 items-center gap-3"><div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md border bg-muted">{v.thumbnail_url ? <img src={v.thumbnail_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Play className="h-6 w-6 text-muted-foreground" /></div>}<div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100"><Play className="h-5 w-5 fill-white text-white" /></div></div><div className="min-w-0"><h2 className="truncate font-semibold">{v.name}</h2><p className="mt-1 text-xs text-muted-foreground">Duração {v.duration_seconds ? fmtTime(Number(v.duration_seconds)) : "—"} · Oferta {v.offer_time_seconds != null ? fmtTime(Number(v.offer_time_seconds)) : "—"}</p></div></div>
            <div className="text-xs text-muted-foreground sm:w-[130px]">{v.created_at ? new Date(v.created_at).toLocaleDateString("pt-BR") : "—"}</div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end"><Button size="sm" variant="outline" asChild><Link to="/editor" search={{ v: v.id } as never}><Pencil className="mr-1.5 h-4 w-4" />Editar vídeo</Link></Button><Button size="sm" variant="outline" asChild><Link to="/dashboard" search={{v:v.id}}><BarChart3 className="mr-1.5 h-4 w-4" />Métricas</Link></Button><Button size="icon" variant="secondary" title="Copiar embed" onClick={() => {navigator.clipboard.writeText(embedCode(v.id));toast.success("Código embed copiado.");}}><Code2 className="h-4 w-4" /></Button>
            <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`Mais ações para ${v.name}`}><MoreHorizontal className="h-5 w-5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56"><DropdownMenuItem onClick={() => {setRenameTarget(v);setRenameValue(v.name);}}><Pencil className="mr-2 h-4 w-4" />Renomear</DropdownMenuItem><DropdownMenuItem onClick={() => window.open(`/editor?v=${encodeURIComponent(v.id)}`,"_blank","noopener,noreferrer")}><ExternalLink className="mr-2 h-4 w-4" />Abrir em nova guia</DropdownMenuItem><DropdownMenuItem onClick={() => window.open(`/embed/${v.id}`,"_blank","noopener,noreferrer")}><Eye className="mr-2 h-4 w-4" />Visualizar</DropdownMenuItem><DropdownMenuItem onClick={() => duplicateSelected(v)}><Files className="mr-2 h-4 w-4" />Duplicar</DropdownMenuItem><DropdownMenuItem onClick={() => {setMoveTarget(v.id);setMoveFolder(folderMap[v.id] || "");}}><ArrowRightLeft className="mr-2 h-4 w-4" />Mover para...</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => remove(v.id)}><Trash2 className="mr-2 h-4 w-4" />Excluir</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
          </div>)}
        </div>
      )}
      <Dialog open={!!renameTarget} onOpenChange={o=>!o&&setRenameTarget(null)}><DialogContent><DialogHeader><DialogTitle>Renomear VSL</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={e=>{e.preventDefault();void renameSelected();}}><div className="space-y-2"><Label>Novo nome</Label><Input value={renameValue} onChange={e=>setRenameValue(e.target.value)} /></div><Button className="w-full" type="submit">Salvar nome</Button></form></DialogContent></Dialog>
      <Dialog open={!!moveTarget} onOpenChange={o=>!o&&setMoveTarget(null)}><DialogContent><DialogHeader><DialogTitle>Mover VSL para...</DialogTitle></DialogHeader><div className="space-y-2"><Label>Destino</Label><select className="w-full rounded-md border bg-background p-2 text-sm" value={moveFolder} onChange={e=>setMoveFolder(e.target.value)}><option value="">Raiz da biblioteca</option>{folders.map(folder=><option key={folder} value={folder}>{folder}</option>)}</select></div><Button className="mt-4 w-full" onClick={()=>{if(!moveTarget)return;saveFolderMap({...folderMap,[moveTarget]:moveFolder});setMoveTarget(null);toast.success("Organização atualizada.");}}>Mover vídeo</Button></DialogContent></Dialog>
      <p className="text-xs text-muted-foreground">Editar uma VSL atualiza o registro existente e preserva o histórico de métricas associado a ela. Parâmetros da página (ex.: utm_campaign) são repassados ao player para filtro por campanha e ao checkout.</p>
    </div>
  );
}
