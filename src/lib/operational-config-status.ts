import "server-only";

import { getChannelBudgetConfigMap } from "@/lib/channel-budget-config";
import { getCheckoutExperimentConfig } from "@/lib/checkout-experiment";
import { getPromotionRuntimeConfigMap } from "@/lib/promotion-config";
import { getUsageLogStoreStatus } from "@/lib/usage-log-store";

export type OperationalConfigHealth = "ready" | "warning";

export type OperationalConfigStatusItem = {
  label: string;
  value: string;
  detail: string;
};

export type OperationalConfigStatus = {
  health: OperationalConfigHealth;
  label: string;
  detail: string;
  action: string;
  items: OperationalConfigStatusItem[];
};

const promotionConfigFeature = "promotion_config";
const experimentConfigFeature = "experiment_config";
const channelBudgetConfigFeature = "channel_budget_config";
const channelBudgetAlertConfigFeature = "channel_budget_alert_config";
const adminActionFeature = "admin_action";

function snapshotText(count: number) {
  return count > 0 ? `${count} 次快照` : "暂无快照";
}

function experimentModeText(mode: "experiment" | "forced") {
  return mode === "forced" ? "已固化默认券" : "A/B 分流";
}

export async function getOperationalConfigStatus() {
  const [storeStatus, promotionConfigs, experimentConfig, channelBudgetConfigs] = await Promise.all([
    getUsageLogStoreStatus([
      promotionConfigFeature,
      experimentConfigFeature,
      channelBudgetConfigFeature,
      channelBudgetAlertConfigFeature,
      adminActionFeature,
    ]),
    getPromotionRuntimeConfigMap(),
    getCheckoutExperimentConfig(),
    getChannelBudgetConfigMap(),
  ]);
  const promotionSnapshots = storeStatus.featureCounts[promotionConfigFeature] ?? 0;
  const experimentSnapshots = storeStatus.featureCounts[experimentConfigFeature] ?? 0;
  const channelBudgetSnapshots = storeStatus.featureCounts[channelBudgetConfigFeature] ?? 0;
  const channelBudgetAlertSnapshots =
    storeStatus.featureCounts[channelBudgetAlertConfigFeature] ?? 0;
  const adminActions = storeStatus.featureCounts[adminActionFeature] ?? 0;

  if (storeStatus.mode === "database") {
    return {
      health: "ready",
      label: "数据库持久化",
      detail: "运营配置与审计快照已写入 UsageLog，服务重启后可从 PostgreSQL 恢复。",
      action: "继续保持 DATABASE_URL 可用；正式上线前执行 Prisma 迁移并备份数据库。",
      items: [
        {
          label: "优惠码配置",
          value: snapshotText(promotionSnapshots),
          detail:
            promotionConfigs.size > 0
              ? `当前有 ${promotionConfigs.size} 个运行时覆盖规则。`
              : "当前使用默认优惠码规则。",
        },
        {
          label: "首单实验配置",
          value: snapshotText(experimentSnapshots),
          detail: `当前策略为 ${experimentModeText(experimentConfig.mode)}。`,
        },
        {
          label: "渠道预算配置",
          value: snapshotText(channelBudgetSnapshots),
          detail:
            channelBudgetConfigs.size > 0
              ? `当前有 ${channelBudgetConfigs.size} 个渠道成本配置。`
              : "当前尚未录入渠道投放成本。",
        },
        {
          label: "预算预警阈值",
          value: snapshotText(channelBudgetAlertSnapshots),
          detail:
            channelBudgetAlertSnapshots > 0
              ? "当前使用后台配置的预算预警阈值。"
              : "当前使用默认预算预警阈值。",
        },
        {
          label: "后台审计",
          value: `${adminActions} 条记录`,
          detail: "重试、补偿、优惠配置、实验固化、渠道预算、预算阈值和渠道导出都会留下审计事件。",
        },
      ],
    } satisfies OperationalConfigStatus;
  }

  const fallbackDetail = storeStatus.databaseConfigured
    ? "已配置 DATABASE_URL，但当前数据库不可用，运营配置暂时回退到进程内存。"
    : "当前未配置 DATABASE_URL，运营配置只保存在本地进程内存。";

  return {
    health: "warning",
    label: storeStatus.databaseConfigured ? "数据库回退内存" : "内存模式",
    detail: fallbackDetail,
    action: "配置并验证 PostgreSQL 后，优惠码配置、首单实验策略和后台审计才具备生产级恢复能力。",
    items: [
      {
        label: "优惠码配置",
        value: snapshotText(promotionSnapshots),
        detail:
          promotionConfigs.size > 0
            ? `当前进程有 ${promotionConfigs.size} 个运行时覆盖规则，重启后会丢失。`
            : "当前使用默认优惠码规则。",
      },
      {
        label: "首单实验配置",
        value: snapshotText(experimentSnapshots),
        detail: `当前策略为 ${experimentModeText(experimentConfig.mode)}。`,
      },
      {
        label: "渠道预算配置",
        value: snapshotText(channelBudgetSnapshots),
        detail:
          channelBudgetConfigs.size > 0
            ? `当前进程有 ${channelBudgetConfigs.size} 个渠道成本配置，重启后会丢失。`
            : "当前尚未录入渠道投放成本。",
      },
      {
        label: "预算预警阈值",
        value: snapshotText(channelBudgetAlertSnapshots),
        detail:
          channelBudgetAlertSnapshots > 0
            ? "当前进程使用后台配置的预算预警阈值，重启后会丢失。"
            : "当前使用默认预算预警阈值。",
      },
      {
        label: "后台审计",
        value: `${adminActions} 条记录`,
        detail: "内存模式下审计只适合演示，正式收费前必须落库。",
      },
    ],
  } satisfies OperationalConfigStatus;
}
