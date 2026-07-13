import type { HealthStatus } from "@/lib/health-checks";
import type {
  LaunchGoalPlanMilestoneId,
  LaunchGoalPlanTransitionCheck,
  LaunchGoalPlanTransitionGate,
} from "@/lib/launch-goal-plan";

type Summary = {
  ready: number;
  warning: number;
  blocking: number;
  total: number;
};

export type LaunchGoalTransitionGateCheckSnapshot = {
  id: string;
  title: string;
  status: HealthStatus;
  detail: string;
  action: string;
  evidence: string;
};

export type LaunchGoalTransitionGateSnapshot = {
  status: HealthStatus;
  label: string;
  detail: string;
  action: string;
  canAdvance: boolean;
  currentMilestoneId: LaunchGoalPlanMilestoneId;
  currentMilestoneTitle: string;
  nextMilestoneId?: LaunchGoalPlanMilestoneId;
  nextMilestoneTitle?: string;
  summary: Summary;
  checks: LaunchGoalTransitionGateCheckSnapshot[];
  blockers: LaunchGoalTransitionGateCheckSnapshot[];
  warnings: LaunchGoalTransitionGateCheckSnapshot[];
};

function snapshotCheck(
  check: LaunchGoalPlanTransitionCheck,
): LaunchGoalTransitionGateCheckSnapshot {
  return {
    id: check.id,
    title: check.title,
    status: check.status,
    detail: check.detail,
    action: check.action,
    evidence: check.evidence,
  };
}

export function snapshotLaunchGoalTransitionGate(
  gate: LaunchGoalPlanTransitionGate,
): LaunchGoalTransitionGateSnapshot {
  return {
    status: gate.status,
    label: gate.label,
    detail: gate.detail,
    action: gate.action,
    canAdvance: gate.canAdvance,
    currentMilestoneId: gate.currentMilestoneId,
    currentMilestoneTitle: gate.currentMilestoneTitle,
    nextMilestoneId: gate.nextMilestoneId,
    nextMilestoneTitle: gate.nextMilestoneTitle,
    summary: gate.summary,
    checks: gate.checks.map(snapshotCheck),
    blockers: gate.blockers.map(snapshotCheck),
    warnings: gate.warnings.map(snapshotCheck),
  };
}

export function createMissingLaunchGoalTransitionGateSnapshot(): LaunchGoalTransitionGateSnapshot {
  return {
    status: "warning",
    label: "旧归档未包含阶段推进门槛",
    detail: "该上线证据创建时还没有归档 30/60/90 阶段推进门槛。",
    action: "重新归档一次上线证据，让阶段推进门槛、canAdvance 和检查项进入证据包。",
    canAdvance: false,
    currentMilestoneId: "start",
    currentMilestoneTitle: "0-14 天：开工闭环",
    nextMilestoneId: "paid_smoke",
    nextMilestoneTitle: "15-30 天：小额真实订单",
    summary: {
      ready: 0,
      warning: 1,
      blocking: 0,
      total: 1,
    },
    checks: [],
    blockers: [],
    warnings: [
      {
        id: "archive_missing_transition_gate",
        title: "上线证据阶段门槛缺失",
        status: "warning",
        detail: "旧归档没有 transitionGate 快照。",
        action: "重新归档上线证据。",
        evidence: "LaunchEvidence.metadata.goalTransitionGate。",
      },
    ],
  };
}
