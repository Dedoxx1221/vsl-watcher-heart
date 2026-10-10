import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./run-id.server";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

const INSTRUCTIONS = `Você é um especialista sênior em VSLs (video sales letters) e otimização de conversão.
Recebe métricas REAIS de retenção e conversão de uma VSL. Responda em português do Brasil, em Markdown.
Estrutura obrigatória:
## Resumo
2-3 frases com o diagnóstico principal e o maior gargalo do funil.
## Pontos de abandono
Para cada queda relevante: timestamp (mm:ss ou h:mm:ss), tamanho da queda, causa provável (hook fraco, transição, promessa repetida, ritmo lento, revelação de preço, etc.) e o que verificar naquele trecho.
## Recomendações de edição
Lista priorizada (impacto alto → baixo) de edições específicas com timestamp: o que cortar, mover, reescrever ou adicionar, e por quê.
## Oferta e checkout
Análise do trecho até a oferta, da taxa de chegada à oferta e do clique no checkout, com ações concretas (ex.: antecipar a oferta, CTA antecipado, ancoragem).
## Próximo teste
1-2 testes A/B claros com hipótese e métrica de sucesso.
Regras: baseie-se apenas nos dados fornecidos; quando a amostra for pequena (< 100 plays), avise que as conclusões são preliminares. Não invente números. Você não vê o vídeo — formule causas como hipóteses a verificar.`;

type A = {
  duration: number; bucket_size: number; views: number; unique_viewers: number; plays: number;
  reached_offer: number; clicked_checkout: number; avg_watched: number; avg_paused: number;
  retention: [number, number][]; marks: Record<string, number>; events: Record<string, number>;
};

const fmt = (s: number) => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`;
};
const pc = (n: number, d: number) => (d ? ((n / d) * 100).toFixed(1) + "%" : "0%");

function buildReport(video: { name: string; offer_time_seconds: number | null }, a: A, notes: string, filters: string) {
  const step = Math.max(1, Math.ceil(a.retention.length / 120));
  const curve = a.retention.filter((_, i) => i % step === 0).map(([t, n]) => `${fmt(t)} ${pc(n, a.plays)}`).join("\n");
  const drops: { from: number; to: number; d: number }[] = [];
  const s = a.retention.map(([t, n]) => ({ t, r: a.plays ? (n / a.plays) * 100 : 0 }));
  const w = Math.max(1, Math.round(s.length / 60));
  for (let i = w; i < s.length; i += w) drops.push({ from: s[i - w]!.t, to: s[i]!.t, d: s[i]!.r - s[i - w]!.r });
  const top = drops.filter((d) => d.d < 0).sort((x, y) => x.d - y.d).slice(0, 8)
    .map((d) => `${fmt(d.from)}→${fmt(d.to)}: ${d.d.toFixed(1)} p.p.`).join("\n");
  return `VSL: ${video.name}
Filtros: ${filters}
Duração: ${fmt(a.duration)} | Oferta aparece em: ${video.offer_time_seconds != null ? fmt(video.offer_time_seconds) : "não definida"}
Visualizações: ${a.views} (únicos ${a.unique_viewers}) | Plays: ${a.plays} (play rate ${pc(a.plays, a.views)})
Tempo médio assistido: ${fmt(a.avg_watched)} | Tempo médio pausado: ${fmt(a.avg_paused)}
Funil: play ${a.plays} → chegou à oferta ${a.reached_offer} (${pc(a.reached_offer, a.plays)}) → clique checkout ${a.clicked_checkout} (${pc(a.clicked_checkout, a.plays)}; ${pc(a.clicked_checkout, a.reached_offer)} de quem viu a oferta)
Retenção por marco: ${["10", "25", "50", "75", "100"].map((k) => `${k}%: ${pc(a.marks?.[k] ?? 0, a.plays)}`).join(" | ")}
Eventos: ${Object.entries(a.events ?? {}).map(([k, v]) => `${k}=${v}`).join(", ")}
Maiores quedas (janelas):
${top || "nenhuma"}
Curva de retenção (tempo % de quem deu play ainda assistindo — só reprodução real):
${curve}
${notes ? `\nContexto do produtor sobre o roteiro:\n${notes}` : ""}`;
}

const json = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } });

export async function handleDiagnosis(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, "Faça login novamente.");
  let body: { videoId?: string; from?: string; to?: string; campaign?: string | null; notes?: string; filters?: string };
  try { body = await request.json(); } catch { return json(400, "Requisição inválida."); }
  if (!body.videoId || !body.from || !body.to) return json(400, "Requisição inválida.");

  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const sb = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: (i, init) => { const h = new Headers(init?.headers); h.set("apikey", key); return fetch(i, { ...init, headers: h }); } },
  });
  const { data: u } = await sb.auth.getUser(token);
  if (!u.user) return json(401, "Faça login novamente.");
  const { data: video } = await sb.from("videos").select("name, offer_time_seconds").eq("id", body.videoId).maybeSingle();
  if (!video) return json(404, "VSL não encontrada.");
  const { data: a, error } = await sb.rpc("get_video_analytics", {
    _video_id: body.videoId, _from: body.from, _to: body.to, _campaign: (body.campaign ?? null) as unknown as string,
  });
  if (error || !a) return json(500, "Não foi possível carregar as métricas.");
  const analytics = a as unknown as A;
  if (!analytics.plays) return json(400, "Ainda não há plays neste período para analisar.");

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return json(500, "IA não configurada.");
  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  // Surface gateway status (402/403/429) before streaming starts.
  let upstreamError: { status: number; message: string } | null = null;
  const result = streamText({
    model: provider.responses(MODEL),
    instructions: INSTRUCTIONS,
    messages: [{ role: "user", content: buildReport(video, analytics, (body.notes ?? "").slice(0, 4000), body.filters ?? "") }],
    abortSignal: request.signal,
    maxRetries: 0,
    providerOptions: {
      openai: {
        store: false,
        forceReasoning: true,
        reasoningEffort: "medium",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    },
    onError: ({ error }) => {
      const e = error as { statusCode?: number; message?: string };
      upstreamError = { status: e.statusCode ?? 500, message: e.message ?? "Erro na IA" };
      console.error("diagnosis error", e.statusCode, e.message);
    },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let any = false;
        for await (const chunk of result.textStream) {
          any = true;
          controller.enqueue(encoder.encode(chunk));
        }
        const err = upstreamError as { status: number; message: string } | null;
        if (err) {
          const msg = err.status === 402
            ? "Créditos de IA esgotados. Adicione créditos ao workspace para continuar."
            : err.status === 429
              ? "Muitas solicitações agora. Tente novamente em instantes."
              : err.status === 403
                ? "Acesso à IA bloqueado para este workspace."
                : "A análise falhou. Tente novamente.";
          controller.enqueue(encoder.encode(`\n\n[[ERRO]] ${msg}`));
        } else if (!any) {
          controller.enqueue(encoder.encode("[[ERRO]] A IA não retornou uma análise."));
        }
        controller.close();
      } catch (e) {
        if ((e as Error)?.name === "AbortError") { controller.close(); return; }
        controller.enqueue(encoder.encode("\n\n[[ERRO]] A análise falhou. Tente novamente."));
        controller.close();
      }
    },
    cancel() { /* request.signal propagates abort */ },
  });

  return withLovableAiGatewayRunIdHeader(
    new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache, no-transform" } }),
    runIdFetch,
  );
}
