export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { json, errorJson } from "@/lib/server/http";
import { rateLimitOrThrow } from "@/lib/server/rateLimit";
import { getClientIp, getUserAgent } from "@/lib/server/request";
import { SessionCreateSchema } from "@/lib/server/validators";
import { createSessionRow, insertEvents } from "@/lib/server/db";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  try {
    rateLimitOrThrow(`session:${ip}`, 30, 60_000);

    const body = await req.json().catch(() => null);
    const parsed = SessionCreateSchema.safeParse(body);
    if (!parsed.success) return errorJson(400, "invalid_body");

    const { siteId } = parsed.data;
    const userAgent = getUserAgent(req);
    const row = await createSessionRow({ siteId, userAgent, ip });
    await insertEvents(row.id, [{ type: "session_create", meta: { siteId } }]);

    return json({ ok: true, sessionId: row.id });
  } catch (e) {
    // @ts-expect-error: from rateLimitOrThrow
    const status = e?.status ?? 500;
    if (status === 429) return errorJson(429, "rate_limited");
    return errorJson(500, "internal_error", { message: e instanceof Error ? e.message : String(e) });
  }
}


