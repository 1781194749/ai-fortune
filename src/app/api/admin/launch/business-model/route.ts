import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchBusinessModel } from "@/lib/launch-business-model";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const businessModel = await getLaunchBusinessModel();

  return Response.json(
    { ok: true, businessModel },
    { headers: { "cache-control": "no-store" } },
  );
}
