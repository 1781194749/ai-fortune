import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import { getIntegrationDiagnostics } from "@/lib/integration-diagnostics";
import {
  getLaunchAcceptanceEvidenceRecords,
  summarizeLaunchAcceptanceEvidenceRecords,
  type LaunchAcceptanceEvidenceRecord,
  type LaunchAcceptanceEvidenceSummary,
} from "@/lib/launch-acceptance-evidence";
import {
  getLaunchAiStorageAcceptanceEvidenceRecords,
  summarizeLaunchAiStorageAcceptanceEvidenceRecords,
  type LaunchAiStorageAcceptanceEvidenceRecord,
  type LaunchAiStorageAcceptanceEvidenceSummary,
} from "@/lib/launch-ai-storage-acceptance";
import {
  getLaunchDatabaseAcceptanceEvidenceRecords,
  summarizeLaunchDatabaseAcceptanceEvidenceRecords,
  type LaunchDatabaseAcceptanceEvidenceRecord,
  type LaunchDatabaseAcceptanceEvidenceSummary,
} from "@/lib/launch-database-acceptance";
import {
  getLaunchDeploymentAcceptanceEvidenceRecords,
  summarizeLaunchDeploymentAcceptanceEvidenceRecords,
  type LaunchDeploymentAcceptanceEvidenceRecord,
  type LaunchDeploymentAcceptanceEvidenceSummary,
} from "@/lib/launch-deployment-acceptance";
import {
  getLaunchEnvChecklist,
  type LaunchEnvChecklist,
  type LaunchEnvChecklistItem,
} from "@/lib/launch-env-checklist";
import {
  getLaunchDailyActionProgress,
  type LaunchDailyActionProgress,
  type LaunchDailyActionProgressItem,
} from "@/lib/launch-daily-action-progress";
import {
  getLaunchPaymentAcceptance,
  type LaunchPaymentAcceptance,
  type LaunchPaymentAcceptanceChannel,
  type LaunchPaymentAcceptanceEvidenceRecord,
  type LaunchPaymentAcceptanceOrder,
} from "@/lib/launch-payment-acceptance";
import {
  getLaunchProductionGate,
  type LaunchProductionGate,
  type LaunchProductionGateItem,
  type LaunchProductionGateStep,
} from "@/lib/launch-production-gate";
import {
  getLaunchReadiness,
  type LaunchReadinessItem,
} from "@/lib/launch-readiness";
import { buildLaunchRunbook, type LaunchRunbookStep } from "@/lib/launch-runbook";
import {
  getLaunchUnitEconomics,
  type LaunchUnitEconomics,
} from "@/lib/launch-unit-economics";
import {
  getLaunchGoalProgress,
  type LaunchGoalProgress,
  type LaunchGoalProgressItem,
} from "@/lib/launch-goal-progress";
import {
  getLaunchOfflineActionPack,
  type LaunchOfflineActionPack,
  type LaunchOfflineActionPackTodayAction,
} from "@/lib/launch-offline-action-pack";
import {
  createMissingLaunchGoalTransitionGateSnapshot,
  type LaunchGoalTransitionGateSnapshot,
  type LaunchGoalTransitionGateCheckSnapshot,
} from "@/lib/launch-goal-transition-gate";
import type { LaunchUnitEconomicsCostSample } from "@/lib/launch-unit-economics-sample";
import { getPersistenceReadiness } from "@/lib/persistence-readiness";
import {
  createUsageLog,
  getUsageLogsByFeature,
  type UsageLogRecord,
} from "@/lib/usage-log-store";

export const launchEvidenceFeature = "launch_evidence";

type Summary = {
  ready: number;
  warning: number;
  blocking: number;
  total: number;
};

type EnvironmentSummary = LaunchEnvChecklist["summary"];

type PaymentSummary = LaunchPaymentAcceptance["summary"];

type UnitEconomicsSummary = LaunchUnitEconomics["summary"];

type EvidenceDatabaseAcceptanceRecord = Pick<
  LaunchDatabaseAcceptanceEvidenceRecord,
  "id" | "createdAt"
> & {
  itemId: string;
  itemLabel: string;
  status: HealthStatus;
  evidenceUrl?: string;
  migrationLogUrl?: string;
  backupPolicyUrl?: string;
  restoreDrillUrl?: string;
  note?: string;
  savedAt: string;
};

type EvidenceDeploymentAcceptanceRecord = Pick<
  LaunchDeploymentAcceptanceEvidenceRecord,
  "id" | "createdAt"
> & {
  itemId: string;
  itemLabel: string;
  status: HealthStatus;
  evidenceUrl?: string;
  urlCheckUrl?: string;
  preflightUrl?: string;
  smokeRecordingUrl?: string;
  rollbackUrl?: string;
  note?: string;
  savedAt: string;
};

type EvidenceAiStorageAcceptanceRecord = Pick<
  LaunchAiStorageAcceptanceEvidenceRecord,
  "id" | "createdAt"
> & {
  itemId: string;
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
};

type EvidenceAcceptanceRecord = Pick<LaunchAcceptanceEvidenceRecord, "id" | "createdAt"> & {
  caseId: string;
  caseTitle: string;
  caseGroup: string;
  status: HealthStatus;
  tester?: string;
  evidenceUrl?: string;
  recordingUrl?: string;
  note?: string;
  savedAt: string;
};

type EvidenceCheckItem = Pick<
  LaunchReadinessItem,
  "id" | "group" | "label" | "status" | "detail" | "action"
>;

type EvidenceRunbookStep = Pick<
  LaunchRunbookStep,
  "id" | "title" | "owner" | "status" | "action" | "evidence"
>;

type EvidenceEnvironmentItem = Pick<
  LaunchEnvChecklistItem,
  "key" | "group" | "label" | "status" | "stateLabel" | "displayValue" | "detail" | "action"
>;

type EvidencePaymentOrder = Pick<
  LaunchPaymentAcceptanceOrder,
  "id" | "productName" | "priceLabel" | "status" | "providerOrderId" | "paidAt"
>;

type EvidencePaymentRecord = Pick<LaunchPaymentAcceptanceEvidenceRecord, "id" | "createdAt"> & {
  channel: string;
  channelLabel: string;
  status: HealthStatus;
  orderId?: string;
  providerOrderId?: string;
  priceLabel?: string;
  evidenceUrl?: string;
  reconciliationUrl?: string;
  note?: string;
  savedAt: string;
};

type EvidencePaymentChannel = {
  id: string;
  label: string;
  provider: string;
  status: HealthStatus;
  enabled: boolean;
  orderCount: number;
  paidOrderCount: number;
  evidenceRecordCount: number;
  latestPaidOrder?: EvidencePaymentOrder;
  latestEvidence?: EvidencePaymentRecord;
};

type EvidenceUnitEconomicsCostSample = Pick<
  LaunchUnitEconomicsCostSample,
  "id" | "createdAt" | "featureCode" | "model" | "tokensIn" | "tokensOut" | "costCents"
> & {
  scenario?: string;
  evidenceUrl?: string;
  note?: string;
  savedAt: string;
};

type EvidenceGoalProgressItem = LaunchGoalProgressItem;

type EvidenceGoalProgressSummary = LaunchGoalProgress["summary"];

type EvidenceDailyActionProgressItem = LaunchDailyActionProgressItem;

type EvidenceDailyActionProgressSummary = LaunchDailyActionProgress["summary"];

