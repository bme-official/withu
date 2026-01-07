export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminSession } from "@/lib/server/adminAuth";
import { upsertSiteProfile } from "@/lib/server/db";

export async function POST(req: NextRequest) {
  const ok = verifyAdminSession(await cookies());
  if (!ok) return Response.redirect(new URL("/admin/login?error=not_authenticated", req.url), 303);

  const fd = await req.formData();
  const siteId = String(fd.get("siteId") || "").trim();
  if (!siteId) return Response.redirect(new URL("/admin?error=missing_siteId", req.url), 303);

  await upsertSiteProfile({ siteId, displayName: "Mirai Aizawa", personaPrompt: "" });
  return Response.redirect(new URL(`/admin/site/${encodeURIComponent(siteId)}`, req.url), 303);
}


