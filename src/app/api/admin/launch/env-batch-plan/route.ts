import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchEnvBatchPlan } from "@/lib/launch-env-batch-plan";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const envBatchPlan = await getLaunchEnvBatchPlan();

  return Response.json(
    { ok: true, envBatchPlan },
    { headers: { "cache-control": "no-store" } },
  );
}