type EvidenceOfflineAction = {
  status: HealthStatus;
  label: string;
  summary: Pick<
    LaunchOfflineActionPack["summary"],
    "ready" | "warning" | "blocking" | "total" | "receipts" | "evidenceLinks"
  >;
  currentAction: LaunchOfflineActionPackTodayAction;
  todayActions: LaunchOfflineActionPackTodayAction[];
};

type EvidenceProductionGateItem = Pick<
  LaunchProductionGateItem,
  "id" | "label" | "status" | "detail" | "action" | "evidence"
>;

type EvidenceProductionGateStep = Pick<
  LaunchProductionGateStep,
  "id" | "label" | "status" | "command" | "detail" | "action" | "evidence" | "summary"
> & {
  blockingItems: EvidenceProductionGateItem[];
  warningItems: EvidenceProductionGateItem[];
};

type EvidenceGoalTransitionGate = LaunchGoalTransitionGateSnapshot;

type EvidenceGoalTransitionGateCheck = LaunchGoalTransitionGateCheckSnapshot;

export type LaunchEvidenceMetadata = {
  event: "launch_evidence";
  archivedAt: string;
  operator: string;
  note?: string;
  status: HealthStatus;
  label: string;
  readiness: {
    status: HealthStatus;
    label: string;
    summary: Summary;
    blockers: EvidenceCheckItem[];
    warnings: EvidenceCheckItem[];
    nextActions: EvidenceCheckItem[];
  };
  runbook: {
    status: HealthStatus;
    label: string;
    summary: Summary;
    nextSteps: EvidenceRunbookStep[];
    groups: Array<{
      id: string;
      title: string;
      status: HealthStatus;
      stepCount: number;
    }>;
  };
  persistence: {
    status: HealthStatus;
    label: string;
    storeMode: string;
    probeCount: number;
    lastProbeAt?: string;
  };
  databaseAcceptance: {
    summary: LaunchDatabaseAcceptanceEvidenceSummary;
    recentEvidence: EvidenceDatabaseAcceptanceRecord[];
  };
  deploymentAcceptance: {
    summary: LaunchDeploymentAcceptanceEvidenceSummary;
    recentEvidence: EvidenceDeploymentAcceptanceRecord[];
  };
  aiStorageAcceptance: {
    summary: LaunchAiStorageAcceptanceEvidenceSummary;
    recentEvidence: EvidenceAiStorageAcceptanceRecord[];
  };
  integration: {
    summary: Summary;
    items: Array<{
      id: string;
      label: string;
      status: HealthStatus;
      checkedAt?: string;
      detail: string;
    }>;
  };
  environment: {
    summary: EnvironmentSummary;
    nextItems: EvidenceEnvironmentItem[];
    groups: Array<{
      name: string;
      ready: number;
      warning: number;
      blocking: number;
      total: number;
    }>;
  };
  paymentAcceptance: {
    status: HealthStatus;
    label: string;
    summary: PaymentSummary;
    channels: EvidencePaymentChannel[];
    recentEvidence: EvidencePaymentRecord[];
  };
  productionGate: {
    status: HealthStatus;
    label: string;
    releaseReady: boolean;
    summary: Summary;
    checkSummary: Summary;
    steps: EvidenceProductionGateStep[];
    nextActions: EvidenceProductionGateItem[];
    commands: Array<{
      label: string;
      command: string;
      detail: string;
    }>;
    copyText: string;
  };
  acceptanceEvidence: {
    summary: LaunchAcceptanceEvidenceSummary;
    recentEvidence: EvidenceAcceptanceRecord[];
  };
  unitEconomics: {
    status: HealthStatus;
    label: string;
    summary: UnitEconomicsSummary;
    recentCostSamples: EvidenceUnitEconomicsCostSample[];
  };
  goalProgress: {
    summary: EvidenceGoalProgressSummary;
    items: EvidenceGoalProgressItem[];
    latestUpdatedAt?: string;
  };
  goalTransitionGate: EvidenceGoalTransitionGate;
  offlineAction: EvidenceOfflineAction;
  dailyActionProgress: {
    summary: EvidenceDailyActionProgressSummary;
    items: EvidenceDailyActionProgressItem[];
    latestUpdatedAt?: string;
  };
  path?: string;
  userAgent?: string;
  ipHint?: string;
};

