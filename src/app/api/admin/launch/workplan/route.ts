import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchWorkplan } from "@/lib/launch-workplan";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const workplan = await getLaunchWorkplan();

  return Response.json(
    { ok: true, workplan },
    { headers: { "cache-control": "no-store" } },
  );
}
