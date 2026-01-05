export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { json, errorJson } from "@/lib/server/http";
import { rateLimitOrThrow } from "@/lib/server/rateLimit";
import { getClientIp } from "@/lib/server/request";
import { TtsSchema } from "@/lib/server/validators";
import { assertSessionToken, insertEvents } from "@/lib/server/db";
import { corsHeaders } from "@/lib/server/cors";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const cors = corsHeaders(req);
  try {
    rateLimitOrThrow(`tts:${ip}`, 60, 60_000);

    const body = await req.json().catch(() => null);
    const parsed = TtsSchema.safeParse(body);
    if (!parsed.success) return errorJson(400, "invalid_body");

    const { sessionId, sessionToken } = parsed.data;
    await assertSessionToken(sessionId, sessionToken);
    await insertEvents(sessionId, [{ type: "tts_mode", meta: { mode: "client_web_speech" } }]);

    // Future extension: return audio url/binary here
    return json({ ok: true, mode: "client_web_speech" }, { status: 200, headers: cors });
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


