import "server-only";

import { randomUUID } from "crypto";
import {
  DeepReportJobStatus,
  EntitlementKind,
  ReportStatus,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { getProduct, type ProductCode } from "@/lib/commerce";
import {
  buildPaidDeepReport,
  createDeepReportGenerationInputSnapshot,
  getDeepReportType,
  isDeepReportProductCode,
  type DeepReportGenerationInputSnapshot,
  type DeepReportProductCode,
} from "@/lib/deep-report";
import { assertDeepReportReady } from "@/lib/deep-report-readiness";
import { enqueueDeepReportJob } from "@/lib/deep-report-queue";
import {
  refundMemberEntitlement,
  spendMemberEntitlementInTransaction,
  type MemberEntitlementBalance,
} from "@/lib/entitlement-store";
import { getPrismaClient, type PrismaClientInstance } from "@/lib/prisma";
import {
  createReportId,
  mapDbReport,
  toDbReportStatus,
  toDbReportType,
  type MockReport,
} from "@/lib/report-store";
import { ensureDbUser } from "@/lib/user-store";

type DeepReportEntitlement = {
  paymentSource: "membership_quota";
  entitlementKind: "deep_report";
};
type DeepReportTx = Prisma.TransactionClient;

export type DeepReportAcceptanceResult = {
  report: MockReport;
  jobId: string;
  reused: boolean;
  queued: boolean;
  dispatchQueued: boolean;
  entitlement?: MemberEntitlementBalance;
};

export class InsufficientDeepReportEntitlementError extends Error {
  readonly balance: MemberEntitlementBalance;

  constructor(balance: MemberEntitlementBalance) {
    super("深度报告额度不足，请购买会员或单次报告。");
    this.name = "InsufficientDeepReportEntitlementError";
    this.balance = balance;
  }
}

function requirePrisma() {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new Error("PostgreSQL 暂时不可用，深度报告任务未创建。");
  }

  return prisma;
}

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as never;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function nextDispatchDate(delayMs = 60_000) {
  return new Date(Date.now() + delayMs);
}

function getDispatchRetryDelayMs() {
  const configured = Number(process.env.DEEP_REPORT_DISPATCH_RETRY_MS);

  return Number.isFinite(configured) && configured > 0 ? configured : 60_000;
}

function getWorkerAttempts() {
  const configured = Number(process.env.DEEP_REPORT_QUEUE_ATTEMPTS);

  return Number.isFinite(configured) && configured > 0 ? configured : 5;
}

function getStaleRunningMs() {
  const configured = Number(process.env.DEEP_REPORT_RUNNING_STALE_MS);

  return Number.isFinite(configured) && configured > 0 ? configured : 30 * 60_000;
}

function getStaleQueuedMs() {
  const configured = Number(process.env.DEEP_REPORT_QUEUED_STALE_MS);

  return Number.isFinite(configured) && configured > 0 ? configured : 30 * 60_000;
}

export function getPendingDeepReportText(productCode: DeepReportProductCode) {
  const product = getProduct(productCode);

  return {
    title: `${product?.name ?? "深度报告"}生成中`,
    summary: "深度报告已进入生成队列，系统正在整理会员档案、命理结构和报告正文。",
    content: "报告正在生成中，请稍后查看完整正文。",
  };
}

export function getDeepReportOrderRequestKey(input: {
  orderId: string;
  productCode: DeepReportProductCode;
}) {
  return `deep-report:order:${input.orderId}:${input.productCode}`;
}

function getDeepReportMemberRequestKey(input: {
  userId: string;
  productCode: DeepReportProductCode;
}) {
  return `deep-report:member:${input.userId}:${input.productCode}:${randomUUID()}`;
}

async function markDispatchFailed(input: {
  prisma: PrismaClientInstance;
  jobId: string;
  error: unknown;
}) {
  await input.prisma.deepReportJob.updateMany({
    where: {
      id: input.jobId,
      status: DeepReportJobStatus.PENDING_DISPATCH,
    },
    data: {
      lastError: getErrorMessage(input.error).slice(0, 1000),
      nextDispatchAt: nextDispatchDate(getDispatchRetryDelayMs()),
    },
  });
}

