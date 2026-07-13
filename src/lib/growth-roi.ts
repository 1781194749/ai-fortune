import "server-only";

import type { ChannelBudgetConfig } from "@/lib/channel-budget-config";
import { readPromotionLogMetadata } from "@/lib/promo-code";
import { readShareAttributionMetadata } from "@/lib/share-attribution";
import type { UsageLogRecord } from "@/lib/usage-log-store";

export type GrowthRoiRow = {
  source: string;
  landings: number;
  logins: number;
  orders: number;
  paidOrders: number;
  revenueCents: number;
  discountCents: number;
  budgetCents: number;
  netReturnCents: number;
  listAmountCents: number;
  conversionRate: number;
  roiMultiple?: number;
  spendRoiMultiple?: number;
  blendedRoiMultiple?: number;
  promotionCodes: string[];
  shareSlugs: string[];
};

type SourceBucket = {
  source: string;
  landings: number;
  loginUsers: Set<string>;
  orderIds: Set<string>;
  paidOrderIds: Set<string>;
  revenueCents: number;
  discountCents: number;
  promotionCodes: Set<string>;
  shareSlugs: Set<string>;
};

function createBucket(source: string): SourceBucket {
  return {
    source,
    landings: 0,
    loginUsers: new Set<string>(),
    orderIds: new Set<string>(),
    paidOrderIds: new Set<string>(),
    revenueCents: 0,
    discountCents: 0,
    promotionCodes: new Set<string>(),
    shareSlugs: new Set<string>(),
  };
}

function getBucket(buckets: Map<string, SourceBucket>, source: string) {
  const existing = buckets.get(source);

  if (existing) {
    return existing;
  }

  const bucket = createBucket(source);
  buckets.set(source, bucket);

  return bucket;
}

export function buildGrowthRoiRows(
  logs: UsageLogRecord[],
  budgetConfigs: Map<string, ChannelBudgetConfig> = new Map(),
) {
  const attributionEvents = logs
    .map((log) => readShareAttributionMetadata(log))
    .filter((metadata): metadata is NonNullable<typeof metadata> => Boolean(metadata));
  const paidPromotionsByOrderId = new Map(
    logs
      .map((log) => readPromotionLogMetadata(log))
      .filter((metadata): metadata is NonNullable<typeof metadata> =>
        Boolean(metadata && metadata.event === "paid"),
      )
      .map((metadata) => [metadata.orderId, metadata] as const),
  );
  const buckets = new Map<string, SourceBucket>();

  for (const metadata of attributionEvents) {
    const bucket = getBucket(buckets, metadata.source);

    bucket.shareSlugs.add(metadata.shareSlug);

    if (metadata.event === "landing") {
      bucket.landings += 1;
    }

    if (metadata.event === "login" && metadata.userId) {
      bucket.loginUsers.add(metadata.userId);
    }

    if (metadata.event === "order_created" && metadata.orderId) {
      bucket.orderIds.add(metadata.orderId);
    }

    if (metadata.event === "paid" && metadata.orderId) {
      const promotion = paidPromotionsByOrderId.get(metadata.orderId);

      bucket.paidOrderIds.add(metadata.orderId);
      bucket.revenueCents += metadata.amountCents ?? promotion?.finalAmountCents ?? 0;

      if (promotion) {
        bucket.discountCents += promotion.discountCents;
        bucket.promotionCodes.add(promotion.code);
      }
    }
  }

  return Array.from(buckets.values())
    .map((bucket) => {
      const paidOrders = bucket.paidOrderIds.size;
      const budgetCents = budgetConfigs.get(bucket.source)?.budgetCents ?? 0;
      const totalMarketingCostCents = bucket.discountCents + budgetCents;
      const conversionRate = bucket.landings > 0 ? paidOrders / bucket.landings : 0;
      const roiMultiple =
        bucket.discountCents > 0 ? bucket.revenueCents / bucket.discountCents : undefined;
      const spendRoiMultiple =
        budgetCents > 0 ? bucket.revenueCents / budgetCents : undefined;
      const blendedRoiMultiple =
        totalMarketingCostCents > 0
          ? bucket.revenueCents / totalMarketingCostCents
          : undefined;

      return {
        source: bucket.source,
        landings: bucket.landings,
        logins: bucket.loginUsers.size,
        orders: bucket.orderIds.size,
        paidOrders,
        revenueCents: bucket.revenueCents,
        discountCents: bucket.discountCents,
        budgetCents,
        netReturnCents: bucket.revenueCents - totalMarketingCostCents,
        listAmountCents: bucket.revenueCents + bucket.discountCents,
        conversionRate,
        roiMultiple,
        spendRoiMultiple,
        blendedRoiMultiple,
        promotionCodes: Array.from(bucket.promotionCodes).sort(),
        shareSlugs: Array.from(bucket.shareSlugs).sort(),
      } satisfies GrowthRoiRow;
    })
    .filter(
      (row) =>
        row.landings > 0 ||
        row.logins > 0 ||
        row.orders > 0 ||
        row.paidOrders > 0,
    )
    .sort((a, b) => b.revenueCents - a.revenueCents || b.paidOrders - a.paidOrders);
}
