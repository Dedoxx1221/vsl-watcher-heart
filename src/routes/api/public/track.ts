import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const EVENT_TYPES = [
  "load", "play", "pause", "resume", "seek_forward", "seek_backward",
  "abandon", "cta_reached", "checkout_click", "complete",
] as const;

const schema = z.object({
  session: z.object({
    id: z.string().uuid(),
    video_id: z.string().uuid(),
    viewer_id: z.string().min(8).max(64),
    campaign: z.string().max(200).nullable().optional(),
    referrer: z.string().max(1000).nullable().optional(),
    utm_source: z.string().max(200).nullable().optional(),
    utm_medium: z.string().max(200).nullable().optional(),
    utm_campaign: z.string().max(200).nullable().optional(),
    utm_content: z.string().max(200).nullable().optional(),
    utm_term: z.string().max(200).nullable().optional(),
  }),
  stats: z.object({
    watched: z.number().min(0).max(100000),
    paused: z.number().min(0).max(1000000),
    max_position: z.number().min(0).max(100000),
    current_position: z.number().min(0).max(100000).optional().default(0),
    is_playing: z.boolean().optional().default(false),
    duration: z.number().min(0).max(100000).nullable().optional(),
  }),
  events: z.array(z.object({
    id: z.string().min(8).max(100),
    type: z.enum(EVENT_TYPES),
    position: z.number().min(0).max(100000),
    from: z.number().min(0).max(100000).nullable().optional(),
  })).max(200),
  heartbeat: z.boolean().optional().default(false),
  ranges: z.array(z.object({
    id: z.string().min(8).max(100),
    start: z.number().min(0).max(100000),
    end: z.number().min(0).max(100000),
  })).max(200),
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/track")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        let body: z.infer<typeof schema>;
        try {
          body = schema.parse(JSON.parse(await request.text()));
        } catch {
          return new Response(JSON.stringify({ error: "invalid" }), { status: 400, headers: cors });
        }
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { session, stats, events, ranges } = body;
        const ua = request.headers.get("user-agent") ?? "";
        const deviceType = /ipad|tablet|playbook|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua)) ? "Tablet" : /mobile|iphone|ipod|android.*mobile|windows phone/i.test(ua) ? "Mobile" : "Desktop";
        const browser = /edg\//i.test(ua) ? "Microsoft Edge" : /opr\//i.test(ua) || /opera/i.test(ua) ? "Opera" : /firefox\//i.test(ua) ? "Firefox" : /samsungbrowser\//i.test(ua) ? "Samsung Internet" : /chrome\//i.test(ua) && !/edg\//i.test(ua) ? "Chrome" : /safari\//i.test(ua) ? "Safari" : ua ? "Outro" : null;
        const country = request.headers.get("cf-ipcountry") ?? request.headers.get("x-vercel-ip-country") ?? null;
        const region = request.headers.get("x-vercel-ip-country-region") ?? request.headers.get("cf-region") ?? null;
        const city = request.headers.get("x-vercel-ip-city") ?? request.headers.get("cf-ipcity") ?? null;

        const { data: video } = await db
          .from("videos").select("id, duration_seconds").eq("id", session.video_id).maybeSingle();
        if (!video) return new Response(JSON.stringify({ error: "unknown video" }), { status: 404, headers: cors });

        const types = new Set(events.map((e) => e.type));
        const { data: existing } = await db.from("sessions").select("*").eq("id", session.id).maybeSingle();
        if (existing && existing.video_id !== session.video_id) {
          return new Response(JSON.stringify({ error: "mismatch" }), { status: 400, headers: cors });
        }
        const row = {
          id: session.id,
          video_id: session.video_id,
          viewer_id: existing?.viewer_id ?? session.viewer_id,
          campaign: existing?.campaign ?? session.campaign ?? null,
          referrer: existing?.referrer ?? session.referrer ?? null,
          user_agent: existing?.user_agent ?? ua.slice(0, 400) ?? null,
          country: existing?.country ?? country,
          region: existing?.region ?? region,
          city: existing?.city ?? (city ? decodeURIComponent(city.replace(/\\+/g, " ")) : null),
          device_type: existing?.device_type ?? deviceType,
          browser: existing?.browser ?? browser,
          utm_source: existing?.utm_source ?? session.utm_source ?? null,
          utm_medium: existing?.utm_medium ?? session.utm_medium ?? null,
          utm_campaign: existing?.utm_campaign ?? session.utm_campaign ?? session.campaign ?? null,
          utm_content: existing?.utm_content ?? session.utm_content ?? null,
          utm_term: existing?.utm_term ?? session.utm_term ?? null,
          current_position: stats.current_position,
          is_playing: stats.is_playing,
          last_seen_at: new Date().toISOString(),
          played: (existing?.played ?? false) || types.has("play") || stats.watched > 0,
          reached_offer: (existing?.reached_offer ?? false) || types.has("cta_reached"),
          clicked_checkout: (existing?.clicked_checkout ?? false) || types.has("checkout_click"),
          watched_seconds: Math.max(Number(existing?.watched_seconds ?? 0), stats.watched),
          paused_seconds: Math.max(Number(existing?.paused_seconds ?? 0), stats.paused),
          max_position: Math.max(Number(existing?.max_position ?? 0), stats.max_position),
        };
        const { error: sErr } = await db.from("sessions").upsert(row);
        if (sErr) {
          console.error(sErr);
          return new Response(JSON.stringify({ error: "db" }), { status: 500, headers: cors });
        }

        if (events.length) {
          await db.from("events").upsert(
            events.map((e) => ({
              client_event_id: e.id, session_id: session.id, video_id: session.video_id,
              type: e.type, position: e.position, from_position: e.from ?? null,
            })),
            { onConflict: "client_event_id", ignoreDuplicates: true },
          );
        }
        const valid = ranges.filter((r) => r.end > r.start);
        if (valid.length) {
          await db.from("watch_ranges").upsert(
            valid.map((r) => ({
              client_range_id: r.id, session_id: session.id, video_id: session.video_id,
              start_s: r.start, end_s: r.end,
            })),
            { onConflict: "client_range_id" },
          );
        }
        if (stats.duration && !video.duration_seconds) {
          await db.from("videos").update({ duration_seconds: stats.duration }).eq("id", video.id);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
      },
    },
  },
});
