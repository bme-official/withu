import "server-only";

import type { NextRequest } from "next/server";
import { getServerEnv } from "./env";

function getAllowedOrigins(): string[] | null {
  // Comma-separated list; if unset, allow all (*) because we don't use cookies/credentials.
  const raw = process.env.WIDGET_ALLOWED_ORIGINS;
  if (!raw) return null;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function corsHeaders(req: NextRequest): HeadersInit {
  // Ensure env validation doesn't run at import time (keep build stable)
  void getServerEnv;

  const origin = req.headers.get("origin");
  const allowed = getAllowedOrigins();

  let allowOrigin = "*";
  if (allowed && origin) {
    allowOrigin = allowed.includes(origin) ? origin : "null";
  }

  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}


