import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  createUsageLog,
  getUsageLogsByFeature,
  type UsageLogRecord,
} from "@/lib/usage-log-store";

export const launchAiStorageAcceptanceEvidenceFeature =
  "launch_ai_storage_acceptance_evidence";
export const launchAiStorageAcceptanceEvidenceEvent =
  "launch_ai_storage_acceptance_evidence_saved";

export type LaunchAiStorageAcceptanceEvidenceItemId =
  | "openai_application"
  | "openai_env"
  | "openai_cost_rates"
  | "openai_diagnostics"
  | "qiniu_application"
  | "qiniu_env"
  | "qiniu_callbacks"
  | "palm_vision"
  | "deep_report"
  | "cost_sample";

export type LaunchAiStorageAcceptanceEvidenceSummary = {
  ready: number;
  warning: number;
  blocking: number;
  total: number;
  trackedItems: number;
  readyItems: number;
  latestEvidenceAt?: string;
  latestReadyAt?: string;
};

export type LaunchAiStorageAcceptanceEvidenceMetadata = {
  event: typeof launchAiStorageAcceptanceEvidenceEvent;
  itemId: LaunchAiStorageAcceptanceEvidenceItemId;
  itemLabel: string;
  status: HealthStatus;
  evidenceUrl?: string;
  diagnosticUrl?: string;
  publicImageUrl?: string;
  palmReportUrl?: string;
  deepReportUrl?: string;
  costSampleUrl?: string;
  note?: string;
  savedAt: string;
  savedBy: string;
  path?: string;
  userAgent?: string;
  ipHint?: string;
};

export type LaunchAiStorageAcceptanceEvidenceRecord = {
  id: string;
  createdAt: string;
  metadata: LaunchAiStorageAcceptanceEvidenceMetadata;
};

const itemLabels = {
  openai_application: "OpenAI 项目、Key 和预算",
  openai_env: "OpenAI 模型变量",
  openai_cost_rates: "OpenAI 成本费率",
  openai_diagnostics: "OpenAI 模型读取诊断",
  qiniu_application: "七牛 bucket、域名和存储项目",
  qiniu_env: "七牛生产变量",
  qiniu_callbacks: "七牛 CORS 与公开 URL",
  palm_vision: "手相上传与视觉报告",
  deep_report: "付费深度报告生成",
  cost_sample: "AI 对话、深度报告和成本样本",
} satisfies Record<LaunchAiStorageAcceptanceEvidenceItemId, string>;

const itemIds = Object.keys(itemLabels) as LaunchAiStorageAcceptanceEvidenceItemId[];

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

function readStatus(value: unknown): HealthStatus {
  return value === "ready" || value === "warning" || value === "blocking" ? value : "warning";
}

function normalizeStatus(value: unknown) {
  if (value === "ready" || value === "warning" || value === "blocking") {
    return value satisfies HealthStatus;
  }

  throw new Error("STATUS_INVALID");
}

function normalizeItemId(value: unknown) {
  if (
    typeof value === "string" &&
    itemIds.includes(value as LaunchAiStorageAcceptanceEvidenceItemId)
  ) {
    return value as LaunchAiStorageAcceptanceEvidenceItemId;
  }

  throw new Error("ITEM_ID_INVALID");
}

function normalizeOptionalText(value: unknown, maxLength = 260) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim().replace(/\s+/g, " ");

  return trimmed ? trimmed.slice(0, maxLength) : undefined;
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

export function aiStorageAcceptanceEvidenceItemLabel(
  itemId: LaunchAiStorageAcceptanceEvidenceItemId,
) {
  return itemLabels[itemId];
}

export function latestLaunchAiStorageAcceptanceEvidenceByItem(
  records: LaunchAiStorageAcceptanceEvidenceRecord[],
) {
  const latestByItem = new Map<
    LaunchAiStorageAcceptanceEvidenceItemId,
    LaunchAiStorageAcceptanceEvidenceRecord
  >();

  for (const record of records) {
    const current = latestByItem.get(record.metadata.itemId);

    if (!current || record.metadata.savedAt.localeCompare(current.metadata.savedAt) > 0) {
      latestByItem.set(record.metadata.itemId, record);
    }
  }

  return latestByItem;
}

export function summarizeLaunchAiStorageAcceptanceEvidenceRecords(
  records: LaunchAiStorageAcceptanceEvidenceRecord[],
): LaunchAiStorageAcceptanceEvidenceSummary {
  const latestEvidenceAt = records
    .map((record) => record.metadata.savedAt)
    .sort((a, b) => b.localeCompare(a))[0];
  const latestReadyAt = records
    .filter((record) => record.metadata.status === "ready")
    .map((record) => record.metadata.savedAt)
    .sort((a, b) => b.localeCompare(a))[0];
  const latestByItem = latestLaunchAiStorageAcceptanceEvidenceByItem(records);

  return {
    ready: records.filter((record) => record.metadata.status === "ready").length,
    warning: records.filter((record) => record.metadata.status === "warning").length,
    blocking: records.filter((record) => record.metadata.status === "blocking").length,
    total: records.length,
    trackedItems: latestByItem.size,
    readyItems: [...latestByItem.values()].filter(
      (record) => record.metadata.status === "ready",
    ).length,
    latestEvidenceAt,
    latestReadyAt,
  };
}

