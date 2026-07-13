import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchBlockerDashboard } from "@/lib/launch-blocker-dashboard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const blockerDashboard = await getLaunchBlockerDashboard();

  return Response.json(
    { ok: true, blockerDashboard },
    { headers: { "cache-control": "no-store" } },
  );
}
