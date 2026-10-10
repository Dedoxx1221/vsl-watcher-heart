import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { BarChart3, Film, LogOut, Sparkles, SlidersHorizontal, CirclePlay, ArrowUpRight } from "lucide-react";
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
  const active = { className: "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_oklch(0.79_0.17_150_/_16%)]" };
  return (
    <div className="min-h-screen md:flex">
      <aside className="z-20 border-b border-sidebar-border/80 bg-sidebar/95 p-4 backdrop-blur-xl md:sticky md:top-0 md:flex md:h-screen md:w-[248px] md:shrink-0 md:flex-col md:border-b-0 md:border-r">
        <Link preload="intent" to="/videos" className="mb-5 flex items-center gap-3 rounded-2xl px-2 py-3 transition-opacity hover:opacity-80">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/15">
            <CirclePlay className="h-6 w-6" strokeWidth={2.3} />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-xl font-bold tracking-tight text-foreground">Vexora</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Video intelligence</span>
          </span>
        </Link>

        <div className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">Workspace</div>
        <nav className="flex gap-1.5 overflow-x-auto pb-1 md:flex-col md:overflow-visible">
          <Link preload="intent" to="/videos" className={item} activeProps={active}><Film className="h-[18px] w-[18px] shrink-0" />Biblioteca</Link>
          <Link preload="intent" to="/dashboard" className={item} activeProps={active}><BarChart3 className="h-[18px] w-[18px] shrink-0" />Analytics</Link>
          <Link preload="intent" to="/ai" className={item} activeProps={active}><Sparkles className="h-[18px] w-[18px] shrink-0" />Diagnóstico IA</Link>
          <Link preload="intent" to="/editor" className={item} activeProps={active}><SlidersHorizontal className="h-[18px] w-[18px] shrink-0" />Editor do player</Link>
        </nav>

        <div className="mt-5 hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-primary/[0.04] to-transparent p-4 md:block">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sparkles className="h-4 w-4" /></div>
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
