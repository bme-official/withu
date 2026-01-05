import "server-only";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || now >= cur.resetAt) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt };
  }

  if (cur.count >= limit) return { ok: false, remaining: 0, resetAt: cur.resetAt };
  cur.count += 1;
  return { ok: true, remaining: Math.max(0, limit - cur.count), resetAt: cur.resetAt };
}

export function rateLimitOrThrow(key: string, limit: number, windowMs: number) {
  const r = rateLimit(key, limit, windowMs);
  if (!r.ok) {
    const err = new Error("rate_limited");
    // @ts-expect-error: attach metadata for handler
    err.status = 429;
    // @ts-expect-error: attach metadata for handler
    err.resetAt = r.resetAt;
    throw err;
  }
}


