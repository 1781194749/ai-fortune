import { canAccessAdminRequest } from "@/lib/admin-request";
import {
  getPersistenceReadiness,
  runPersistenceProbe,
} from "@/lib/persistence-readiness";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const readiness = await getPersistenceReadiness();

  return Response.json(
    { ok: true, readiness },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const readiness = await runPersistenceProbe({ request });

  return Response.json(
    { ok: readiness.probe.ok, readiness, message: readiness.probe.message },
    {
      status: readiness.probe.ok ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
