import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchEnvDraft } from "@/lib/launch-env-draft";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const envDraft = await getLaunchEnvDraft();

  return Response.json(
    { ok: true, envDraft },
    { headers: { "cache-control": "no-store" } },
  );
}
