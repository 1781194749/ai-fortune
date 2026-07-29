import "server-only";

import { createHash } from "crypto";
import type { Prisma } from "@/generated/prisma/client";
import {
  AiTurnStatus,
  MessageRole,
  SessionMode,
  WalletEventType,
} from "@/generated/prisma/enums";
import type { AiChatResultDraft } from "@/lib/ai-orchestrator";
import type { ChatInternalCompleteData } from "@/lib/chat-ui-message";
import type { ChatConversationMessage } from "@/lib/ai-session-store";
import type { ChatReadingMethod, ChatServiceMode } from "@/lib/chat-service";
import { getPrismaClient } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";
import type { UsageLogInput } from "@/lib/usage-log-store";
import {
  ensureDbUser,
  getDbAccountState,
  upsertDbMembership,
} from "@/lib/user-store";

type TransactionClient = Prisma.TransactionClient;

export type ChatTurnErrorCode =
  | "CHAT_DATABASE_REQUIRED"
  | "CHAT_DATABASE_UNAVAILABLE"
  | "CHAT_SESSION_NOT_FOUND"
  | "SESSION_BUSY"
  | "INSUFFICIENT_STARS"
  | "CHAT_QUOTA_EXCEEDED"
  | "IDEMPOTENCY_MISMATCH"
  | "TURN_IN_PROGRESS"
  | "TURN_ALREADY_FAILED"
  | "TURN_RESULT_UNAVAILABLE"
  | "TURN_STATE_INVALID";

export class ChatTurnError extends Error {
  constructor(
    readonly code: ChatTurnErrorCode,
    readonly status: number,
    message: string,
    readonly balance?: number,
    readonly quota?: {
      quotaTotal: number;
      quotaUsed: number;
      quotaRemaining: number;
    },
  ) {
    super(message);
    this.name = "ChatTurnError";
  }
}

export type ReservedChatTurn = {
  kind: "reserved";
  turnId: string;
  sessionId: string;
  sequence: number;
  createdSession: boolean;
  balanceAfter: number;
  quotaTotal: number;
  quotaUsed: number;
  quotaRemaining: number;
  history: ChatConversationMessage[];
};

export type ReplayedChatTurn = {
  kind: "replay";
  data: ChatInternalCompleteData;
};

const completedStatuses = new Set<AiTurnStatus>([
  AiTurnStatus.COMPLETED,
  AiTurnStatus.PARTIAL,
]);
const terminalStatuses = new Set<AiTurnStatus>([
  AiTurnStatus.COMPLETED,
  AiTurnStatus.PARTIAL,
  AiTurnStatus.FAILED,
  AiTurnStatus.CANCELLED,
]);

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function titleFromQuestion(question: string) {
  const normalized = question.trim().replace(/\s+/g, " ");
  return normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized || "AI 命理对话";
}

function requestHash(input: {
  sessionId?: string;
  question: string;
  palmImageId?: string;
  serviceMode: ChatServiceMode;
  readingMethod?: ChatReadingMethod;
}) {
  return createHash("sha256")
    .update(JSON.stringify({
      sessionId: input.sessionId ?? null,
      question: input.question,
      palmImageId: input.palmImageId ?? null,
      serviceMode: input.serviceMode,
      readingMethod: input.readingMethod ?? null,
    }))
    .digest("hex");
}

function getStaleTurnThresholdMs() {
  const configured = Number(process.env.CHAT_TURN_STALE_MS);
  return Number.isFinite(configured) && configured >= 60_000
    ? configured
    : 10 * 60_000;
}

function getDeliveryCheckpointStaleMs() {
  const configured = Number(process.env.CHAT_DELIVERY_CHECKPOINT_STALE_MS);
  return Number.isFinite(configured) && configured >= 5_000
    ? configured
    : 45_000;
}

function isRetryableTransactionError(error: unknown) {
  if (!isRecord(error)) {
    return false;
  }

  const code = typeof error.code === "string" ? error.code : "";
  const message = error instanceof Error ? error.message : "";
  return code === "P2034" || code === "P2002" || message.includes("40001");
}

async function runSerializable<T>(operation: (tx: TransactionClient) => Promise<T>) {
  const prisma = getPrismaClient();

  if (!prisma) {
    throw new ChatTurnError(
      process.env.DATABASE_URL ? "CHAT_DATABASE_UNAVAILABLE" : "CHAT_DATABASE_REQUIRED",
      503,
      process.env.DATABASE_URL
        ? "对话数据库暂时不可用，本次没有扣除问答次数。"
        : "AI 对话需要配置 PostgreSQL 数据库。",
    );
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: "Serializable",
        maxWait: 5000,
        timeout: 15_000,
      });
    } catch (error) {
      if (error instanceof ChatTurnError || !isRetryableTransactionError(error)) {
        throw error;
      }
    }
  }

  throw new ChatTurnError(
    "CHAT_DATABASE_UNAVAILABLE",
    503,
    "对话请求发生并发冲突，请重新发送，本次没有重复计次。",
  );
}

