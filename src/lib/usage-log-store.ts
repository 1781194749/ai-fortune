import "server-only";

import { randomUUID } from "crypto";
import { assertDatabaseFallbackAllowed, tryPrisma } from "@/lib/prisma";

export type UsageLogInput = {
  userId?: string;
  provider: string;
  model: string;
  feature: string;
  tokensIn?: number;
  tokensOut?: number;
  imageCount?: number;
  costCents?: number;
  idempotencyKey?: string;
  metadata?: unknown;
};

export type UsageLogRecord = UsageLogInput & {
  id: string;
  createdAt: string;
};

export type UsageLogStoreMode = "database" | "memory" | "memory_fallback";

export type UsageLogStoreStatus = {
  mode: UsageLogStoreMode;
  databaseConfigured: boolean;
  featureCounts: Record<string, number>;
};

declare global {
  var xuanjiUsageLogs: UsageLogRecord[] | undefined;
}

const usageLogs = globalThis.xuanjiUsageLogs ?? [];

if (!globalThis.xuanjiUsageLogs) {
  globalThis.xuanjiUsageLogs = usageLogs;
}

function toJsonValue(value: unknown) {
  if (value === undefined) {
    return undefined as never;
  }

  return JSON.parse(JSON.stringify(value)) as never;
}

function requireUsageLogDatabaseWrite() {
  assertDatabaseFallbackAllowed("PostgreSQL 暂时不可用，用量日志未写入。");
}

function requireUsageLogDatabaseRead() {
  assertDatabaseFallbackAllowed("PostgreSQL 暂时不可用，无法读取用量日志。");
}

function mapDbUsageLog(
  log: {
    id: string;
    userId: string | null;
    provider: string;
    model: string;
    feature: string;
    tokensIn: number | null;
    tokensOut: number | null;
    imageCount: number;
    costCents: number | null;
    idempotencyKey: string | null;
    metadata: unknown;
    createdAt: Date;
  },
  input?: UsageLogInput,
) {
  return {
    userId: log.userId ?? input?.userId,
    provider: log.provider,
    model: log.model,
    feature: log.feature,
    tokensIn: log.tokensIn ?? undefined,
    tokensOut: log.tokensOut ?? undefined,
    imageCount: log.imageCount,
    costCents: log.costCents ?? undefined,
    idempotencyKey: log.idempotencyKey ?? undefined,
    metadata: log.metadata,
    id: log.id,
    createdAt: log.createdAt.toISOString(),
  } satisfies UsageLogRecord;
}

export async function createUsageLog(input: UsageLogInput) {
  const dbResult = await tryPrisma(async (prisma) => {
    if (input.idempotencyKey) {
      const existing = await prisma.usageLog.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });

      if (existing) {
        return mapDbUsageLog(existing, input);
      }
    }

    try {
      const log = await prisma.usageLog.create({
        data: {
          userId: input.userId,
          provider: input.provider,
          model: input.model,
          feature: input.feature,
          tokensIn: input.tokensIn,
          tokensOut: input.tokensOut,
          imageCount: input.imageCount ?? 0,
          costCents: input.costCents,
          idempotencyKey: input.idempotencyKey,
          metadata: toJsonValue(input.metadata),
        },
      });

      return mapDbUsageLog(log, input);
    } catch (error) {
      if (
        input.idempotencyKey &&
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        const existing = await prisma.usageLog.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });

        if (existing) {
          return mapDbUsageLog(existing, input);
        }
      }

      throw error;
    }
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireUsageLogDatabaseWrite();

  if (input.idempotencyKey) {
    const existing = usageLogs.find((log) => log.idempotencyKey === input.idempotencyKey);

    if (existing) {
      return existing;
    }
  }

  const record: UsageLogRecord = {
    ...input,
    id: `usage_${randomUUID()}`,
    imageCount: input.imageCount ?? 0,
    createdAt: new Date().toISOString(),
  };

  usageLogs.push(record);
  return record;
}

