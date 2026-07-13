import "server-only";

import {
  defaultChannelBudgetAlertConfig,
  type ChannelBudgetAlertConfig,
} from "@/lib/channel-budget-alert-config";
import type { ChannelBudgetConfig } from "@/lib/channel-budget-config";
import type { GrowthRoiRow } from "@/lib/growth-roi";

export type ChannelBudgetAlertPriority = "high" | "medium" | "low";

export type ChannelBudgetAlert = {
  source: string;
  priority: ChannelBudgetAlertPriority;
  action: string;
  reason: string;
  nextStep: string;
  budgetCents: number;
  revenueCents: number;
  netReturnCents: number;
  paidOrders: number;
  periodLabel: string;
};

const priorityRank: Record<ChannelBudgetAlertPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function periodLabel(config: ChannelBudgetConfig) {
  const start = formatDate(config.startsAt);
  const end = formatDate(config.endsAt);

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

function daysUntil(value: string | null | undefined, now: Date) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function emptyRow(source: string, budgetCents: number): Pick<
  GrowthRoiRow,
  "source" | "landings" | "paidOrders" | "revenueCents" | "netReturnCents" | "blendedRoiMultiple"
> {
  return {
    source,
    landings: 0,
    paidOrders: 0,
    revenueCents: 0,
    netReturnCents: -budgetCents,
    blendedRoiMultiple: budgetCents > 0 ? 0 : undefined,
  };
}

export function buildChannelBudgetAlerts(
  rows: GrowthRoiRow[],
  budgetConfigs: Map<string, ChannelBudgetConfig>,
  alertConfig: ChannelBudgetAlertConfig = defaultChannelBudgetAlertConfig,
  now = new Date(),
) {
  const rowsBySource = new Map(rows.map((row) => [row.source, row]));
  const alerts: ChannelBudgetAlert[] = [];

  for (const budgetConfig of budgetConfigs.values()) {
    if (budgetConfig.budgetCents <= 0) {
      continue;
    }

    const row =
      rowsBySource.get(budgetConfig.source) ??
      emptyRow(budgetConfig.source, budgetConfig.budgetCents);
    const endDays = daysUntil(budgetConfig.endsAt, now);
    const isExpired = endDays !== undefined && endDays < 0;
    const isEndingSoon =
      endDays !== undefined && endDays >= 0 && endDays <= alertConfig.endingSoonDays;
    const blendedRoi = row.blendedRoiMultiple;

    if (isExpired) {
      alerts.push({
        source: budgetConfig.source,
        priority: "high",
        action: "周期已结束",
        reason: "该渠道预算周期已经结束，需要复盘后再决定是否续投。",
        nextStep: "导出渠道复盘 CSV，比较投放成本、让利和净回收，再决定是否新建下一周期预算。",
        budgetCents: budgetConfig.budgetCents,
        revenueCents: row.revenueCents,
        netReturnCents: row.netReturnCents,
        paidOrders: row.paidOrders,
        periodLabel: periodLabel(budgetConfig),
      });
      continue;
    }

    if (row.paidOrders === 0) {
      alerts.push({
        source: budgetConfig.source,
        priority:
          row.landings >= alertConfig.noPaidLandingThreshold ||
          budgetConfig.budgetCents >= alertConfig.highBudgetCents
            ? "high"
            : "medium",
        action: "有成本未支付",
        reason: `该周期已有预算记录，但当前只有 ${row.landings} 次落地、0 笔支付。`,
        nextStep: "先暂停扩大预算，检查落地页首屏、首单券露出和支付入口，再小流量复测。",
        budgetCents: budgetConfig.budgetCents,
        revenueCents: row.revenueCents,
        netReturnCents: row.netReturnCents,
        paidOrders: row.paidOrders,
        periodLabel: periodLabel(budgetConfig),
      });
      continue;
    }

    if (blendedRoi !== undefined && blendedRoi < alertConfig.breakEvenRoi) {
      alerts.push({
        source: budgetConfig.source,
        priority: "high",
        action: "回收低于成本",
        reason: `综合回收倍数低于 ${alertConfig.breakEvenRoi}，实收还没有覆盖投放和让利成本。`,
        nextStep: "停止加预算，降低折扣或换内容素材，等净回收转正后再放量。",
        budgetCents: budgetConfig.budgetCents,
        revenueCents: row.revenueCents,
        netReturnCents: row.netReturnCents,
        paidOrders: row.paidOrders,
        periodLabel: periodLabel(budgetConfig),
      });
      continue;
    }

    if (blendedRoi !== undefined && blendedRoi < alertConfig.healthyRoi) {
      alerts.push({
        source: budgetConfig.source,
        priority: "medium",
        action: "控制预算",
        reason: `综合回收倍数低于 ${alertConfig.healthyRoi}，继续加码的安全边际不足。`,
        nextStep: "保留小额预算观察，优先优化转化页和券面，而不是继续买量。",
        budgetCents: budgetConfig.budgetCents,
        revenueCents: row.revenueCents,
        netReturnCents: row.netReturnCents,
        paidOrders: row.paidOrders,
        periodLabel: periodLabel(budgetConfig),
      });
      continue;
    }

    if (isEndingSoon) {
      alerts.push({
        source: budgetConfig.source,
        priority: "medium",
        action: "周期将结束",
        reason: `预算周期将在 ${alertConfig.endingSoonDays} 天内结束，需要提前决定是否续投。`,
        nextStep: "若净回收为正且支付稳定，可复制当前 source 新建下一周期；否则先暂停。",
        budgetCents: budgetConfig.budgetCents,
        revenueCents: row.revenueCents,
        netReturnCents: row.netReturnCents,
        paidOrders: row.paidOrders,
        periodLabel: periodLabel(budgetConfig),
      });
      continue;
    }

    alerts.push({
      source: budgetConfig.source,
      priority: "low",
      action: "保持观察",
      reason: "该渠道已有支付且回收倍数暂未触发风险。",
      nextStep: "继续观察周期内净回收和支付稳定性，避免过早放大预算。",
      budgetCents: budgetConfig.budgetCents,
      revenueCents: row.revenueCents,
      netReturnCents: row.netReturnCents,
      paidOrders: row.paidOrders,
      periodLabel: periodLabel(budgetConfig),
    });
  }

  return alerts.sort(
    (a, b) =>
      priorityRank[a.priority] - priorityRank[b.priority] ||
      a.netReturnCents - b.netReturnCents ||
      b.budgetCents - a.budgetCents,
  );
}
