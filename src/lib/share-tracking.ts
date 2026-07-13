import "server-only";

import {
  normalizeChannelSource,
  resolveTrackingSource,
  type TrackingSourceInput,
} from "@/lib/channel-source";
import { getSharedMockReport, type MockReport } from "@/lib/report-store";
import { createUsageLog, type UsageLogRecord } from "@/lib/usage-log-store";

export type ShareEventName =
  | "view"
  | "poster_view"
  | "copy_link"
  | "native_share"
  | "poster_download"
  | "copy_poster_link";

export type ShareEventMetadata = {
  event: ShareEventName;
  shareSlug: string;
  reportId: string;
  reportType: string;
  source: string;
  referrer?: string;
  userAgent?: string;
};

const allowedShareEvents = new Set<ShareEventName>([
  "view",
  "poster_view",
  "copy_link",
  "native_share",
  "poster_download",
  "copy_poster_link",
]);

export function normalizeShareEvent(value: string | undefined, fallback: ShareEventName) {
  return allowedShareEvents.has(value as ShareEventName) ? (value as ShareEventName) : fallback;
}

export function normalizeShareSource(value: string | undefined) {
  return normalizeChannelSource(value);
}

export function resolveShareTrackingSource(input: TrackingSourceInput) {
  return resolveTrackingSource(input);
}

export function readShareLogMetadata(log: UsageLogRecord) {
  if (log.feature !== "share_event" || !log.metadata || typeof log.metadata !== "object") {
    return null;
  }

  const metadata = log.metadata as Partial<ShareEventMetadata>;

  if (!metadata.event || !metadata.shareSlug || !metadata.reportId) {
    return null;
  }

  return {
    event: metadata.event,
    shareSlug: metadata.shareSlug,
    reportId: metadata.reportId,
    reportType: metadata.reportType ?? "UNKNOWN",
    source: metadata.source ?? "direct",
    referrer: metadata.referrer,
    userAgent: metadata.userAgent,
  } satisfies ShareEventMetadata;
}

export async function recordShareEvent(input: {
  shareSlug: string;
  report?: MockReport;
  event: ShareEventName;
  source?: string;
  referrer?: string;
  userAgent?: string;
}) {
  const report = input.report ?? (await getSharedMockReport(input.shareSlug));

  if (!report || report.status !== "COMPLETED") {
    return null;
  }

  return createUsageLog({
    userId: report.userId,
    provider: "internal",
    model: "share-tracking",
    feature: "share_event",
    costCents: 0,
    metadata: {
      event: input.event,
      shareSlug: input.shareSlug,
      reportId: report.id,
      reportType: report.type,
      source: normalizeShareSource(input.source),
      referrer: input.referrer?.slice(0, 240),
      userAgent: input.userAgent?.slice(0, 240),
    } satisfies ShareEventMetadata,
  });
}
