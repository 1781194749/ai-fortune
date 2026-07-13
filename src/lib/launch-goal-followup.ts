import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  launchDailyActionProgressEvent,
  launchDailyActionProgressFeature,
} from "@/lib/launch-daily-action-progress";
import { getLaunchDailyBrief, type LaunchDailyBrief } from "@/lib/launch-daily-brief";
import { launchEvidenceFeature } from "@/lib/launch-evidence";
import {
  getLaunchEvidenceActionCenter,
  type LaunchEvidenceActionCenter,
} from "@/lib/launch-evidence-action-center";
import {
  launchGoalProgressEvent,
  launchGoalProgressFeature,
} from "@/lib/launch-goal-progress";
import { getLaunchGoalPlan, type LaunchGoalPlan } from "@/lib/launch-goal-plan";
import { launchWeeklyCommitmentsFeature } from "@/lib/launch-weekly-commitments";
import { getLaunchWeeklyFocus, type LaunchWeeklyFocus } from "@/lib/launch-weekly-focus";

export type LaunchGoalFollowupItem = {
  id: string;
  title: string;
  status: HealthStatus;
  detail: string;
  action: string;
  evidence: string;
};

export type LaunchGoalFollowupFillIn = {
  id: string;
  title: string;
  status: HealthStatus;
  sectionLabel: string;
  sectionId: string;
  route: string;
  api: {
    method: "PATCH" | "POST";
    path: string;
  };
  action: string;
  payloadHint: string;
  payloadTemplate: Record<string, string>;
  curlCommand: string;
  persistence: {
    store: "UsageLog";
    feature: string;
    event: string;
    model: string;
    purpose: string;
  };
  evidence: string;
  sourceItemIds: string[];
};

export type LaunchGoalFollowup = {
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
    currentMilestoneId: LaunchGoalPlan["currentMilestone"]["id"];
    actionProgressSaved: number;
    actionProgressDone: number;
    actionProgressBlocked: number;
    weeklyCommitmentCoveragePercent: number;
    weeklyCommitmentInProgress: number;
    weeklyCommitmentBlocked: number;
    weeklyCommitmentDone: number;
    transitionCanAdvance: boolean;
    transitionBlocking: number;
    transitionWarning: number;
    offlineActionBlocking: number;
    offlineActionWarning: number;
    offlineActionProgressSaved: number;
    evidenceActionBlocking: number;
    evidenceActionWarning: number;
    evidenceActionCoverageScore: number;
  };
  currentMilestone: {
    id: LaunchGoalPlan["currentMilestone"]["id"];
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
    detail: string;
    action: string;
    canAdvance: boolean;
    currentMilestoneTitle: string;
    nextMilestoneTitle?: string;
    blocking: number;
    warning: number;
  };
  evidenceActionCenter: {
    status: HealthStatus;
    label: string;
    action: string;
    coverageScore: number;
    blocking: number;
    warning: number;
    buckets: number;
    primaryItemTitle?: string;
    primaryItemAction?: string;
    primaryItemEvidence?: string;
  };
  items: LaunchGoalFollowupItem[];
  fillIns: LaunchGoalFollowupFillIn[];
  nextActions: string[];
  copyText: string;
};

