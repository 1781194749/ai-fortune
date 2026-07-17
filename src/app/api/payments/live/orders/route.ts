import { isProductCode } from "@/lib/commerce";
import {
  getEligibleNewUserCheckoutExperiment,
  recordCheckoutExperimentOrderCreated,
} from "@/lib/checkout-experiment";
import { getLivePaymentLaunchGate } from "@/lib/live-payment-launch-gate";
import { settleOptionalSideEffects } from "@/lib/optional-side-effects";
import { createLivePaymentCheckout, isLivePaymentChannel } from "@/lib/payment-adapters";
import { quotePromotion, recordPromotionEvent } from "@/lib/promo-code";
import { isDatabaseUnavailableError } from "@/lib/prisma";
import { getRuntimeProduct } from "@/lib/product-config";
import { getSession } from "@/lib/session";
import { recordShareAttributionConversion } from "@/lib/share-attribution";

async function createLiveOrderResponse(request: Request) {
  const session = await getSession();

  if (!session) {
    return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { productCode?: string; channel?: string; promotionCode?: string }
    | null;
  const productCode = body?.productCode ?? "";
  const channel = body?.channel ?? "";

  if (!isProductCode(productCode)) {
    return Response.json(
      { ok: false, message: "商品不存在或暂不可购买。" },
      { status: 400 },
    );
  }

  const product = await getRuntimeProduct(productCode);

  if (!product) {
    return Response.json(
      { ok: false, message: "商品已下架或暂不可购买。" },
      { status: 400 },
    );
  }

  if (!isLivePaymentChannel(channel)) {
    return Response.json(
      { ok: false, message: "支付渠道不存在或暂不可用。" },
      { status: 400 },
    );
  }

  const livePaymentGate = await getLivePaymentLaunchGate({ user: session });

  if (!livePaymentGate.allowed) {
    return Response.json(
      {
        ok: false,
        code: livePaymentGate.code,
        message: livePaymentGate.message,
        launchGate: livePaymentGate,
      },
      { status: 409 },
    );
  }

  const promotionQuote = body?.promotionCode
    ? await quotePromotion({
        userId: session.userId,
        productCode,
        code: body.promotionCode,
      })
    : null;

  if (promotionQuote && !promotionQuote.ok) {
    return Response.json(promotionQuote, { status: 400 });
  }

  const checkoutExperiment = await getEligibleNewUserCheckoutExperiment(session.userId);
  const result = await createLivePaymentCheckout({
    session,
    productCode,
    product,
    channel,
    promotion: promotionQuote?.ok ? promotionQuote.promotion : undefined,
  });

  if (!result.ok) {
    return Response.json(result, { status: 400 });
  }

  await settleOptionalSideEffects("live order created telemetry", [
    recordCheckoutExperimentOrderCreated({
      assignment: checkoutExperiment,
      userId: session.userId,
      orderId: result.order.id,
      productCode: result.order.productCode,
      provider: channel === "alipay" ? "ALIPAY" : "WECHAT_PAY",
      amountCents: result.order.amountCents,
      currency: result.order.currency,
    }),
    recordPromotionEvent({
      event: "order_created",
      userId: session.userId,
      orderId: result.order.id,
      productCode: result.order.productCode,
      provider: channel === "alipay" ? "ALIPAY" : "WECHAT_PAY",
      promotion: promotionQuote?.ok ? promotionQuote.promotion : undefined,
    }),
    recordShareAttributionConversion({
      event: "order_created",
      userId: session.userId,
      orderId: result.order.id,
      productCode: result.order.productCode,
      provider: channel === "alipay" ? "ALIPAY" : "WECHAT_PAY",
      amountCents: result.order.amountCents,
      currency: result.order.currency,
    }),
  ]);

  return Response.json(result);
}

export async function POST(request: Request) {
  try {
    return await createLiveOrderResponse(request);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return Response.json(
        { ok: false, code: error.code, message: error.message },
        { status: error.status },
      );
    }

    throw error;
  }
}
