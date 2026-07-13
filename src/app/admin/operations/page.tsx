import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BadgePercent,
  Binary,
  ClipboardCheck,
  Coins,
  CreditCard,
  Database,
  ImageDown,
  Megaphone,
  MousePointerClick,
  ScrollText,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { readAdminAuditMetadata } from "@/lib/admin-audit";
import { getAdminAccess } from "@/lib/admin-auth";
import { buildChannelBudgetAlerts } from "@/lib/channel-budget-alerts";
import {
  getChannelBudgetAlertConfig,
  readChannelBudgetAlertConfigMetadata,
} from "@/lib/channel-budget-alert-config";
import {
  getChannelBudgetConfigMap,
  readChannelBudgetConfigMetadata,
} from "@/lib/channel-budget-config";
import {
  channelBudgetReviewDecisions,
  type ChannelBudgetReviewDecision,
  normalizeChannelBudgetReviewDecision,
  readChannelBudgetReviewMetadata,
  reviewDecisionLabel,
} from "@/lib/channel-budget-review";
import { buildChannelSourceGovernance } from "@/lib/channel-governance";
import { channelSourceRegistry } from "@/lib/channel-source";
import { buildChannelSegmentStrategies } from "@/lib/channel-strategy";
import {
  buildCheckoutExperimentRecommendation,
  buildCheckoutExperimentRows,
  getCheckoutExperimentAssignment,
  getCheckoutExperimentConfig,
  readCheckoutExperimentConfigLog,
  readCheckoutExperimentMetadata,
} from "@/lib/checkout-experiment";
import { formatPrice } from "@/lib/commerce";
import { buildPromotionRiskInsights, buildSourceGrowthInsights } from "@/lib/growth-insights";
import { buildGrowthRoiRows } from "@/lib/growth-roi";
import {
  getAdminEntitlementAccounts,
  getAdminEntitlementTransactions,
} from "@/lib/entitlement-store";
import {
  getAdminOrders,
  getAdminWalletTransactions,
  getOrderDisplay,
} from "@/lib/mock-payment-store";
import { getOperationalConfigStatus } from "@/lib/operational-config-status";
import { integrationProbeFeature } from "@/lib/integration-diagnostics";
import { launchEvidenceFeature } from "@/lib/launch-evidence";
import { launchExternalReadinessFeature } from "@/lib/launch-external-readiness";
import {
  getPersistenceReadiness,
  persistenceProbeFeature,
} from "@/lib/persistence-readiness";
import { getAdminReports } from "@/lib/report-store";
import {
  getPromotionUsageSummaries,
  getEffectivePromotionRules,
  promotionReservationTtlMinutes,
  readPromotionLogMetadata,
} from "@/lib/promo-code";
import { readProductConfigMetadata } from "@/lib/product-config";
import { readPromotionConfigMetadata } from "@/lib/promotion-config";
import { getAdminUsageLogs } from "@/lib/usage-log-store";
import { getAdminUsers } from "@/lib/user-store";
import { createLoginHref } from "@/lib/return-to";
import { readShareAttributionMetadata } from "@/lib/share-attribution";
import { readShareLogMetadata } from "@/lib/share-tracking";
import { brand } from "@/lib/site";
import { AdminChannelBudgetAlertConfigForm } from "../channel-budget-alert-config-form";
import { AdminChannelBudgetForm } from "../channel-budget-form";
import { AdminChannelBudgetReviewForm } from "../channel-budget-review-form";
import { AdminEntitlementAdjustForm } from "../entitlement-adjust-form";
import { ExperimentRolloutActions } from "../experiment-rollout-actions";
import { AdminOrderActions } from "../order-actions";
import { AdminPromotionConfigForm } from "../promotion-config-form";
import { AdminReportActions } from "../report-actions";

function shortId(id: string) {
  return id.length > 18 ? `${id.slice(0, 18)}...` : id;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function reportTypeLabel(type: string) {
  if (type === "BAZI_WUXING") {
    return "八字";
  }

  if (type === "BAGUA") {
    return "八卦";
  }

  if (type === "PALM") {
    return "手相";
  }

  if (type === "COMPOSITE") {
    return "综合";
  }

  if (type === "YEARLY") {
    return "年度";
  }

  return "塔罗";
}

function reportStatusClass(status: string) {
  if (status === "FAILED") {
    return "text-[#e08b74]";
  }

  if (status === "GENERATING") {
    return "text-[#f0d49a]";
  }

  return "text-[#8ad5bd]";
}

function entitlementEventLabel(type: string) {
  if (type === "GRANT") {
    return "发放";
  }

  if (type === "SPEND") {
    return "消费";
  }

  if (type === "REFUND") {
    return "退回";
  }

  if (type === "ADJUST") {
    return "调整";
  }

  return "过期";
}

function entitlementEventClass(type: string) {
  if (type === "SPEND" || type === "EXPIRE") {
    return "text-[#e08b74]";
  }

  if (type === "REFUND" || type === "GRANT") {
    return "text-[#8ad5bd]";
  }

  return "text-[#f0d49a]";
}

function readMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const value = (metadata as Record<string, unknown>)[key];

  return typeof value === "string" ? value : undefined;
}

function auditActionLabel(action: string) {
  if (action === "report_retry") {
    return "重试报告";
  }

  if (action === "report_compensate") {
    return "星力补偿";
  }

  if (action === "entitlement_adjust") {
    return "权益调整";
  }

  if (action === "order_refund") {
    return "订单退款";
  }

  if (action === "product_config_update") {
    return "套餐配置";
  }

  if (action === "promotion_config_update") {
    return "优惠配置";
  }

  if (action === "checkout_experiment_config_update") {
    return "首单实验";
  }

  if (action === "channel_review_export") {
    return "渠道导出";
  }

  if (action === "channel_budget_config_update") {
    return "渠道预算";
  }

  if (action === "channel_budget_alert_config_update") {
    return "预算阈值";
  }

  if (action === "channel_budget_review_archive") {
    return "预算复盘";
  }

  return action;
}

function auditStatusLabel(status: string) {
  if (status === "success") {
    return "成功";
  }

  if (status === "queued") {
    return "已入队";
  }

  return "失败";
}

function auditStatusClass(status: string) {
  if (status === "failed") {
    return "text-[#e08b74]";
  }

  if (status === "queued") {
    return "text-[#f0d49a]";
  }

  return "text-[#8ad5bd]";
}

function attributionEventLabel(event: string) {
  if (event === "landing") {
    return "分享落地";
  }

  if (event === "login") {
    return "归因登录";
  }

  if (event === "order_created") {
    return "归因下单";
  }

  if (event === "paid") {
    return "归因支付";
  }

  return event;
}

function promotionEventLabel(event: string) {
  if (event === "order_created") {
    return "优惠下单";
  }

  if (event === "paid") {
    return "优惠支付";
  }

  return event;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(value > 0 && value < 0.1 ? 1 : 0)}%`;
}

function formatMultiple(value: number | undefined) {
  if (value === undefined) {
    return "自然转化";
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)}x`;
}

function insightPriorityLabel(priority: "high" | "medium" | "low") {
  if (priority === "high") {
    return "优先";
  }

  if (priority === "medium") {
    return "关注";
  }

  return "观察";
}

function insightPriorityClass(priority: "high" | "medium" | "low") {
  if (priority === "high") {
    return "text-[#e08b74]";
  }

  if (priority === "medium") {
    return "text-[#f0d49a]";
  }

  return "text-[#8ad5bd]";
}

function channelPriorityLabel(priority: "scale" | "optimize" | "observe" | "pause") {
  if (priority === "scale") {
    return "加码";
  }

  if (priority === "optimize") {
    return "优化";
  }

  if (priority === "pause") {
    return "暂停";
  }

  return "观察";
}

function channelPriorityClass(priority: "scale" | "optimize" | "observe" | "pause") {
  if (priority === "scale") {
    return "text-[#8ad5bd]";
  }

  if (priority === "optimize") {
    return "text-[#f0d49a]";
  }

  if (priority === "pause") {
    return "text-[#e08b74]";
  }

  return "text-[#b9ad99]";
}

