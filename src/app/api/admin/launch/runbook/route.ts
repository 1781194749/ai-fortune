import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchRunbook } from "@/lib/launch-runbook";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const runbook = await getLaunchRunbook();

  return Response.json(
    { ok: true, runbook },
    { headers: { "cache-control": "no-store" } },
  );
}
