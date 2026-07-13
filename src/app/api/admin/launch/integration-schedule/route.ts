import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchIntegrationSchedule } from "@/lib/launch-integration-schedule";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const integrationSchedule = await getLaunchIntegrationSchedule();

  return Response.json(
    { ok: true, integrationSchedule },
    { headers: { "cache-control": "no-store" } },
  );
}
