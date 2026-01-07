export const runtime = "nodejs";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAdminSession, isAdminEnabled } from "@/lib/server/adminAuth";

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  if (!isAdminEnabled()) redirect("/admin/login?error=admin_disabled");
  const ok = verifyAdminSession(await cookies());
  if (!ok) redirect("/admin/login?error=not_authenticated");
  return <>{children}</>;
}