export function readLaunchAiStorageAcceptanceEvidenceMetadata(
  log: UsageLogRecord,
): LaunchAiStorageAcceptanceEvidenceMetadata | undefined {
  if (log.feature !== launchAiStorageAcceptanceEvidenceFeature || !isRecord(log.metadata)) {
    return undefined;
  }

  if (log.metadata.event !== launchAiStorageAcceptanceEvidenceEvent) {
    return undefined;
  }

  const itemId = readString(log.metadata.itemId);
  const savedAt = readString(log.metadata.savedAt);

  if (
    !itemId ||
    !itemIds.includes(itemId as LaunchAiStorageAcceptanceEvidenceItemId) ||
    !savedAt
  ) {
    return undefined;
  }

  return {
    event: launchAiStorageAcceptanceEvidenceEvent,
    itemId: itemId as LaunchAiStorageAcceptanceEvidenceItemId,
    itemLabel:
      readString(log.metadata.itemLabel) ??
      aiStorageAcceptanceEvidenceItemLabel(
        itemId as LaunchAiStorageAcceptanceEvidenceItemId,
      ),
    status: readStatus(log.metadata.status),
    evidenceUrl: readString(log.metadata.evidenceUrl),
    diagnosticUrl: readString(log.metadata.diagnosticUrl),
    publicImageUrl: readString(log.metadata.publicImageUrl),
    palmReportUrl: readString(log.metadata.palmReportUrl),
    deepReportUrl: readString(log.metadata.deepReportUrl),
    costSampleUrl: readString(log.metadata.costSampleUrl),
    note: readString(log.metadata.note),
    savedAt,
    savedBy: readString(log.metadata.savedBy) ?? "admin",
    path: readString(log.metadata.path),
    userAgent: readString(log.metadata.userAgent),
    ipHint: readString(log.metadata.ipHint),
  };
}

export async function getLaunchAiStorageAcceptanceEvidenceRecords(
  input: { take?: number } = {},
) {
  const logs = await getUsageLogsByFeature(launchAiStorageAcceptanceEvidenceFeature, {
    take: input.take ?? 80,
  });

  return logs
    .map((log) => {
      const metadata = readLaunchAiStorageAcceptanceEvidenceMetadata(log);

      if (!metadata) {
        return undefined;
      }

      return {
        id: log.id,
        createdAt: log.createdAt,
        metadata,
      } satisfies LaunchAiStorageAcceptanceEvidenceRecord;
    })
    .filter((record): record is LaunchAiStorageAcceptanceEvidenceRecord => Boolean(record));
}

export async function saveLaunchAiStorageAcceptanceEvidence(input: {
  itemId: unknown;
  status: unknown;
  evidenceUrl?: unknown;
  diagnosticUrl?: unknown;
  publicImageUrl?: unknown;
  palmReportUrl?: unknown;
  deepReportUrl?: unknown;
  costSampleUrl?: unknown;
  note?: unknown;
  request?: Request;
  operator?: string;
}) {
  const savedAt = new Date().toISOString();
  const itemId = normalizeItemId(input.itemId);
  const metadata = {
    event: launchAiStorageAcceptanceEvidenceEvent,
    itemId,
    itemLabel: aiStorageAcceptanceEvidenceItemLabel(itemId),
    status: normalizeStatus(input.status),
    evidenceUrl: normalizeOptionalUrl(input.evidenceUrl),
    diagnosticUrl: normalizeOptionalUrl(input.diagnosticUrl),
    publicImageUrl: normalizeOptionalUrl(input.publicImageUrl),
    palmReportUrl: normalizeOptionalUrl(input.palmReportUrl),
    deepReportUrl: normalizeOptionalUrl(input.deepReportUrl),
    costSampleUrl: normalizeOptionalUrl(input.costSampleUrl),
    note: normalizeOptionalText(input.note, 360),
    savedAt,
    savedBy: input.operator ?? process.env.ADMIN_AUDIT_OPERATOR ?? "admin",
    path: requestPath(input.request),
    userAgent: readHeader(input.request, "user-agent"),
    ipHint: maskClientIp(
      readHeader(input.request, "x-forwarded-for") ??
        readHeader(input.request, "x-real-ip") ??
        readHeader(input.request, "cf-connecting-ip"),
    ),
  } satisfies LaunchAiStorageAcceptanceEvidenceMetadata;

  const record = await createUsageLog({
    provider: "internal",
    model: "launch-ai-storage-acceptance",
    feature: launchAiStorageAcceptanceEvidenceFeature,
    costCents: 0,
    metadata,
  });

  return {
    id: record.id,
    createdAt: record.createdAt,
    metadata,
  } satisfies LaunchAiStorageAcceptanceEvidenceRecord;
}
