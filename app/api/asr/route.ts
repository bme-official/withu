export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { json, errorJson } from "@/lib/server/http";
import { rateLimitOrThrow } from "@/lib/server/rateLimit";
import { getClientIp } from "@/lib/server/request";
import { assertSessionToken, insertEvents } from "@/lib/server/db";
import { getOpenAI } from "@/lib/server/openai";
import { toFile } from "openai/uploads";

function msSince(t0: number) {
  return Math.round(performance.now() - t0);
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  try {
    rateLimitOrThrow(`asr:${ip}`, 40, 60_000);

    const fd = await req.formData();
    const sessionId = String(fd.get("sessionId") || "");
    const sessionToken = String(fd.get("sessionToken") || "");
    const audio = fd.get("audio");

    if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) return errorJson(400, "invalid_sessionId");
    if (!sessionToken || sessionToken.length < 16) return errorJson(400, "invalid_sessionToken");
    if (!(audio instanceof File)) return errorJson(400, "missing_audio");

    // very rough DoS protection
    if (audio.size > 15 * 1024 * 1024) return errorJson(413, "file_too_large");

    rateLimitOrThrow(`asr_session:${sessionId}`, 25, 60_000);
    await assertSessionToken(sessionId, sessionToken);

    const buf = Buffer.from(await audio.arrayBuffer());
    const file = await toFile(buf, audio.name || "audio.webm", { type: audio.type || "audio/webm" });

    const t0 = performance.now();
    const tr = await getOpenAI().audio.transcriptions.create({
      model: "whisper-1",
      file,
    });
    const asrMs = msSince(t0);

    const text = (tr.text || "").trim();
    await insertEvents(sessionId, [{ type: "asr_done", meta: { asrMs } }]);

    return json({ ok: true, text });
  } catch (e) {
    // @ts-expect-error: from rateLimitOrThrow
    const status = e?.status ?? 500;
    if (status === 429) return errorJson(429, "rate_limited");
    return errorJson(500, "internal_error", { message: e instanceof Error ? e.message : String(e) });
  }
}


