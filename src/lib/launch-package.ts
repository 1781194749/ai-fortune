import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  getLaunchAcceptanceEvidenceRecords,
  summarizeLaunchAcceptanceEvidenceRecords,
  type LaunchAcceptanceEvidenceSummary,
} from "@/lib/launch-acceptance-evidence";
import {
  getLaunchAiStorageAcceptanceEvidenceRecords,
  summarizeLaunchAiStorageAcceptanceEvidenceRecords,
  type LaunchAiStorageAcceptanceEvidenceSummary,
} from "@/lib/launch-ai-storage-acceptance";
import {
  getLaunchDatabaseAcceptanceEvidenceRecords,
  summarizeLaunchDatabaseAcceptanceEvidenceRecords,
  type LaunchDatabaseAcceptanceEvidenceSummary,
} from "@/lib/launch-database-acceptance";
import {
  getLaunchDeploymentAcceptanceEvidenceRecords,
  summarizeLaunchDeploymentAcceptanceEvidenceRecords,
  type LaunchDeploymentAcceptanceEvidenceSummary,
} from "@/lib/launch-deployment-acceptance";
import {
  getLaunchEvidenceArchives,
  type LaunchEvidenceArchive,
} from "@/lib/launch-evidence";
import {
  getLaunchExternalReadiness,
  type ExternalReadinessItem,
  type LaunchExternalReadiness,
} from "@/lib/launch-external-readiness";
import {
  getLaunchPaymentAcceptance,
  type LaunchPaymentAcceptance,
} from "@/lib/launch-payment-acceptance";
import {
  getLaunchProductionGate,
  type LaunchProductionGate,
} from "@/lib/launch-production-gate";
import {
  getLaunchUnitEconomics,
  type LaunchUnitEconomics,
} from "@/lib/launch-unit-economics";
import {
  getLaunchGoalProgress,
  type LaunchGoalProgress,
} from "@/lib/launch-goal-progress";
import {
  getLaunchDailyActionProgress,
  type LaunchDailyActionProgress,
} from "@/lib/launch-daily-action-progress";
import {
  getLaunchReadiness,
  type LaunchReadiness,
  type LaunchReadinessItem,
} from "@/lib/launch-readiness";
import {
  buildLaunchRunbook,
  type LaunchRunbook,
  type LaunchRunbookStep,
} from "@/lib/launch-runbook";

type Summary = {
  ready: number;
  warning: number;
  blocking: number;
  total: number;
};

export type LaunchPackageEvidenceState = "missing" | "needs_refresh" | "available";

export type LaunchPackageAction = {
  id: string;
  type: "readiness" | "runbook" | "external" | "evidence";
  title: string;
  status: HealthStatus;
  group?: string;
  owner?: string;
  detail: string;
  action: string;
  evidence?: string;
};

export type LaunchPackage = {
  generatedAt: string;
  status: HealthStatus;
  label: string;
  detail: string;
  action: string;
  summary: {
    goNoGo: Summary;
    runbook: Summary;
    external: Summary;
    evidence: {
      state: LaunchPackageEvidenceState;
      label: string;
      latestArchivedAt?: string;
      refreshReasons: string[];
    };
  };
  goNoGo: LaunchReadiness;
  runbook: LaunchRunbook;
  external: LaunchExternalReadiness;
  latestEvidence?: LaunchEvidenceArchive;
  requiredBeforeGo: LaunchPackageAction[];
  missingEvidence: LaunchPackageAction[];
  nextActions: LaunchPackageAction[];
};

function statusRank(status: HealthStatus) {
  if (status === "blocking") {
    return 0;
  }

  if (status === "warning") {
    return 1;
  }

  return 2;
}

function actionFromReadiness(item: LaunchReadinessItem): LaunchPackageAction {
  return {
    id: `readiness:${item.id}`,
    type: "readiness",
    title: item.label,
    status: item.status,
    group: item.group,
    detail: item.detail,
    action: item.action,
  };
}

function actionFromRunbook(step: LaunchRunbookStep): LaunchPackageAction {
  return {
    id: `runbook:${step.id}`,
    type: "runbook",
    title: step.title,
    status: step.status,
    owner: step.owner,
    detail: step.why,
    action: step.action,
    evidence: step.evidence,
  };
}

