import { recordAdminAudit } from "@/lib/admin-audit";
import { grantOperationalStars } from "@/lib/mock-payment-store";
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
      action: "report_compensate",
      status: "failed",
      resourceType: "report",
      resourceId: reportId,
      reportId,
      message,
    });

    return Response.json({ ok: false, message }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        amount?: number;
        reason?: string;
      }
    | null;
  const amount = body?.amount ?? 80;
  const reason =
    body?.reason?.trim() ||
    `报告「${report.title}」生成异常运营补偿 ${amount} 星力`;

  if (!Number.isInteger(amount) || amount <= 0 || amount > 1000) {
    const message = "补偿星力必须是 1-1000 的整数。";

    await recordAdminAudit({
      request,
      action: "report_compensate",
      status: "failed",
      resourceType: "report",
      resourceId: report.id,
      reportId: report.id,
      orderId: report.orderId,
      targetUserId: report.userId,
      amount,
      reason,
      message,
    });

    return Response.json(
      { ok: false, message },
      { status: 400 },
    );
  }

  const transaction = await grantOperationalStars({
    userId: report.userId,
    reportId: report.id,
    amount,
    reason,
    operator: "admin",
  });

  await recordAdminAudit({
    request,
    action: "report_compensate",
    status: "success",
    resourceType: "report",
    resourceId: report.id,
    reportId: report.id,
    orderId: report.orderId,
    targetUserId: report.userId,
    amount,
    reason,
    message: "已补发星力。",
    details: {
      transactionId: transaction.id,
      balanceAfter: transaction.balanceAfter,
    },
  });

  return Response.json({
    ok: true,
    transaction,
  });
}
