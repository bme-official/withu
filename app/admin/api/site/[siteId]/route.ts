export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminSession } from "@/lib/server/adminAuth";
import { upsertSiteProfile } from "@/lib/server/db";

function parseJsonOrThrow(raw: string, field: string): unknown {
  const t = raw.trim();
  if (!t) return {};
  try {
    return JSON.parse(t);
  } catch {
    throw new Error(`invalid_json_${field}`);
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ siteId: string }> }) {
  const ok = verifyAdminSession(await cookies());
  if (!ok) return Response.redirect(new URL("/admin/login?error=not_authenticated", req.url), 303);

  const { siteId } = await ctx.params;
  const fd = await req.formData();

  const displayName = String(fd.get("displayName") || "").trim();
  const avatarUrlRaw = String(fd.get("avatarUrl") || "").trim();
  const avatarUrl = avatarUrlRaw ? avatarUrlRaw : null;
  const personaPrompt = String(fd.get("personaPrompt") || "");
  const ttsVoiceHintRaw = String(fd.get("ttsVoiceHint") || "").trim();
  const ttsVoiceHint = ttsVoiceHintRaw ? ttsVoiceHintRaw : null;
  const ttsProviderRaw = String(fd.get("ttsProvider") || "").trim().toLowerCase();
  const ttsProvider = ttsProviderRaw === "elevenlabs" ? "elevenlabs" : ttsProviderRaw === "openai" ? "openai" : null;
  const elevenVoiceIdRaw = String(fd.get("elevenVoiceId") || "").trim();
  const elevenVoiceId = elevenVoiceIdRaw ? elevenVoiceIdRaw : null;
  const elevenModelIdRaw = String(fd.get("elevenModelId") || "").trim();
  const elevenModelId = elevenModelIdRaw ? elevenModelIdRaw : null;

  try {
    const greetingTemplates = parseJsonOrThrow(String(fd.get("greetingTemplates") || ""), "greetingTemplates");
    const chatConfig = parseJsonOrThrow(String(fd.get("chatConfig") || ""), "chatConfig");
    const ctaConfig = parseJsonOrThrow(String(fd.get("ctaConfig") || ""), "ctaConfig");

    await upsertSiteProfile({
      siteId,
      displayName,
      avatarUrl,
      personaPrompt,
      ttsVoiceHint,
      ttsProvider,
      elevenVoiceId,
      elevenModelId,
      greetingTemplates,
      chatConfig,
      ctaConfig,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "save_failed";
    return Response.redirect(new URL(`/admin/site/${encodeURIComponent(siteId)}?error=${encodeURIComponent(msg)}`, req.url), 303);
  }

  return Response.redirect(new URL(`/admin/site/${encodeURIComponent(siteId)}?saved=1`, req.url), 303);
}


