import { getMockReport, updateMockReportShare } from "@/lib/report-store";
import { isDatabaseUnavailableError } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function POST(
  request: Request,
  context: { params: Promise<{ reportId: string }> },
) {
  try {
    const session = await getSession();

    if (!session) {
      return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
    }

    const { reportId } = await context.params;
    const body = (await request.json().catch(() => null)) as
      | { enabled?: boolean }
      | null;
    const report = await getMockReport(reportId);

    if (!report || report.userId !== session.userId) {
      return Response.json({ ok: false, message: "报告不存在。" }, { status: 404 });
    }

    if (report.status !== "COMPLETED") {
      return Response.json(
        { ok: false, message: "报告未完成，暂不能公开分享。" },
        { status: 400 },
      );
    }

    const updated = await updateMockReportShare({
      reportId,
      userId: session.userId,
      enabled: Boolean(body?.enabled),
    });

    if (!updated) {
      return Response.json({ ok: false, message: "分享设置更新失败。" }, { status: 404 });
    }

    return Response.json({
      ok: true,
      report: updated,
      sharePath: updated.shareSlug ? `/share/${updated.shareSlug}` : null,
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return Response.json(
        { ok: false, code: error.code, message: error.message },
        { status: error.status },
      );
    }

    throw error;
  }
}
