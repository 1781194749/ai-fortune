import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchCompliancePlan } from "@/lib/launch-compliance-plan";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const compliancePlan = await getLaunchCompliancePlan();

  return Response.json(
    { ok: true, compliancePlan },
    { headers: { "cache-control": "no-store" } },
  );
}
