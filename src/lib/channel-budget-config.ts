import "server-only";

import { normalizeChannelSource } from "@/lib/channel-source";
import {
  createUsageLog,
  getUsageLogsByFeature,
  type UsageLogRecord,
} from "@/lib/usage-log-store";

export type ChannelBudgetConfig = {
  source: string;
  budgetCents: number;
  startsAt?: string | null;
  endsAt?: string | null;
  updatedAt: string;
  updatedBy: string;
  note?: string;
};

export type ChannelBudgetConfigMetadata = {
  event: "channel_budget_config_updated";
  budgets: ChannelBudgetConfig[];
  updatedBy: string;
  note?: string;
};

declare global {
  var xuanjiChannelBudgetConfigs: Map<string, ChannelBudgetConfig> | undefined;
}

const runtimeBudgets =
  globalThis.xuanjiChannelBudgetConfigs ?? new Map<string, ChannelBudgetConfig>();

if (!globalThis.xuanjiChannelBudgetConfigs) {
  globalThis.xuanjiChannelBudgetConfigs = runtimeBudgets;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readBudgetCents(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function readOptionalDate(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return readString(value);
}

function readBudgetConfig(value: unknown): ChannelBudgetConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const source = readString(value.source);
  const budgetCents = readBudgetCents(value.budgetCents);
  const updatedAt = readString(value.updatedAt);
  const updatedBy = readString(value.updatedBy);

  if (!source || budgetCents === undefined || !updatedAt || !updatedBy) {
    return undefined;
  }

  return {
    source: normalizeChannelSource(source),
    budgetCents,
    startsAt: readOptionalDate(value.startsAt),
    endsAt: readOptionalDate(value.endsAt),
    updatedAt,
    updatedBy,
    note: readString(value.note),
  };
}

function applySnapshot(configs: ChannelBudgetConfig[]) {
  runtimeBudgets.clear();

  for (const config of configs) {
    runtimeBudgets.set(config.source, config);
  }
}

export function readChannelBudgetConfigMetadata(log: UsageLogRecord) {
  if (log.feature !== "channel_budget_config" || !isRecord(log.metadata)) {
    return undefined;
  }

  if (
    log.metadata.event !== "channel_budget_config_updated" ||
    !Array.isArray(log.metadata.budgets)
  ) {
    return undefined;
  }

  const budgets = log.metadata.budgets
    .map(readBudgetConfig)
    .filter((config): config is ChannelBudgetConfig => Boolean(config));
  const updatedBy = readString(log.metadata.updatedBy);

  if (!updatedBy) {
    return undefined;
  }

  return {
    event: "channel_budget_config_updated",
    budgets,
    updatedBy,
    note: readString(log.metadata.note),
  } satisfies ChannelBudgetConfigMetadata;
}

export async function getChannelBudgetConfigMap() {
  if (runtimeBudgets.size > 0) {
    return new Map(runtimeBudgets);
  }

  const logs = await getUsageLogsByFeature("channel_budget_config", { take: 20 });
  const latest = logs.map(readChannelBudgetConfigMetadata).find(Boolean);

  if (latest) {
    applySnapshot(latest.budgets);
  }

  return new Map(runtimeBudgets);
}

export async function saveChannelBudgetConfig(input: {
  source: string;
  budgetCents?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  reset?: boolean;
  updatedBy?: string;
  note?: string;
}) {
  const source = normalizeChannelSource(input.source);
  const updatedBy = input.updatedBy ?? process.env.ADMIN_AUDIT_OPERATOR ?? "admin";
  const updatedAt = new Date().toISOString();

  if (input.reset) {
    runtimeBudgets.delete(source);
  } else {
    const budgetCents = input.budgetCents;

    if (budgetCents === undefined || !Number.isInteger(budgetCents) || budgetCents < 0) {
      throw new Error("BUDGET_INVALID");
    }

    runtimeBudgets.set(source, {
      source,
      budgetCents,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      updatedAt,
      updatedBy,
      note: input.note,
    });
  }

  const budgets = Array.from(runtimeBudgets.values());
  const metadata = {
    event: "channel_budget_config_updated",
    budgets,
    updatedBy,
    note: input.note,
  } satisfies ChannelBudgetConfigMetadata;

  await createUsageLog({
    provider: "internal",
    model: "channel-budget-config",
    feature: "channel_budget_config",
    costCents: 0,
    metadata,
  });

  return metadata;
}
