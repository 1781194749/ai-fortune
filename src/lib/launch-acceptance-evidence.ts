import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  createUsageLog,
  getUsageLogsByFeature,
  type UsageLogRecord,
} from "@/lib/usage-log-store";

export const launchAcceptanceEvidenceFeature = "launch_acceptance_evidence";

export type LaunchAcceptanceEvidenceSummary = {
  ready: number;
  warning: number;
  blocking: number;
  total: number;
  latestEvidenceAt?: string;
};

export type LaunchAcceptanceEvidenceMetadata = {
  event: "launch_acceptance_evidence_saved";
  caseId: string;
  caseTitle: string;
  caseGroup: string;
  status: HealthStatus;
  tester?: string;
  evidenceUrl?: string;
  recordingUrl?: string;
  note?: string;
  savedAt: string;
  savedBy: string;
  path?: string;
  userAgent?: string;
  ipHint?: string;
};

export type LaunchAcceptanceEvidenceRecord = {
  id: string;
  createdAt: string;
  metadata: LaunchAcceptanceEvidenceMetadata;
};

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

function normalizeRequiredText(value: unknown, errorCode: string, maxLength = 160) {
  if (typeof value !== "string") {
    throw new Error(errorCode);
  }

  const trimmed = value.trim().replace(/\s+/g, " ");

  if (!trimmed) {
    throw new Error(errorCode);
  }

  return trimmed.slice(0, maxLength);
}

function normalizeOptionalText(value: unknown, maxLength = 220) {
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

export function summarizeLaunchAcceptanceEvidenceRecords(
  records: LaunchAcceptanceEvidenceRecord[],
): LaunchAcceptanceEvidenceSummary {
  const latestEvidenceAt = records.map((record) => record.metadata.savedAt).sort((a, b) => b.localeCompare(a))[0];

  return {
    ready: records.filter((record) => record.metadata.status === "ready").length,
    warning: records.filter((record) => record.metadata.status === "warning").length,
    blocking: records.filter((record) => record.metadata.status === "blocking").length,
    total: records.length,
    latestEvidenceAt,
  };
}

export function readLaunchAcceptanceEvidenceMetadata(
  log: UsageLogRecord,
): LaunchAcceptanceEvidenceMetadata | undefined {
  if (log.feature !== launchAcceptanceEvidenceFeature || !isRecord(log.metadata)) {
    return undefined;
  }

  if (log.metadata.event !== "launch_acceptance_evidence_saved") {
    return undefined;
  }

  const caseId = readString(log.metadata.caseId);
  const savedAt = readString(log.metadata.savedAt);

  if (!caseId || !savedAt) {
    return undefined;
  }

  return {
    event: "launch_acceptance_evidence_saved",
    caseId,
    caseTitle: readString(log.metadata.caseTitle) ?? "未知验收用例",
    caseGroup: readString(log.metadata.caseGroup) ?? "端到端验收",
    status: readStatus(log.metadata.status),
    tester: readString(log.metadata.tester),
    evidenceUrl: readString(log.metadata.evidenceUrl),
    recordingUrl: readString(log.metadata.recordingUrl),
    note: readString(log.metadata.note),
    savedAt,
    savedBy: readString(log.metadata.savedBy) ?? "admin",
    path: readString(log.metadata.path),
    userAgent: readString(log.metadata.userAgent),
    ipHint: readString(log.metadata.ipHint),
  };
}

export async function getLaunchAcceptanceEvidenceRecords(input: { take?: number } = {}) {
  const logs = await getUsageLogsByFeature(launchAcceptanceEvidenceFeature, {
    take: input.take ?? 80,
  });

  return logs
    .map((log) => {
      const metadata = readLaunchAcceptanceEvidenceMetadata(log);

      if (!metadata) {
        return undefined;
      }

      return {
        id: log.id,
        createdAt: log.createdAt,
        metadata,
      } satisfies LaunchAcceptanceEvidenceRecord;
    })
    .filter((record): record is LaunchAcceptanceEvidenceRecord => Boolean(record));
}

export async function saveLaunchAcceptanceEvidence(input: {
  caseId: unknown;
  caseTitle: unknown;
  caseGroup: unknown;
  status: unknown;
  tester?: unknown;
  evidenceUrl?: unknown;
  recordingUrl?: unknown;
  note?: unknown;
  request?: Request;
  operator?: string;
}) {
  const savedAt = new Date().toISOString();
  const metadata = {
    event: "launch_acceptance_evidence_saved",
    caseId: normalizeRequiredText(input.caseId, "CASE_ID_INVALID", 120),
    caseTitle: normalizeRequiredText(input.caseTitle, "CASE_TITLE_INVALID", 160),
    caseGroup: normalizeRequiredText(input.caseGroup, "CASE_GROUP_INVALID", 80),
    status: normalizeStatus(input.status),
    tester: normalizeOptionalText(input.tester, 80),
    evidenceUrl: normalizeOptionalUrl(input.evidenceUrl),
    recordingUrl: normalizeOptionalUrl(input.recordingUrl),
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
  } satisfies LaunchAcceptanceEvidenceMetadata;

  const record = await createUsageLog({
    provider: "internal",
    model: "launch-acceptance",
    feature: launchAcceptanceEvidenceFeature,
    costCents: 0,
    metadata,
  });

  return {
    id: record.id,
    createdAt: record.createdAt,
    metadata,
  } satisfies LaunchAcceptanceEvidenceRecord;
}
