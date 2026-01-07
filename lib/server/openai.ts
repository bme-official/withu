import "server-only";

import OpenAI from "openai";
import { getServerEnv } from "./env";

let _client: OpenAI | null = null;

export function getOpenAI() {
  if (_client) return _client;
  const env = getServerEnv();
  _client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return _client;
}

export function getChatModel() {
  const env = getServerEnv();
  return env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
}

export function getIntimacyModel() {
  const env = getServerEnv();
  return env.OPENAI_INTIMACY_MODEL || env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
}

export function getTtsModel() {
  const env = getServerEnv();
  // Prefer lower latency by default (can be overridden via env).
  return env.OPENAI_TTS_MODEL || "tts-1";
}

export type OpenAiTtsVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

export function getTtsVoice(): OpenAiTtsVoice {
  const env = getServerEnv();
  const voice = (env.OPENAI_TTS_VOICE || "shimmer").trim().toLowerCase();
  if (voice === "alloy") return "alloy";
  if (voice === "echo") return "echo";
  if (voice === "fable") return "fable";
  if (voice === "onyx") return "onyx";
  if (voice === "nova") return "nova";
  if (voice === "shimmer") return "shimmer";
  throw new Error(`Invalid OPENAI_TTS_VOICE: ${voice}`);
}


