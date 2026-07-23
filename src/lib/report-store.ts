import "server-only";

import { randomUUID } from "crypto";
import { ReportStatus, ReportType } from "@/generated/prisma/enums";
import { assertDatabaseFallbackAllowed, tryPrisma } from "@/lib/prisma";
import { ensureDbUser } from "@/lib/user-store";

export type MockReportType =
  | "TAROT"
  | "BAZI_WUXING"
  | "PALM"
  | "BAGUA"
  | "COMPOSITE"
  | "YEARLY";

export type MockReportStatus = "GENERATING" | "COMPLETED" | "FAILED";

export type MockReport = {
  id: string;
  userId: string;
  type: MockReportType;
  status: MockReportStatus;
  title: string;
  summary: string;
  content: string;
  inputSnapshot: unknown;
  toolResults: unknown;
  orderId?: string;
  modelUsed?: string;
  costTokens?: number;
  requestKey?: string;
  shareSlug?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateMockReportInput = Omit<
  MockReport,
  "id" | "createdAt" | "updatedAt" | "status" | "shareSlug"
> & {
  status?: MockReportStatus;
  shareSlug?: string;
};

export type UpdateMockReportInput = {
  reportId: string;
  userId: string;
  status?: MockReportStatus;
  title?: string;
  summary?: string;
  content?: string;
  inputSnapshot?: unknown;
  toolResults?: unknown;
  modelUsed?: string;
  costTokens?: number;
  requestKey?: string | null;
  ensureShareSlug?: boolean;
};

type MockReportState = {
  reports: Map<string, MockReport>;
};

export type DbReportLike = {
  id: string;
  userId: string;
  type: string;
  status: string;
  title: string;
  summary: string | null;
  content: string | null;
  inputSnapshot: unknown;
  toolResults: unknown;
  orderId: string | null;
  modelUsed: string | null;
  costTokens: number | null;
  requestKey: string | null;
  shareSlug: string | null;
  createdAt: Date;
  updatedAt: Date;
};

declare global {
  var xuanjiMockReportState: MockReportState | undefined;
}

const state =
  globalThis.xuanjiMockReportState ??
  ({
    reports: new Map<string, MockReport>(),
  } satisfies MockReportState);

if (!globalThis.xuanjiMockReportState) {
  globalThis.xuanjiMockReportState = state;
}

export function createReportId() {
  return `report_${randomUUID()}`;
}

export function createShareSlug() {
  return `xj-${randomUUID().replace(/-/g, "").slice(0, 14)}`;
}

function requireReportDatabaseWrite() {
  assertDatabaseFallbackAllowed("PostgreSQL 暂时不可用，报告状态未变更。");
}

function requireReportDatabaseRead() {
  assertDatabaseFallbackAllowed("PostgreSQL 暂时不可用，无法读取报告数据。");
}

function toJsonValue(value: unknown) {
  if (value === undefined) {
    return undefined as never;
  }

  return JSON.parse(JSON.stringify(value)) as never;
}

export function mapDbReport(report: DbReportLike): MockReport {
  return {
    id: report.id,
    userId: report.userId,
    type: report.type as MockReportType,
    status: report.status as MockReportStatus,
    title: report.title,
    summary: report.summary ?? "",
    content: report.content ?? "",
    inputSnapshot: report.inputSnapshot,
    toolResults: report.toolResults,
    orderId: report.orderId ?? undefined,
    modelUsed: report.modelUsed ?? undefined,
    costTokens: report.costTokens ?? undefined,
    requestKey: report.requestKey ?? undefined,
    shareSlug: report.shareSlug ?? undefined,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
}

export function toDbReportType(type: MockReportType) {
  if (type === "COMPOSITE") {
    return ReportType.COMPOSITE;
  }

  if (type === "YEARLY") {
    return ReportType.YEARLY;
  }

  if (type === "BAZI_WUXING") {
    return ReportType.BAZI_WUXING;
  }

  if (type === "PALM") {
    return ReportType.PALM;
  }

  if (type === "BAGUA") {
    return ReportType.BAGUA;
  }

  return ReportType.TAROT;
}

export function toDbReportStatus(status: MockReportStatus) {
  if (status === "GENERATING") {
    return ReportStatus.GENERATING;
  }

  if (status === "FAILED") {
    return ReportStatus.FAILED;
  }

  return ReportStatus.COMPLETED;
}

export async function createMockReport(input: CreateMockReportInput) {
  const status = input.status ?? "COMPLETED";
  const shareSlug = input.shareSlug;

  const dbResult = await tryPrisma(async (prisma) => {
    await ensureDbUser(prisma, { userId: input.userId });

    const report = await prisma.report.create({
      data: {
        id: createReportId(),
        userId: input.userId,
        type: toDbReportType(input.type),
        status: toDbReportStatus(status),
        title: input.title,
        summary: input.summary,
        content: input.content,
        inputSnapshot: toJsonValue(input.inputSnapshot),
        toolResults: toJsonValue(input.toolResults),
        orderId: input.orderId,
        modelUsed: input.modelUsed,
        costTokens: input.costTokens,
        requestKey: input.requestKey,
        shareSlug,
      },
    });

    return mapDbReport(report);
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireReportDatabaseWrite();

  const report: MockReport = {
    ...input,
    id: createReportId(),
    status,
    shareSlug,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  state.reports.set(report.id, report);
  return report;
}

export async function updateMockReport(input: UpdateMockReportInput) {
  const dbResult = await tryPrisma(async (prisma) => {
    const report = await prisma.report.findUnique({ where: { id: input.reportId } });

    if (!report || report.userId !== input.userId) {
      return null;
    }

    const shouldEnsureShareSlug = input.ensureShareSlug === true;
    const data = {
      ...(input.status ? { status: toDbReportStatus(input.status) } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.inputSnapshot !== undefined
        ? { inputSnapshot: toJsonValue(input.inputSnapshot) }
        : {}),
      ...(input.toolResults !== undefined
        ? { toolResults: toJsonValue(input.toolResults) }
        : {}),
      ...(input.modelUsed !== undefined ? { modelUsed: input.modelUsed } : {}),
      ...(input.costTokens !== undefined ? { costTokens: input.costTokens } : {}),
      ...(input.requestKey !== undefined ? { requestKey: input.requestKey } : {}),
      ...(shouldEnsureShareSlug ? { shareSlug: report.shareSlug ?? createShareSlug() } : {}),
    };

    const updated = await prisma.report.update({
      where: { id: report.id },
      data,
    });

    return mapDbReport(updated);
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireReportDatabaseWrite();

  const report = state.reports.get(input.reportId);

  if (!report || report.userId !== input.userId) {
    return null;
  }

  const shouldEnsureShareSlug = input.ensureShareSlug === true;
  const updated: MockReport = {
    ...report,
    ...(input.status ? { status: input.status } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.summary !== undefined ? { summary: input.summary } : {}),
    ...(input.content !== undefined ? { content: input.content } : {}),
    ...(input.inputSnapshot !== undefined ? { inputSnapshot: input.inputSnapshot } : {}),
    ...(input.toolResults !== undefined ? { toolResults: input.toolResults } : {}),
    ...(input.modelUsed !== undefined ? { modelUsed: input.modelUsed } : {}),
    ...(input.costTokens !== undefined ? { costTokens: input.costTokens } : {}),
    ...(input.requestKey !== undefined
      ? { requestKey: input.requestKey ?? undefined }
      : {}),
    ...(shouldEnsureShareSlug ? { shareSlug: report.shareSlug ?? createShareSlug() } : {}),
    updatedAt: new Date().toISOString(),
  };

  state.reports.set(input.reportId, updated);
  return updated;
}

export async function getMockReport(reportId: string) {
  const dbResult = await tryPrisma(async (prisma) => {
    const report = await prisma.report.findUnique({ where: { id: reportId } });
    return report ? mapDbReport(report) : null;
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireReportDatabaseRead();

  return state.reports.get(reportId) ?? null;
}

export async function getSharedMockReport(shareSlug: string) {
  const dbResult = await tryPrisma(async (prisma) => {
    const report = await prisma.report.findUnique({ where: { shareSlug } });
    return report ? mapDbReport(report) : null;
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireReportDatabaseRead();

  return (
    Array.from(state.reports.values()).find((report) => report.shareSlug === shareSlug) ??
    null
  );
}

export async function getUserMockReportByOrderId(input: { userId: string; orderId: string }) {
  const dbResult = await tryPrisma(async (prisma) => {
    const report = await prisma.report.findFirst({
      where: {
        userId: input.userId,
        orderId: input.orderId,
      },
      orderBy: { createdAt: "desc" },
    });

    return report ? mapDbReport(report) : null;
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireReportDatabaseRead();

  return (
    Array.from(state.reports.values()).find(
      (report) => report.userId === input.userId && report.orderId === input.orderId,
    ) ?? null
  );
}

export async function updateMockReportShare(input: {
  reportId: string;
  userId: string;
  enabled: boolean;
}) {
  const dbResult = await tryPrisma(async (prisma) => {
    const report = await prisma.report.findUnique({ where: { id: input.reportId } });

    if (!report || report.userId !== input.userId) {
      return null;
    }

    const updated = await prisma.report.update({
      where: { id: report.id },
      data: {
        shareSlug: input.enabled ? report.shareSlug ?? createShareSlug() : null,
      },
    });

    return mapDbReport(updated);
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireReportDatabaseWrite();

  const report = state.reports.get(input.reportId);

  if (!report || report.userId !== input.userId) {
    return null;
  }

  const updated = {
    ...report,
    shareSlug: input.enabled ? report.shareSlug ?? createShareSlug() : undefined,
    updatedAt: new Date().toISOString(),
  };

  state.reports.set(input.reportId, updated);
  return updated;
}

export async function getUserMockReports(userId: string) {
  const dbResult = await tryPrisma(async (prisma) => {
    const reports = await prisma.report.findMany({
      where: {
        userId,
        type: {
          in: [
            ReportType.TAROT,
            ReportType.BAZI_WUXING,
            ReportType.PALM,
            ReportType.BAGUA,
            ReportType.COMPOSITE,
            ReportType.YEARLY,
          ],
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return reports.map(mapDbReport);
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireReportDatabaseRead();

  return Array.from(state.reports.values())
    .filter((report) => report.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getAdminReports(input: { take?: number } = {}) {
  const take = Math.min(Math.max(input.take ?? 50, 1), 500);
  const dbResult = await tryPrisma(async (prisma) => {
    const reports = await prisma.report.findMany({
      orderBy: { createdAt: "desc" },
      take,
    });

    return reports.map(mapDbReport);
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireReportDatabaseRead();

  return Array.from(state.reports.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, take);
}
