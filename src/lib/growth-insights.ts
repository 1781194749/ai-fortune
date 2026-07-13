import "server-only";

import type { GrowthRoiRow } from "@/lib/growth-roi";
import type { MockOrder } from "@/lib/mock-payment-store";
import type { PromotionUsageSummary } from "@/lib/promo-code";

export type GrowthInsightPriority = "high" | "medium" | "low";

export type SourceGrowthInsight = {
  source: string;
  priority: GrowthInsightPriority;
  action: string;
  reason: string;
  nextStep: string;
  funnelLabel: string;
  conversionLabel: string;
};

export type PromotionRiskInsight = {
  code: string;
  priority: GrowthInsightPriority;
  action: string;
  reason: string;
  nextStep: string;
  occupiedLabel: string;
  remainingLabel: string;
};

const priorityRank: Record<GrowthInsightPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function formatPercent(value: number) {
  return `${(value * 100).toFixed(value > 0 && value < 0.1 ? 1 : 0)}%`;
}

function comparePriority<T extends { priority: GrowthInsightPriority }>(a: T, b: T) {
  return priorityRank[a.priority] - priorityRank[b.priority];
}

export function buildSourceGrowthInsights(rows: GrowthRoiRow[]): SourceGrowthInsight[] {
  return rows
    .map((row) => {
      const loginRate = row.landings > 0 ? row.logins / row.landings : 0;
      const paidRate = row.conversionRate;
      const discountRatio =
        row.listAmountCents > 0 ? row.discountCents / row.listAmountCents : 0;
      const funnelLabel = `${row.landings} 落地 / ${row.logins} 登录 / ${row.orders} 下单 / ${row.paidOrders} 支付`;
      const conversionLabel = `支付转化 ${formatPercent(paidRate)}`;

      if (
        row.paidOrders >= 2 &&
        paidRate >= 0.08 &&
        (row.roiMultiple === undefined || row.roiMultiple >= 3)
      ) {
        return {
          source: row.source,
          priority: "high",
          action: "加码优质来源",
          reason: `该来源已有 ${row.paidOrders} 笔支付，支付转化达到 ${formatPercent(paidRate)}。`,
          nextStep: "保留当前落地页和券面，追加同类内容或达人渠道，并设置日预算上限。",
          funnelLabel,
          conversionLabel,
        } satisfies SourceGrowthInsight;
      }

      if (row.landings >= 5 && row.orders === 0) {
        return {
          source: row.source,
          priority: "high",
          action: "优化落地入口",
          reason: `已有 ${row.landings} 次落地但尚未下单，入口承接或权益表达可能偏弱。`,
          nextStep: "改分享页回流按钮、首单券提示和报告样例摘要，先做小流量复测。",
          funnelLabel,
          conversionLabel,
        } satisfies SourceGrowthInsight;
      }

      if (row.orders > 0 && row.paidOrders === 0) {
        return {
          source: row.source,
          priority: "medium",
          action: "追回未支付订单",
          reason: `已有 ${row.orders} 个订单但尚未支付，用户意图已经出现。`,
          nextStep: "在会员页加强待支付提醒，并尝试较小折扣或限时权益替代大额让利。",
          funnelLabel,
          conversionLabel,
        } satisfies SourceGrowthInsight;
      }

      if (discountRatio >= 0.25 && (row.roiMultiple ?? 0) < 3) {
        return {
          source: row.source,
          priority: "medium",
          action: "收窄让利",
          reason: `让利占折前金额 ${formatPercent(discountRatio)}，收入/让利倍数偏低。`,
          nextStep: "把大额券切换为小额券或会员加赠星力，观察实收是否改善。",
          funnelLabel,
          conversionLabel,
        } satisfies SourceGrowthInsight;
      }

      if (loginRate >= 0.2 && row.paidOrders === 0) {
        return {
          source: row.source,
          priority: "medium",
          action: "强化首单转化",
          reason: `登录率达到 ${formatPercent(loginRate)}，但支付尚未发生。`,
          nextStep: "在登录后首屏露出体验卡或首单半价，减少用户从兴趣到付款的跳转。",
          funnelLabel,
          conversionLabel,
        } satisfies SourceGrowthInsight;
      }

      return {
        source: row.source,
        priority: "low",
        action: "继续采样",
        reason: "当前样本还不足以判断投放质量。",
        nextStep: "先保持追踪，等至少 5 次落地或 1 笔支付后再调整优惠策略。",
        funnelLabel,
        conversionLabel,
      } satisfies SourceGrowthInsight;
    })
    .sort((a, b) => comparePriority(a, b) || a.source.localeCompare(b.source))
    .slice(0, 6);
}

