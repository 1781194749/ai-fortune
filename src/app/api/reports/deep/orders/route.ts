import { isDeepReportProductCode } from "@/lib/deep-report";
import { createMockOrder, getOrderDisplay } from "@/lib/mock-payment-store";
import { settleOptionalSideEffects } from "@/lib/optional-side-effects";
import { quotePromotion, recordPromotionEvent } from "@/lib/promo-code";
import { isDatabaseUnavailableError } from "@/lib/prisma";
import { getSession } from "@/lib/session";
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

    if (!isDeepReportProductCode(productCode)) {
      return Response.json(
        { ok: false, message: "请选择可购买的深度报告。" },
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

    const order = await createMockOrder(session.userId, productCode, {
      promotion: promotionQuote?.ok ? promotionQuote.promotion : undefined,
    });
    await settleOptionalSideEffects("deep report order created telemetry", [
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