function actionFromExternal(item: ExternalReadinessItem): LaunchPackageAction {
  const evidence = [
    item.evidenceNote ?? item.evidence,
    item.receiptNo ? `回执：${item.receiptNo}` : undefined,
    item.evidenceUrl ? `证据链接：${item.evidenceUrl}` : undefined,
  ]
    .filter(Boolean)
    .join("；");

  return {
    id: `external:${item.id}`,
    type: "external",
    title: item.title,
    status: item.healthStatus,
    group: item.group,
    owner: item.owner,
    detail: item.why,
    action: item.action,
    evidence,
  };
}

function evidenceMatchesCurrentReadiness(
  latestEvidence: LaunchEvidenceArchive | undefined,
  readiness: LaunchReadiness,
) {
  if (!latestEvidence) {
    return false;
  }

  const archivedSummary = latestEvidence.metadata.readiness.summary;

  return (
    latestEvidence.metadata.status === readiness.status &&
    archivedSummary.ready === readiness.summary.ready &&
    archivedSummary.warning === readiness.summary.warning &&
    archivedSummary.blocking === readiness.summary.blocking &&
    archivedSummary.total === readiness.summary.total
  );
}

function evidenceMatchesCurrentPaymentAcceptance(
  latestEvidence: LaunchEvidenceArchive | undefined,
  paymentAcceptance: LaunchPaymentAcceptance,
) {
  if (!latestEvidence) {
    return false;
  }

  const archivedPayment = latestEvidence.metadata.paymentAcceptance;
  const archivedSummary = archivedPayment.summary;
  const currentSummary = paymentAcceptance.summary;

  return (
    archivedPayment.status === paymentAcceptance.status &&
    archivedSummary.ready === currentSummary.ready &&
    archivedSummary.warning === currentSummary.warning &&
    archivedSummary.blocking === currentSummary.blocking &&
    archivedSummary.total === currentSummary.total &&
    archivedSummary.completedChannels === currentSummary.completedChannels &&
    archivedSummary.totalChannels === currentSummary.totalChannels &&
    archivedSummary.liveOrders === currentSummary.liveOrders &&
    archivedSummary.paidLiveOrders === currentSummary.paidLiveOrders &&
    archivedSummary.evidenceRecords === currentSummary.evidenceRecords &&
    archivedSummary.latestPaidAt === currentSummary.latestPaidAt &&
    archivedSummary.latestEvidenceAt === currentSummary.latestEvidenceAt
  );
}

function evidenceMatchesCurrentAcceptanceEvidence(
  latestEvidence: LaunchEvidenceArchive | undefined,
  acceptanceEvidence: LaunchAcceptanceEvidenceSummary,
) {
  if (!latestEvidence) {
    return false;
  }

  const archivedSummary = latestEvidence.metadata.acceptanceEvidence.summary;

  return (
    archivedSummary.ready === acceptanceEvidence.ready &&
    archivedSummary.warning === acceptanceEvidence.warning &&
    archivedSummary.blocking === acceptanceEvidence.blocking &&
    archivedSummary.total === acceptanceEvidence.total &&
    archivedSummary.latestEvidenceAt === acceptanceEvidence.latestEvidenceAt
  );
}

function evidenceMatchesCurrentDatabaseAcceptance(
  latestEvidence: LaunchEvidenceArchive | undefined,
  databaseAcceptance: LaunchDatabaseAcceptanceEvidenceSummary,
) {
  if (!latestEvidence) {
    return false;
  }

  const archivedSummary = latestEvidence.metadata.databaseAcceptance.summary;

  return (
    archivedSummary.ready === databaseAcceptance.ready &&
    archivedSummary.warning === databaseAcceptance.warning &&
    archivedSummary.blocking === databaseAcceptance.blocking &&
    archivedSummary.total === databaseAcceptance.total &&
    archivedSummary.trackedItems === databaseAcceptance.trackedItems &&
    archivedSummary.readyItems === databaseAcceptance.readyItems &&
    archivedSummary.latestEvidenceAt === databaseAcceptance.latestEvidenceAt &&
    archivedSummary.latestReadyAt === databaseAcceptance.latestReadyAt
  );
}