export function buildPromotionRiskInsights(
  summaries: PromotionUsageSummary[],
  orders: MockOrder[],
): PromotionRiskInsight[] {
  return summaries
    .map((summary) => {
      const relatedOrders = orders.filter((order) => order.promotionCode === summary.code);
      const pendingOrders = relatedOrders.filter((order) => order.status === "PENDING").length;
      const paidOrders = relatedOrders.filter((order) => order.status === "PAID").length;
      const paidRate = summary.totalUsed > 0 ? summary.paidUsed / summary.totalUsed : 0;
      const remainingRate =
        summary.totalLimit && summary.remaining !== undefined
          ? summary.remaining / summary.totalLimit
          : undefined;
      const occupiedLabel = `占用 ${summary.totalUsed} / 支付 ${summary.paidUsed}`;
      const remainingLabel =
        summary.remaining === undefined ? "剩余不限" : `剩余 ${summary.remaining}`;

      if (!summary.active) {
        return {
          code: summary.code,
          priority: "high",
          action: "停止前端露出",
          reason: "该优惠码当前不可用，继续展示会造成用户下单失败。",
          nextStep: "从活动文案和购买页中移除，或重新配置有效期与额度后再上线。",
          occupiedLabel,
          remainingLabel,
        } satisfies PromotionRiskInsight;
      }

      if (remainingRate !== undefined && remainingRate <= 0.15) {
        return {
          code: summary.code,
          priority: "high",
          action: "控制投放节奏",
          reason: `额度剩余 ${summary.remaining}，已接近活动上限。`,
          nextStep: "停止广泛发放，保留给高意向来源，避免低质量流量消耗名额。",
          occupiedLabel,
          remainingLabel,
        } satisfies PromotionRiskInsight;
      }

      if (summary.totalUsed >= 3 && paidRate < 0.35) {
        return {
          code: summary.code,
          priority: "medium",
          action: "检查未支付占用",
          reason: `优惠订单支付率只有 ${formatPercent(paidRate)}，未支付订单可能占用额度。`,
          nextStep: "保留期会自动释放未支付额度；仍建议增加待支付提醒，减少重复创建订单。",
          occupiedLabel,
          remainingLabel,
        } satisfies PromotionRiskInsight;
      }

      if (pendingOrders > paidOrders && pendingOrders >= 2) {
        return {
          code: summary.code,
          priority: "medium",
          action: "跟进待支付",
          reason: `后台近 50 个订单中有 ${pendingOrders} 个待支付优惠订单。`,
          nextStep: "在个人中心展示待支付入口，并降低重复创建订单的诱因。",
          occupiedLabel,
          remainingLabel,
        } satisfies PromotionRiskInsight;
      }

      if (summary.totalUsed === 0) {
        return {
          code: summary.code,
          priority: "low",
          action: "小流量预热",
          reason: "该优惠码尚未产生使用记录。",
          nextStep: "先在分享回流、新用户首单或私域小范围投放，避免一开始大面积让利。",
          occupiedLabel,
          remainingLabel,
        } satisfies PromotionRiskInsight;
      }

      return {
        code: summary.code,
        priority: "low",
        action: "保持观察",
        reason: `优惠订单支付率 ${formatPercent(paidRate)}，当前未触发明显风险。`,
        nextStep: "继续观察来源 ROI 和剩余额度，低 ROI 来源不要叠加大额券。",
        occupiedLabel,
        remainingLabel,
      } satisfies PromotionRiskInsight;
    })
    .sort((a, b) => comparePriority(a, b) || a.code.localeCompare(b.code));
}
