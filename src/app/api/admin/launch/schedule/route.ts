import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchScheduleRisk } from "@/lib/launch-schedule";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const schedule = await getLaunchScheduleRisk();

  return Response.json(
    { ok: true, schedule },
    { headers: { "cache-control": "no-store" } },
  );
}
