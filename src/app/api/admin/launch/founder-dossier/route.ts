import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchFounderDossier } from "@/lib/launch-founder-dossier";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const founderDossier = await getLaunchFounderDossier();

  return Response.json(
    { ok: true, founderDossier },
    { headers: { "cache-control": "no-store" } },
  );
}
