import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchComplianceChecklist } from "@/lib/launch-compliance";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const compliance = await getLaunchComplianceChecklist();

  return Response.json(
    { ok: true, compliance },
    { headers: { "cache-control": "no-store" } },
  );
}
