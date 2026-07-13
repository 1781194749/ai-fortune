import { recordAdminAudit } from "@/lib/admin-audit";
import { isDeepReportProductCode } from "@/lib/deep-report";
import { retryQueuedDeepReport, startDeepReportJob } from "@/lib/deep-report-job";
import { getMockOrder } from "@/lib/mock-payment-store";
import { getMockReport } from "@/lib/report-store";
import { canAccessAdminRequest } from "@/lib/admin-request";

export async function POST(
  request: Request,
  context: { params: Promise<{ reportId: string }> },
) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无后台权限。" }, { status: 404 });
  }

  const { reportId } = await context.params;
  const report = await getMockReport(reportId);

  if (!report) {
    const message = "报告不存在。";

    await recordAdminAudit({
      request,
      action: "report_retry",
      status: "failed",
      resourceType: "report",
      resourceId: reportId,
      reportId,
      message,
    });

    return Response.json({ ok: false, message }, { status: 404 });
  }

  const auditFailure = async (message: string, details?: Record<string, unknown>) =>
    recordAdminAudit({
      request,
      action: "report_retry",
      status: "failed",
      resourceType: "report",
      resourceId: report.id,
      reportId: report.id,
      orderId: report.orderId,
      targetUserId: report.userId,
      message,
      details,
    });

  if (!report.orderId) {
    const message = "该报告未绑定订单，不能重试深度报告生成。";

    await auditFailure(message, { reportStatus: report.status });

    return Response.json(
      { ok: false, message },
      { status: 400 },
    );
  }

  const order = await getMockOrder(report.orderId);

  if (!order || order.userId !== report.userId) {
    const message = "订单不存在或归属不匹配。";

    await auditFailure(message, {
      orderFound: Boolean(order),
      orderUserId: order?.userId,
    });

    return Response.json({ ok: false, message }, { status: 404 });
  }

  if (order.status !== "PAID") {
    const message = "订单未支付，不能重试。";

    await auditFailure(message, { orderStatus: order.status });

    return Response.json({ ok: false, message }, { status: 400 });
  }

  if (!isDeepReportProductCode(order.productCode)) {
    const message = "该订单不是深度报告订单。";

    await auditFailure(message, { productCode: order.productCode });

    return Response.json({ ok: false, message }, { status: 400 });
  }

  if (report.status === "COMPLETED") {
    const message = "报告已完成，无需重试。";

    await auditFailure(message, { reportStatus: report.status });

    return Response.json({ ok: false, message }, { status: 400 });
  }

  if (report.status === "GENERATING") {
    const started = startDeepReportJob({
      report,
      userId: report.userId,
      productCode: order.productCode,
      orderId: order.id,
    });
    const message = started ? "已重新唤起生成任务。" : "生成任务已在队列中。";

    await recordAdminAudit({
      request,
      action: "report_retry",
      status: "queued",
      resourceType: "report",
      resourceId: report.id,
      reportId: report.id,
      orderId: order.id,
      targetUserId: report.userId,
      message,
      details: {
        productCode: order.productCode,
        reportStatus: report.status,
        jobStarted: started,
      },
    });

    return Response.json({
      ok: true,
      report,
      queued: started,
      message,
    });
  }

  const retriedReport = await retryQueuedDeepReport({
    report,
    productCode: order.productCode,
    operator: "admin",
  });

  if (!retriedReport) {
    const message = "重试失败。";

    await auditFailure(message, {
      productCode: order.productCode,
      reportStatus: report.status,
    });

    return Response.json({ ok: false, message }, { status: 500 });
  }

  await recordAdminAudit({
    request,
    action: "report_retry",
    status: "queued",
    resourceType: "report",
    resourceId: retriedReport.id,
    reportId: retriedReport.id,
    orderId: order.id,
    targetUserId: retriedReport.userId,
    message: "已重新进入生成队列。",
    details: {
      productCode: order.productCode,
      previousStatus: report.status,
      nextStatus: retriedReport.status,
    },
  });

  return Response.json({
    ok: true,
    report: retriedReport,
    queued: true,
    message: "已重新进入生成队列。",
  });
}
