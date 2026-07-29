import { getMockReport } from "@/lib/report-store";
import { publicApiErrorResponse } from "@/lib/public-api-error";
import { toCustomerReport } from "@/lib/report-public-view";
import { getSession } from "@/lib/session";

export async function GET(
  _request: Request,
  context: { params: Promise<{ reportId: string }> },
) {
  try {
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
      report: toCustomerReport(report),
    });
  } catch (error) {
    return publicApiErrorResponse(error, {
      context: "read customer report",
      message: "报告读取失败，请稍后重试。",
      unavailableMessage: "报告服务暂时不可用，请稍后重试。",
    });
  }
}
