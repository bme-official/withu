export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { json, errorJson } from "@/lib/server/http";
import { rateLimitOrThrow } from "@/lib/server/rateLimit";
import { getClientIp } from "@/lib/server/request";
import { z } from "zod";
import { getSiteProfile } from "@/lib/server/db";
import { corsHeaders } from "@/lib/server/cors";

const QuerySchema = z.object({
  siteId: z.string().min(1).max(100),
});

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const cors = corsHeaders(req);
  try {
    rateLimitOrThrow(`config:${ip}`, 120, 60_000);

    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({ siteId: url.searchParams.get("siteId") || "" });
    if (!parsed.success) return errorJson(400, "invalid_siteId");

    const { siteId } = parsed.data;
    const prof = await getSiteProfile(siteId);

    // Return only safe UI config (persona_prompt stays server-only)
    return json(
      {
      ok: true,
      siteId,
      displayName: prof?.display_name ?? "Mirai Aizawa",
      avatarUrl: prof?.avatar_url ?? null,
      ttsVoiceHint: prof?.tts_voice_hint ?? null,
      },
      { status: 200, headers: cors },
    );
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


