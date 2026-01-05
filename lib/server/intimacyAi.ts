import "server-only";

import { z } from "zod";
import { getOpenAI, getIntimacyModel } from "./openai";

const VerdictSchema = z.object({
  delta: z.number().int().min(-20).max(20),
  confidence: z.number().min(0).max(1).optional(),
  reasons: z.array(z.string().min(1)).max(8).optional(),
});

function extractFirstJsonObject(text: string): unknown {
  // Best-effort extraction for models that might wrap JSON in text.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function judgeIntimacyDelta(input: {
  userText: string;
  inputMode?: "voice" | "text";
  prevLevel: number;
  prevXp: number;
}): Promise<{ delta: number; confidence: number; reasons: string[] }> {
  const model = getIntimacyModel();

  const system = `
あなたは「親密度の増減」を採点する小さな判定器です。
ユーザー発話の内容に応じて、親密度XPの増減deltaを-20〜+20で返します（マイナス=後退）。
出力はJSONのみ。

基準（例）:
- 失礼/攻撃/ハラスメント/境界侵害 → 大きくマイナス
- 冷たい/一方的/塩対応 → 小さくマイナス〜0
- 普通の会話 → 0〜+6
- 感謝/礼儀/自己開示/共感 → +4〜+12
- 深い自己開示/継続的な丁寧さ（ただし安全） → +8〜+16

注意:
- 個人情報の要求や危険行為の依頼は「信頼を損なう」扱いでマイナス
- 判定は短く保守的に
`.trim();

  const user = JSON.stringify(
    {
      prev: { level: input.prevLevel, xp: input.prevXp },
      inputMode: input.inputMode ?? null,
      userText: input.userText,
      outputSchema: { delta: "int(-20..20)", confidence: "0..1", reasons: "string[]" },
    },
    null,
    2,
  );

  const resp = await getOpenAI().chat.completions.create({
    model,
    temperature: 0,
    max_tokens: 120,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const content = (resp.choices?.[0]?.message?.content ?? "").trim();
  const parsed = VerdictSchema.safeParse(extractFirstJsonObject(content));
  if (!parsed.success) {
    throw new Error("intimacy_ai_invalid_json");
  }

  return {
    delta: parsed.data.delta,
    confidence: parsed.data.confidence ?? 0.5,
    reasons: parsed.data.reasons ?? [],
  };
}


