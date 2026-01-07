export const runtime = "nodejs";

import type { NextRequest } from "next/server";

const COOKIE_NAME = "withu_admin_session_v1";

export async function POST(req: NextRequest) {
  const res = Response.redirect(new URL("/admin/login?error=signed_out", req.url), 303);
  res.headers.append("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`);
  return res;
}


