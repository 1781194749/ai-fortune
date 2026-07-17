import { createMockOrder, getOrderDisplay } from "@/lib/mock-payment-store";
import { isProductCode } from "@/lib/commerce";
import {
  getEligibleNewUserCheckoutExperiment,
  recordCheckoutExperimentOrderCreated,
} from "@/lib/checkout-experiment";
import { quotePromotion, recordPromotionEvent } from "@/lib/promo-code";
import { getRuntimeProduct } from "@/lib/product-config";
import { isDatabaseUnavailableError } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { MembershipDowngradeError } from "@/lib/membership-lifecycle";
import { settleOptionalSideEffects } from "@/lib/optional-side-effects";
import { recordShareAttributionConversion } from "@/lib/share-attribution";

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | { productCode?: string; promotionCode?: string }
      | null;
    const productCode = body?.productCode ?? "";

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
    let order;

    try {
      order = await createMockOrder(session.userId, productCode, {
        promotion: promotionQuote?.ok ? promotionQuote.promotion : undefined,
        product,
      });
    } catch (error) {
      if (error instanceof MembershipDowngradeError) {
        return Response.json(
          {
            ok: false,
            code: error.code,
            message: error.message,
            availableAt: error.availableAt,
          },
          { status: 409 },
        );
      }

      return Response.json(
        { ok: false, message: error instanceof Error ? error.message : "订单创建失败。" },
        { status: 503 },
      );
    }
    await settleOptionalSideEffects("mock order created telemetry", [
      recordCheckoutExperimentOrderCreated({
        assignment: checkoutExperiment,
        userId: session.userId,
        orderId: order.id,
        productCode: order.productCode,
        provider: order.provider,
        amountCents: order.amountCents,
        currency: order.currency,
      }),
      recordPromotionEvent({
        event: "order_created",
        userId: session.userId,
        orderId: order.id,
        productCode: order.productCode,
        provider: order.provider,
        promotion: promotionQuote?.ok ? promotionQuote.promotion : undefined,
      }),
      recordShareAttributionConversion({
        event: "order_created",
        userId: session.userId,
        orderId: order.id,
        productCode: order.productCode,
        provider: order.provider,
        amountCents: order.amountCents,
        currency: order.currency,
      }),
    ]);

    return Response.json({
      ok: true,
      order: getOrderDisplay(order),
      checkoutUrl: `/checkout/mock/${order.id}`,
    });
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
