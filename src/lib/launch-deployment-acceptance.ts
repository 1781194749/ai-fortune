import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  createUsageLog,
  getUsageLogsByFeature,
  type UsageLogRecord,
} from "@/lib/usage-log-store";

export const launchDeploymentAcceptanceEvidenceFeature =
  "launch_deployment_acceptance_evidence";
export const launchDeploymentAcceptanceEvidenceEvent =
  "launch_deployment_acceptance_evidence_saved";

export type LaunchDeploymentAcceptanceEvidenceItemId =
  | "domain_dns"
  | "https_app_url"
  | "deploy_env"
  | "admin_security"
  | "session_secret"
  | "public_callbacks"
  | "preflight"
  | "page_smoke"
  | "restart_rollback";

export type LaunchDeploymentAcceptanceEvidenceSummary = {
  ready: number;
  warning: number;
  blocking: number;
  total: number;
  trackedItems: number;
  readyItems: number;
  latestEvidenceAt?: string;
  latestReadyAt?: string;
};

export type LaunchDeploymentAcceptanceEvidenceMetadata = {
  event: typeof launchDeploymentAcceptanceEvidenceEvent;
  itemId: LaunchDeploymentAcceptanceEvidenceItemId;
  itemLabel: string;
  status: HealthStatus;
  evidenceUrl?: string;
  urlCheckUrl?: string;
  preflightUrl?: string;
  smokeRecordingUrl?: string;
  rollbackUrl?: string;
  note?: string;
  savedAt: string;
  savedBy: string;
  path?: string;
  userAgent?: string;
  ipHint?: string;
};

export type LaunchDeploymentAcceptanceEvidenceRecord = {
  id: string;
  createdAt: string;
  metadata: LaunchDeploymentAcceptanceEvidenceMetadata;
};

const itemLabels = {
  domain_dns: "域名实名 / DNS / HTTPS",
  https_app_url: "正式 APP_URL",
  deploy_env: "部署平台生产变量",
  admin_security: "后台访问保护",
  session_secret: "会话密钥与登录安全",
  public_callbacks: "公网回调与协议链接",
  preflight: "上线预检脚本",
  page_smoke: "生产页面烟测",
  restart_rollback: "重启恢复与回滚记录",
} satisfies Record<LaunchDeploymentAcceptanceEvidenceItemId, string>;

