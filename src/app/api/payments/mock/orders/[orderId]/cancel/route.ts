import { closeMockOrder } from "@/lib/mock-payment-store";
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
    const order = await closeMockOrder({ orderId, userId: session.userId });

    if (!order) {
      return Response.json({ ok: false, message: "订单不存在或已无法取消。" }, { status: 409 });
    }

    return Response.json({ ok: true, order });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return Response.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
    }

    throw error;
  }
}
