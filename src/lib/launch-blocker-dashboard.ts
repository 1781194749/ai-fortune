import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  getLaunchAiStoragePlan,
  type LaunchAiStoragePlan,
  type LaunchAiStoragePlanStep,
} from "@/lib/launch-ai-storage-plan";
import {
  getLaunchCompliancePlan,
  type LaunchCompliancePlan,
  type LaunchCompliancePlanStep,
} from "@/lib/launch-compliance-plan";
import {
  getLaunchDatabasePlan,
  type LaunchDatabasePlan,
  type LaunchDatabasePlanStep,
} from "@/lib/launch-database-plan";
import {
  getLaunchDeploymentPlan,
  type LaunchDeploymentPlan,
  type LaunchDeploymentPlanStep,
} from "@/lib/launch-deployment-plan";
import {
  getLaunchEvidenceActionCenter,
  type LaunchEvidenceActionCenter,
} from "@/lib/launch-evidence-action-center";
import type { LaunchEvidenceGapItem } from "@/lib/launch-evidence-gap";
import {
  getLaunchGoalPlan,
  type LaunchGoalPlan,
  type LaunchGoalPlanMilestone,
} from "@/lib/launch-goal-plan";
import {
  getLaunchPaymentPlan,
  type LaunchPaymentPlan,
  type LaunchPaymentPlanStep,
} from "@/lib/launch-payment-plan";
import {
  getLaunchProductionGate,
  type LaunchProductionGate,
  type LaunchProductionGateItem,
} from "@/lib/launch-production-gate";

export type LaunchBlockerDashboardWorkstreamId =
  | "production_gate"
  | "deployment"
  | "compliance"
  | "database"
  | "ai_storage"
  | "payment"
  | "evidence"
  | "goal_plan";

export type LaunchBlockerDashboardItem = {
  id: string;
  status: HealthStatus;
  title: string;
  owner: string;
  action: string;
  evidence: string;
  source: string;
  routes?: string[];
};

export type LaunchBlockerDashboardWorkstream = {
  id: LaunchBlockerDashboardWorkstreamId;
  order: number;
  title: string;
  status: HealthStatus;
  label: string;
  owner: string;
  detail: string;
  action: string;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
  };
  nextItems: LaunchBlockerDashboardItem[];
};

export type LaunchBlockerDashboard = {
  generatedAt: string;
  status: HealthStatus;
  label: string;
  detail: string;
  action: string;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
    workstreams: number;
    nextActions: number;
  };
  productionGate: {
    status: HealthStatus;
    label: string;
    releaseReady: boolean;
    stepBlocking: number;
    stepWarning: number;
    checkBlocking: number;
    checkWarning: number;
    primaryActionLabel?: string;
  };
  currentWorkstream: LaunchBlockerDashboardWorkstream;
  workstreams: LaunchBlockerDashboardWorkstream[];
  nextActions: LaunchBlockerDashboardItem[];
  copyText: string;
};

