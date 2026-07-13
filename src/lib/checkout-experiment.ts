import "server-only";

import { createHash } from "crypto";
import type { Currency, ProductCode } from "@/lib/commerce";
import { getUserMockOrders, type PaymentProviderCode } from "@/lib/mock-payment-store";
import {
  createUsageLog,
  getUsageLogsByFeature,
  type UsageLogRecord,
} from "@/lib/usage-log-store";

export type CheckoutExperimentVariant = "first50" | "xuanji20";
export type CheckoutExperimentEvent = "exposure" | "order_created" | "paid";
export type CheckoutExperimentRolloutMode = "experiment" | "forced";

export type CheckoutExperimentAssignment = {
  key: string;
  variant: CheckoutExperimentVariant;
  title: string;
  badge: string;
  description: string;
  promotionCode: "FIRST50" | "XUANJI20";
};

export type CheckoutExperimentMetadata = CheckoutExperimentAssignment & {
  event: CheckoutExperimentEvent;
  userId: string;
  orderId?: string;
  productCode?: ProductCode;
  provider?: PaymentProviderCode;
  amountCents?: number;
  currency?: Currency;
};

export type CheckoutExperimentRow = {
  key: string;
  variant: CheckoutExperimentVariant;
  title: string;
  promotionCode: string;
  exposures: number;
  orders: number;
  paidOrders: number;
  revenueCents: number;
  conversionRate: number;
  paymentRate: number;
};

export type CheckoutExperimentConfig = {
  key: string;
  mode: CheckoutExperimentRolloutMode;
  forcedVariant?: CheckoutExperimentVariant;
  updatedAt: string;
  updatedBy: string;
  note?: string;
};

export type CheckoutExperimentConfigMetadata = {
  event: "checkout_experiment_config_updated";
  config: CheckoutExperimentConfig;
};

export type CheckoutExperimentRecommendation = {
  status: "collecting" | "ready" | "inconclusive";
  winner?: CheckoutExperimentVariant;
  loser?: CheckoutExperimentVariant;
  title: string;
  reason: string;
  nextStep: string;
};

export const checkoutExperimentKey = "new_user_first_offer_v1";

const assignments: Record<CheckoutExperimentVariant, CheckoutExperimentAssignment> = {
  first50: {
    key: checkoutExperimentKey,
    variant: "first50",
    title: "首单半价",
    badge: "新客半价礼",
    description: "首个付费订单 5 折，适合先体验完整会员权益。",
    promotionCode: "FIRST50",
  },
  xuanji20: {
    key: checkoutExperimentKey,
    variant: "xuanji20",
    title: "新客 8 折",
    badge: "新客轻享礼",
    description: "新用户专属 8 折，适合长期使用 AI 推演和报告中心。",
    promotionCode: "XUANJI20",
  },
};

