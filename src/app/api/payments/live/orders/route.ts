import { isProductCode } from "@/lib/commerce";
import QRCode from "qrcode";
import {
  getEligibleNewUserCheckoutExperiment,
  recordCheckoutExperimentOrderCreated,
} from "@/lib/checkout-experiment";
import { getLivePaymentLaunchGate } from "@/lib/live-payment-launch-gate";
import { settleOptionalSideEffects } from "@/lib/optional-side-effects";
import { createLivePaymentCheckout, isLivePaymentChannel } from "@/lib/payment-adapters";
import { quotePromotion, recordPromotionEvent } from "@/lib/promo-code";
import {
  logPublicApiError,
  publicApiErrorResponse,
} from "@/lib/public-api-error";
import { getRuntimeProduct } from "@/lib/product-config";
import { getSession } from "@/lib/session";
import { recordShareAttributionConversion } from "@/lib/share-attribution";
import {
  DeepReportRequirementsError,
  getDeepReportRequirementsErrorResponse,
} from "@/lib/deep-report-readiness";

type SuccessfulLiveCheckout = Extract<
  Awaited<ReturnType<typeof createLivePaymentCheckout>>,
  { ok: true }
>;

async function toPublicLiveCheckout(result: SuccessfulLiveCheckout) {
  if (result.checkout.type === "alipay_page_pay") {
    const redirectUrl = new URL(result.checkout.gateway);

    for (const [key, value] of Object.entries(result.checkout.params)) {
      redirectUrl.searchParams.set(key, value);
    }

    return {
      ok: true as const,
      message: "订单已创建，正在前往支付宝。",
      checkout: {
        type: "redirect" as const,
        url: redirectUrl.toString(),
      },
    };
  }

  const codeUrl = result.checkout.codeUrl;

  if (typeof codeUrl !== "string" || !codeUrl) {
    throw new Error("Wechat checkout did not return a code URL.");
  }

  const qrCodeDataUrl = await QRCode.toDataURL(codeUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });

  return {
    ok: true as const,
    message: "订单已创建，请使用微信扫码支付。",
    checkout: {
      type: "wechat_qr" as const,
      qrCodeDataUrl,
      priceLabel: result.checkout.priceLabel,
    },
  };
}

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
        message: "当前支付服务暂不可用，请稍后再试。",
      },
      { status: 503 },
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
    logPublicApiError("live payment checkout unavailable", result);
    return Response.json(
      { ok: false, message: "支付通道暂不可用，请稍后再试。" },
      { status: 503 },
    );
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

  return Response.json(await toPublicLiveCheckout(result));
}

export async function POST(request: Request) {
  try {
    return await createLiveOrderResponse(request);
  } catch (error) {
    if (error instanceof DeepReportRequirementsError) {
      return Response.json(getDeepReportRequirementsErrorResponse(error), {
        status: error.status,
      });
    }

    return publicApiErrorResponse(error, {
      context: "create live payment order",
      message: "订单创建失败，请稍后重试。",
      status: 503,
      unavailableMessage: "支付服务暂时不可用，请稍后重试。",
    });
  }
}