function evidenceMatchesCurrentDeploymentAcceptance(
  latestEvidence: LaunchEvidenceArchive | undefined,
  deploymentAcceptance: LaunchDeploymentAcceptanceEvidenceSummary,
) {
  if (!latestEvidence) {
    return false;
  }

  const archivedSummary = latestEvidence.metadata.deploymentAcceptance.summary;

  return (
    archivedSummary.ready === deploymentAcceptance.ready &&
    archivedSummary.warning === deploymentAcceptance.warning &&
    archivedSummary.blocking === deploymentAcceptance.blocking &&
    archivedSummary.total === deploymentAcceptance.total &&
    archivedSummary.trackedItems === deploymentAcceptance.trackedItems &&
    archivedSummary.readyItems === deploymentAcceptance.readyItems &&
    archivedSummary.latestEvidenceAt === deploymentAcceptance.latestEvidenceAt &&
    archivedSummary.latestReadyAt === deploymentAcceptance.latestReadyAt
  );
}

function evidenceMatchesCurrentAiStorageAcceptance(
  latestEvidence: LaunchEvidenceArchive | undefined,
  aiStorageAcceptance: LaunchAiStorageAcceptanceEvidenceSummary,
) {
  if (!latestEvidence) {
    return false;
  }

  const archivedSummary = latestEvidence.metadata.aiStorageAcceptance.summary;

  return (
    archivedSummary.ready === aiStorageAcceptance.ready &&
    archivedSummary.warning === aiStorageAcceptance.warning &&
    archivedSummary.blocking === aiStorageAcceptance.blocking &&
    archivedSummary.total === aiStorageAcceptance.total &&
    archivedSummary.trackedItems === aiStorageAcceptance.trackedItems &&
    archivedSummary.readyItems === aiStorageAcceptance.readyItems &&
    archivedSummary.latestEvidenceAt === aiStorageAcceptance.latestEvidenceAt &&
    archivedSummary.latestReadyAt === aiStorageAcceptance.latestReadyAt
  );
}

function evidenceMatchesCurrentUnitEconomics(
  latestEvidence: LaunchEvidenceArchive | undefined,
  unitEconomics: LaunchUnitEconomics,
) {
  if (!latestEvidence) {
    return false;
  }

  const archivedUnitEconomics = latestEvidence.metadata.unitEconomics;
  const archivedSummary = archivedUnitEconomics.summary;
  const currentSummary = unitEconomics.summary;

  return (
    archivedUnitEconomics.status === unitEconomics.status &&
    archivedSummary.warning === currentSummary.warning &&
    archivedSummary.blocking === currentSummary.blocking &&
    archivedSummary.total === currentSummary.total &&
    archivedSummary.openaiLogCount === currentSummary.openaiLogCount &&
    archivedSummary.missingOpenaiCostCount === currentSummary.missingOpenaiCostCount &&
    archivedSummary.recordedAiCostCents === currentSummary.recordedAiCostCents &&
    archivedSummary.aiTokens === currentSummary.aiTokens &&
    archivedSummary.costSampleCount === currentSummary.costSampleCount &&
    archivedSummary.latestCostSampleAt === currentSummary.latestCostSampleAt
  );
}

function evidenceMatchesCurrentGoalProgress(
  latestEvidence: LaunchEvidenceArchive | undefined,
  goalProgress: LaunchGoalProgress,
) {
  if (!latestEvidence) {
    return false;
  }

  const archivedGoalProgress = latestEvidence.metadata.goalProgress;
  const archivedSummary = archivedGoalProgress.summary;
  const currentSummary = goalProgress.summary;

  return (
    archivedSummary.total === currentSummary.total &&
    archivedSummary.todo === currentSummary.todo &&
    archivedSummary.inProgress === currentSummary.inProgress &&
    archivedSummary.blocked === currentSummary.blocked &&
    archivedSummary.done === currentSummary.done &&
    archivedGoalProgress.latestUpdatedAt === goalProgress.items[0]?.updatedAt
  );
}

function evidenceMatchesCurrentDailyActionProgress(
  latestEvidence: LaunchEvidenceArchive | undefined,
  dailyActionProgress: LaunchDailyActionProgress,
) {
  if (!latestEvidence) {
    return false;
  }

  const archivedDailyActionProgress = latestEvidence.metadata.dailyActionProgress;
  const archivedSummary = archivedDailyActionProgress.summary;
  const currentSummary = dailyActionProgress.summary;

  return (
    archivedSummary.total === currentSummary.total &&
    archivedSummary.todo === currentSummary.todo &&
    archivedSummary.inProgress === currentSummary.inProgress &&
    archivedSummary.blocked === currentSummary.blocked &&
    archivedSummary.done === currentSummary.done &&
    archivedDailyActionProgress.latestUpdatedAt === dailyActionProgress.items[0]?.updatedAt
  );
}

