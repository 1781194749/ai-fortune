import "server-only";

import {
  getAdminEntitlementAccounts,
  getAdminEntitlementTransactions,
} from "@/lib/entitlement-store";
import {
  getAdminOrders,
  getAdminWalletTransactions,
} from "@/lib/mock-payment-store";
import { getOperationalConfigStatus } from "@/lib/operational-config-status";
import { getPersistenceReadiness } from "@/lib/persistence-readiness";
import { getAdminReports } from "@/lib/report-store";
import { getAdminUsageLogs, type UsageLogRecord } from "@/lib/usage-log-store";
import { getAdminUsers } from "@/lib/user-store";

const shanghaiDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dateKey(value: string | Date) {
  return shanghaiDateFormatter.format(value instanceof Date ? value : new Date(value));
}

function createDailyMetrics(days: number) {
  const today = new Date();

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - index - 1));
    const key = dateKey(date);

    return {
      date: key,
      label: new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "numeric",
        day: "numeric",
      }).format(date),
      orders: 0,
      aiCalls: 0,
      revenueCents: 0,
      tokensIn: 0,
      tokensOut: 0,
      aiCostCents: 0,
    };
  });
}

function isAiUsageLog(log: UsageLogRecord) {
  return (
    (log.provider === "openai" || log.provider === "local") &&
    ((log.tokensIn ?? 0) > 0 || (log.tokensOut ?? 0) > 0 || (log.imageCount ?? 0) > 0)
  );
}

function readMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function buildUsageBreakdown(
  logs: UsageLogRecord[],
  keyOf: (log: UsageLogRecord) => string,
) {
  const groups = new Map<
    string,
    {
      key: string;
      provider: string;
      model: string;
      feature: string;
      calls: number;
      tokensIn: number;
      tokensOut: number;
      costCents: number;
      users: Set<string>;
    }
  >();

  for (const log of logs) {
    const key = keyOf(log);
    const current = groups.get(key) ?? {
      key,
      provider: log.provider,
      model: log.model,
      feature: log.feature,
      calls: 0,
      tokensIn: 0,
      tokensOut: 0,
      costCents: 0,
      users: new Set<string>(),
    };

    current.calls += 1;
    current.tokensIn += log.tokensIn ?? 0;
    current.tokensOut += log.tokensOut ?? 0;
    current.costCents += log.costCents ?? 0;

    if (log.userId) {
      current.users.add(log.userId);
    }

    groups.set(key, current);
  }

  return Array.from(groups.values())
    .map(({ users, ...item }) => ({ ...item, users: users.size }))
    .sort((a, b) => b.costCents - a.costCents || b.calls - a.calls);
}

