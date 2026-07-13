import { getMockReport } from "@/lib/report-store";
import { getSession } from "@/lib/session";

export async function GET(
  _request: Request,
  context: { params: Promise<{ reportId: string }> },
) {
  const session = await getSession();

  if (!session) {
    return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
  }

  const { reportId } = await context.params;
  const report = await getMockReport(reportId);

  if (!report || report.userId !== session.userId) {
    return Response.json({ ok: false, message: "报告不存在。" }, { status: 404 });
  }

  return Response.json({
    ok: true,
    report,
  });
}
