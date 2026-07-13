import {
  markPaidFromLiveNotify,
  validateAlipayNotifyBusiness,
  verifyAlipayNotify,
} from "@/lib/payment-adapters";
import { recordCheckoutExperimentPaid } from "@/lib/checkout-experiment";
import { recordPromotionEvent } from "@/lib/promo-code";

function text(value: string, status = 200) {
  return new Response(value, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return text("fail", 400);
  }

  const params = Object.fromEntries(
    Array.from(formData.entries()).map(([key, value]) => [key, String(value)]),
  );
  const devBypass =
    process.env.NODE_ENV !== "production" &&
    process.env.PAYMENT_CALLBACK_DEV_BYPASS === "true";

  if (!devBypass && !verifyAlipayNotify(params)) {
    return text("fail", 400);
  }

  if (params.trade_status !== "TRADE_SUCCESS" && params.trade_status !== "TRADE_FINISHED") {
    return text("success");
  }

  const orderId = params.out_trade_no;

  if (!orderId) {
    return text("fail", 400);
  }

  const validation = await validateAlipayNotifyBusiness(params);

  if (!validation.ok) {
    return text("fail", 400);
  }

  const result = await markPaidFromLiveNotify({
    orderId,
    channel: "alipay",
    providerOrderId: params.trade_no,
    notifyPayload: params,
  });

  if (result.ok) {
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
      userId: result.order.userId,
      orderId: result.order.id,
      productCode: result.order.productCode,
      provider: result.order.provider,
      promotion,
    });
    await recordCheckoutExperimentPaid({
      userId: result.order.userId,
      orderId: result.order.id,
      productCode: result.order.productCode,
      provider: result.order.provider,
      amountCents: result.order.amountCents,
      currency: result.order.currency,
    });
  }

  return result.ok ? text("success") : text("fail", 404);
}
