import "server-only";

import type { ChannelBudgetConfig } from "@/lib/channel-budget-config";
import { normalizeChannelSource } from "@/lib/channel-source";
import type { GrowthRoiRow } from "@/lib/growth-roi";
import { createUsageLog, type UsageLogRecord } from "@/lib/usage-log-store";

export const channelBudgetReviewDecisions = ["scale", "pause", "retest", "close"] as const;

export type ChannelBudgetReviewDecision = (typeof channelBudgetReviewDecisions)[number];

export type ChannelBudgetReviewMetadata = {
  event: "channel_budget_review_archived";
  source: string;
  decision: ChannelBudgetReviewDecision;
  archivedAt: string;
  archivedBy: string;
  note?: string;
  budgetCents: number;
  revenueCents: number;
  discountCents: number;
  netReturnCents: number;
  paidOrders: number;
  landings: number;
  conversionRate: number;
  spendRoiMultiple?: number;
  blendedRoiMultiple?: number;
  startsAt?: string | null;
  endsAt?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOptionalDate(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return readString(value);
}

export function normalizeChannelBudgetReviewDecision(
  value: unknown,
): ChannelBudgetReviewDecision | undefined {
  return channelBudgetReviewDecisions.includes(value as ChannelBudgetReviewDecision)
    ? (value as ChannelBudgetReviewDecision)
    : undefined;
}

export function reviewDecisionLabel(decision: ChannelBudgetReviewDecision) {
  if (decision === "scale") {
    return "加码";
  }

  if (decision === "pause") {
    return "暂停";
  }

  if (decision === "retest") {
    return "复测";
  }

  return "结案";
}

export async function recordChannelBudgetReview(input: {
  source: string;
  decision: ChannelBudgetReviewDecision;
  row?: GrowthRoiRow;
  budgetConfig?: ChannelBudgetConfig;
  note?: string;
  archivedBy?: string;
}) {
  const source = normalizeChannelSource(input.source);
  const budgetCents = input.row?.budgetCents ?? input.budgetConfig?.budgetCents ?? 0;
  const revenueCents = input.row?.revenueCents ?? 0;
  const discountCents = input.row?.discountCents ?? 0;
  const netReturnCents =
    input.row?.netReturnCents ?? revenueCents - discountCents - budgetCents;
  const metadata = {
    event: "channel_budget_review_archived",
    source,
    decision: input.decision,
    archivedAt: new Date().toISOString(),
    archivedBy: input.archivedBy ?? process.env.ADMIN_AUDIT_OPERATOR ?? "admin",
    note: input.note,
    budgetCents,
    revenueCents,
    discountCents,
    netReturnCents,
    paidOrders: input.row?.paidOrders ?? 0,
    landings: input.row?.landings ?? 0,
    conversionRate: input.row?.conversionRate ?? 0,
    spendRoiMultiple: input.row?.spendRoiMultiple,
    blendedRoiMultiple: input.row?.blendedRoiMultiple,
    startsAt: input.budgetConfig?.startsAt,
    endsAt: input.budgetConfig?.endsAt,
  } satisfies ChannelBudgetReviewMetadata;

  return createUsageLog({
    provider: "internal",
    model: "channel-budget-review",
    feature: "channel_budget_review",
    costCents: 0,
    metadata,
  });
}

export function readChannelBudgetReviewMetadata(log: UsageLogRecord) {
  if (log.feature !== "channel_budget_review" || !isRecord(log.metadata)) {
    return undefined;
  }

  const event = log.metadata.event;
  const source = readString(log.metadata.source);
  const decision = normalizeChannelBudgetReviewDecision(log.metadata.decision);
  const archivedAt = readString(log.metadata.archivedAt);
  const archivedBy = readString(log.metadata.archivedBy);
  const budgetCents = readNumber(log.metadata.budgetCents);
  const revenueCents = readNumber(log.metadata.revenueCents);
  const discountCents = readNumber(log.metadata.discountCents);
  const netReturnCents = readNumber(log.metadata.netReturnCents);
  const paidOrders = readNumber(log.metadata.paidOrders);
  const landings = readNumber(log.metadata.landings);
  const conversionRate = readNumber(log.metadata.conversionRate);

  if (
    event !== "channel_budget_review_archived" ||
    !source ||
    !decision ||
    !archivedAt ||
    !archivedBy ||
    budgetCents === undefined ||
    revenueCents === undefined ||
    discountCents === undefined ||
    netReturnCents === undefined ||
    paidOrders === undefined ||
    landings === undefined ||
    conversionRate === undefined
  ) {
    return undefined;
  }

  return {
    event,
    source,
    decision,
    archivedAt,
    archivedBy,
    note: readString(log.metadata.note),
    budgetCents,
    revenueCents,
    discountCents,
    netReturnCents,
    paidOrders,
    landings,
    conversionRate,
    spendRoiMultiple: readNumber(log.metadata.spendRoiMultiple),
    blendedRoiMultiple: readNumber(log.metadata.blendedRoiMultiple),
    startsAt: readOptionalDate(log.metadata.startsAt),
    endsAt: readOptionalDate(log.metadata.endsAt),
  } satisfies ChannelBudgetReviewMetadata;
}