export type LaunchEvidenceArchive = {
  id: string;
  createdAt: string;
  metadata: LaunchEvidenceMetadata;
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

function normalizeNote(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim().replace(/\s+/g, " ");

  return trimmed ? trimmed.slice(0, 240) : undefined;
}

function evidenceCheckItem(item: LaunchReadinessItem) {
  return {
    id: item.id,
    group: item.group,
    label: item.label,
    status: item.status,
    detail: item.detail,
    action: item.action,
  } satisfies EvidenceCheckItem;
}

function evidenceRunbookStep(step: LaunchRunbookStep) {
  return {
    id: step.id,
    title: step.title,
    owner: step.owner,
    status: step.status,
    action: step.action,
    evidence: step.evidence,
  } satisfies EvidenceRunbookStep;
}

function evidenceEnvironmentItem(item: LaunchEnvChecklistItem) {
  return {
    key: item.key,
    group: item.group,
    label: item.label,
    status: item.status,
    stateLabel: item.stateLabel,
    displayValue: item.displayValue,
    detail: item.detail,
    action: item.action,
  } satisfies EvidenceEnvironmentItem;
}

function evidencePaymentOrder(order: LaunchPaymentAcceptanceOrder): EvidencePaymentOrder {
  return {
    id: order.id,
    productName: order.productName,
    priceLabel: order.priceLabel,
    status: order.status,
    providerOrderId: order.providerOrderId,
    paidAt: order.paidAt,
  };
}

function evidencePaymentRecord(
  record: LaunchPaymentAcceptanceEvidenceRecord,
): EvidencePaymentRecord {
  return {
    id: record.id,
    createdAt: record.createdAt,
    channel: record.metadata.channel,
    channelLabel: record.metadata.channelLabel,
    status: record.metadata.status,
    orderId: record.metadata.orderId,
    providerOrderId: record.metadata.providerOrderId,
    priceLabel: record.metadata.priceLabel,
    evidenceUrl: record.metadata.evidenceUrl,
    reconciliationUrl: record.metadata.reconciliationUrl,
    note: record.metadata.note,
    savedAt: record.metadata.savedAt,
  };
}

function evidencePaymentChannel(channel: LaunchPaymentAcceptanceChannel): EvidencePaymentChannel {
  return {
    id: channel.id,
    label: channel.label,
    provider: channel.provider,
    status: channel.status,
    enabled: channel.enabled,
    orderCount: channel.orderCount,
    paidOrderCount: channel.paidOrderCount,
    evidenceRecordCount: channel.evidenceRecordCount,
    latestPaidOrder: channel.latestPaidOrder
      ? evidencePaymentOrder(channel.latestPaidOrder)
      : undefined,
    latestEvidence: channel.latestEvidence
      ? evidencePaymentRecord(channel.latestEvidence)
      : undefined,
  };
}

function evidenceAcceptanceRecord(
  record: LaunchAcceptanceEvidenceRecord,
): EvidenceAcceptanceRecord {
  return {
    id: record.id,
    createdAt: record.createdAt,
    caseId: record.metadata.caseId,
    caseTitle: record.metadata.caseTitle,
    caseGroup: record.metadata.caseGroup,
    status: record.metadata.status,
    tester: record.metadata.tester,
    evidenceUrl: record.metadata.evidenceUrl,
    recordingUrl: record.metadata.recordingUrl,
    note: record.metadata.note,
    savedAt: record.metadata.savedAt,
  };
}

function evidenceDatabaseAcceptanceRecord(
  record: LaunchDatabaseAcceptanceEvidenceRecord,
): EvidenceDatabaseAcceptanceRecord {
  return {
    id: record.id,
    createdAt: record.createdAt,
    itemId: record.metadata.itemId,
    itemLabel: record.metadata.itemLabel,
    status: record.metadata.status,
    evidenceUrl: record.metadata.evidenceUrl,
    migrationLogUrl: record.metadata.migrationLogUrl,
    backupPolicyUrl: record.metadata.backupPolicyUrl,
    restoreDrillUrl: record.metadata.restoreDrillUrl,
    note: record.metadata.note,
    savedAt: record.metadata.savedAt,
  };
}

function evidenceDeploymentAcceptanceRecord(
  record: LaunchDeploymentAcceptanceEvidenceRecord,
): EvidenceDeploymentAcceptanceRecord {
  return {
    id: record.id,
    createdAt: record.createdAt,
    itemId: record.metadata.itemId,
    itemLabel: record.metadata.itemLabel,
    status: record.metadata.status,
    evidenceUrl: record.metadata.evidenceUrl,
    urlCheckUrl: record.metadata.urlCheckUrl,
    preflightUrl: record.metadata.preflightUrl,
    smokeRecordingUrl: record.metadata.smokeRecordingUrl,
    rollbackUrl: record.metadata.rollbackUrl,
    note: record.metadata.note,
    savedAt: record.metadata.savedAt,
  };
}

function evidenceAiStorageAcceptanceRecord(
  record: LaunchAiStorageAcceptanceEvidenceRecord,
): EvidenceAiStorageAcceptanceRecord {
  return {
    id: record.id,
    createdAt: record.createdAt,
    itemId: record.metadata.itemId,
    itemLabel: record.metadata.itemLabel,
    status: record.metadata.status,
    evidenceUrl: record.metadata.evidenceUrl,
    diagnosticUrl: record.metadata.diagnosticUrl,
    publicImageUrl: record.metadata.publicImageUrl,
    palmReportUrl: record.metadata.palmReportUrl,
    deepReportUrl: record.metadata.deepReportUrl,
    costSampleUrl: record.metadata.costSampleUrl,
    note: record.metadata.note,
    savedAt: record.metadata.savedAt,
  };
}

function evidenceUnitEconomicsCostSample(
  sample: LaunchUnitEconomicsCostSample,
): EvidenceUnitEconomicsCostSample {
  return {
    id: sample.id,
    createdAt: sample.createdAt,
    featureCode: sample.featureCode,
    model: sample.model,
    tokensIn: sample.tokensIn,
    tokensOut: sample.tokensOut,
    costCents: sample.costCents,
    scenario: sample.metadata.scenario,
    evidenceUrl: sample.metadata.evidenceUrl,
    note: sample.metadata.note,
    savedAt: sample.metadata.savedAt,
  };
}

function evidenceProductionGateItem(
  item: LaunchProductionGateItem,
): EvidenceProductionGateItem {
  return {
    id: item.id,
    label: item.label,
    status: item.status,
    detail: item.detail,
    action: item.action,
    evidence: item.evidence,
  };
}

function evidenceProductionGateStep(
  step: LaunchProductionGateStep,
): EvidenceProductionGateStep {
  return {
    id: step.id,
    label: step.label,
    status: step.status,
    command: step.command,
    detail: step.detail,
    action: step.action,
    evidence: step.evidence,
    summary: step.summary,
    blockingItems: step.blockingItems.map(evidenceProductionGateItem),
    warningItems: step.warningItems.map(evidenceProductionGateItem),
  };
}

function evidenceProductionGate(gate: LaunchProductionGate) {
  return {
    status: gate.status,
    label: gate.label,
    releaseReady: gate.releaseReady,
    summary: gate.summary,
    checkSummary: gate.checkSummary,
    steps: gate.steps.map(evidenceProductionGateStep),
    nextActions: gate.nextActions.map(evidenceProductionGateItem),
    commands: gate.commands,
    copyText: gate.copyText,
  } satisfies LaunchEvidenceMetadata["productionGate"];
}

function evidenceOfflineAction(actionPack: LaunchOfflineActionPack): EvidenceOfflineAction {
  return {
    status: actionPack.status,
    label: actionPack.label,
    summary: {
      ready: actionPack.summary.ready,
      warning: actionPack.summary.warning,
      blocking: actionPack.summary.blocking,
      total: actionPack.summary.total,
      receipts: actionPack.summary.receipts,
      evidenceLinks: actionPack.summary.evidenceLinks,
    },
    currentAction: actionPack.currentAction,
    todayActions: actionPack.todayActions.slice(0, 8),
  };
}

export async function archiveLaunchEvidence(input: {
  request?: Request;
  note?: unknown;
  operator?: string;
  goalTransitionGate?: LaunchGoalTransitionGateSnapshot;
}) {
  const archivedAt = new Date().toISOString();
  const [
    readiness,
    persistence,
    integration,
    environment,
    paymentAcceptance,
    acceptanceEvidenceRecords,
    databaseAcceptanceRecords,
    deploymentAcceptanceRecords,
    aiStorageAcceptanceRecords,
    unitEconomics,
    goalProgress,
    offlineActionPack,
    dailyActionProgress,
    productionGate,
  ] = await Promise.all([
    getLaunchReadiness(),
    getPersistenceReadiness(),
    getIntegrationDiagnostics(),
    getLaunchEnvChecklist(),
    getLaunchPaymentAcceptance(),
    getLaunchAcceptanceEvidenceRecords({ take: 24 }),
    getLaunchDatabaseAcceptanceEvidenceRecords({ take: 24 }),
    getLaunchDeploymentAcceptanceEvidenceRecords({ take: 24 }),
    getLaunchAiStorageAcceptanceEvidenceRecords({ take: 24 }),
    getLaunchUnitEconomics(),
    getLaunchGoalProgress(),
    getLaunchOfflineActionPack(),
    getLaunchDailyActionProgress(),
    getLaunchProductionGate(),
  ]);
  const runbook = buildLaunchRunbook(readiness);
  const metadata = {
    event: "launch_evidence",
    archivedAt,
    operator: input.operator ?? process.env.ADMIN_AUDIT_OPERATOR ?? "admin",
    note: normalizeNote(input.note),
    status: readiness.status,
    label: readiness.label,
    readiness: {
      status: readiness.status,
      label: readiness.label,
      summary: readiness.summary,
      blockers: readiness.blockers.map(evidenceCheckItem),
      warnings: readiness.warnings.map(evidenceCheckItem),
      nextActions: readiness.nextActions.map(evidenceCheckItem),
    },
    runbook: {
      status: runbook.status,
      label: runbook.label,
      summary: runbook.summary,
      nextSteps: runbook.nextSteps.map(evidenceRunbookStep),
      groups: runbook.groups.map((group) => ({
        id: group.id,
        title: group.title,
        status: group.status,
        stepCount: group.steps.length,
      })),
    },
    persistence: {
      status: persistence.status,
      label: persistence.label,
      storeMode: persistence.storeMode,
      probeCount: persistence.probeCount,
      lastProbeAt: persistence.lastProbe?.verifiedAt ?? persistence.lastProbe?.createdAt,
    },
    databaseAcceptance: {
      summary: summarizeLaunchDatabaseAcceptanceEvidenceRecords(databaseAcceptanceRecords),
      recentEvidence: databaseAcceptanceRecords
        .slice(0, 8)
        .map(evidenceDatabaseAcceptanceRecord),
    },
    deploymentAcceptance: {
      summary: summarizeLaunchDeploymentAcceptanceEvidenceRecords(deploymentAcceptanceRecords),
      recentEvidence: deploymentAcceptanceRecords
        .slice(0, 8)
        .map(evidenceDeploymentAcceptanceRecord),
    },
    aiStorageAcceptance: {
      summary: summarizeLaunchAiStorageAcceptanceEvidenceRecords(aiStorageAcceptanceRecords),
      recentEvidence: aiStorageAcceptanceRecords
        .slice(0, 8)
        .map(evidenceAiStorageAcceptanceRecord),
    },
    integration: {
      summary: integration.summary,
      items: integration.items.map((item) => ({
        id: item.id,
        label: item.label,
        status: item.status,
        checkedAt: item.checkedAt,
        detail: item.detail,
      })),
    },
    environment: {
      summary: environment.summary,
      nextItems: environment.nextItems.map(evidenceEnvironmentItem),
      groups: environment.groups,
    },
    paymentAcceptance: {
      status: paymentAcceptance.status,
      label: paymentAcceptance.label,
      summary: paymentAcceptance.summary,
      channels: paymentAcceptance.channels.map(evidencePaymentChannel),
      recentEvidence: paymentAcceptance.evidenceRecords.slice(0, 6).map(evidencePaymentRecord),
    },
    productionGate: evidenceProductionGate(productionGate),
    acceptanceEvidence: {
      summary: summarizeLaunchAcceptanceEvidenceRecords(acceptanceEvidenceRecords),
      recentEvidence: acceptanceEvidenceRecords.slice(0, 8).map(evidenceAcceptanceRecord),
    },
    unitEconomics: {
      status: unitEconomics.status,
      label: unitEconomics.label,
      summary: unitEconomics.summary,
      recentCostSamples: unitEconomics.costSamples
        .slice(0, 8)
        .map(evidenceUnitEconomicsCostSample),
    },
    goalProgress: {
      summary: goalProgress.summary,
      items: goalProgress.items.slice(0, 8),
      latestUpdatedAt: goalProgress.items[0]?.updatedAt,
    },
    goalTransitionGate:
      input.goalTransitionGate ?? createMissingLaunchGoalTransitionGateSnapshot(),
    offlineAction: evidenceOfflineAction(offlineActionPack),
    dailyActionProgress: {
      summary: dailyActionProgress.summary,
      items: dailyActionProgress.items.slice(0, 12),
      latestUpdatedAt: dailyActionProgress.items[0]?.updatedAt,
    },
    path: requestPath(input.request),
    userAgent: readHeader(input.request, "user-agent"),
    ipHint: maskClientIp(
      readHeader(input.request, "x-forwarded-for") ??
        readHeader(input.request, "x-real-ip") ??
        readHeader(input.request, "cf-connecting-ip"),
    ),
  } satisfies LaunchEvidenceMetadata;

  const record = await createUsageLog({
    provider: "internal",
    model: "launch-evidence",
    feature: launchEvidenceFeature,
    costCents: 0,
    metadata,
  });

  return {
    id: record.id,
    createdAt: record.createdAt,
    metadata,
  } satisfies LaunchEvidenceArchive;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStatus(value: unknown): HealthStatus {
  return value === "ready" || value === "warning" || value === "blocking" ? value : "warning";
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readSummary(value: unknown): Summary {
  if (!isRecord(value)) {
    return { ready: 0, warning: 0, blocking: 0, total: 0 };
  }

  return {
    ready: readNumber(value.ready) ?? 0,
    warning: readNumber(value.warning) ?? 0,
    blocking: readNumber(value.blocking) ?? 0,
    total: readNumber(value.total) ?? 0,
  };
}

function readEnvironmentSummary(value: unknown): EnvironmentSummary {
  const summary = readSummary(value);

  if (!isRecord(value)) {
    return { ...summary, missing: 0, placeholder: 0, secret: 0 };
  }

  return {
    ...summary,
    missing: readNumber(value.missing) ?? 0,
    placeholder: readNumber(value.placeholder) ?? 0,
    secret: readNumber(value.secret) ?? 0,
  };
}

function readPaymentSummary(value: unknown): PaymentSummary {
  const summary = readSummary(value);

  if (!isRecord(value)) {
    return {
      ...summary,
      completedChannels: 0,
      totalChannels: 0,
      liveOrders: 0,
      paidLiveOrders: 0,
      evidenceRecords: 0,
    };
  }

  return {
    ...summary,
    completedChannels: readNumber(value.completedChannels) ?? 0,
    totalChannels: readNumber(value.totalChannels) ?? 0,
    liveOrders: readNumber(value.liveOrders) ?? 0,
    paidLiveOrders: readNumber(value.paidLiveOrders) ?? 0,
    evidenceRecords: readNumber(value.evidenceRecords) ?? 0,
    latestPaidAt: readString(value.latestPaidAt),
    latestEvidenceAt: readString(value.latestEvidenceAt),
  };
}

function readAcceptanceEvidenceSummary(value: unknown): LaunchAcceptanceEvidenceSummary {
  const summary = readSummary(value);

  if (!isRecord(value)) {
    return { ...summary };
  }

  return {
    ...summary,
    latestEvidenceAt: readString(value.latestEvidenceAt),
  };
}

function readDatabaseAcceptanceEvidenceSummary(
  value: unknown,
): LaunchDatabaseAcceptanceEvidenceSummary {
  const summary = readSummary(value);

  if (!isRecord(value)) {
    return {
      ...summary,
      trackedItems: 0,
      readyItems: 0,
    };
  }

  return {
    ...summary,
    trackedItems: readNumber(value.trackedItems) ?? 0,
    readyItems: readNumber(value.readyItems) ?? 0,
    latestEvidenceAt: readString(value.latestEvidenceAt),
    latestReadyAt: readString(value.latestReadyAt),
  };
}

function readDeploymentAcceptanceEvidenceSummary(
  value: unknown,
): LaunchDeploymentAcceptanceEvidenceSummary {
  const summary = readSummary(value);

  if (!isRecord(value)) {
    return {
      ...summary,
      trackedItems: 0,
      readyItems: 0,
    };
  }

  return {
    ...summary,
    trackedItems: readNumber(value.trackedItems) ?? 0,
    readyItems: readNumber(value.readyItems) ?? 0,
    latestEvidenceAt: readString(value.latestEvidenceAt),
    latestReadyAt: readString(value.latestReadyAt),
  };
}

function readAiStorageAcceptanceEvidenceSummary(
  value: unknown,
): LaunchAiStorageAcceptanceEvidenceSummary {
  const summary = readSummary(value);

  if (!isRecord(value)) {
    return {
      ...summary,
      trackedItems: 0,
      readyItems: 0,
    };
  }

  return {
    ...summary,
    trackedItems: readNumber(value.trackedItems) ?? 0,
    readyItems: readNumber(value.readyItems) ?? 0,
    latestEvidenceAt: readString(value.latestEvidenceAt),
    latestReadyAt: readString(value.latestReadyAt),
  };
}

function readUnitEconomicsSummary(value: unknown): UnitEconomicsSummary {
  const summary = readSummary(value);

  if (!isRecord(value)) {
    return {
      ...summary,
      productCount: 0,
      openaiLogCount: 0,
      missingOpenaiCostCount: 0,
      recordedAiCostCents: 0,
      aiTokens: 0,
      costSampleCount: 0,
    };
  }

  return {
    ...summary,
    productCount: readNumber(value.productCount) ?? 0,
    openaiLogCount: readNumber(value.openaiLogCount) ?? 0,
    missingOpenaiCostCount: readNumber(value.missingOpenaiCostCount) ?? 0,
    recordedAiCostCents: readNumber(value.recordedAiCostCents) ?? 0,
    aiTokens: readNumber(value.aiTokens) ?? 0,
    costSampleCount: readNumber(value.costSampleCount) ?? 0,
    latestCostSampleAt: readString(value.latestCostSampleAt),
  };
}

function readGoalProgressSummary(value: unknown): EvidenceGoalProgressSummary {
  if (!isRecord(value)) {
    return { total: 0, todo: 0, inProgress: 0, blocked: 0, done: 0 };
  }

  return {
    total: readNumber(value.total) ?? 0,
    todo: readNumber(value.todo) ?? 0,
    inProgress: readNumber(value.inProgress) ?? 0,
    blocked: readNumber(value.blocked) ?? 0,
    done: readNumber(value.done) ?? 0,
  };
}

function readDailyActionProgressSummary(value: unknown): EvidenceDailyActionProgressSummary {
  if (!isRecord(value)) {
    return { total: 0, todo: 0, inProgress: 0, blocked: 0, done: 0 };
  }

  return {
    total: readNumber(value.total) ?? 0,
    todo: readNumber(value.todo) ?? 0,
    inProgress: readNumber(value.inProgress) ?? 0,
    blocked: readNumber(value.blocked) ?? 0,
    done: readNumber(value.done) ?? 0,
  };
}

function readOfflineActionSummary(value: unknown): EvidenceOfflineAction["summary"] {
  if (!isRecord(value)) {
    return {
      ready: 0,
      warning: 1,
      blocking: 0,
      total: 1,
      receipts: 0,
      evidenceLinks: 0,
    };
  }

  return {
    ready: readNumber(value.ready) ?? 0,
    warning: readNumber(value.warning) ?? 0,
    blocking: readNumber(value.blocking) ?? 0,
    total: readNumber(value.total) ?? 0,
    receipts: readNumber(value.receipts) ?? 0,
    evidenceLinks: readNumber(value.evidenceLinks) ?? 0,
  };
}

function normalizeGoalProgressMilestoneId(
  value: unknown,
): EvidenceGoalProgressItem["milestoneId"] | undefined {
  if (
    value === "start" ||
    value === "paid_smoke" ||
    value === "retention" ||
    value === "international"
  ) {
    return value;
  }

  return undefined;
}

function readOfflineTodayAction(value: unknown): LaunchOfflineActionPackTodayAction | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = readString(value.id);
  const title = readString(value.title);

  if (!id || !title) {
    return undefined;
  }

  return {
    id,
    status: normalizeStatus(value.status),
    title,
    owner: readString(value.owner) ?? "创始人 / 技术 / 运营",
    phase: readString(value.phase) ?? "线下办理",
    action: readString(value.action) ?? "",
    evidence: readString(value.evidence) ?? "平台提交截图、审核回执或控制台配置截图。",
    dueLabel: readString(value.dueLabel) ?? "未排期",
    suggestedTargetDate: readString(value.suggestedTargetDate),
    scheduleLabel: readString(value.scheduleLabel),
    unlocks: Array.isArray(value.unlocks)
      ? value.unlocks.filter((item): item is string => typeof item === "string")
      : [],
    envKeys: Array.isArray(value.envKeys)
      ? value.envKeys.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function readOfflineTodayActions(value: unknown): LaunchOfflineActionPackTodayAction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(readOfflineTodayAction)
    .filter((item): item is LaunchOfflineActionPackTodayAction => Boolean(item));
}

function missingOfflineAction(): EvidenceOfflineAction {
  const currentAction = {
    id: "archive_missing_offline_action",
    status: "warning" as const,
    title: "旧归档未包含线下办理当前动作",
    owner: "创始人 / 技术 / 运营",
    phase: "上线复核",
    action: "重新归档上线证据，让主体、域名、备案、支付等当前办理动作进入证据包。",
    evidence: "LaunchEvidence.metadata.offlineAction。",
    dueLabel: "需刷新",
    unlocks: [],
    envKeys: [],
  } satisfies LaunchOfflineActionPackTodayAction;

  return {
    status: "warning",
    label: "旧归档未包含线下办理当前动作",
    summary: {
      ready: 0,
      warning: 1,
      blocking: 0,
      total: 1,
      receipts: 0,
      evidenceLinks: 0,
    },
    currentAction,
    todayActions: [currentAction],
  };
}

function readOfflineAction(value: unknown): EvidenceOfflineAction {
  if (!isRecord(value)) {
    return missingOfflineAction();
  }

  const currentAction = readOfflineTodayAction(value.currentAction);

  if (!currentAction) {
    return missingOfflineAction();
  }

  return {
    status: normalizeStatus(value.status),
    label: readString(value.label) ?? "线下办理行动包",
    summary: readOfflineActionSummary(value.summary),
    currentAction,
    todayActions: readOfflineTodayActions(value.todayActions),
  };
}

function readGoalTransitionGateCheck(
  value: unknown,
): EvidenceGoalTransitionGateCheck | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = readString(value.id);
  const title = readString(value.title);

  if (!id || !title) {
    return undefined;
  }

  return {
    id,
    title,
    status: normalizeStatus(value.status),
    detail: readString(value.detail) ?? "",
    action: readString(value.action) ?? "",
    evidence: readString(value.evidence) ?? "",
  };
}

function readGoalTransitionGateChecks(value: unknown): EvidenceGoalTransitionGateCheck[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(readGoalTransitionGateCheck)
    .filter((item): item is EvidenceGoalTransitionGateCheck => Boolean(item));
}

function readGoalTransitionGate(value: unknown): EvidenceGoalTransitionGate {
  if (!isRecord(value)) {
    return createMissingLaunchGoalTransitionGateSnapshot();
  }

  const checks = readGoalTransitionGateChecks(value.checks);
  const blockers = readGoalTransitionGateChecks(value.blockers);
  const warnings = readGoalTransitionGateChecks(value.warnings);

  return {
    status: normalizeStatus(value.status),
    label: readString(value.label) ?? "阶段推进门槛",
    detail: readString(value.detail) ?? "",
    action: readString(value.action) ?? "",
    canAdvance: Boolean(value.canAdvance),
    currentMilestoneId: normalizeGoalProgressMilestoneId(value.currentMilestoneId) ?? "start",
    currentMilestoneTitle: readString(value.currentMilestoneTitle) ?? "0-14 天：开工闭环",
    nextMilestoneId: normalizeGoalProgressMilestoneId(value.nextMilestoneId),
    nextMilestoneTitle: readString(value.nextMilestoneTitle),
    summary: readSummary(value.summary),
    checks,
    blockers:
      blockers.length > 0 ? blockers : checks.filter((item) => item.status === "blocking"),
    warnings:
      warnings.length > 0 ? warnings : checks.filter((item) => item.status === "warning"),
  };
}

function normalizeGoalProgressStatus(value: unknown): EvidenceGoalProgressItem["status"] {
  if (value === "in_progress" || value === "blocked" || value === "done" || value === "todo") {
    return value;
  }

  return "todo";
}

function normalizeDailyActionProgressStatus(
  value: unknown,
): EvidenceDailyActionProgressItem["status"] {
  if (value === "in_progress" || value === "blocked" || value === "done" || value === "todo") {
    return value;
  }

  return "todo";
}

function normalizeProductionGateStepId(value: unknown): EvidenceProductionGateStep["id"] {
  if (
    value === "preflight" ||
    value === "database" ||
    value === "url" ||
    value === "ai_storage" ||
    value === "compliance" ||
    value === "payment"
  ) {
    return value;
  }

  return "preflight";
}

function readGoalProgressItem(value: unknown): EvidenceGoalProgressItem | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const milestoneId = normalizeGoalProgressMilestoneId(value.milestoneId);
  const updatedAt = readString(value.updatedAt);

  if (!milestoneId || !updatedAt) {
    return undefined;
  }

  return {
    milestoneId,
    status: normalizeGoalProgressStatus(value.status),
    targetDate: readString(value.targetDate),
    owner: readString(value.owner),
    evidenceNote: readString(value.evidenceNote),
    note: readString(value.note),
    updatedAt,
    updatedBy: readString(value.updatedBy) ?? "admin",
  };
}

function readGoalProgressItems(value: unknown): EvidenceGoalProgressItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(readGoalProgressItem)
    .filter((item): item is EvidenceGoalProgressItem => Boolean(item));
}

