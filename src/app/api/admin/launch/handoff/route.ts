import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchHandoff } from "@/lib/launch-handoff";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const handoff = await getLaunchHandoff();

  return Response.json(
    { ok: true, handoff },
    { headers: { "cache-control": "no-store" } },
  );
}
