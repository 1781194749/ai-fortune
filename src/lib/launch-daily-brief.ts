import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  getLaunchDailyActionProgress,
  type LaunchDailyActionProgress,
  type LaunchDailyActionProgressItem,
} from "@/lib/launch-daily-action-progress";
import {
  getLaunchBlockerDashboard,
  type LaunchBlockerDashboard,
  type LaunchBlockerDashboardItem,
} from "@/lib/launch-blocker-dashboard";
import {
  getLaunchGoalPlan,
  type LaunchGoalPlan,
} from "@/lib/launch-goal-plan";
import {
  getLaunchPackage,
  type LaunchPackage,
  type LaunchPackageAction,
} from "@/lib/launch-package";
import {
  getLaunchOfflineActionPack,
  type LaunchOfflineActionPack,
  type LaunchOfflineActionPackTodayAction,
} from "@/lib/launch-offline-action-pack";
import {
  getLaunchProductionGate,
  type LaunchProductionGate,
  type LaunchProductionGateItem,
} from "@/lib/launch-production-gate";
import {
  getLaunchWeeklyFocus,
  type LaunchWeeklyFocus,
  type LaunchWeeklyFocusItem,
} from "@/lib/launch-weekly-focus";

export type LaunchDailyBriefActionSource =
  | "production_gate"
  | "offline_action"
  | "blocker_dashboard"
  | "weekly_focus"
  | "goal_transition"
  | "goal_plan"
  | "evidence";

export type LaunchDailyBriefAction = {
  id: string;
  source: LaunchDailyBriefActionSource;
  sourceLabel: string;
  status: HealthStatus;
  title: string;
  owner: string;
  detail: string;
  action: string;
  evidence: string;
  dueLabel?: string;
  routes?: string[];
  progress?: LaunchDailyActionProgressItem;
};

export type LaunchDailyBrief = {
  generatedAt: string;
  status: HealthStatus;
  label: string;
  detail: string;
  action: string;
  today: string;
  summary: {
    goNoGoBlocking: number;
    workstreamBlocking: number;
    weeklyBlocking: number;
    weeklyUncommitted: number;
    commitmentCoveragePercent: number;
    goalBlocking: number;
    goalProgressSaved: number;
    transitionCanAdvance: boolean;
    transitionBlocking: number;
    transitionWarning: number;
    offlineBlocking: number;
    offlineWarning: number;
    evidenceState: LaunchPackage["summary"]["evidence"]["state"];
    evidenceRefreshReasons: string[];
    todayActionCount: number;
    actionProgressSaved: number;
    actionProgressTodo: number;
    actionProgressInProgress: number;
    actionProgressBlocked: number;
    actionProgressDone: number;
  };
  productionGate: {
    status: HealthStatus;
    label: string;
    releaseReady: boolean;
    stepBlocking: number;
    stepWarning: number;
    checkBlocking: number;
    checkWarning: number;
    action: string;
    primaryActionLabel?: string;
  };
  primaryAction?: LaunchDailyBriefAction;
  todayActions: LaunchDailyBriefAction[];
  evidence: {
    state: LaunchPackage["summary"]["evidence"]["state"];
    label: string;
    latestArchivedAt?: string;
    refreshReasons: string[];
    action: string;
  };
  goalSnapshot: {
    currentMilestoneId: LaunchGoalPlan["currentMilestone"]["id"];
    title: string;
    status: HealthStatus;
    targetDate: string;
    owner: string;
    progressStatus?: NonNullable<LaunchGoalPlan["currentMilestone"]["progress"]>["status"];
    progressNote?: string;
  };
  transitionGate: {
    status: HealthStatus;
    label: string;
    canAdvance: boolean;
    blocking: number;
    warning: number;
    action: string;
    nextMilestoneTitle?: string;
  };
  offlineAction: {
    status: HealthStatus;
    label: string;
    blocking: number;
    warning: number;
    current: LaunchOfflineActionPackTodayAction;
  };
  copyText: string;
};

