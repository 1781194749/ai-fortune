import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  getLaunchApplicationPack,
  type LaunchApplicationPack,
  type LaunchApplicationPlatformId,
} from "@/lib/launch-application-pack";
import type { ExternalReadinessItemId } from "@/lib/launch-external-readiness";
import {
  getLaunchFounderDossier,
  type LaunchFounderDossier,
  type LaunchFounderDossierStep,
} from "@/lib/launch-founder-dossier";
import {
  getLaunchRolloutPlan,
  type LaunchRolloutPlan,
} from "@/lib/launch-rollout";
import {
  getLaunchScheduleRisk,
  type LaunchScheduleItem,
  type LaunchScheduleRisk,
} from "@/lib/launch-schedule";
import {
  getLaunchWorkplan,
  type LaunchWorkplan,
  type LaunchWorkplanLane,
  type LaunchWorkplanTask,
} from "@/lib/launch-workplan";
import {
  getLaunchWeeklyCommitments,
  type LaunchWeeklyCommitment,
  type LaunchWeeklyCommitmentStatus,
  type LaunchWeeklyCommitments,
} from "@/lib/launch-weekly-commitments";

export type LaunchWeeklyFocusDueState =
  | "overdue"
  | "today"
  | "this_week"
  | "scheduled"
  | "unscheduled";

export type LaunchWeeklyFocusItem = {
  id: string;
  source: LaunchWorkplanTask["source"];
  laneId: LaunchWorkplanTask["laneId"];
  laneTitle: string;
  title: string;
  status: HealthStatus;
  owner: string;
  phase: string;
  dueDate?: string;
  dueState: LaunchWeeklyFocusDueState;
  dueLabel: string;
  suggestedTargetDate?: string;
  suggestedTargetLabel?: string;
  detail: string;
  action: string;
  evidence: string;
  blockedBy: string[];
  envKeys: string[];
  priority: number;
  commitment?: {
    status: LaunchWeeklyCommitmentStatus;
    targetDate?: string;
    owner?: string;
    evidenceNote?: string;
    note?: string;
    updatedAt: string;
    updatedBy: string;
  };
  commitmentGapReason?: string;
};

export type LaunchWeeklyFocusOwner = {
  owner: string;
  status: HealthStatus;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
  };
  items: LaunchWeeklyFocusItem[];
};

export type LaunchWeeklyFocusLane = {
  id: LaunchWorkplanLane["id"];
  title: string;
  status: HealthStatus;
  summary: LaunchWorkplanLane["summary"];
  nextItem?: LaunchWeeklyFocusItem;
};

export type LaunchWeeklyFocus = {
  generatedAt: string;
  status: HealthStatus;
  label: string;
  detail: string;
  action: string;
  week: {
    today: string;
    start: string;
    end: string;
  };
  currentPhase: {
    id: string;
    title: string;
    owner: string;
    label: string;
  };
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
    overdue: number;
    today: number;
    thisWeek: number;
    unscheduled: number;
    committed: number;
    uncommitted: number;
    commitmentCoveragePercent: number;
    commitmentTodo: number;
    commitmentInProgress: number;
    commitmentBlocked: number;
    commitmentDone: number;
  };
  lanes: LaunchWeeklyFocusLane[];
  focusItems: LaunchWeeklyFocusItem[];
  commitmentGaps: LaunchWeeklyFocusItem[];
  ownerGroups: LaunchWeeklyFocusOwner[];
  copyText: string;
};

type LaunchWeeklyFocusInput = {
  workplan?: LaunchWorkplan;
  schedule?: LaunchScheduleRisk;
  founderDossier?: LaunchFounderDossier;
  applicationPack?: LaunchApplicationPack;
  rollout?: LaunchRolloutPlan;
  commitments?: LaunchWeeklyCommitments;
  now?: Date;
};

const platformScheduleMap = {
  icp: "icp",
  alipay: "alipay",
  wechat_pay: "wechat_pay",
  wechat_open: "wechat_open",
  qiniu: "qiniu",
  openai: "openai",
} satisfies Partial<Record<LaunchApplicationPlatformId, ExternalReadinessItemId>>;

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(dateValue: string, days: number) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  const fromTime = Date.UTC(fromYear, fromMonth - 1, fromDay);
  const toTime = Date.UTC(toYear, toMonth - 1, toDay);

  return Math.round((toTime - fromTime) / 86_400_000);
}

