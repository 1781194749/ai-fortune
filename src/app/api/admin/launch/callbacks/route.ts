import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchCallbackChecklist } from "@/lib/launch-callbacks";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const callbacks = getLaunchCallbackChecklist();

  return Response.json(
    { ok: true, callbacks },
    { headers: { "cache-control": "no-store" } },
  );
}
