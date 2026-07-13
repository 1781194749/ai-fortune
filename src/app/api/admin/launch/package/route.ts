import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchPackage } from "@/lib/launch-package";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const launchPackage = await getLaunchPackage();

  return Response.json(
    { ok: true, package: launchPackage },
    { headers: { "cache-control": "no-store" } },
  );
}
