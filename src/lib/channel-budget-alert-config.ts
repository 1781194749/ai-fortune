import "server-only";

import {
  createUsageLog,
  getUsageLogsByFeature,
  type UsageLogRecord,
} from "@/lib/usage-log-store";

export type ChannelBudgetAlertConfig = {
  breakEvenRoi: number;
  healthyRoi: number;
  endingSoonDays: number;
  noPaidLandingThreshold: number;
  highBudgetCents: number;
  updatedAt: string;
  updatedBy: string;
  note?: string;
};

export type ChannelBudgetAlertConfigMetadata = {
  event: "channel_budget_alert_config_updated";
  config: ChannelBudgetAlertConfig;
};

declare global {
  var xuanjiChannelBudgetAlertConfig: ChannelBudgetAlertConfig | undefined;
}

export const defaultChannelBudgetAlertConfig = {
  breakEvenRoi: 1,
  healthyRoi: 2.5,
  endingSoonDays: 2,
  noPaidLandingThreshold: 3,
  highBudgetCents: 10000,
  updatedAt: new Date(0).toISOString(),
  updatedBy: "system",
} satisfies ChannelBudgetAlertConfig;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

export function readChannelBudgetAlertConfigMetadata(log: UsageLogRecord) {
  if (log.feature !== "channel_budget_alert_config" || !isRecord(log.metadata)) {
    return undefined;
  }

  if (
    log.metadata.event !== "channel_budget_alert_config_updated" ||
    !isRecord(log.metadata.config)
  ) {
    return undefined;
  }

  const breakEvenRoi = readNumber(log.metadata.config.breakEvenRoi);
  const healthyRoi = readNumber(log.metadata.config.healthyRoi);
  const endingSoonDays = readInteger(log.metadata.config.endingSoonDays);
  const noPaidLandingThreshold = readInteger(log.metadata.config.noPaidLandingThreshold);
  const highBudgetCents = readInteger(log.metadata.config.highBudgetCents);
  const updatedAt = readString(log.metadata.config.updatedAt);
  const updatedBy = readString(log.metadata.config.updatedBy);

  if (
    breakEvenRoi === undefined ||
    healthyRoi === undefined ||
    endingSoonDays === undefined ||
    noPaidLandingThreshold === undefined ||
    highBudgetCents === undefined ||
    !updatedAt ||
    !updatedBy
  ) {
    return undefined;
  }

  return {
    event: "channel_budget_alert_config_updated",
    config: {
      breakEvenRoi,
      healthyRoi,
      endingSoonDays,
      noPaidLandingThreshold,
      highBudgetCents,
      updatedAt,
      updatedBy,
      note: readString(log.metadata.config.note),
    },
  } satisfies ChannelBudgetAlertConfigMetadata;
}

export async function getChannelBudgetAlertConfig() {
  if (globalThis.xuanjiChannelBudgetAlertConfig) {
    return globalThis.xuanjiChannelBudgetAlertConfig;
  }

  const logs = await getUsageLogsByFeature("channel_budget_alert_config", { take: 20 });
  const latest = logs.map(readChannelBudgetAlertConfigMetadata).find(Boolean);

  if (latest) {
    globalThis.xuanjiChannelBudgetAlertConfig = latest.config;
    return latest.config;
  }

  return defaultChannelBudgetAlertConfig;
}

export async function saveChannelBudgetAlertConfig(input: {
  breakEvenRoi: number;
  healthyRoi: number;
  endingSoonDays: number;
  noPaidLandingThreshold: number;
  highBudgetCents: number;
  updatedBy?: string;
  note?: string;
}) {
  const config = {
    breakEvenRoi: input.breakEvenRoi,
    healthyRoi: input.healthyRoi,
    endingSoonDays: input.endingSoonDays,
    noPaidLandingThreshold: input.noPaidLandingThreshold,
    highBudgetCents: input.highBudgetCents,
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy ?? process.env.ADMIN_AUDIT_OPERATOR ?? "admin",
    note: input.note,
  } satisfies ChannelBudgetAlertConfig;

  globalThis.xuanjiChannelBudgetAlertConfig = config;

  const metadata = {
    event: "channel_budget_alert_config_updated",
    config,
  } satisfies ChannelBudgetAlertConfigMetadata;

  await createUsageLog({
    provider: "internal",
    model: "channel-budget-alert-config",
    feature: "channel_budget_alert_config",
    costCents: 0,
    metadata,
  });

  return config;
}
