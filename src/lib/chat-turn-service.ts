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
import type { ChatCompleteData } from "@/lib/chat-ui-message";
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
  history: ChatConversationMessage[];
};

export type ReplayedChatTurn = {
  kind: "replay";
  data: ChatCompleteData;
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
        ? "对话数据库暂时不可用，本次没有扣除星力。"
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
    "对话请求发生并发冲突，请重新发送，本次没有重复扣费。",
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
  const messages = await tx.message.findMany({
    where: {
      sessionId,
      OR: [
        { turnId: null },
        { turn: { status: { in: [...completedStatuses] } } },
      ],
    },
    orderBy: [
      { createdAt: "desc" },
      { ordinal: "desc" },
      { id: "desc" },
    ],
    take: 16,
  });

  return messages
    .reverse()
    .map(normalizeHistoryMessage)
    .filter((message): message is ChatConversationMessage => Boolean(message));
}

function parseStoredResult(value: unknown) {
  if (!isRecord(value) || value.ok !== true || typeof value.answer !== "string") {
    return null;
  }

  return value as unknown as ChatCompleteData;
}

async function refundTurnInTransaction(input: {
  tx: TransactionClient;
  turn: {
    id: string;
    sessionId: string;
    userId: string;
    costStars: number;
    refundedStars: number;
  };
  fallback: Pick<SessionPayload, "tier" | "starBalance">;
  status: typeof AiTurnStatus.FAILED | typeof AiTurnStatus.CANCELLED;
  errorCode: string;
}) {
  const { tx, turn } = input;
  const accountState = await getDbAccountState(tx, turn.userId, input.fallback);
  const refundAmount = Math.max(0, turn.costStars - turn.refundedStars);
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

  await tx.aiTurn.update({
    where: { id: turn.id },
    data: {
      status: input.status,
      refundedStars: turn.costStars,
      errorCode: input.errorCode,
      completedAt: new Date(),
    },
  });
  await tx.aiSession.updateMany({
    where: { id: turn.sessionId, activeTurnId: turn.id },
    data: { activeTurnId: null },
  });

  return balanceAfter;
}

export async function waiveChatTurnCharge(input: {
  userId: string;
  turnId: string;
  reasonCode: "IDENTITY_BOUNDARY" | "MISSING_INPUT" | "SAFETY_BOUNDARY";
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

    if (refundAmount <= 0) {
      return accountState.starBalance;
    }

    const balanceAfter = accountState.starBalance + refundAmount;
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
    await tx.aiTurn.update({
      where: { id: turn.id },
      data: { refundedStars: turn.costStars },
    });

    return balanceAfter;
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

  if (!activeTurn || terminalStatuses.has(activeTurn.status)) {
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

      if (completedStatuses.has(existingTurn.status)) {
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
      history,
    };
  });
}

export async function completeChatTurn(input: {
  userId: string;
  turnId: string;
  question: string;
  result: AiChatResultDraft;
  usage: UsageLogInput;
  status: typeof AiTurnStatus.COMPLETED | typeof AiTurnStatus.PARTIAL;
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
          turnStatus: input.status,
        }),
      },
    });
    const accountState = await getDbAccountState(tx, input.userId);
    const complete = {
      ok: true as const,
      ...input.result,
      usageLogId,
      question: input.question,
      chatSessionId: turn.sessionId,
      turnId: turn.id,
      turnSequence: turn.sequence,
      turnStatus: input.status,
      replayed: false,
      cost: Math.max(0, turn.costStars - turn.refundedStars),
      balanceAfter: accountState.starBalance,
    } satisfies ChatCompleteData;

    await tx.message.create({
      data: {
        sessionId: turn.sessionId,
        turnId: turn.id,
        ordinal: 1,
        role: MessageRole.ASSISTANT,
        content: input.result.answer,
        toolResult: toJsonValue({
          intent: input.result.intent,
          serviceMode: input.result.serviceMode,
          answerShape: input.result.answerShape,
          answerStatus: input.result.structuredAnswer.status,
          conclusion: input.result.conclusion,
          toolCalls: input.result.toolCalls,
          provider: input.result.provider,
          model: input.result.model,
          usageLogId,
          costCents: input.result.costCents,
          costEstimate: input.result.costEstimate,
          promptMetadata: input.result.promptMetadata,
          validation: input.result.validation,
          turnStatus: input.status,
        }),
        tokensIn: input.result.tokensIn,
        tokensOut: input.result.tokensOut,
      },
    });
    await tx.aiTurn.update({
      where: { id: turn.id },
      data: {
        status: input.status,
        provider: input.result.provider,
        model: input.result.model,
        usageLogId,
        result: toJsonValue(complete),
        completedAt: new Date(),
      },
    });
    await tx.aiSession.updateMany({
      where: { id: turn.sessionId, activeTurnId: turn.id },
      data: { activeTurnId: null },
    });

    return complete;
  });
}

export async function failChatTurn(input: {
  userId: string;
  turnId: string;
  session: Pick<SessionPayload, "tier" | "starBalance">;
  status: typeof AiTurnStatus.FAILED | typeof AiTurnStatus.CANCELLED;
  errorCode: string;
}) {
  return runSerializable(async (tx) => {
    const turn = await tx.aiTurn.findFirst({
      where: { id: input.turnId, userId: input.userId },
    });

    if (!turn) {
      throw new ChatTurnError("TURN_STATE_INVALID", 409, "对话轮次不存在。");
    }

    if (turn.status === AiTurnStatus.GENERATING) {
      return refundTurnInTransaction({
        tx,
        turn,
        fallback: input.session,
        status: input.status,
        errorCode: input.errorCode,
      });
    }

    const accountState = await getDbAccountState(tx, input.userId, input.session);
    return accountState.starBalance;
  });
}
