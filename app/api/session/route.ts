export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { json, errorJson } from "@/lib/server/http";
import { rateLimitOrThrow } from "@/lib/server/rateLimit";
import { getClientIp, getUserAgent } from "@/lib/server/request";
import { SessionCreateSchema } from "@/lib/server/validators";
import { createSessionRowV2, createSessionToken, getUserIntimacy, insertEvents, upsertUser } from "@/lib/server/db";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { corsHeaders } from "@/lib/server/cors";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const cors = corsHeaders(req);
  try {
    rateLimitOrThrow(`session:${ip}`, 30, 60_000);

    const body = await req.json().catch(() => null);
    const parsed = SessionCreateSchema.safeParse(body);
    if (!parsed.success) return errorJson(400, "invalid_body");

    const { siteId, userId: maybeUserId } = parsed.data;
    const userAgent = getUserAgent(req);
    const { userId } = await upsertUser({ userId: maybeUserId, siteId });
    const intimacy = await getUserIntimacy(userId).catch(() => ({ level: 1, xp: 0 }));
    const { token: sessionToken, tokenHash } = createSessionToken();
    const row = await createSessionRowV2({ siteId, userId, userAgent, ip, tokenHash });

    // Ensure site profile row exists (used for avatar/name/persona management).
    // This does NOT overwrite existing values.
    try {
      const supabaseAdmin = getSupabaseAdmin();
      await supabaseAdmin.from("site_profiles").upsert(
        {
          site_id: siteId,
          display_name: "Mirai Aizawa",
          avatar_url: null,
          persona_prompt: "",
          tts_voice_hint: null,
        },
        { onConflict: "site_id", ignoreDuplicates: true },
      );
    } catch {
      // ignore: should not block session creation
    }

    await insertEvents(row.sessionId, [{ type: "session_create", meta: { siteId, userId } }]);

    return json({ ok: true, sessionId: row.sessionId, sessionToken, userId, intimacy }, { status: 200, headers: cors });
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


