import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  getLaunchComplianceChecklist,
  type LaunchComplianceChecklist,
  type LaunchComplianceItem,
} from "@/lib/launch-compliance";
import {
  getLaunchApplicationPack,
  type LaunchApplicationPack,
  type LaunchApplicationPlatform,
} from "@/lib/launch-application-pack";
import {
  getLaunchEnvDraft,
  type LaunchEnvDraft,
  type LaunchEnvDraftEntry,
} from "@/lib/launch-env-draft";
import {
  getLaunchEvidenceGap,
  type LaunchEvidenceGap,
  type LaunchEvidenceGapKind,
  type LaunchEvidenceGapItem,
} from "@/lib/launch-evidence-gap";
import { getLaunchPackage, type LaunchPackage } from "@/lib/launch-package";
import {
  getLaunchPaymentAcceptance,
  type LaunchPaymentAcceptance,
  type LaunchPaymentAcceptanceItem,
} from "@/lib/launch-payment-acceptance";
import {
  getLaunchProductionGate,
  type LaunchProductionGate,
  type LaunchProductionGateItem,
} from "@/lib/launch-production-gate";
import {
  getLaunchRolloutPlan,
  type LaunchRolloutBlocker,
  type LaunchRolloutPlan,
} from "@/lib/launch-rollout";
import {
  getLaunchScheduleRisk,
  type LaunchScheduleItem,
  type LaunchScheduleRisk,
} from "@/lib/launch-schedule";
import {
  getLaunchUnitEconomics,
  type LaunchUnitEconomics,
  type LaunchUnitEconomicsIssue,
} from "@/lib/launch-unit-economics";
import {
  getLaunchWorkplan,
  type LaunchWorkplan,
  type LaunchWorkplanTask,
} from "@/lib/launch-workplan";
import type {
  LaunchGoalTransitionGateCheckSnapshot,
  LaunchGoalTransitionGateSnapshot,
} from "@/lib/launch-goal-transition-gate";

export type LaunchDecisionStage =
  | "no_go"
  | "internal_gray"
  | "paid_smoke"
  | "release_ready";

export type LaunchDecisionGateId =
  | "launch_package"
  | "production_gate"
  | "application_pack"
  | "production_env"
  | "compliance"
  | "payment_acceptance"
  | "unit_economics"
  | "evidence_gap"
  | "rollout"
  | "schedule"
  | "workplan"
  | "goal_transition";

export type LaunchDecisionGate = {
  id: LaunchDecisionGateId;
  title: string;
  status: HealthStatus;
  label: string;
  detail: string;
  action: string;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
  };
};

export type LaunchDecisionItem = {
  id: string;
  gateId: LaunchDecisionGateId;
  gateTitle: string;
  title: string;
  status: HealthStatus;
  group?: string;
  owner?: string;
  detail: string;
  action: string;
  evidence: string;
};

export type LaunchDecision = {
  generatedAt: string;
  status: HealthStatus;
  decision: LaunchDecisionStage;
  label: string;
  detail: string;
  action: string;
  readinessPercent: number;
  paymentEntryReady: boolean;
  currentPhase: {
    id: string;
    title: string;
    label: string;
    owner: string;
  };
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
    blockers: number;
    warnings: number;
    configuredPaymentChannels: number;
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
  goalTransitionGate?: LaunchGoalTransitionGateSnapshot;
  gates: LaunchDecisionGate[];
  blockers: LaunchDecisionItem[];
  warnings: LaunchDecisionItem[];
  nextActions: LaunchDecisionItem[];
  copyText: string;
};

type LaunchDecisionInput = {
  launchPackage?: LaunchPackage;
  productionGate?: LaunchProductionGate;
  applicationPack?: LaunchApplicationPack;
  envDraft?: LaunchEnvDraft;
  paymentAcceptance?: LaunchPaymentAcceptance;
  compliance?: LaunchComplianceChecklist;
  unitEconomics?: LaunchUnitEconomics;
  evidenceGap?: LaunchEvidenceGap;
  rollout?: LaunchRolloutPlan;
  schedule?: LaunchScheduleRisk;
  workplan?: LaunchWorkplan;
  goalTransitionGate?: LaunchGoalTransitionGateSnapshot;
};

