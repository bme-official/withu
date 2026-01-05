import "server-only";

export function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {}),
    },
  });
}

export function errorJson(status: number, message: string, extra?: Record<string, unknown>) {
  return json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}