function weekRange(now: Date) {
  const today = dateKey(now);
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  const start = addDays(today, 1 - weekday);

  return {
    today,
    start,
    end: addDays(start, 6),
  };
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

function worstStatus(a: HealthStatus, b: HealthStatus) {
  return statusRank(a) <= statusRank(b) ? a : b;
}

function dueRank(state: LaunchWeeklyFocusDueState) {
  if (state === "overdue") {
    return 0;
  }

  if (state === "today") {
    return 1;
  }

  if (state === "this_week") {
    return 2;
  }

  if (state === "unscheduled") {
    return 3;
  }

  return 4;
}

function commitmentStatusLabel(status?: LaunchWeeklyCommitmentStatus) {
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

function dueState(input: {
  dueDate?: string;
  today: string;
  weekEnd: string;
}): {
  state: LaunchWeeklyFocusDueState;
  label: string;
} {
  if (!input.dueDate) {
    return {
      state: "unscheduled",
      label: "本周内排定目标日",
    };
  }

  const days = daysBetween(input.today, input.dueDate);

  if (days < 0) {
    return {
      state: "overdue",
      label: `已逾期 ${Math.abs(days)} 天`,
    };
  }

  if (days === 0) {
    return {
      state: "today",
      label: "今天截止",
    };
  }

  if (daysBetween(input.dueDate, input.weekEnd) >= 0) {
    return {
      state: "this_week",
      label: `本周 ${input.dueDate}`,
    };
  }

  return {
    state: "scheduled",
    label: `已排期 ${input.dueDate}`,
  };
}

function suggestedTargetDate(input: {
  itemIndex: number;
  week: LaunchWeeklyFocus["week"];
}) {
  const remainingDays = Math.max(daysBetween(input.week.today, input.week.end), 0);
  const offset = Math.min(Math.floor(input.itemIndex / 4), remainingDays);

  return addDays(input.week.today, offset);
}

function taskExternalId(task: LaunchWorkplanTask): ExternalReadinessItemId | undefined {
  if (task.source === "external") {
    return task.id.replace(/^external:/, "") as ExternalReadinessItemId;
  }

  if (task.source === "application_pack") {
    const platformId = task.id.replace(/^application:/, "") as LaunchApplicationPlatformId;

    return platformScheduleMap[platformId];
  }

  return undefined;
}

function formatFounderDetail(step: LaunchFounderDossierStep | undefined) {
  if (!step) {
    return undefined;
  }

  const prepare = step.prepare.slice(0, 3).join("、");
  const outputs = step.outputs.slice(0, 3).join("、");

  return [`准备：${prepare || "按办理平台要求准备材料"}`, `产物：${outputs || step.evidence}`].join("；");
}

function focusItem(input: {
  task: LaunchWorkplanTask;
  schedule?: LaunchScheduleItem;
  founderStep?: LaunchFounderDossierStep;
  commitment?: LaunchWeeklyCommitment;
  itemIndex: number;
  week: LaunchWeeklyFocus["week"];
}): LaunchWeeklyFocusItem {
  const dueDate = input.commitment?.targetDate ?? input.schedule?.targetDate ?? input.schedule?.suggestedDate;
  const suggestedDate = dueDate
    ? undefined
    : suggestedTargetDate({ itemIndex: input.itemIndex, week: input.week });
  const due = dueState({
    dueDate,
    today: input.week.today,
    weekEnd: input.week.end,
  });
  const status = input.schedule
    ? worstStatus(input.task.status, input.schedule.scheduleStatus)
    : input.task.status;
  const founderDetail = formatFounderDetail(input.founderStep);

  return {
    id: input.task.id,
    source: input.task.source,
    laneId: input.task.laneId,
    laneTitle: input.task.laneTitle,
    title: input.task.title,
    status,
    owner: input.commitment?.owner ?? input.task.owner,
    phase: input.task.phase,
    dueDate,
    dueState: due.state,
    dueLabel: due.label,
    suggestedTargetDate: suggestedDate,
    suggestedTargetLabel: suggestedDate ? `建议承诺 ${suggestedDate}` : undefined,
    detail: [input.task.detail, founderDetail, input.commitment?.note ? `推进备注：${input.commitment.note}` : undefined]
      .filter(Boolean)
      .join("；"),
    action: input.task.action,
    evidence: input.commitment?.evidenceNote ?? input.founderStep?.evidence ?? input.task.evidence,
    blockedBy: input.task.blockedBy,
    envKeys: input.task.envKeys,
    priority: input.task.priority,
    commitment: input.commitment
      ? {
          status: input.commitment.status,
          targetDate: input.commitment.targetDate,
          owner: input.commitment.owner,
          evidenceNote: input.commitment.evidenceNote,
          note: input.commitment.note,
          updatedAt: input.commitment.updatedAt,
          updatedBy: input.commitment.updatedBy,
        }
      : undefined,
    commitmentGapReason: input.commitment?.targetDate
      ? undefined
      : suggestedDate
        ? `缺少已保存目标日，建议先承诺到 ${suggestedDate}。`
        : "缺少已保存目标日。",
  };
}

function sortFocusItems(items: LaunchWeeklyFocusItem[]) {
  return [...items].sort(
    (a, b) =>
      statusRank(a.status) - statusRank(b.status) ||
      dueRank(a.dueState) - dueRank(b.dueState) ||
      a.priority - b.priority ||
      a.laneTitle.localeCompare(b.laneTitle, "zh-CN") ||
      a.title.localeCompare(b.title, "zh-CN"),
  );
}

function summarize(items: LaunchWeeklyFocusItem[]) {
  const committed = items.filter((item) => Boolean(item.commitment?.targetDate)).length;
  const commitments = items
    .map((item) => item.commitment)
    .filter((item): item is NonNullable<LaunchWeeklyFocusItem["commitment"]> =>
      Boolean(item),
    );
  const total = items.length;

  return {
    ready: items.filter((item) => item.status === "ready").length,
    warning: items.filter((item) => item.status === "warning").length,
    blocking: items.filter((item) => item.status === "blocking").length,
    total,
    overdue: items.filter((item) => item.dueState === "overdue").length,
    today: items.filter((item) => item.dueState === "today").length,
    thisWeek: items.filter((item) => item.dueState === "this_week").length,
    unscheduled: items.filter((item) => item.dueState === "unscheduled").length,
    committed,
    uncommitted: total - committed,
    commitmentCoveragePercent: total > 0 ? Math.round((committed / total) * 100) : 100,
    commitmentTodo: commitments.filter((item) => item.status === "todo").length,
    commitmentInProgress: commitments.filter((item) => item.status === "in_progress").length,
    commitmentBlocked: commitments.filter((item) => item.status === "blocked").length,
    commitmentDone: commitments.filter((item) => item.status === "done").length,
  };
}

function statusFromSummary(summary: ReturnType<typeof summarize>) {
  if (summary.blocking > 0 || summary.overdue > 0 || summary.commitmentBlocked > 0) {
    return "blocking" as const;
  }

  if (summary.warning > 0 || summary.unscheduled > 0) {
    return "warning" as const;
  }

  return "ready" as const;
}

function buildOwnerGroups(items: LaunchWeeklyFocusItem[]) {
  const owners = Array.from(new Set(items.map((item) => item.owner)));

  return owners
    .map((owner) => {
      const ownerItems = sortFocusItems(items.filter((item) => item.owner === owner));
      const summary = summarize(ownerItems);

      return {
        owner,
        status: statusFromSummary(summary),
        summary,
        items: ownerItems.slice(0, 4),
      } satisfies LaunchWeeklyFocusOwner;
    })
    .sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        b.summary.total - a.summary.total ||
        a.owner.localeCompare(b.owner, "zh-CN"),
    );
}

function buildLaneFocus(input: {
  workplan: LaunchWorkplan;
  focusItems: LaunchWeeklyFocusItem[];
}) {
  return input.workplan.lanes.map((lane) => ({
    id: lane.id,
    title: lane.title,
    status: lane.status,
    summary: lane.summary,
    nextItem: input.focusItems.find((item) => item.laneId === lane.id),
  })) satisfies LaunchWeeklyFocusLane[];
}

function copyText(input: {
  weekly: Omit<LaunchWeeklyFocus, "copyText">;
}) {
  const itemLines =
    input.weekly.focusItems.length > 0
      ? input.weekly.focusItems.slice(0, 10).map(
          (item, index) => {
            const dateLabel = item.suggestedTargetLabel ?? item.dueLabel;
            const commitmentLabel = item.commitment
              ? commitmentStatusLabel(item.commitment.status)
              : "未承诺";

            return `${index + 1}. [${item.status}/${commitmentLabel}] ${item.laneTitle} / ${item.title} / ${item.owner} / ${dateLabel}：${item.action} 证据：${item.evidence}`;
          },
        )
      : ["- 当前没有本周重点任务。"];
  const gapLines =
    input.weekly.commitmentGaps.length > 0
      ? input.weekly.commitmentGaps
          .slice(0, 6)
          .map((item, index) => `${index + 1}. ${item.title}：${item.commitmentGapReason}`)
      : ["- 当前没有未承诺任务。"];
  const ownerLines =
    input.weekly.ownerGroups.length > 0
      ? input.weekly.ownerGroups
          .slice(0, 6)
          .map(
            (group) =>
              `- ${group.owner}：${group.summary.blocking} 阻断 / ${group.summary.warning} 警告 / ${group.summary.total} 项`,
          )
      : ["- 暂无负责人任务。"];

  return [
    "玄机 AI 本周推进看板",
    `周期：${input.weekly.week.start} 至 ${input.weekly.week.end}`,
    `当前阶段：${input.weekly.currentPhase.title} / ${input.weekly.currentPhase.label}`,
    `状态：${input.weekly.label} (${input.weekly.status})`,
    `承诺覆盖率：${input.weekly.summary.commitmentCoveragePercent}% (${input.weekly.summary.committed}/${input.weekly.summary.total})`,
    `承诺状态：未开始 ${input.weekly.summary.commitmentTodo} / 处理中 ${input.weekly.summary.commitmentInProgress} / 卡住 ${input.weekly.summary.commitmentBlocked} / 已完成 ${input.weekly.summary.commitmentDone}`,
    `下一步：${input.weekly.action}`,
    "",
    "负责人：",
    ...ownerLines,
    "",
    "本周重点：",
    ...itemLines,
    "",
    "待补承诺：",
    ...gapLines,
  ].join("\n");
}

function weeklyCopy(input: {
  status: HealthStatus;
  summary: LaunchWeeklyFocus["summary"];
  week: LaunchWeeklyFocus["week"];
}) {
  if (input.status === "blocking") {
    return {
      label: `本周推进有 ${input.summary.blocking} 个阻断任务`,
      detail: `周期 ${input.week.start} 至 ${input.week.end}，承诺覆盖率 ${input.summary.commitmentCoveragePercent}%，处理中 ${input.summary.commitmentInProgress} 项，卡住 ${input.summary.commitmentBlocked} 项，需要先处理逾期、未排期和资质/生产阻断。`,
      action: `先给 ${input.summary.uncommitted} 个未承诺任务补目标日、负责人和证据口径，再推进技术联调。`,
    };
  }

  if (input.status === "warning") {
    return {
      label: `本周推进有 ${input.summary.warning} 个待复核任务`,
      detail: `核心阻断减少，承诺覆盖率 ${input.summary.commitmentCoveragePercent}%，处理中 ${input.summary.commitmentInProgress} 项，已完成 ${input.summary.commitmentDone} 项，但仍需要补齐排期、证据或成本复盘口径。`,
      action: `按负责人清单补证，并给 ${input.summary.uncommitted} 个未承诺任务补齐目标日。`,
    };
  }

  return {
    label: "本周推进计划已闭合",
    detail: "本周重点任务均无阻断或警告。",
    action: "保持证据归档，并按灰度放量计划进入下一阶段。",
  };
}

export async function getLaunchWeeklyFocus(input?: LaunchWeeklyFocusInput) {
  const [workplan, schedule, founderDossier, applicationPack, rollout, commitments] = await Promise.all([
    input?.workplan ?? getLaunchWorkplan(),
    input?.schedule ?? getLaunchScheduleRisk(input?.now),
    input?.founderDossier ?? getLaunchFounderDossier(),
    input?.applicationPack ?? getLaunchApplicationPack(),
    input?.rollout ?? getLaunchRolloutPlan(),
    input?.commitments ?? getLaunchWeeklyCommitments(),
  ]);
  const week = weekRange(input?.now ?? new Date());
  const scheduleById = new Map(schedule.items.map((item) => [item.id, item]));
  const founderStepById = new Map(founderDossier.criticalPath.map((step) => [step.id, step]));
  const applicationIds = new Set(applicationPack.nextPlatforms.map((platform) => platform.id));
  const allItems = sortFocusItems(
    workplan.workingSet
      .concat(workplan.lanes.flatMap((lane) => lane.tasks))
      .filter((task, index, tasks) => tasks.findIndex((item) => item.id === task.id) === index)
      .filter((task) => task.status !== "ready")
      .filter((task) => {
        if (task.source !== "application_pack") {
          return true;
        }

        return applicationIds.has(task.id.replace(/^application:/, "") as LaunchApplicationPlatformId);
      })
      .map((task, index) => {
        const externalId = taskExternalId(task);

        return focusItem({
          task,
          schedule: externalId ? scheduleById.get(externalId) : undefined,
          founderStep: task.source === "external" && externalId ? founderStepById.get(externalId) : undefined,
          commitment: commitments.itemByTaskId.get(task.id),
          itemIndex: index,
          week,
        });
      }),
  );
  const focusItems = allItems.slice(0, 12);
  const commitmentGaps = allItems.filter((item) => !item.commitment?.targetDate).slice(0, 8);
  const summary = summarize(allItems);
  const status = statusFromSummary(summary);
  const currentPhase = {
    id: rollout.currentPhase.id,
    title: rollout.currentPhase.title,
    owner: rollout.currentPhase.owner,
    label: rollout.currentPhase.label,
  };
  const copy = weeklyCopy({ status, summary, week });
  const weekly = {
    generatedAt: new Date().toISOString(),
    status,
    ...copy,
    week,
    currentPhase,
    summary,
    lanes: buildLaneFocus({ workplan, focusItems: allItems }),
    focusItems,
    commitmentGaps,
    ownerGroups: buildOwnerGroups(focusItems),
  } satisfies Omit<LaunchWeeklyFocus, "copyText">;

  return {
    ...weekly,
    copyText: copyText({ weekly }),
  } satisfies LaunchWeeklyFocus;
}
