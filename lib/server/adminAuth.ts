import "server-only";

import crypto from "node:crypto";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { getServerEnv } from "./env";

const COOKIE_NAME = "withu_admin_session_v1";

type SessionPayload = {
  v: 1;
  iat: number;
  exp: number;
};

function getAdminSecrets(): { password: string; secret: string } {
  const env = getServerEnv();
  const password = env.ADMIN_PASSWORD;
  const secret = env.ADMIN_SESSION_SECRET;
  if (!password || password.length < 8) throw new Error("admin_disabled_missing_ADMIN_PASSWORD");
  if (!secret || secret.length < 16) throw new Error("admin_disabled_missing_ADMIN_SESSION_SECRET");
  return { password, secret };
}

function b64url(buf: Buffer) {
  return buf.toString("base64url");
}

function sign(secret: string, data: string) {
  return b64url(crypto.createHmac("sha256", secret).update(data).digest());
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function isAdminEnabled(): boolean {
  try {
    getAdminSecrets();
    return true;
  } catch {
    return false;
  }
}

export function verifyAdminSession(cookies: ReadonlyRequestCookies): boolean {
  let secret: string;
  try {
    secret = getAdminSecrets().secret;
  } catch {
    return false;
  }
  const raw = cookies.get(COOKIE_NAME)?.value || "";
  const parts = raw.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;
  const want = sign(secret, payloadB64);
  if (!safeEqual(sig, want)) return false;
  try {
    const json = Buffer.from(payloadB64, "base64url").toString("utf8");
    const p = JSON.parse(json) as SessionPayload;
    if (!p || p.v !== 1) return false;
    const now = Math.floor(Date.now() / 1000);
    if (typeof p.exp !== "number" || p.exp < now) return false;
    return true;
  } catch {
    return false;
  }
}

export function createAdminSessionCookie(): { name: string; value: string; options: Record<string, any> } {
  const { secret } = getAdminSecrets();
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { v: 1, iat: now, exp: now + 60 * 60 * 24 * 7 }; // 7 days
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = sign(secret, payloadB64);
  return {
    name: COOKIE_NAME,
    value: `${payloadB64}.${sig}`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    },
  };
}

export function adminPasswordMatches(input: string): boolean {
  const { password } = getAdminSecrets();
  return safeEqual(input, password);
}