type LaunchBlockerDashboardInput = {
  deploymentPlan?: LaunchDeploymentPlan;
  compliancePlan?: LaunchCompliancePlan;
  databasePlan?: LaunchDatabasePlan;
  aiStoragePlan?: LaunchAiStoragePlan;
  paymentPlan?: LaunchPaymentPlan;
  productionGate?: LaunchProductionGate;
  evidenceActionCenter?: LaunchEvidenceActionCenter;
  goalPlan?: LaunchGoalPlan;
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

function dashboardStatus(workstreams: LaunchBlockerDashboardWorkstream[]) {
  if (workstreams.some((item) => item.status === "blocking")) {
    return "blocking" as const;
  }

  if (workstreams.some((item) => item.status === "warning")) {
    return "warning" as const;
  }

  return "ready" as const;
}

function summarizeWorkstreams(workstreams: LaunchBlockerDashboardWorkstream[]) {
  return {
    ready: workstreams.filter((item) => item.status === "ready").length,
    warning: workstreams.filter((item) => item.status === "warning").length,
    blocking: workstreams.filter((item) => item.status === "blocking").length,
    total: workstreams.length,
  };
}

function sortWorkstreams(workstreams: LaunchBlockerDashboardWorkstream[]) {
  return [...workstreams].sort(
    (a, b) =>
      statusRank(a.status) - statusRank(b.status) ||
      a.order - b.order ||
      b.summary.blocking - a.summary.blocking,
  );
}

function stepItem(input: {
  source: string;
  idPrefix: string;
  step:
    | LaunchDeploymentPlanStep
    | LaunchCompliancePlanStep
    | LaunchDatabasePlanStep
    | LaunchAiStoragePlanStep
    | LaunchPaymentPlanStep;
}) {
  return {
    id: `${input.idPrefix}:${input.step.id}`,
    status: input.step.status,
    title: input.step.title,
    owner: input.step.owner,
    action: input.step.action,
    evidence: input.step.evidence,
    source: input.source,
    routes: "routes" in input.step ? input.step.routes : undefined,
  } satisfies LaunchBlockerDashboardItem;
}

function evidenceItem(item: LaunchEvidenceGapItem) {
  return {
    id: `evidence:${item.id}`,
    status: item.status,
    title: item.title,
    owner: item.owner ?? item.source,
    action: item.action,
    evidence: item.evidence,
    source: `证据 / ${item.group}`,
    routes: item.routes,
  } satisfies LaunchBlockerDashboardItem;
}

function goalItems(milestone: LaunchGoalPlanMilestone) {
  return milestone.nextActions.slice(0, 5).map((action, index) => ({
    id: `goal:${milestone.id}:${index}`,
    status: milestone.status,
    title: milestone.title,
    owner: milestone.owner,
    action,
    evidence: milestone.evidence[index] ?? milestone.exitCriteria[0] ?? "当前阶段验收证据。",
    source: "30/60/90 目标",
  })) satisfies LaunchBlockerDashboardItem[];
}

function productionGateItem(item: LaunchProductionGateItem) {
  return {
    id: `production_gate:${item.id}`,
    status: item.status,
    title: item.label,
    owner: "技术 / 运营",
    action: item.action,
    evidence: item.evidence ?? "生产上线总门禁检查输出与上线证据归档。",
    source: "生产总门禁",
  } satisfies LaunchBlockerDashboardItem;
}

function buildWorkstreams(input: {
  productionGate: LaunchProductionGate;
  deploymentPlan: LaunchDeploymentPlan;
  compliancePlan: LaunchCompliancePlan;
  databasePlan: LaunchDatabasePlan;
  aiStoragePlan: LaunchAiStoragePlan;
  paymentPlan: LaunchPaymentPlan;
  evidenceActionCenter: LaunchEvidenceActionCenter;
  goalPlan: LaunchGoalPlan;
}) {
  return [
    {
      id: "production_gate",
      order: 0,
      title: "生产总门禁",
      status: input.productionGate.status,
      label: input.productionGate.label,
      owner: "技术 / 运维 / 运营",
      detail: input.productionGate.detail,
      action: input.productionGate.action,
      summary: input.productionGate.summary,
      nextItems: input.productionGate.nextActions.map(productionGateItem),
    },
    {
      id: "compliance",
      order: 10,
      title: "主体与合规",
      status: input.compliancePlan.status,
      label: input.compliancePlan.label,
      owner: "创始人 / 法务 / 运营",
      detail: input.compliancePlan.detail,
      action: input.compliancePlan.action,
      summary: input.compliancePlan.summary,
      nextItems: input.compliancePlan.nextSteps.map((step) =>
        stepItem({ source: "主体与合规", idPrefix: "compliance", step }),
      ),
    },
    {
      id: "deployment",
      order: 20,
      title: "域名与部署",
      status: input.deploymentPlan.status,
      label: input.deploymentPlan.label,
      owner: "技术 / 运维",
      detail: input.deploymentPlan.detail,
      action: input.deploymentPlan.action,
      summary: input.deploymentPlan.summary,
      nextItems: input.deploymentPlan.nextSteps.map((step) =>
        stepItem({ source: "域名与部署", idPrefix: "deployment", step }),
      ),
    },
    {
      id: "database",
      order: 30,
      title: "生产数据库",
      status: input.databasePlan.status,
      label: input.databasePlan.label,
      owner: "技术 / 运维",
      detail: input.databasePlan.detail,
      action: input.databasePlan.action,
      summary: input.databasePlan.summary,
      nextItems: input.databasePlan.nextSteps.map((step) =>
        stepItem({ source: "生产数据库", idPrefix: "database", step }),
      ),
    },
    {
      id: "ai_storage",
      order: 40,
      title: "AI 与图片能力",
      status: input.aiStoragePlan.status,
      label: input.aiStoragePlan.label,
      owner: "技术 / 产品",
      detail: input.aiStoragePlan.detail,
      action: input.aiStoragePlan.action,
      summary: input.aiStoragePlan.summary,
      nextItems: input.aiStoragePlan.nextSteps.map((step) =>
        stepItem({ source: "AI 与图片能力", idPrefix: "ai-storage", step }),
      ),
    },
    {
      id: "payment",
      order: 50,
      title: "真实支付",
      status: input.paymentPlan.status,
      label: input.paymentPlan.label,
      owner: "财务 / 技术 / 产品",
      detail: input.paymentPlan.detail,
      action: input.paymentPlan.action,
      summary: input.paymentPlan.summary,
      nextItems: input.paymentPlan.nextSteps.map((step) =>
        stepItem({ source: `真实支付 / ${step.channelLabel}`, idPrefix: "payment", step }),
      ),
    },
    {
      id: "evidence",
      order: 60,
      title: "上线证据",
      status: input.evidenceActionCenter.status,
      label: input.evidenceActionCenter.label,
      owner: "运营 / 技术 / 财务",
      detail: input.evidenceActionCenter.detail,
      action: input.evidenceActionCenter.action,
      summary: input.evidenceActionCenter.summary,
      nextItems: input.evidenceActionCenter.nextItems.map(evidenceItem),
    },
    {
      id: "goal_plan",
      order: 70,
      title: "30/60/90 目标",
      status: input.goalPlan.status,
      label: input.goalPlan.label,
      owner: input.goalPlan.currentMilestone.owner,
      detail: input.goalPlan.detail,
      action: input.goalPlan.action,
      summary: input.goalPlan.summary,
      nextItems: goalItems(input.goalPlan.currentMilestone),
    },
  ] satisfies LaunchBlockerDashboardWorkstream[];
}

function buildCopyText(input: {
  status: HealthStatus;
  label: string;
  productionGate: LaunchBlockerDashboard["productionGate"];
  current: LaunchBlockerDashboardWorkstream;
  nextActions: LaunchBlockerDashboardItem[];
  workstreams: LaunchBlockerDashboardWorkstream[];
}) {
  const streamLines = input.workstreams.map(
    (item) =>
      `- [${item.status}] ${item.title}：${item.summary.blocking} 阻断 / ${item.summary.warning} 待复核。下一步：${item.nextItems[0]?.title ?? item.action}`,
  );
  const actionLines = input.nextActions.length
    ? input.nextActions.map(
        (item, index) =>
          `${index + 1}. [${item.status}] ${item.source} / ${item.title} / ${item.owner}：${item.action} 证据：${item.evidence}`,
      )
    : ["暂无待处理动作。"];

  return [
    "玄机 AI 上线阻断总控台",
    `状态：${input.label} (${input.status})`,
    `生产总门禁：releaseReady=${input.productionGate.releaseReady ? "yes" : "no"}，门禁步骤 ${input.productionGate.stepBlocking} blocking / ${input.productionGate.stepWarning} warning，细分检查 ${input.productionGate.checkBlocking} blocking / ${input.productionGate.checkWarning} warning。`,
    `当前先办：${input.current.title}`,
    "",
    "工作线：",
    ...streamLines,
    "",
    "优先动作：",
    ...actionLines,
  ].join("\n");
}

export async function getLaunchBlockerDashboard(input?: LaunchBlockerDashboardInput) {
  const [
    deploymentPlan,
    compliancePlan,
    databasePlan,
    aiStoragePlan,
    paymentPlan,
    productionGate,
    evidenceActionCenter,
    goalPlan,
  ] = await Promise.all([
    input?.deploymentPlan ?? getLaunchDeploymentPlan(),
    input?.compliancePlan ?? getLaunchCompliancePlan(),
    input?.databasePlan ?? getLaunchDatabasePlan(),
    input?.aiStoragePlan ?? getLaunchAiStoragePlan(),
    input?.paymentPlan ?? getLaunchPaymentPlan(),
    input?.productionGate ?? getLaunchProductionGate(),
    input?.evidenceActionCenter ?? getLaunchEvidenceActionCenter(),
    input?.goalPlan ?? getLaunchGoalPlan(),
  ]);
  const workstreams = buildWorkstreams({
    productionGate,
    deploymentPlan,
    compliancePlan,
    databasePlan,
    aiStoragePlan,
    paymentPlan,
    evidenceActionCenter,
    goalPlan,
  });
  const sortedWorkstreams = sortWorkstreams(workstreams);
  const currentWorkstream = sortedWorkstreams[0];
  const summary = summarizeWorkstreams(workstreams);
  const status = dashboardStatus(workstreams);
  const productionGateSnapshot = {
    status: productionGate.status,
    label: productionGate.label,
    releaseReady: productionGate.releaseReady,
    stepBlocking: productionGate.summary.blocking,
    stepWarning: productionGate.summary.warning,
    checkBlocking: productionGate.checkSummary.blocking,
    checkWarning: productionGate.checkSummary.warning,
    primaryActionLabel: productionGate.nextActions[0]?.label,
  } satisfies LaunchBlockerDashboard["productionGate"];
  const nextActions = sortedWorkstreams
    .flatMap((stream) =>
      stream.nextItems
        .filter((item) => item.status !== "ready")
        .slice(0, stream.status === "blocking" ? 3 : 1),
    )
    .slice(0, 10);
  const label =
    status === "ready"
      ? "上线阻断总控台已闭合"
      : status === "warning"
        ? `上线阻断总控台有 ${summary.warning} 条工作线待复核`
        : `上线阻断总控台有 ${summary.blocking} 条工作线阻断`;

  return {
    generatedAt: new Date().toISOString(),
    status,
    label,
    detail:
      status === "ready"
        ? "生产总门禁、域名部署、主体合规、数据库、AI/图片、支付、证据和目标规划均已闭合。"
        : `当前应先推进「${currentWorkstream.title}」，再按工作线依赖继续处理其他阻断项。`,
    action:
      status === "blocking"
        ? currentWorkstream.action
        : status === "warning"
          ? "复核待处理工作线，并刷新上线证据归档。"
          : "保留总控台快照，进入小额真实订单或放量复盘。",
    summary: {
      ...summary,
      workstreams: workstreams.length,
      nextActions: nextActions.length,
    },
    productionGate: productionGateSnapshot,
    currentWorkstream,
    workstreams: sortedWorkstreams,
    nextActions,
    copyText: buildCopyText({
      status,
      label,
      productionGate: productionGateSnapshot,
      current: currentWorkstream,
      nextActions,
      workstreams: sortedWorkstreams,
    }),
  } satisfies LaunchBlockerDashboard;
}