function evidenceIncludesGoalTransitionGate(latestEvidence: LaunchEvidenceArchive | undefined) {
  if (!latestEvidence) {
    return false;
  }

  return latestEvidence.metadata.goalTransitionGate.label !== "旧归档未包含阶段推进门槛";
}

function evidenceIncludesOfflineAction(latestEvidence: LaunchEvidenceArchive | undefined) {
  if (!latestEvidence) {
    return false;
  }

  return latestEvidence.metadata.offlineAction.label !== "旧归档未包含线下办理当前动作";
}

function summariesMatch(archivedSummary: Summary, currentSummary: Summary) {
  return (
    archivedSummary.ready === currentSummary.ready &&
    archivedSummary.warning === currentSummary.warning &&
    archivedSummary.blocking === currentSummary.blocking &&
    archivedSummary.total === currentSummary.total
  );
}

function evidenceMatchesCurrentProductionGate(
  latestEvidence: LaunchEvidenceArchive | undefined,
  productionGate: LaunchProductionGate,
) {
  if (!latestEvidence) {
    return false;
  }

  const archivedGate = latestEvidence.metadata.productionGate;

  if (
    archivedGate.status !== productionGate.status ||
    archivedGate.releaseReady !== productionGate.releaseReady ||
    !summariesMatch(archivedGate.summary, productionGate.summary) ||
    !summariesMatch(archivedGate.checkSummary, productionGate.checkSummary) ||
    archivedGate.steps.length !== productionGate.steps.length
  ) {
    return false;
  }

  return productionGate.steps.every((currentStep) => {
    const archivedStep = archivedGate.steps.find((step) => step.id === currentStep.id);

    return (
      archivedStep?.status === currentStep.status &&
      summariesMatch(archivedStep.summary, currentStep.summary)
    );
  });
}

function evidenceRefreshReasons(input: {
  latestEvidence: LaunchEvidenceArchive | undefined;
  readiness: LaunchReadiness;
  paymentAcceptance: LaunchPaymentAcceptance;
  acceptanceEvidence: LaunchAcceptanceEvidenceSummary;
  databaseAcceptance: LaunchDatabaseAcceptanceEvidenceSummary;
  deploymentAcceptance: LaunchDeploymentAcceptanceEvidenceSummary;
  aiStorageAcceptance: LaunchAiStorageAcceptanceEvidenceSummary;
  unitEconomics: LaunchUnitEconomics;
  goalProgress: LaunchGoalProgress;
  dailyActionProgress: LaunchDailyActionProgress;
  productionGate: LaunchProductionGate;
}) {
  const reasons: string[] = [];

  if (!evidenceMatchesCurrentReadiness(input.latestEvidence, input.readiness)) {
    reasons.push("Go / No-Go 摘要");
  }

  if (!evidenceMatchesCurrentPaymentAcceptance(input.latestEvidence, input.paymentAcceptance)) {
    reasons.push("真实支付验收");
  }

  if (!evidenceMatchesCurrentAcceptanceEvidence(input.latestEvidence, input.acceptanceEvidence)) {
    reasons.push("端到端验收证据");
  }

  if (
    !evidenceMatchesCurrentDatabaseAcceptance(input.latestEvidence, input.databaseAcceptance)
  ) {
    reasons.push("数据库验收证据");
  }

  if (
    !evidenceMatchesCurrentDeploymentAcceptance(input.latestEvidence, input.deploymentAcceptance)
  ) {
    reasons.push("部署验收证据");
  }

  if (
    !evidenceMatchesCurrentAiStorageAcceptance(input.latestEvidence, input.aiStorageAcceptance)
  ) {
    reasons.push("AI/图片验收证据");
  }

  if (!evidenceMatchesCurrentUnitEconomics(input.latestEvidence, input.unitEconomics)) {
    reasons.push("成本样本");
  }

  if (!evidenceMatchesCurrentGoalProgress(input.latestEvidence, input.goalProgress)) {
    reasons.push("目标推进记录");
  }

  if (
    !evidenceMatchesCurrentDailyActionProgress(input.latestEvidence, input.dailyActionProgress)
  ) {
    reasons.push("今日动作执行记录");
  }

  if (!evidenceIncludesGoalTransitionGate(input.latestEvidence)) {
    reasons.push("阶段推进门槛");
  }

  if (!evidenceIncludesOfflineAction(input.latestEvidence)) {
    reasons.push("线下办理当前动作");
  }

  if (!evidenceMatchesCurrentProductionGate(input.latestEvidence, input.productionGate)) {
    reasons.push("生产上线总门禁");
  }

  return reasons;
}

