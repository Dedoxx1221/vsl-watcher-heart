import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Activity, ArrowRight, BarChart3, Check, Eye, EyeOff, LockKeyhole, Mail, Play, ShieldCheck, Sparkles, TrendingDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Vexora" },
      { name: "description", content: "Acesse seu painel de analytics de VSL." },
      { property: "og:title", content: "Entrar — Vexora" },
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
  const [showPassword, setShowPassword] = useState(false);
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
    <main className="relative isolate flex min-h-screen overflow-hidden bg-[#080b12] text-white selection:bg-cyan-300/30">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-cyan-500/[0.11] blur-[130px]" />
        <div className="absolute -bottom-48 right-[-5rem] h-[36rem] w-[36rem] rounded-full bg-blue-600/[0.13] blur-[140px]" />
        <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "linear-gradient(rgba(148,163,184,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.16) 1px, transparent 1px)", backgroundSize: "52px 52px", maskImage: "linear-gradient(to bottom, black, transparent 88%)" }} />
      </div>

      <section className="hidden w-1/2 flex-col justify-between border-r border-white/[0.08] px-12 py-10 lg:flex xl:px-20">
        <a href="/auth" className="flex w-fit items-center gap-3" aria-label="Vexora início">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-300 shadow-[0_0_28px_rgba(34,211,238,.12)]">
            <Activity size={22} strokeWidth={2.4} />
          </span>
          <span className="text-2xl font-bold tracking-[-0.06em]">vexora<span className="text-cyan-300">.</span></span>
        </a>

        <div className="max-w-xl py-12">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-1.5 text-xs font-medium tracking-wide text-cyan-200">
            <Sparkles size={14} /> INTELIGÊNCIA PARA SUAS VSLs
          </div>
          <h1 className="max-w-lg text-5xl font-semibold leading-[1.08] tracking-[-0.055em] xl:text-6xl">
            Entenda onde sua VSL <span className="bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">ganha ou perde</span> vendas.
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-slate-400">
            Transforme dados de visualização em decisões. Encontre quedas de retenção, acompanhe o engajamento e otimize cada segundo do seu vídeo.
          </p>

          <div className="mt-10 grid max-w-lg grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/[0.09] bg-white/[0.035] p-4 backdrop-blur-sm">
              <div className="mb-5 flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-300/10 text-cyan-300"><TrendingDown size={18} /></div>
              <p className="text-sm font-semibold">Retenção em detalhe</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Descubra os pontos de abandono da sua VSL.</p>
            </div>
            <div className="rounded-2xl border border-white/[0.09] bg-white/[0.035] p-4 backdrop-blur-sm">
              <div className="mb-5 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-400/10 text-blue-300"><BarChart3 size={18} /></div>
              <p className="text-sm font-semibold">Decisões com dados</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Veja o desempenho e aja com mais precisão.</p>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-3 text-sm text-slate-400">
            <span className="flex -space-x-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#080b12] bg-slate-700 text-[10px] font-bold">V</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#080b12] bg-cyan-900 text-cyan-200"><Play size={12} fill="currentColor" /></span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#080b12] bg-blue-900 text-blue-200"><Check size={14} /></span>
            </span>
            Feito para quem leva conversão a sério.
          </div>
        </div>

        <p className="text-xs text-slate-600">© {new Date().getFullYear()} Vexora. Analytics que fazem sentido.</p>
      </section>

      <section className="flex min-h-screen w-full items-center justify-center px-5 py-10 sm:px-8 lg:w-1/2 lg:px-12">
        <div className="w-full max-w-[420px]">
          <a href="/auth" className="mb-10 flex w-fit items-center gap-2.5 lg:hidden" aria-label="Vexora início">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-300"><Activity size={20} strokeWidth={2.4} /></span>
            <span className="text-xl font-bold tracking-[-0.06em]">vexora<span className="text-cyan-300">.</span></span>
          </a>

          <div className="mb-8">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-cyan-300">
              <LockKeyhole size={22} />
            </div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">{mode === "in" ? "BEM-VINDO DE VOLTA" : "COMECE AGORA"}</p>
            <h2 className="text-3xl font-semibold tracking-[-0.04em]">{mode === "in" ? "Acesse sua conta" : "Crie sua conta"}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{mode === "in" ? "Entre para continuar analisando seus resultados." : "Configure seu acesso e comece a entender suas métricas."}</p>
          </div>

          <div className="rounded-2xl border border-white/[0.10] bg-[#101520]/90 p-5 shadow-[0_24px_80px_rgba(0,0,0,.28)] backdrop-blur-xl sm:p-7">
            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="auth-email" className="text-sm font-medium text-slate-200">E-mail</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-slate-500" />
                  <Input id="auth-email" type="email" autoComplete="email" placeholder="voce@empresa.com" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 border-white/[0.10] bg-[#090d15] pl-10 text-white placeholder:text-slate-600 focus-visible:border-cyan-300/60 focus-visible:ring-cyan-300/20" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="auth-password" className="text-sm font-medium text-slate-200">Senha</label>
                  {mode === "in" && <button type="button" onClick={() => toast.info("Entre em contato com o suporte para recuperar sua senha.")} className="text-xs text-cyan-300 transition hover:text-cyan-200">Esqueceu a senha?</button>}
                </div>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-slate-500" />
                  <Input id="auth-password" type={showPassword ? "text" : "password"} autoComplete={mode === "in" ? "current-password" : "new-password"} placeholder="Mínimo de 6 caracteres" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 border-white/[0.10] bg-[#090d15] pl-10 pr-11 text-white placeholder:text-slate-600 focus-visible:border-cyan-300/60 focus-visible:ring-cyan-300/20" />
                  <button type="button" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-200">
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
              <Button type="submit" disabled={busy} className="group h-12 w-full rounded-lg bg-cyan-300 font-semibold text-slate-950 shadow-[0_6px_24px_rgba(34,211,238,.12)] transition hover:bg-cyan-200 disabled:opacity-60">
                {busy ? "Aguarde..." : mode === "in" ? "Entrar na Vexora" : "Criar minha conta"}
                {!busy && <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
              </Button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-white/[0.09]" />
              <span className="text-[11px] uppercase tracking-[0.14em] text-slate-600">ou continue com</span>
              <span className="h-px flex-1 bg-white/[0.09]" />
            </div>
            <Button type="button" variant="outline" className="h-11 w-full border-white/[0.12] bg-white/[0.025] text-slate-200 hover:bg-white/[0.07] hover:text-white" onClick={google}>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="mr-2 h-[18px] w-[18px]"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.09-1.92 3.27-4.75 3.27-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.28-1.93-6.15-4.53H2.16v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.85 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.16a11 11 0 0 0 0 9.9l3.69-2.84Z"/><path fill="#EA4335" d="M12 4.36c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.09 14.97 0 12 0a11 11 0 0 0-9.84 7.05l3.69 2.84c.87-2.6 3.29-5.53 6.15-5.53Z"/></svg>
              Continuar com Google
            </Button>

            <p className="mt-6 text-center text-sm text-slate-400">
              {mode === "in" ? "Ainda não tem uma conta?" : "Já tem uma conta?"}{" "}
              <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="font-semibold text-cyan-300 transition hover:text-cyan-200">
                {mode === "in" ? "Criar conta" : "Fazer login"}
              </button>
            </p>
          </div>

          <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-slate-600">
            <ShieldCheck size={14} className="text-slate-500" /> Seu acesso é protegido e seus dados permanecem privados.
          </p>
          <p className="mt-8 text-center text-[11px] text-slate-700 lg:hidden">© {new Date().getFullYear()} Vexora</p>
        </div>
      </section>
    </main>
  );
}