export async function dispatchDeepReportJob(jobId: string) {
  const prisma = requirePrisma();

  try {
    const redisJobId = await enqueueDeepReportJob({ jobId });
    const updated = await prisma.deepReportJob.updateMany({
      where: {
        id: jobId,
        status: DeepReportJobStatus.PENDING_DISPATCH,
      },
      data: {
        status: DeepReportJobStatus.QUEUED,
        redisJobId,
        queuedAt: new Date(),
        nextDispatchAt: null,
        lastError: null,
      },
    });

    return {
      ok: true as const,
      queued: updated.count > 0,
      redisJobId,
    };
  } catch (error) {
    await markDispatchFailed({ prisma, jobId, error }).catch(() => undefined);

    if (process.env.NODE_ENV !== "production") {
      console.warn(`Deep report dispatch failed. ${getErrorMessage(error)}`);
    }

    return {
      ok: false as const,
      queued: false,
      error,
    };
  }
}

async function dispatchAcceptedJob(result: {
  report: MockReport;
  jobId: string;
  reused: boolean;
  entitlement?: MemberEntitlementBalance;
}) {
  if (result.report.status !== "GENERATING") {
    return {
      ...result,
      queued: false,
      dispatchQueued: false,
    } satisfies DeepReportAcceptanceResult;
  }

  const dispatch = await dispatchDeepReportJob(result.jobId);

  return {
    ...result,
    queued: true,
    dispatchQueued: dispatch.ok && dispatch.queued,
  } satisfies DeepReportAcceptanceResult;
}

async function resetExistingJobForRetry(input: {
  tx: DeepReportTx;
  report: { id: string; userId: string; orderId: string | null; requestKey: string | null };
  requestKey: string;
  productCode: DeepReportProductCode;
  generationInput: DeepReportGenerationInputSnapshot;
  entitlement?: DeepReportEntitlement;
  operator?: string;
}) {
  const pendingText = getPendingDeepReportText(input.productCode);
  const updatedReport = await input.tx.report.update({
    where: { id: input.report.id },
    data: {
      requestKey: input.report.requestKey ?? input.requestKey,
      status: toDbReportStatus("GENERATING"),
      ...pendingText,
      inputSnapshot: toJsonValue({
        ...input.generationInput,
        status: "queued",
      }),
      toolResults: toJsonValue({
        analyzer: "deep_report_async_job",
        status: "retrying",
        orderId: input.report.orderId,
        productCode: input.productCode,
        paymentSource: input.entitlement?.paymentSource,
        entitlementKind: input.entitlement?.entitlementKind,
        operator: input.operator,
      }),
      modelUsed: "pending",
      costTokens: 0,
    },
  });
  const existingJob = await input.tx.deepReportJob.findUnique({
    where: { reportId: input.report.id },
  });
  const job = existingJob
    ? await input.tx.deepReportJob.update({
        where: { id: existingJob.id },
        data: {
          requestKey: existingJob.requestKey || input.requestKey,
          productCode: input.productCode,
          status: DeepReportJobStatus.PENDING_DISPATCH,
          inputSnapshot: toJsonValue(existingJob.inputSnapshot ?? input.generationInput),
          paymentSource: input.entitlement?.paymentSource,
          entitlementKind: input.entitlement
            ? EntitlementKind.DEEP_REPORT
            : existingJob.entitlementKind,
          attempts: 0,
          redisJobId: null,
          lastError: null,
          queuedAt: null,
          startedAt: null,
          completedAt: null,
          failedAt: null,
          nextDispatchAt: new Date(),
        },
      })
    : await input.tx.deepReportJob.create({
        data: {
          requestKey: input.requestKey,
          userId: input.report.userId,
          reportId: input.report.id,
          orderId: input.report.orderId,
          productCode: input.productCode,
          status: DeepReportJobStatus.PENDING_DISPATCH,
          inputSnapshot: toJsonValue(input.generationInput),
          paymentSource: input.entitlement?.paymentSource,
          entitlementKind: input.entitlement ? EntitlementKind.DEEP_REPORT : undefined,
          nextDispatchAt: new Date(),
        },
      });

  return {
    report: mapDbReport(updatedReport),
    job,
  };
}

