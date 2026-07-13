import "server-only";

import {
  createUsageLog,
  getUsageLogsByFeature,
  type UsageLogRecord,
} from "@/lib/usage-log-store";

export type PromotionRuntimeConfig = {
  code: string;
  enabled?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  totalLimit?: number | null;
  perUserLimit?: number | null;
  updatedAt: string;
  updatedBy: string;
  note?: string;
};

export type PromotionConfigMetadata = {
  event: "promotion_config_updated";
  rules: PromotionRuntimeConfig[];
  updatedBy: string;
  note?: string;
};

declare global {
  var xuanjiPromotionRuntimeConfigs: Map<string, PromotionRuntimeConfig> | undefined;
}

const runtimeConfigs =
  globalThis.xuanjiPromotionRuntimeConfigs ?? new Map<string, PromotionRuntimeConfig>();

if (!globalThis.xuanjiPromotionRuntimeConfigs) {
  globalThis.xuanjiPromotionRuntimeConfigs = runtimeConfigs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function readOptionalLimit(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

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

function readConfig(value: unknown): PromotionRuntimeConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const code = readString(value.code);
  const updatedAt = readString(value.updatedAt);
  const updatedBy = readString(value.updatedBy);

  if (!code || !updatedAt || !updatedBy) {
    return undefined;
  }

  return {
    code,
    enabled: readBoolean(value.enabled),
    startsAt: readOptionalDate(value.startsAt),
    endsAt: readOptionalDate(value.endsAt),
    totalLimit: readOptionalLimit(value.totalLimit),
    perUserLimit: readOptionalLimit(value.perUserLimit),
    updatedAt,
    updatedBy,
    note: readString(value.note),
  };
}

function applySnapshot(configs: PromotionRuntimeConfig[]) {
  runtimeConfigs.clear();

  for (const config of configs) {
    runtimeConfigs.set(config.code, config);
  }
}

export function readPromotionConfigMetadata(log: UsageLogRecord) {
  if (log.feature !== "promotion_config" || !isRecord(log.metadata)) {
    return undefined;
  }

  if (log.metadata.event !== "promotion_config_updated" || !Array.isArray(log.metadata.rules)) {
    return undefined;
  }

  const rules = log.metadata.rules
    .map(readConfig)
    .filter((config): config is PromotionRuntimeConfig => Boolean(config));
  const updatedBy = readString(log.metadata.updatedBy);

  if (!updatedBy) {
    return undefined;
  }

  return {
    event: "promotion_config_updated",
    rules,
    updatedBy,
    note: readString(log.metadata.note),
  } satisfies PromotionConfigMetadata;
}

export async function getPromotionRuntimeConfigMap() {
  if (runtimeConfigs.size > 0) {
    return new Map(runtimeConfigs);
  }

  const logs = await getUsageLogsByFeature("promotion_config", { take: 20 });
  const latest = logs.map(readPromotionConfigMetadata).find(Boolean);

  if (latest) {
    applySnapshot(latest.rules);
  }

  return new Map(runtimeConfigs);
}

export async function savePromotionRuntimeConfig(input: {
  code: string;
  config?: {
    enabled?: boolean;
    startsAt?: string | null;
    endsAt?: string | null;
    totalLimit?: number | null;
    perUserLimit?: number | null;
  };
  reset?: boolean;
  updatedBy?: string;
  note?: string;
}) {
  const updatedBy = input.updatedBy ?? process.env.ADMIN_AUDIT_OPERATOR ?? "admin";
  const updatedAt = new Date().toISOString();

  if (input.reset) {
    runtimeConfigs.delete(input.code);
  } else {
    runtimeConfigs.set(input.code, {
      code: input.code,
      enabled: input.config?.enabled,
      startsAt: input.config?.startsAt,
      endsAt: input.config?.endsAt,
      totalLimit: input.config?.totalLimit,
      perUserLimit: input.config?.perUserLimit,
      updatedAt,
      updatedBy,
      note: input.note,
    });
  }

  const rules = Array.from(runtimeConfigs.values());
  const metadata = {
    event: "promotion_config_updated",
    rules,
    updatedBy,
    note: input.note,
  } satisfies PromotionConfigMetadata;

  await createUsageLog({
    provider: "internal",
    model: "promotion-config",
    feature: "promotion_config",
    costCents: 0,
    metadata,
  });

  return metadata;
}