function channelSourceStatusLabel(status: "standard" | "needs_normalization" | "unknown") {
  if (status === "standard") {
    return "规范";
  }

  if (status === "needs_normalization") {
    return "需归一";
  }

  return "未知";
}

function channelSourceStatusClass(status: "standard" | "needs_normalization" | "unknown") {
  if (status === "standard") {
    return "text-[#8ad5bd]";
  }

  if (status === "needs_normalization") {
    return "text-[#f0d49a]";
  }

  return "text-[#e08b74]";
}

function budgetAlertPriorityLabel(priority: "high" | "medium" | "low") {
  if (priority === "high") {
    return "高风险";
  }

  if (priority === "medium") {
    return "需关注";
  }

  return "观察";
}

function budgetAlertPriorityClass(priority: "high" | "medium" | "low") {
  if (priority === "high") {
    return "text-[#e08b74]";
  }

  if (priority === "medium") {
    return "text-[#f0d49a]";
  }

  return "text-[#8ad5bd]";
}

function budgetPeriodLabel(startsAt?: string | null, endsAt?: string | null) {
  const start = startsAt ? formatDate(startsAt) : "";
  const end = endsAt ? formatDate(endsAt) : "";

  if (start && end) {
    return `${start} - ${end}`;
  }

  if (start) {
    return `${start} 起`;
  }

  if (end) {
    return `${end} 前`;
  }

  return "未设周期";
}

function experimentModeLabel(mode: "experiment" | "forced", forcedLabel?: string) {
  if (mode === "forced") {
    return `默认 ${forcedLabel ?? "指定变体"}`;
  }

  return "A/B 分流";
}

function configHealthClass(health: "ready" | "warning" | "blocking") {
  if (health === "ready") {
    return "text-[#8ad5bd]";
  }

  if (health === "blocking") {
    return "text-[#e08b74]";
  }

  return "text-[#f0d49a]";
}

function readSearchValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];

  return Array.isArray(value) ? value[0] : value;
}

function adminPageHref(input: {
  token?: string;
  reviewDecision?: ChannelBudgetReviewDecision;
}) {
  const params = new URLSearchParams();

  if (input.token) {
    params.set("token", input.token);
  }

  if (input.reviewDecision) {
    params.set("reviewDecision", input.reviewDecision);
  }

  const query = params.toString();

  return query ? `/admin/operations?${query}` : "/admin/operations";
}