function readDailyActionProgressItem(value: unknown): EvidenceDailyActionProgressItem | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const actionId = readString(value.actionId);
  const updatedAt = readString(value.updatedAt);

  if (!actionId || !updatedAt) {
    return undefined;
  }

  return {
    actionId,
    status: normalizeDailyActionProgressStatus(value.status),
    owner: readString(value.owner),
    evidenceNote: readString(value.evidenceNote),
    note: readString(value.note),
    updatedAt,
    updatedBy: readString(value.updatedBy) ?? "admin",
  };
}

function readDailyActionProgressItems(value: unknown): EvidenceDailyActionProgressItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(readDailyActionProgressItem)
    .filter((item): item is EvidenceDailyActionProgressItem => Boolean(item));
}

function readProductionGateItem(value: unknown): EvidenceProductionGateItem | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = readString(value.id);

  if (!id) {
    return undefined;
  }

  return {
    id,
    label: readString(value.label) ?? "未知门禁项",
    status: normalizeStatus(value.status),
    detail: readString(value.detail) ?? "",
    action: readString(value.action) ?? "",
    evidence: readString(value.evidence),
  };
}

function readProductionGateItems(value: unknown): EvidenceProductionGateItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(readProductionGateItem)
    .filter((item): item is EvidenceProductionGateItem => Boolean(item));
}

