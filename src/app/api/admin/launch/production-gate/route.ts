import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchProductionGate } from "@/lib/launch-production-gate";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const productionGate = await getLaunchProductionGate();

  return Response.json(
    { ok: true, productionGate },
    { headers: { "cache-control": "no-store" } },
  );
}
