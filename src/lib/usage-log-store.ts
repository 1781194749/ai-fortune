import "server-only";

import { randomUUID } from "crypto";
import { tryPrisma } from "@/lib/prisma";

export type UsageLogInput = {
  userId?: string;
  provider: string;
  model: string;
  feature: string;
  tokensIn?: number;
  tokensOut?: number;
  imageCount?: number;
  costCents?: number;
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

export async function createUsageLog(input: UsageLogInput) {
  const dbResult = await tryPrisma(async (prisma) => {
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
        metadata: toJsonValue(input.metadata),
      },
    });

    return {
      ...input,
      id: log.id,
      imageCount: log.imageCount,
      createdAt: log.createdAt.toISOString(),
    } satisfies UsageLogRecord;
  });

  if (dbResult.ok) {
    return dbResult.value;
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
          metadata: log.metadata,
          createdAt: log.createdAt.toISOString(),
        }) satisfies UsageLogRecord,
    );
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

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
          metadata: log.metadata,
          createdAt: log.createdAt.toISOString(),
        }) satisfies UsageLogRecord,
    );
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

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
          metadata: log.metadata,
          createdAt: log.createdAt.toISOString(),
        }) satisfies UsageLogRecord,
    );
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

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