function evidenceState(
  latestEvidence: LaunchEvidenceArchive | undefined,
  readiness: LaunchReadiness,
  paymentAcceptance: LaunchPaymentAcceptance,
  acceptanceEvidence: LaunchAcceptanceEvidenceSummary,
  databaseAcceptance: LaunchDatabaseAcceptanceEvidenceSummary,
  deploymentAcceptance: LaunchDeploymentAcceptanceEvidenceSummary,
  aiStorageAcceptance: LaunchAiStorageAcceptanceEvidenceSummary,
  unitEconomics: LaunchUnitEconomics,
  goalProgress: LaunchGoalProgress,
  dailyActionProgress: LaunchDailyActionProgress,
  productionGate: LaunchProductionGate,
) {
  if (!latestEvidence) {
    return {
      state: "missing" as const,
      label: "暂无上线证据归档",
      refreshReasons: [
        "Go / No-Go 摘要",
        "真实支付验收",
        "端到端验收证据",
        "数据库验收证据",
        "部署验收证据",
        "AI/图片验收证据",
        "成本样本",
        "目标推进记录",
        "阶段推进门槛",
        "线下办理当前动作",
        "今日动作执行记录",
        "生产上线总门禁",
      ],
    };
  }

  const refreshReasons = evidenceRefreshReasons({
    latestEvidence,
    readiness,
    paymentAcceptance,
    acceptanceEvidence,
    databaseAcceptance,
    deploymentAcceptance,
    aiStorageAcceptance,
    unitEconomics,
    goalProgress,
    dailyActionProgress,
    productionGate,
  });

  if (refreshReasons.length > 0) {
    return {
      state: "needs_refresh" as const,
      label: "上线证据需刷新",
      latestArchivedAt: latestEvidence.metadata.archivedAt,
      refreshReasons,
    };
  }

  return {
    state: "available" as const,
    label: "上线证据已归档",
    latestArchivedAt: latestEvidence.metadata.archivedAt,
    refreshReasons: [],
  };
}

function evidenceAction(state: ReturnType<typeof evidenceState>): LaunchPackageAction[] {
  if (state.state === "available") {
    return [];
  }

  if (state.state === "needs_refresh") {
    return [
      {
        id: "evidence:refresh",
        type: "evidence",
        title: "刷新上线证据归档",
        status: "warning",
        detail: `最新归档与当前${state.refreshReasons.join("、")}不完全一致。`,
        action: "处理完本轮阻断项或警告项后，在后台健康页重新归档一次上线证据。",
        evidence: "UsageLog(feature=launch_evidence) 中出现最新归档记录。",
      },
    ];
  }

  return [
    {
      id: "evidence:archive",
      type: "evidence",
      title: "归档当前上线证据",
      status: "warning",
      detail: "还没有可用于复核的上线证据快照。",
      action: "在后台健康页归档当前 Go/No-Go、Runbook、落库探针、第三方诊断和支付验收摘要。",
      evidence: "UsageLog(feature=launch_evidence) 中出现上线证据归档记录。",
    },
  ];
}

function uniqueActions(actions: LaunchPackageAction[]) {
  const seen = new Set<string>();

  return actions.filter((action) => {
    if (seen.has(action.id)) {
      return false;
    }

    seen.add(action.id);
    return true;
  });
}

function sortActions(actions: LaunchPackageAction[]) {
  return [...actions].sort(
    (a, b) =>
      statusRank(a.status) - statusRank(b.status) ||
      (a.group ?? a.owner ?? "").localeCompare(b.group ?? b.owner ?? "", "zh-CN") ||
      a.title.localeCompare(b.title, "zh-CN"),
  );
}

function packageStatus(input: {
  readiness: LaunchReadiness;
  runbook: LaunchRunbook;
  missingEvidence: LaunchPackageAction[];
}): HealthStatus {
  if (input.readiness.status === "blocking" || input.runbook.status === "blocking") {
    return "blocking";
  }

  if (
    input.readiness.status === "warning" ||
    input.runbook.status === "warning" ||
    input.missingEvidence.length > 0
  ) {
    return "warning";
  }

  return "ready";
}

