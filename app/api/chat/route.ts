export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { json, errorJson } from "@/lib/server/http";
import { rateLimitOrThrow } from "@/lib/server/rateLimit";
import { getClientIp } from "@/lib/server/request";
import { ChatSchema } from "@/lib/server/validators";
import { insertEvents, insertMessage, listRecentMessages } from "@/lib/server/db";
import { getOpenAI, getChatModel } from "@/lib/server/openai";
import { SYSTEM_PROMPT } from "@/lib/server/systemPrompt";

function msSince(t0: number) {
  return Math.round(performance.now() - t0);
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  try {
    rateLimitOrThrow(`chat:${ip}`, 60, 60_000);

    const body = await req.json().catch(() => null);
    const parsed = ChatSchema.safeParse(body);
    if (!parsed.success) return errorJson(400, "invalid_body");

    const { sessionId, userText } = parsed.data;
    rateLimitOrThrow(`chat_session:${sessionId}`, 30, 60_000);

    await insertMessage({ sessionId, role: "user", content: userText });

    const history = await listRecentMessages(sessionId, 30);
    const model = getChatModel();
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    const t0 = performance.now();
    const resp = await getOpenAI().chat.completions.create({
      model,
      messages,
      temperature: 0.2,
    });
    const assistantText = (resp.choices?.[0]?.message?.content ?? "").trim();
    const llmMs = msSince(t0);

    await insertEvents(sessionId, [{ type: "llm_done", meta: { llmMs, model } }]);

    if (!assistantText) return errorJson(502, "llm_empty");
    await insertMessage({ sessionId, role: "assistant", content: assistantText });

    return json({ ok: true, assistantText });
  } catch (e) {
    // @ts-expect-error: from rateLimitOrThrow
    const status = e?.status ?? 500;
    if (status === 429) return errorJson(429, "rate_limited");
    return errorJson(500, "internal_error", { message: e instanceof Error ? e.message : String(e) });
  }
}


