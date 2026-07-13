import "server-only";

import { createUsageLog, type UsageLogRecord } from "@/lib/usage-log-store";

export type AdminAuditAction =
  | "report_retry"
  | "report_compensate"
  | "entitlement_adjust"
  | "order_refund"
  | "product_config_update"
  | "promotion_config_update"
  | "checkout_experiment_config_update"
  | "channel_review_export"
  | "channel_budget_config_update"
  | "channel_budget_alert_config_update"
  | "channel_budget_review_archive"
  | "launch_external_readiness_update"
  | "launch_weekly_focus_update"
  | "launch_daily_action_progress_update"
  | "launch_goal_progress_update"
  | "launch_payment_acceptance_evidence_update"
  | "launch_acceptance_evidence_update"
  | "launch_unit_economics_sample_update"
  | "launch_database_acceptance_evidence_update"
  | "launch_ai_storage_acceptance_evidence_update"
  | "launch_deployment_acceptance_evidence_update";

export type AdminAuditStatus = "success" | "failed" | "queued";

export type AdminAuditMetadata = {
  event: "admin_action";
  action: AdminAuditAction;
  status: AdminAuditStatus;
  operator: string;
  resourceType:
    | "report"
    | "order"
    | "wallet"
    | "entitlement"
    | "product"
    | "promotion"
    | "experiment"
    | "export"
    | "channel"
    | "launch";
  resourceId: string;
  reportId?: string;
  orderId?: string;
  targetUserId?: string;
  amount?: number;
  reason?: string;
  message?: string;
  path?: string;
  userAgent?: string;
  ipHint?: string;
  details?: Record<string, unknown>;
};

type RecordAdminAuditInput = Omit<AdminAuditMetadata, "event" | "operator" | "path" | "userAgent" | "ipHint"> & {
  request?: Request;
  operator?: string;
};

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

function requestPath(request: Request | undefined) {
  if (!request) {
    return undefined;
  }

  return new URL(request.url).pathname;
}

export async function recordAdminAudit(input: RecordAdminAuditInput) {
  const metadata: AdminAuditMetadata = {
    event: "admin_action",
    action: input.action,
    status: input.status,
    operator: input.operator ?? process.env.ADMIN_AUDIT_OPERATOR ?? "admin",
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    reportId: input.reportId,
    orderId: input.orderId,
    targetUserId: input.targetUserId,
    amount: input.amount,
    reason: input.reason,
    message: input.message,
    path: requestPath(input.request),
    userAgent: readHeader(input.request, "user-agent"),
    ipHint: maskClientIp(
      readHeader(input.request, "x-forwarded-for") ??
        readHeader(input.request, "x-real-ip") ??
        readHeader(input.request, "cf-connecting-ip"),
    ),
    details: input.details,
  };

  return createUsageLog({
    userId: input.targetUserId,
    provider: "internal",
    model: "admin-console",
    feature: "admin_action",
    costCents: 0,
    metadata,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAuditAction(value: unknown): AdminAuditAction | undefined {
  return value === "report_retry" ||
    value === "report_compensate" ||
    value === "entitlement_adjust" ||
    value === "order_refund" ||
    value === "product_config_update" ||
    value === "promotion_config_update" ||
    value === "checkout_experiment_config_update" ||
    value === "channel_review_export" ||
    value === "channel_budget_config_update" ||
    value === "channel_budget_alert_config_update" ||
    value === "channel_budget_review_archive" ||
    value === "launch_external_readiness_update" ||
    value === "launch_weekly_focus_update" ||
    value === "launch_daily_action_progress_update" ||
    value === "launch_goal_progress_update" ||
    value === "launch_payment_acceptance_evidence_update" ||
    value === "launch_acceptance_evidence_update" ||
    value === "launch_unit_economics_sample_update" ||
    value === "launch_database_acceptance_evidence_update" ||
    value === "launch_ai_storage_acceptance_evidence_update" ||
    value === "launch_deployment_acceptance_evidence_update"
    ? value
    : undefined;
}

function normalizeAuditStatus(value: unknown): AdminAuditStatus | undefined {
  return value === "success" || value === "failed" || value === "queued" ? value : undefined;
}

function normalizeResourceType(value: unknown): AdminAuditMetadata["resourceType"] | undefined {
  return value === "report" ||
    value === "order" ||
    value === "wallet" ||
    value === "entitlement" ||
    value === "product" ||
    value === "promotion" ||
    value === "experiment" ||
    value === "export" ||
    value === "channel" ||
    value === "launch"
    ? value
    : undefined;
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function readAdminAuditMetadata(log: UsageLogRecord) {
  if (log.feature !== "admin_action" || !isRecord(log.metadata)) {
    return undefined;
  }

  const action = normalizeAuditAction(log.metadata.action);
  const status = normalizeAuditStatus(log.metadata.status);
  const resourceType = normalizeResourceType(log.metadata.resourceType);
  const resourceId = readString(log.metadata.resourceId);

  if (log.metadata.event !== "admin_action" || !action || !status || !resourceType || !resourceId) {
    return undefined;
  }

  return {
    event: "admin_action",
    action,
    status,
    operator: readString(log.metadata.operator) ?? "admin",
    resourceType,
    resourceId,
    reportId: readString(log.metadata.reportId),
    orderId: readString(log.metadata.orderId),
    targetUserId: readString(log.metadata.targetUserId),
    amount: readNumber(log.metadata.amount),
    reason: readString(log.metadata.reason),
    message: readString(log.metadata.message),
    path: readString(log.metadata.path),
    userAgent: readString(log.metadata.userAgent),
    ipHint: readString(log.metadata.ipHint),
    details: isRecord(log.metadata.details) ? log.metadata.details : undefined,
  } satisfies AdminAuditMetadata;
}