function readProductionGateStep(value: unknown): EvidenceProductionGateStep | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const label = readString(value.label);

  if (!label) {
    return undefined;
  }

  return {
    id: normalizeProductionGateStepId(value.id),
    label,
    status: normalizeStatus(value.status),
    command: readString(value.command) ?? "",
    detail: readString(value.detail) ?? "",
    action: readString(value.action) ?? "",
    evidence: readString(value.evidence) ?? "",
    summary: readSummary(value.summary),
    blockingItems: readProductionGateItems(value.blockingItems),
    warningItems: readProductionGateItems(value.warningItems),
  };
}

function readProductionGateSteps(value: unknown): EvidenceProductionGateStep[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(readProductionGateStep)
    .filter((step): step is EvidenceProductionGateStep => Boolean(step));
}

function readProductionGateCommands(
  value: unknown,
): LaunchEvidenceMetadata["productionGate"]["commands"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((command) => ({
    label: readString(command.label) ?? "未知命令",
    command: readString(command.command) ?? "",
    detail: readString(command.detail) ?? "",
  }));
}

function readProductionGate(value: unknown): LaunchEvidenceMetadata["productionGate"] {
  if (!isRecord(value)) {
    return {
      status: "warning",
      label: "旧归档未包含生产总门禁",
      releaseReady: false,
      summary: { ready: 0, warning: 1, blocking: 0, total: 1 },
      checkSummary: { ready: 0, warning: 1, blocking: 0, total: 1 },
      steps: [],
      nextActions: [],
      commands: [],
      copyText: "",
    };
  }

  return {
    status: normalizeStatus(value.status),
    label: readString(value.label) ?? "生产上线总门禁",
    releaseReady: Boolean(value.releaseReady),
    summary: readSummary(value.summary),
    checkSummary: readSummary(value.checkSummary),
    steps: readProductionGateSteps(value.steps),
    nextActions: readProductionGateItems(value.nextActions),
    commands: readProductionGateCommands(value.commands),
    copyText: readString(value.copyText) ?? "",
  };
}

