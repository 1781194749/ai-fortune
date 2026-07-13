import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchRolloutPlan } from "@/lib/launch-rollout";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const rollout = await getLaunchRolloutPlan();

  return Response.json(
    { ok: true, rollout },
    { headers: { "cache-control": "no-store" } },
  );
}
