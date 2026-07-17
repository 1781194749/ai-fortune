import {
  isDeepReportProductCode,
} from "@/lib/deep-report";
import { createDeepReportForPaidOrder } from "@/lib/deep-report-job";
import { getMockOrder, getOrderDisplay } from "@/lib/mock-payment-store";
import { isDatabaseUnavailableError } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function POST(
  _request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  try {
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

    const result = await createDeepReportForPaidOrder({
      userId: session.userId,
      orderId: order.id,
      productCode: order.productCode,
    });

    return Response.json(
      {
        ok: true,
        order: getOrderDisplay(order),
        report: result.report,
        reused: result.reused,
        queued: result.queued,
      },
      { status: result.queued ? 202 : 200 },
    );
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return Response.json(
        { ok: false, code: error.code, message: error.message },
        { status: error.status },
      );
    }

    const message = error instanceof Error ? error.message : "深度报告任务创建失败。";

    return Response.json({ ok: false, message }, { status: 503 });
  }
}
