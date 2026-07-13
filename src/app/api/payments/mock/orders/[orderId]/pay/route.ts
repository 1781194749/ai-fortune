import { completeMockOrder, getOrderDisplay } from "@/lib/mock-payment-store";
import { recordCheckoutExperimentPaid } from "@/lib/checkout-experiment";
import { isDeepReportProductCode } from "@/lib/deep-report";
import { recordPromotionEvent } from "@/lib/promo-code";
import { createSession, getSession } from "@/lib/session";
import { recordShareAttributionConversion } from "@/lib/share-attribution";

export async function POST(
  _request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const session = await getSession();

  if (!session) {
    return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
  }

  const { orderId } = await context.params;
  let result;

  try {
    result = await completeMockOrder(orderId, session);
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "支付处理失败。" },
      { status: 503 },
    );
  }

  if (!result.ok) {
    const status = result.reason === "ORDER_FORBIDDEN"
      ? 403
      : result.reason === "MEMBERSHIP_DOWNGRADE_BLOCKED" || result.reason === "ORDER_NOT_PAYABLE"
        ? 409
        : 404;
    return Response.json(
      {
        ok: false,
        code: result.reason,
        message: "message" in result && result.message
          ? result.message
          : "订单不存在或不可支付。",
        availableAt: "availableAt" in result ? result.availableAt : undefined,
      },
      { status },
    );
  }

  const promotion =
    result.order.promotionCode &&
    result.order.originalAmountCents &&
    result.order.discountCents
      ? {
          code: result.order.promotionCode,
          name: result.order.promotionName ?? "优惠码",
          originalAmountCents: result.order.originalAmountCents,
          discountCents: result.order.discountCents,
          finalAmountCents: result.order.amountCents,
          currency: result.order.currency,
        }
      : undefined;

  await recordPromotionEvent({
    event: "paid",
    userId: session.userId,
    orderId: result.order.id,
    productCode: result.order.productCode,
    provider: result.order.provider,
    promotion,
  });
  await recordCheckoutExperimentPaid({
    userId: session.userId,
    orderId: result.order.id,
    productCode: result.order.productCode,
    provider: result.order.provider,
    amountCents: result.order.amountCents,
    currency: result.order.currency,
  });
  await recordShareAttributionConversion({
    event: "paid",
    userId: session.userId,
    orderId: result.order.id,
    productCode: result.order.productCode,
    provider: result.order.provider,
    amountCents: result.order.amountCents,
    currency: result.order.currency,
  });

  await createSession({
    userId: result.nextSession.userId,
    emailMasked: result.nextSession.emailMasked,
    tier: result.nextSession.tier,
    starBalance: result.nextSession.starBalance,
  });

  return Response.json({
    ok: true,
    order: getOrderDisplay(result.order),
    transaction: result.transaction,
    redirectTo: isDeepReportProductCode(result.order.productCode)
      ? `/reports/deep?orderId=${result.order.id}`
      : "/member",
  });
}