async function createPendingReportAndJob(input: {
  tx: DeepReportTx;
  userId: string;
  orderId?: string;
  requestKey: string;
  productCode: DeepReportProductCode;
  generationInput: DeepReportGenerationInputSnapshot;
  entitlement?: DeepReportEntitlement;
}) {
  const pendingText = getPendingDeepReportText(input.productCode);
  const report = await input.tx.report.create({
    data: {
      id: createReportId(),
      userId: input.userId,
      orderId: input.orderId,
      type: toDbReportType(getDeepReportType(input.productCode)),
      status: ReportStatus.GENERATING,
      title: pendingText.title,
      summary: pendingText.summary,
      content: pendingText.content,
      inputSnapshot: toJsonValue({
        ...input.generationInput,
        status: "queued",
      }),
      toolResults: toJsonValue({
        analyzer: "deep_report_async_job",
        status: "queued",
        orderId: input.orderId,
        productCode: input.productCode,
        paymentSource: input.entitlement?.paymentSource,
        entitlementKind: input.entitlement?.entitlementKind,
      }),
      modelUsed: "pending",
      costTokens: 0,
      requestKey: input.requestKey,
    },
  });
  const job = await input.tx.deepReportJob.create({
    data: {
      requestKey: input.requestKey,
      userId: input.userId,
      reportId: report.id,
      orderId: input.orderId,
      productCode: input.productCode,
      status: DeepReportJobStatus.PENDING_DISPATCH,
      inputSnapshot: toJsonValue(input.generationInput),
      paymentSource: input.entitlement?.paymentSource,
      entitlementKind: input.entitlement ? EntitlementKind.DEEP_REPORT : undefined,
      nextDispatchAt: new Date(),
    },
  });

  return {
    report,
    job,
  };
}

export async function createDeepReportForPaidOrder(input: {
  userId: string;
  orderId: string;
  productCode: DeepReportProductCode;
}) {
  const prisma = requirePrisma();
  const requestKey = getDeepReportOrderRequestKey(input);
  const generationInput = await createDeepReportGenerationInputSnapshot({
    userId: input.userId,
    orderId: input.orderId,
    productCode: input.productCode,
  });
  const accepted = await prisma.$transaction(async (tx) => {
    await ensureDbUser(tx, { userId: input.userId });

    const existingJob = await tx.deepReportJob.findUnique({
      where: { requestKey },
      include: { report: true },
    });

    if (existingJob) {
      if (existingJob.report.status === ReportStatus.FAILED) {
        const retried = await resetExistingJobForRetry({
          tx,
          report: existingJob.report,
          requestKey,
          productCode: input.productCode,
          generationInput,
        });

        return {
          report: retried.report,
          jobId: retried.job.id,
          reused: false,
        };
      }

      return {
        report: mapDbReport(existingJob.report),
        jobId: existingJob.id,
        reused: true,
      };
    }

    const legacyReport = await tx.report.findFirst({
      where: {
        userId: input.userId,
        orderId: input.orderId,
      },
      orderBy: { createdAt: "desc" },
    });

    if (legacyReport) {
      const retried = legacyReport.status === ReportStatus.FAILED
        ? await resetExistingJobForRetry({
            tx,
            report: legacyReport,
            requestKey,
            productCode: input.productCode,
            generationInput,
          })
        : await (async () => {
            const updatedReport = await tx.report.update({
              where: { id: legacyReport.id },
              data: { requestKey },
            });
            const existingLegacyJob = await tx.deepReportJob.findUnique({
              where: { reportId: legacyReport.id },
            });
            const job = existingLegacyJob ??
              (await tx.deepReportJob.create({
                data: {
                  requestKey,
                  userId: input.userId,
                  reportId: legacyReport.id,
                  orderId: input.orderId,
                  productCode: input.productCode,
                  status:
                    legacyReport.status === ReportStatus.GENERATING
                      ? DeepReportJobStatus.PENDING_DISPATCH
                      : DeepReportJobStatus.COMPLETED,
                  inputSnapshot: toJsonValue(generationInput),
                  nextDispatchAt:
                    legacyReport.status === ReportStatus.GENERATING
                      ? new Date()
                      : undefined,
                  completedAt:
                    legacyReport.status === ReportStatus.COMPLETED
                      ? new Date()
                      : undefined,
                },
              }));

            return {
              report: mapDbReport(updatedReport),
              job,
            };
          })();

      return {
        report: retried.report,
        jobId: retried.job.id,
        reused: legacyReport.status !== ReportStatus.FAILED,
      };
    }

    const created = await createPendingReportAndJob({
      tx,
      userId: input.userId,
      orderId: input.orderId,
      requestKey,
      productCode: input.productCode,
      generationInput,
    });

    return {
      report: mapDbReport(created.report),
      jobId: created.job.id,
      reused: false,
    };
  });

  return dispatchAcceptedJob(accepted);
}

