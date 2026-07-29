import { completeMockOrder, getOrderDisplay } from "@/lib/mock-payment-store";
import { recordCheckoutExperimentPaid } from "@/lib/checkout-experiment";
import { isDeepReportProductCode } from "@/lib/deep-report";
import { settleOptionalSideEffects } from "@/lib/optional-side-effects";
import { recordPromotionEvent } from "@/lib/promo-code";
import { publicApiErrorResponse } from "@/lib/public-api-error";
import { createSession, getSession } from "@/lib/session";
import { recordShareAttributionConversion } from "@/lib/share-attribution";
import { getPersistedAccountState } from "@/lib/user-store";

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
    let result;

    try {
      result = await completeMockOrder(orderId, session);
    } catch (error) {
      return publicApiErrorResponse(error, {
        context: "complete mock payment order",
        message: "支付处理失败，请稍后重试。",
        status: 503,
        unavailableMessage: "支付服务暂时不可用，请稍后重试。",
      });
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
          message: result.reason === "MEMBERSHIP_DOWNGRADE_BLOCKED"
            ? "当前为更高等级会员，暂不能购买该方案，请在当前会员到期后再试。"
            : result.reason === "ORDER_NOT_PAYABLE"
              ? "订单当前不可支付。"
              : result.reason === "ORDER_FORBIDDEN"
                ? "无权操作该订单。"
                : "订单不存在。",
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

    await settleOptionalSideEffects("mock order paid telemetry", [
      recordPromotionEvent({
        event: "paid",
        userId: session.userId,
        orderId: result.order.id,
        productCode: result.order.productCode,
        provider: result.order.provider,
        promotion,
      }),
      recordCheckoutExperimentPaid({
        userId: session.userId,
        orderId: result.order.id,
        productCode: result.order.productCode,
        provider: result.order.provider,
        amountCents: result.order.amountCents,
        currency: result.order.currency,
      }),
      recordShareAttributionConversion({
        event: "paid",
        userId: session.userId,
        orderId: result.order.id,
        productCode: result.order.productCode,
        provider: result.order.provider,
        amountCents: result.order.amountCents,
        currency: result.order.currency,
      }),
    ]);

    const accountState = await getPersistedAccountState(result.nextSession.userId, {
      tier: result.nextSession.tier,
      starBalance: result.nextSession.starBalance,
      chatQuota: result.nextSession.chatQuota,
      chatUsed: result.nextSession.chatUsed,
      profileLimit: result.nextSession.profileLimit,
      quotaPeriodStart: result.nextSession.quotaPeriodStart,
    });

    await createSession({
      userId: result.nextSession.userId,
      emailMasked: result.nextSession.emailMasked,
      ...accountState,
    });

    return Response.json({
      ok: true,
      order: getOrderDisplay(result.order),
      transaction: result.transaction
        ? {
            type: result.transaction.type,
            amount: result.transaction.amount,
            balanceAfter: result.transaction.balanceAfter,
            reason: result.transaction.reason,
            createdAt: result.transaction.createdAt,
          }
        : null,
      redirectTo: isDeepReportProductCode(result.order.productCode)
        ? `/reports/deep?orderId=${result.order.id}`
        : "/member/entitlements",
    });
  } catch (error) {
    return publicApiErrorResponse(error, {
      context: "finalize mock payment response",
      message: "支付处理失败，请稍后重试。",
      status: 503,
      unavailableMessage: "支付服务暂时不可用，请稍后重试。",
    });
  }
}
