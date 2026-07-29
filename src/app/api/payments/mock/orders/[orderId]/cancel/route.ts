import { closeMockOrder, getOrderDisplay } from "@/lib/mock-payment-store";
import { publicApiErrorResponse } from "@/lib/public-api-error";
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
    const order = await closeMockOrder({ orderId, userId: session.userId });

    if (!order) {
      return Response.json({ ok: false, message: "订单不存在或已无法取消。" }, { status: 409 });
    }

    return Response.json({ ok: true, order: getOrderDisplay(order) });
  } catch (error) {
    return publicApiErrorResponse(error, {
      context: "cancel mock payment order",
      message: "订单取消失败，请稍后重试。",
      unavailableMessage: "订单服务暂时不可用，请稍后重试。",
    });
  }
}