type LaunchDailyBriefInput = {
  launchPackage?: LaunchPackage;
  productionGate?: LaunchProductionGate;
  blockerDashboard?: LaunchBlockerDashboard;
  goalPlan?: LaunchGoalPlan;
  weeklyFocus?: LaunchWeeklyFocus;
  offlineActionPack?: LaunchOfflineActionPack;
  actionProgress?: LaunchDailyActionProgress;
  now?: Date;
};

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function statusRank(status: HealthStatus) {
  if (status === "blocking") {
    return 0;
  }

  if (status === "warning") {
    return 1;
  }

  return 2;
}

function progressStatusLabel(
  status: NonNullable<LaunchGoalPlan["currentMilestone"]["progress"]>["status"] | undefined,
) {
  if (status === "in_progress") {
    return "处理中";
  }

  if (status === "blocked") {
    return "卡住";
  }

  if (status === "done") {
    return "已完成";
  }

  return "未开始";
}

function actionProgressLabel(status: LaunchDailyActionProgressItem["status"] | undefined) {
  if (status === "in_progress") {
    return "处理中";
  }

  if (status === "blocked") {
    return "卡住";
  }

  if (status === "done") {
    return "已完成";
  }

  return "未开始";
}

function shortTime(value: string | undefined) {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 16).replace("T", " ");
  }

  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function actionFromBlocker(item: LaunchBlockerDashboardItem): LaunchDailyBriefAction {
  return {
    id: `blocker:${item.id}`,
    source: "blocker_dashboard",
    sourceLabel: item.source,
    status: item.status,
    title: item.title,
    owner: item.owner,
    detail: item.source,
    action: item.action,
    evidence: item.evidence,
    routes: item.routes,
  };
}

function actionFromProductionGate(item: LaunchProductionGateItem): LaunchDailyBriefAction {
  return {
    id: `production_gate:${item.id}`,
    source: "production_gate",
    sourceLabel: "生产总门禁",
    status: item.status,
    title: item.label,
    owner: "技术 / 运营",
    detail: item.detail,
    action: item.action,
    evidence: item.evidence ?? "生产上线总门禁检查输出与上线证据归档。",
  };
}

function actionFromOfflineActionPack(
  offlineActionPack: LaunchOfflineActionPack,
): LaunchDailyBriefAction | undefined {
  if (offlineActionPack.currentAction.status === "ready") {
    return undefined;
  }

  return {
    id: `offline_action:${offlineActionPack.currentAction.id}`,
    source: "offline_action",
    sourceLabel: "线下办理",
    status: offlineActionPack.currentAction.status,
    title: offlineActionPack.currentAction.title,
    owner: offlineActionPack.currentAction.owner,
    detail: offlineActionPack.currentAction.phase,
    action: offlineActionPack.currentAction.action,
    evidence: offlineActionPack.currentAction.evidence,
    dueLabel: offlineActionPack.currentAction.dueLabel,
    routes: ["/admin/health#launch-offline-action-pack"],
  };
}

function actionFromWeekly(item: LaunchWeeklyFocusItem): LaunchDailyBriefAction {
  return {
    id: `weekly:${item.id}`,
    source: "weekly_focus",
    sourceLabel: item.laneTitle,
    status: item.status,
    title: item.title,
    owner: item.owner,
    detail: item.detail,
    action: item.action,
    evidence: item.evidence,
    dueLabel: item.suggestedTargetLabel ?? item.dueLabel,
  };
}

function actionFromPackageEvidence(item: LaunchPackageAction): LaunchDailyBriefAction {
  return {
    id: `evidence:${item.id}`,
    source: "evidence",
    sourceLabel: "上线证据",
    status: item.status,
    title: item.title,
    owner: item.owner ?? "运营 / 技术",
    detail: item.detail,
    action: item.action,
    evidence: item.evidence ?? "UsageLog(feature=launch_evidence) 中保留最新归档记录。",
  };
}