const itemIds = Object.keys(itemLabels) as LaunchDeploymentAcceptanceEvidenceItemId[];

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
    itemIds.includes(value as LaunchDeploymentAcceptanceEvidenceItemId)
  ) {
    return value as LaunchDeploymentAcceptanceEvidenceItemId;
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

export function deploymentAcceptanceEvidenceItemLabel(
  itemId: LaunchDeploymentAcceptanceEvidenceItemId,
) {
  return itemLabels[itemId];
}

export function latestLaunchDeploymentAcceptanceEvidenceByItem(
  records: LaunchDeploymentAcceptanceEvidenceRecord[],
) {
  const latestByItem = new Map<
    LaunchDeploymentAcceptanceEvidenceItemId,
    LaunchDeploymentAcceptanceEvidenceRecord
  >();

  for (const record of records) {
    const current = latestByItem.get(record.metadata.itemId);

    if (!current || record.metadata.savedAt.localeCompare(current.metadata.savedAt) > 0) {
      latestByItem.set(record.metadata.itemId, record);
    }
  }

  return latestByItem;
}

export function summarizeLaunchDeploymentAcceptanceEvidenceRecords(
  records: LaunchDeploymentAcceptanceEvidenceRecord[],
): LaunchDeploymentAcceptanceEvidenceSummary {
  const latestEvidenceAt = records
    .map((record) => record.metadata.savedAt)
    .sort((a, b) => b.localeCompare(a))[0];
  const latestReadyAt = records
    .filter((record) => record.metadata.status === "ready")
    .map((record) => record.metadata.savedAt)
    .sort((a, b) => b.localeCompare(a))[0];
  const latestByItem = latestLaunchDeploymentAcceptanceEvidenceByItem(records);

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

export function readLaunchDeploymentAcceptanceEvidenceMetadata(
  log: UsageLogRecord,
): LaunchDeploymentAcceptanceEvidenceMetadata | undefined {
  if (log.feature !== launchDeploymentAcceptanceEvidenceFeature || !isRecord(log.metadata)) {
    return undefined;
  }

  if (log.metadata.event !== launchDeploymentAcceptanceEvidenceEvent) {
    return undefined;
  }

  const itemId = readString(log.metadata.itemId);
  const savedAt = readString(log.metadata.savedAt);

  if (
    !itemId ||
    !itemIds.includes(itemId as LaunchDeploymentAcceptanceEvidenceItemId) ||
    !savedAt
  ) {
    return undefined;
  }

  return {
    event: launchDeploymentAcceptanceEvidenceEvent,
    itemId: itemId as LaunchDeploymentAcceptanceEvidenceItemId,
    itemLabel:
      readString(log.metadata.itemLabel) ??
      deploymentAcceptanceEvidenceItemLabel(itemId as LaunchDeploymentAcceptanceEvidenceItemId),
    status: readStatus(log.metadata.status),
    evidenceUrl: readString(log.metadata.evidenceUrl),
    urlCheckUrl: readString(log.metadata.urlCheckUrl),
    preflightUrl: readString(log.metadata.preflightUrl),
    smokeRecordingUrl: readString(log.metadata.smokeRecordingUrl),
    rollbackUrl: readString(log.metadata.rollbackUrl),
    note: readString(log.metadata.note),
    savedAt,
    savedBy: readString(log.metadata.savedBy) ?? "admin",
    path: readString(log.metadata.path),
    userAgent: readString(log.metadata.userAgent),
    ipHint: readString(log.metadata.ipHint),
  };
}

export async function getLaunchDeploymentAcceptanceEvidenceRecords(
  input: { take?: number } = {},
) {
  const logs = await getUsageLogsByFeature(launchDeploymentAcceptanceEvidenceFeature, {
    take: input.take ?? 80,
  });

  return logs
    .map((log) => {
      const metadata = readLaunchDeploymentAcceptanceEvidenceMetadata(log);

      if (!metadata) {
        return undefined;
      }

      return {
        id: log.id,
        createdAt: log.createdAt,
        metadata,
      } satisfies LaunchDeploymentAcceptanceEvidenceRecord;
    })
    .filter((record): record is LaunchDeploymentAcceptanceEvidenceRecord => Boolean(record));
}

export async function saveLaunchDeploymentAcceptanceEvidence(input: {
  itemId: unknown;
  status: unknown;
  evidenceUrl?: unknown;
  urlCheckUrl?: unknown;
  preflightUrl?: unknown;
  smokeRecordingUrl?: unknown;
  rollbackUrl?: unknown;
  note?: unknown;
  request?: Request;
  operator?: string;
}) {
  const savedAt = new Date().toISOString();
  const itemId = normalizeItemId(input.itemId);
  const metadata = {
    event: launchDeploymentAcceptanceEvidenceEvent,
    itemId,
    itemLabel: deploymentAcceptanceEvidenceItemLabel(itemId),
    status: normalizeStatus(input.status),
    evidenceUrl: normalizeOptionalUrl(input.evidenceUrl),
    urlCheckUrl: normalizeOptionalUrl(input.urlCheckUrl),
    preflightUrl: normalizeOptionalUrl(input.preflightUrl),
    smokeRecordingUrl: normalizeOptionalUrl(input.smokeRecordingUrl),
    rollbackUrl: normalizeOptionalUrl(input.rollbackUrl),
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
  } satisfies LaunchDeploymentAcceptanceEvidenceMetadata;

  const record = await createUsageLog({
    provider: "internal",
    model: "launch-deployment-acceptance",
    feature: launchDeploymentAcceptanceEvidenceFeature,
    costCents: 0,
    metadata,
  });

  return {
    id: record.id,
    createdAt: record.createdAt,
    metadata,
  } satisfies LaunchDeploymentAcceptanceEvidenceRecord;
}
