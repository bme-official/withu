export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { json, errorJson } from "@/lib/server/http";
import { rateLimitOrThrow } from "@/lib/server/rateLimit";
import { getClientIp } from "@/lib/server/request";
import { LogsSchema } from "@/lib/server/validators";
import { insertEvents } from "@/lib/server/db";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  try {
    rateLimitOrThrow(`logs:${ip}`, 120, 60_000);

    const body = await req.json().catch(() => null);
    const parsed = LogsSchema.safeParse(body);
    if (!parsed.success) return errorJson(400, "invalid_body");

    const { sessionId, events } = parsed.data;
    await insertEvents(
      sessionId,
      events.map((e) => ({ type: e.type, meta: e.meta ?? null })),
    );

    return json({ ok: true });
  } catch (e) {
    // @ts-expect-error: from rateLimitOrThrow
    const status = e?.status ?? 500;
    if (status === 429) return errorJson(429, "rate_limited");
    return errorJson(500, "internal_error", { message: e instanceof Error ? e.message : String(e) });
  }
}