type LaunchGoalFollowupInput = {
  goalPlan?: LaunchGoalPlan;
  dailyBrief?: LaunchDailyBrief;
  weeklyFocus?: LaunchWeeklyFocus;
  evidenceActionCenter?: LaunchEvidenceActionCenter;
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

function worstStatus(statuses: HealthStatus[]) {
  return [...statuses].sort((a, b) => statusRank(a) - statusRank(b))[0] ?? "ready";
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

function evidenceStateLabel(state: LaunchDailyBrief["evidence"]["state"]) {
  if (state === "available") {
    return "已归档";
  }

  if (state === "needs_refresh") {
    return "需刷新";
  }

  return "缺归档";
}

function dailyActionProgressLabel(
  status: NonNullable<LaunchDailyBrief["todayActions"][number]["progress"]>["status"] | undefined,
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

  return "未记录";
}

function buildItems(input: {
  goalPlan: LaunchGoalPlan;
  dailyBrief: LaunchDailyBrief;
  weeklyFocus: LaunchWeeklyFocus;
  evidenceActionCenter: LaunchEvidenceActionCenter;
}) {
  const progress = input.goalPlan.currentMilestone.progress;
  const currentOfflineAction = input.dailyBrief.offlineAction.current;
  const currentOfflineActionId = `offline_action:${currentOfflineAction.id}`;
  const offlineActionProgress = input.dailyBrief.todayActions.find(
    (action) => action.id === currentOfflineActionId || action.source === "offline_action",
  )?.progress;
  const currentActionProgressStatus =
    input.dailyBrief.summary.actionProgressBlocked > 0
      ? "blocking"
      : input.dailyBrief.summary.actionProgressSaved < input.dailyBrief.summary.todayActionCount
        ? "warning"
        : "ready";
  const offlineActionStatus =
    currentOfflineAction.status === "ready"
      ? "ready"
      : offlineActionProgress?.status === "done"
        ? "warning"
        : currentOfflineAction.status;
  const weeklyCommitmentStatus =
    input.weeklyFocus.summary.blocking > 0 || input.weeklyFocus.summary.commitmentBlocked > 0
      ? "blocking"
      : input.weeklyFocus.summary.commitmentCoveragePercent < 100 ||
          input.weeklyFocus.summary.uncommitted > 0
        ? "warning"
        : "ready";
  const evidenceStatus =
    input.dailyBrief.evidence.state === "available"
      ? "ready"
      : input.dailyBrief.evidence.state === "needs_refresh"
        ? "warning"
        : "warning";
  const currentGoalStatus =
    input.goalPlan.currentMilestone.status === "ready" && progress?.status === "done"
      ? "ready"
      : input.goalPlan.currentMilestone.status === "blocking" || progress?.status === "blocked"
        ? "blocking"
        : "warning";
  const primaryEvidenceItem = input.evidenceActionCenter.nextItems[0];

  return [
    {
      id: "current_goal",
      title: "当前阶段推进",
      status: currentGoalStatus,
      detail: `${input.goalPlan.currentMilestone.title} / 系统状态 ${input.goalPlan.currentMilestone.status} / 人工推进 ${progressStatusLabel(progress?.status)}。`,
      action:
        progress?.status === "done"
          ? "继续观察系统 Go / No-Go，若外部事项或证据变化则刷新目标记录。"
          : input.goalPlan.currentMilestone.nextActions[0] ??
            "在目标推进快填中保存当前阶段负责人、目标日和证据备注。",
      evidence: "UsageLog(feature=launch_goal_progress) 与当前阶段验收证据。",
    },
    {
      id: "today_actions",
      title: "今日动作执行",
      status: currentActionProgressStatus,
      detail: `${input.dailyBrief.summary.todayActionCount} 个今日动作，已记录 ${input.dailyBrief.summary.actionProgressSaved} 个，已完成 ${input.dailyBrief.summary.actionProgressDone} 个，卡住 ${input.dailyBrief.summary.actionProgressBlocked} 个。`,
      action:
        currentActionProgressStatus === "ready"
          ? "保留今日动作执行记录，完成阻断后刷新上线证据归档。"
          : "在今日动作执行快填中补齐优先动作的状态、负责人、证据备注和推进备注。",
      evidence: "UsageLog(feature=launch_daily_action_progress) 今日动作执行记录。",
    },
    {
      id: "offline_action",
      title: "线下办理当前动作",
      status: offlineActionStatus,
      detail: `${currentOfflineAction.title} / ${currentOfflineAction.phase} / ${currentOfflineAction.owner} / 目标日 ${currentOfflineAction.dueLabel}；执行记录 ${dailyActionProgressLabel(offlineActionProgress?.status)}。`,
      action:
        currentOfflineAction.status === "ready"
          ? "保留线下办理证据，进入真实支付小额订单和最终上线证据归档。"
          : offlineActionProgress?.status === "done"
            ? "把已完成线下办理的回执、截图、变量或审核结果同步到外部办理材料，并刷新上线证据归档。"
            : "在今日动作执行快填中记录线下办理当前动作的状态、负责人、证据备注和推进备注。",
      evidence:
        "UsageLog(feature=launch_daily_action_progress) offline_action 记录、平台回执、配置截图与上线证据归档。",
    },
    {
      id: "weekly_commitments",
      title: "本周承诺覆盖",
      status: weeklyCommitmentStatus,
      detail: `承诺覆盖 ${input.weeklyFocus.summary.commitmentCoveragePercent}%，未承诺 ${input.weeklyFocus.summary.uncommitted} 个，处理中 ${input.weeklyFocus.summary.commitmentInProgress} 个，卡住 ${input.weeklyFocus.summary.commitmentBlocked} 个，已完成 ${input.weeklyFocus.summary.commitmentDone} 个。`,
      action:
        weeklyCommitmentStatus === "ready"
          ? "保持本周任务按负责人推进，变化后同步今日动作和目标记录。"
          : "在本周推进看板补目标日期、负责人和承诺状态，让今日动作能落到周任务。",
      evidence: "UsageLog(feature=launch_weekly_commitments) 本周承诺记录。",
    },
    {
      id: "evidence_action_center",
      title: "证据行动中心",
      status: input.evidenceActionCenter.status,
      detail: `补证覆盖 ${input.evidenceActionCenter.summary.evidenceCoverageScore}%，${input.evidenceActionCenter.summary.blocking} 个阻断、${input.evidenceActionCenter.summary.warning} 个需复核；优先项 ${primaryEvidenceItem?.title ?? "暂无"}。`,
      action:
        input.evidenceActionCenter.status === "ready"
          ? "保留最终证据包，进入小额真实订单或放量复盘。"
          : primaryEvidenceItem
            ? `先补「${primaryEvidenceItem.title}」：${primaryEvidenceItem.action}`
            : input.evidenceActionCenter.action,
      evidence:
        primaryEvidenceItem?.evidence ??
        "上线证据行动中心、证据缺口清单和 UsageLog(feature=launch_evidence) 最新归档。",
    },
    {
      id: "evidence_archive",
      title: "证据归档状态",
      status: evidenceStatus,
      detail:
        input.dailyBrief.evidence.refreshReasons.length > 0
          ? `${evidenceStateLabel(input.dailyBrief.evidence.state)}：${input.dailyBrief.evidence.refreshReasons.join("、")}。`
          : evidenceStateLabel(input.dailyBrief.evidence.state),
      action: input.dailyBrief.evidence.action,
      evidence: "UsageLog(feature=launch_evidence) 最新上线证据归档。",
    },
    {
      id: "next_milestone",
      title: "后续阶段衔接",
      status: input.goalPlan.transitionGate.status,
      detail: `${input.goalPlan.transitionGate.label}；门槛 ${input.goalPlan.transitionGate.summary.blocking} 个阻断、${input.goalPlan.transitionGate.summary.warning} 个需复核。`,
      action:
        input.goalPlan.transitionGate.canAdvance
          ? "进入下一阶段前，同步更新目标推进状态和上线证据归档。"
          : input.goalPlan.transitionGate.action,
      evidence: "30/60/90 天目标规划 transitionGate、阶段快填记录与灰度阶段退出证据。",
    },
  ] satisfies LaunchGoalFollowupItem[];
}

function summarize(items: LaunchGoalFollowupItem[], input: {
  goalPlan: LaunchGoalPlan;
  dailyBrief: LaunchDailyBrief;
  weeklyFocus: LaunchWeeklyFocus;
  evidenceActionCenter: LaunchEvidenceActionCenter;
}) {
  return {
    ready: items.filter((item) => item.status === "ready").length,
    warning: items.filter((item) => item.status === "warning").length,
    blocking: items.filter((item) => item.status === "blocking").length,
    total: items.length,
    currentMilestoneId: input.goalPlan.currentMilestone.id,
    actionProgressSaved: input.dailyBrief.summary.actionProgressSaved,
    actionProgressDone: input.dailyBrief.summary.actionProgressDone,
    actionProgressBlocked: input.dailyBrief.summary.actionProgressBlocked,
    weeklyCommitmentCoveragePercent: input.weeklyFocus.summary.commitmentCoveragePercent,
    weeklyCommitmentInProgress: input.weeklyFocus.summary.commitmentInProgress,
    weeklyCommitmentBlocked: input.weeklyFocus.summary.commitmentBlocked,
    weeklyCommitmentDone: input.weeklyFocus.summary.commitmentDone,
    transitionCanAdvance: input.goalPlan.transitionGate.canAdvance,
    transitionBlocking: input.goalPlan.transitionGate.summary.blocking,
    transitionWarning: input.goalPlan.transitionGate.summary.warning,
    offlineActionBlocking: input.dailyBrief.summary.offlineBlocking,
    offlineActionWarning: input.dailyBrief.summary.offlineWarning,
    offlineActionProgressSaved: input.dailyBrief.todayActions.some(
      (action) => action.source === "offline_action" && Boolean(action.progress),
    )
      ? 1
      : 0,
    evidenceActionBlocking: input.evidenceActionCenter.summary.blocking,
    evidenceActionWarning: input.evidenceActionCenter.summary.warning,
    evidenceActionCoverageScore: input.evidenceActionCenter.summary.evidenceCoverageScore,
  };
}

type LaunchGoalFollowupFillInInput = Omit<LaunchGoalFollowupFillIn, "curlCommand">;

function shellSingleQuote(value: string) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function buildCurlCommand(item: Pick<LaunchGoalFollowupFillIn, "api" | "payloadTemplate">) {
  const body = JSON.stringify(item.payloadTemplate);

  return [
    `curl -X ${item.api.method} "https://<your-domain>${item.api.path}?token=<admin-token>"`,
    "  -H 'Content-Type: application/json'",
    `  -d ${shellSingleQuote(body)}`,
  ].join(" \\\n");
}

function fillIn(item: LaunchGoalFollowupFillInInput): LaunchGoalFollowupFillIn {
  return {
    ...item,
    curlCommand: buildCurlCommand(item),
  };
}

function buildFillIns(input: {
  items: LaunchGoalFollowupItem[];
  goalPlan: LaunchGoalPlan;
  dailyBrief: LaunchDailyBrief;
  weeklyFocus: LaunchWeeklyFocus;
  evidenceActionCenter: LaunchEvidenceActionCenter;
}) {
  return input.items
    .filter((item) => item.status !== "ready")
    .map((item) => {
      if (item.id === "current_goal") {
        return fillIn({
          id: "fill_current_goal",
          title: "补当前阶段推进记录",
          status: item.status,
          sectionLabel: "30/60/90 天目标规划",
          sectionId: "launch-goal-plan",
          route: "/admin/health#launch-goal-plan",
          api: {
            method: "PATCH",
            path: "/api/admin/launch/goal-plan",
          },
          action: "在目标推进快填中保存当前阶段目标日、负责人、推进状态和证据备注。",
          payloadHint: `milestoneId=${input.goalPlan.currentMilestone.id}，status 建议按真实推进填写为 in_progress、blocked 或 done。`,
          payloadTemplate: {
            milestoneId: input.goalPlan.currentMilestone.id,
            status:
              item.status === "blocking"
                ? "blocked"
                : input.goalPlan.currentMilestone.progress?.status ?? "in_progress",
            targetDate: input.goalPlan.currentMilestone.targetDate,
            owner: input.goalPlan.currentMilestone.owner,
            evidenceNote: "填写当前阶段证据链接、截图编号、回执或验收摘要",
            note: item.action,
          },
          persistence: {
            store: "UsageLog",
            feature: launchGoalProgressFeature,
            event: launchGoalProgressEvent,
            model: "launch-goal-progress",
            purpose: "保存当前阶段目标日、负责人、推进状态和证据备注。",
          },
          evidence: "UsageLog(feature=launch_goal_progress) 与当前阶段验收证据。",
          sourceItemIds: [input.goalPlan.currentMilestone.id],
        });
      }

      if (item.id === "today_actions") {
        const pendingActionIds = input.dailyBrief.todayActions
          .filter((action) => action.progress?.status !== "done")
          .map((action) => action.id);
        const firstPendingAction = input.dailyBrief.todayActions.find(
          (action) => action.progress?.status !== "done",
        );

        return fillIn({
          id: "fill_today_actions",
          title: "补今日动作执行记录",
          status: item.status,
          sectionLabel: "今日目标推进日报",
          sectionId: "launch-daily-brief",
          route: "/admin/health#launch-daily-brief",
          api: {
            method: "PATCH",
            path: "/api/admin/launch/daily-brief",
          },
          action: "在今日动作执行快填中逐项保存状态、负责人、证据备注和推进备注。",
          payloadHint: "actionId 使用今日优先动作 id，status 按实际执行填写。",
          payloadTemplate: {
            actionId: firstPendingAction?.id ?? "替换为今日优先动作 id",
            status: firstPendingAction?.status === "blocking" ? "blocked" : "in_progress",
            owner: firstPendingAction?.owner ?? "填写负责人",
            evidenceNote: "填写动作证据链接、截图编号、回执或验收摘要",
            note: firstPendingAction?.action ?? item.action,
          },
          persistence: {
            store: "UsageLog",
            feature: launchDailyActionProgressFeature,
            event: launchDailyActionProgressEvent,
            model: "launch-daily-action-progress",
            purpose: "保存今日优先动作状态、负责人、证据备注和推进备注。",
          },
          evidence: "UsageLog(feature=launch_daily_action_progress) 今日动作执行记录。",
          sourceItemIds: pendingActionIds,
        });
      }

      if (item.id === "offline_action") {
        const currentOfflineAction = input.dailyBrief.offlineAction.current;
        const actionId = `offline_action:${currentOfflineAction.id}`;
        const currentDailyAction = input.dailyBrief.todayActions.find(
          (action) => action.id === actionId || action.source === "offline_action",
        );

        return fillIn({
          id: "fill_offline_action",
          title: "补线下办理当前动作记录",
          status: item.status,
          sectionLabel: "今日目标推进日报",
          sectionId: "launch-daily-brief",
          route: "/admin/health#launch-daily-brief",
          api: {
            method: "PATCH",
            path: "/api/admin/launch/daily-brief",
          },
          action: "在今日动作执行快填中保存线下办理当前动作的状态、负责人、证据备注和推进备注。",
          payloadHint: `actionId=${actionId}；status 按真实办理进度填写为 in_progress、blocked 或 done。`,
          payloadTemplate: {
            actionId: actionId,
            status:
              currentDailyAction?.progress?.status ??
              (currentOfflineAction.status === "blocking" ? "blocked" : "in_progress"),
            owner: currentOfflineAction.owner,
            evidenceNote: currentOfflineAction.evidence,
            note: currentOfflineAction.action,
          },
          persistence: {
            store: "UsageLog",
            feature: launchDailyActionProgressFeature,
            event: launchDailyActionProgressEvent,
            model: "launch-daily-action-progress",
            purpose: "保存线下办理当前动作状态、负责人、回执截图或审核备注。",
          },
          evidence:
            "UsageLog(feature=launch_daily_action_progress) offline_action 记录、平台回执、配置截图与上线证据归档。",
          sourceItemIds: [
            actionId,
            currentOfflineAction.id,
            ...currentOfflineAction.envKeys,
          ],
        });
      }

      if (item.id === "weekly_commitments") {
        const gapIds = input.weeklyFocus.commitmentGaps.map((gap) => gap.id);
        const blockedIds = input.weeklyFocus.focusItems
          .filter((focusItem) => focusItem.commitment?.status === "blocked")
          .map((focusItem) => focusItem.id);
        const firstGap =
          input.weeklyFocus.commitmentGaps[0] ??
          input.weeklyFocus.focusItems.find((focusItem) => focusItem.commitment?.status === "blocked");

        return fillIn({
          id: "fill_weekly_commitments",
          title: "补本周任务承诺",
          status: item.status,
          sectionLabel: "本周推进看板",
          sectionId: "launch-weekly-focus",
          route: "/admin/health#launch-weekly-focus",
          api: {
            method: "PATCH",
            path: "/api/admin/launch/weekly-focus",
          },
          action: "在本周承诺表单中补目标日期、负责人、承诺状态和证据备注。",
          payloadHint: "taskId 使用本周重点任务 id；未排期项优先使用 suggestedTargetDate。",
          payloadTemplate: {
            taskId: firstGap?.id ?? "替换为本周重点任务 id",
            status: firstGap?.commitment?.status ?? "in_progress",
            targetDate: firstGap?.suggestedTargetDate ?? firstGap?.dueDate ?? input.weeklyFocus.week.end,
            owner: firstGap?.owner ?? "填写负责人",
            evidenceNote: "填写任务承诺证据、平台回执、截图编号或验收摘要",
            note: firstGap?.action ?? item.action,
          },
          persistence: {
            store: "UsageLog",
            feature: launchWeeklyCommitmentsFeature,
            event: "launch_weekly_commitments_updated",
            model: "launch-weekly-commitments",
            purpose: "保存本周任务目标日期、负责人、承诺状态和证据备注。",
          },
          evidence: "UsageLog(feature=launch_weekly_commitments) 本周承诺记录。",
          sourceItemIds: [...new Set([...gapIds, ...blockedIds])],
        });
      }

      if (item.id === "evidence_action_center") {
        const primaryEvidenceItem = input.evidenceActionCenter.nextItems[0];

        return fillIn({
          id: "fill_evidence_action_center",
          title: "补证据行动中心优先项",
          status: item.status,
          sectionLabel: "证据行动中心",
          sectionId: "launch-evidence-action-center",
          route: "/admin/health#launch-evidence-action-center",
          api: {
            method: "POST",
            path: "/api/admin/launch/evidence",
          },
          action:
            primaryEvidenceItem?.action ??
            "按证据行动中心补齐截图、回执、小额订单、成本样本或后台记录后刷新上线证据归档。",
          payloadHint:
            "先在证据行动中心定位优先补证项；补齐外部截图、回执或后台记录后，用 POST 归档当前上线证据。",
          payloadTemplate: {
            note: primaryEvidenceItem
              ? `补齐证据行动中心优先项：${primaryEvidenceItem.group} / ${primaryEvidenceItem.title}`
              : "补齐证据行动中心优先项后刷新上线证据归档",
          },
          persistence: {
            store: "UsageLog",
            feature: launchEvidenceFeature,
            event: "launch_evidence",
            model: "launch-evidence",
            purpose: "归档补证后的上线证据，沉淀截图、回执、小额订单、成本样本或后台记录复核结果。",
          },
          evidence:
            primaryEvidenceItem?.evidence ??
            "上线证据行动中心、证据缺口清单和 UsageLog(feature=launch_evidence) 最新归档。",
          sourceItemIds: input.evidenceActionCenter.nextItems.slice(0, 6).map((entry) => entry.id),
        });
      }

      if (item.id === "evidence_archive") {
        return fillIn({
          id: "fill_evidence_archive",
          title: "刷新上线证据归档",
          status: item.status,
          sectionLabel: "上线证据归档",
          sectionId: "launch-evidence-archive",
          route: "/admin/health#launch-evidence-archive",
          api: {
            method: "POST",
            path: "/api/admin/launch/evidence",
          },
          action: "在完成生产变量、联调验收、今日动作或目标推进记录后归档当前上线证据。",
          payloadHint: "POST 可附带 note，用于说明本次归档覆盖的变更。",
          payloadTemplate: {
            note:
              input.dailyBrief.evidence.refreshReasons.length > 0
                ? `刷新目标推进证据归档：${input.dailyBrief.evidence.refreshReasons.join("、")}`
                : "刷新目标推进证据归档：补齐今日动作、本周承诺或目标阶段记录后归档",
          },
          persistence: {
            store: "UsageLog",
            feature: launchEvidenceFeature,
            event: "launch_evidence",
            model: "launch-evidence",
            purpose: "归档当前 Go / No-Go、目标推进、今日动作和上线证据摘要。",
          },
          evidence: "UsageLog(feature=launch_evidence) 最新上线证据归档。",
          sourceItemIds: input.dailyBrief.evidence.refreshReasons,
        });
      }

      return fillIn({
        id: "fill_next_milestone",
        title: "补后续阶段衔接",
        status: item.status,
        sectionLabel: "30/60/90 天目标规划",
        sectionId: "launch-goal-plan",
        route: "/admin/health#launch-goal-plan",
        api: {
          method: "PATCH",
          path: "/api/admin/launch/goal-plan",
        },
        action: "复核当前阶段是否具备进入下一阶段条件，并保存阶段推进状态和证据备注。",
        payloadHint: `milestoneId=${input.goalPlan.currentMilestone.id}；transitionGate.canAdvance=${input.goalPlan.transitionGate.canAdvance ? "yes" : "no"}，若阶段仍有阻断，先按当前阶段门槛补齐。`,
        payloadTemplate: {
          milestoneId: input.goalPlan.currentMilestone.id,
          status: input.goalPlan.transitionGate.canAdvance
            ? "done"
            : input.goalPlan.transitionGate.status === "blocking"
              ? "blocked"
              : "in_progress",
          targetDate: input.goalPlan.currentMilestone.targetDate,
          owner: input.goalPlan.currentMilestone.owner,
          evidenceNote: "填写阶段衔接证据、灰度退出条件或下一阶段准备记录",
          note: `${item.action}；${input.goalPlan.transitionGate.detail}`,
        },
        persistence: {
          store: "UsageLog",
          feature: launchGoalProgressFeature,
          event: launchGoalProgressEvent,
          model: "launch-goal-progress",
          purpose: "保存阶段衔接状态、下一阶段准备记录和灰度退出证据。",
        },
        evidence: "30/60/90 天目标规划、阶段快填记录与灰度阶段退出证据。",
        sourceItemIds: input.goalPlan.milestones
          .filter((milestone) => milestone.status !== "ready")
          .map((milestone) => milestone.id),
      });
    });
}

function copyFor(status: HealthStatus, items: LaunchGoalFollowupItem[]) {
  const firstIssue = items.find((item) => item.status !== "ready");

  if (status === "ready") {
    return {
      label: "目标后续推进已闭合",
      detail: "当前阶段、今日动作、本周承诺和上线证据均已形成可追溯记录。",
      action: "保留当前证据快照，并按灰度计划推进下一阶段。",
    };
  }

  if (status === "blocking") {
    return {
      label: "目标后续推进存在阻断",
      detail: firstIssue
        ? `优先处理「${firstIssue.title}」：${firstIssue.detail}`
        : "当前仍有目标推进阻断。",
      action: firstIssue?.action ?? "先处理阻断项，再刷新今日动作和上线证据。",
    };
  }

  return {
    label: "目标后续推进需补记录",
    detail: firstIssue
      ? `先补「${firstIssue.title}」：${firstIssue.detail}`
      : "当前需要补齐目标推进记录或证据归档。",
    action: firstIssue?.action ?? "补齐今日动作、本周承诺和目标阶段证据备注。",
  };
}

function buildCopyText(input: {
  generatedAt: string;
  label: string;
  status: HealthStatus;
  detail: string;
  action: string;
  currentMilestone: LaunchGoalFollowup["currentMilestone"];
  transitionGate: LaunchGoalFollowup["transitionGate"];
  evidenceActionCenter: LaunchGoalFollowup["evidenceActionCenter"];
  items: LaunchGoalFollowupItem[];
  fillIns: LaunchGoalFollowupFillIn[];
  nextActions: string[];
}) {
  const fillInLines =
    input.fillIns.length > 0
      ? input.fillIns.map(
          (item, index) =>
            `${index + 1}. [${item.status}] ${item.sectionLabel} (${item.route})：${item.action} 接口：${item.api.method} ${item.api.path} 请求体：${JSON.stringify(item.payloadTemplate)} 命令：${item.curlCommand} 持久化：${item.persistence.store}(feature=${item.persistence.feature}, event=${item.persistence.event}, model=${item.persistence.model}) 证据：${item.evidence}`,
        )
      : ["- 当前没有需要补齐的操作入口。"];

  return [
    "玄机 AI 目标后续推进复盘",
    `生成时间：${input.generatedAt.slice(0, 16).replace("T", " ")}`,
    `总体状态：${input.label} (${input.status})`,
    `当前阶段：${input.currentMilestone.title} / ${input.currentMilestone.owner} / 目标日 ${input.currentMilestone.targetDate}`,
    `推进状态：${progressStatusLabel(input.currentMilestone.progressStatus)}${input.currentMilestone.progressNote ? `；${input.currentMilestone.progressNote}` : ""}`,
    `阶段推进门槛：${input.transitionGate.label} / canAdvance=${input.transitionGate.canAdvance ? "yes" : "no"} / blocking=${input.transitionGate.blocking} / warning=${input.transitionGate.warning}`,
    `证据行动中心：${input.evidenceActionCenter.label} / coverage=${input.evidenceActionCenter.coverageScore}% / blocking=${input.evidenceActionCenter.blocking} / warning=${input.evidenceActionCenter.warning}`,
    `判断：${input.detail}`,
    `动作：${input.action}`,
    "",
    "检查项：",
    ...input.items.map(
      (item, index) =>
        `${index + 1}. [${item.status}] ${item.title}：${item.detail} 下一步：${item.action} 证据：${item.evidence}`,
    ),
    "",
    "补齐入口：",
    ...fillInLines,
    "",
    "下一步：",
    ...(input.nextActions.length > 0 ? input.nextActions : ["保持当前推进节奏并定期刷新证据。"]),
  ].join("\n");
}

export async function getLaunchGoalFollowup(input?: LaunchGoalFollowupInput) {
  const [goalPlan, dailyBrief, weeklyFocus, evidenceActionCenter] = await Promise.all([
    input?.goalPlan ?? getLaunchGoalPlan(),
    input?.dailyBrief ?? getLaunchDailyBrief(),
    input?.weeklyFocus ?? getLaunchWeeklyFocus(),
    input?.evidenceActionCenter ?? getLaunchEvidenceActionCenter(),
  ]);
  const generatedAt = new Date().toISOString();
  const items = buildItems({ goalPlan, dailyBrief, weeklyFocus, evidenceActionCenter });
  const status = worstStatus(items.map((item) => item.status));
  const summary = summarize(items, { goalPlan, dailyBrief, weeklyFocus, evidenceActionCenter });
  const fillIns = buildFillIns({ items, goalPlan, dailyBrief, weeklyFocus, evidenceActionCenter });
  const copy = copyFor(status, items);
  const currentMilestone = {
    id: goalPlan.currentMilestone.id,
    title: goalPlan.currentMilestone.title,
    status: goalPlan.currentMilestone.status,
    targetDate: goalPlan.currentMilestone.targetDate,
    owner: goalPlan.currentMilestone.owner,
    progressStatus: goalPlan.currentMilestone.progress?.status,
    progressNote:
      goalPlan.currentMilestone.progress?.evidenceNote ??
      goalPlan.currentMilestone.progress?.note,
  } satisfies LaunchGoalFollowup["currentMilestone"];
  const transitionGate = {
    status: goalPlan.transitionGate.status,
    label: goalPlan.transitionGate.label,
    detail: goalPlan.transitionGate.detail,
    action: goalPlan.transitionGate.action,
    canAdvance: goalPlan.transitionGate.canAdvance,
    currentMilestoneTitle: goalPlan.transitionGate.currentMilestoneTitle,
    nextMilestoneTitle: goalPlan.transitionGate.nextMilestoneTitle,
    blocking: goalPlan.transitionGate.summary.blocking,
    warning: goalPlan.transitionGate.summary.warning,
  } satisfies LaunchGoalFollowup["transitionGate"];
  const goalEvidenceActionCenter = {
    status: evidenceActionCenter.status,
    label: evidenceActionCenter.label,
    action: evidenceActionCenter.action,
    coverageScore: evidenceActionCenter.summary.evidenceCoverageScore,
    blocking: evidenceActionCenter.summary.blocking,
    warning: evidenceActionCenter.summary.warning,
    buckets: evidenceActionCenter.summary.buckets,
    primaryItemTitle: evidenceActionCenter.nextItems[0]?.title,
    primaryItemAction: evidenceActionCenter.nextItems[0]?.action,
    primaryItemEvidence: evidenceActionCenter.nextItems[0]?.evidence,
  } satisfies LaunchGoalFollowup["evidenceActionCenter"];
  const nextActions = items
    .filter((item) => item.status !== "ready")
    .slice(0, 4)
    .map((item) => {
      const fillIn = fillIns.find((entry) => entry.status === item.status && entry.evidence === item.evidence);

      return fillIn
        ? `${item.title}：${item.action}（入口：${fillIn.sectionLabel}）`
        : `${item.title}：${item.action}`;
    });

  return {
    generatedAt,
    status,
    ...copy,
    summary,
    currentMilestone,
    transitionGate,
    evidenceActionCenter: goalEvidenceActionCenter,
    items,
    fillIns,
    nextActions,
    copyText: buildCopyText({
      generatedAt,
      status,
      currentMilestone,
      transitionGate,
      evidenceActionCenter: goalEvidenceActionCenter,
      items,
      fillIns,
      nextActions,
      ...copy,
    }),
  } satisfies LaunchGoalFollowup;
}
