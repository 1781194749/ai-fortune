import "server-only";

import {
  channelSegmentLabels,
  classifyChannelSource,
  type ChannelSegmentCode,
} from "@/lib/channel-source";
import type { GrowthRoiRow } from "@/lib/growth-roi";

export { classifyChannelSource };

export type ChannelSegmentStrategy = {
  code: ChannelSegmentCode;
  name: string;
  sources: string[];
  landings: number;
  logins: number;
  orders: number;
  paidOrders: number;
  revenueCents: number;
  discountCents: number;
  budgetCents: number;
  netReturnCents: number;
  conversionRate: number;
  roiMultiple?: number;
  spendRoiMultiple?: number;
  blendedRoiMultiple?: number;
  budgetAction: string;
  offerAction: string;
  contentAction: string;
  priority: "scale" | "optimize" | "observe" | "pause";
};

function emptySegment(code: ChannelSegmentCode): ChannelSegmentStrategy {
  return {
    code,
    name: channelSegmentLabels[code],
    sources: [],
    landings: 0,
    logins: 0,
    orders: 0,
    paidOrders: 0,
    revenueCents: 0,
    discountCents: 0,
    budgetCents: 0,
    netReturnCents: 0,
    conversionRate: 0,
    budgetAction: "继续采样",
    offerAction: "保持当前优惠",
    contentAction: "保留现有入口",
    priority: "observe",
  };
}

function finalizeStrategy(segment: ChannelSegmentStrategy): ChannelSegmentStrategy {
  const conversionRate = segment.landings > 0 ? segment.paidOrders / segment.landings : 0;
  const roiMultiple =
    segment.discountCents > 0 ? segment.revenueCents / segment.discountCents : undefined;
  const spendRoiMultiple =
    segment.budgetCents > 0 ? segment.revenueCents / segment.budgetCents : undefined;
  const totalMarketingCostCents = segment.discountCents + segment.budgetCents;
  const blendedRoiMultiple =
    totalMarketingCostCents > 0 ? segment.revenueCents / totalMarketingCostCents : undefined;
  const netReturnCents = segment.revenueCents - totalMarketingCostCents;
  const hasRevenue = segment.paidOrders > 0;

  if (
    hasRevenue &&
    conversionRate >= 0.08 &&
    (blendedRoiMultiple === undefined || blendedRoiMultiple >= 2.5)
  ) {
    return {
      ...segment,
      conversionRate,
      roiMultiple,
      spendRoiMultiple,
      blendedRoiMultiple,
      netReturnCents,
      budgetAction: "加预算",
      offerAction: "保持当前券面",
      contentAction: "复制高转化报告模板和入口话术",
      priority: "scale",
    };
  }

  if ((segment.landings >= 8 || segment.budgetCents > 0) && segment.orders === 0) {
    return {
      ...segment,
      conversionRate,
      roiMultiple,
      spendRoiMultiple,
      blendedRoiMultiple,
      netReturnCents,
      budgetAction: "暂停放量",
      offerAction: "不要加大让利",
      contentAction: "重做落地页首屏和购买入口",
      priority: "pause",
    };
  }

  if (segment.orders > 0 && segment.paidOrders === 0) {
    return {
      ...segment,
      conversionRate,
      roiMultiple,
      spendRoiMultiple,
      blendedRoiMultiple,
      netReturnCents,
      budgetAction: "小流量观察",
      offerAction: "尝试低额限时券或星力加赠",
      contentAction: "补强待支付提醒和权益解释",
      priority: "optimize",
    };
  }

  if (
    totalMarketingCostCents > 0 &&
    blendedRoiMultiple !== undefined &&
    blendedRoiMultiple < 2.5
  ) {
    return {
      ...segment,
      conversionRate,
      roiMultiple,
      spendRoiMultiple,
      blendedRoiMultiple,
      netReturnCents,
      budgetAction: "控制预算",
      offerAction: "降低折扣或改为会员加赠",
      contentAction: "只保留高意向回流入口",
      priority: "optimize",
    };
  }

  return {
    ...segment,
    conversionRate,
    roiMultiple,
    spendRoiMultiple,
    blendedRoiMultiple,
    netReturnCents,
  };
}

export function buildChannelSegmentStrategies(rows: GrowthRoiRow[]) {
  const segments = new Map<ChannelSegmentCode, ChannelSegmentStrategy>();

  for (const code of ["organic", "poster", "private", "paid_or_kol", "unknown"] as const) {
    segments.set(code, emptySegment(code));
  }

  for (const row of rows) {
    const code = classifyChannelSource(row.source);
    const segment = segments.get(code) ?? emptySegment(code);

    segment.sources.push(row.source);
    segment.landings += row.landings;
    segment.logins += row.logins;
    segment.orders += row.orders;
    segment.paidOrders += row.paidOrders;
    segment.revenueCents += row.revenueCents;
    segment.discountCents += row.discountCents;
    segment.budgetCents += row.budgetCents;
    segment.netReturnCents += row.netReturnCents;
    segments.set(code, segment);
  }

  const priorityRank = {
    scale: 0,
    optimize: 1,
    pause: 2,
    observe: 3,
  };

  return Array.from(segments.values())
    .filter(
      (segment) =>
        segment.landings > 0 ||
        segment.logins > 0 ||
        segment.orders > 0 ||
        segment.paidOrders > 0,
    )
    .map((segment) => ({
      ...finalizeStrategy(segment),
      sources: Array.from(new Set(segment.sources)).sort(),
    }))
    .sort(
      (a, b) =>
        priorityRank[a.priority] - priorityRank[b.priority] ||
        b.revenueCents - a.revenueCents ||
        b.paidOrders - a.paidOrders,
    );
}
