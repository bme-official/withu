import "server-only";

import { getSupabaseAdmin } from "./supabaseAdmin";
import crypto from "node:crypto";

export type MessageRow = {
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

export type SiteProfileRow = {
  site_id: string;
  display_name: string;
  avatar_url: string | null;
  persona_prompt: string;
  tts_voice_hint: string | null;
};

export async function createSessionRow(input: { siteId: string; userAgent: string; ip: string }) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .insert({ site_id: input.siteId, user_agent: input.userAgent, ip: input.ip })
    .select("id")
    .single();
  if (error) throw new Error(`supabase sessions insert: ${error.message}`);
  return data as { id: string };
}

export function createSessionToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function upsertUser(input: { userId?: string; siteId: string }): Promise<{ userId: string }> {
  const supabaseAdmin = getSupabaseAdmin();
  const userId = input.userId ?? crypto.randomUUID();
  // Upsert lets us accept client-generated UUIDs safely (anonymous id).
  const { error } = await supabaseAdmin.from("users").upsert(
    {
      id: userId,
      site_id: input.siteId,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`supabase users upsert: ${error.message}`);
  return { userId };
}

export async function createSessionRowV2(input: {
  siteId: string;
  userId: string;
  userAgent: string;
  ip: string;
  tokenHash: string;
}): Promise<{ sessionId: string }> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .insert({
      site_id: input.siteId,
      user_id: input.userId,
      user_agent: input.userAgent,
      ip: input.ip,
      token_hash: input.tokenHash,
    })
    .select("id")
    .single();
  if (error) throw new Error(`supabase sessions insert(v2): ${error.message}`);
  return { sessionId: String(data?.id) };
}

export async function getSessionAuth(sessionId: string): Promise<{ siteId: string; userId: string | null; tokenHash: string | null }> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .select("site_id,user_id,token_hash")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(`supabase sessions select(auth): ${error.message}`);
  return {
    siteId: (data?.site_id as string | undefined) ?? "unknown",
    userId: (data?.user_id as string | undefined) ?? null,
    tokenHash: (data?.token_hash as string | undefined) ?? null,
  };
}

export async function assertSessionToken(sessionId: string, sessionToken: string): Promise<{ siteId: string; userId: string | null }> {
  const auth = await getSessionAuth(sessionId);
  const want = auth.tokenHash;
  if (!want) throw new Error("missing_token_hash");
  const got = hashSessionToken(sessionToken);
  if (got !== want) throw new Error("invalid_session_token");
  return { siteId: auth.siteId, userId: auth.userId };
}

export function computeIntimacyDelta(userText: string, inputMode?: "voice" | "text"): { xp: number; reasons: string[] } {
  const t = userText.trim();
  const len = t.length;
  let xp = 5; // base per user message
  const reasons: string[] = ["base+5"];
  if (inputMode === "voice") {
    xp += 2;
    reasons.push("voice+2");
  }
  const bonusByLen = Math.min(10, Math.floor(len / 50)); // +0..10
  if (bonusByLen > 0) {
    xp += bonusByLen;
    reasons.push(`len+${bonusByLen}`);
  }
  // simple content bonus
  const lower = t.toLowerCase();
  const gratitude = ["ありがとう", "thanks", "thx", "感謝"];
  if (gratitude.some((k) => lower.includes(k))) {
    xp += 2;
    reasons.push("gratitude+2");
  }
  const selfDisclosure = ["私", "ぼく", "僕", "自分", "最近", "実は", "悩み", "嬉しい", "つらい", "好き"];
  if (selfDisclosure.some((k) => t.includes(k))) {
    xp += 2;
    reasons.push("self_disclosure+2");
  }
  xp = Math.min(20, xp); // cap per message
  return { xp, reasons };
}

export function levelFromXp(xp: number): number {
  if (xp >= 300) return 5;
  if (xp >= 140) return 4;
  if (xp >= 60) return 3;
  if (xp >= 20) return 2;
  return 1;
}

export function nextLevelXp(level: number): number | null {
  if (level <= 1) return 20;
  if (level === 2) return 60;
  if (level === 3) return 140;
  if (level === 4) return 300;
  return null;
}

