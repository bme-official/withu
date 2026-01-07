export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { json, errorJson } from "@/lib/server/http";
import { rateLimitOrThrow } from "@/lib/server/rateLimit";
import { getClientIp } from "@/lib/server/request";
import { TtsSchema } from "@/lib/server/validators";
import { assertSessionToken, getSiteProfile, insertEvents } from "@/lib/server/db";
import { corsHeaders } from "@/lib/server/cors";
import { getOpenAI, getTtsModel, getTtsVoice, type OpenAiTtsVoice } from "@/lib/server/openai";

type OpenAiTtsModel = "tts-1" | "tts-1-hd";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const cors = corsHeaders(req);
  try {
    rateLimitOrThrow(`tts:${ip}`, 60, 60_000);

    const body = await req.json().catch(() => null);
    const parsed = TtsSchema.safeParse(body);
    if (!parsed.success) return errorJson(400, "invalid_body");

    const { sessionId, sessionToken, text } = parsed.data;
    const auth = await assertSessionToken(sessionId, sessionToken);
    rateLimitOrThrow(`tts_session:${sessionId}`, 40, 60_000);

    let model: OpenAiTtsModel = getTtsModel() as OpenAiTtsModel;
    let voice: OpenAiTtsVoice = getTtsVoice();
    let voiceSource: "env" | "site_profile" = "env";
    // Optional per-site override via site_profiles.tts_voice_hint (e.g. "voice=shimmer, model=tts-1")
    try {
      if (auth.siteId) {
        const prof = await getSiteProfile(auth.siteId);
        const hint = (prof?.tts_voice_hint ?? "").trim().toLowerCase();
        const voiceMatch = hint.match(/voice\s*[:=]\s*([a-z]+)/i);
        const modelMatch = hint.match(/model\s*[:=]\s*(tts-1-hd|tts-1)/i);
        const voiceCandidate = (voiceMatch?.[1] ?? hint).trim().toLowerCase();
        const modelCandidate = (modelMatch?.[1] ?? "").trim().toLowerCase();

        if (modelCandidate && (modelCandidate === "tts-1" || modelCandidate === "tts-1-hd")) {
          model = modelCandidate as OpenAiTtsModel;
          voiceSource = "site_profile";
        }
        if (["alloy", "echo", "fable", "onyx", "nova", "shimmer"].includes(voiceCandidate)) {
          voice = voiceCandidate as OpenAiTtsVoice;
          voiceSource = "site_profile";
        }
      }
    } catch {
      // ignore: keep env voice
    }
    // Latency tuning: keep TTS input reasonably short.
    const input = String(text || "").slice(0, 900);
    if (!input.trim()) return errorJson(400, "empty_text");

    const t0 = performance.now();
    const speech = await getOpenAI().audio.speech.create({
      model,
      voice,
      input,
      response_format: "mp3",
    });
    const buf = Buffer.from(await (speech as any).arrayBuffer());
    const ttsMs = Math.round(performance.now() - t0);

    await insertEvents(sessionId, [
      { type: "tts_done", meta: { mode: "server_openai", model, voice, voiceSource, ttsMs, bytes: buf.length } },
    ]);

    return new Response(buf, {
      status: 200,
      headers: {
        ...cors,
        "content-type": "audio/mpeg",
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    // @ts-expect-error: from rateLimitOrThrow
    const status = e?.status ?? 500;
    if (status === 429) return json({ ok: false, error: "rate_limited" }, { status: 429, headers: cors });
    return json(
      { ok: false, error: "internal_error", message: e instanceof Error ? e.message : String(e) },
      { status: 500, headers: cors },
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}


