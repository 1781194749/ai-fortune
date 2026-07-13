import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  createUsageLog,
  getUsageLogsByFeature,
  type UsageLogRecord,
} from "@/lib/usage-log-store";

export const launchDatabaseAcceptanceEvidenceFeature =
  "launch_database_acceptance_evidence";
export const launchDatabaseAcceptanceEvidenceEvent =
  "launch_database_acceptance_evidence_saved";

export type LaunchDatabaseAcceptanceEvidenceItemId =
  | "provision"
  | "connection"
  | "schema"
  | "probe"
  | "coverage"
  | "backup"
  | "restore";

export type LaunchDatabaseAcceptanceEvidenceSummary = {
  ready: number;
  warning: number;
  blocking: number;
  total: number;
  trackedItems: number;
  readyItems: number;
  latestEvidenceAt?: string;
  latestReadyAt?: string;
};

export type LaunchDatabaseAcceptanceEvidenceMetadata = {
  event: typeof launchDatabaseAcceptanceEvidenceEvent;
  itemId: LaunchDatabaseAcceptanceEvidenceItemId;
  itemLabel: string;
  status: HealthStatus;
  evidenceUrl?: string;
  migrationLogUrl?: string;
  backupPolicyUrl?: string;
  restoreDrillUrl?: string;
  note?: string;
  savedAt: string;
  savedBy: string;
  path?: string;
  userAgent?: string;
  ipHint?: string;
};

export type LaunchDatabaseAcceptanceEvidenceRecord = {
  id: string;
  createdAt: string;
  metadata: LaunchDatabaseAcceptanceEvidenceMetadata;
};

const itemLabels = {
  provision: "生产 PostgreSQL 实例",
  connection: "DATABASE_URL 与访问白名单",
  schema: "Prisma Schema / 迁移",
  probe: "落库探针",
  coverage: "上线关键事件覆盖",
  backup: "自动备份策略",
  restore: "恢复演练",
} satisfies Record<LaunchDatabaseAcceptanceEvidenceItemId, string>;

const itemIds = Object.keys(itemLabels) as LaunchDatabaseAcceptanceEvidenceItemId[];

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
  if (typeof value === "string" && itemIds.includes(value as LaunchDatabaseAcceptanceEvidenceItemId)) {
    return value as LaunchDatabaseAcceptanceEvidenceItemId;
  }

  throw new Error("ITEM_ID_INVALID");
}