function readCheckItems(value: unknown): EvidenceCheckItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((item) => ({
    id: readString(item.id) ?? "unknown",
    group: readString(item.group) ?? "未知分组",
    label: readString(item.label) ?? "未知检查项",
    status: normalizeStatus(item.status),
    detail: readString(item.detail) ?? "",
    action: readString(item.action) ?? "",
  }));
}

function readEnvironmentItems(value: unknown): EvidenceEnvironmentItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((item) => ({
    key: readString(item.key) ?? "unknown",
    group: readString(item.group) ?? "未知分组",
    label: readString(item.label) ?? "未知变量",
    status: normalizeStatus(item.status),
    stateLabel: readString(item.stateLabel) ?? "",
    displayValue: readString(item.displayValue) ?? "",
    detail: readString(item.detail) ?? "",
    action: readString(item.action) ?? "",
  }));
}

function readEnvironmentGroups(value: unknown): LaunchEvidenceMetadata["environment"]["groups"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((group) => ({
    name: readString(group.name) ?? "未知分组",
    ready: readNumber(group.ready) ?? 0,
    warning: readNumber(group.warning) ?? 0,
    blocking: readNumber(group.blocking) ?? 0,
    total: readNumber(group.total) ?? 0,
  }));
}

function readRunbookSteps(value: unknown): EvidenceRunbookStep[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((step) => ({
    id: readString(step.id) ?? "unknown",
    title: readString(step.title) ?? "未知步骤",
    owner: readString(step.owner) ?? "未指定",
    status: normalizeStatus(step.status),
    action: readString(step.action) ?? "",
    evidence: readString(step.evidence) ?? "",
  }));
}

function readRunbookGroups(value: unknown): LaunchEvidenceMetadata["runbook"]["groups"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((group) => ({
    id: readString(group.id) ?? "unknown",
    title: readString(group.title) ?? "未知分组",
    status: normalizeStatus(group.status),
    stepCount: readNumber(group.stepCount) ?? 0,
  }));
}

function readIntegrationItems(value: unknown): LaunchEvidenceMetadata["integration"]["items"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((item) => ({
    id: readString(item.id) ?? "unknown",
    label: readString(item.label) ?? "未知探针",
    status: normalizeStatus(item.status),
    checkedAt: readString(item.checkedAt),
    detail: readString(item.detail) ?? "",
  }));
}

