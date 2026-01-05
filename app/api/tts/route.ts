export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { json, errorJson } from "@/lib/server/http";
import { rateLimitOrThrow } from "@/lib/server/rateLimit";
import { getClientIp } from "@/lib/server/request";
import { TtsSchema } from "@/lib/server/validators";
import { assertSessionToken, insertEvents } from "@/lib/server/db";
import { corsHeaders } from "@/lib/server/cors";
import { getOpenAI, getTtsModel } from "@/lib/server/openai";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const cors = corsHeaders(req);
  try {
    rateLimitOrThrow(`tts:${ip}`, 60, 60_000);

    const body = await req.json().catch(() => null);
    const parsed = TtsSchema.safeParse(body);
    if (!parsed.success) return errorJson(400, "invalid_body");

    const { sessionId, sessionToken, text } = parsed.data;
    await assertSessionToken(sessionId, sessionToken);
    rateLimitOrThrow(`tts_session:${sessionId}`, 40, 60_000);

    const model = getTtsModel();
    const voice = "alloy";
    const input = String(text || "").slice(0, 2000);
    if (!input.trim()) return errorJson(400, "empty_text");

    const t0 = performance.now();
    const speech = await getOpenAI().audio.speech.create({
      model,
      voice,
      input,
      format: "mp3",
    } as any);
    const buf = Buffer.from(await (speech as any).arrayBuffer());
    const ttsMs = Math.round(performance.now() - t0);

    await insertEvents(sessionId, [{ type: "tts_done", meta: { mode: "server_openai", model, voice, ttsMs, bytes: buf.length } }]);

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


