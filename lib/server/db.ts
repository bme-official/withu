import "server-only";

import { getSupabaseAdmin } from "./supabaseAdmin";

export type MessageRow = {
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
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


