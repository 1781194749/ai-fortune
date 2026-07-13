import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchReadiness } from "@/lib/launch-readiness";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const readiness = await getLaunchReadiness();

  return Response.json(
    { ok: true, readiness },
    { headers: { "cache-control": "no-store" } },
  );
}
