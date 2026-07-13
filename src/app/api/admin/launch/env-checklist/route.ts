import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchEnvChecklist } from "@/lib/launch-env-checklist";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const checklist = await getLaunchEnvChecklist();

  return Response.json(
    { ok: true, checklist },
    { headers: { "cache-control": "no-store" } },
  );
}
