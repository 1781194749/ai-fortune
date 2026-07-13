import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchEvidenceGap } from "@/lib/launch-evidence-gap";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const evidenceGap = await getLaunchEvidenceGap();

  return Response.json(
    { ok: true, evidenceGap },
    { headers: { "cache-control": "no-store" } },
  );
}