declare global {
  var xuanjiCheckoutExperimentConfig: CheckoutExperimentConfig | undefined;
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

function normalizeVariant(value: unknown): CheckoutExperimentVariant | undefined {
  return value === "first50" || value === "xuanji20" ? value : undefined;
}

function normalizeRolloutMode(value: unknown): CheckoutExperimentRolloutMode | undefined {
  return value === "experiment" || value === "forced" ? value : undefined;
}

function normalizeEvent(value: unknown): CheckoutExperimentEvent | undefined {
  return value === "exposure" || value === "order_created" || value === "paid"
    ? value
    : undefined;
}

function normalizeProvider(value: unknown): PaymentProviderCode | undefined {
  return value === "MOCK" || value === "ALIPAY" || value === "WECHAT_PAY"
    ? value
    : undefined;
}

function normalizeCurrency(value: unknown): Currency | undefined {
  return value === "CNY" || value === "USD" ? value : undefined;
}

export function getCheckoutExperimentAssignment(variant: CheckoutExperimentVariant) {
  return assignments[variant];
}

function getBucketedNewUserCheckoutExperiment(userId: string) {
  const bucket = createHash("sha256")
    .update(`${checkoutExperimentKey}:${userId}`)
    .digest()[0] % 2;

  return bucket === 0 ? assignments.first50 : assignments.xuanji20;
}

function readCheckoutExperimentConfigMetadata(log: UsageLogRecord) {
  if (log.feature !== "experiment_config" || !isRecord(log.metadata)) {
    return undefined;
  }

  if (log.metadata.event !== "checkout_experiment_config_updated" || !isRecord(log.metadata.config)) {
    return undefined;
  }

  const key = readString(log.metadata.config.key);
  const mode = normalizeRolloutMode(log.metadata.config.mode);
  const forcedVariant = normalizeVariant(log.metadata.config.forcedVariant);
  const updatedAt = readString(log.metadata.config.updatedAt);
  const updatedBy = readString(log.metadata.config.updatedBy);

  if (
    key !== checkoutExperimentKey ||
    !mode ||
    !updatedAt ||
    !updatedBy ||
    (mode === "forced" && !forcedVariant)
  ) {
    return undefined;
  }

  return {
    event: "checkout_experiment_config_updated",
    config: {
      key,
      mode,
      forcedVariant: mode === "forced" ? forcedVariant : undefined,
      updatedAt,
      updatedBy,
      note: readString(log.metadata.config.note),
    },
  } satisfies CheckoutExperimentConfigMetadata;
}

export async function getCheckoutExperimentConfig() {
  if (globalThis.xuanjiCheckoutExperimentConfig) {
    return globalThis.xuanjiCheckoutExperimentConfig;
  }

  const logs = await getUsageLogsByFeature("experiment_config", { take: 20 });
  const latest = logs.map(readCheckoutExperimentConfigMetadata).find(Boolean);

  if (latest) {
    globalThis.xuanjiCheckoutExperimentConfig = latest.config;
    return latest.config;
  }

  return {
    key: checkoutExperimentKey,
    mode: "experiment",
    updatedAt: new Date(0).toISOString(),
    updatedBy: "system",
  } satisfies CheckoutExperimentConfig;
}

export async function saveCheckoutExperimentConfig(input: {
  mode: CheckoutExperimentRolloutMode;
  forcedVariant?: CheckoutExperimentVariant;
  updatedBy?: string;
  note?: string;
}) {
  if (input.mode === "forced" && !input.forcedVariant) {
    throw new Error("forcedVariant is required when checkout experiment mode is forced.");
  }

  const config = {
    key: checkoutExperimentKey,
    mode: input.mode,
    forcedVariant: input.mode === "forced" ? input.forcedVariant : undefined,
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy ?? process.env.ADMIN_AUDIT_OPERATOR ?? "admin",
    note: input.note,
  } satisfies CheckoutExperimentConfig;

  globalThis.xuanjiCheckoutExperimentConfig = config;

  const metadata = {
    event: "checkout_experiment_config_updated",
    config,
  } satisfies CheckoutExperimentConfigMetadata;

  await createUsageLog({
    provider: "internal",
    model: "checkout-experiment-config",
    feature: "experiment_config",
    costCents: 0,
    metadata,
  });

  return config;
}

export function readCheckoutExperimentConfigLog(log: UsageLogRecord) {
  return readCheckoutExperimentConfigMetadata(log);
}

export async function getNewUserCheckoutExperiment(userId: string) {
  const config = await getCheckoutExperimentConfig();

  if (config.mode === "forced" && config.forcedVariant) {
    return assignments[config.forcedVariant];
  }

  return getBucketedNewUserCheckoutExperiment(userId);
}

export async function getEligibleNewUserCheckoutExperiment(userId: string) {
  const orders = await getUserMockOrders(userId);

  if (orders.some((order) => order.status === "PAID")) {
    return null;
  }

  return getNewUserCheckoutExperiment(userId);
}

function buildMetadata(input: {
  assignment: CheckoutExperimentAssignment;
  event: CheckoutExperimentEvent;
  userId: string;
  orderId?: string;
  productCode?: ProductCode;
  provider?: PaymentProviderCode;
  amountCents?: number;
  currency?: Currency;
}) {
  return {
    ...input.assignment,
    event: input.event,
    userId: input.userId,
    orderId: input.orderId,
    productCode: input.productCode,
    provider: input.provider,
    amountCents: input.amountCents,
    currency: input.currency,
  } satisfies CheckoutExperimentMetadata;
}

async function recordCheckoutExperimentEvent(input: {
  assignment: CheckoutExperimentAssignment;
  event: CheckoutExperimentEvent;
  userId: string;
  orderId?: string;
  productCode?: ProductCode;
  provider?: PaymentProviderCode;
  amountCents?: number;
  currency?: Currency;
}) {
  return createUsageLog({
    userId: input.userId,
    provider: "internal",
    model: "checkout-experiment",
    feature: "experiment_event",
    costCents: 0,
    metadata: buildMetadata(input),
  });
}

export async function recordCheckoutExperimentExposure(userId: string) {
  const assignment = await getEligibleNewUserCheckoutExperiment(userId);

  if (!assignment) {
    return null;
  }

  return recordCheckoutExperimentEvent({
    assignment,
    event: "exposure",
    userId,
  });
}

export async function recordCheckoutExperimentOrderCreated(input: {
  assignment: CheckoutExperimentAssignment | null;
  userId: string;
  orderId: string;
  productCode: ProductCode;
  provider: PaymentProviderCode;
  amountCents: number;
  currency: Currency;
}) {
  if (!input.assignment) {
    return null;
  }

  return recordCheckoutExperimentEvent({
    assignment: input.assignment,
    event: "order_created",
    userId: input.userId,
    orderId: input.orderId,
    productCode: input.productCode,
    provider: input.provider,
    amountCents: input.amountCents,
    currency: input.currency,
  });
}

export async function recordCheckoutExperimentPaid(input: {
  userId: string;
  orderId: string;
  productCode: ProductCode;
  provider: PaymentProviderCode;
  amountCents: number;
  currency: Currency;
}) {
  const logs = await getUsageLogsByFeature("experiment_event", { take: 5000 });
  const orderCreated = logs
    .map(readCheckoutExperimentMetadata)
    .find(
      (metadata) =>
        metadata?.event === "order_created" && metadata.orderId === input.orderId,
    );

  if (!orderCreated) {
    return null;
  }

  return recordCheckoutExperimentEvent({
    assignment: {
      key: orderCreated.key,
      variant: orderCreated.variant,
      title: orderCreated.title,
      badge: orderCreated.badge,
      description: orderCreated.description,
      promotionCode: orderCreated.promotionCode,
    },
    event: "paid",
    userId: input.userId,
    orderId: input.orderId,
    productCode: input.productCode,
    provider: input.provider,
    amountCents: input.amountCents,
    currency: input.currency,
  });
}

export function readCheckoutExperimentMetadata(log: UsageLogRecord) {
  if (log.feature !== "experiment_event" || !isRecord(log.metadata)) {
    return undefined;
  }

  const key = readString(log.metadata.key);
  const variant = normalizeVariant(log.metadata.variant);
  const title = readString(log.metadata.title);
  const badge = readString(log.metadata.badge);
  const description = readString(log.metadata.description);
  const promotionCode = readString(log.metadata.promotionCode);
  const event = normalizeEvent(log.metadata.event);
  const userId = readString(log.metadata.userId);

  if (
    key !== checkoutExperimentKey ||
    !variant ||
    !title ||
    !badge ||
    !description ||
    (promotionCode !== "FIRST50" && promotionCode !== "XUANJI20") ||
    !event ||
    !userId
  ) {
    return undefined;
  }

  return {
    key,
    variant,
    title,
    badge,
    description,
    promotionCode,
    event,
    userId,
    orderId: readString(log.metadata.orderId),
    productCode: readString(log.metadata.productCode) as ProductCode | undefined,
    provider: normalizeProvider(log.metadata.provider),
    amountCents: readNumber(log.metadata.amountCents),
    currency: normalizeCurrency(log.metadata.currency),
  } satisfies CheckoutExperimentMetadata;
}

export function buildCheckoutExperimentRows(logs: UsageLogRecord[]) {
  const rows = new Map<CheckoutExperimentVariant, {
    assignment: CheckoutExperimentAssignment;
    exposureUsers: Set<string>;
    orderIds: Set<string>;
    paidOrderIds: Set<string>;
    revenueCents: number;
  }>();

  for (const assignment of Object.values(assignments)) {
    rows.set(assignment.variant, {
      assignment,
      exposureUsers: new Set<string>(),
      orderIds: new Set<string>(),
      paidOrderIds: new Set<string>(),
      revenueCents: 0,
    });
  }

  for (const log of logs) {
    const metadata = readCheckoutExperimentMetadata(log);

    if (!metadata) {
      continue;
    }

    const row = rows.get(metadata.variant);

    if (!row) {
      continue;
    }

    if (metadata.event === "exposure") {
      row.exposureUsers.add(metadata.userId);
    }

    if (metadata.event === "order_created" && metadata.orderId) {
      row.orderIds.add(metadata.orderId);
    }

    if (metadata.event === "paid" && metadata.orderId) {
      row.paidOrderIds.add(metadata.orderId);
      row.revenueCents += metadata.amountCents ?? 0;
    }
  }

  return Array.from(rows.values()).map((row) => {
    const exposures = row.exposureUsers.size;
    const orders = row.orderIds.size;
    const paidOrders = row.paidOrderIds.size;

    return {
      key: row.assignment.key,
      variant: row.assignment.variant,
      title: row.assignment.title,
      promotionCode: row.assignment.promotionCode,
      exposures,
      orders,
      paidOrders,
      revenueCents: row.revenueCents,
      conversionRate: exposures > 0 ? paidOrders / exposures : 0,
      paymentRate: orders > 0 ? paidOrders / orders : 0,
    } satisfies CheckoutExperimentRow;
  });
}

export function buildCheckoutExperimentRecommendation(
  rows: CheckoutExperimentRow[],
): CheckoutExperimentRecommendation {
  const [first50, xuanji20] = [
    rows.find((row) => row.variant === "first50"),
    rows.find((row) => row.variant === "xuanji20"),
  ];

  if (!first50 || !xuanji20) {
    return {
      status: "collecting",
      title: "继续采样",
      reason: "实验数据尚未完整生成。",
      nextStep: "保持 A/B 分流，等两个变体都有曝光和下单数据后再判断。",
    };
  }

  const totalPaid = first50.paidOrders + xuanji20.paidOrders;
  const minExposure = Math.min(first50.exposures, xuanji20.exposures);

  if (totalPaid < 4 || minExposure < 5) {
    return {
      status: "collecting",
      title: "继续采样",
      reason: `当前累计 ${totalPaid} 笔支付，较小曝光组 ${minExposure} 人，样本还偏少。`,
      nextStep: "继续跑 A/B，至少等 4 笔支付且两组各 5 次曝光后再固化默认券。",
    };
  }

  const revenuePerExposure = (row: CheckoutExperimentRow) =>
    row.exposures > 0 ? row.revenueCents / row.exposures : 0;
  const firstScore = revenuePerExposure(first50);
  const xuanjiScore = revenuePerExposure(xuanji20);
  const winner = firstScore >= xuanjiScore ? first50 : xuanji20;
  const loser = winner.variant === "first50" ? xuanji20 : first50;
  const scoreGap = loser.exposures > 0
    ? Math.abs(revenuePerExposure(winner) - revenuePerExposure(loser)) / Math.max(revenuePerExposure(loser), 1)
    : 1;

  if (scoreGap < 0.15) {
    return {
      status: "inconclusive",
      title: "暂不固化",
      reason: "两组曝光实收差距低于 15%，还不足以说明哪一个明显更优。",
      nextStep: "继续观察 3-5 天，优先比较实收/曝光而不是单纯转化率。",
    };
  }

  return {
    status: "ready",
    winner: winner.variant,
    loser: loser.variant,
    title: `建议固化 ${winner.title}`,
    reason: `${winner.title} 的实收/曝光优于 ${loser.title}，当前更适合作为默认新客券。`,
    nextStep: `将新用户默认优惠切换为 ${winner.promotionCode}，并保留另一组作为后续复测。`,
  };
}
