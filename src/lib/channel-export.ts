import "server-only";

import {
  buildChannelSegmentStrategies,
  classifyChannelSource,
  type ChannelSegmentStrategy,
} from "@/lib/channel-strategy";
import { auditChannelSource } from "@/lib/channel-source";
import type { ChannelBudgetConfig } from "@/lib/channel-budget-config";
import {
  type ChannelBudgetReviewDecision,
  type ChannelBudgetReviewMetadata,
  readChannelBudgetReviewMetadata,
  reviewDecisionLabel,
} from "@/lib/channel-budget-review";
import { buildGrowthRoiRows, type GrowthRoiRow } from "@/lib/growth-roi";
import type { UsageLogRecord } from "@/lib/usage-log-store";

export type ChannelReviewExportFilters = {
  reviewDecision?: ChannelBudgetReviewDecision;
  source?: string;
};

function csvCell(value: string | number | undefined | null) {
  const text = value === undefined || value === null ? "" : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(values: Array<string | number | undefined | null>) {
  return values.map(csvCell).join(",");
}

function yuan(cents: number) {
  return (cents / 100).toFixed(2);
}

function percent(value: number) {
  return (value * 100).toFixed(2);
}

function multiple(value: number | undefined) {
  return value === undefined ? "" : value.toFixed(2);
}

function periodDate(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

function budgetPeriod(config: ChannelBudgetConfig | undefined) {
  if (!config) {
    return "";
  }

  const startsAt = periodDate(config.startsAt);
  const endsAt = periodDate(config.endsAt);

  if (startsAt && endsAt) {
    return `${startsAt} - ${endsAt}`;
  }

  if (startsAt) {
    return `${startsAt} 起`;
  }

  if (endsAt) {
    return `${endsAt} 前`;
  }

  return "未设周期";
}

function collectReviews(logs: UsageLogRecord[]) {
  return logs
    .map((log) => readChannelBudgetReviewMetadata(log))
    .filter((metadata): metadata is NonNullable<typeof metadata> => Boolean(metadata))
    .sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
}

function latestReviewsBySource(reviews: ChannelBudgetReviewMetadata[]) {
  const latestReviews = new Map<string, ChannelBudgetReviewMetadata>();

  for (const review of reviews) {
    if (!latestReviews.has(review.source)) {
      latestReviews.set(review.source, review);
    }
  }

  return latestReviews;
}

function matchesFilters(
  input: { source: string; decision?: ChannelBudgetReviewDecision },
  filters: ChannelReviewExportFilters,
) {
  if (filters.source && input.source !== filters.source) {
    return false;
  }

  if (filters.reviewDecision && input.decision !== filters.reviewDecision) {
    return false;
  }

  return true;
}

function filterGrowthRows(
  rows: GrowthRoiRow[],
  latestReviews: Map<string, ChannelBudgetReviewMetadata>,
  filters: ChannelReviewExportFilters,
) {
  if (!filters.reviewDecision && !filters.source) {
    return rows;
  }

  return rows.filter((row) =>
    matchesFilters(
      {
        source: row.source,
        decision: latestReviews.get(row.source)?.decision,
      },
      filters,
    ),
  );
}

function filterReviews(
  reviews: ChannelBudgetReviewMetadata[],
  filters: ChannelReviewExportFilters,
) {
  return reviews.filter((review) =>
    matchesFilters(
      {
        source: review.source,
        decision: review.decision,
      },
      filters,
    ),
  );
}

function filterSummary(filters: ChannelReviewExportFilters) {
  return [
    csvRow(["筛选条件", "值"]),
    csvRow([
      "复盘结论",
      filters.reviewDecision ? reviewDecisionLabel(filters.reviewDecision) : "全部",
    ]),
    csvRow(["source", filters.source ?? "全部"]),
  ];
}

function channelSummaryRows(segments: ChannelSegmentStrategy[]) {
  return [
    csvRow([
      "类型",
      "渠道",
      "来源列表",
      "落地",
      "登录",
      "下单",
      "支付",
      "支付转化率%",
      "实收元",
      "让利元",
      "投放成本元",
      "净回收元",
      "收入让利倍数",
      "收入投放倍数",
      "综合回收倍数",
      "优先级",
      "预算动作",
      "优惠动作",
      "内容动作",
    ]),
    ...segments.map((segment) =>
      csvRow([
        "渠道汇总",
        segment.name,
        segment.sources.join(" / "),
        segment.landings,
        segment.logins,
        segment.orders,
        segment.paidOrders,
        percent(segment.conversionRate),
        yuan(segment.revenueCents),
        yuan(segment.discountCents),
        yuan(segment.budgetCents),
        yuan(segment.netReturnCents),
        multiple(segment.roiMultiple),
        multiple(segment.spendRoiMultiple),
        multiple(segment.blendedRoiMultiple),
        segment.priority,
        segment.budgetAction,
        segment.offerAction,
        segment.contentAction,
      ]),
    ),
  ];
}

function sourceDetailRows(
  rows: GrowthRoiRow[],
  budgetConfigs: Map<string, ChannelBudgetConfig>,
  latestReviews: Map<string, ChannelBudgetReviewMetadata>,
) {
  return [
    csvRow([
      "类型",
      "source",
      "渠道分层",
      "落地",
      "登录",
      "下单",
      "支付",
      "支付转化率%",
      "折前金额元",
      "实收元",
      "让利元",
      "投放成本元",
      "预算周期",
      "净回收元",
      "收入让利倍数",
      "收入投放倍数",
      "综合回收倍数",
      "优惠码",
      "分享报告",
      "命名状态",
      "建议 source",
      "最近复盘结论",
      "最近复盘备注",
    ]),
    ...rows.map((row) => {
      const audit = auditChannelSource(row.source);
      const budgetConfig = budgetConfigs.get(row.source);
      const latestReview = latestReviews.get(row.source);

      return csvRow([
        "来源明细",
        row.source,
        classifyChannelSource(row.source),
        row.landings,
        row.logins,
        row.orders,
        row.paidOrders,
        percent(row.conversionRate),
        yuan(row.listAmountCents),
        yuan(row.revenueCents),
        yuan(row.discountCents),
        yuan(row.budgetCents),
        budgetPeriod(budgetConfig),
        yuan(row.netReturnCents),
        multiple(row.roiMultiple),
        multiple(row.spendRoiMultiple),
        multiple(row.blendedRoiMultiple),
        row.promotionCodes.join(" / "),
        row.shareSlugs.join(" / "),
        audit.status,
        audit.status === "standard" ? "" : audit.normalizedSource,
        latestReview ? reviewDecisionLabel(latestReview.decision) : "",
        latestReview?.note,
      ]);
    }),
  ];
}

function reviewArchiveRows(reviews: ChannelBudgetReviewMetadata[]) {
  return [
    csvRow([
      "类型",
      "source",
      "复盘结论",
      "归档时间",
      "归档人",
      "预算元",
      "实收元",
      "让利元",
      "净回收元",
      "落地",
      "支付",
      "支付转化率%",
      "收入投放倍数",
      "综合回收倍数",
      "周期开始",
      "周期结束",
      "备注",
    ]),
    ...reviews.map((review) =>
      csvRow([
        "复盘归档",
        review.source,
        reviewDecisionLabel(review.decision),
        review.archivedAt,
        review.archivedBy,
        yuan(review.budgetCents),
        yuan(review.revenueCents),
        yuan(review.discountCents),
        yuan(review.netReturnCents),
        review.landings,
        review.paidOrders,
        percent(review.conversionRate),
        multiple(review.spendRoiMultiple),
        multiple(review.blendedRoiMultiple),
        periodDate(review.startsAt),
        periodDate(review.endsAt),
        review.note,
      ]),
    ),
  ];
}

export function buildChannelReviewExport(
  logs: UsageLogRecord[],
  budgetConfigs: Map<string, ChannelBudgetConfig> = new Map(),
  filters: ChannelReviewExportFilters = {},
) {
  const reviews = collectReviews(logs);
  const latestReviews = latestReviewsBySource(reviews);
  const growthRows = filterGrowthRows(
    buildGrowthRoiRows(logs, budgetConfigs),
    latestReviews,
    filters,
  );
  const reviewArchive = filterReviews(reviews, filters);
  const channelSegments = buildChannelSegmentStrategies(growthRows);
  const generatedAt = new Date().toISOString();
  const lines = [
    csvRow(["玄机 AI 渠道投放复盘", generatedAt]),
    "",
    ...filterSummary(filters),
    "",
    ...channelSummaryRows(channelSegments),
    "",
    ...sourceDetailRows(growthRows, budgetConfigs, latestReviews),
    "",
    ...reviewArchiveRows(reviewArchive),
  ];

  return {
    generatedAt,
    filters,
    growthRows,
    channelSegments,
    reviewArchive,
    csv: `\uFEFF${lines.join("\n")}\n`,
  };
}
