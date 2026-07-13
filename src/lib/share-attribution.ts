import "server-only";

import { cookies } from "next/headers";
import { normalizeShareSource } from "@/lib/share-tracking";
import { getSharedMockReport, type MockReport } from "@/lib/report-store";
import { createUsageLog, type UsageLogRecord } from "@/lib/usage-log-store";
import type { ProductCode } from "@/lib/commerce";
import type { PaymentProviderCode } from "@/lib/mock-payment-store";

export type ShareAttributionEvent =
  | "landing"
  | "login"
  | "order_created"
  | "paid";

export type ShareAttributionPayload = {
  shareSlug: string;
  reportId: string;
  reportType: string;
  source: string;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type ShareAttributionMetadata = ShareAttributionPayload & {
  event: ShareAttributionEvent;
  userId?: string;
  orderId?: string;
  productCode?: ProductCode;
  provider?: PaymentProviderCode;
  amountCents?: number;
  currency?: string;
  referrer?: string;
  userAgent?: string;
};

const attributionCookieName = "xuanji_share_attr";
const attributionMaxAgeSeconds = 60 * 60 * 24 * 30;

function toBase64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function encodePayload(payload: ShareAttributionPayload) {
  return toBase64Url(JSON.stringify(payload));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeAttributionEvent(value: unknown): ShareAttributionEvent | undefined {
  if (
    value === "landing" ||
    value === "login" ||
    value === "order_created" ||
    value === "paid"
  ) {
    return value;
  }

  return undefined;
}

function decodePayload(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(value)) as unknown;

    if (!isRecord(parsed)) {
      return null;
    }

    const shareSlug = readString(parsed.shareSlug);
    const reportId = readString(parsed.reportId);
    const reportType = readString(parsed.reportType);
    const source = readString(parsed.source);
    const firstSeenAt = readString(parsed.firstSeenAt);
    const lastSeenAt = readString(parsed.lastSeenAt);

    if (!shareSlug || !reportId || !reportType || !source || !firstSeenAt || !lastSeenAt) {
      return null;
    }

    return {
      shareSlug,
      reportId,
      reportType,
      source,
      firstSeenAt,
      lastSeenAt,
    } satisfies ShareAttributionPayload;
  } catch {
    return null;
  }
}

function buildPayload(input: {
  report: MockReport;
  shareSlug: string;
  source?: string;
  existing?: ShareAttributionPayload | null;
}) {
  const now = new Date().toISOString();
  const isSameShare = input.existing?.shareSlug === input.shareSlug;

  return {
    shareSlug: input.shareSlug,
    reportId: input.report.id,
    reportType: input.report.type,
    source: normalizeShareSource(input.source),
    firstSeenAt: isSameShare ? input.existing?.firstSeenAt ?? now : now,
    lastSeenAt: now,
  } satisfies ShareAttributionPayload;
}

async function writeAttributionCookie(payload: ShareAttributionPayload) {
  const cookieStore = await cookies();

  cookieStore.set(attributionCookieName, encodePayload(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: attributionMaxAgeSeconds,
  });
}

async function recordShareAttributionLog(
  metadata: ShareAttributionMetadata,
  userId?: string,
) {
  return createUsageLog({
    userId,
    provider: "internal",
    model: "share-attribution",
    feature: "share_attribution",
    costCents: 0,
    metadata,
  });
}

export async function readShareAttribution() {
  const cookieStore = await cookies();

  return decodePayload(cookieStore.get(attributionCookieName)?.value);
}

export async function recordShareAttributionLanding(input: {
  shareSlug: string;
  source?: string;
  referrer?: string;
  userAgent?: string;
}) {
  const report = await getSharedMockReport(input.shareSlug);

  if (!report || report.status !== "COMPLETED") {
    return null;
  }

  const existing = await readShareAttribution();
  const payload = buildPayload({
    report,
    shareSlug: input.shareSlug,
    source: input.source,
    existing,
  });

  await writeAttributionCookie(payload);

  return recordShareAttributionLog({
    ...payload,
    event: "landing",
    referrer: input.referrer?.slice(0, 240),
    userAgent: input.userAgent?.slice(0, 240),
  });
}

export async function recordShareAttributionConversion(input: {
  event: Exclude<ShareAttributionEvent, "landing">;
  userId: string;
  orderId?: string;
  productCode?: ProductCode;
  provider?: PaymentProviderCode;
  amountCents?: number;
  currency?: string;
}) {
  const payload = await readShareAttribution();

  if (!payload) {
    return null;
  }

  return recordShareAttributionLog(
    {
      ...payload,
      event: input.event,
      userId: input.userId,
      orderId: input.orderId,
      productCode: input.productCode,
      provider: input.provider,
      amountCents: input.amountCents,
      currency: input.currency,
    },
    input.userId,
  );
}

export function readShareAttributionMetadata(log: UsageLogRecord) {
  if (log.feature !== "share_attribution" || !isRecord(log.metadata)) {
    return undefined;
  }

  const event = normalizeAttributionEvent(log.metadata.event);
  const shareSlug = readString(log.metadata.shareSlug);
  const reportId = readString(log.metadata.reportId);
  const reportType = readString(log.metadata.reportType);
  const source = readString(log.metadata.source);
  const firstSeenAt = readString(log.metadata.firstSeenAt);
  const lastSeenAt = readString(log.metadata.lastSeenAt);

  if (!event || !shareSlug || !reportId || !reportType || !source || !firstSeenAt || !lastSeenAt) {
    return undefined;
  }

  return {
    event,
    shareSlug,
    reportId,
    reportType,
    source,
    firstSeenAt,
    lastSeenAt,
    userId: readString(log.metadata.userId),
    orderId: readString(log.metadata.orderId),
    productCode: readString(log.metadata.productCode) as ProductCode | undefined,
    provider: readString(log.metadata.provider) as PaymentProviderCode | undefined,
    amountCents: readNumber(log.metadata.amountCents),
    currency: readString(log.metadata.currency),
    referrer: readString(log.metadata.referrer),
    userAgent: readString(log.metadata.userAgent),
  } satisfies ShareAttributionMetadata;
}