export async function createDeepReportWithMemberQuota(input: {
  userId: string;
  productCode: DeepReportProductCode;
}) {
  const prisma = requirePrisma();
  const entitlement = {
    paymentSource: "membership_quota",
    entitlementKind: "deep_report",
  } satisfies DeepReportEntitlement;
  const requestKey = getDeepReportMemberRequestKey(input);
  const generationInput = await createDeepReportGenerationInputSnapshot({
    userId: input.userId,
    productCode: input.productCode,
    entitlement,
  });
  const accepted = await prisma.$transaction(async (tx) => {
    await ensureDbUser(tx, { userId: input.userId });

    const created = await createPendingReportAndJob({
      tx,
      userId: input.userId,
      requestKey,
      productCode: input.productCode,
      generationInput,
      entitlement,
    });
    const report = mapDbReport(created.report);
    const spend = await spendMemberEntitlementInTransaction(tx, {
      userId: input.userId,
      kind: "deep_report",
      reportId: report.id,
      reason: `${report.title} 使用 1 份会员深度报告额度`,
      metadata: {
        productCode: input.productCode,
      },
    });

    if (!spend.ok) {
      throw new InsufficientDeepReportEntitlementError(spend.balance);
    }

    return {
      report,
      jobId: created.job.id,
      reused: false,
      entitlement: spend.balance,
    };
  });

  return dispatchAcceptedJob(accepted);
}

export async function retryDeepReport(input: {
  report: MockReport;
  productCode: DeepReportProductCode;
  operator?: string;
  entitlement?: DeepReportEntitlement;
}) {
  const prisma = requirePrisma();
  const requestKey =
    input.report.requestKey ??
    (input.report.orderId
      ? getDeepReportOrderRequestKey({
          orderId: input.report.orderId,
          productCode: input.productCode,
        })
      : getDeepReportMemberRequestKey({
          userId: input.report.userId,
          productCode: input.productCode,
        }));
  const existingJob = await prisma.deepReportJob.findUnique({
    where: { reportId: input.report.id },
  });
  const generationInput =
    (existingJob?.inputSnapshot as DeepReportGenerationInputSnapshot | undefined) ??
    (await createDeepReportGenerationInputSnapshot({
      userId: input.report.userId,
      orderId: input.report.orderId,
      productCode: input.productCode,
      entitlement: input.entitlement,
    }));
  const accepted = await prisma.$transaction(async (tx) => {
    const report = await tx.report.findUnique({ where: { id: input.report.id } });

    if (!report || report.userId !== input.report.userId) {
      return null;
    }

    if (report.status === ReportStatus.COMPLETED) {
      return {
        report: mapDbReport(report),
        jobId: existingJob?.id ?? "",
        reused: true,
      };
    }

    const retried = await resetExistingJobForRetry({
      tx,
      report,
      requestKey,
      productCode: input.productCode,
      generationInput,
      entitlement: input.entitlement,
      operator: input.operator,
    });

    return {
      report: retried.report,
      jobId: retried.job.id,
      reused: false,
    };
  });

  if (!accepted || !accepted.jobId) {
    return null;
  }

  return dispatchAcceptedJob(accepted);
}