const gateTitles = {
  launch_package: "收费上线包",
  production_gate: "生产上线总门禁",
  application_pack: "平台申请材料",
  production_env: "生产变量",
  compliance: "合规主体",
  payment_acceptance: "真实支付",
  unit_economics: "单位经济",
  evidence_gap: "上线证据",
  rollout: "灰度放量",
  schedule: "上线排期",
  workplan: "执行计划",
  goal_transition: "阶段推进门槛",
} satisfies Record<LaunchDecisionGateId, string>;

const criticalGateIds = new Set<LaunchDecisionGateId>([
  "launch_package",
  "production_gate",
  "application_pack",
  "production_env",
  "compliance",
  "unit_economics",
]);

function statusRank(status: HealthStatus) {
  if (status === "blocking") {
    return 0;
  }

  if (status === "warning") {
    return 1;
  }

  return 2;
}

function gateOrder(id: LaunchDecisionGateId) {
  return (
    [
      "launch_package",
      "production_gate",
      "application_pack",
      "production_env",
      "compliance",
      "payment_acceptance",
      "unit_economics",
      "evidence_gap",
      "rollout",
      "schedule",
      "workplan",
      "goal_transition",
    ] as LaunchDecisionGateId[]
  ).indexOf(id);
}

function scheduleSummary(schedule: LaunchScheduleRisk): LaunchDecisionGate["summary"] {
  return {
    ready: schedule.summary.ready + schedule.summary.scheduled,
    warning: schedule.summary.dueSoon + schedule.summary.unscheduled,
    blocking: schedule.summary.overdue,
    total: schedule.summary.total,
  };
}

function gate(input: LaunchDecisionGate) {
  return input;
}

