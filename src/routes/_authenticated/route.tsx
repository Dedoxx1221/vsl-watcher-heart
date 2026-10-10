import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { BarChart3, Film, LogOut, Sparkles } from "lucide-react";
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
  const item = "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground";
  const active = { className: "bg-accent text-foreground" };
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-sidebar-border bg-sidebar p-4 md:sticky md:top-0 md:h-screen md:w-56 md:border-b-0 md:border-r">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="h-3 w-3 rounded-full bg-primary" />
          <span className="font-display text-lg font-bold">Retina</span>
        </div>
        <nav className="flex gap-1 md:flex-col">
          <Link to="/dashboard" className={item} activeProps={active}><BarChart3 className="h-4 w-4" />Analytics</Link>
          <Link to="/ai" className={item} activeProps={active}><Sparkles className="h-4 w-4" />Diagnóstico IA</Link>
          <Link to="/videos" className={item} activeProps={active}><Film className="h-4 w-4" />Biblioteca</Link>
          <button className={item + " md:mt-auto"} onClick={async () => { await supabase.auth.signOut(); nav({ to: "/auth" }); }}>
            <LogOut className="h-4 w-4" />Sair
          </button>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8"><Outlet /></main>
    </div>
  );
}
