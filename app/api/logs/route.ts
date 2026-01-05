export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { json, errorJson } from "@/lib/server/http";
import { rateLimitOrThrow } from "@/lib/server/rateLimit";
import { getClientIp } from "@/lib/server/request";
import { LogsSchema } from "@/lib/server/validators";
import { assertSessionToken, insertEvents } from "@/lib/server/db";
import { corsHeaders } from "@/lib/server/cors";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const cors = corsHeaders(req);
  try {
    rateLimitOrThrow(`logs:${ip}`, 120, 60_000);

    const body = await req.json().catch(() => null);
    const parsed = LogsSchema.safeParse(body);
    if (!parsed.success) return errorJson(400, "invalid_body");

    const { sessionId, sessionToken, events } = parsed.data;
    await assertSessionToken(sessionId, sessionToken);
    await insertEvents(
      sessionId,
      events.map((e) => ({ type: e.type, meta: e.meta ?? null })),
    );

    return json({ ok: true }, { status: 200, headers: cors });
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