function normalizeHistoryMessage(message: {
  id: string;
  role: string;
  content: string;
  toolResult: unknown;
  createdAt: Date;
}): ChatConversationMessage | null {
  const role = message.role === MessageRole.USER
    ? "user"
    : message.role === MessageRole.ASSISTANT
      ? "assistant"
      : null;

  if (!role) {
    return null;
  }

  return {
    id: message.id,
    role,
    content: message.content,
    toolResult: message.toolResult,
    createdAt: message.createdAt.toISOString(),
  };
}

async function readConversationHistory(tx: TransactionClient, sessionId: string) {
  const visibleWhere = {
    sessionId,
    OR: [
      { turnId: null },
      {
        turn: {
          status: { in: [...completedStatuses] },
          completedAt: { not: null },
        },
      },
    ],
  };
  const firstUserMessage = await tx.message.findFirst({
    where: { ...visibleWhere, role: MessageRole.USER },
    orderBy: [
      { createdAt: "asc" },
      { ordinal: "asc" },
      { id: "asc" },
    ],
  });
  const recentMessages = await tx.message.findMany({
    where: visibleWhere,
    orderBy: [
      { createdAt: "desc" },
      { ordinal: "desc" },
      { id: "desc" },
    ],
    take: 63,
  });
  const messages = firstUserMessage &&
    !recentMessages.some((message) => message.id === firstUserMessage.id)
    ? [...recentMessages, firstUserMessage]
    : recentMessages;

  return messages
    .toSorted((first, second) =>
      first.createdAt.getTime() - second.createdAt.getTime() ||
      (first.ordinal ?? Number.MAX_SAFE_INTEGER) -
        (second.ordinal ?? Number.MAX_SAFE_INTEGER) ||
      first.id.localeCompare(second.id)
    )
    .map(normalizeHistoryMessage)
    .filter((message): message is ChatConversationMessage => Boolean(message));
}

function parseStoredResult(value: unknown) {
  if (!isRecord(value) || value.ok !== true || typeof value.answer !== "string") {
    return null;
  }

  return value as unknown as ChatInternalCompleteData;
}

function quotaSnapshot(input: { chatQuota: number; chatUsed: number }) {
  return {
    quotaTotal: input.chatQuota,
    quotaUsed: input.chatUsed,
    quotaRemaining: Math.max(0, input.chatQuota - input.chatUsed),
  };
}

async function refundTurnInTransaction(input: {
  tx: TransactionClient;
  turn: {
    id: string;
    sessionId: string;
    userId: string;
    costStars: number;
    refundedStars: number;
    quotaUnits: number;
    refundedQuotaUnits: number;
  };
  fallback?: Pick<SessionPayload, "tier" | "starBalance">;
  status: typeof AiTurnStatus.FAILED | typeof AiTurnStatus.CANCELLED;
  errorCode: string;
  failureDetails?: string[];
}) {
  const { tx, turn } = input;
  const accountState = await getDbAccountState(tx, turn.userId, input.fallback);
  const refundAmount = Math.max(0, turn.costStars - turn.refundedStars);
  const refundQuota = Math.max(0, turn.quotaUnits - turn.refundedQuotaUnits);
  let balanceAfter = accountState.starBalance;

  if (refundAmount > 0) {
    balanceAfter += refundAmount;
    await tx.walletTransaction.upsert({
      where: { id: `chat_refund_${turn.id}` },
      update: {},
      create: {
        id: `chat_refund_${turn.id}`,
        userId: turn.userId,
        turnId: turn.id,
        type: WalletEventType.REFUND,
        amount: refundAmount,
        balanceAfter,
        reason: `AI 对话未完成，退回 ${refundAmount} 星力`,
        metadata: {
          featureCode: "chat_basic",
          source: "chat_turn_refund",
          errorCode: input.errorCode,
        },
      },
    });
    await upsertDbMembership(tx, {
      userId: turn.userId,
      tier: accountState.tier,
      starBalance: balanceAfter,
    });
  }

  if (refundQuota > 0) {
    const quotaRefund = await tx.membership.updateMany({
      where: {
        userId: turn.userId,
        isActive: true,
        chatUsed: { gte: refundQuota },
      },
      data: { chatUsed: { decrement: refundQuota } },
    });
    if (quotaRefund.count !== 1) {
      throw new Error(`Chat quota refund failed for turn ${turn.id}.`);
    }
  }

  const nextQuotaUsed = Math.max(0, accountState.chatUsed - refundQuota);
  await tx.aiTurn.update({
    where: { id: turn.id },
    data: {
      status: input.status,
      refundedStars: turn.costStars,
      refundedQuotaUnits: turn.quotaUnits,
      errorCode: input.errorCode,
      ...(input.failureDetails?.length
        ? {
            result: toJsonValue({
              ok: false,
              errorCode: input.errorCode,
              failureDetails: input.failureDetails.slice(0, 8),
            }),
          }
        : {}),
      completedAt: new Date(),
    },
  });
  await tx.aiSession.updateMany({
    where: { id: turn.sessionId, activeTurnId: turn.id },
    data: { activeTurnId: null },
  });

  return {
    balanceAfter,
    ...quotaSnapshot({ chatQuota: accountState.chatQuota, chatUsed: nextQuotaUsed }),
  };
}

