import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchMaterialPack } from "@/lib/launch-materials";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const materials = await getLaunchMaterialPack();

  return Response.json(
    { ok: true, materials },
    { headers: { "cache-control": "no-store" } },
  );
}