function buildGates(input: {
  launchPackage: LaunchPackage;
  productionGate: LaunchProductionGate;
  applicationPack: LaunchApplicationPack;
  envDraft: LaunchEnvDraft;
  paymentAcceptance: LaunchPaymentAcceptance;
  compliance: LaunchComplianceChecklist;
  unitEconomics: LaunchUnitEconomics;
  evidenceGap: LaunchEvidenceGap;
  rollout: LaunchRolloutPlan;
  schedule: LaunchScheduleRisk;
  workplan: LaunchWorkplan;
  goalTransitionGate?: LaunchGoalTransitionGateSnapshot;
}) {
  const gates = [
    gate({
      id: "launch_package",
      title: gateTitles.launch_package,
      status: input.launchPackage.status,
      label: input.launchPackage.label,
      detail: input.launchPackage.detail,
      action: input.launchPackage.action,
      summary: input.launchPackage.summary.goNoGo,
    }),
    gate({
      id: "production_gate",
      title: gateTitles.production_gate,
      status: input.productionGate.status,
      label: input.productionGate.label,
      detail: input.productionGate.detail,
      action: input.productionGate.action,
      summary: input.productionGate.summary,
    }),
    gate({
      id: "application_pack",
      title: gateTitles.application_pack,
      status: input.applicationPack.status,
      label: input.applicationPack.label,
      detail: input.applicationPack.detail,
      action: input.applicationPack.action,
      summary: input.applicationPack.summary,
    }),
    gate({
      id: "production_env",
      title: gateTitles.production_env,
      status: input.envDraft.status,
      label: input.envDraft.label,
      detail: input.envDraft.detail,
      action: input.envDraft.action,
      summary: input.envDraft.summary,
    }),
    gate({
      id: "compliance",
      title: gateTitles.compliance,
      status: input.compliance.status,
      label: input.compliance.label,
      detail: input.compliance.detail,
      action: input.compliance.action,
      summary: input.compliance.summary,
    }),
    gate({
      id: "payment_acceptance",
      title: gateTitles.payment_acceptance,
      status: input.paymentAcceptance.status,
      label: input.paymentAcceptance.label,
      detail: input.paymentAcceptance.detail,
      action: input.paymentAcceptance.action,
      summary: input.paymentAcceptance.summary,
    }),
    gate({
      id: "unit_economics",
      title: gateTitles.unit_economics,
      status: input.unitEconomics.status,
      label: input.unitEconomics.label,
      detail: input.unitEconomics.detail,
      action: input.unitEconomics.action,
      summary: input.unitEconomics.summary,
    }),
    gate({
      id: "evidence_gap",
      title: gateTitles.evidence_gap,
      status: input.evidenceGap.status,
      label: input.evidenceGap.label,
      detail: input.evidenceGap.detail,
      action: input.evidenceGap.action,
      summary: input.evidenceGap.summary,
    }),
    gate({
      id: "rollout",
      title: gateTitles.rollout,
      status: input.rollout.status,
      label: input.rollout.label,
      detail: input.rollout.currentPhase.goal,
      action: input.rollout.currentPhase.nextActions[0] ?? "按灰度阶段继续推进。",
      summary: input.rollout.summary,
    }),
    gate({
      id: "schedule",
      title: gateTitles.schedule,
      status: input.schedule.status,
      label: input.schedule.label,
      detail: `今天 ${input.schedule.today}，排期风险用于判断外部办理节奏。`,
      action: input.schedule.nextItems[0]?.action ?? "保持当前目标日期和完成证据。",
      summary: scheduleSummary(input.schedule),
    }),
    gate({
      id: "workplan",
      title: gateTitles.workplan,
      status: input.workplan.status,
      label: input.workplan.label,
      detail: input.workplan.activeLane
        ? `当前工作线：${input.workplan.activeLane.title}。`
        : "上线执行工作线暂无阻断。",
      action: input.workplan.workingSet[0]?.action ?? "保持执行计划闭合，并在上线前归档证据。",
      summary: input.workplan.summary,
    }),
  ] satisfies LaunchDecisionGate[];

  if (!input.goalTransitionGate) {
    return gates;
  }

  return [
    ...gates,
    gate({
      id: "goal_transition",
      title: gateTitles.goal_transition,
      status: input.goalTransitionGate.status,
      label: input.goalTransitionGate.label,
      detail: input.goalTransitionGate.detail,
      action: input.goalTransitionGate.action,
      summary: input.goalTransitionGate.summary,
    }),
  ] satisfies LaunchDecisionGate[];
}

function decisionItem(input: LaunchDecisionItem) {
  return input;
}

function envItem(entry: LaunchEnvDraftEntry): LaunchDecisionItem {
  return decisionItem({
    id: `production_env:${entry.key}`,
    gateId: "production_env",
    gateTitle: gateTitles.production_env,
    title: `${entry.label} (${entry.key})`,
    status: entry.status,
    group: entry.group,
    detail: entry.stateLabel,
    action: entry.action,
    evidence:
      entry.platformHints.length > 0
        ? entry.platformHints.join("、")
        : "生产环境变量核对显示该项已通过。",
  });
}

function applicationItem(platform: LaunchApplicationPlatform): LaunchDecisionItem {
  return decisionItem({
    id: `application_pack:${platform.id}`,
    gateId: "application_pack",
    gateTitle: gateTitles.application_pack,
    title: platform.title,
    status: platform.status,
    group: platform.owner,
    owner: platform.owner,
    detail: platform.purpose,
    action: platform.nextAction,
    evidence: platform.evidence.join("；") || "平台申请材料已准备并留存截图或回执。",
  });
}

function complianceItem(item: LaunchComplianceItem): LaunchDecisionItem {
  return decisionItem({
    id: `compliance:${item.id}`,
    gateId: "compliance",
    gateTitle: gateTitles.compliance,
    title: item.title,
    status: item.status,
    group: item.group,
    detail: item.detail,
    action: item.action,
    evidence: item.evidence,
  });
}