function channelReviewExportHref(input: {
  token?: string;
  reviewDecision?: ChannelBudgetReviewDecision;
}) {
  const params = new URLSearchParams();

  if (input.token) {
    params.set("token", input.token);
  }

  if (input.reviewDecision) {
    params.set("reviewDecision", input.reviewDecision);
  }

  const query = params.toString();

  return query ? `/api/admin/exports/channel-roi?${query}` : "/api/admin/exports/channel-roi";
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const access = await getAdminAccess();

  if (!access.authenticated) {
    redirect(createLoginHref("/admin/operations", "/admin"));
  }

  if (!access.authorized) {
    notFound();
  }

  const adminToken = undefined;
  const reviewDecisionFilter = normalizeChannelBudgetReviewDecision(
    readSearchValue(resolvedSearchParams, "reviewDecision"),
  );
  const [
    users,
    orders,
    walletTransactions,
    entitlementAccounts,
    entitlementTransactions,
    reports,
    usageLogs,
    operationalConfigStatus,
    channelBudgetConfigs,
    channelBudgetAlertConfig,
    persistenceReadiness,
  ] =
    await Promise.all([
      getAdminUsers(),
      getAdminOrders(),
      getAdminWalletTransactions(),
      getAdminEntitlementAccounts({ take: 50 }),
      getAdminEntitlementTransactions({ take: 80 }),
      getAdminReports(),
      getAdminUsageLogs({ take: 500 }),
      getOperationalConfigStatus(),
      getChannelBudgetConfigMap(),
      getChannelBudgetAlertConfig(),
      getPersistenceReadiness(),
    ]);
  const paidOrders = orders.filter((order) => order.status === "PAID");
  const grossCents = paidOrders.reduce((sum, order) => sum + order.amountCents, 0);
  const totalStarsGranted = walletTransactions
    .filter((transaction) => transaction.amount > 0)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalStarsSpent = Math.abs(
    walletTransactions
      .filter((transaction) => transaction.amount < 0)
      .reduce((sum, transaction) => sum + transaction.amount, 0),
  );
  const totalReportQuotaRemaining = entitlementAccounts
    .filter((account) => account.kind === "deep_report")
    .reduce((sum, account) => sum + account.balance, 0);
  const totalPalmQuotaRemaining = entitlementAccounts
    .filter((account) => account.kind === "palm_reading")
    .reduce((sum, account) => sum + account.balance, 0);
  const failedReports = reports.filter((report) => report.status === "FAILED");
  const shareEvents = usageLogs
    .map((log) => ({
      log,
      metadata: readShareLogMetadata(log),
    }))
    .filter((item): item is { log: (typeof usageLogs)[number]; metadata: NonNullable<ReturnType<typeof readShareLogMetadata>> } =>
      Boolean(item.metadata),
    );
  const shareViews = shareEvents.filter((item) => item.metadata.event === "view");
  const posterViews = shareEvents.filter((item) => item.metadata.event === "poster_view");
  const qrViews = shareEvents.filter((item) => item.metadata.source === "poster_qr");
  const shareActions = shareEvents.filter((item) =>
    ["copy_link", "native_share", "poster_download", "copy_poster_link"].includes(
      item.metadata.event,
    ),
  );
  const auditEvents = usageLogs
    .map((log) => ({
      log,
      metadata: readAdminAuditMetadata(log),
    }))
    .filter((item): item is { log: (typeof usageLogs)[number]; metadata: NonNullable<ReturnType<typeof readAdminAuditMetadata>> } =>
      Boolean(item.metadata),
    );
  const successfulAuditEvents = auditEvents.filter((item) => item.metadata.status !== "failed");
  const compensatedStars = auditEvents
    .filter(
      (item) =>
        item.metadata.action === "report_compensate" &&
        item.metadata.status === "success" &&
        item.metadata.amount,
    )
    .reduce((sum, item) => sum + (item.metadata.amount ?? 0), 0);
  const attributionEvents = usageLogs
    .map((log) => ({
      log,
      metadata: readShareAttributionMetadata(log),
    }))
    .filter((item): item is { log: (typeof usageLogs)[number]; metadata: NonNullable<ReturnType<typeof readShareAttributionMetadata>> } =>
      Boolean(item.metadata),
    );
  const attributedLandings = attributionEvents.filter((item) => item.metadata.event === "landing");
  const attributedLogins = attributionEvents.filter((item) => item.metadata.event === "login");
  const attributedOrders = attributionEvents.filter((item) => item.metadata.event === "order_created");
  const attributedPaidOrders = attributionEvents.filter((item) => item.metadata.event === "paid");
  const attributedRevenueCents = attributedPaidOrders.reduce(
    (sum, item) => sum + (item.metadata.amountCents ?? 0),
    0,
  );
  const promotionEvents = usageLogs
    .map((log) => ({
      log,
      metadata: readPromotionLogMetadata(log),
    }))
    .filter((item): item is { log: (typeof usageLogs)[number]; metadata: NonNullable<ReturnType<typeof readPromotionLogMetadata>> } =>
      Boolean(item.metadata),
    );
  const promotionCreatedEvents = promotionEvents.filter(
    (item) => item.metadata.event === "order_created",
  );
  const promotionPaidEvents = promotionEvents.filter((item) => item.metadata.event === "paid");
  const promotionDiscountCents = promotionPaidEvents.reduce(
    (sum, item) => sum + item.metadata.discountCents,
    0,
  );
  const promotionRevenueCents = promotionPaidEvents.reduce(
    (sum, item) => sum + item.metadata.finalAmountCents,
    0,
  );
  const effectivePromotionRules = await getEffectivePromotionRules();
  const promotionUsageSummaries = getPromotionUsageSummaries(usageLogs, effectivePromotionRules);
  const configuredPromotions = promotionUsageSummaries.filter((summary) => summary.configured);
  const growthRoiRows = buildGrowthRoiRows(usageLogs, channelBudgetConfigs);
  const growthRoiRevenueCents = growthRoiRows.reduce(
    (sum, row) => sum + row.revenueCents,
    0,
  );
  const growthRoiDiscountCents = growthRoiRows.reduce(
    (sum, row) => sum + row.discountCents,
    0,
  );
  const growthRoiBudgetCents = growthRoiRows.reduce(
    (sum, row) => sum + row.budgetCents,
    0,
  );
  const growthRoiNetReturnCents = growthRoiRows.reduce(
    (sum, row) => sum + row.netReturnCents,
    0,
  );
  const growthRoiPaidOrders = growthRoiRows.reduce((sum, row) => sum + row.paidOrders, 0);
  const channelSegmentStrategies = buildChannelSegmentStrategies(growthRoiRows);
  const channelSourceGovernance = buildChannelSourceGovernance(growthRoiRows);
  const channelBudgetList = Array.from(channelBudgetConfigs.values()).sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  );
  const channelBudgetReviews = usageLogs
    .map((log) => readChannelBudgetReviewMetadata(log))
    .filter((metadata): metadata is NonNullable<typeof metadata> => Boolean(metadata))
    .sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
  const filteredChannelBudgetReviews = reviewDecisionFilter
    ? channelBudgetReviews.filter((review) => review.decision === reviewDecisionFilter)
    : channelBudgetReviews;
  const reviewDecisionCounts = Object.fromEntries(
    channelBudgetReviewDecisions.map((decision) => [
      decision,
      channelBudgetReviews.filter((review) => review.decision === decision).length,
    ]),
  ) as Record<ChannelBudgetReviewDecision, number>;
  const reviewDecisionFilterLabel = reviewDecisionFilter
    ? reviewDecisionLabel(reviewDecisionFilter)
    : "全部结论";
  const channelBudgetAlerts = buildChannelBudgetAlerts(
    growthRoiRows,
    channelBudgetConfigs,
    channelBudgetAlertConfig,
  );
  const highChannelBudgetAlerts = channelBudgetAlerts.filter(
    (alert) => alert.priority === "high",
  );
  const channelSourceOptions = Array.from(
    new Set([
      ...growthRoiRows.map((row) => row.source),
      ...channelBudgetList.map((config) => config.source),
      ...channelSourceRegistry.map((source) => source.example),
    ]),
  ).sort();
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const scalableChannelSegments = channelSegmentStrategies.filter(
    (segment) => segment.priority === "scale",
  );
  const pausedChannelSegments = channelSegmentStrategies.filter(
    (segment) => segment.priority === "pause",
  );
  const sourceGrowthInsights = buildSourceGrowthInsights(growthRoiRows);
  const promotionRiskInsights = buildPromotionRiskInsights(promotionUsageSummaries, orders);
  const checkoutExperimentRows = buildCheckoutExperimentRows(usageLogs);
  const checkoutExperimentExposures = checkoutExperimentRows.reduce(
    (sum, row) => sum + row.exposures,
    0,
  );
  const checkoutExperimentPaidOrders = checkoutExperimentRows.reduce(
    (sum, row) => sum + row.paidOrders,
    0,
  );
  const checkoutExperimentRevenueCents = checkoutExperimentRows.reduce(
    (sum, row) => sum + row.revenueCents,
    0,
  );
  const checkoutExperimentConfig = await getCheckoutExperimentConfig();
  const forcedExperimentAssignment = checkoutExperimentConfig.forcedVariant
    ? getCheckoutExperimentAssignment(checkoutExperimentConfig.forcedVariant)
    : null;
  const checkoutExperimentRecommendation =
    buildCheckoutExperimentRecommendation(checkoutExperimentRows);
  const aiUsageLogs = usageLogs.filter(
    (log) =>
      !readShareLogMetadata(log) &&
      !readAdminAuditMetadata(log) &&
      !readShareAttributionMetadata(log) &&
      !readPromotionLogMetadata(log) &&
      !readProductConfigMetadata(log) &&
      !readPromotionConfigMetadata(log) &&
      !readChannelBudgetConfigMetadata(log) &&
      !readChannelBudgetAlertConfigMetadata(log) &&
      !readChannelBudgetReviewMetadata(log) &&
      !readCheckoutExperimentConfigLog(log) &&
      !readCheckoutExperimentMetadata(log) &&
      log.feature !== persistenceProbeFeature &&
      log.feature !== integrationProbeFeature &&
      log.feature !== launchEvidenceFeature &&
      log.feature !== launchExternalReadinessFeature,
  );
  const entitlementUserOptions = Array.from(
    new Set([
      ...entitlementAccounts.map((account) => account.userId),
      ...users.map((user) => user.id),
    ]),
  );

  const stats = [
    {
      label: "用户",
      value: users.length,
      icon: Users,
    },
    {
      label: "订单",
      value: orders.length,
      icon: CreditCard,
    },
    {
      label: "报告",
      value: reports.length,
      icon: ScrollText,
    },
    {
      label: "收入",
      value: formatPrice(grossCents),
      icon: Coins,
    },
    {
      label: "发放星力",
      value: totalStarsGranted,
      icon: BadgeCheck,
    },
    {
      label: "消耗星力",
      value: totalStarsSpent,
      icon: Activity,
    },
    {
      label: "报告额度",
      value: totalReportQuotaRemaining,
      icon: ScrollText,
    },
    {
      label: "手相额度",
      value: totalPalmQuotaRemaining,
      icon: BadgeCheck,
    },
    {
      label: "失败报告",
      value: failedReports.length,
      icon: ClipboardCheck,
    },
    {
      label: "分享访问",
      value: shareViews.length,
      icon: Share2,
    },
    {
      label: "海报访问",
      value: posterViews.length,
      icon: ImageDown,
    },
    {
      label: "归因登录",
      value: attributedLogins.length,
      icon: UserPlus,
    },
    {
      label: "归因支付",
      value: attributedPaidOrders.length,
      icon: ShoppingCart,
    },
    {
      label: "归因收入",
      value: formatPrice(attributedRevenueCents),
      icon: TrendingUp,
    },
    {
      label: "优惠订单",
      value: promotionCreatedEvents.length,
      icon: BadgePercent,
    },
    {
      label: "优惠金额",
      value: formatPrice(promotionDiscountCents),
      icon: BadgePercent,
    },
    {
      label: "优惠配置",
      value: configuredPromotions.length,
      icon: BadgePercent,
    },
    {
      label: "ROI实收",
      value: formatPrice(growthRoiRevenueCents),
      icon: TrendingUp,
    },
    {
      label: "投放成本",
      value: formatPrice(growthRoiBudgetCents),
      icon: Megaphone,
    },
    {
      label: "净回收",
      value: formatPrice(growthRoiNetReturnCents),
      icon: TrendingUp,
    },
    {
      label: "预算预警",
      value: highChannelBudgetAlerts.length,
      icon: AlertTriangle,
    },
    {
      label: "复盘归档",
      value: channelBudgetReviews.length,
      icon: ClipboardCheck,
    },
    {
      label: "可加码渠道",
      value: scalableChannelSegments.length,
      icon: Megaphone,
    },
    {
      label: "规范来源",
      value: channelSourceGovernance.standardLabel,
      icon: Binary,
    },
    {
      label: "需暂停渠道",
      value: pausedChannelSegments.length,
      icon: AlertTriangle,
    },
    {
      label: "实验曝光",
      value: checkoutExperimentExposures,
      icon: BadgePercent,
    },
    {
      label: "实验支付",
      value: checkoutExperimentPaidOrders,
      icon: ShoppingCart,
    },
    {
      label: "实验实收",
      value: formatPrice(checkoutExperimentRevenueCents),
      icon: TrendingUp,
    },
    {
      label: "新客券模式",
      value: experimentModeLabel(
        checkoutExperimentConfig.mode,
        forcedExperimentAssignment?.promotionCode,
      ),
      icon: BadgePercent,
    },
    {
      label: "后台操作",
      value: auditEvents.length,
      icon: ShieldCheck,
    },
    {
      label: "运营补偿",
      value: compensatedStars,
      icon: BadgeCheck,
    },
  ];

  return (
    <main className="min-h-screen bg-[#080705] px-5 py-8 text-[#f5efe2] sm:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg border border-[#c8a15a]/55 bg-[#c8a15a]/10 text-[#f0d49a]">
            <Sparkles size={20} aria-hidden="true" />
          </span>
          <span>
            <span className="block font-ritual text-xl">{brand.cn}</span>
            <span className="block text-xs text-[#b9ad99]">{brand.en}</span>
          </span>
        </Link>
        <Link href="/member" className="text-sm text-[#d8cab2] hover:text-[#f0d49a]">
          个人中心
        </Link>
      </div>

      <section className="mx-auto max-w-7xl py-12">
        <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold text-[#c8a15a]">平台后台</p>
            <h1 className="mt-3 font-ritual text-5xl leading-tight text-[#fff7e8]">
              运营数据总览
            </h1>
            <p className="mt-5 leading-8 text-[#b9ad99]">
              查看用户、订单、钱包流水、报告和 AI 调用日志，并处理失败报告。
            </p>
          </div>
          <div className="rounded-lg border border-[#3a3023] bg-[#12100d] p-4 text-sm text-[#b9ad99]">
            <Database className="mb-3 text-[#c8a15a]" size={22} aria-hidden="true" />
            <p className={`font-semibold ${configHealthClass(operationalConfigStatus.health)}`}>
              {operationalConfigStatus.label}
            </p>
            <p className="mt-2 leading-6">{operationalConfigStatus.detail}</p>
            <Link
              href={adminToken ? `/admin/health?token=${encodeURIComponent(adminToken)}` : "/admin/health"}
              className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#6a5431] px-3 text-xs font-semibold text-[#fff7e8] transition hover:border-[#c8a15a]"
            >
              <ClipboardCheck size={14} aria-hidden="true" />
              上线自检
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-7">
          {stats.map((stat) => {
            const Icon = stat.icon;

            return (
              <div key={stat.label} className="rounded-lg border border-[#3a3023] bg-[#12100d] p-4">
                <Icon className="text-[#c8a15a]" size={22} aria-hidden="true" />
                <p className="mt-3 text-sm text-[#b9ad99]">{stat.label}</p>
                <p className="mt-1 text-2xl font-semibold text-[#fff7e8]">{stat.value}</p>
              </div>
            );
          })}
        </div>

        <section className="mt-8 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">生产化状态</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                运营配置与数据落库
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {operationalConfigStatus.action}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#b9ad99]">
                {persistenceReadiness.action}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span
                className={`rounded-md bg-[#080705] px-3 py-2 text-sm font-semibold ${configHealthClass(
                  operationalConfigStatus.health,
                )}`}
              >
                {operationalConfigStatus.label}
              </span>
              <span
                className={`rounded-md bg-[#080705] px-3 py-2 text-sm font-semibold ${configHealthClass(
                  persistenceReadiness.status,
                )}`}
              >
                {persistenceReadiness.label}
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <div className="rounded-md border border-[#2f261a] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">运营配置状态</p>
              <p
                className={`mt-2 text-xl font-semibold ${configHealthClass(
                  operationalConfigStatus.health,
                )}`}
              >
                {operationalConfigStatus.label}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#d8cab2]">
                {operationalConfigStatus.detail}
              </p>
            </div>
            <div className="rounded-md border border-[#2f261a] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">生产落库验收</p>
              <p
                className={`mt-2 text-xl font-semibold ${configHealthClass(
                  persistenceReadiness.status,
                )}`}
              >
                {persistenceReadiness.label}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#d8cab2]">
                {persistenceReadiness.detail}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {operationalConfigStatus.items.map((item) => (
              <div key={item.label} className="rounded-md border border-[#2f261a] bg-[#080705] p-4">
                <p className="text-xs text-[#b9ad99]">{item.label}</p>
                <p className="mt-2 text-xl font-semibold text-[#f0d49a]">{item.value}</p>
                <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.detail}</p>
              </div>
            ))}
            {persistenceReadiness.items.map((item) => (
              <div key={item.label} className="rounded-md border border-[#2f261a] bg-[#080705] p-4">
                <p className="text-xs text-[#b9ad99]">{item.label}</p>
                <p
                  className={`mt-2 text-xl font-semibold ${configHealthClass(item.status)}`}
                >
                  {item.value}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">渠道命名治理</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                UTM / source 规范
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                投放链接优先使用 `source`，也支持 `utm_source`、`utm_medium`、`utm_campaign` 自动合并。
                推荐格式：`paid_ad__cpc__new_user`、`douyin_kol__daily_tarot`、`wechat_group__launch`。
              </p>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">来源健康度</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {formatPercent(channelSourceGovernance.healthRate)}
                </p>
              </div>
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">未知来源</p>
                <p className="mt-1 text-xl font-semibold text-[#e08b74]">
                  {channelSourceGovernance.unknownSources}
                </p>
              </div>
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">需归一</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {channelSourceGovernance.normalizationSources}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-md border border-[#2f261a]">
            {channelSourceGovernance.issues.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                  <thead className="bg-[#080705] text-xs text-[#9f927f]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">source</th>
                      <th className="px-4 py-3 font-semibold">状态</th>
                      <th className="px-4 py-3 font-semibold">分层</th>
                      <th className="px-4 py-3 font-semibold">影响</th>
                      <th className="px-4 py-3 font-semibold">建议</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelSourceGovernance.issues.map((issue) => (
                      <tr key={issue.source} className="border-t border-[#2f261a] bg-[#12100d]">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[#fff7e8]">{issue.source}</p>
                          <p className="mt-1 text-xs text-[#6f6455]">{issue.reason}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-md bg-[#080705] px-2 py-1 text-xs ${channelSourceStatusClass(
                              issue.status,
                            )}`}
                          >
                            {channelSourceStatusLabel(issue.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#b9ad99]">{issue.label}</td>
                        <td className="px-4 py-3 text-[#b9ad99]">
                          {issue.landings} 落地 / {issue.paidOrders} 支付 / {formatPrice(issue.revenueCents)}
                        </td>
                        <td className="px-4 py-3 text-[#d8cab2]">{issue.suggestion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="bg-[#080705] p-4 text-sm text-[#b9ad99]">
                当前有数据的来源都符合命名规范。继续让投放链接使用已注册前缀，ROI 报表会更稳定。
              </p>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">分享追踪</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                公开报告传播概览
              </h2>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">二维码来源</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">{qrViews.length}</p>
              </div>
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">分享动作</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">{shareActions.length}</p>
              </div>
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">追踪事件</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">{shareEvents.length}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {shareEvents.length > 0 ? (
              shareEvents.slice(0, 8).map(({ log, metadata }) => (
                <div key={log.id} className="rounded-md border border-[#2f261a] bg-[#080705] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-[#fff7e8]">{metadata.event}</p>
                    <span className="rounded-md bg-[#12100d] px-2 py-1 text-xs text-[#f0d49a]">
                      {metadata.source}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-[#b9ad99]">
                    <span>{shortId(metadata.reportId)}</span>
                    <span>{formatDate(log.createdAt)}</span>
                  </div>
                  <p className="mt-2 break-all text-xs text-[#6f6455]">
                    {metadata.shareSlug}
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-md bg-[#080705] p-4 text-sm text-[#b9ad99]">
                暂无分享追踪数据。
              </p>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">投放链接与预算</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                渠道成本录入
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                预算按规范 source 记录，渠道 ROI 会同步计算投放成本、净回收和收入/投放倍数。
              </p>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">已配置来源</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {channelBudgetList.length}
                </p>
              </div>
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">当前成本</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {formatPrice(growthRoiBudgetCents)}
                </p>
              </div>
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">高风险预警</p>
                <p className="mt-1 text-xl font-semibold text-[#e08b74]">
                  {highChannelBudgetAlerts.length}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <AdminChannelBudgetForm
              adminToken={adminToken}
              appUrl={appUrl}
              sourceOptions={channelSourceOptions}
            />

            <div className="rounded-md border border-[#2f261a] bg-[#080705] p-4">
              <p className="text-sm font-semibold text-[#fff7e8]">预算快照</p>
              <div className="mt-3 grid gap-3">
                {channelBudgetList.length > 0 ? (
                  channelBudgetList.slice(0, 6).map((config) => (
                    <div key={config.source} className="rounded-md border border-[#3a3023] bg-[#12100d] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="break-all text-sm font-semibold text-[#f0d49a]">
                          {config.source}
                        </p>
                        <span className="text-sm text-[#fff7e8]">
                          {formatPrice(config.budgetCents)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#6f6455]">
                        <span>{formatDate(config.updatedAt)}</span>
                        <span>{config.updatedBy}</span>
                      </div>
                      <p className="mt-2 text-xs text-[#9f927f]">
                        周期：{budgetPeriodLabel(config.startsAt, config.endsAt)}
                      </p>
                      {config.note ? (
                        <p className="mt-2 text-xs leading-5 text-[#b9ad99]">{config.note}</p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="rounded-md bg-[#12100d] p-4 text-sm text-[#b9ad99]">
                    暂无投放预算配置。
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <AdminChannelBudgetAlertConfigForm
              adminToken={adminToken}
              config={channelBudgetAlertConfig}
            />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <AdminChannelBudgetReviewForm
              adminToken={adminToken}
              sourceOptions={channelSourceOptions}
            />

            <div className="rounded-md border border-[#2f261a] bg-[#080705] p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <p className="text-sm font-semibold text-[#fff7e8]">复盘档案</p>
                  <p className="mt-1 text-xs text-[#b9ad99]">
                    当前：{reviewDecisionFilterLabel}，{filteredChannelBudgetReviews.length} / {channelBudgetReviews.length} 条
                  </p>
                </div>
                <Link
                  href={channelReviewExportHref({
                    token: adminToken,
                    reviewDecision: reviewDecisionFilter,
                  })}
                  className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-[#3a3023] px-3 text-xs font-semibold text-[#d8cab2] transition hover:border-[#c8a15a] hover:text-[#fff7e8]"
                >
                  <ScrollText size={13} aria-hidden="true" />
                  导出当前筛选
                </Link>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={adminPageHref({ token: adminToken })}
                  className={`rounded-md border px-3 py-2 text-xs font-semibold transition ${
                    reviewDecisionFilter
                      ? "border-[#3a3023] text-[#b9ad99] hover:border-[#c8a15a] hover:text-[#fff7e8]"
                      : "border-[#c8a15a] bg-[#c8a15a]/10 text-[#f0d49a]"
                  }`}
                >
                  全部 {channelBudgetReviews.length}
                </Link>
                {channelBudgetReviewDecisions.map((decision) => (
                  <Link
                    key={decision}
                    href={adminPageHref({ token: adminToken, reviewDecision: decision })}
                    className={`rounded-md border px-3 py-2 text-xs font-semibold transition ${
                      reviewDecisionFilter === decision
                        ? "border-[#c8a15a] bg-[#c8a15a]/10 text-[#f0d49a]"
                        : "border-[#3a3023] text-[#b9ad99] hover:border-[#c8a15a] hover:text-[#fff7e8]"
                    }`}
                  >
                    {reviewDecisionLabel(decision)} {reviewDecisionCounts[decision]}
                  </Link>
                ))}
              </div>
              <div className="mt-3 grid gap-3">
                {filteredChannelBudgetReviews.length > 0 ? (
                  filteredChannelBudgetReviews.slice(0, 8).map((review) => (
                    <div key={`${review.source}-${review.archivedAt}`} className="rounded-md border border-[#3a3023] bg-[#12100d] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="break-all text-sm font-semibold text-[#f0d49a]">
                          {review.source}
                        </p>
                        <span className="rounded-md bg-[#080705] px-2 py-1 text-xs text-[#8ad5bd]">
                          {reviewDecisionLabel(review.decision)}
                        </span>
                      </div>
                      <div className="mt-2 grid gap-2 text-xs text-[#b9ad99] sm:grid-cols-4">
                        <span>预算 {formatPrice(review.budgetCents)}</span>
                        <span>实收 {formatPrice(review.revenueCents)}</span>
                        <span>净回收 {formatPrice(review.netReturnCents)}</span>
                        <span>回收 {formatMultiple(review.blendedRoiMultiple)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#6f6455]">
                        <span>{formatDate(review.archivedAt)}</span>
                        <span>{review.archivedBy}</span>
                        <span>{review.landings} 落地 / {review.paidOrders} 支付</span>
                        <span>转化 {formatPercent(review.conversionRate)}</span>
                      </div>
                      {review.note ? (
                        <p className="mt-2 text-xs leading-5 text-[#d8cab2]">{review.note}</p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="rounded-md bg-[#12100d] p-4 text-sm text-[#b9ad99]">
                    暂无{reviewDecisionFilterLabel}复盘。预算周期结束后，把结论归档为加码、暂停、复测或结案。
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-md border border-[#2f261a] bg-[#080705] p-4">
            <p className="text-sm font-semibold text-[#fff7e8]">预算预警</p>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {channelBudgetAlerts.length > 0 ? (
                channelBudgetAlerts.slice(0, 6).map((alert) => (
                  <div key={alert.source} className="rounded-md border border-[#3a3023] bg-[#12100d] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="break-all text-sm font-semibold text-[#fff7e8]">
                        {alert.source}
                      </p>
                      <span
                        className={`rounded-md bg-[#080705] px-2 py-1 text-xs ${budgetAlertPriorityClass(
                          alert.priority,
                        )}`}
                      >
                        {budgetAlertPriorityLabel(alert.priority)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-[#f0d49a]">{alert.action}</p>
                    <p className="mt-2 text-sm leading-6 text-[#b9ad99]">{alert.reason}</p>
                    <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{alert.nextStep}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#6f6455]">
                      <span>周期：{alert.periodLabel}</span>
                      <span>预算：{formatPrice(alert.budgetCents)}</span>
                      <span>实收：{formatPrice(alert.revenueCents)}</span>
                      <span>净回收：{formatPrice(alert.netReturnCents)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-md bg-[#12100d] p-4 text-sm text-[#b9ad99]">
                  暂无预算预警。录入渠道预算后，系统会根据周期、支付和回收倍数自动提示。
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">渠道投放</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                来源分层与预算动作
              </h2>
              <Link
                href={channelReviewExportHref({
                  token: adminToken,
                  reviewDecision: reviewDecisionFilter,
                })}
                className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#6a5431] px-3 text-xs font-semibold text-[#fff7e8] transition hover:border-[#c8a15a]"
              >
                <ScrollText size={14} aria-hidden="true" />
                导出{reviewDecisionFilter ? reviewDecisionFilterLabel : ""}复盘 CSV
              </Link>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">渠道分层</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {channelSegmentStrategies.length}
                </p>
              </div>
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">建议加码</p>
                <p className="mt-1 text-xl font-semibold text-[#8ad5bd]">
                  {scalableChannelSegments.length}
                </p>
              </div>
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">建议暂停</p>
                <p className="mt-1 text-xl font-semibold text-[#e08b74]">
                  {pausedChannelSegments.length}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-md border border-[#2f261a]">
            {channelSegmentStrategies.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
                  <thead className="bg-[#080705] text-xs text-[#9f927f]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">渠道</th>
                      <th className="px-4 py-3 font-semibold">动作</th>
                      <th className="px-4 py-3 font-semibold">漏斗</th>
                      <th className="px-4 py-3 font-semibold">转化率</th>
                      <th className="px-4 py-3 font-semibold">实收/让利</th>
                      <th className="px-4 py-3 font-semibold">投放/净回收</th>
                      <th className="px-4 py-3 font-semibold">投放倍数</th>
                      <th className="px-4 py-3 font-semibold">预算</th>
                      <th className="px-4 py-3 font-semibold">优惠</th>
                      <th className="px-4 py-3 font-semibold">内容</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelSegmentStrategies.map((segment) => (
                      <tr key={segment.code} className="border-t border-[#2f261a] bg-[#12100d]">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[#fff7e8]">{segment.name}</p>
                          <p className="mt-1 max-w-[220px] truncate text-xs text-[#6f6455]">
                            {segment.sources.length > 0 ? segment.sources.join(", ") : "无来源"}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-md bg-[#080705] px-2 py-1 text-xs ${channelPriorityClass(
                              segment.priority,
                            )}`}
                          >
                            {channelPriorityLabel(segment.priority)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#b9ad99]">
                          {segment.landings} 落地 / {segment.logins} 登录 / {segment.orders} 下单 / {segment.paidOrders} 支付
                        </td>
                        <td className="px-4 py-3 text-[#f0d49a]">
                          {formatPercent(segment.conversionRate)}
                        </td>
                        <td className="px-4 py-3 text-[#b9ad99]">
                          {formatPrice(segment.revenueCents)} / {formatPrice(segment.discountCents)}
                        </td>
                        <td className="px-4 py-3 text-[#b9ad99]">
                          {formatPrice(segment.budgetCents)} / {formatPrice(segment.netReturnCents)}
                        </td>
                        <td className="px-4 py-3 text-[#f0d49a]">
                          {formatMultiple(segment.spendRoiMultiple)}
                        </td>
                        <td className="px-4 py-3 text-[#d8cab2]">{segment.budgetAction}</td>
                        <td className="px-4 py-3 text-[#d8cab2]">{segment.offerAction}</td>
                        <td className="px-4 py-3 text-[#d8cab2]">{segment.contentAction}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="bg-[#080705] p-4 text-sm text-[#b9ad99]">
                暂无可分层的来源数据。继续通过分享页、海报和渠道参数采集流量。
              </p>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">首单实验</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                新用户优惠 A/B
              </h2>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">曝光用户</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {checkoutExperimentExposures}
                </p>
              </div>
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">支付订单</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {checkoutExperimentPaidOrders}
                </p>
              </div>
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">实验实收</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {formatPrice(checkoutExperimentRevenueCents)}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-md border border-[#2f261a]">
            <div className="border-b border-[#2f261a] bg-[#080705] p-4">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                <div>
                  <p className="text-sm font-semibold text-[#fff7e8]">
                    {checkoutExperimentRecommendation.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#b9ad99]">
                    {checkoutExperimentRecommendation.reason}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#d8cab2]">
                    {checkoutExperimentRecommendation.nextStep}
                  </p>
                  <p className="mt-2 text-xs text-[#6f6455]">
                    当前策略：{experimentModeLabel(
                      checkoutExperimentConfig.mode,
                      forcedExperimentAssignment?.promotionCode,
                    )}
                  </p>
                </div>
                <div className="min-w-[260px]">
                  <ExperimentRolloutActions
                    adminToken={adminToken}
                    recommendedVariant={checkoutExperimentRecommendation.winner}
                  />
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-[#080705] text-xs text-[#9f927f]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">变体</th>
                    <th className="px-4 py-3 font-semibold">优惠码</th>
                    <th className="px-4 py-3 font-semibold">曝光</th>
                    <th className="px-4 py-3 font-semibold">下单</th>
                    <th className="px-4 py-3 font-semibold">支付</th>
                    <th className="px-4 py-3 font-semibold">支付转化</th>
                    <th className="px-4 py-3 font-semibold">下单支付率</th>
                    <th className="px-4 py-3 font-semibold">实收</th>
                  </tr>
                </thead>
                <tbody>
                  {checkoutExperimentRows.map((row) => (
                    <tr key={row.variant} className="border-t border-[#2f261a] bg-[#12100d]">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#fff7e8]">{row.title}</p>
                        <p className="mt-1 text-xs text-[#6f6455]">{row.variant}</p>
                      </td>
                      <td className="px-4 py-3 text-[#f0d49a]">{row.promotionCode}</td>
                      <td className="px-4 py-3 text-[#b9ad99]">{row.exposures}</td>
                      <td className="px-4 py-3 text-[#b9ad99]">{row.orders}</td>
                      <td className="px-4 py-3 text-[#b9ad99]">{row.paidOrders}</td>
                      <td className="px-4 py-3 text-[#f0d49a]">
                        {formatPercent(row.conversionRate)}
                      </td>
                      <td className="px-4 py-3 text-[#b9ad99]">
                        {formatPercent(row.paymentRate)}
                      </td>
                      <td className="px-4 py-3 text-[#f0d49a]">
                        {formatPrice(row.revenueCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">转化归因</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                分享带来的登录与付费
              </h2>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-4">
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">落地用户</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {attributedLandings.length}
                </p>
              </div>
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">登录</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {attributedLogins.length}
                </p>
              </div>
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">下单</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {attributedOrders.length}
                </p>
              </div>
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">支付收入</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {formatPrice(attributedRevenueCents)}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {attributionEvents.length > 0 ? (
              attributionEvents.slice(0, 8).map(({ log, metadata }) => (
                <div key={log.id} className="rounded-md border border-[#2f261a] bg-[#080705] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-[#fff7e8]">
                      {attributionEventLabel(metadata.event)}
                    </p>
                    <span className="rounded-md bg-[#12100d] px-2 py-1 text-xs text-[#f0d49a]">
                      {metadata.source}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-[#b9ad99]">
                    <span>
                      {metadata.amountCents
                        ? formatPrice(
                            metadata.amountCents,
                            metadata.currency === "USD" ? "USD" : "CNY",
                          )
                        : shortId(metadata.reportId)}
                    </span>
                    <span>{formatDate(log.createdAt)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#6f6455]">
                    <span className="inline-flex items-center gap-1">
                      <MousePointerClick size={12} aria-hidden="true" />
                      {metadata.shareSlug}
                    </span>
                    {metadata.orderId ? <span>订单 {shortId(metadata.orderId)}</span> : null}
                    {metadata.productCode ? <span>{metadata.productCode}</span> : null}
                    {metadata.userId ? <span>用户 {shortId(metadata.userId)}</span> : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-md bg-[#080705] p-4 text-sm text-[#b9ad99]">
                暂无分享转化归因数据。
              </p>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">优惠码使用</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                活动优惠与首单转化
              </h2>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-4">
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">优惠下单</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {promotionCreatedEvents.length}
                </p>
              </div>
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">优惠支付</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {promotionPaidEvents.length}
                </p>
              </div>
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">让利金额</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {formatPrice(promotionDiscountCents)}
                </p>
              </div>
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">优惠收入</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {formatPrice(promotionRevenueCents)}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {promotionUsageSummaries.map((summary) => (
              <div key={summary.code} className="rounded-md border border-[#2f261a] bg-[#080705] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-[#fff7e8]">{summary.code}</p>
                  <span
                    className={`rounded-md bg-[#12100d] px-2 py-1 text-xs ${
                      summary.active ? "text-[#8ad5bd]" : "text-[#e08b74]"
                    }`}
                  >
                    {summary.active ? "有效" : summary.enabled ? "不可用" : "已暂停"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="text-sm text-[#b9ad99]">{summary.name}</p>
                  {summary.configured ? (
                    <span className="rounded-md bg-[#2a2117] px-2 py-1 text-xs text-[#f0d49a]">
                      运营配置
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#b9ad99]">
                  <span>占用 {summary.totalUsed}</span>
                  <span>支付 {summary.paidUsed}</span>
                  <span>
                    总量 {summary.totalLimit === undefined ? "不限" : summary.totalLimit}
                  </span>
                  <span>
                    剩余 {summary.remaining === undefined ? "不限" : summary.remaining}
                  </span>
                  <span>
                    {summary.perUserLimit === undefined
                      ? "单人不限"
                      : `单人限用 ${summary.perUserLimit} 次`}
                  </span>
                  <span>保留 {promotionReservationTtlMinutes} 分钟</span>
                  <span>{summary.endsAt ? `至 ${formatDate(summary.endsAt)}` : "长期"}</span>
                </div>
                <AdminPromotionConfigForm
                  key={`${summary.code}-${summary.enabled}-${summary.configured}-${summary.totalLimit ?? "unlimited"}-${summary.perUserLimit ?? "unlimited"}-${summary.startsAt ?? "none"}-${summary.endsAt ?? "none"}`}
                  summary={summary}
                  adminToken={adminToken}
                />
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {promotionEvents.length > 0 ? (
              promotionEvents.slice(0, 8).map(({ log, metadata }) => (
                <div key={log.id} className="rounded-md border border-[#2f261a] bg-[#080705] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-[#fff7e8]">{metadata.code}</p>
                    <span className="rounded-md bg-[#12100d] px-2 py-1 text-xs text-[#f0d49a]">
                      {promotionEventLabel(metadata.event)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-[#b9ad99]">
                    <span>
                      {metadata.name} / 减 {formatPrice(metadata.discountCents, metadata.currency)}
                    </span>
                    <span>{formatDate(log.createdAt)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#6f6455]">
                    <span>应付 {formatPrice(metadata.finalAmountCents, metadata.currency)}</span>
                    <span>订单 {shortId(metadata.orderId)}</span>
                    <span>{metadata.productCode}</span>
                    <span>{metadata.provider}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-md bg-[#080705] p-4 text-sm text-[#b9ad99]">
                暂无优惠码使用数据。
              </p>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">分享 ROI</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                来源、优惠与收入联动
              </h2>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">归因支付</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {growthRoiPaidOrders}
                </p>
              </div>
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">实收收入</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {formatPrice(growthRoiRevenueCents)}
                </p>
              </div>
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">让利成本</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {formatPrice(growthRoiDiscountCents)}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-md border border-[#2f261a]">
            {growthRoiRows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                  <thead className="bg-[#080705] text-xs text-[#9f927f]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">来源</th>
                      <th className="px-4 py-3 font-semibold">漏斗</th>
                      <th className="px-4 py-3 font-semibold">转化率</th>
                      <th className="px-4 py-3 font-semibold">折前金额</th>
                      <th className="px-4 py-3 font-semibold">实收</th>
                      <th className="px-4 py-3 font-semibold">让利</th>
                      <th className="px-4 py-3 font-semibold">收入/让利</th>
                      <th className="px-4 py-3 font-semibold">优惠码</th>
                    </tr>
                  </thead>
                  <tbody>
                    {growthRoiRows.slice(0, 10).map((row) => (
                      <tr key={row.source} className="border-t border-[#2f261a] bg-[#12100d]">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[#fff7e8]">{row.source}</p>
                          <p className="mt-1 text-xs text-[#6f6455]">
                            {row.shareSlugs.slice(0, 2).join(" / ")}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-[#b9ad99]">
                          {row.landings} 落地 / {row.logins} 登录 / {row.orders} 下单 / {row.paidOrders} 支付
                        </td>
                        <td className="px-4 py-3 text-[#f0d49a]">
                          {formatPercent(row.conversionRate)}
                        </td>
                        <td className="px-4 py-3 text-[#b9ad99]">
                          {formatPrice(row.listAmountCents)}
                        </td>
                        <td className="px-4 py-3 text-[#f0d49a]">
                          {formatPrice(row.revenueCents)}
                        </td>
                        <td className="px-4 py-3 text-[#8ad5bd]">
                          {formatPrice(row.discountCents)}
                        </td>
                        <td className="px-4 py-3 text-[#b9ad99]">
                          {formatMultiple(row.roiMultiple)}
                        </td>
                        <td className="px-4 py-3 text-[#b9ad99]">
                          {row.promotionCodes.length > 0 ? row.promotionCodes.join(", ") : "无优惠码"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="bg-[#080705] p-4 text-sm text-[#b9ad99]">
                暂无可计算的分享 ROI 数据。
              </p>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">增长策略</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                来源与优惠动作建议
              </h2>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <Megaphone className="mb-2 text-[#c8a15a]" size={18} aria-hidden="true" />
                <p className="text-xs text-[#b9ad99]">来源建议</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {sourceGrowthInsights.length}
                </p>
              </div>
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <AlertTriangle className="mb-2 text-[#c8a15a]" size={18} aria-hidden="true" />
                <p className="text-xs text-[#b9ad99]">优惠提醒</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {promotionRiskInsights.length}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div className="rounded-md border border-[#2f261a] bg-[#080705] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-[#fff7e8]">来源下一步</p>
                <span className="text-xs text-[#6f6455]">按 ROI 与漏斗排序</span>
              </div>
              <div className="mt-4 grid gap-3">
                {sourceGrowthInsights.length > 0 ? (
                  sourceGrowthInsights.map((insight) => (
                    <div key={insight.source} className="border-t border-[#2f261a] pt-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-[#fff7e8]">{insight.source}</p>
                        <span
                          className={`rounded-md bg-[#12100d] px-2 py-1 text-xs ${insightPriorityClass(
                            insight.priority,
                          )}`}
                        >
                          {insightPriorityLabel(insight.priority)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-[#f0d49a]">{insight.action}</p>
                      <p className="mt-2 text-sm leading-6 text-[#b9ad99]">{insight.reason}</p>
                      <p className="mt-2 text-xs leading-5 text-[#6f6455]">
                        {insight.funnelLabel} / {insight.conversionLabel}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[#d8cab2]">
                        {insight.nextStep}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                    暂无分享 ROI 样本；先完成公开报告分享、落地和支付事件采集。
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-[#2f261a] bg-[#080705] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-[#fff7e8]">优惠风险</p>
                <span className="text-xs text-[#6f6455]">按额度与支付率排序</span>
              </div>
              <div className="mt-4 grid gap-3">
                {promotionRiskInsights.map((insight) => (
                  <div key={insight.code} className="border-t border-[#2f261a] pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-[#fff7e8]">{insight.code}</p>
                      <span
                        className={`rounded-md bg-[#12100d] px-2 py-1 text-xs ${insightPriorityClass(
                          insight.priority,
                        )}`}
                      >
                        {insightPriorityLabel(insight.priority)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[#f0d49a]">{insight.action}</p>
                    <p className="mt-2 text-sm leading-6 text-[#b9ad99]">{insight.reason}</p>
                    <p className="mt-2 text-xs leading-5 text-[#6f6455]">
                      {insight.occupiedLabel} / {insight.remainingLabel}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#d8cab2]">
                      {insight.nextStep}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">操作审计</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                报告与资产操作记录
              </h2>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">有效操作</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {successfulAuditEvents.length}
                </p>
              </div>
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">补偿星力</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">{compensatedStars}</p>
              </div>
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">失败操作</p>
                <p className="mt-1 text-xl font-semibold text-[#e08b74]">
                  {auditEvents.length - successfulAuditEvents.length}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {auditEvents.length > 0 ? (
              auditEvents.slice(0, 8).map(({ log, metadata }) => (
                <div key={log.id} className="rounded-md border border-[#2f261a] bg-[#080705] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-[#fff7e8]">
                      {auditActionLabel(metadata.action)}
                    </p>
                    <span
                      className={`rounded-md bg-[#12100d] px-2 py-1 text-xs ${auditStatusClass(metadata.status)}`}
                    >
                      {auditStatusLabel(metadata.status)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-[#b9ad99]">
                    <span>{metadata.amount ? `${metadata.amount} 星力` : shortId(metadata.resourceId)}</span>
                    <span>{formatDate(log.createdAt)}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#b9ad99]">
                    {metadata.message ?? metadata.reason ?? "后台操作已记录"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#6f6455]">
                    {metadata.targetUserId ? <span>用户 {shortId(metadata.targetUserId)}</span> : null}
                    {metadata.orderId ? <span>订单 {shortId(metadata.orderId)}</span> : null}
                    {metadata.ipHint ? <span>来源 {metadata.ipHint}</span> : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-md bg-[#080705] p-4 text-sm text-[#b9ad99]">
                暂无后台操作记录。
              </p>
            )}
          </div>
        </section>

        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          <section className="rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
            <h2 className="font-ritual text-3xl text-[#fff7e8]">用户列表</h2>
            <div className="mt-5 space-y-3">
              {users.length > 0 ? (
                users.slice(0, 8).map((user) => (
                  <div key={user.id} className="rounded-md border border-[#2f261a] bg-[#080705] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-[#fff7e8]">{user.email ?? shortId(user.id)}</p>
                      <span className="rounded-md bg-[#12100d] px-2 py-1 text-xs text-[#f0d49a]">
                        {user.tier}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm text-[#b9ad99]">
                      <span>{shortId(user.id)}</span>
                      <span>{user.starBalance} 星力</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-md bg-[#080705] p-4 text-sm text-[#b9ad99]">暂无用户数据。</p>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
            <h2 className="font-ritual text-3xl text-[#fff7e8]">订单列表</h2>
            <div className="mt-5 space-y-3">
              {orders.length > 0 ? (
                orders.slice(0, 8).map((order) => {
                  const displayOrder = getOrderDisplay(order);

                  return (
                    <div key={order.id} className="rounded-md border border-[#2f261a] bg-[#080705] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-[#fff7e8]">{order.productName}</p>
                        <span className="rounded-md bg-[#12100d] px-2 py-1 text-xs text-[#f0d49a]">
                          {order.status}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-sm text-[#b9ad99]">
                        <span>{order.provider} / {shortId(order.id)}</span>
                        <span>{displayOrder.priceLabel}</span>
                      </div>
                      {displayOrder.promotionLabel ? (
                        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[#8ad5bd]">
                          <span>{displayOrder.promotionLabel}</span>
                          <span>{displayOrder.discountLabel}</span>
                        </div>
                      ) : null}
                      <AdminOrderActions
                        orderId={order.id}
                        status={order.status}
                        productName={order.productName}
                        adminToken={adminToken}
                      />
                    </div>
                  );
                })
              ) : (
                <p className="rounded-md bg-[#080705] p-4 text-sm text-[#b9ad99]">暂无订单数据。</p>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
            <h2 className="font-ritual text-3xl text-[#fff7e8]">报告列表</h2>
            <div className="mt-5 space-y-3">
              {reports.length > 0 ? (
                reports.slice(0, 8).map((report) => (
                  <div
                    key={report.id}
                    className="rounded-md border border-[#2f261a] bg-[#080705] p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-[#fff7e8]">{report.title}</p>
                      <span className="rounded-md bg-[#12100d] px-2 py-1 text-xs text-[#f0d49a]">
                        {reportTypeLabel(report.type)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className={`rounded-md bg-[#12100d] px-2 py-1 ${reportStatusClass(report.status)}`}>
                        {report.status}
                      </span>
                      {report.orderId ? (
                        <span className="rounded-md bg-[#12100d] px-2 py-1 text-[#b9ad99]">
                          {shortId(report.orderId)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#b9ad99]">
                      {report.summary}
                    </p>
                    <AdminReportActions
                      reportId={report.id}
                      status={report.status}
                      adminToken={adminToken}
                    />
                  </div>
                ))
              ) : (
                <p className="rounded-md bg-[#080705] p-4 text-sm text-[#b9ad99]">暂无报告数据。</p>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
            <h2 className="font-ritual text-3xl text-[#fff7e8]">AI 调用日志</h2>
            <div className="mt-5 space-y-3">
              {aiUsageLogs.length > 0 ? (
                aiUsageLogs.slice(0, 8).map((log) => (
                  <div key={log.id} className="rounded-md border border-[#2f261a] bg-[#080705] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-[#fff7e8]">{log.feature}</p>
                      <span className="rounded-md bg-[#12100d] px-2 py-1 text-xs text-[#f0d49a]">
                        {log.provider}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm text-[#b9ad99]">
                      <span>{log.model}</span>
                      <span>{(log.tokensIn ?? 0) + (log.tokensOut ?? 0)} tokens</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-md bg-[#080705] p-4 text-sm text-[#b9ad99]">暂无 AI 调用日志。</p>
              )}
            </div>
          </section>
        </div>

        <section className="mt-8 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">会员权益账本</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                额度余额与发放流水
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                会员深度报告额度和手相额度按账户余额与幂等流水追踪，便于排查支付回调、重复支付、消费失败和退款补偿。
              </p>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">权益账户</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {entitlementAccounts.length}
                </p>
              </div>
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">报告额度</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {totalReportQuotaRemaining}
                </p>
              </div>
              <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
                <p className="text-xs text-[#b9ad99]">手相额度</p>
                <p className="mt-1 text-xl font-semibold text-[#f0d49a]">
                  {totalPalmQuotaRemaining}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <AdminEntitlementAdjustForm
              adminToken={adminToken}
              userOptions={entitlementUserOptions}
            />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-md border border-[#2f261a] bg-[#080705] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-[#fff7e8]">账户余额</p>
                <span className="text-xs text-[#6f6455]">按最近更新排序</span>
              </div>
              <div className="mt-4 grid gap-3">
                {entitlementAccounts.length > 0 ? (
                  entitlementAccounts.slice(0, 10).map((account) => (
                    <div key={account.id} className="rounded-md border border-[#3a3023] bg-[#12100d] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#fff7e8]">{account.label}</p>
                          <p className="mt-1 text-xs text-[#6f6455]">
                            用户 {shortId(account.userId)}
                          </p>
                        </div>
                        <span className="text-2xl font-semibold text-[#f0d49a]">
                          {account.balance}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#b9ad99]">
                        <span>{account.kind}</span>
                        <span>更新 {formatDate(account.updatedAt)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-md bg-[#12100d] p-4 text-sm text-[#b9ad99]">
                    暂无会员权益账户。会员订单支付后会自动生成深度报告额度和手相额度账户。
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-[#2f261a] bg-[#080705] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-[#fff7e8]">最近权益流水</p>
                <span className="text-xs text-[#6f6455]">发放 / 消费 / 退回</span>
              </div>
              <div className="mt-4 grid gap-3">
                {entitlementTransactions.length > 0 ? (
                  entitlementTransactions.slice(0, 12).map((transaction) => {
                    const source = readMetadataString(transaction.metadata, "source");
                    const paymentSource = readMetadataString(
                      transaction.metadata,
                      "paymentSource",
                    );
                    const productCode = readMetadataString(transaction.metadata, "productCode");

                    return (
                      <div key={transaction.id} className="rounded-md border border-[#3a3023] bg-[#12100d] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-[#fff7e8]">{transaction.label}</p>
                              <span
                                className={`rounded-md bg-[#080705] px-2 py-1 text-xs ${entitlementEventClass(
                                  transaction.type,
                                )}`}
                              >
                                {entitlementEventLabel(transaction.type)}
                              </span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[#b9ad99]">
                              {transaction.reason}
                            </p>
                          </div>
                          <div className="text-right">
                            <p
                              className={
                                transaction.amount >= 0 ? "text-[#8ad5bd]" : "text-[#e08b74]"
                              }
                            >
                              {transaction.amount >= 0 ? "+" : ""}
                              {transaction.amount}
                            </p>
                            <p className="mt-1 text-xs text-[#6f6455]">
                              余额 {transaction.balanceAfter}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#6f6455]">
                          <span>用户 {shortId(transaction.userId)}</span>
                          <span>{formatDate(transaction.createdAt)}</span>
                          {transaction.orderId ? <span>订单 {shortId(transaction.orderId)}</span> : null}
                          {transaction.reportId ? <span>报告 {shortId(transaction.reportId)}</span> : null}
                          {productCode ? <span>{productCode}</span> : null}
                          {paymentSource ? <span>{paymentSource}</span> : null}
                          {source ? <span>{source}</span> : null}
                        </div>
                        {transaction.idempotencyKey ? (
                          <p className="mt-2 break-all text-xs text-[#3f382f]">
                            幂等键：{transaction.idempotencyKey}
                          </p>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <p className="rounded-md bg-[#12100d] p-4 text-sm text-[#b9ad99]">
                    暂无权益流水。支付会员订单、使用会员额度或生成失败退回额度后会出现在这里。
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <h2 className="font-ritual text-3xl text-[#fff7e8]">钱包流水</h2>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {walletTransactions.length > 0 ? (
              walletTransactions.slice(0, 10).map((transaction) => (
                <div key={transaction.id} className="rounded-md border border-[#2f261a] bg-[#080705] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-[#fff7e8]">{transaction.reason}</p>
                    <span className={transaction.amount >= 0 ? "text-[#f0d49a]" : "text-[#b34c32]"}>
                      {transaction.amount >= 0 ? "+" : ""}
                      {transaction.amount}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm text-[#b9ad99]">
                    <span>{shortId(transaction.userId)}</span>
                    <span>{formatDate(transaction.createdAt)}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-md bg-[#080705] p-4 text-sm text-[#b9ad99]">暂无钱包流水。</p>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
