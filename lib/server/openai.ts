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