export async function getUserUsageLogs(userId: string) {
  const dbResult = await tryPrisma(async (prisma) => {
    const logs = await prisma.usageLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return logs.map(
      (log) =>
        ({
          id: log.id,
          userId: log.userId ?? undefined,
          provider: log.provider,
          model: log.model,
          feature: log.feature,
          tokensIn: log.tokensIn ?? undefined,
          tokensOut: log.tokensOut ?? undefined,
          imageCount: log.imageCount,
          costCents: log.costCents ?? undefined,
          idempotencyKey: log.idempotencyKey ?? undefined,
          metadata: log.metadata,
          createdAt: log.createdAt.toISOString(),
        }) satisfies UsageLogRecord,
    );
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireUsageLogDatabaseRead();

  return usageLogs
    .filter((log) => log.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);
}

export async function getAdminUsageLogs(input: { take?: number } = {}) {
  const take = Math.min(Math.max(input.take ?? 50, 1), 500);

  const dbResult = await tryPrisma(async (prisma) => {
    const logs = await prisma.usageLog.findMany({
      orderBy: { createdAt: "desc" },
      take,
    });

    return logs.map(
      (log) =>
        ({
          id: log.id,
          userId: log.userId ?? undefined,
          provider: log.provider,
          model: log.model,
          feature: log.feature,
          tokensIn: log.tokensIn ?? undefined,
          tokensOut: log.tokensOut ?? undefined,
          imageCount: log.imageCount,
          costCents: log.costCents ?? undefined,
          idempotencyKey: log.idempotencyKey ?? undefined,
          metadata: log.metadata,
          createdAt: log.createdAt.toISOString(),
        }) satisfies UsageLogRecord,
    );
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireUsageLogDatabaseRead();

  return [...usageLogs]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, take);
}

export async function getUsageLogsByFeature(feature: string, input: { take?: number } = {}) {
  const take = Math.min(Math.max(input.take ?? 500, 1), 5000);

  const dbResult = await tryPrisma(async (prisma) => {
    const logs = await prisma.usageLog.findMany({
      where: { feature },
      orderBy: { createdAt: "desc" },
      take,
    });

    return logs.map(
      (log) =>
        ({
          id: log.id,
          userId: log.userId ?? undefined,
          provider: log.provider,
          model: log.model,
          feature: log.feature,
          tokensIn: log.tokensIn ?? undefined,
          tokensOut: log.tokensOut ?? undefined,
          imageCount: log.imageCount,
          costCents: log.costCents ?? undefined,
          idempotencyKey: log.idempotencyKey ?? undefined,
          metadata: log.metadata,
          createdAt: log.createdAt.toISOString(),
        }) satisfies UsageLogRecord,
    );
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireUsageLogDatabaseRead();

  return usageLogs
    .filter((log) => log.feature === feature)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, take);
}

function countMemoryLogsByFeature(features: string[]) {
  return Object.fromEntries(
    features.map((feature) => [
      feature,
      usageLogs.filter((log) => log.feature === feature).length,
    ]),
  );
}

export async function getUsageLogStoreStatus(features: string[] = []) {
  const normalizedFeatures = Array.from(new Set(features.filter(Boolean)));
  const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());
  const dbResult = await tryPrisma(async (prisma) => {
    const entries = await Promise.all(
      normalizedFeatures.map(async (feature) => [
        feature,
        await prisma.usageLog.count({ where: { feature } }),
      ] as const),
    );

    return Object.fromEntries(entries);
  });

  if (dbResult.ok) {
    return {
      mode: "database",
      databaseConfigured,
      featureCounts: dbResult.value,
    } satisfies UsageLogStoreStatus;
  }

  return {
    mode: databaseConfigured ? "memory_fallback" : "memory",
    databaseConfigured,
    featureCounts: countMemoryLogsByFeature(normalizedFeatures),
  } satisfies UsageLogStoreStatus;
}
