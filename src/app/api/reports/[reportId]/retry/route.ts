import { isDeepReportProductCode } from "@/lib/deep-report";
import {
  InsufficientDeepReportEntitlementError,
  retryDeepReport,
  retryDeepReportWithMemberQuota,
} from "@/lib/deep-report-job";
import { getMockOrder } from "@/lib/mock-payment-store";
import { isDatabaseUnavailableError } from "@/lib/prisma";
import { getMockReport, type MockReport } from "@/lib/report-store";
import { getSession } from "@/lib/session";

function readString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function readObject(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function productCodeFromReport(report: MockReport) {
  const inputSnapshot = readObject(report.inputSnapshot);
  const toolResults = readObject(report.toolResults);
  const snapshotCode = readString(inputSnapshot.productCode);
  const toolCode = readString(toolResults.productCode);
  const requestKeyCode = report.requestKey?.split(":").at(-1);
  const productCode = snapshotCode ?? toolCode ?? requestKeyCode;

  return productCode && isDeepReportProductCode(productCode) ? productCode : undefined;
}

export async function POST(
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

    if (report.status === "COMPLETED") {
      return Response.json(
        { ok: false, message: "报告已完成，无需重试。" },
        { status: 400 },
      );
    }

    if (report.orderId) {
      const order = await getMockOrder(report.orderId);

      if (!order || order.userId !== session.userId) {
        return Response.json({ ok: false, message: "订单不存在。" }, { status: 404 });
      }

      if (order.status !== "PAID") {
        return Response.json(
          { ok: false, message: "请先完成支付，再重新生成报告。" },
          { status: 402 },
        );
      }

      if (!isDeepReportProductCode(order.productCode)) {
        return Response.json(
          { ok: false, message: "该报告不支持重新生成。" },
          { status: 400 },
        );
      }

      const retried = await retryDeepReport({
        report,
        productCode: order.productCode,
        operator: "user",
      });

      if (!retried) {
        return Response.json({ ok: false, message: "重试失败。" }, { status: 503 });
      }

      return Response.json(
        {
          ok: true,
          report: retried.report,
          queued: retried.queued,
          message: retried.dispatchQueued
            ? "已重新进入生成队列。"
            : "重试已记录，等待队列恢复派发。",
        },
        { status: 202 },
      );
    }

    const productCode = productCodeFromReport(report);

    if (!productCode) {
      return Response.json(
        { ok: false, message: "该会员额度报告缺少产品信息，暂时不能重试。" },
        { status: 400 },
      );
    }

    const retried = await retryDeepReportWithMemberQuota({
      report,
      productCode,
    });

    if (!retried) {
      return Response.json({ ok: false, message: "重试失败。" }, { status: 503 });
    }

    return Response.json(
      {
        ok: true,
        report: retried.report,
        queued: retried.queued,
        entitlement: retried.entitlement,
        message: retried.dispatchQueued
          ? "已重新使用 1 份会员报告额度并进入生成队列。"
          : "重试已记录，等待队列恢复派发。",
      },
      { status: 202 },
    );
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return Response.json(
        { ok: false, code: error.code, message: error.message },
        { status: error.status },
      );
    }

    if (error instanceof InsufficientDeepReportEntitlementError) {
      return Response.json(
        {
          ok: false,
          message: error.message,
          entitlement: error.balance,
        },
        { status: 402 },
      );
    }

    const message = error instanceof Error ? error.message : "报告重试失败。";
    return Response.json({ ok: false, message }, { status: 503 });
  }
}