async function confirmDeliveryCheckpointInTransaction(input: {
  tx: TransactionClient;
  turn: { id: string; sessionId: string; usageLogId: string | null };
  checkpoint: ChatInternalCompleteData;
  answer?: string;
  status?: typeof AiTurnStatus.COMPLETED | typeof AiTurnStatus.PARTIAL;
}) {
  const assistantMessage = await input.tx.message.findFirst({
    where: {
      turnId: input.turn.id,
      ordinal: 1,
      role: MessageRole.ASSISTANT,
    },
    select: { id: true, toolResult: true },
  });

  if (!assistantMessage) {
    return null;
  }

  const status = input.status ?? input.checkpoint.intendedTurnStatus ?? input.checkpoint.turnStatus;
  const complete = {
    ...input.checkpoint,
    answer: input.answer ?? input.checkpoint.answer,
    turnStatus: status,
    intendedTurnStatus: status,
    deliveryState: "FINALIZED" as const,
  } satisfies ChatInternalCompleteData;
  const toolResult = isRecord(assistantMessage.toolResult)
    ? {
        ...assistantMessage.toolResult,
        turnStatus: status,
        deliveryState: "FINALIZED",
      }
    : { turnStatus: status, deliveryState: "FINALIZED" };

  const finalized = await input.tx.aiTurn.updateMany({
    where: {
      id: input.turn.id,
      status: AiTurnStatus.PARTIAL,
      completedAt: null,
    },
    data: {
      status,
      errorCode: null,
      result: toJsonValue(complete),
      completedAt: new Date(),
    },
  });

  if (finalized.count !== 1) {
    return null;
  }

  await input.tx.message.update({
    where: { id: assistantMessage.id },
    data: {
      content: complete.answer,
      toolResult: toJsonValue(toolResult),
    },
  });

  if (input.turn.usageLogId) {
    const usageLog = await input.tx.usageLog.findUnique({
      where: { id: input.turn.usageLogId },
      select: { metadata: true },
    });
    const metadata = isRecord(usageLog?.metadata) ? usageLog.metadata : {};

    if (usageLog) {
      await input.tx.usageLog.update({
        where: { id: input.turn.usageLogId },
        data: {
          metadata: toJsonValue({
            ...metadata,
            turnStatus: status,
            deliveryCheckpoint: false,
            deliveryState: "FINALIZED",
          }),
        },
      });
    }
  }

  await input.tx.aiSession.updateMany({
    where: { id: input.turn.sessionId, activeTurnId: input.turn.id },
    data: { activeTurnId: null },
  });

  return complete;
}

type SettleableChatTurn = {
  id: string;
  sessionId: string;
  userId: string;
  status: AiTurnStatus;
  costStars: number;
  refundedStars: number;
  quotaUnits: number;
  refundedQuotaUnits: number;
  usageLogId: string | null;
  result: unknown;
};

async function settleSelectedChatTurnsInTransaction(input: {
  tx: TransactionClient;
  turns: SettleableChatTurn[];
  fallback?: Pick<SessionPayload, "tier" | "starBalance">;
}) {
  let recovered = 0;
  let refunded = 0;

  for (const turn of input.turns) {
    const checkpoint = turn.status === AiTurnStatus.PARTIAL
      ? parseStoredResult(turn.result)
      : null;

    if (checkpoint) {
      const confirmed = await confirmDeliveryCheckpointInTransaction({
        tx: input.tx,
        turn,
        checkpoint,
      });

      if (confirmed) {
        recovered += 1;
        continue;
      }
    }

    await refundTurnInTransaction({
      tx: input.tx,
      turn,
      fallback: input.fallback,
      status: AiTurnStatus.FAILED,
      errorCode: turn.status === AiTurnStatus.PARTIAL
        ? "INVALID_DELIVERY_CHECKPOINT"
        : "STALE_GENERATING_TURN",
    });
    refunded += 1;
  }

  return { checked: input.turns.length, recovered, refunded };
}

