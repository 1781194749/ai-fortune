import "server-only";

import type { FeatureCode } from "@/lib/commerce";
import {
  createUsageLog,
  getUsageLogsByFeature,
  type UsageLogRecord,
} from "@/lib/usage-log-store";

export const launchUnitEconomicsSampleFeature = "launch_unit_economics_cost_sample";
export const launchUnitEconomicsSampleEvent = "launch_unit_economics_cost_sample_saved";

export type LaunchUnitEconomicsCostSampleMetadata = {
  event: typeof launchUnitEconomicsSampleEvent;
  featureCode: FeatureCode;
  model: string;
  scenario?: string;
  evidenceUrl?: string;
  note?: string;
  savedAt: string;
  savedBy: string;
  path?: string;
  userAgent?: string;
  ipHint?: string;
};

export type LaunchUnitEconomicsCostSample = {
  id: string;
  createdAt: string;
  featureCode: FeatureCode;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costCents: number;
  metadata: LaunchUnitEconomicsCostSampleMetadata;
};

const featureCodes = [
  "chat_basic",
  "tarot_daily",
  "tarot_three_card",
  "tarot_love",
  "bagua_question",
  "bazi_brief",
  "palm_reading",
  "deep_report",
  "yearly_report",
] satisfies FeatureCode[];

function requestPath(request: Request | undefined) {
  return request ? new URL(request.url).pathname : undefined;
}

function readHeader(request: Request | undefined, name: string) {
  return request?.headers.get(name) ?? undefined;
}

function maskClientIp(value: string | undefined) {
  const firstIp = value?.split(",")[0]?.trim();

  if (!firstIp) {
    return undefined;
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(firstIp)) {
    const parts = firstIp.split(".");

    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }

  const ipv6Parts = firstIp.split(":");

  if (ipv6Parts.length > 2) {
    return `${ipv6Parts.slice(0, 3).join(":")}::`;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeOptionalText(value: unknown, maxLength = 220) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim().replace(/\s+/g, " ");

  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function normalizeRequiredText(value: unknown, errorCode: string, maxLength = 120) {
  if (typeof value !== "string") {
    throw new Error(errorCode);
  }

  const trimmed = value.trim().replace(/\s+/g, " ");

  if (!trimmed) {
    throw new Error(errorCode);
  }

  return trimmed.slice(0, maxLength);
}

function normalizeFeatureCode(value: unknown): FeatureCode {
  if (typeof value === "string" && featureCodes.includes(value as FeatureCode)) {
    return value as FeatureCode;
  }

  throw new Error("FEATURE_CODE_INVALID");
}

function normalizeInteger(value: unknown, errorCode: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 50_000_000) {
    throw new Error(errorCode);
  }

  return value;
}

function normalizeCostCents(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 10_000_000) {
    throw new Error("COST_INVALID");
  }

  return value;
}

function normalizeOptionalUrl(value: unknown) {
  const text = normalizeOptionalText(value, 500);

  if (!text) {
    return undefined;
  }

  if (!/^https?:\/\/[^\s]+$/i.test(text)) {
    throw new Error("EVIDENCE_URL_INVALID");
  }

  return text;
}

export function readLaunchUnitEconomicsCostSample(
  log: UsageLogRecord,
): LaunchUnitEconomicsCostSample | undefined {
  if (!isRecord(log.metadata) || log.metadata.event !== launchUnitEconomicsSampleEvent) {
    return undefined;
  }

  const featureCode = readString(log.metadata.featureCode);
  const model = readString(log.metadata.model) ?? log.model;
  const tokensIn = readNumber(log.tokensIn) ?? 0;
  const tokensOut = readNumber(log.tokensOut) ?? 0;
  const costCents = readNumber(log.costCents) ?? 0;

  if (!featureCode || !featureCodes.includes(featureCode as FeatureCode)) {
    return undefined;
  }

  return {
    id: log.id,
    createdAt: log.createdAt,
    featureCode: featureCode as FeatureCode,
    model,
    tokensIn,
    tokensOut,
    costCents,
    metadata: {
      event: launchUnitEconomicsSampleEvent,
      featureCode: featureCode as FeatureCode,
      model,
      scenario: readString(log.metadata.scenario),
      evidenceUrl: readString(log.metadata.evidenceUrl),
      note: readString(log.metadata.note),
      savedAt: readString(log.metadata.savedAt) ?? log.createdAt,
      savedBy: readString(log.metadata.savedBy) ?? "admin",
      path: readString(log.metadata.path),
      userAgent: readString(log.metadata.userAgent),
      ipHint: readString(log.metadata.ipHint),
    },
  };
}

export async function getLaunchUnitEconomicsCostSamples(input: { take?: number } = {}) {
  const logs = await getUsageLogsByFeature(launchUnitEconomicsSampleFeature, {
    take: input.take ?? 500,
  });

  return logs
    .map(readLaunchUnitEconomicsCostSample)
    .filter((record): record is LaunchUnitEconomicsCostSample => Boolean(record));
}

export async function saveLaunchUnitEconomicsCostSample(input: {
  featureCode: unknown;
  model: unknown;
  tokensIn: unknown;
  tokensOut: unknown;
  costCents: unknown;
  scenario?: unknown;
  evidenceUrl?: unknown;
  note?: unknown;
  request?: Request;
  operator?: string;
}) {
  const savedAt = new Date().toISOString();
  const featureCode = normalizeFeatureCode(input.featureCode);
  const model = normalizeRequiredText(input.model, "MODEL_INVALID", 100);
  const metadata = {
    event: launchUnitEconomicsSampleEvent,
    featureCode,
    model,
    scenario: normalizeOptionalText(input.scenario, 160),
    evidenceUrl: normalizeOptionalUrl(input.evidenceUrl),
    note: normalizeOptionalText(input.note, 300),
    savedAt,
    savedBy: input.operator ?? process.env.ADMIN_AUDIT_OPERATOR ?? "admin",
    path: requestPath(input.request),
    userAgent: readHeader(input.request, "user-agent"),
    ipHint: maskClientIp(
      readHeader(input.request, "x-forwarded-for") ??
        readHeader(input.request, "x-real-ip") ??
        readHeader(input.request, "cf-connecting-ip"),
    ),
  } satisfies LaunchUnitEconomicsCostSampleMetadata;

  const record = await createUsageLog({
    provider: "openai",
    model,
    feature: launchUnitEconomicsSampleFeature,
    tokensIn: normalizeInteger(input.tokensIn, "TOKENS_INVALID"),
    tokensOut: normalizeInteger(input.tokensOut, "TOKENS_INVALID"),
    costCents: normalizeCostCents(input.costCents),
    metadata,
  });

  return readLaunchUnitEconomicsCostSample(record);
}
