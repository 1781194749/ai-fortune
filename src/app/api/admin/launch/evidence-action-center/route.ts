import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchEvidenceActionCenter } from "@/lib/launch-evidence-action-center";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const evidenceActionCenter = await getLaunchEvidenceActionCenter();

  return Response.json(
    { ok: true, evidenceActionCenter },
    { headers: { "cache-control": "no-store" } },
  );
}