export async function retryDeepReportWithMemberQuota(input: {
  report: MockReport;
  productCode: DeepReportProductCode;
}) {
  const prisma = requirePrisma();
  const entitlement = {
    paymentSource: "membership_quota",
    entitlementKind: "deep_report",
  } satisfies DeepReportEntitlement;
  const requestKey =
    input.report.requestKey ??
    getDeepReportMemberRequestKey({
      userId: input.report.userId,
      productCode: input.productCode,
    });
  const existingJob = await prisma.deepReportJob.findUnique({
    where: { reportId: input.report.id },
  });
  const generationInput =
    (existingJob?.inputSnapshot as DeepReportGenerationInputSnapshot | undefined) ??
    (await createDeepReportGenerationInputSnapshot({
      userId: input.report.userId,
      productCode: input.productCode,
      entitlement,
    }));
  const accepted = await prisma.$transaction(async (tx) => {
    const report = await tx.report.findUnique({ where: { id: input.report.id } });

    if (!report || report.userId !== input.report.userId) {
      return null;
    }

    if (report.status === ReportStatus.COMPLETED) {
      return {
        report: mapDbReport(report),
        jobId: existingJob?.id ?? "",
        reused: true,
      };
    }

    let entitlementBalance: MemberEntitlementBalance | undefined;

    if (report.status === ReportStatus.FAILED) {
      const spend = await spendMemberEntitlementInTransaction(tx, {
        userId: report.userId,
        kind: "deep_report",
        reportId: report.id,
        reason: `${report.title} 重新生成使用 1 份会员深度报告额度`,
        metadata: {
          productCode: input.productCode,
          retry: true,
        },
      });

      if (!spend.ok) {
        throw new InsufficientDeepReportEntitlementError(spend.balance);
      }

      entitlementBalance = spend.balance;
    }

    const retried = await resetExistingJobForRetry({
      tx,
      report,
      requestKey,
      productCode: input.productCode,
      generationInput,
      entitlement,
    });

    return {
      report: retried.report,
      jobId: retried.job.id,
      reused: false,
      entitlement: entitlementBalance,
    };
  });

  if (!accepted || !accepted.jobId) {
    return null;
  }

  return dispatchAcceptedJob(accepted);
}

export async function startDeepReportJob(input: {
  report: MockReport;
  userId: string;
  productCode: DeepReportProductCode;
  orderId?: string;
  entitlement?: DeepReportEntitlement;
}) {
  const result = await retryDeepReport({
    report: input.report,
    productCode: input.productCode,
    entitlement: input.entitlement,
  });

  return Boolean(result?.dispatchQueued);
}

export async function retryQueuedDeepReport(input: {
  report: MockReport;
  productCode: DeepReportProductCode;
  operator?: string;
  entitlement?: DeepReportEntitlement;
}) {
  const result = await retryDeepReport(input);

  return result?.report ?? null;
}

function getJobEntitlement(
  job: {
    paymentSource: string | null;
    entitlementKind: EntitlementKind | null;
  },
): DeepReportEntitlement | undefined {
  if (job.paymentSource !== "membership_quota" || job.entitlementKind !== EntitlementKind.DEEP_REPORT) {
    return undefined;
  }

  return {
    paymentSource: "membership_quota",
    entitlementKind: "deep_report",
  };
}

function isRetryableDeepReportError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as {
    status?: number;
    statusCode?: number;
    code?: string;
    message?: string;
  };
  const status = record.status ?? record.statusCode;

  if (typeof status === "number") {
    return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
  }

  const code = record.code?.toUpperCase();

  if (
    code &&
    [
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "ENOTFOUND",
      "EAI_AGAIN",
      "UND_ERR_CONNECT_TIMEOUT",
    ].includes(code)
  ) {
    return true;
  }

  return /timeout|temporarily unavailable|rate limit|overloaded|connection/i.test(
    record.message ?? getErrorMessage(error),
  );
}

