import { canAccessAdminRequest } from "@/lib/admin-request";
import {
  getIntegrationDiagnostics,
  runIntegrationDiagnostics,
} from "@/lib/integration-diagnostics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const diagnostics = await getIntegrationDiagnostics();

  return Response.json(
    { ok: true, diagnostics },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const diagnostics = await runIntegrationDiagnostics();
  const hasBlocking = diagnostics.summary.blocking > 0;

  return Response.json(
    {
      ok: !hasBlocking,
      diagnostics,
      message: hasBlocking
        ? `第三方诊断发现 ${diagnostics.summary.blocking} 个阻断项。`
        : `第三方诊断完成：${diagnostics.summary.ready} 项 ready，${diagnostics.summary.warning} 项 warning。`,
    },
    {
      status: hasBlocking ? 503 : 200,
      headers: { "cache-control": "no-store" },
    },
  );
}
