export type ApiClient = {
  baseUrl: string;
  siteId: string;
  sessionId: string | null;
  createSession(): Promise<string>;
  log(type: string, meta?: unknown): Promise<void>;
  asr(audio: Blob): Promise<{ text: string }>;
  chat(userText: string): Promise<{ assistantText: string }>;
  tts(text: string): Promise<{ mode: string }>;
};

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function createApiClient(baseUrl: string, siteId: string): ApiClient {
  const state: { sessionId: string | null } = { sessionId: null };

  async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    if (!res.ok) {
      const maybe = safeJsonParse(text);
      throw new Error(`HTTP ${res.status} ${path} ${typeof maybe === "object" ? JSON.stringify(maybe) : text}`);
    }
    return (text ? (JSON.parse(text) as T) : ({} as T));
  }

  return {
    baseUrl,
    siteId,
    get sessionId() {
      return state.sessionId;
    },
    async createSession() {
      const data = await requestJson<{ sessionId: string }>("/api/session", {
        method: "POST",
        body: JSON.stringify({ siteId }),
      });
      state.sessionId = data.sessionId;
      return data.sessionId;
    },
    async log(type: string, meta?: unknown) {
      if (!state.sessionId) return;
      try {
        await requestJson("/api/logs", {
          method: "POST",
          body: JSON.stringify({
            sessionId: state.sessionId,
            events: [{ type, meta: meta ?? null }],
          }),
        });
      } catch {
        // Logging failures must never break UX
      }
    },
    async asr(audio: Blob) {
      if (!state.sessionId) throw new Error("missing sessionId");
      const fd = new FormData();
      fd.append("sessionId", state.sessionId);
      fd.append("audio", audio, "audio.webm");
      const res = await fetch(`${baseUrl}/api/asr`, { method: "POST", body: fd });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} /api/asr ${text}`);
      return JSON.parse(text) as { text: string };
    },
    async chat(userText: string) {
      if (!state.sessionId) throw new Error("missing sessionId");
      return await requestJson<{ assistantText: string }>("/api/chat", {
        method: "POST",
        body: JSON.stringify({ sessionId: state.sessionId, userText }),
      });
    },
    async tts(text: string) {
      if (!state.sessionId) throw new Error("missing sessionId");
      return await requestJson<{ mode: string }>("/api/tts", {
        method: "POST",
        body: JSON.stringify({ sessionId: state.sessionId, text }),
      });
    },
  };
}


