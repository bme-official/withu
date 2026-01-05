import "server-only";

import type { NextRequest } from "next/server";

export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xrip = req.headers.get("x-real-ip");
  if (xrip) return xrip;
  return "unknown";
}

export function getUserAgent(req: NextRequest): string {
  return req.headers.get("user-agent") || "unknown";
}


