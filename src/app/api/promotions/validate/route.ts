import { isProductCode } from "@/lib/commerce";
import { quotePromotion } from "@/lib/promo-code";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        productCode?: string;
        promotionCode?: string;
      }
    | null;
  const productCode = body?.productCode ?? "";

  if (!isProductCode(productCode)) {
    return Response.json(
      { ok: false, message: "商品不存在或暂不可购买。" },
      { status: 400 },
    );
  }

  const quote = await quotePromotion({
    userId: session.userId,
    productCode,
    code: body?.promotionCode,
  });

  if (!quote.ok) {
    return Response.json(quote, { status: 400 });
  }

  return Response.json(quote);
}

