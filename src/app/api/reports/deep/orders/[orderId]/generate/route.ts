import {
  isDeepReportProductCode,
} from "@/lib/deep-report";
import {
  createQueuedDeepReport,
  retryQueuedDeepReport,
  startDeepReportJob,
} from "@/lib/deep-report-job";
import { getMockOrder, getOrderDisplay } from "@/lib/mock-payment-store";
import { getUserMockReportByOrderId } from "@/lib/report-store";
import { getSession } from "@/lib/session";

export async function POST(
  _request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const session = await getSession();

  if (!session) {
    return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
  }

  const { orderId } = await context.params;
  const order = await getMockOrder(orderId);

  if (!order || order.userId !== session.userId) {
    return Response.json({ ok: false, message: "订单不存在。" }, { status: 404 });
  }

  if (!isDeepReportProductCode(order.productCode)) {
    return Response.json(
      { ok: false, message: "该订单不是深度报告订单。" },
      { status: 400 },
    );
  }

  if (order.status !== "PAID") {
    return Response.json(
      {
        ok: false,
        message: "请先完成支付，再生成深度报告。",
        order: getOrderDisplay(order),
      },
      { status: 402 },
    );
  }

  const existingReport = await getUserMockReportByOrderId({
    userId: session.userId,
    orderId: order.id,
  });

  if (existingReport) {
    if (existingReport.status === "GENERATING") {
      startDeepReportJob({
        report: existingReport,
        userId: session.userId,
        productCode: order.productCode,
        orderId: order.id,
      });
    }

    if (existingReport.status === "FAILED") {
      const retriedReport = await retryQueuedDeepReport({
        report: existingReport,
        productCode: order.productCode,
      });

      if (retriedReport) {
        return Response.json({
          ok: true,
          order: getOrderDisplay(order),
          report: retriedReport,
          reused: false,
          queued: true,
        });
      }
    }

    return Response.json({
      ok: true,
      order: getOrderDisplay(order),
      report: existingReport,
      reused: true,
      queued: existingReport.status === "GENERATING",
    });
  }

  const report = await createQueuedDeepReport({
    userId: session.userId,
    orderId: order.id,
    productCode: order.productCode,
  });

  return Response.json({
    ok: true,
    order: getOrderDisplay(order),
    report,
    reused: false,
    queued: true,
  });
}
