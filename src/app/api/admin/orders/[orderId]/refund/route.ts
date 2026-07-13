import { recordAdminAudit } from "@/lib/admin-audit";
import { canAccessAdminRequest } from "@/lib/admin-request";
import { refundPaidOrder } from "@/lib/mock-payment-store";

function readReason(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function refundFailureMessage(reason: string) {
  if (reason === "ORDER_NOT_FOUND") {
    return "订单不存在。";
  }

  if (reason === "ORDER_NOT_PAID") {
    return "只有已支付订单可以退款。";
  }

  if (reason === "PRODUCT_NOT_FOUND") {
    return "订单商品不存在，不能自动退款。";
  }

  if (reason === "INSUFFICIENT_STARS") {
    return "用户星力余额不足，不能自动扣回本订单发放的星力。";
  }

  if (reason === "INSUFFICIENT_ENTITLEMENT") {
    return "会员权益余额不足，不能自动扣回本订单发放的额度。";
  }

  return "订单退款失败。";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无后台权限。" }, { status: 404 });
  }

  const { orderId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        reason?: unknown;
      }
    | null;
  const reason = readReason(body?.reason) || "后台订单退款";

  if (reason.length > 160) {
    const message = "退款原因不能超过 160 字。";

    await recordAdminAudit({
      request,
      action: "order_refund",
      status: "failed",
      resourceType: "order",
      resourceId: orderId,
      orderId,
      reason,
      message,
    });

    return Response.json({ ok: false, message }, { status: 400 });
  }

  let result;

  try {
    result = await refundPaidOrder({
      orderId,
      reason,
      operator: "admin",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "退款处理失败。";

    await recordAdminAudit({
      request,
      action: "order_refund",
      status: "failed",
      resourceType: "order",
      resourceId: orderId,
      orderId,
      reason,
      message,
    });

    return Response.json({ ok: false, message }, { status: 503 });
  }

  if (!result.ok) {
    const message = result.message ?? refundFailureMessage(result.reason);

    await recordAdminAudit({
      request,
      action: "order_refund",
      status: "failed",
      resourceType: "order",
      resourceId: orderId,
      orderId,
      targetUserId: result.order?.userId,
      amount: result.required,
      reason,
      message,
      details: {
        failureReason: result.reason,
        balanceAfter: result.balanceAfter,
        entitlementKind: result.entitlementKind,
      },
    });

    return Response.json(
      { ok: false, message, reason: result.reason },
      { status: result.reason === "ORDER_NOT_FOUND" ? 404 : 409 },
    );
  }

  const message = result.alreadyRefunded ? "订单已是退款状态。" : "已标记退款并回滚内部权益。";

  await recordAdminAudit({
    request,
    action: "order_refund",
    status: "success",
    resourceType: "order",
    resourceId: result.order.id,
    orderId: result.order.id,
    targetUserId: result.order.userId,
    amount: result.transaction?.amount,
    reason,
    message,
    details: {
      orderStatus: result.order.status,
      transactionId: result.transaction?.id,
      balanceAfter: result.balanceAfter,
      tierAfter: result.tierAfter,
      entitlementTransactionIds: result.entitlementTransactions.map(
        (transaction) => transaction.id,
      ),
      alreadyRefunded: Boolean(result.alreadyRefunded),
    },
  });

  return Response.json({
    ok: true,
    message,
    order: result.order,
    transaction: result.transaction,
    entitlementTransactions: result.entitlementTransactions,
    balanceAfter: result.balanceAfter,
    tierAfter: result.tierAfter,
    alreadyRefunded: Boolean(result.alreadyRefunded),
  });
}
