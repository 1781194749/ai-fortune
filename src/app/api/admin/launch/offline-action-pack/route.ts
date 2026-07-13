import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchOfflineActionPack } from "@/lib/launch-offline-action-pack";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const offlineActionPack = await getLaunchOfflineActionPack();

  return Response.json(
    { ok: true, offlineActionPack },
    { headers: { "cache-control": "no-store" } },
  );
}