function readPaymentOrder(value: unknown): EvidencePaymentOrder | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = readString(value.id);

  if (!id) {
    return undefined;
  }

  return {
    id,
    productName: readString(value.productName) ?? "未知商品",
    priceLabel: readString(value.priceLabel) ?? "",
    status: readString(value.status) as EvidencePaymentOrder["status"],
    providerOrderId: readString(value.providerOrderId),
    paidAt: readString(value.paidAt),
  };
}

function readPaymentEvidenceRecord(value: unknown): EvidencePaymentRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = readString(value.id);

  if (!id) {
    return undefined;
  }

  return {
    id,
    createdAt: readString(value.createdAt) ?? readString(value.savedAt) ?? "",
    channel: readString(value.channel) ?? "unknown",
    channelLabel: readString(value.channelLabel) ?? "未知渠道",
    status: normalizeStatus(value.status),
    orderId: readString(value.orderId),
    providerOrderId: readString(value.providerOrderId),
    priceLabel: readString(value.priceLabel),
    evidenceUrl: readString(value.evidenceUrl),
    reconciliationUrl: readString(value.reconciliationUrl),
    note: readString(value.note),
    savedAt: readString(value.savedAt) ?? readString(value.createdAt) ?? "",
  };
}

function readPaymentEvidenceRecords(value: unknown): EvidencePaymentRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(readPaymentEvidenceRecord)
    .filter((item): item is EvidencePaymentRecord => Boolean(item));
}

function readAcceptanceEvidenceRecord(value: unknown): EvidenceAcceptanceRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = readString(value.id);

  if (!id) {
    return undefined;
  }

  return {
    id,
    createdAt: readString(value.createdAt) ?? readString(value.savedAt) ?? "",
    caseId: readString(value.caseId) ?? "unknown",
    caseTitle: readString(value.caseTitle) ?? "未知验收用例",
    caseGroup: readString(value.caseGroup) ?? "端到端验收",
    status: normalizeStatus(value.status),
    tester: readString(value.tester),
    evidenceUrl: readString(value.evidenceUrl),
    recordingUrl: readString(value.recordingUrl),
    note: readString(value.note),
    savedAt: readString(value.savedAt) ?? readString(value.createdAt) ?? "",
  };
}

function readAcceptanceEvidenceRecords(value: unknown): EvidenceAcceptanceRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(readAcceptanceEvidenceRecord)
    .filter((item): item is EvidenceAcceptanceRecord => Boolean(item));
}

function readDatabaseAcceptanceEvidenceRecord(
  value: unknown,
): EvidenceDatabaseAcceptanceRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = readString(value.id);

  if (!id) {
    return undefined;
  }

  return {
    id,
    createdAt: readString(value.createdAt) ?? readString(value.savedAt) ?? "",
    itemId: readString(value.itemId) ?? "unknown",
    itemLabel: readString(value.itemLabel) ?? "未知数据库验收项",
    status: normalizeStatus(value.status),
    evidenceUrl: readString(value.evidenceUrl),
    migrationLogUrl: readString(value.migrationLogUrl),
    backupPolicyUrl: readString(value.backupPolicyUrl),
    restoreDrillUrl: readString(value.restoreDrillUrl),
    note: readString(value.note),
    savedAt: readString(value.savedAt) ?? readString(value.createdAt) ?? "",
  };
}

function readDatabaseAcceptanceEvidenceRecords(
  value: unknown,
): EvidenceDatabaseAcceptanceRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(readDatabaseAcceptanceEvidenceRecord)
    .filter((item): item is EvidenceDatabaseAcceptanceRecord => Boolean(item));
}

function readDeploymentAcceptanceEvidenceRecord(
  value: unknown,
): EvidenceDeploymentAcceptanceRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = readString(value.id);

  if (!id) {
    return undefined;
  }

  return {
    id,
    createdAt: readString(value.createdAt) ?? readString(value.savedAt) ?? "",
    itemId: readString(value.itemId) ?? "unknown",
    itemLabel: readString(value.itemLabel) ?? "未知部署验收项",
    status: normalizeStatus(value.status),
    evidenceUrl: readString(value.evidenceUrl),
    urlCheckUrl: readString(value.urlCheckUrl),
    preflightUrl: readString(value.preflightUrl),
    smokeRecordingUrl: readString(value.smokeRecordingUrl),
    rollbackUrl: readString(value.rollbackUrl),
    note: readString(value.note),
    savedAt: readString(value.savedAt) ?? readString(value.createdAt) ?? "",
  };
}

function readDeploymentAcceptanceEvidenceRecords(
  value: unknown,
): EvidenceDeploymentAcceptanceRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(readDeploymentAcceptanceEvidenceRecord)
    .filter((item): item is EvidenceDeploymentAcceptanceRecord => Boolean(item));
}

function readAiStorageAcceptanceEvidenceRecord(
  value: unknown,
): EvidenceAiStorageAcceptanceRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = readString(value.id);

  if (!id) {
    return undefined;
  }

  return {
    id,
    createdAt: readString(value.createdAt) ?? readString(value.savedAt) ?? "",
    itemId: readString(value.itemId) ?? "unknown",
    itemLabel: readString(value.itemLabel) ?? "未知 AI/图片验收项",
    status: normalizeStatus(value.status),
    evidenceUrl: readString(value.evidenceUrl),
    diagnosticUrl: readString(value.diagnosticUrl),
    publicImageUrl: readString(value.publicImageUrl),
    palmReportUrl: readString(value.palmReportUrl),
    deepReportUrl: readString(value.deepReportUrl),
    costSampleUrl: readString(value.costSampleUrl),
    note: readString(value.note),
    savedAt: readString(value.savedAt) ?? readString(value.createdAt) ?? "",
  };
}

function readAiStorageAcceptanceEvidenceRecords(
  value: unknown,
): EvidenceAiStorageAcceptanceRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(readAiStorageAcceptanceEvidenceRecord)
    .filter((item): item is EvidenceAiStorageAcceptanceRecord => Boolean(item));
}

function readUnitEconomicsCostSample(
  value: unknown,
): EvidenceUnitEconomicsCostSample | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = readString(value.id);
  const featureCode = readString(value.featureCode);
  const model = readString(value.model);

  if (!id || !featureCode || !model) {
    return undefined;
  }

  return {
    id,
    createdAt: readString(value.createdAt) ?? readString(value.savedAt) ?? "",
    featureCode: featureCode as EvidenceUnitEconomicsCostSample["featureCode"],
    model,
    tokensIn: readNumber(value.tokensIn) ?? 0,
    tokensOut: readNumber(value.tokensOut) ?? 0,
    costCents: readNumber(value.costCents) ?? 0,
    scenario: readString(value.scenario),
    evidenceUrl: readString(value.evidenceUrl),
    note: readString(value.note),
    savedAt: readString(value.savedAt) ?? readString(value.createdAt) ?? "",
  };
}

function readUnitEconomicsCostSamples(value: unknown): EvidenceUnitEconomicsCostSample[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(readUnitEconomicsCostSample)
    .filter((item): item is EvidenceUnitEconomicsCostSample => Boolean(item));
}

function readPaymentChannels(value: unknown): EvidencePaymentChannel[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((channel) => ({
    id: readString(channel.id) ?? "unknown",
    label: readString(channel.label) ?? "未知渠道",
    provider: readString(channel.provider) as EvidencePaymentChannel["provider"],
    status: normalizeStatus(channel.status),
    enabled: Boolean(channel.enabled),
    orderCount: readNumber(channel.orderCount) ?? 0,
    paidOrderCount: readNumber(channel.paidOrderCount) ?? 0,
    evidenceRecordCount: readNumber(channel.evidenceRecordCount) ?? 0,
    latestPaidOrder: readPaymentOrder(channel.latestPaidOrder),
    latestEvidence: readPaymentEvidenceRecord(channel.latestEvidence),
  }));
}