async function markDeepReportRetryableFailure(input: {
  jobId: string;
  error: unknown;
}) {
  const prisma = requirePrisma();

  await prisma.deepReportJob.updateMany({
    where: {
      id: input.jobId,
      status: DeepReportJobStatus.RUNNING,
    },
    data: {
      status: DeepReportJobStatus.QUEUED,
      lastError: getErrorMessage(input.error).slice(0, 1000),
      nextDispatchAt: null,
    },
  });
}

async function markDeepReportFinalFailure(input: {
  jobId: string;
  error: unknown;
}) {
  const prisma = requirePrisma();
  const job = await prisma.deepReportJob.findUnique({
    where: { id: input.jobId },
    include: { report: true },
  });

  if (!job || job.status === DeepReportJobStatus.COMPLETED) {
    return;
  }

  if (job.report.status === ReportStatus.COMPLETED) {
    await prisma.deepReportJob.update({
      where: { id: job.id },
      data: {
        status: DeepReportJobStatus.COMPLETED,
        completedAt: new Date(),
        failedAt: null,
        lastError: null,
      },
    });
    return;
  }

  const message = getErrorMessage(input.error);
  const refundTransaction = getJobEntitlement(job)
    ? await refundMemberEntitlement({
        userId: job.userId,
        kind: "deep_report",
        reportId: job.reportId,
        reason: "深度报告生成最终失败，退回 1 份会员报告额度",
        idempotencyKey: `deep-report:${job.id}:refund`,
        metadata: {
          productCode: job.productCode,
          error: message,
        },
      }).catch((error) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn(`Deep report entitlement refund failed. ${getErrorMessage(error)}`);
        }

        return null;
      })
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.report.updateMany({
      where: {
        id: job.reportId,
        status: { not: ReportStatus.COMPLETED },
      },
      data: {
        status: ReportStatus.FAILED,
        summary: "深度报告生成失败，请稍后重试。",
        content: job.orderId
          ? "本次生成没有完成，订单仍然有效，可以重新发起生成。"
          : "本次生成没有完成，会员报告额度已退回，可以重新发起生成。",
        toolResults: toJsonValue({
          analyzer: "deep_report_async_job",
          status: "failed",
          error: message,
          entitlementRefundTransactionId: refundTransaction?.id,
        }),
        modelUsed: "generation-failed",
        costTokens: 0,
      },
    });
    await tx.deepReportJob.updateMany({
      where: {
        id: job.id,
        status: { not: DeepReportJobStatus.COMPLETED },
      },
      data: {
        status: DeepReportJobStatus.FAILED,
        lastError: message.slice(0, 1000),
        failedAt: new Date(),
        nextDispatchAt: null,
      },
    });
  });
}

