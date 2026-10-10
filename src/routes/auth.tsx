import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Retina" },
      { name: "description", content: "Acesse seu painel de analytics de VSL." },
      { property: "og:title", content: "Entrar — Retina" },
      { property: "og:description", content: "Acesse seu painel de analytics de VSL." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) nav({ to: "/dashboard" }); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { if (s) nav({ to: "/dashboard" }); });
    return () => data.subscription.unsubscribe();
  }, [nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = mode === "in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + "/dashboard" } });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (mode === "up") toast.success("Confira seu e-mail para confirmar a conta.");
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) toast.error("Não foi possível entrar com Google.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel w-full max-w-sm p-8">
        <div className="mb-6 flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-primary" />
          <span className="font-display text-xl font-bold">Retina</span>
        </div>
        <h1 className="text-2xl font-semibold">{mode === "in" ? "Entrar" : "Criar conta"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Analytics de retenção para VSLs.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Senha</Label><Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <Button className="w-full" disabled={busy}>{mode === "in" ? "Entrar" : "Criar conta"}</Button>
        </form>
        <Button variant="secondary" className="mt-3 w-full" onClick={google}>Continuar com Google</Button>
        <button className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Não tem conta? Criar conta" : "Já tem conta? Entrar"}
        </button>
      </div>
    </div>
  );
}
