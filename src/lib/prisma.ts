import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export type PrismaClientInstance = InstanceType<typeof PrismaClient>;

type PrismaGlobal = {
  client?: PrismaClientInstance;
  unavailable?: boolean;
  lastWarningAt?: number;
};

declare global {
  var xuanjiPrisma: PrismaGlobal | undefined;
}

const prismaGlobal = globalThis.xuanjiPrisma ?? {};

if (!globalThis.xuanjiPrisma) {
  globalThis.xuanjiPrisma = prismaGlobal;
}

function getPrismaOperationTimeoutMs() {
  const configured = Number(process.env.PRISMA_OPERATION_TIMEOUT_MS);

  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  return process.env.NODE_ENV === "production" ? 5000 : 8000;
}

function createPrismaTimeoutError(timeoutMs: number) {
  return new Error(`Prisma operation timed out after ${timeoutMs}ms`);
}

function isPrismaConnectionError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : String(error);

  return (
    ["P1001", "P1002", "P1017", "ECONNREFUSED", "ECONNRESET"].includes(code) ||
    /ECONNREFUSED|ECONNRESET|connection (?:refused|terminated)|can't reach database/i.test(
      message,
    )
  );
}

export function getPrismaClient() {
  if (prismaGlobal.unavailable || !process.env.DATABASE_URL) {
    return null;
  }

  if (!prismaGlobal.client) {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    });

    prismaGlobal.client = new PrismaClient({ adapter });
  }

  return prismaGlobal.client;
}

export function getPrismaRuntimeState(env: Record<string, string | undefined> = process.env) {
  return {
    databaseConfigured: Boolean(env.DATABASE_URL?.trim()),
    clientInitialized: Boolean(prismaGlobal.client),
    unavailable: Boolean(prismaGlobal.unavailable),
  };
}

export function retryPrismaConnection() {
  prismaGlobal.client = undefined;
  prismaGlobal.unavailable = false;
}

export async function tryPrisma<T>(
  operation: (prisma: PrismaClientInstance) => Promise<T>,
) {
  const prisma = getPrismaClient();

  if (!prisma) {
    return { ok: false as const, error: null };
  }

  const timeoutMs = getPrismaOperationTimeoutMs();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const value = await Promise.race([
      operation(prisma),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(createPrismaTimeoutError(timeoutMs)),
          timeoutMs,
        );
      }),
    ]);

    return {
      ok: true as const,
      value,
    };
  } catch (error) {
    if (isPrismaConnectionError(error)) {
      prismaGlobal.unavailable = true;
    }

    if (process.env.NODE_ENV !== "production") {
      const now = Date.now();

      if (!prismaGlobal.lastWarningAt || now - prismaGlobal.lastWarningAt >= 5000) {
        prismaGlobal.lastWarningAt = now;
        const message =
          error instanceof Error
            ? (error.message.split("\n").find((line) => line.trim()) ?? error.name)
            : String(error);
        console.warn(`Prisma operation failed; using the configured fallback. ${message}`);
      }
    }

    return { ok: false as const, error };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
