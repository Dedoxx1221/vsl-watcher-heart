import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Radio, Users, Play, MapPin, Globe, MonitorSmartphone, Compass, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { videosQuery } from "@/lib/videos";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/live")({
  head: () => ({ meta: [{ title: "Audiência ao vivo — Vexora" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(videosQuery),
  component: LiveAudience,
});
type Viewer = { session_id: string; viewer_id: string; position: number; is_playing: boolean; last_seen_at: string; country: string|null; region: string|null; city: string|null; device_type: string|null; browser?: string|null; referrer: string|null; utm_source: string|null; utm_medium: string|null; utm_campaign: string|null };
type LiveData = { active_count: number; playing_count: number; viewers: Viewer[]; geo: { country:string; region:string; city:string; viewers:number }[] };
function distribution(viewers: Viewer[], label: (v:Viewer)=>string) {
  const counts = new Map<string,number>();
  viewers.forEach(v=>{const k=label(v).trim()||"Desconhecido";counts.set(k,(counts.get(k)||0)+1);});
  return [...counts].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count);
}
function source(v:Viewer) { const utm=[v.utm_source,v.utm_medium,v.utm_campaign].filter(Boolean).join(" / "); if(utm)return utm; if(!v.referrer)return "Direto / desconhecido"; try{return new URL(v.referrer).hostname;}catch{return v.referrer;} }
function Breakdown({title,icon:Icon,items}:{title:string;icon:typeof Globe;items:{label:string;count:number}[]}) {
  const total=items.reduce((n,x)=>n+x.count,0);
  return <section className="panel min-w-0 p-5"><h2 className="mb-4 flex items-center gap-2 font-semibold"><Icon className="h-4 w-4 text-primary"/>{title}</h2>{items.length?<div className="space-y-3">{items.slice(0,8).map(x=><div key={x.label}><div className="mb-1 flex justify-between gap-3 text-sm"><span className="truncate">{x.label}</span><span className="num text-muted-foreground">{x.count} ({total?Math.round(x.count/total*100):0}%)</span></div><div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{width:total?`${x.count/total*100}%`:"0%"}}/></div></div>)}</div>:<p className="text-sm text-muted-foreground">Nenhuma sessão ativa nesta categoria.</p>}</section>;
}
function LiveAudience() {
  const {data:videos}=useSuspenseQuery(videosQuery);
  const [chosen,setChosen]=useState("");
  const id=chosen||videos[0]?.id||"";
  const video=videos.find(v=>v.id===id);
  const {data,isFetching,error,dataUpdatedAt}=useQuery({queryKey:["live-vsl-analytics",id],enabled:!!id,refetchInterval:5000,refetchIntervalInBackground:true,queryFn:async()=>{const {data,error}=await supabase.rpc("get_live_vsl_analytics",{_video_id:id});if(error)throw error;return data as unknown as LiveData;}});
  const viewers=data?.viewers??[];
  return <div className="mx-auto max-w-[1600px] space-y-6 pb-8">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-500"><Radio className="h-4 w-4"/> Monitoramento em tempo real</div><h1 className="text-3xl font-bold tracking-tight">Audiência ao vivo</h1><p className="mt-1 text-sm text-muted-foreground">Acompanhe as sessões ativas da sua VSL, com atualização automática a cada 5 segundos.</p></div><div className="flex items-center gap-2"><Select value={id} onValueChange={setChosen}><SelectTrigger className="w-64"><SelectValue placeholder="Selecionar VSL"/></SelectTrigger><SelectContent>{videos.map(v=><SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select><span className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500"/>{isFetching?"Atualizando":"Ao vivo"}</span></div></header>
    {!videos.length?<div className="panel p-10 text-center text-muted-foreground">Nenhuma VSL cadastrada. Cadastre um vídeo na Biblioteca para começar.</div>:<>
    {error&&<div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Não foi possível carregar a audiência. Verifique a função get_live_vsl_analytics no Supabase.</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="panel p-5"><div className="flex justify-between text-sm text-muted-foreground"><span>Espectadores ativos</span><Users className="h-4 w-4"/></div><p className="num mt-3 text-3xl font-bold">{data?.active_count??0}</p><p className="mt-1 text-xs text-muted-foreground">Sessões recentes nesta VSL</p></div>
      <div className="panel p-5"><div className="flex justify-between text-sm text-muted-foreground"><span>Assistindo agora</span><Play className="h-4 w-4"/></div><p className="num mt-3 text-3xl font-bold">{data?.playing_count??0}</p><p className="mt-1 text-xs text-muted-foreground">Reprodução ativa reportada pelo player</p></div>
      <div className="panel p-5"><div className="flex justify-between text-sm text-muted-foreground"><span>Países identificados</span><Globe className="h-4 w-4"/></div><p className="num mt-3 text-3xl font-bold">{new Set(viewers.map(v=>v.country).filter(Boolean)).size}</p><p className="mt-1 text-xs text-muted-foreground">Entre sessões ativas</p></div>
      <div className="panel p-5"><div className="flex justify-between text-sm text-muted-foreground"><span>Última atualização</span><RefreshCw className={`h-4 w-4 ${isFetching?"animate-spin":""}`}/></div><p className="mt-3 text-lg font-semibold">{dataUpdatedAt?new Date(dataUpdatedAt).toLocaleTimeString("pt-BR"):"Aguardando…"}</p><p className="mt-1 text-xs text-muted-foreground">Atualização automática</p></div>
    </div>
    <div className="grid gap-4 lg:grid-cols-2"><Breakdown title="Países" icon={MapPin} items={distribution(viewers,v=>v.country||"Desconhecido")}/><Breakdown title="Origem / UTM" icon={Compass} items={distribution(viewers,source)}/><Breakdown title="Navegadores" icon={Globe} items={distribution(viewers,v=>v.browser||"Desconhecido")}/><Breakdown title="Dispositivos" icon={MonitorSmartphone} items={distribution(viewers,v=>v.device_type||"Desconhecido")}/></div>
    <section className="panel overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5"><div><h2 className="font-semibold">Sessões ativas</h2><p className="mt-1 text-sm text-muted-foreground">{video?.name??"VSL selecionada"} · visitantes vistos recentemente</p></div><span className="rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-500">{viewers.length} sessões</span></div>
    {viewers.length?<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-secondary/40 text-xs text-muted-foreground"><tr>{["Visitante","Localização","Dispositivo / navegador","Posição na VSL","Estado","Último sinal"].map(h=><th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{viewers.map((v,i)=><tr key={v.session_id} className="border-t border-border/70"><td className="px-5 py-3"><span className="font-medium">Visitante {i+1}</span><p className="text-xs text-muted-foreground">{v.viewer_id?v.viewer_id.slice(0,8):"ID indisponível"}</p></td><td className="px-5 py-3">{[v.city,v.region,v.country].filter(Boolean).join(", ")||"Desconhecida"}</td><td className="px-5 py-3">{[v.device_type,v.browser].filter(Boolean).join(" · ")||"Desconhecido"}</td><td className="px-5 py-3 num">{Math.floor((v.position||0)/60).toString().padStart(2,"0")}:{Math.floor((v.position||0)%60).toString().padStart(2,"0")}</td><td className="px-5 py-3"><span className={`rounded-full px-2 py-1 text-xs ${v.is_playing?"bg-emerald-500/10 text-emerald-500":"bg-secondary text-muted-foreground"}`}>{v.is_playing?"Assistindo":"Pausado"}</span></td><td className="px-5 py-3 text-muted-foreground">{v.last_seen_at?new Date(v.last_seen_at).toLocaleTimeString("pt-BR"):"—"}</td></tr>)}</tbody></table></div>:<div className="p-10 text-center"><Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground"/><p className="font-medium">Nenhuma sessão ao vivo neste momento</p><p className="mt-1 text-sm text-muted-foreground">Quando alguém abrir esta VSL, a sessão aparecerá aqui.</p></div>}</section>
    </>}
  </div>;
}
