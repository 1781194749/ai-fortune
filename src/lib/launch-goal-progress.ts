import "server-only";

import {
  createUsageLog,
  getUsageLogsByFeature,
  type UsageLogRecord,
} from "@/lib/usage-log-store";

export const launchGoalProgressFeature = "launch_goal_progress";
export const launchGoalProgressEvent = "launch_goal_progress_updated";

export type LaunchGoalProgressMilestoneId =
  | "start"
  | "paid_smoke"
  | "retention"
  | "international";

export type LaunchGoalProgressStatus =
  | "todo"
  | "in_progress"
  | "blocked"
  | "done";

export type LaunchGoalProgressItem = {
  milestoneId: LaunchGoalProgressMilestoneId;
  status: LaunchGoalProgressStatus;
  targetDate?: string;
  owner?: string;
  evidenceNote?: string;
  note?: string;
  updatedAt: string;
  updatedBy: string;
};

export type LaunchGoalProgress = {
  generatedAt: string;
  items: LaunchGoalProgressItem[];
  itemByMilestoneId: Map<LaunchGoalProgressMilestoneId, LaunchGoalProgressItem>;
  summary: {
    total: number;
    todo: number;
    inProgress: number;
    blocked: number;
    done: number;
  };
};

export type LaunchGoalProgressMetadata = {
  event: typeof launchGoalProgressEvent;
  items: LaunchGoalProgressItem[];
  updatedBy: string;
  updatedAt: string;
};

declare global {
  var xuanjiLaunchGoalProgress: Map<LaunchGoalProgressMilestoneId, LaunchGoalProgressItem> | undefined;
}

const runtimeProgress =
  globalThis.xuanjiLaunchGoalProgress ?? new Map<LaunchGoalProgressMilestoneId, LaunchGoalProgressItem>();

if (!globalThis.xuanjiLaunchGoalProgress) {
  globalThis.xuanjiLaunchGoalProgress = runtimeProgress;
}

const milestoneIds = ["start", "paid_smoke", "retention", "international"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeMilestoneId(value: unknown) {
  if (typeof value === "string" && milestoneIds.includes(value as LaunchGoalProgressMilestoneId)) {
    return value as LaunchGoalProgressMilestoneId;
  }

  throw new Error("MILESTONE_ID_INVALID");
}

function normalizeProgressStatus(value: unknown): LaunchGoalProgressStatus {
  return value === "in_progress" || value === "blocked" || value === "done" || value === "todo"
    ? value
    : "todo";
}

function normalizeOptionalText(value: unknown, maxLength = 220) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim().replace(/\s+/g, " ");

  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function normalizeTargetDate(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("TARGET_DATE_INVALID");
  }

  return value;
}

function readProgressItem(value: unknown): LaunchGoalProgressItem | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const milestoneId = readString(value.milestoneId);
  const updatedAt = readString(value.updatedAt);
  const updatedBy = readString(value.updatedBy);

  if (
    !milestoneId ||
    !milestoneIds.includes(milestoneId as LaunchGoalProgressMilestoneId) ||
    !updatedAt ||
    !updatedBy
  ) {
    return undefined;
  }

  return {
    milestoneId: milestoneId as LaunchGoalProgressMilestoneId,
    status: normalizeProgressStatus(value.status),
    targetDate: readString(value.targetDate),
    owner: readString(value.owner),
    evidenceNote: readString(value.evidenceNote),
    note: readString(value.note),
    updatedAt,
    updatedBy,
  };
}

function applyProgress(items: LaunchGoalProgressItem[]) {
  runtimeProgress.clear();

  for (const item of items) {
    runtimeProgress.set(item.milestoneId, item);
  }
}

export function readLaunchGoalProgressMetadata(log: UsageLogRecord) {
  if (log.feature !== launchGoalProgressFeature || !isRecord(log.metadata)) {
    return undefined;
  }

  if (log.metadata.event !== launchGoalProgressEvent || !Array.isArray(log.metadata.items)) {
    return undefined;
  }

  const items = log.metadata.items
    .map(readProgressItem)
    .filter((item): item is LaunchGoalProgressItem => Boolean(item));
  const updatedBy = readString(log.metadata.updatedBy);
  const updatedAt = readString(log.metadata.updatedAt);

  if (!updatedBy || !updatedAt) {
    return undefined;
  }

  return {
    event: launchGoalProgressEvent,
    items,
    updatedBy,
    updatedAt,
  } satisfies LaunchGoalProgressMetadata;
}

async function ensureLoaded() {
  if (runtimeProgress.size > 0) {
    return;
  }

  const logs = await getUsageLogsByFeature(launchGoalProgressFeature, { take: 20 });
  const latest = logs.map(readLaunchGoalProgressMetadata).find(Boolean);

  if (latest) {
    applyProgress(latest.items);
  }
}

function summarize(items: LaunchGoalProgressItem[]) {
  return {
    total: items.length,
    todo: items.filter((item) => item.status === "todo").length,
    inProgress: items.filter((item) => item.status === "in_progress").length,
    blocked: items.filter((item) => item.status === "blocked").length,
    done: items.filter((item) => item.status === "done").length,
  };
}

export async function getLaunchGoalProgress() {
  await ensureLoaded();

  const items = Array.from(runtimeProgress.values()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

  return {
    generatedAt: new Date().toISOString(),
    items,
    itemByMilestoneId: new Map(items.map((item) => [item.milestoneId, item])),
    summary: summarize(items),
  } satisfies LaunchGoalProgress;
}

export async function saveLaunchGoalProgress(input: {
  milestoneId: unknown;
  status?: unknown;
  targetDate?: unknown;
  owner?: unknown;
  evidenceNote?: unknown;
  note?: unknown;
  updatedBy?: string;
}) {
  await ensureLoaded();

  const milestoneId = normalizeMilestoneId(input.milestoneId);
  const updatedAt = new Date().toISOString();
  const updatedBy = input.updatedBy ?? process.env.ADMIN_AUDIT_OPERATOR ?? "admin";
  const progress = {
    milestoneId,
    status: normalizeProgressStatus(input.status),
    targetDate: normalizeTargetDate(input.targetDate),
    owner: normalizeOptionalText(input.owner, 80),
    evidenceNote: normalizeOptionalText(input.evidenceNote, 260),
    note: normalizeOptionalText(input.note, 260),
    updatedAt,
    updatedBy,
  } satisfies LaunchGoalProgressItem;

  runtimeProgress.set(milestoneId, progress);

  const metadata = {
    event: launchGoalProgressEvent,
    items: Array.from(runtimeProgress.values()),
    updatedBy,
    updatedAt,
  } satisfies LaunchGoalProgressMetadata;

  await createUsageLog({
    provider: "internal",
    model: "launch-goal-progress",
    feature: launchGoalProgressFeature,
    costCents: 0,
    metadata,
  });

  return {
    metadata,
    progress: await getLaunchGoalProgress(),
  };
}