export async function processDeepReportJob(input: {
  jobId: string;
  attempt?: number;
  maxAttempts?: number;
}) {
  const prisma = requirePrisma();
  const maxAttempts = input.maxAttempts ?? getWorkerAttempts();
  const attempt = input.attempt ?? 1;
  const claimed = await prisma.deepReportJob.updateMany({
    where: {
      id: input.jobId,
      status: {
        in: [DeepReportJobStatus.PENDING_DISPATCH, DeepReportJobStatus.QUEUED],
      },
    },
    data: {
      status: DeepReportJobStatus.RUNNING,
      startedAt: new Date(),
      failedAt: null,
      lastError: null,
      attempts: { increment: 1 },
    },
  });

  if (claimed.count === 0) {
    const current = await prisma.deepReportJob.findUnique({
      where: { id: input.jobId },
    });

    if (!current || current.status === DeepReportJobStatus.COMPLETED) {
      return;
    }

    if (current.status === DeepReportJobStatus.RUNNING) {
      return;
    }

    if (current.status === DeepReportJobStatus.FAILED) {
      throw new Error(`Deep report job ${input.jobId} is already failed.`);
    }
  }

  const job = await prisma.deepReportJob.findUniqueOrThrow({
    where: { id: input.jobId },
  });

  if (!isDeepReportProductCode(job.productCode)) {
    const error = new Error(`Unknown deep report product: ${job.productCode}`);
    await markDeepReportFinalFailure({ jobId: job.id, error });
    return;
  }

  try {
    await assertDeepReportReady({
      userId: job.userId,
      productCode: job.productCode,
    });
    const draft = await buildPaidDeepReport({
      userId: job.userId,
      productCode: job.productCode,
      orderId: job.orderId ?? undefined,
      entitlement: getJobEntitlement(job),
      generationInput: job.inputSnapshot as DeepReportGenerationInputSnapshot,
      usageIdempotencyKey: `deep-report:${job.id}:usage`,
    });

    await prisma.$transaction(async (tx) => {
      await tx.report.updateMany({
        where: {
          id: job.reportId,
          status: { not: ReportStatus.COMPLETED },
        },
        data: {
          status: ReportStatus.COMPLETED,
          title: draft.title,
          summary: draft.summary,
          content: draft.content,
          inputSnapshot: toJsonValue(draft.inputSnapshot),
          toolResults: toJsonValue(draft.toolResults),
          modelUsed: draft.modelUsed,
          costTokens: draft.costTokens,
        },
      });
      await tx.deepReportJob.updateMany({
        where: {
          id: job.id,
          status: { not: DeepReportJobStatus.COMPLETED },
        },
        data: {
          status: DeepReportJobStatus.COMPLETED,
          completedAt: new Date(),
          failedAt: null,
          lastError: null,
          nextDispatchAt: null,
        },
      });
    });
  } catch (error) {
    const shouldRetry = isRetryableDeepReportError(error) && attempt < maxAttempts;

    if (shouldRetry) {
      await markDeepReportRetryableFailure({ jobId: job.id, error });
      throw error;
    }

    await markDeepReportFinalFailure({ jobId: job.id, error });
  }
}

export async function dispatchPendingDeepReportJobs(input: { take?: number } = {}) {
  const prisma = requirePrisma();
  const now = new Date();
  const take = Math.min(Math.max(input.take ?? 50, 1), 500);
  const staleRunningBefore = new Date(Date.now() - getStaleRunningMs());
  const staleQueuedBefore = new Date(Date.now() - getStaleQueuedMs());

  const [resetRunning, resetQueued] = await Promise.all([
    prisma.deepReportJob.updateMany({
      where: {
        status: DeepReportJobStatus.RUNNING,
        updatedAt: { lt: staleRunningBefore },
      },
      data: {
        status: DeepReportJobStatus.PENDING_DISPATCH,
        lastError: "Worker heartbeat stale; redispatching.",
        nextDispatchAt: now,
      },
    }),
    prisma.deepReportJob.updateMany({
      where: {
        status: DeepReportJobStatus.QUEUED,
        updatedAt: { lt: staleQueuedBefore },
      },
      data: {
        status: DeepReportJobStatus.PENDING_DISPATCH,
        lastError: "Redis queue state stale; redispatching.",
        nextDispatchAt: now,
      },
    }),
  ]);
  const jobs = await prisma.deepReportJob.findMany({
    where: {
      status: DeepReportJobStatus.PENDING_DISPATCH,
      OR: [{ nextDispatchAt: null }, { nextDispatchAt: { lte: now } }],
    },
    orderBy: [{ nextDispatchAt: "asc" }, { createdAt: "asc" }],
    take,
  });
  let dispatched = 0;
  let failed = 0;

  for (const job of jobs) {
    const result = await dispatchDeepReportJob(job.id);

    if (result.ok) {
      dispatched += 1;
    } else {
      failed += 1;
    }
  }

  return {
    scanned: jobs.length,
    dispatched,
    failed,
    resetRunning: resetRunning.count,
    resetQueued: resetQueued.count,
  };
}

export function isProductCodeDeepReport(value: ProductCode): value is DeepReportProductCode {
  return isDeepReportProductCode(value);
}