function paymentItem(item: LaunchPaymentAcceptanceItem): LaunchDecisionItem {
  return decisionItem({
    id: `payment_acceptance:${item.id}`,
    gateId: "payment_acceptance",
    gateTitle: gateTitles.payment_acceptance,
    title: item.title,
    status: item.status,
    group: item.group,
    detail: item.detail,
    action: item.action,
    evidence: item.evidence,
  });
}

function productionGateItem(item: LaunchProductionGateItem): LaunchDecisionItem {
  return decisionItem({
    id: `production_gate:${item.id}`,
    gateId: "production_gate",
    gateTitle: gateTitles.production_gate,
    title: item.label,
    status: item.status,
    group: "生产总门禁",
    detail: item.detail,
    action: item.action,
    evidence: item.evidence ?? "生产上线总门禁检查输出与上线证据归档。",
  });
}

function unitEconomicsItem(item: LaunchUnitEconomicsIssue): LaunchDecisionItem {
  return decisionItem({
    id: `unit_economics:${item.id}`,
    gateId: "unit_economics",
    gateTitle: gateTitles.unit_economics,
    title: item.title,
    status: item.status,
    group: item.group,
    detail: item.detail,
    action: item.action,
    evidence: item.evidence,
  });
}

function evidenceItem(item: LaunchEvidenceGapItem): LaunchDecisionItem {
  const evidenceKinds = item.evidenceKinds.map(evidenceKindLabel).join("、");

  return decisionItem({
    id: `evidence_gap:${item.id}`,
    gateId: "evidence_gap",
    gateTitle: gateTitles.evidence_gap,
    title: item.title,
    status: item.status,
    group: item.group,
    owner: item.owner,
    detail: evidenceKinds ? `${item.detail}；补证类型：${evidenceKinds}` : item.detail,
    action: item.action,
    evidence: item.evidence,
  });
}

function evidenceKindLabel(kind: LaunchEvidenceGapKind) {
  if (kind === "receipt") {
    return "平台回执";
  }

  if (kind === "small_order") {
    return "小额订单";
  }

  if (kind === "cost_sample") {
    return "成本样本";
  }

  if (kind === "archive") {
    return "后台归档";
  }

  if (kind === "admin_record") {
    return "后台记录";
  }

  return "截图/录屏";
}

function scheduleItem(item: LaunchScheduleItem): LaunchDecisionItem {
  return decisionItem({
    id: `schedule:${item.id}`,
    gateId: "schedule",
    gateTitle: gateTitles.schedule,
    title: item.title,
    status: item.scheduleStatus,
    group: item.group,
    owner: item.owner,
    detail: item.detail,
    action: item.action,
    evidence: item.evidence,
  });
}

function rolloutItem(item: LaunchRolloutBlocker): LaunchDecisionItem {
  return decisionItem({
    id: `rollout:${item.id}`,
    gateId: "rollout",
    gateTitle: gateTitles.rollout,
    title: item.title,
    status: item.status,
    owner: item.owner,
    detail: item.action,
    action: item.action,
    evidence: item.evidence,
  });
}

function workplanItem(item: LaunchWorkplanTask): LaunchDecisionItem {
  return decisionItem({
    id: `workplan:${item.id}`,
    gateId: "workplan",
    gateTitle: gateTitles.workplan,
    title: item.title,
    status: item.status,
    group: item.laneTitle,
    owner: item.owner,
    detail: item.detail,
    action: item.action,
    evidence: item.evidence,
  });
}

function goalTransitionItem(
  gate: LaunchGoalTransitionGateSnapshot,
  item: LaunchGoalTransitionGateCheckSnapshot,
): LaunchDecisionItem {
  return decisionItem({
    id: `goal_transition:${item.id}`,
    gateId: "goal_transition",
    gateTitle: gateTitles.goal_transition,
    title: item.title,
    status: item.status,
    group: gate.currentMilestoneTitle,
    detail: item.detail,
    action: item.action,
    evidence: item.evidence,
  });
}

