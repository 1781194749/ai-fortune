import {
  decryptWechatPayResource,
  markPaidFromLiveNotify,
  validateWechatPayNotifyBusiness,
  verifyWechatPayNotify,
} from "@/lib/payment-adapters";
import { recordCheckoutExperimentPaid } from "@/lib/checkout-experiment";
import { settleOptionalSideEffects } from "@/lib/optional-side-effects";
import { recordPromotionEvent } from "@/lib/promo-code";

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  const body = await request.text();
  const devBypass =
    process.env.NODE_ENV !== "production" &&
    process.env.PAYMENT_CALLBACK_DEV_BYPASS === "true";
  const verified =
    devBypass ||
    verifyWechatPayNotify({
      body,
      timestamp: request.headers.get("Wechatpay-Timestamp"),
      nonce: request.headers.get("Wechatpay-Nonce"),
      signature: request.headers.get("Wechatpay-Signature"),
    });

  if (!verified) {
    return json({ code: "FAIL", message: "验签失败" }, 401);
  }

  const payload = (JSON.parse(body || "{}") as {
    out_trade_no?: string;
    transaction_id?: string;
    trade_state?: string;
    appid?: string;
    mchid?: string;
    amount?: { total?: number };
    resource?: unknown;
  });
  const transaction = payload.resource && !devBypass ? decryptWechatPayResource(payload.resource) : payload;

  if (payload.resource && !devBypass && !transaction) {
    return json({ code: "FAIL", message: "微信支付资源解密失败" }, 400);
  }

  if (!transaction) {
    return json({ code: "FAIL", message: "微信支付通知内容无效" }, 400);
  }

  if (transaction.trade_state && transaction.trade_state !== "SUCCESS") {
    return json({ code: "SUCCESS", message: "OK" });
  }

  if (!transaction.out_trade_no) {
    return json({ code: "FAIL", message: "订单号缺失" }, 400);
  }

  const validation = await validateWechatPayNotifyBusiness(transaction);

  if (!validation.ok) {
    return json({ code: "FAIL", message: validation.message }, 400);
  }

  const result = await markPaidFromLiveNotify({
    orderId: transaction.out_trade_no,
    channel: "wechat_pay",
    providerOrderId: transaction.transaction_id,
    notifyPayload: payload,
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

    await settleOptionalSideEffects("wechat paid telemetry", [
      recordPromotionEvent({
        event: "paid",
        userId: result.order.userId,
        orderId: result.order.id,
        productCode: result.order.productCode,
        provider: result.order.provider,
        promotion,
      }),
      recordCheckoutExperimentPaid({
        userId: result.order.userId,
        orderId: result.order.id,
        productCode: result.order.productCode,
        provider: result.order.provider,
        amountCents: result.order.amountCents,
        currency: result.order.currency,
      }),
    ]);
  }

  return result.ok
    ? json({ code: "SUCCESS", message: "OK" })
    : json({ code: "FAIL", message: "订单处理失败" }, 404);
}