function packageCopy(input: {
  status: HealthStatus;
  readiness: LaunchReadiness;
  runbook: LaunchRunbook;
  missingEvidence: LaunchPackageAction[];
}) {
  if (input.status === "blocking") {
    return {
      label: "上线包未闭合",
      detail: `当前还有 ${input.readiness.summary.blocking} 个 Go / No-Go 阻断项、${input.runbook.summary.blocking} 个 Runbook 阻断步骤，暂不可开启真实收费流量。`,
      action: "先处理上线包中的必补事项，再刷新第三方诊断、落库探针和证据归档。",
    };
  }

  if (input.status === "warning") {
    return {
      label: "上线包待复核",
      detail: `当前无阻断项，但还有 ${input.readiness.summary.warning} 个 Go / No-Go 警告项、${input.runbook.summary.warning} 个 Runbook 警告步骤。`,
      action:
        input.missingEvidence.length > 0
          ? "补齐或刷新上线证据后，再进入真实支付小额灰度。"
          : "确认警告项影响范围后，可以进入内部或小流量灰度。",
    };
  }

  return {
    label: "上线包可用于灰度",
    detail: "Go / No-Go、Runbook、外部事项和上线证据均已闭合。",
    action: "可以进入真实支付小额订单验证、对账检查和灰度放量。",
  };
}

export async function getLaunchPackage() {
  const [
    readiness,
    external,
    evidenceArchives,
    paymentAcceptance,
    acceptanceEvidenceRecords,
    databaseAcceptanceRecords,
    deploymentAcceptanceRecords,
    aiStorageAcceptanceRecords,
    unitEconomics,
    goalProgress,
    dailyActionProgress,
    productionGate,
  ] = await Promise.all([
    getLaunchReadiness(),
    getLaunchExternalReadiness(),
    getLaunchEvidenceArchives({ take: 1 }),
    getLaunchPaymentAcceptance(),
    getLaunchAcceptanceEvidenceRecords({ take: 120 }),
    getLaunchDatabaseAcceptanceEvidenceRecords({ take: 120 }),
    getLaunchDeploymentAcceptanceEvidenceRecords({ take: 120 }),
    getLaunchAiStorageAcceptanceEvidenceRecords({ take: 120 }),
    getLaunchUnitEconomics(),
    getLaunchGoalProgress(),
    getLaunchDailyActionProgress(),
    getLaunchProductionGate(),
  ]);
  const runbook = buildLaunchRunbook(readiness);
  const latestEvidence = evidenceArchives[0];
  const acceptanceEvidence = summarizeLaunchAcceptanceEvidenceRecords(acceptanceEvidenceRecords);
  const databaseAcceptance =
    summarizeLaunchDatabaseAcceptanceEvidenceRecords(databaseAcceptanceRecords);
  const deploymentAcceptance =
    summarizeLaunchDeploymentAcceptanceEvidenceRecords(deploymentAcceptanceRecords);
  const aiStorageAcceptance =
    summarizeLaunchAiStorageAcceptanceEvidenceRecords(aiStorageAcceptanceRecords);
  const currentEvidenceState = evidenceState(
    latestEvidence,
    readiness,
    paymentAcceptance,
    acceptanceEvidence,
    databaseAcceptance,
    deploymentAcceptance,
    aiStorageAcceptance,
    unitEconomics,
    goalProgress,
    dailyActionProgress,
    productionGate,
  );
  const missingEvidence = evidenceAction(currentEvidenceState);
  const status = packageStatus({ readiness, runbook, missingEvidence });
  const copy = packageCopy({ status, readiness, runbook, missingEvidence });
  const requiredBeforeGo = sortActions(
    uniqueActions([...readiness.blockers.map(actionFromReadiness), ...missingEvidence]),
  );
  const nextActions = sortActions(
    uniqueActions([
      ...readiness.nextActions.map(actionFromReadiness),
      ...runbook.nextSteps.map(actionFromRunbook),
      ...external.nextItems.map(actionFromExternal),
      ...missingEvidence,
    ]),
  ).slice(0, 10);

  return {
    generatedAt: new Date().toISOString(),
    status,
    ...copy,
    summary: {
      goNoGo: readiness.summary,
      runbook: runbook.summary,
      external: external.summary,
      evidence: currentEvidenceState,
    },
    goNoGo: readiness,
    runbook,
    external,
    latestEvidence,
    requiredBeforeGo,
    missingEvidence,
    nextActions,
  } satisfies LaunchPackage;
}