function goalTransitionItems(gate: LaunchGoalTransitionGateSnapshot | undefined) {
  if (!gate || gate.canAdvance) {
    return [];
  }

  return [...gate.blockers, ...gate.warnings].map((item) => goalTransitionItem(gate, item));
}

function paymentChannelConfigBlocker(
  paymentAcceptance: LaunchPaymentAcceptance,
): LaunchDecisionItem | undefined {
  const configuredChannels = paymentAcceptance.channels.filter(
    (channel) => channel.enabled && channel.missingFields.length === 0,
  );

  if (configuredChannels.length > 0) {
    return undefined;
  }

  return decisionItem({
    id: "payment_acceptance:channel-config",
    gateId: "payment_acceptance",
    gateTitle: gateTitles.payment_acceptance,
    title: "至少一个真实支付渠道可创建订单",
    status: "blocking",
    group: "支付总闸",
    detail: "支付宝和微信支付都还没有达到可创建真实订单的配置状态。",
    action: "至少开启并补齐支付宝或微信支付一个渠道的商户参数，再进入小额真实订单验证。",
    evidence: "后台真实支付验收中至少一个渠道的商户参数与开关为 ready。",
  });
}

function buildDecisionItems(input: {
  launchPackage: LaunchPackage;
  productionGate: LaunchProductionGate;
  applicationPack: LaunchApplicationPack;
  envDraft: LaunchEnvDraft;
  paymentAcceptance: LaunchPaymentAcceptance;
  compliance: LaunchComplianceChecklist;
  unitEconomics: LaunchUnitEconomics;
  evidenceGap: LaunchEvidenceGap;
  rollout: LaunchRolloutPlan;
  schedule: LaunchScheduleRisk;
  workplan: LaunchWorkplan;
  goalTransitionGate?: LaunchGoalTransitionGateSnapshot;
}) {
  const paymentConfigBlocker = paymentChannelConfigBlocker(input.paymentAcceptance);

  return uniqueItems([
    ...input.launchPackage.nextActions.map((item) =>
      decisionItem({
        id: `launch_package:${item.id}`,
        gateId: "launch_package",
        gateTitle: gateTitles.launch_package,
        title: item.title,
        status: item.status,
        group: item.group,
        owner: item.owner,
        detail: item.detail,
        action: item.action,
        evidence: item.evidence ?? "收费上线包对应检查项显示已通过。",
      }),
    ),
    ...input.productionGate.nextActions.map(productionGateItem),
    ...input.applicationPack.nextPlatforms.map(applicationItem),
    ...input.envDraft.priorityEntries.map(envItem),
    ...input.compliance.nextItems.map(complianceItem),
    ...input.paymentAcceptance.nextItems.map(paymentItem),
    ...(paymentConfigBlocker ? [paymentConfigBlocker] : []),
    ...input.unitEconomics.nextIssues.map(unitEconomicsItem),
    ...input.evidenceGap.nextGaps.map(evidenceItem),
    ...input.rollout.currentPhase.blockers
      .filter((item) => item.status !== "ready")
      .map(rolloutItem),
    ...input.schedule.nextItems.map(scheduleItem),
    ...input.workplan.workingSet.map(workplanItem),
    ...goalTransitionItems(input.goalTransitionGate),
  ]).sort(
    (a, b) =>
      statusRank(a.status) - statusRank(b.status) ||
      gateOrder(a.gateId) - gateOrder(b.gateId) ||
      (a.group ?? a.owner ?? "").localeCompare(b.group ?? b.owner ?? "", "zh-CN") ||
      a.title.localeCompare(b.title, "zh-CN"),
  );
}

