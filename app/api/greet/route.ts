export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { json, errorJson } from "@/lib/server/http";
import { rateLimitOrThrow } from "@/lib/server/rateLimit";
import { getClientIp } from "@/lib/server/request";
import { assertSessionToken, getSiteProfile, getUserIntimacy, insertEvents } from "@/lib/server/db";
import { corsHeaders } from "@/lib/server/cors";
import { z } from "zod";

const BodySchema = z.object({
  sessionId: z.string().uuid(),
  sessionToken: z.string().min(16).max(200),
  reason: z.string().min(1).max(60).optional(),
});

function stripEmojis(text: string): string {
  try {
    return text.replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "").replace(/\s{2,}/g, " ").trim();
  } catch {
    return text.replace(/[\u2600-\u27BF]/g, "").replace(/\s{2,}/g, " ").trim();
  }
}

function pickFromTemplates(templates: any, level: number): string | null {
  const lv = String(Math.max(1, Math.min(5, Math.round(level))));
  // Accept either {"1":[...], "2":[...]} or {"levels":{"1":[...]}} shapes
  const obj = templates?.levels && typeof templates.levels === "object" ? templates.levels : templates;
  const arr = obj?.[lv];
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const cand = arr[Math.floor(Math.random() * arr.length)];
  if (typeof cand !== "string") return null;
  const t = stripEmojis(cand).slice(0, 280);
  return t || null;
}

function fallbackGreeting(level: number): string {
  const lv = Math.max(1, Math.min(5, Math.round(level)));
  const byLv: Record<number, string[]> = {
    1: ["Hi, I'm Mirai Aizawa. Want to chat for a minute?", "Hey, it's Mirai. What would you like to talk about today?"],
    2: ["Hi again. I'm Mirai. How's your day going so far?", "Welcome back. What are you up to right now?"],
    3: ["Hey. It's good to see you again. What kind of mood are you in today?", "Hi. I'm happy you're here. What are you thinking about?"],
    4: ["Hi. I missed talking with you. How are you, honestly?", "Hey. I'm here with you. What do you need right now?"],
    5: ["Hey. I'm really happy you're here. Tell me how you're feeling today.", "Hi. Let's talk. What do you want to share first?"],
  };
  const arr = byLv[lv] ?? byLv[1];
  const picked = arr[Math.floor(Math.random() * arr.length)] ?? arr[0]!;
  return stripEmojis(picked);
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const cors = corsHeaders(req);
  try {
    rateLimitOrThrow(`greet:${ip}`, 80, 60_000);

    const body = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return errorJson(400, "invalid_body", { headers: cors });

    const { sessionId, sessionToken, reason } = parsed.data;
    const { siteId, userId } = await assertSessionToken(sessionId, sessionToken);
    const intimacy = userId ? await getUserIntimacy(userId).catch(() => ({ level: 1, xp: 0 })) : { level: 1, xp: 0 };

    const prof = siteId ? await getSiteProfile(siteId).catch(() => null) : null;
    const tpl = (prof as any)?.greeting_templates ?? null;

    const greeting = pickFromTemplates(tpl, intimacy.level) ?? fallbackGreeting(intimacy.level);

    await insertEvents(sessionId, [
      {
        type: "greet",
        meta: { siteId, userId, intimacyLevel: intimacy.level, reason: reason ?? null, source: pickFromTemplates(tpl, intimacy.level) ? "site" : "fallback" },
      },
    ]);

    return json({ ok: true, greeting }, { status: 200, headers: cors });
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