function normalizeOptionalText(value: unknown, maxLength = 240) {
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

export function databaseAcceptanceEvidenceItemLabel(
  itemId: LaunchDatabaseAcceptanceEvidenceItemId,
) {
  return itemLabels[itemId];
}

export function summarizeLaunchDatabaseAcceptanceEvidenceRecords(
  records: LaunchDatabaseAcceptanceEvidenceRecord[],
): LaunchDatabaseAcceptanceEvidenceSummary {
  const latestEvidenceAt = records
    .map((record) => record.metadata.savedAt)
    .sort((a, b) => b.localeCompare(a))[0];
  const latestReadyAt = records
    .filter((record) => record.metadata.status === "ready")
    .map((record) => record.metadata.savedAt)
    .sort((a, b) => b.localeCompare(a))[0];
  const latestByItem = latestLaunchDatabaseAcceptanceEvidenceByItem(records);

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

export function latestLaunchDatabaseAcceptanceEvidenceByItem(
  records: LaunchDatabaseAcceptanceEvidenceRecord[],
) {
  const latestByItem = new Map<
    LaunchDatabaseAcceptanceEvidenceItemId,
    LaunchDatabaseAcceptanceEvidenceRecord
  >();

  for (const record of records) {
    const current = latestByItem.get(record.metadata.itemId);

    if (!current || record.metadata.savedAt.localeCompare(current.metadata.savedAt) > 0) {
      latestByItem.set(record.metadata.itemId, record);
    }
  }

  return latestByItem;
}

export function readLaunchDatabaseAcceptanceEvidenceMetadata(
  log: UsageLogRecord,
): LaunchDatabaseAcceptanceEvidenceMetadata | undefined {
  if (log.feature !== launchDatabaseAcceptanceEvidenceFeature || !isRecord(log.metadata)) {
    return undefined;
  }

  if (log.metadata.event !== launchDatabaseAcceptanceEvidenceEvent) {
    return undefined;
  }

  const itemId = readString(log.metadata.itemId);
  const savedAt = readString(log.metadata.savedAt);

  if (
    !itemId ||
    !itemIds.includes(itemId as LaunchDatabaseAcceptanceEvidenceItemId) ||
    !savedAt
  ) {
    return undefined;
  }

  return {
    event: launchDatabaseAcceptanceEvidenceEvent,
    itemId: itemId as LaunchDatabaseAcceptanceEvidenceItemId,
    itemLabel:
      readString(log.metadata.itemLabel) ??
      databaseAcceptanceEvidenceItemLabel(itemId as LaunchDatabaseAcceptanceEvidenceItemId),
    status: readStatus(log.metadata.status),
    evidenceUrl: readString(log.metadata.evidenceUrl),
    migrationLogUrl: readString(log.metadata.migrationLogUrl),
    backupPolicyUrl: readString(log.metadata.backupPolicyUrl),
    restoreDrillUrl: readString(log.metadata.restoreDrillUrl),
    note: readString(log.metadata.note),
    savedAt,
    savedBy: readString(log.metadata.savedBy) ?? "admin",
    path: readString(log.metadata.path),
    userAgent: readString(log.metadata.userAgent),
    ipHint: readString(log.metadata.ipHint),
  };
}

export async function getLaunchDatabaseAcceptanceEvidenceRecords(
  input: { take?: number } = {},
) {
  const logs = await getUsageLogsByFeature(launchDatabaseAcceptanceEvidenceFeature, {
    take: input.take ?? 80,
  });

  return logs
    .map((log) => {
      const metadata = readLaunchDatabaseAcceptanceEvidenceMetadata(log);

      if (!metadata) {
        return undefined;
      }

      return {
        id: log.id,
        createdAt: log.createdAt,
        metadata,
      } satisfies LaunchDatabaseAcceptanceEvidenceRecord;
    })
    .filter((record): record is LaunchDatabaseAcceptanceEvidenceRecord => Boolean(record));
}

export async function saveLaunchDatabaseAcceptanceEvidence(input: {
  itemId: unknown;
  status: unknown;
  evidenceUrl?: unknown;
  migrationLogUrl?: unknown;
  backupPolicyUrl?: unknown;
  restoreDrillUrl?: unknown;
  note?: unknown;
  request?: Request;
  operator?: string;
}) {
  const savedAt = new Date().toISOString();
  const itemId = normalizeItemId(input.itemId);
  const metadata = {
    event: launchDatabaseAcceptanceEvidenceEvent,
    itemId,
    itemLabel: databaseAcceptanceEvidenceItemLabel(itemId),
    status: normalizeStatus(input.status),
    evidenceUrl: normalizeOptionalUrl(input.evidenceUrl),
    migrationLogUrl: normalizeOptionalUrl(input.migrationLogUrl),
    backupPolicyUrl: normalizeOptionalUrl(input.backupPolicyUrl),
    restoreDrillUrl: normalizeOptionalUrl(input.restoreDrillUrl),
    note: normalizeOptionalText(input.note, 320),
    savedAt,
    savedBy: input.operator ?? process.env.ADMIN_AUDIT_OPERATOR ?? "admin",
    path: requestPath(input.request),
    userAgent: readHeader(input.request, "user-agent"),
    ipHint: maskClientIp(
      readHeader(input.request, "x-forwarded-for") ??
        readHeader(input.request, "x-real-ip") ??
        readHeader(input.request, "cf-connecting-ip"),
    ),
  } satisfies LaunchDatabaseAcceptanceEvidenceMetadata;

  const record = await createUsageLog({
    provider: "internal",
    model: "launch-database-acceptance",
    feature: launchDatabaseAcceptanceEvidenceFeature,
    costCents: 0,
    metadata,
  });

  return {
    id: record.id,
    createdAt: record.createdAt,
    metadata,
  } satisfies LaunchDatabaseAcceptanceEvidenceRecord;
}
