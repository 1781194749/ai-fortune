import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  getLaunchExternalReadiness,
  type ExternalReadinessItem,
  type ExternalReadinessItemId,
} from "@/lib/launch-external-readiness";
import { getLaunchMaterialPack, type LaunchMaterialItem } from "@/lib/launch-materials";

export type LaunchScheduleState =
  | "ready"
  | "overdue"
  | "due_soon"
  | "scheduled"
  | "unscheduled";

export type LaunchScheduleItem = {
  id: ExternalReadinessItemId;
  title: string;
  group: string;
  owner: string;
  phase: string;
  statusLabel: string;
  scheduleState: LaunchScheduleState;
  scheduleStatus: HealthStatus;
  targetDate?: string;
  suggestedDate?: string;
  daysUntilDue?: number;
  detail: string;
  action: string;
  evidence: string;
};

export type LaunchScheduleRisk = {
  generatedAt: string;
  today: string;
  status: HealthStatus;
  label: string;
  summary: {
    ready: number;
    overdue: number;
    dueSoon: number;
    scheduled: number;
    unscheduled: number;
    total: number;
  };
  items: LaunchScheduleItem[];
  nextItems: LaunchScheduleItem[];
  copyText: string;
};

const suggestedOffsets = {
  entity: 3,
  domain: 5,
  postgres: 7,
  openai: 7,
  qiniu: 10,
  icp: 20,
  wechat_open: 20,
  alipay: 25,
  wechat_pay: 30,
  legal_review: 35,
} satisfies Record<ExternalReadinessItemId, number>;

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(today: string, days: number) {
  const [year, month, day] = today.split("-").map(Number);
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

function scheduleStatus(state: LaunchScheduleState): HealthStatus {
  if (state === "overdue") {
    return "blocking";
  }

  if (state === "due_soon" || state === "unscheduled") {
    return "warning";
  }

  return "ready";
}

function stateLabel(state: LaunchScheduleState) {
  if (state === "ready") {
    return "已完成";
  }

  if (state === "overdue") {
    return "已逾期";
  }

  if (state === "due_soon") {
    return "临期";
  }

  if (state === "scheduled") {
    return "已排期";
  }

  return "未排期";
}

function scheduleState(item: ExternalReadinessItem, today: string): {
  state: LaunchScheduleState;
  daysUntilDue?: number;
} {
  if (item.status === "ready") {
    return { state: "ready" };
  }

  if (!item.targetDate) {
    return { state: "unscheduled" };
  }

  const daysUntilDue = daysBetween(today, item.targetDate);

  if (daysUntilDue < 0) {
    return { state: "overdue", daysUntilDue };
  }

  if (daysUntilDue <= 7) {
    return { state: "due_soon", daysUntilDue };
  }

  return { state: "scheduled", daysUntilDue };
}

function statusRank(item: LaunchScheduleItem) {
  if (item.scheduleState === "overdue") {
    return 0;
  }

  if (item.scheduleState === "due_soon") {
    return 1;
  }

  if (item.scheduleState === "unscheduled") {
    return 2;
  }

  if (item.scheduleState === "scheduled") {
    return 3;
  }

  return 4;
}

function materialById(materials: LaunchMaterialItem[]) {
  return new Map(materials.map((item) => [item.id, item]));
}

function buildItem(input: {
  item: ExternalReadinessItem;
  material?: LaunchMaterialItem;
  today: string;
}): LaunchScheduleItem {
  const schedule = scheduleState(input.item, input.today);
  const scheduleItemStatus = scheduleStatus(schedule.state);
  const suggestedDate =
    schedule.state === "unscheduled"
      ? addDays(input.today, suggestedOffsets[input.item.id])
      : undefined;
  const evidence = input.item.evidenceNote ?? input.item.evidence;

  return {
    id: input.item.id,
    title: input.item.title,
    group: input.item.group,
    owner: input.item.owner,
    phase: input.material?.phase ?? input.item.group,
    statusLabel: stateLabel(schedule.state),
    scheduleState: schedule.state,
    scheduleStatus: scheduleItemStatus,
    targetDate: input.item.targetDate,
    suggestedDate,
    daysUntilDue: schedule.daysUntilDue,
    detail:
      schedule.state === "unscheduled"
        ? `还没有目标日期，建议先排到 ${suggestedDate}。`
        : schedule.state === "overdue"
          ? `目标日期 ${input.item.targetDate} 已过 ${Math.abs(schedule.daysUntilDue ?? 0)} 天。`
          : schedule.state === "due_soon"
            ? `距离目标日期 ${input.item.targetDate} 还有 ${schedule.daysUntilDue} 天。`
            : schedule.state === "scheduled"
              ? `目标日期 ${input.item.targetDate}，还有 ${schedule.daysUntilDue} 天。`
              : "该事项已完成。",
    action:
      schedule.state === "ready"
        ? "保留证据，后续生产变量或主体信息变更时重新复核。"
        : input.item.action,
    evidence,
  };
}

function summarize(items: LaunchScheduleItem[]) {
  return {
    ready: items.filter((item) => item.scheduleState === "ready").length,
    overdue: items.filter((item) => item.scheduleState === "overdue").length,
    dueSoon: items.filter((item) => item.scheduleState === "due_soon").length,
    scheduled: items.filter((item) => item.scheduleState === "scheduled").length,
    unscheduled: items.filter((item) => item.scheduleState === "unscheduled").length,
    total: items.length,
  };
}

function scheduleRiskStatus(summary: ReturnType<typeof summarize>): HealthStatus {
  if (summary.overdue > 0) {
    return "blocking";
  }

  if (summary.dueSoon > 0 || summary.unscheduled > 0) {
    return "warning";
  }

  return "ready";
}

function scheduleRiskLabel(status: HealthStatus, summary: ReturnType<typeof summarize>) {
  if (status === "blocking") {
    return `上线排期有 ${summary.overdue} 项逾期`;
  }

  if (status === "warning") {
    return `上线排期需补齐：${summary.dueSoon} 项临期、${summary.unscheduled} 项未排期`;
  }

  return "上线排期已可控";
}

function buildCopyText(input: {
  today: string;
  label: string;
  status: HealthStatus;
  nextItems: LaunchScheduleItem[];
}) {
  const lines =
    input.nextItems.length > 0
      ? input.nextItems.map((item, index) => {
          const date = item.targetDate ?? item.suggestedDate ?? "未排期";

          return `${index + 1}. [${item.statusLabel}] ${item.title} / ${item.owner} / ${date}：${item.action}`;
        })
      : ["- 当前没有排期风险。"];

  return [
    "玄机 AI 上线排期风险",
    `日期：${input.today}`,
    `状态：${input.label} (${input.status})`,
    "",
    "优先处理：",
    ...lines,
  ].join("\n");
}

export async function getLaunchScheduleRisk(now = new Date()) {
  const today = dateKey(now);
  const [externalReadiness, materialPack] = await Promise.all([
    getLaunchExternalReadiness(),
    getLaunchMaterialPack(),
  ]);
  const materials = materialById(materialPack.items);
  const items = externalReadiness.items
    .map((item) =>
      buildItem({
        item,
        material: materials.get(item.id),
        today,
      }),
    )
    .sort(
      (a, b) =>
        statusRank(a) - statusRank(b) ||
        (a.daysUntilDue ?? Number.POSITIVE_INFINITY) -
          (b.daysUntilDue ?? Number.POSITIVE_INFINITY) ||
        a.group.localeCompare(b.group, "zh-CN") ||
        a.title.localeCompare(b.title, "zh-CN"),
    );
  const summary = summarize(items);
  const status = scheduleRiskStatus(summary);
  const label = scheduleRiskLabel(status, summary);
  const nextItems = items.filter((item) => item.scheduleState !== "ready").slice(0, 8);

  return {
    generatedAt: new Date().toISOString(),
    today,
    status,
    label,
    summary,
    items,
    nextItems,
    copyText: buildCopyText({ today, label, status, nextItems }),
  } satisfies LaunchScheduleRisk;
}
