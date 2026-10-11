import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { BarChart3, Film, LogOut, SlidersHorizontal, ArrowUpRight, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Layout,
});

function Layout() {
  const nav = useNavigate();
  const item = "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-accent/80 hover:text-foreground";
  const active = { className: "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_oklch(0.66_0.25_292_/_28%)]" };
  return (
    <div className="min-h-screen md:flex">
      <aside className="z-20 border-b border-sidebar-border/80 bg-sidebar/95 p-4 backdrop-blur-xl md:sticky md:top-0 md:flex md:h-screen md:w-[248px] md:shrink-0 md:flex-col md:border-b-0 md:border-r">
        <Link preload="intent" to="/videos" className="mb-5 flex items-center gap-3 rounded-2xl px-2 py-3 transition-opacity hover:opacity-80">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-violet-600 to-blue-600 shadow-lg shadow-violet-600/30">
            <svg viewBox="0 0 48 48" role="img" aria-label="Símbolo Vexora" className="h-8 w-8" fill="none"><path d="M5 9 L17 11 L25 24 L42 5 L31 31 L23 41 Z" fill="white"/><path d="M5 9 L17 11 L25 24 L31 31 L23 41 Z" fill="white" fillOpacity=".82"/></svg>
          </span>
          <span className="min-w-0">
            <span className="block font-display text-xl font-bold tracking-[0.16em] text-foreground">VEXORA</span>
            <span className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Vídeos que vendem</span>
          </span>
        </Link>

        <div className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">Workspace</div>
        <nav className="flex gap-1.5 overflow-x-auto pb-1 md:flex-col md:overflow-visible">
          <Link preload="intent" to="/videos" className={item} activeProps={active}><Film className="h-[18px] w-[18px] shrink-0" />Biblioteca</Link>
          <Link preload="intent" to="/dashboard" className={item} activeProps={active}><BarChart3 className="h-[18px] w-[18px] shrink-0" />Analytics</Link>
          <Link preload="intent" to="/editor" className={item} activeProps={active}><SlidersHorizontal className="h-[18px] w-[18px] shrink-0" />Editor do player</Link>
          <Link preload="intent" to="/live" className={item} activeProps={active}><Radio className="h-[18px] w-[18px] shrink-0" />Audiência ao vivo</Link>
        </nav>

        <div className="mt-5 hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-primary/[0.04] to-transparent p-4 md:block">
          <p className="text-sm font-semibold text-foreground">Transforme dados em decisões</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Acompanhe a retenção e encontre oportunidades para melhorar suas VSLs.</p>
          <Link preload="intent" to="/dashboard" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Ver analytics <ArrowUpRight className="h-3.5 w-3.5" /></Link>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-sidebar-border/80 pt-3 md:mt-auto">
          <div className="min-w-0 px-2">
            <p className="text-xs font-semibold text-foreground">Vexora Studio</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Painel de controle</p>
          </div>
          <button aria-label="Sair da conta" title="Sair" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" onClick={async () => { await supabase.auth.signOut(); nav({ to: "/auth" }); }}>
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-7 xl:p-9"><div className="mx-auto w-full max-w-[1600px]"><Outlet /></div></main>
    </div>
  );
}