function actionFromGoal(goalPlan: LaunchGoalPlan): LaunchDailyBriefAction {
  const milestone = goalPlan.currentMilestone;

  return {
    id: `goal:${milestone.id}`,
    source: "goal_plan",
    sourceLabel: "30/60/90 目标",
    status: milestone.status,
    title: milestone.title,
    owner: milestone.owner,
    detail: milestone.objective,
    action: milestone.nextActions[0] ?? goalPlan.action,
    evidence: milestone.evidence[0] ?? milestone.exitCriteria[0] ?? "当前阶段验收证据。",
    dueLabel: `目标日 ${milestone.targetDate}`,
  };
}

function actionFromGoalTransitionGate(goalPlan: LaunchGoalPlan): LaunchDailyBriefAction | undefined {
  const gate = goalPlan.transitionGate;

  if (gate.canAdvance) {
    return undefined;
  }

  const issueEvidence = [...gate.blockers, ...gate.warnings]
    .map((item) => item.evidence)
    .filter(Boolean);

  return {
    id: `goal_transition:${gate.currentMilestoneId}`,
    source: "goal_transition",
    sourceLabel: "阶段推进门槛",
    status: gate.status,
    title: gate.label,
    owner: goalPlan.currentMilestone.owner,
    detail: gate.detail,
    action: gate.action,
    evidence:
      issueEvidence[0] ??
      "30/60/90 天目标规划 transitionGate、目标推进快填记录和上线证据归档。",
    dueLabel: gate.nextMilestoneTitle ? `下一阶段 ${gate.nextMilestoneTitle}` : undefined,
    routes: ["/admin/health#launch-goal-plan"],
  };
}