function uniqueItems(items: LaunchDecisionItem[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

function gateSummary(gates: LaunchDecisionGate[]) {
  return {
    ready: gates.filter((item) => item.status === "ready").length,
    warning: gates.filter((item) => item.status === "warning").length,
    blocking: gates.filter((item) => item.status === "blocking").length,
    total: gates.length,
  };
}

function nextDecisionActions(items: LaunchDecisionItem[]) {
  const openItems = items.filter((item) => item.status !== "ready");
  const pinnedGoalTransitionItems = openItems.filter(
    (item) => item.gateId === "goal_transition",
  );

  return uniqueItems([...pinnedGoalTransitionItems, ...openItems]).slice(0, 10);
}

function configuredPaymentChannels(paymentAcceptance: LaunchPaymentAcceptance) {
  return paymentAcceptance.channels.filter(
    (channel) => channel.enabled && channel.missingFields.length === 0,
  ).length;
}

function hasPaymentEntryBlocker(input: {
  paymentAcceptance: LaunchPaymentAcceptance;
  configuredChannels: number;
}) {
  const globalBlockers = input.paymentAcceptance.nextItems.some(
    (item) =>
      item.status === "blocking" &&
      (item.id === "payment-mode" || item.id === "payment-callback-dev-bypass"),
  );

  return globalBlockers || input.configuredChannels === 0;
}

function isReleaseReady(input: {
  launchPackage: LaunchPackage;
  productionGate: LaunchProductionGate;
  applicationPack: LaunchApplicationPack;
  envDraft: LaunchEnvDraft;
  paymentAcceptance: LaunchPaymentAcceptance;
  compliance: LaunchComplianceChecklist;
  unitEconomics: LaunchUnitEconomics;
  evidenceGap: LaunchEvidenceGap;
  rollout: LaunchRolloutPlan;
  schedule: LaunchScheduleRisk;
  workplan: LaunchWorkplan;
}) {
  return (
    input.launchPackage.status === "ready" &&
    input.productionGate.status === "ready" &&
    input.applicationPack.status === "ready" &&
    input.envDraft.status === "ready" &&
    input.paymentAcceptance.status === "ready" &&
    input.compliance.status === "ready" &&
    input.unitEconomics.status === "ready" &&
    input.evidenceGap.status === "ready" &&
    input.rollout.status !== "blocking" &&
    input.schedule.status !== "blocking" &&
    input.workplan.status !== "blocking"
  );
}

function decide(input: {
  gates: LaunchDecisionGate[];
  paymentEntryBlocked: boolean;
  paymentEntryReady: boolean;
  releaseReady: boolean;
}) {
  const criticalBlocking = input.gates.some(
    (gateItem) => criticalGateIds.has(gateItem.id) && gateItem.status === "blocking",
  );

  if (criticalBlocking || input.paymentEntryBlocked) {
    return "no_go" satisfies LaunchDecisionStage;
  }

  if (input.releaseReady) {
    return "release_ready" satisfies LaunchDecisionStage;
  }

  if (input.paymentEntryReady) {
    return "paid_smoke" satisfies LaunchDecisionStage;
  }

  return "internal_gray" satisfies LaunchDecisionStage;
}

function decisionCopy(input: {
  decision: LaunchDecisionStage;
  productionGate: LaunchDecision["productionGate"];
  goalTransitionGate?: LaunchGoalTransitionGateSnapshot;
  blockers: LaunchDecisionItem[];
  readinessPercent: number;
}) {
  if (input.goalTransitionGate && !input.goalTransitionGate.canAdvance) {
    return {
      status: input.goalTransitionGate.status,
      label: "最终结论：阶段推进门槛待补齐",
      detail: `核心上线决策为 ${input.decision}，但 ${input.goalTransitionGate.currentMilestoneTitle} 还未满足阶段推进门槛，canAdvance=no。`,
      action: `先处理阶段门槛：${input.goalTransitionGate.action}`,
    };
  }

  if (input.decision === "release_ready") {
    return {
      status: "ready" as const,
      label: "最终结论：可小流量收费放量",
      detail: `生产总门禁、核心上线、平台申请、生产变量、合规、真实支付、单位经济和证据闭环已通过，综合就绪度 ${input.readinessPercent}%。`,
      action: "按灰度放量计划开放首批真实收费流量，并继续做支付对账、客服退款和渠道 ROI 复盘。",
    };
  }

  if (input.decision === "paid_smoke") {
    return {
      status: "warning" as const,
      label: "最终结论：可做小额真实订单灰度",
      detail: `生产总门禁 releaseReady=${input.productionGate.releaseReady ? "yes" : "no"}，核心收费前置项和单位经济没有硬阻断，至少一个真实支付渠道可进入白名单小额订单验证。`,
      action: "仅对内部账号或白名单开放真实支付入口，完成 PAID 回调、平台交易号、权益到账和对账留证后再放量。",
    };
  }

  if (input.decision === "internal_gray") {
    return {
      status: "warning" as const,
      label: "最终结论：仅适合内部灰度",
      detail: `生产总门禁 releaseReady=${input.productionGate.releaseReady ? "yes" : "no"}，核心阻断已减少，但真实收费、证据或放量条件仍需复核，不建议公开收费。`,
      action: "保持收费入口隐藏或仅测试账号可见，先补齐支付、证据归档和排期风险。",
    };
  }

  return {
    status: "blocking" as const,
    label: "最终结论：暂不可收费上线",
    detail: `当前仍有 ${input.blockers.length} 个阻断项，不能开放真实收费流量。`,
    action: "优先处理主体/备案/生产变量/真实支付总闸等阻断项，再重新查看最终决策。",
  };
}

function buildCopyText(input: {
  generatedAt: string;
  decision: LaunchDecisionStage;
  label: string;
  status: HealthStatus;
  readinessPercent: number;
  currentPhase: LaunchDecision["currentPhase"];
  blockers: LaunchDecisionItem[];
  warnings: LaunchDecisionItem[];
  action: string;
  productionGate: LaunchDecision["productionGate"];
  goalTransitionGate?: LaunchGoalTransitionGateSnapshot;
}) {
  const priorityItems = input.blockers.length > 0 ? input.blockers : input.warnings;
  const lines =
    priorityItems.length > 0
      ? priorityItems.slice(0, 8).map(
          (item, index) =>
            `${index + 1}. [${item.status}] ${item.gateTitle} / ${item.title}：${item.action} 证据：${item.evidence}`,
        )
      : ["- 当前没有阻断或警告项。"];

  return [
    "玄机 AI 最终上线决策",
    `生成时间：${input.generatedAt.slice(0, 16).replace("T", " ")}`,
    `结论：${input.label}`,
    `决策档位：${input.decision}`,
    `状态：${input.status}`,
    `综合就绪度：${input.readinessPercent}%`,
    `生产总门禁：releaseReady=${input.productionGate.releaseReady ? "yes" : "no"}，门禁步骤 ${input.productionGate.stepBlocking} blocking / ${input.productionGate.stepWarning} warning，细分检查 ${input.productionGate.checkBlocking} blocking / ${input.productionGate.checkWarning} warning。`,
    input.goalTransitionGate
      ? `阶段推进门槛：${input.goalTransitionGate.label}；canAdvance=${
          input.goalTransitionGate.canAdvance ? "yes" : "no"
        }；blocking=${input.goalTransitionGate.summary.blocking}；warning=${
          input.goalTransitionGate.summary.warning
        }。`
      : "阶段推进门槛：未注入目标规划快照。",
    `当前阶段：${input.currentPhase.title} / ${input.currentPhase.label}`,
    `下一步：${input.action}`,
    "",
    "优先处理：",
    ...lines,
  ].join("\n");
}

export async function getLaunchDecision(input?: LaunchDecisionInput) {
  const [
    launchPackage,
    productionGate,
    applicationPack,
    envDraft,
    paymentAcceptance,
    compliance,
    unitEconomics,
    rollout,
    schedule,
    workplan,
    goalTransitionGate,
  ] = await Promise.all([
    input?.launchPackage ?? getLaunchPackage(),
    input?.productionGate ?? getLaunchProductionGate(),
    input?.applicationPack ?? getLaunchApplicationPack(),
    input?.envDraft ?? getLaunchEnvDraft(),
    input?.paymentAcceptance ?? getLaunchPaymentAcceptance(),
    input?.compliance ?? getLaunchComplianceChecklist(),
    input?.unitEconomics ?? getLaunchUnitEconomics(),
    input?.rollout ?? getLaunchRolloutPlan(),
    input?.schedule ?? getLaunchScheduleRisk(),
    input?.workplan ?? getLaunchWorkplan(),
    input?.goalTransitionGate,
  ]);
  const evidenceGap =
    input?.evidenceGap ??
    (await getLaunchEvidenceGap({
      launchPackage,
      paymentAcceptance,
      compliance,
      applicationPack,
      unitEconomics,
    }));
  const gates = buildGates({
    launchPackage,
    productionGate,
    applicationPack,
    envDraft,
    paymentAcceptance,
    compliance,
    unitEconomics,
    evidenceGap,
    rollout,
    schedule,
    workplan,
    goalTransitionGate,
  });
  const items = buildDecisionItems({
    launchPackage,
    productionGate,
    applicationPack,
    envDraft,
    paymentAcceptance,
    compliance,
    unitEconomics,
    evidenceGap,
    rollout,
    schedule,
    workplan,
    goalTransitionGate,
  });
  const blockers = items.filter((item) => item.status === "blocking");
  const warnings = items.filter((item) => item.status === "warning");
  const summary = gateSummary(gates);
  const readinessPercent =
    summary.total > 0 ? Math.round((summary.ready / summary.total) * 100) : 100;
  const configuredChannels = configuredPaymentChannels(paymentAcceptance);
  const paymentEntryBlocked = hasPaymentEntryBlocker({
    paymentAcceptance,
    configuredChannels,
  });
  const paymentEntryReady = !paymentEntryBlocked && configuredChannels > 0;
  const releaseReady = isReleaseReady({
    launchPackage,
    productionGate,
    applicationPack,
    envDraft,
    paymentAcceptance,
    compliance,
    unitEconomics,
    evidenceGap,
    rollout,
    schedule,
    workplan,
  });
  const decision = decide({
    gates,
    paymentEntryBlocked,
    paymentEntryReady,
    releaseReady,
  });
  const generatedAt = new Date().toISOString();
  const productionGateSnapshot = {
    status: productionGate.status,
    label: productionGate.label,
    releaseReady: productionGate.releaseReady,
    stepBlocking: productionGate.summary.blocking,
    stepWarning: productionGate.summary.warning,
    checkBlocking: productionGate.checkSummary.blocking,
    checkWarning: productionGate.checkSummary.warning,
    primaryActionLabel: productionGate.nextActions[0]?.label,
  } satisfies LaunchDecision["productionGate"];
  const copy = decisionCopy({
    decision,
    productionGate: productionGateSnapshot,
    goalTransitionGate,
    blockers,
    readinessPercent,
  });
  const currentPhase = {
    id: rollout.currentPhase.id,
    title: rollout.currentPhase.title,
    label: rollout.currentPhase.label,
    owner: rollout.currentPhase.owner,
  };

  return {
    generatedAt,
    ...copy,
    decision,
    readinessPercent,
    paymentEntryReady,
    currentPhase,
    summary: {
      ...summary,
      blockers: blockers.length,
      warnings: warnings.length,
      configuredPaymentChannels: configuredChannels,
    },
    productionGate: productionGateSnapshot,
    goalTransitionGate,
    gates,
    blockers,
    warnings,
    nextActions: nextDecisionActions(items),
    copyText: buildCopyText({
      generatedAt,
      decision,
      label: copy.label,
      status: copy.status,
      readinessPercent,
      currentPhase,
      blockers,
      warnings,
      action: copy.action,
      productionGate: productionGateSnapshot,
      goalTransitionGate,
    }),
  } satisfies LaunchDecision;
}
