import "server-only";

import {
  createUsageLog,
  getUsageLogsByFeature,
  type UsageLogRecord,
} from "@/lib/usage-log-store";

export const launchWeeklyCommitmentsFeature = "launch_weekly_commitments";

export type LaunchWeeklyCommitmentStatus =
  | "todo"
  | "in_progress"
  | "blocked"
  | "done";

export type LaunchWeeklyCommitment = {
  taskId: string;
  status: LaunchWeeklyCommitmentStatus;
  targetDate?: string;
  owner?: string;
  evidenceNote?: string;
  note?: string;
  updatedAt: string;
  updatedBy: string;
};

export type LaunchWeeklyCommitments = {
  generatedAt: string;
  items: LaunchWeeklyCommitment[];
  itemByTaskId: Map<string, LaunchWeeklyCommitment>;
};

export type LaunchWeeklyCommitmentsMetadata = {
  event: "launch_weekly_commitments_updated";
  items: LaunchWeeklyCommitment[];
  updatedBy: string;
  updatedAt: string;
};

declare global {
  var xuanjiLaunchWeeklyCommitments: Map<string, LaunchWeeklyCommitment> | undefined;
}

const runtimeCommitments =
  globalThis.xuanjiLaunchWeeklyCommitments ?? new Map<string, LaunchWeeklyCommitment>();

if (!globalThis.xuanjiLaunchWeeklyCommitments) {
  globalThis.xuanjiLaunchWeeklyCommitments = runtimeCommitments;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeTaskId(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return /^[a-z0-9:_-]{3,140}$/i.test(trimmed) ? trimmed : undefined;
}

function normalizeCommitmentStatus(value: unknown): LaunchWeeklyCommitmentStatus {
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

function readCommitment(value: unknown): LaunchWeeklyCommitment | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const taskId = normalizeTaskId(value.taskId);
  const updatedAt = readString(value.updatedAt);
  const updatedBy = readString(value.updatedBy);

  if (!taskId || !updatedAt || !updatedBy) {
    return undefined;
  }

  return {
    taskId,
    status: normalizeCommitmentStatus(value.status),
    targetDate: readString(value.targetDate),
    owner: readString(value.owner),
    evidenceNote: readString(value.evidenceNote),
    note: readString(value.note),
    updatedAt,
    updatedBy,
  };
}

function applyCommitments(items: LaunchWeeklyCommitment[]) {
  runtimeCommitments.clear();

  for (const item of items) {
    runtimeCommitments.set(item.taskId, item);
  }
}

export function readLaunchWeeklyCommitmentsMetadata(log: UsageLogRecord) {
  if (log.feature !== launchWeeklyCommitmentsFeature || !isRecord(log.metadata)) {
    return undefined;
  }

  if (
    log.metadata.event !== "launch_weekly_commitments_updated" ||
    !Array.isArray(log.metadata.items)
  ) {
    return undefined;
  }

  const items = log.metadata.items
    .map(readCommitment)
    .filter((item): item is LaunchWeeklyCommitment => Boolean(item));
  const updatedBy = readString(log.metadata.updatedBy);
  const updatedAt = readString(log.metadata.updatedAt);

  if (!updatedBy || !updatedAt) {
    return undefined;
  }

  return {
    event: "launch_weekly_commitments_updated",
    items,
    updatedBy,
    updatedAt,
  } satisfies LaunchWeeklyCommitmentsMetadata;
}

async function ensureLoaded() {
  if (runtimeCommitments.size > 0) {
    return;
  }

  const logs = await getUsageLogsByFeature(launchWeeklyCommitmentsFeature, { take: 20 });
  const latest = logs.map(readLaunchWeeklyCommitmentsMetadata).find(Boolean);

  if (latest) {
    applyCommitments(latest.items);
  }
}

export async function getLaunchWeeklyCommitments() {
  await ensureLoaded();

  const items = Array.from(runtimeCommitments.values()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

  return {
    generatedAt: new Date().toISOString(),
    items,
    itemByTaskId: new Map(items.map((item) => [item.taskId, item])),
  } satisfies LaunchWeeklyCommitments;
}

export async function saveLaunchWeeklyCommitment(input: {
  taskId: unknown;
  status?: unknown;
  targetDate?: unknown;
  owner?: unknown;
  evidenceNote?: unknown;
  note?: unknown;
  updatedBy?: string;
}) {
  await ensureLoaded();

  const taskId = normalizeTaskId(input.taskId);

  if (!taskId) {
    throw new Error("TASK_ID_INVALID");
  }

  const updatedAt = new Date().toISOString();
  const updatedBy = input.updatedBy ?? process.env.ADMIN_AUDIT_OPERATOR ?? "admin";
  const commitment = {
    taskId,
    status: normalizeCommitmentStatus(input.status),
    targetDate: normalizeTargetDate(input.targetDate),
    owner: normalizeOptionalText(input.owner, 80),
    evidenceNote: normalizeOptionalText(input.evidenceNote, 220),
    note: normalizeOptionalText(input.note, 220),
    updatedAt,
    updatedBy,
  } satisfies LaunchWeeklyCommitment;

  runtimeCommitments.set(taskId, commitment);

  const metadata = {
    event: "launch_weekly_commitments_updated",
    items: Array.from(runtimeCommitments.values()),
    updatedBy,
    updatedAt,
  } satisfies LaunchWeeklyCommitmentsMetadata;

  await createUsageLog({
    provider: "internal",
    model: "launch-weekly-commitments",
    feature: launchWeeklyCommitmentsFeature,
    costCents: 0,
    metadata,
  });

  return {
    metadata,
    commitments: await getLaunchWeeklyCommitments(),
  };
}