async function settleStaleUserTurns(input: {
  tx: TransactionClient;
  userId: string;
  fallback: Pick<SessionPayload, "tier" | "starBalance">;
}) {
  const now = Date.now();
  const turns = await input.tx.aiTurn.findMany({
    where: {
      userId: input.userId,
      OR: [
        {
          status: AiTurnStatus.GENERATING,
          startedAt: { lt: new Date(now - getStaleTurnThresholdMs()) },
        },
        {
          status: AiTurnStatus.PARTIAL,
          completedAt: null,
          updatedAt: { lt: new Date(now - getDeliveryCheckpointStaleMs()) },
        },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: 8,
  });

  await settleSelectedChatTurnsInTransaction({
    tx: input.tx,
    turns,
    fallback: input.fallback,
  });
}

export async function waiveChatTurnCharge(input: {
  userId: string;
  turnId: string;
  reasonCode: "IDENTITY_BOUNDARY" | "MISSING_INPUT" | "SAFETY_BOUNDARY" | "PROVIDER_FALLBACK";
}) {
  return runSerializable(async (tx) => {
    const turn = await tx.aiTurn.findFirst({
      where: { id: input.turnId, userId: input.userId },
    });

    if (!turn || turn.status !== AiTurnStatus.GENERATING) {
      throw new ChatTurnError("TURN_STATE_INVALID", 409, "当前对话轮次不能调整费用。");
    }

    const accountState = await getDbAccountState(tx, input.userId);
    const refundAmount = Math.max(0, turn.costStars - turn.refundedStars);
    const refundQuota = Math.max(0, turn.quotaUnits - turn.refundedQuotaUnits);

    if (refundAmount <= 0 && refundQuota <= 0) {
      return {
        balanceAfter: accountState.starBalance,
        ...quotaSnapshot(accountState),
      };
    }

    const balanceAfter = accountState.starBalance + refundAmount;
    if (refundAmount > 0) {
      await tx.walletTransaction.upsert({
      where: { id: `chat_refund_${turn.id}` },
      update: {},
      create: {
        id: `chat_refund_${turn.id}`,
        userId: turn.userId,
        turnId: turn.id,
        type: WalletEventType.REFUND,
        amount: refundAmount,
        balanceAfter,
        reason: `本轮无需付费，退回 ${refundAmount} 星力`,
        metadata: {
          featureCode: "chat_basic",
          source: "chat_turn_charge_waiver",
          reasonCode: input.reasonCode,
        },
      },
      });
      await upsertDbMembership(tx, {
        userId: turn.userId,
        tier: accountState.tier,
        starBalance: balanceAfter,
      });
    }
    if (refundQuota > 0) {
      const quotaRefund = await tx.membership.updateMany({
        where: { userId: turn.userId, isActive: true, chatUsed: { gte: refundQuota } },
        data: { chatUsed: { decrement: refundQuota } },
      });
      if (quotaRefund.count !== 1) {
        throw new Error(`Chat quota waiver refund failed for turn ${turn.id}.`);
      }
    }
    await tx.aiTurn.update({
      where: { id: turn.id },
      data: {
        refundedStars: turn.costStars,
        refundedQuotaUnits: turn.quotaUnits,
      },
    });

    return {
      balanceAfter,
      ...quotaSnapshot({ chatQuota: accountState.chatQuota, chatUsed: Math.max(0, accountState.chatUsed - refundQuota) }),
    };
  });
}

async function ensureSessionAvailable(input: {
  tx: TransactionClient;
  session: { id: string; activeTurnId: string | null };
  fallback: Pick<SessionPayload, "tier" | "starBalance">;
}) {
  if (!input.session.activeTurnId) {
    return;
  }

  const activeTurn = await input.tx.aiTurn.findUnique({
    where: { id: input.session.activeTurnId },
  });

  if (!activeTurn) {
    await input.tx.aiSession.updateMany({
      where: { id: input.session.id, activeTurnId: input.session.activeTurnId },
      data: { activeTurnId: null },
    });
    return;
  }

  const checkpoint = activeTurn.status === AiTurnStatus.PARTIAL && !activeTurn.completedAt
    ? parseStoredResult(activeTurn.result)
    : null;

  if (checkpoint) {
    if (Date.now() - activeTurn.updatedAt.getTime() < getDeliveryCheckpointStaleMs()) {
      throw new ChatTurnError("SESSION_BUSY", 409, "该对话正在交付回答，请等待完成后再发送。");
    }

    const confirmed = await confirmDeliveryCheckpointInTransaction({
      tx: input.tx,
      turn: activeTurn,
      checkpoint,
    });

    if (confirmed) {
      return;
    }
  }

  if (activeTurn.status === AiTurnStatus.PARTIAL && !activeTurn.completedAt) {
    await refundTurnInTransaction({
      tx: input.tx,
      turn: activeTurn,
      fallback: input.fallback,
      status: AiTurnStatus.FAILED,
      errorCode: "INVALID_DELIVERY_CHECKPOINT",
    });
    return;
  }

  if (terminalStatuses.has(activeTurn.status)) {
    await input.tx.aiSession.updateMany({
      where: { id: input.session.id, activeTurnId: input.session.activeTurnId },
      data: { activeTurnId: null },
    });
    return;
  }

  if (Date.now() - activeTurn.startedAt.getTime() < getStaleTurnThresholdMs()) {
    throw new ChatTurnError("SESSION_BUSY", 409, "该对话正在生成回答，请等待完成后再发送。");
  }

  await refundTurnInTransaction({
    tx: input.tx,
    turn: activeTurn,
    fallback: input.fallback,
    status: AiTurnStatus.FAILED,
    errorCode: "STALE_GENERATING_TURN",
  });
}

export async function reserveChatTurn(input: {
  session: SessionPayload;
  sessionId?: string;
  clientRequestId: string;
  question: string;
  palmImageId?: string;
  serviceMode: ChatServiceMode;
  readingMethod?: ChatReadingMethod;
  costStars: number;
}): Promise<ReservedChatTurn | ReplayedChatTurn> {
  const fingerprint = requestHash(input);

  return runSerializable(async (tx) => {
    await ensureDbUser(tx, { userId: input.session.userId });
    await settleStaleUserTurns({
      tx,
      userId: input.session.userId,
      fallback: input.session,
    });

    const existingTurn = await tx.aiTurn.findUnique({
      where: {
        userId_clientRequestId: {
          userId: input.session.userId,
          clientRequestId: input.clientRequestId,
        },
      },
    });

    if (existingTurn) {
      if (existingTurn.requestHash !== fingerprint) {
        throw new ChatTurnError(
          "IDEMPOTENCY_MISMATCH",
          409,
          "重复请求标识对应的问题不一致，请重新发送。",
        );
      }

      if (existingTurn.status === AiTurnStatus.GENERATING) {
        throw new ChatTurnError("TURN_IN_PROGRESS", 409, "这次请求仍在生成中，请稍候。");
      }

      if (existingTurn.status === AiTurnStatus.PARTIAL && !existingTurn.completedAt) {
        throw new ChatTurnError("TURN_IN_PROGRESS", 409, "这次回答仍在交付中，请稍候。");
      }

      if (completedStatuses.has(existingTurn.status) && existingTurn.completedAt) {
        const stored = parseStoredResult(existingTurn.result);

        if (!stored) {
          throw new ChatTurnError(
            "TURN_RESULT_UNAVAILABLE",
            409,
            "历史请求已完成，但结果暂时无法恢复。",
          );
        }

        const accountState = await getDbAccountState(tx, input.session.userId, input.session);
        return {
          kind: "replay" as const,
          data: {
            ...stored,
            balanceAfter: accountState.starBalance,
            ...quotaSnapshot(accountState),
            replayed: true,
          },
        };
      }

      const accountState = await getDbAccountState(tx, input.session.userId, input.session);
      throw new ChatTurnError(
        "TURN_ALREADY_FAILED",
        409,
        "这次请求已经失败并完成退款，请重新发送以创建新请求。",
        accountState.starBalance,
        quotaSnapshot(accountState),
      );
    }

    let createdSession = false;
    let chatSession = input.sessionId
      ? await tx.aiSession.findFirst({
          where: {
            id: input.sessionId,
            userId: input.session.userId,
            mode: SessionMode.CHAT,
          },
          select: { id: true, activeTurnId: true },
        })
      : null;

    if (input.sessionId && !chatSession) {
      throw new ChatTurnError("CHAT_SESSION_NOT_FOUND", 404, "对话不存在或已被删除。");
    }

    if (!chatSession) {
      chatSession = await tx.aiSession.create({
        data: {
          userId: input.session.userId,
          mode: SessionMode.CHAT,
          title: titleFromQuestion(input.question),
        },
        select: { id: true, activeTurnId: true },
      });
      createdSession = true;
    }

    await ensureSessionAvailable({
      tx,
      session: chatSession,
      fallback: input.session,
    });

    const history = createdSession
      ? []
      : await readConversationHistory(tx, chatSession.id);
    const latestTurn = await tx.aiTurn.aggregate({
      where: { sessionId: chatSession.id },
      _max: { sequence: true },
    });
    const sequence = (latestTurn._max.sequence ?? 0) + 1;
    const turn = await tx.aiTurn.create({
      data: {
        sessionId: chatSession.id,
        userId: input.session.userId,
        sequence,
        clientRequestId: input.clientRequestId,
        requestHash: fingerprint,
        costStars: input.costStars,
        quotaUnits: 1,
      },
    });
    const lock = await tx.aiSession.updateMany({
      where: { id: chatSession.id, activeTurnId: null },
      data: { activeTurnId: turn.id },
    });

    if (lock.count !== 1) {
      throw new ChatTurnError("SESSION_BUSY", 409, "该对话正在生成回答，请等待完成后再发送。");
    }

    const accountState = await getDbAccountState(tx, input.session.userId, input.session);

    const quotaClaim = await tx.membership.updateMany({
      where: {
        userId: input.session.userId,
        isActive: true,
        chatUsed: { lt: accountState.chatQuota },
      },
      data: { chatUsed: { increment: 1 } },
    });

    if (quotaClaim.count !== 1) {
      throw new ChatTurnError(
        "CHAT_QUOTA_EXCEEDED",
        402,
        `本月问答次数已用完（${accountState.chatQuota} 次），请升级会员后继续。`,
        accountState.starBalance,
      );
    }

    if (accountState.starBalance < input.costStars) {
      throw new ChatTurnError(
        "INSUFFICIENT_STARS",
        402,
        `星力不足，需要 ${input.costStars} 星力，当前 ${accountState.starBalance} 星力。`,
        accountState.starBalance,
      );
    }

    const balanceAfter = accountState.starBalance - input.costStars;

    if (input.costStars > 0) {
      await tx.walletTransaction.create({
        data: {
          id: `chat_spend_${turn.id}`,
          userId: input.session.userId,
          turnId: turn.id,
          type: WalletEventType.SPEND,
          amount: -input.costStars,
          balanceAfter,
          reason: `AI ${input.serviceMode === "quick" ? "快速问答" : input.serviceMode === "formal" ? "正式问事" : "深度推演"}消耗 ${input.costStars} 星力`,
          metadata: {
            featureCode: "chat_basic",
            serviceMode: input.serviceMode,
            source: "chat_turn_reservation",
            clientRequestId: input.clientRequestId,
          },
        },
      });
    }

    await upsertDbMembership(tx, {
      userId: input.session.userId,
      tier: accountState.tier,
      starBalance: balanceAfter,
    });
    await tx.message.create({
      data: {
        sessionId: chatSession.id,
        turnId: turn.id,
        ordinal: 0,
        role: MessageRole.USER,
        content: input.question,
      },
    });

    return {
      kind: "reserved" as const,
      turnId: turn.id,
      sessionId: chatSession.id,
      sequence,
      createdSession,
      balanceAfter,
      ...quotaSnapshot({ chatQuota: accountState.chatQuota, chatUsed: accountState.chatUsed + 1 }),
      history,
    };
  });
}

function buildAssistantToolResult(input: {
  result: AiChatResultDraft;
  usageLogId: string;
  status: typeof AiTurnStatus.COMPLETED | typeof AiTurnStatus.PARTIAL;
  deliveryState: "CHECKPOINT" | "FINALIZED";
}) {
  return toJsonValue({
    intent: input.result.intent,
    serviceMode: input.result.serviceMode,
    answerShape: input.result.answerShape,
    answerStatus: input.result.structuredAnswer.status,
    conclusion: input.result.conclusion,
    toolCalls: input.result.toolCalls,
    contextSummary: input.result.contextSummary,
    provider: input.result.provider,
    model: input.result.model,
    usageLogId: input.usageLogId,
    costCents: input.result.costCents,
    costEstimate: input.result.costEstimate,
    promptMetadata: input.result.promptMetadata,
    validation: input.result.validation,
    turnStatus: input.status,
    deliveryState: input.deliveryState,
  });
}

export async function persistChatTurnCheckpoint(input: {
  userId: string;
  turnId: string;
  question: string;
  result: AiChatResultDraft;
  usage: UsageLogInput;
  intendedStatus: typeof AiTurnStatus.COMPLETED | typeof AiTurnStatus.PARTIAL;
}) {
  return runSerializable(async (tx) => {
    const turn = await tx.aiTurn.findFirst({
      where: { id: input.turnId, userId: input.userId },
      include: { session: { select: { id: true } } },
    });

    if (!turn) {
      throw new ChatTurnError("TURN_STATE_INVALID", 409, "对话轮次不存在。");
    }

    if (completedStatuses.has(turn.status)) {
      const stored = parseStoredResult(turn.result);

      if (!stored) {
        throw new ChatTurnError("TURN_RESULT_UNAVAILABLE", 409, "对话结果暂时无法恢复。");
      }

      return stored;
    }

    if (turn.status !== AiTurnStatus.GENERATING) {
      throw new ChatTurnError("TURN_STATE_INVALID", 409, "当前对话轮次不能再完成。");
    }

    const usageLogId = `chat_usage_${turn.id}`;
    const usageMetadata = isRecord(input.usage.metadata)
      ? input.usage.metadata
      : {};
    await tx.usageLog.create({
      data: {
        id: usageLogId,
        userId: input.usage.userId,
        provider: input.usage.provider,
        model: input.usage.model,
        feature: input.usage.feature,
        tokensIn: input.usage.tokensIn,
        tokensOut: input.usage.tokensOut,
        imageCount: input.usage.imageCount ?? 0,
        costCents: input.usage.costCents,
        metadata: toJsonValue({
          ...usageMetadata,
          turnId: turn.id,
          sessionId: turn.sessionId,
          turnStatus: input.intendedStatus,
          deliveryCheckpoint: true,
          deliveryState: "CHECKPOINT",
        }),
      },
    });
    const accountState = await getDbAccountState(tx, input.userId);
    const checkpoint = {
      ok: true as const,
      ...input.result,
      usageLogId,
      question: input.question,
      chatSessionId: turn.sessionId,
      turnId: turn.id,
      turnSequence: turn.sequence,
      turnStatus: input.intendedStatus,
      intendedTurnStatus: input.intendedStatus,
      deliveryState: "CHECKPOINT" as const,
      counted: Math.max(0, turn.quotaUnits - turn.refundedQuotaUnits) > 0,
      replayed: false,
      cost: Math.max(0, turn.costStars - turn.refundedStars),
      balanceAfter: accountState.starBalance,
      ...quotaSnapshot(accountState),
    } satisfies ChatInternalCompleteData;

    await tx.message.create({
      data: {
        sessionId: turn.sessionId,
        turnId: turn.id,
        ordinal: 1,
        role: MessageRole.ASSISTANT,
        content: input.result.answer,
        toolResult: buildAssistantToolResult({
          result: input.result,
          usageLogId,
          status: input.intendedStatus,
          deliveryState: "CHECKPOINT",
        }),
        tokensIn: input.result.tokensIn,
        tokensOut: input.result.tokensOut,
      },
    });
    await tx.aiTurn.update({
      where: { id: turn.id },
      data: {
        status: AiTurnStatus.PARTIAL,
        provider: input.result.provider,
        model: input.result.model,
        usageLogId,
        errorCode: "ANSWER_DELIVERY_CHECKPOINT",
        result: toJsonValue(checkpoint),
        completedAt: null,
      },
    });

    return checkpoint;
  });
}

export async function finalizeChatTurnDelivery(input: {
  userId: string;
  turnId: string;
  answer: string;
  status: typeof AiTurnStatus.COMPLETED | typeof AiTurnStatus.PARTIAL;
}) {
  return runSerializable(async (tx) => {
    const turn = await tx.aiTurn.findFirst({
      where: { id: input.turnId, userId: input.userId },
    });

    if (!turn) {
      throw new ChatTurnError("TURN_STATE_INVALID", 409, "对话轮次不存在。");
    }

    const stored = parseStoredResult(turn.result);
    if (!stored) {
      throw new ChatTurnError("TURN_RESULT_UNAVAILABLE", 409, "对话结果暂时无法恢复。");
    }

    if (turn.completedAt) {
      return stored;
    }

    if (turn.status !== AiTurnStatus.PARTIAL) {
      throw new ChatTurnError("TURN_STATE_INVALID", 409, "当前对话轮次不能确认交付。");
    }

    const complete = await confirmDeliveryCheckpointInTransaction({
      tx,
      turn,
      checkpoint: stored,
      answer: input.answer,
      status: input.status,
    });

    if (!complete) {
      throw new ChatTurnError("TURN_STATE_INVALID", 409, "当前对话轮次不能确认交付。");
    }

    return complete;
  });
}

export async function markChatTurnDeliveryRecoverable(input: {
  userId: string;
  turnId: string;
  status: typeof AiTurnStatus.COMPLETED | typeof AiTurnStatus.PARTIAL;
}) {
  return runSerializable(async (tx) => {
    const turn = await tx.aiTurn.findFirst({
      where: { id: input.turnId, userId: input.userId },
    });

    if (!turn) {
      throw new ChatTurnError("TURN_STATE_INVALID", 409, "对话轮次不存在。");
    }

    const stored = parseStoredResult(turn.result);
    if (!stored) {
      throw new ChatTurnError("TURN_RESULT_UNAVAILABLE", 409, "对话结果暂时无法恢复。");
    }

    if (turn.completedAt) {
      return stored;
    }

    if (turn.status !== AiTurnStatus.PARTIAL) {
      throw new ChatTurnError("TURN_STATE_INVALID", 409, "当前对话轮次不能标记为待恢复。");
    }

    const recoverable = {
      ...stored,
      turnStatus: input.status,
      intendedTurnStatus: input.status,
      deliveryState: "RECOVERABLE" as const,
    } satisfies ChatInternalCompleteData;
    const updated = await tx.aiTurn.updateMany({
      where: {
        id: turn.id,
        status: AiTurnStatus.PARTIAL,
        completedAt: null,
      },
      data: {
        errorCode: "ANSWER_DELIVERY_PENDING",
        result: toJsonValue(recoverable),
      },
    });

    if (updated.count !== 1) {
      throw new ChatTurnError("TURN_STATE_INVALID", 409, "当前对话轮次状态已变化。");
    }

    return recoverable;
  });
}

export async function recoverPendingChatDeliveries(input: {
  userId: string;
  sessionId?: string;
  take?: number;
}) {
  return runSerializable(async (tx) => {
    const now = Date.now();
    const turns = await tx.aiTurn.findMany({
      where: {
        userId: input.userId,
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        OR: [
          {
            status: AiTurnStatus.PARTIAL,
            completedAt: null,
            OR: [
              { errorCode: "ANSWER_DELIVERY_PENDING" },
              { updatedAt: { lt: new Date(now - getDeliveryCheckpointStaleMs()) } },
            ],
          },
          {
            status: AiTurnStatus.GENERATING,
            startedAt: { lt: new Date(now - getStaleTurnThresholdMs()) },
          },
        ],
      },
      orderBy: { updatedAt: "asc" },
      take: Math.min(Math.max(input.take ?? 12, 1), 50),
    });

    return settleSelectedChatTurnsInTransaction({ tx, turns });
  });
}

export async function reconcileStaleChatTurns(input: { take?: number } = {}) {
  return runSerializable(async (tx) => {
    const now = Date.now();
    const turns = await tx.aiTurn.findMany({
      where: {
        OR: [
          {
            status: AiTurnStatus.PARTIAL,
            completedAt: null,
            updatedAt: { lt: new Date(now - getDeliveryCheckpointStaleMs()) },
          },
          {
            status: AiTurnStatus.GENERATING,
            startedAt: { lt: new Date(now - getStaleTurnThresholdMs()) },
          },
        ],
      },
      orderBy: { updatedAt: "asc" },
      take: Math.min(Math.max(input.take ?? 50, 1), 200),
    });

    return settleSelectedChatTurnsInTransaction({ tx, turns });
  });
}

export async function failChatTurn(input: {
  userId: string;
  turnId: string;
  session: Pick<SessionPayload, "tier" | "starBalance">;
  status: typeof AiTurnStatus.FAILED | typeof AiTurnStatus.CANCELLED;
  errorCode: string;
  failureDetails?: string[];
}) {
  return runSerializable(async (tx) => {
    const turn = await tx.aiTurn.findFirst({
      where: { id: input.turnId, userId: input.userId },
    });

    if (!turn) {
      throw new ChatTurnError("TURN_STATE_INVALID", 409, "对话轮次不存在。");
    }

    const refundableCheckpoint = turn.status === AiTurnStatus.PARTIAL && !turn.completedAt;
    if (turn.status === AiTurnStatus.GENERATING || refundableCheckpoint) {
      return refundTurnInTransaction({
        tx,
        turn,
        fallback: input.session,
        status: input.status,
        errorCode: input.errorCode,
        failureDetails: input.failureDetails,
      });
    }

    const accountState = await getDbAccountState(tx, input.userId, input.session);
    return {
      balanceAfter: accountState.starBalance,
      ...quotaSnapshot(accountState),
    };
  });
}
