import "server-only";

import {
  createUsageLog,
  getUsageLogsByFeature,
  type UsageLogRecord,
} from "@/lib/usage-log-store";

export const launchDailyActionProgressFeature = "launch_daily_action_progress";
export const launchDailyActionProgressEvent = "launch_daily_action_progress_updated";

export type LaunchDailyActionProgressStatus =
  | "todo"
  | "in_progress"
  | "blocked"
  | "done";

export type LaunchDailyActionProgressItem = {
  actionId: string;
  status: LaunchDailyActionProgressStatus;
  owner?: string;
  evidenceNote?: string;
  note?: string;
  updatedAt: string;
  updatedBy: string;
};

export type LaunchDailyActionProgress = {
  generatedAt: string;
  items: LaunchDailyActionProgressItem[];
  itemByActionId: Map<string, LaunchDailyActionProgressItem>;
  summary: {
    total: number;
    todo: number;
    inProgress: number;
    blocked: number;
    done: number;
  };
};

export type LaunchDailyActionProgressMetadata = {
  event: typeof launchDailyActionProgressEvent;
  items: LaunchDailyActionProgressItem[];
  updatedBy: string;
  updatedAt: string;
};

declare global {
  var xuanjiLaunchDailyActionProgress:
    | Map<string, LaunchDailyActionProgressItem>
    | undefined;
}

const runtimeProgress =
  globalThis.xuanjiLaunchDailyActionProgress ??
  new Map<string, LaunchDailyActionProgressItem>();

if (!globalThis.xuanjiLaunchDailyActionProgress) {
  globalThis.xuanjiLaunchDailyActionProgress = runtimeProgress;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeActionId(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("ACTION_ID_INVALID");
  }

  const trimmed = value.trim();

  if (!/^[a-z0-9:_./-]{3,220}$/i.test(trimmed)) {
    throw new Error("ACTION_ID_INVALID");
  }

  return trimmed;
}

function normalizeProgressStatus(value: unknown): LaunchDailyActionProgressStatus {
  return value === "in_progress" || value === "blocked" || value === "done" || value === "todo"
    ? value
    : "todo";
}

function normalizeOptionalText(value: unknown, maxLength = 260) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim().replace(/\s+/g, " ");

  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function readProgressItem(value: unknown): LaunchDailyActionProgressItem | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const actionId = readString(value.actionId);
  const updatedAt = readString(value.updatedAt);
  const updatedBy = readString(value.updatedBy);

  if (!actionId || !updatedAt || !updatedBy) {
    return undefined;
  }

  return {
    actionId,
    status: normalizeProgressStatus(value.status),
    owner: readString(value.owner),
    evidenceNote: readString(value.evidenceNote),
    note: readString(value.note),
    updatedAt,
    updatedBy,
  };
}

function applyProgress(items: LaunchDailyActionProgressItem[]) {
  runtimeProgress.clear();

  for (const item of items) {
    runtimeProgress.set(item.actionId, item);
  }
}

export function readLaunchDailyActionProgressMetadata(log: UsageLogRecord) {
  if (log.feature !== launchDailyActionProgressFeature || !isRecord(log.metadata)) {
    return undefined;
  }

  if (
    log.metadata.event !== launchDailyActionProgressEvent ||
    !Array.isArray(log.metadata.items)
  ) {
    return undefined;
  }

  const items = log.metadata.items
    .map(readProgressItem)
    .filter((item): item is LaunchDailyActionProgressItem => Boolean(item));
  const updatedBy = readString(log.metadata.updatedBy);
  const updatedAt = readString(log.metadata.updatedAt);

  if (!updatedBy || !updatedAt) {
    return undefined;
  }

  return {
    event: launchDailyActionProgressEvent,
    items,
    updatedBy,
    updatedAt,
  } satisfies LaunchDailyActionProgressMetadata;
}

async function ensureLoaded() {
  if (runtimeProgress.size > 0) {
    return;
  }

  const logs = await getUsageLogsByFeature(launchDailyActionProgressFeature, { take: 20 });
  const latest = logs.map(readLaunchDailyActionProgressMetadata).find(Boolean);

  if (latest) {
    applyProgress(latest.items);
  }
}

function summarize(items: LaunchDailyActionProgressItem[]) {
  return {
    total: items.length,
    todo: items.filter((item) => item.status === "todo").length,
    inProgress: items.filter((item) => item.status === "in_progress").length,
    blocked: items.filter((item) => item.status === "blocked").length,
    done: items.filter((item) => item.status === "done").length,
  };
}

export async function getLaunchDailyActionProgress() {
  await ensureLoaded();

  const items = Array.from(runtimeProgress.values()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

  return {
    generatedAt: new Date().toISOString(),
    items,
    itemByActionId: new Map(items.map((item) => [item.actionId, item])),
    summary: summarize(items),
  } satisfies LaunchDailyActionProgress;
}

export async function saveLaunchDailyActionProgress(input: {
  actionId: unknown;
  status?: unknown;
  owner?: unknown;
  evidenceNote?: unknown;
  note?: unknown;
  updatedBy?: string;
}) {
  await ensureLoaded();

  const actionId = normalizeActionId(input.actionId);
  const updatedAt = new Date().toISOString();
  const updatedBy = input.updatedBy ?? process.env.ADMIN_AUDIT_OPERATOR ?? "admin";
  const progress = {
    actionId,
    status: normalizeProgressStatus(input.status),
    owner: normalizeOptionalText(input.owner, 80),
    evidenceNote: normalizeOptionalText(input.evidenceNote, 260),
    note: normalizeOptionalText(input.note, 260),
    updatedAt,
    updatedBy,
  } satisfies LaunchDailyActionProgressItem;

  runtimeProgress.set(actionId, progress);

  const metadata = {
    event: launchDailyActionProgressEvent,
    items: Array.from(runtimeProgress.values()),
    updatedBy,
    updatedAt,
  } satisfies LaunchDailyActionProgressMetadata;

  await createUsageLog({
    provider: "internal",
    model: "launch-daily-action-progress",
    feature: launchDailyActionProgressFeature,
    costCents: 0,
    metadata,
  });

  return progress;
}