function readLaunchEvidenceMetadata(log: UsageLogRecord): LaunchEvidenceMetadata | undefined {
  if (log.feature !== launchEvidenceFeature || !isRecord(log.metadata)) {
    return undefined;
  }

  if (log.metadata.event !== "launch_evidence") {
    return undefined;
  }

  const readiness = isRecord(log.metadata.readiness) ? log.metadata.readiness : {};
  const runbook = isRecord(log.metadata.runbook) ? log.metadata.runbook : {};
  const persistence = isRecord(log.metadata.persistence) ? log.metadata.persistence : {};
  const integration = isRecord(log.metadata.integration) ? log.metadata.integration : {};
  const environment = isRecord(log.metadata.environment) ? log.metadata.environment : {};
  const paymentAcceptance = isRecord(log.metadata.paymentAcceptance)
    ? log.metadata.paymentAcceptance
    : {};
  const productionGate = isRecord(log.metadata.productionGate)
    ? log.metadata.productionGate
    : undefined;
  const acceptanceEvidence = isRecord(log.metadata.acceptanceEvidence)
    ? log.metadata.acceptanceEvidence
    : {};
  const databaseAcceptance = isRecord(log.metadata.databaseAcceptance)
    ? log.metadata.databaseAcceptance
    : {};
  const deploymentAcceptance = isRecord(log.metadata.deploymentAcceptance)
    ? log.metadata.deploymentAcceptance
    : {};
  const aiStorageAcceptance = isRecord(log.metadata.aiStorageAcceptance)
    ? log.metadata.aiStorageAcceptance
    : {};
  const unitEconomics = isRecord(log.metadata.unitEconomics) ? log.metadata.unitEconomics : {};
  const goalProgress = isRecord(log.metadata.goalProgress) ? log.metadata.goalProgress : {};
  const goalTransitionGate = isRecord(log.metadata.goalTransitionGate)
    ? log.metadata.goalTransitionGate
    : undefined;
  const offlineAction = isRecord(log.metadata.offlineAction)
    ? log.metadata.offlineAction
    : undefined;
  const dailyActionProgress = isRecord(log.metadata.dailyActionProgress)
    ? log.metadata.dailyActionProgress
    : {};
  const goalProgressItems = readGoalProgressItems(goalProgress.items);
  const dailyActionProgressItems = readDailyActionProgressItems(dailyActionProgress.items);

  return {
    event: "launch_evidence",
    archivedAt: readString(log.metadata.archivedAt) ?? log.createdAt,
    operator: readString(log.metadata.operator) ?? "admin",
    note: readString(log.metadata.note),
    status: normalizeStatus(log.metadata.status),
    label: readString(log.metadata.label) ?? "上线证据",
    readiness: {
      status: normalizeStatus(readiness.status),
      label: readString(readiness.label) ?? "Go / No-Go",
      summary: readSummary(readiness.summary),
      blockers: readCheckItems(readiness.blockers),
      warnings: readCheckItems(readiness.warnings),
      nextActions: readCheckItems(readiness.nextActions),
    },
    runbook: {
      status: normalizeStatus(runbook.status),
      label: readString(runbook.label) ?? "Runbook",
      summary: readSummary(runbook.summary),
      nextSteps: readRunbookSteps(runbook.nextSteps),
      groups: readRunbookGroups(runbook.groups),
    },
    persistence: {
      status: normalizeStatus(persistence.status),
      label: readString(persistence.label) ?? "落库状态",
      storeMode: readString(persistence.storeMode) ?? "unknown",
      probeCount: typeof persistence.probeCount === "number" ? persistence.probeCount : 0,
      lastProbeAt: readString(persistence.lastProbeAt),
    },
    databaseAcceptance: {
      summary: readDatabaseAcceptanceEvidenceSummary(databaseAcceptance.summary),
      recentEvidence: readDatabaseAcceptanceEvidenceRecords(databaseAcceptance.recentEvidence),
    },
    deploymentAcceptance: {
      summary: readDeploymentAcceptanceEvidenceSummary(deploymentAcceptance.summary),
      recentEvidence: readDeploymentAcceptanceEvidenceRecords(
        deploymentAcceptance.recentEvidence,
      ),
    },
    aiStorageAcceptance: {
      summary: readAiStorageAcceptanceEvidenceSummary(aiStorageAcceptance.summary),
      recentEvidence: readAiStorageAcceptanceEvidenceRecords(
        aiStorageAcceptance.recentEvidence,
      ),
    },
    integration: {
      summary: readSummary(integration.summary),
      items: readIntegrationItems(integration.items),
    },
    environment: {
      summary: readEnvironmentSummary(environment.summary),
      nextItems: readEnvironmentItems(environment.nextItems),
      groups: readEnvironmentGroups(environment.groups),
    },
    paymentAcceptance: {
      status: normalizeStatus(paymentAcceptance.status),
      label: readString(paymentAcceptance.label) ?? "真实支付验收",
      summary: readPaymentSummary(paymentAcceptance.summary),
      channels: readPaymentChannels(paymentAcceptance.channels),
      recentEvidence: readPaymentEvidenceRecords(paymentAcceptance.recentEvidence),
    },
    productionGate: readProductionGate(productionGate),
    acceptanceEvidence: {
      summary: readAcceptanceEvidenceSummary(acceptanceEvidence.summary),
      recentEvidence: readAcceptanceEvidenceRecords(acceptanceEvidence.recentEvidence),
    },
    unitEconomics: {
      status: normalizeStatus(unitEconomics.status),
      label: readString(unitEconomics.label) ?? "单位经济",
      summary: readUnitEconomicsSummary(unitEconomics.summary),
      recentCostSamples: readUnitEconomicsCostSamples(unitEconomics.recentCostSamples),
    },
    goalProgress: {
      summary: readGoalProgressSummary(goalProgress.summary),
      items: goalProgressItems,
      latestUpdatedAt: readString(goalProgress.latestUpdatedAt) ?? goalProgressItems[0]?.updatedAt,
    },
    goalTransitionGate: readGoalTransitionGate(goalTransitionGate),
    offlineAction: readOfflineAction(offlineAction),
    dailyActionProgress: {
      summary: readDailyActionProgressSummary(dailyActionProgress.summary),
      items: dailyActionProgressItems,
      latestUpdatedAt:
        readString(dailyActionProgress.latestUpdatedAt) ??
        dailyActionProgressItems[0]?.updatedAt,
    },
    path: readString(log.metadata.path),
    userAgent: readString(log.metadata.userAgent),
    ipHint: readString(log.metadata.ipHint),
  };
}

export async function getLaunchEvidenceArchives(input: { take?: number } = {}) {
  const logs = await getUsageLogsByFeature(launchEvidenceFeature, {
    take: input.take ?? 8,
  });

  return logs
    .map((log) => {
      const metadata = readLaunchEvidenceMetadata(log);

      if (!metadata) {
        return undefined;
      }

      return {
        id: log.id,
        createdAt: log.createdAt,
        metadata,
      } satisfies LaunchEvidenceArchive;
    })
    .filter((archive): archive is LaunchEvidenceArchive => Boolean(archive));
}