export async function applyIntimacyDelta(
  userId: string,
  delta: number,
): Promise<{ level: number; xp: number; delta: number; nextXp: number | null }> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.from("users").select("intimacy_xp").eq("id", userId).maybeSingle();
  if (error) throw new Error(`supabase users select(xp): ${error.message}`);
  const curXp = Number((data as any)?.intimacy_xp ?? 0);
  const next = Math.max(0, curXp + delta);
  const level = levelFromXp(next);
  const { error: upErr } = await supabaseAdmin
    .from("users")
    .update({ intimacy_xp: next, intimacy_level: level, updated_at: new Date().toISOString(), last_seen_at: new Date().toISOString() })
    .eq("id", userId);
  if (upErr) throw new Error(`supabase users update(intimacy): ${upErr.message}`);
  return { level, xp: next, delta, nextXp: nextLevelXp(level) };
}

export async function applyIntimacy(
  userId: string,
  userText: string,
  inputMode?: "voice" | "text",
): Promise<{ level: number; xp: number; delta: number; nextXp: number | null; reasons: string[] }> {
  const { xp: delta, reasons } = computeIntimacyDelta(userText, inputMode);
  const res = await applyIntimacyDelta(userId, delta);
  return { ...res, reasons };
}

export async function getUserIntimacy(userId: string): Promise<{ level: number; xp: number }> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.from("users").select("intimacy_level,intimacy_xp").eq("id", userId).maybeSingle();
  if (error) throw new Error(`supabase users select(intimacy): ${error.message}`);
  return {
    level: Number((data as any)?.intimacy_level ?? 1),
    xp: Number((data as any)?.intimacy_xp ?? 0),
  };
}

export async function listRecentMessagesForUser(userId: string, limit = 30): Promise<MessageRow[]> {
  const supabaseAdmin = getSupabaseAdmin();
  // get recent sessions for this user
  const { data: sessions, error: sErr } = await supabaseAdmin
    .from("sessions")
    .select("id,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (sErr) throw new Error(`supabase sessions select(for user): ${sErr.message}`);
  const ids = (sessions ?? []).map((s: any) => s.id).filter(Boolean);
  if (ids.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("messages")
    .select("role,content,created_at,session_id")
    .in("session_id", ids)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`supabase messages select(for user): ${error.message}`);
  return ((data ?? []) as any[])
    .reverse()
    .map((m) => ({ role: m.role, content: m.content, created_at: m.created_at })) as MessageRow[];
}

export async function getSiteProfile(siteId: string): Promise<SiteProfileRow | null> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("site_profiles")
    .select("site_id,display_name,avatar_url,persona_prompt,tts_voice_hint")
    .eq("site_id", siteId)
    .maybeSingle();
  if (error) throw new Error(`supabase site_profiles select: ${error.message}`);
  return (data as SiteProfileRow | null) ?? null;
}

export async function getSessionSiteId(sessionId: string): Promise<string | null> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.from("sessions").select("site_id").eq("id", sessionId).maybeSingle();
  if (error) throw new Error(`supabase sessions select(site_id): ${error.message}`);
  return (data?.site_id as string | undefined) ?? null;
}

export async function insertMessage(input: { sessionId: string; role: "system" | "user" | "assistant"; content: string }) {
  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin
    .from("messages")
    .insert({ session_id: input.sessionId, role: input.role, content: input.content });
  if (error) throw new Error(`supabase messages insert: ${error.message}`);
}

export async function listRecentMessages(sessionId: string, limit = 30) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("messages")
    .select("role,content,created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`supabase messages select: ${error.message}`);
  return ((data ?? []) as MessageRow[]).reverse();
}

export async function insertEvents(sessionId: string, events: Array<{ type: string; meta: unknown }>) {
  if (events.length === 0) return;
  const supabaseAdmin = getSupabaseAdmin();
  const rows = events.map((e) => ({ session_id: sessionId, type: e.type, meta: e.meta ?? null }));
  const { error } = await supabaseAdmin.from("events").insert(rows);
  if (error) throw new Error(`supabase events insert: ${error.message}`);
}