function uniqueActions(actions: LaunchDailyBriefAction[]) {
  const seen = new Set<string>();

  return actions.filter((item) => {
    const key = `${item.source}:${item.title}:${item.action}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function sortActions(actions: LaunchDailyBriefAction[]) {
  const sourceRank: Record<LaunchDailyBriefActionSource, number> = {
    production_gate: 0,
    offline_action: 1,
    blocker_dashboard: 2,
    goal_transition: 3,
    evidence: 4,
    weekly_focus: 5,
    goal_plan: 6,
  };

  return [...actions].sort(
    (a, b) =>
      statusRank(a.status) - statusRank(b.status) ||
      sourceRank[a.source] - sourceRank[b.source] ||
      a.title.localeCompare(b.title, "zh-CN"),
  );
}

function evidenceAction(launchPackage: LaunchPackage) {
  const evidence = launchPackage.summary.evidence;

  if (evidence.state === "available") {
    return "保持当前归档；目标推进、支付验收、成本样本或生产变量变化后重新归档。";
  }

  return launchPackage.missingEvidence[0]?.action ?? "在后台健康页归档当前上线证据。";
}

function briefStatus(input: {
  launchPackage: LaunchPackage;
  productionGate: LaunchProductionGate;
  blockerDashboard: LaunchBlockerDashboard;
  weeklyFocus: LaunchWeeklyFocus;
  goalPlan: LaunchGoalPlan;
  offlineActionPack: LaunchOfflineActionPack;
}) {
  const statuses = [
    input.productionGate.status,
    input.launchPackage.status,
    input.blockerDashboard.status,
    input.weeklyFocus.status,
    input.goalPlan.status,
    input.offlineActionPack.status,
  ];

  if (statuses.includes("blocking")) {
    return "blocking" as const;
  }

  if (statuses.includes("warning")) {
    return "warning" as const;
  }

  return "ready" as const;
}

function briefCopy(input: {
  status: HealthStatus;
  summary: LaunchDailyBrief["summary"];
  primaryAction?: LaunchDailyBriefAction;
  productionGate: LaunchDailyBrief["productionGate"];
  offlineAction: LaunchDailyBrief["offlineAction"];
  evidence: LaunchDailyBrief["evidence"];
  goalSnapshot: LaunchDailyBrief["goalSnapshot"];
}) {
  if (input.status === "ready") {
    return {
      label: "今日推进可进入灰度复核",
      detail: "生产总门禁、上线包、目标规划和本周推进均无阻断，适合保留证据快照后进入小额真实订单或放量复盘。",
      action: "归档当前上线证据，并按灰度放量计划继续验证真实收费链路。",
    };
  }

  const primary = input.primaryAction
    ? `今日先办「${input.primaryAction.sourceLabel} / ${input.primaryAction.title}」。`
    : "今日先补齐上线阻断和目标推进记录。";

  if (input.status === "warning") {
    return {
      label: "今日推进需复核",
      detail: `${primary}线下办理 ${input.offlineAction.warning} 个事项需复核，生产门禁 ${input.productionGate.stepWarning} 个步骤需复核，承诺覆盖率 ${input.summary.commitmentCoveragePercent}%，证据状态：${input.evidence.label}。`,
      action: input.primaryAction?.action ?? "复核待处理工作线，并刷新上线证据归档。",
    };
  }

  return {
    label: "今日推进仍有上线阻断",
    detail: `${primary}线下办理 ${input.offlineAction.blocking} 个事项阻断，生产门禁 ${input.productionGate.stepBlocking} 个步骤阻断、细分检查 ${input.productionGate.checkBlocking} 个阻断；当前 ${input.summary.workstreamBlocking} 条工作线阻断、${input.summary.weeklyUncommitted} 个本周任务未承诺；当前目标阶段为 ${input.goalSnapshot.title}。`,
    action: input.primaryAction?.action ?? "先处理上线阻断总控台中的第一项动作。",
  };
}

function buildCopyText(input: {
  generatedAt: string;
  label: string;
  status: HealthStatus;
  detail: string;
  action: string;
  today: string;
  summary: LaunchDailyBrief["summary"];
  goalSnapshot: LaunchDailyBrief["goalSnapshot"];
  transitionGate: LaunchDailyBrief["transitionGate"];
  productionGate: LaunchDailyBrief["productionGate"];
  offlineAction: LaunchDailyBrief["offlineAction"];
  evidence: LaunchDailyBrief["evidence"];
  todayActions: LaunchDailyBriefAction[];
}) {
  const actionLines =
    input.todayActions.length > 0
      ? input.todayActions.map(
          (item, index) =>
            `${index + 1}. [${item.status}] ${item.sourceLabel} / ${item.title} / ${item.owner}${item.dueLabel ? ` / ${item.dueLabel}` : ""}：${item.action} 证据：${item.progress?.evidenceNote ?? item.evidence} 执行：${actionProgressLabel(item.progress?.status)}${item.progress?.note ? `；${item.progress.note}` : ""}`,
        )
      : ["- 当前没有待处理动作。"];
  const evidenceLine =
    input.evidence.refreshReasons.length > 0
      ? `${input.evidence.label}，需刷新：${input.evidence.refreshReasons.join("、")}`
      : input.evidence.label;

  return [
    "玄机 AI 今日目标推进日报",
    `生成时间：${shortTime(input.generatedAt)}`,
    `当前日期：${input.today}`,
    `总体状态：${input.label} (${input.status})`,
    `今日判断：${input.detail}`,
    `今日动作：${input.action}`,
    "",
    "关键数字：",
    `- Go/No-Go 阻断：${input.summary.goNoGoBlocking}`,
    `- 生产总门禁：releaseReady=${input.productionGate.releaseReady ? "yes" : "no"}，门禁步骤 ${input.productionGate.stepBlocking} blocking / ${input.productionGate.stepWarning} warning，细分检查 ${input.productionGate.checkBlocking} blocking / ${input.productionGate.checkWarning} warning`,
    `- 阻断工作线：${input.summary.workstreamBlocking}`,
    `- 本周阻断 / 未承诺：${input.summary.weeklyBlocking} / ${input.summary.weeklyUncommitted}`,
    `- 承诺覆盖：${input.summary.commitmentCoveragePercent}%`,
    `- 目标推进已保存：${input.summary.goalProgressSaved}`,
    `- 阶段推进门槛：canAdvance=${input.transitionGate.canAdvance ? "yes" : "no"}，blocking=${input.transitionGate.blocking}，warning=${input.transitionGate.warning}`,
    `- 线下办理当前动作：${input.offlineAction.current.title}；blocking=${input.offlineAction.blocking}，warning=${input.offlineAction.warning}`,
    `- 今日动作执行记录：${input.summary.actionProgressSaved} / 已完成 ${input.summary.actionProgressDone} / 卡住 ${input.summary.actionProgressBlocked}`,
    "",
    "当前目标：",
    `- ${input.goalSnapshot.title} / ${input.goalSnapshot.owner} / 目标日 ${input.goalSnapshot.targetDate}`,
    `- 推进状态：${progressStatusLabel(input.goalSnapshot.progressStatus)}${input.goalSnapshot.progressNote ? `；${input.goalSnapshot.progressNote}` : ""}`,
    `- 阶段门槛：${input.transitionGate.label}；${input.transitionGate.action}`,
    "",
    "证据状态：",
    `- ${evidenceLine}；${input.evidence.action}`,
    "",
    "今日优先动作：",
    ...actionLines,
  ].join("\n");
}

export async function getLaunchDailyBrief(input?: LaunchDailyBriefInput) {
  const [
    launchPackage,
    productionGate,
    blockerDashboard,
    goalPlan,
    weeklyFocus,
    offlineActionPack,
    actionProgress,
  ] = await Promise.all([
    input?.launchPackage ?? getLaunchPackage(),
    input?.productionGate ?? getLaunchProductionGate(),
    input?.blockerDashboard ?? getLaunchBlockerDashboard(),
    input?.goalPlan ?? getLaunchGoalPlan(),
    input?.weeklyFocus ?? getLaunchWeeklyFocus({ now: input?.now }),
    input?.offlineActionPack ?? getLaunchOfflineActionPack(),
    input?.actionProgress ?? getLaunchDailyActionProgress(),
  ]);
  const generatedAt = new Date().toISOString();
  const today = dateKey(input?.now ?? new Date());
  const evidence = {
    state: launchPackage.summary.evidence.state,
    label: launchPackage.summary.evidence.label,
    latestArchivedAt: launchPackage.summary.evidence.latestArchivedAt,
    refreshReasons: launchPackage.summary.evidence.refreshReasons,
    action: evidenceAction(launchPackage),
  } satisfies LaunchDailyBrief["evidence"];
  const goalSnapshot = {
    currentMilestoneId: goalPlan.currentMilestone.id,
    title: goalPlan.currentMilestone.title,
    status: goalPlan.currentMilestone.status,
    targetDate: goalPlan.currentMilestone.targetDate,
    owner: goalPlan.currentMilestone.owner,
    progressStatus: goalPlan.currentMilestone.progress?.status,
    progressNote:
      goalPlan.currentMilestone.progress?.evidenceNote ??
      goalPlan.currentMilestone.progress?.note,
  } satisfies LaunchDailyBrief["goalSnapshot"];
  const transitionGate = {
    status: goalPlan.transitionGate.status,
    label: goalPlan.transitionGate.label,
    canAdvance: goalPlan.transitionGate.canAdvance,
    blocking: goalPlan.transitionGate.summary.blocking,
    warning: goalPlan.transitionGate.summary.warning,
    action: goalPlan.transitionGate.action,
    nextMilestoneTitle: goalPlan.transitionGate.nextMilestoneTitle,
  } satisfies LaunchDailyBrief["transitionGate"];
  const productionGateSnapshot = {
    status: productionGate.status,
    label: productionGate.label,
    releaseReady: productionGate.releaseReady,
    stepBlocking: productionGate.summary.blocking,
    stepWarning: productionGate.summary.warning,
    checkBlocking: productionGate.checkSummary.blocking,
    checkWarning: productionGate.checkSummary.warning,
    action: productionGate.action,
    primaryActionLabel: productionGate.nextActions[0]?.label,
  } satisfies LaunchDailyBrief["productionGate"];
  const offlineAction = {
    status: offlineActionPack.status,
    label: offlineActionPack.label,
    blocking: offlineActionPack.summary.blocking,
    warning: offlineActionPack.summary.warning,
    current: offlineActionPack.currentAction,
  } satisfies LaunchDailyBrief["offlineAction"];
  const productionGateActions = productionGate.nextActions.map(actionFromProductionGate);
  const offlineActionPackAction = actionFromOfflineActionPack(offlineActionPack);
  const evidenceActions = launchPackage.missingEvidence.map(actionFromPackageEvidence);
  const blockerActions = blockerDashboard.nextActions
    .filter((item) => !item.id.startsWith("production_gate:"))
    .map(actionFromBlocker);
  const urgentWeeklyActions = weeklyFocus.focusItems
    .filter(
      (item) =>
        item.status !== "ready" &&
        (item.dueState === "overdue" ||
          item.dueState === "today" ||
          item.dueState === "unscheduled" ||
          !item.commitment?.targetDate),
    )
    .slice(0, 4)
    .map(actionFromWeekly);
  const goalAction = actionFromGoal(goalPlan);
  const goalTransitionAction = actionFromGoalTransitionGate(goalPlan);
  const sortedCandidateActions = sortActions(
    uniqueActions([
      ...productionGateActions,
      ...(offlineActionPackAction ? [offlineActionPackAction] : []),
      ...blockerActions,
      ...evidenceActions,
      ...(goalTransitionAction ? [goalTransitionAction] : []),
      ...urgentWeeklyActions,
      goalAction,
    ]),
  );
  const pinnedActions = [productionGateActions[0], offlineActionPackAction, goalTransitionAction].filter(
    (item): item is LaunchDailyBriefAction => Boolean(item),
  );
  const rawTodayActions = uniqueActions([...pinnedActions, ...sortedCandidateActions]).slice(0, 8);
  const todayActions = rawTodayActions.map((item) => ({
    ...item,
    progress: actionProgress.itemByActionId.get(item.id),
  }));
  const summary = {
    goNoGoBlocking: launchPackage.summary.goNoGo.blocking,
    workstreamBlocking: blockerDashboard.summary.blocking,
    weeklyBlocking: weeklyFocus.summary.blocking,
    weeklyUncommitted: weeklyFocus.summary.uncommitted,
    commitmentCoveragePercent: weeklyFocus.summary.commitmentCoveragePercent,
    goalBlocking: goalPlan.summary.blocking,
    goalProgressSaved: goalPlan.milestones.filter((item) => Boolean(item.progress)).length,
    transitionCanAdvance: goalPlan.transitionGate.canAdvance,
    transitionBlocking: goalPlan.transitionGate.summary.blocking,
    transitionWarning: goalPlan.transitionGate.summary.warning,
    offlineBlocking: offlineActionPack.summary.blocking,
    offlineWarning: offlineActionPack.summary.warning,
    evidenceState: evidence.state,
    evidenceRefreshReasons: evidence.refreshReasons,
    todayActionCount: todayActions.length,
    actionProgressSaved: todayActions.filter((item) => Boolean(item.progress)).length,
    actionProgressTodo: todayActions.filter((item) => item.progress?.status === "todo").length,
    actionProgressInProgress: todayActions.filter(
      (item) => item.progress?.status === "in_progress",
    ).length,
    actionProgressBlocked: todayActions.filter((item) => item.progress?.status === "blocked")
      .length,
    actionProgressDone: todayActions.filter((item) => item.progress?.status === "done").length,
  } satisfies LaunchDailyBrief["summary"];
  const status = briefStatus({
    launchPackage,
    productionGate,
    blockerDashboard,
    weeklyFocus,
    goalPlan,
    offlineActionPack,
  });
  const primaryAction = todayActions[0];
  const copy = briefCopy({
    status,
    summary,
    primaryAction,
    productionGate: productionGateSnapshot,
    offlineAction,
    evidence,
    goalSnapshot,
  });
  const copyText = buildCopyText({
    generatedAt,
    status,
    today,
    summary,
    productionGate: productionGateSnapshot,
    offlineAction,
    evidence,
    goalSnapshot,
    transitionGate,
    todayActions,
    ...copy,
  });

  return {
    generatedAt,
    status,
    ...copy,
    today,
    summary,
    productionGate: productionGateSnapshot,
    primaryAction,
    todayActions,
    evidence,
    goalSnapshot,
    transitionGate,
    offlineAction,
    copyText,
  } satisfies LaunchDailyBrief;
}
