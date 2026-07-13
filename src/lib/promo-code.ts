import "server-only";

import {
  type Currency,
  type ProductCode,
  formatPrice,
} from "@/lib/commerce";
import { getUserMockOrders, type PaymentProviderCode } from "@/lib/mock-payment-store";
import { getRuntimeProduct } from "@/lib/product-config";
import { getPromotionRuntimeConfigMap } from "@/lib/promotion-config";
import { readShareAttribution } from "@/lib/share-attribution";
import {
  createUsageLog,
  getUsageLogsByFeature,
  type UsageLogRecord,
} from "@/lib/usage-log-store";

export type PromotionRule = {
  code: string;
  name: string;
  description: string;
  percentOff: number;
  maxDiscountCents: number;
  startsAt?: string;
  endsAt?: string;
  totalLimit?: number;
  perUserLimit?: number;
  firstPaidOrderOnly?: boolean;
  requiresShareAttribution?: boolean;
  productCodes?: ProductCode[];
  enabled?: boolean;
  configured?: boolean;
};

export type AppliedPromotion = {
  code: string;
  name: string;
  originalAmountCents: number;
  discountCents: number;
  finalAmountCents: number;
  currency: Currency;
};

export type PromotionQuote =
  | {
      ok: true;
      promotion: AppliedPromotion;
      priceLabel: string;
      originalPriceLabel: string;
      discountLabel: string;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type PromotionEventMetadata = AppliedPromotion & {
  event: "order_created" | "paid";
  userId: string;
  orderId: string;
  productCode: ProductCode;
  provider: PaymentProviderCode;
};

export type PromotionUsageSummary = {
  code: string;
  name: string;
  totalUsed: number;
  paidUsed: number;
  totalLimit?: number;
  perUserLimit?: number;
  remaining?: number;
  startsAt?: string;
  endsAt?: string;
  enabled: boolean;
  configured: boolean;
  active: boolean;
};

const minPayCents = 100;
export const promotionReservationTtlMinutes = 30;
const promotionReservationTtlMs = promotionReservationTtlMinutes * 60 * 1000;

const basePromotionRules: PromotionRule[] = [
  {
    code: "FIRST50",
    name: "首单半价",
    description: "新用户首个付费订单 5 折，最高减 30 元。每个用户限用 1 次。",
    percentOff: 50,
    maxDiscountCents: 3000,
    startsAt: "2026-07-01T00:00:00.000+08:00",
    endsAt: "2026-12-31T23:59:59.999+08:00",
    totalLimit: 200,
    perUserLimit: 1,
    firstPaidOrderOnly: true,
  },
  {
    code: "XUANJI20",
    name: "玄机 8 折",
    description: "活动期通用 8 折，最高减 20 元。每个用户限用 1 次。",
    percentOff: 20,
    maxDiscountCents: 2000,
    startsAt: "2026-07-01T00:00:00.000+08:00",
    endsAt: "2026-12-31T23:59:59.999+08:00",
    totalLimit: 500,
    perUserLimit: 1,
  },
  {
    code: "SHARE15",
    name: "分享回流 85 折",
    description: "从公开报告分享页回流的用户可用，最高减 15 元。每个用户限用 1 次。",
    percentOff: 15,
    maxDiscountCents: 1500,
    startsAt: "2026-07-01T00:00:00.000+08:00",
    endsAt: "2026-12-31T23:59:59.999+08:00",
    totalLimit: 300,
    perUserLimit: 1,
    requiresShareAttribution: true,
  },
];

function normalizePromotionCode(value: string | undefined) {
  return value?.trim().replace(/\s+/g, "").toUpperCase() ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function findRule(code: string, rules: PromotionRule[]) {
  return rules.find((rule) => rule.code === code);
}

function isRuleActive(rule: PromotionRule, now = new Date()) {
  const startsAt = rule.startsAt ? new Date(rule.startsAt) : null;
  const endsAt = rule.endsAt ? new Date(rule.endsAt) : null;

  return rule.enabled !== false &&
    (!startsAt || startsAt.getTime() <= now.getTime()) &&
    (!endsAt || endsAt.getTime() >= now.getTime());
}

async function hasPaidOrder(userId: string) {
  const orders = await getUserMockOrders(userId);

  return orders.some((order) => order.status === "PAID");
}

function calculateDiscount(amountCents: number, rule: PromotionRule) {
  const rawDiscount = Math.floor((amountCents * rule.percentOff) / 100);
  const cappedDiscount = Math.min(rawDiscount, rule.maxDiscountCents);
  const maxAllowedDiscount = Math.max(0, amountCents - minPayCents);

  return Math.min(cappedDiscount, maxAllowedDiscount);
}

function isFreshReservation(createdAt: string, now: Date) {
  const createdTime = new Date(createdAt).getTime();

  if (Number.isNaN(createdTime)) {
    return true;
  }

  return now.getTime() - createdTime <= promotionReservationTtlMs;
}

function uniqueUsedOrders(
  logs: UsageLogRecord[],
  code: string,
  userId?: string,
  now = new Date(),
) {
  const orders = new Map<string, { hasPaid: boolean; latestCreatedAt?: string }>();

  for (const log of logs) {
    const metadata = readPromotionLogMetadata(log);

    if (!metadata || metadata.code !== code || (userId && metadata.userId !== userId)) {
      continue;
    }

    const order = orders.get(metadata.orderId) ?? { hasPaid: false };

    if (metadata.event === "paid") {
      order.hasPaid = true;
    }

    if (
      metadata.event === "order_created" &&
      (!order.latestCreatedAt || log.createdAt > order.latestCreatedAt)
    ) {
      order.latestCreatedAt = log.createdAt;
    }

    orders.set(metadata.orderId, order);
  }

  return new Set(
    Array.from(orders.entries())
      .filter(([, order]) =>
        order.hasPaid ||
        (order.latestCreatedAt ? isFreshReservation(order.latestCreatedAt, now) : false),
      )
      .map(([orderId]) => orderId),
  );
}

function uniquePaidOrders(logs: UsageLogRecord[], code: string) {
  return new Set(
    logs
      .map(readPromotionLogMetadata)
      .filter((metadata): metadata is NonNullable<ReturnType<typeof readPromotionLogMetadata>> =>
        Boolean(metadata && metadata.code === code && metadata.event === "paid"),
      )
      .map((metadata) => metadata.orderId),
  );
}

export function getBasePromotionRules() {
  return basePromotionRules;
}

export async function getEffectivePromotionRules() {
  const configMap = await getPromotionRuntimeConfigMap();

  return basePromotionRules.map((rule) => {
    const config = configMap.get(rule.code);

    if (!config) {
      return {
        ...rule,
        enabled: rule.enabled ?? true,
        configured: false,
      };
    }

    return {
      ...rule,
      enabled: config.enabled ?? rule.enabled ?? true,
      startsAt: config.startsAt === undefined ? rule.startsAt : config.startsAt ?? undefined,
      endsAt: config.endsAt === undefined ? rule.endsAt : config.endsAt ?? undefined,
      totalLimit:
        config.totalLimit === undefined ? rule.totalLimit : config.totalLimit ?? undefined,
      perUserLimit:
        config.perUserLimit === undefined ? rule.perUserLimit : config.perUserLimit ?? undefined,
      configured: true,
    };
  });
}

export function getPromotionUsageSummaries(
  logs: UsageLogRecord[],
  rules: PromotionRule[] = basePromotionRules,
  now = new Date(),
): PromotionUsageSummary[] {
  return rules.map((rule) => {
    const totalUsed = uniqueUsedOrders(logs, rule.code, undefined, now).size;
    const paidUsed = uniquePaidOrders(logs, rule.code).size;
    const remaining =
      rule.totalLimit === undefined ? undefined : Math.max(rule.totalLimit - totalUsed, 0);

    return {
      code: rule.code,
      name: rule.name,
      totalUsed,
      paidUsed,
      totalLimit: rule.totalLimit,
      perUserLimit: rule.perUserLimit,
      remaining,
      startsAt: rule.startsAt,
      endsAt: rule.endsAt,
      enabled: rule.enabled ?? true,
      configured: Boolean(rule.configured),
      active: isRuleActive(rule, now) && (remaining === undefined || remaining > 0),
    };
  });
}

export async function quotePromotion(input: {
  userId: string;
  productCode: ProductCode;
  code?: string;
}): Promise<PromotionQuote> {
  const code = normalizePromotionCode(input.code);

  if (!code) {
    return { ok: false, message: "请输入优惠码。" };
  }

  const rules = await getEffectivePromotionRules();
  const rule = findRule(code, rules);

  if (!rule) {
    return { ok: false, message: "优惠码不存在或已失效。" };
  }

  if (rule.enabled === false) {
    return { ok: false, message: "该优惠码已暂停使用。" };
  }

  if (!isRuleActive(rule)) {
    return { ok: false, message: "优惠码不在活动有效期内。" };
  }

  const product = await getRuntimeProduct(input.productCode);

  if (!product) {
    return { ok: false, message: "商品不存在或暂不可购买。" };
  }

  if (rule.productCodes && !rule.productCodes.includes(input.productCode)) {
    return { ok: false, message: "该优惠码不适用于当前商品。" };
  }

  if (rule.firstPaidOrderOnly && (await hasPaidOrder(input.userId))) {
    return { ok: false, message: "首单优惠仅限未支付过的新用户使用。" };
  }

  if (rule.requiresShareAttribution && !(await readShareAttribution())) {
    return { ok: false, message: "该优惠码仅限从分享页回流后使用。" };
  }

  const promotionLogs = await getUsageLogsByFeature("promo_event", { take: 5000 });
  const totalUsed = uniqueUsedOrders(promotionLogs, rule.code).size;
  const userUsed = uniqueUsedOrders(promotionLogs, rule.code, input.userId).size;

  if (rule.totalLimit !== undefined && totalUsed >= rule.totalLimit) {
    return { ok: false, message: "该优惠码已达到活动使用上限。" };
  }

  if (rule.perUserLimit !== undefined && userUsed >= rule.perUserLimit) {
    return { ok: false, message: "该优惠码每个用户仅限使用一次。" };
  }

  const discountCents = calculateDiscount(product.priceCents, rule);

  if (discountCents <= 0) {
    return { ok: false, message: "该商品暂不满足优惠条件。" };
  }

  const promotion: AppliedPromotion = {
    code: rule.code,
    name: rule.name,
    originalAmountCents: product.priceCents,
    discountCents,
    finalAmountCents: product.priceCents - discountCents,
    currency: product.currency,
  };

  return {
    ok: true,
    promotion,
    priceLabel: formatPrice(promotion.finalAmountCents, promotion.currency),
    originalPriceLabel: formatPrice(promotion.originalAmountCents, promotion.currency),
    discountLabel: `-${formatPrice(promotion.discountCents, promotion.currency)}`,
    message: rule.description,
  };
}

export async function recordPromotionEvent(input: {
  event: PromotionEventMetadata["event"];
  userId: string;
  orderId: string;
  productCode: ProductCode;
  provider: PaymentProviderCode;
  promotion?: AppliedPromotion;
}) {
  if (!input.promotion) {
    return null;
  }

  return createUsageLog({
    userId: input.userId,
    provider: "internal",
    model: "promotion-ledger",
    feature: "promo_event",
    costCents: 0,
    metadata: {
      ...input.promotion,
      event: input.event,
      userId: input.userId,
      orderId: input.orderId,
      productCode: input.productCode,
      provider: input.provider,
    } satisfies PromotionEventMetadata,
  });
}

export function readPromotionFromMetadata(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  const code = readString(value.code);
  const name = readString(value.name);
  const currency = readString(value.currency);
  const originalAmountCents = readNumber(value.originalAmountCents);
  const discountCents = readNumber(value.discountCents);
  const finalAmountCents = readNumber(value.finalAmountCents);

  if (
    !code ||
    !name ||
    (currency !== "CNY" && currency !== "USD") ||
    originalAmountCents === undefined ||
    discountCents === undefined ||
    finalAmountCents === undefined
  ) {
    return undefined;
  }

  return {
    code,
    name,
    originalAmountCents,
    discountCents,
    finalAmountCents,
    currency,
  } satisfies AppliedPromotion;
}

export function readPromotionLogMetadata(log: UsageLogRecord) {
  if (log.feature !== "promo_event" || !isRecord(log.metadata)) {
    return undefined;
  }

  const promotion = readPromotionFromMetadata(log.metadata);
  const event = log.metadata.event;
  const userId = readString(log.metadata.userId);
  const orderId = readString(log.metadata.orderId);
  const productCode = readString(log.metadata.productCode);
  const provider = readString(log.metadata.provider);

  if (
    !promotion ||
    (event !== "order_created" && event !== "paid") ||
    !userId ||
    !orderId ||
    !productCode ||
    (provider !== "MOCK" && provider !== "ALIPAY" && provider !== "WECHAT_PAY")
  ) {
    return undefined;
  }

  return {
    ...promotion,
    event,
    userId,
    orderId,
    productCode: productCode as ProductCode,
    provider,
  } satisfies PromotionEventMetadata;
}
