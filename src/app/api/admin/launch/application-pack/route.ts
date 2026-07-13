import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchApplicationPack } from "@/lib/launch-application-pack";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const applicationPack = await getLaunchApplicationPack();

  return Response.json(
    { ok: true, applicationPack },
    { headers: { "cache-control": "no-store" } },
  );
}