export async function getAdminDashboardData() {
  const [
    users,
    orders,
    walletTransactions,
    entitlementAccounts,
    entitlementTransactions,
    reports,
    usageLogs,
    operationalConfigStatus,
    persistenceReadiness,
  ] = await Promise.all([
    getAdminUsers({ take: 500 }),
    getAdminOrders({ take: 500 }),
    getAdminWalletTransactions({ take: 500 }),
    getAdminEntitlementAccounts({ take: 500 }),
    getAdminEntitlementTransactions({ take: 500 }),
    getAdminReports({ take: 500 }),
    getAdminUsageLogs({ take: 500 }),
    getOperationalConfigStatus(),
    getPersistenceReadiness(),
  ]);

  const paidOrders = orders.filter((order) => order.status === "PAID");
  const refundedOrders = orders.filter((order) => order.status === "REFUNDED");
  const pendingOrders = orders.filter((order) => order.status === "PENDING");
  const failedOrders = orders.filter((order) => order.status === "FAILED");
  const aiUsageLogs = usageLogs.filter(isAiUsageLog);
  const grossCents = paidOrders.reduce((sum, order) => sum + order.amountCents, 0);
  const totalTokensIn = aiUsageLogs.reduce((sum, log) => sum + (log.tokensIn ?? 0), 0);
  const totalTokensOut = aiUsageLogs.reduce((sum, log) => sum + (log.tokensOut ?? 0), 0);
  const totalAiCostCents = aiUsageLogs.reduce((sum, log) => sum + (log.costCents ?? 0), 0);
  const totalStarsGranted = walletTransactions
    .filter((transaction) => transaction.amount > 0)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalStarsSpent = Math.abs(
    walletTransactions
      .filter((transaction) => transaction.amount < 0)
      .reduce((sum, transaction) => sum + transaction.amount, 0),
  );
  const totalStarBalance = users.reduce((sum, user) => sum + user.starBalance, 0);
  const reportQuota = entitlementAccounts
    .filter((account) => account.kind === "deep_report")
    .reduce((sum, account) => sum + account.balance, 0);
  const palmQuota = entitlementAccounts
    .filter((account) => account.kind === "palm_reading")
    .reduce((sum, account) => sum + account.balance, 0);
  const paidUserIds = new Set(paidOrders.map((order) => order.userId));
  const activeMembers = users.filter((user) => user.tier !== "FREE");
  const costSources = new Set(
    aiUsageLogs.map((log) => readMetadataString(log.metadata, "costSource") ?? "missing"),
  );
  const dailyMetrics = createDailyMetrics(14);
  const metricsByDate = new Map(dailyMetrics.map((metric) => [metric.date, metric]));

  for (const order of paidOrders) {
    const metric = metricsByDate.get(dateKey(order.paidAt ?? order.createdAt));

    if (metric) {
      metric.orders += 1;
      metric.revenueCents += order.amountCents;
    }
  }

  for (const log of aiUsageLogs) {
    const metric = metricsByDate.get(dateKey(log.createdAt));

    if (metric) {
      metric.aiCalls += 1;
      metric.tokensIn += log.tokensIn ?? 0;
      metric.tokensOut += log.tokensOut ?? 0;
      metric.aiCostCents += log.costCents ?? 0;
    }
  }

  const commerceByUser = new Map<
    string,
    {
      orders: number;
      paidOrders: number;
      spentCents: number;
      lastOrderAt?: string;
    }
  >();

  for (const order of orders) {
    const current = commerceByUser.get(order.userId) ?? {
      orders: 0,
      paidOrders: 0,
      spentCents: 0,
      lastOrderAt: undefined,
    };

    current.orders += 1;

    if (order.status === "PAID") {
      current.paidOrders += 1;
      current.spentCents += order.amountCents;
    }

    if (!current.lastOrderAt || order.createdAt > current.lastOrderAt) {
      current.lastOrderAt = order.createdAt;
    }

    commerceByUser.set(order.userId, current);
  }

  const userById = new Map(users.map((user) => [user.id, user]));
  const failedReports = reports.filter((report) => report.status === "FAILED");
  const riskByUser = new Map<
    string,
    {
      userId: string;
      email?: string;
      tier?: string;
      aiCalls: number;
      tokens: number;
      costCents: number;
      missingCostCalls: number;
      failedOrders: number;
      refundedOrders: number;
      failedReports: number;
      riskScore: number;
      signals: string[];
      lastSeenAt?: string;
    }
  >();

  function ensureRiskRow(userId: string) {
    const user = userById.get(userId);
    const current = riskByUser.get(userId) ?? {
      userId,
      email: user?.email,
      tier: user?.tier,
      aiCalls: 0,
      tokens: 0,
      costCents: 0,
      missingCostCalls: 0,
      failedOrders: 0,
      refundedOrders: 0,
      failedReports: 0,
      riskScore: 0,
      signals: [],
      lastSeenAt: undefined,
    };

    riskByUser.set(userId, current);
    return current;
  }

  function touchRisk(row: ReturnType<typeof ensureRiskRow>, date?: string) {
    if (date && (!row.lastSeenAt || date > row.lastSeenAt)) {
      row.lastSeenAt = date;
    }
  }

  for (const log of aiUsageLogs) {
    if (!log.userId) {
      continue;
    }

    const row = ensureRiskRow(log.userId);
    row.aiCalls += 1;
    row.tokens += (log.tokensIn ?? 0) + (log.tokensOut ?? 0);
    row.costCents += log.costCents ?? 0;

    if (log.costCents === undefined) {
      row.missingCostCalls += 1;
    }

    touchRisk(row, log.createdAt);
  }

  for (const order of failedOrders) {
    const row = ensureRiskRow(order.userId);
    row.failedOrders += 1;
    touchRisk(row, order.createdAt);
  }

  for (const order of refundedOrders) {
    const row = ensureRiskRow(order.userId);
    row.refundedOrders += 1;
    touchRisk(row, order.createdAt);
  }

  for (const report of failedReports) {
    const row = ensureRiskRow(report.userId);
    row.failedReports += 1;
    touchRisk(row, report.updatedAt);
  }

  const riskUsers = Array.from(riskByUser.values())
    .map((row) => {
      const signals = [
        row.refundedOrders > 0 ? `${row.refundedOrders} 笔退款` : null,
        row.failedOrders > 0 ? `${row.failedOrders} 笔失败订单` : null,
        row.failedReports > 0 ? `${row.failedReports} 份报告失败` : null,
        row.costCents >= 100 ? `AI 成本 ${row.costCents} 分` : null,
        row.aiCalls >= 10 ? `${row.aiCalls} 次模型调用` : null,
        row.missingCostCalls > 0 ? `${row.missingCostCalls} 次缺成本` : null,
      ].filter((signal): signal is string => Boolean(signal));

      return {
        ...row,
        signals,
        riskScore:
          row.refundedOrders * 35 +
          row.failedOrders * 18 +
          row.failedReports * 16 +
          row.missingCostCalls * 8 +
          Math.min(row.aiCalls, 30) +
          Math.ceil(row.costCents / 20),
      };
    })
    .filter((row) => row.riskScore > 0)
    .sort((a, b) => b.riskScore - a.riskScore || b.costCents - a.costCents)
    .slice(0, 50);

  return {
    users,
    orders,
    walletTransactions,
    entitlementAccounts,
    entitlementTransactions,
    reports,
    aiUsageLogs,
    operationalConfigStatus,
    persistenceReadiness,
    paidOrders,
    refundedOrders,
    pendingOrders,
    failedOrders,
    userById,
    commerceByUser,
    dailyMetrics,
    modelBreakdown: buildUsageBreakdown(aiUsageLogs, (log) => `${log.provider}:${log.model}`),
    featureBreakdown: buildUsageBreakdown(aiUsageLogs, (log) => log.feature),
    failedReports,
    riskUsers,
    metrics: {
      grossCents,
      netAfterAiCents: grossCents - totalAiCostCents,
      totalTokensIn,
      totalTokensOut,
      totalTokens: totalTokensIn + totalTokensOut,
      totalAiCostCents,
      totalStarsGranted,
      totalStarsSpent,
      totalStarBalance,
      reportQuota,
      palmQuota,
      paidUsers: paidUserIds.size,
      activeMembers: activeMembers.length,
      paidConversion: users.length > 0 ? paidUserIds.size / users.length : 0,
      averageAiCostCents:
        aiUsageLogs.length > 0 ? totalAiCostCents / aiUsageLogs.length : 0,
      missingCostCalls: aiUsageLogs.filter((log) => log.costCents === undefined).length,
      riskUsers: riskUsers.length,
      failedReports: failedReports.length,
      hasStartupEstimate: costSources.has("startup_estimate_v1"),
    },
  };
}

export type AdminDashboardData = Awaited<ReturnType<typeof getAdminDashboardData>>;
