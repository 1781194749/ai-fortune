import "server-only";

import { randomUUID } from "crypto";
import { AiTurnStatus, MessageRole, SessionMode } from "@/generated/prisma/enums";
import { assertDatabaseFallbackAllowed, tryPrisma } from "@/lib/prisma";
import { ensureDbUser } from "@/lib/user-store";

type ChatTurnInput = {
  userId: string;
  sessionId?: string;
  question: string;
  answer: string;
  toolResults?: unknown;
  tokensIn?: number;
  tokensOut?: number;
};

export type RecentChatSession = {
  id: string;
  title: string;
  question: string;
  answer: string;
  intent: string | null;
  provider: string | null;
  model: string | null;
  toolNames: string[];
  tokensIn: number | null;
  tokensOut: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolResult?: unknown;
  createdAt: string;
};

export type ChatSessionDetail = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatConversationMessage[];
};

type MemoryMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  toolResult?: unknown;
  createdAt: string;
};

type MemorySession = {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: MemoryMessage[];
};

type SessionMessageLike = {
  id?: string;
  role: string;
  content: string;
  toolResult?: unknown;
  tokensIn?: number | null;
  tokensOut?: number | null;
  createdAt: Date | string;
};

type SessionLike = {
  id: string;
  title: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  messages: SessionMessageLike[];
};

declare global {
  var xuanjiAiSessions: MemorySession[] | undefined;
}

const sessions = globalThis.xuanjiAiSessions ?? [];
const visibleTurnStatuses = [AiTurnStatus.COMPLETED, AiTurnStatus.PARTIAL];

if (!globalThis.xuanjiAiSessions) {
  globalThis.xuanjiAiSessions = sessions;
}

function requireChatSessionDatabaseRead() {
  assertDatabaseFallbackAllowed("PostgreSQL 暂时不可用，无法读取对话记录。");
}

function requireChatSessionDatabaseWrite() {
  assertDatabaseFallbackAllowed("PostgreSQL 暂时不可用，对话记录未保存。");
}

function titleFromQuestion(question: string) {
  const normalized = question.trim().replace(/\s+/g, " ");
  return normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized || "AI 命理对话";
}

function normalizeSessionTitle(title: string) {
  const normalized = title.trim().replace(/\s+/g, " ");
  return normalized.slice(0, 40);
}

function toJsonValue(value: unknown) {
  if (value === undefined) {
    return undefined as never;
  }

  return JSON.parse(JSON.stringify(value)) as never;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function readToolNames(toolResult: unknown) {
  if (!isRecord(toolResult) || !Array.isArray(toolResult.toolCalls)) {
    return [];
  }

  return toolResult.toolCalls
    .map((tool) => (isRecord(tool) && typeof tool.name === "string" ? tool.name : ""))
    .filter(Boolean);
}

function normalizeConversationMessage(
  message: SessionMessageLike,
  index: number,
): ChatConversationMessage | null {
  const role = message.role === MessageRole.USER
    ? "user"
    : message.role === MessageRole.ASSISTANT
      ? "assistant"
      : null;

  if (!role) {
    return null;
  }

  return {
    id: message.id ?? `message_${index}`,
    role,
    content: message.content,
    toolResult: message.toolResult,
    createdAt: toIsoString(message.createdAt),
  };
}

function normalizeChatSessionDetail(session: SessionLike): ChatSessionDetail {
  const messages = [...session.messages]
    .sort((a, b) => toIsoString(a.createdAt).localeCompare(toIsoString(b.createdAt)))
    .map(normalizeConversationMessage)
    .filter((message): message is ChatConversationMessage => Boolean(message));

  return {
    id: session.id,
    title: session.title,
    createdAt: toIsoString(session.createdAt),
    updatedAt: toIsoString(session.updatedAt),
    messages,
  };
}

function normalizeRecentChatSession(session: SessionLike): RecentChatSession {
  const sortedMessages = [...session.messages].sort((a, b) =>
    toIsoString(a.createdAt).localeCompare(toIsoString(b.createdAt)),
  );
  const userMessage = sortedMessages.find((message) => message.role === MessageRole.USER);
  const assistantMessage = [...sortedMessages]
    .reverse()
    .find((message) => message.role === MessageRole.ASSISTANT);
  const toolResult = assistantMessage?.toolResult;
  const metadata = isRecord(toolResult) ? toolResult : {};

  return {
    id: session.id,
    title: session.title,
    question: userMessage?.content ?? session.title,
    answer: assistantMessage?.content ?? "",
    intent: typeof metadata.intent === "string" ? metadata.intent : null,
    provider: typeof metadata.provider === "string" ? metadata.provider : null,
    model: typeof metadata.model === "string" ? metadata.model : null,
    toolNames: readToolNames(toolResult),
    tokensIn: assistantMessage?.tokensIn ?? null,
    tokensOut: assistantMessage?.tokensOut ?? null,
    createdAt: toIsoString(session.createdAt),
    updatedAt: toIsoString(session.updatedAt),
  };
}

export async function saveChatTurn(input: ChatTurnInput) {
  const dbResult = await tryPrisma(async (prisma) => {
    await ensureDbUser(prisma, { userId: input.userId });

    const messages = [
      {
        role: MessageRole.USER,
        content: input.question,
      },
      {
        role: MessageRole.ASSISTANT,
        content: input.answer,
        toolResult: toJsonValue(input.toolResults),
        tokensIn: input.tokensIn,
        tokensOut: input.tokensOut,
      },
    ];

    if (input.sessionId) {
      const existing = await prisma.aiSession.findFirst({
        where: {
          id: input.sessionId,
          userId: input.userId,
          mode: SessionMode.CHAT,
        },
        select: { id: true },
      });

      if (!existing) {
        return null;
      }

      const session = await prisma.aiSession.update({
        where: { id: existing.id },
        data: {
          messages: { create: messages },
        },
        select: { id: true },
      });

      return session.id;
    }

    const session = await prisma.aiSession.create({
      data: {
        userId: input.userId,
        mode: SessionMode.CHAT,
        title: titleFromQuestion(input.question),
        messages: {
          create: messages,
        },
      },
    });

    return session.id;
  });

  if (dbResult.ok) {
    if (!dbResult.value) {
      throw new Error("Chat session not found.");
    }

    return dbResult.value;
  }

  requireChatSessionDatabaseWrite();

  const createdAt = new Date().toISOString();

  if (input.sessionId) {
    const existing = sessions.find(
      (session) => session.id === input.sessionId && session.userId === input.userId,
    );

    if (!existing) {
      throw new Error("Chat session not found.");
    }

    existing.messages.push(
      {
        id: `msg_${randomUUID()}`,
        role: "USER",
        content: input.question,
        createdAt,
      },
      {
        id: `msg_${randomUUID()}`,
        role: "ASSISTANT",
        content: input.answer,
        toolResult: input.toolResults,
        createdAt,
      },
    );
    existing.updatedAt = createdAt;
    return existing.id;
  }

  const session: MemorySession = {
    id: `chat_${randomUUID()}`,
    userId: input.userId,
    title: titleFromQuestion(input.question),
    createdAt,
    updatedAt: createdAt,
    messages: [
      {
        id: `msg_${randomUUID()}`,
        role: "USER",
        content: input.question,
        createdAt,
      },
      {
        id: `msg_${randomUUID()}`,
        role: "ASSISTANT",
        content: input.answer,
        toolResult: input.toolResults,
        createdAt,
      },
    ],
  };

  sessions.push(session);
  return session.id;
}

export async function getChatSessionDetail(input: {
  userId: string;
  sessionId: string;
}) {
  const dbResult = await tryPrisma(async (prisma) => {
    const session = await prisma.aiSession.findFirst({
      where: {
        id: input.sessionId,
        userId: input.userId,
        mode: SessionMode.CHAT,
      },
      include: {
        messages: {
          where: {
            OR: [
              { turnId: null },
              { turn: { status: { in: visibleTurnStatuses } } },
            ],
          },
          orderBy: [
            { createdAt: "asc" },
            { id: "asc" },
          ],
        },
      },
    });

    return session ? normalizeChatSessionDetail(session) : null;
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireChatSessionDatabaseRead();

  const session = sessions.find(
    (item) => item.id === input.sessionId && item.userId === input.userId,
  );

  return session ? normalizeChatSessionDetail(session) : null;
}

export async function getRecentChatSessions(userId: string, limit = 5) {
  const take = Math.max(1, Math.min(limit, 20));
  const dbResult = await tryPrisma(async (prisma) => {
    const rows = await prisma.aiSession.findMany({
      where: {
        userId,
        mode: SessionMode.CHAT,
        messages: {
          some: {
            role: MessageRole.ASSISTANT,
            OR: [
              { turnId: null },
              { turn: { status: { in: visibleTurnStatuses } } },
            ],
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      take,
      include: {
        messages: {
          where: {
            OR: [
              { turnId: null },
              { turn: { status: { in: visibleTurnStatuses } } },
            ],
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    return rows.map((session) => normalizeRecentChatSession(session));
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireChatSessionDatabaseRead();

  return sessions
    .filter((session) => session.userId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, take)
    .map(normalizeRecentChatSession);
}

export async function updateChatSessionTitle(input: {
  userId: string;
  sessionId: string;
  title: string;
}) {
  const title = normalizeSessionTitle(input.title);

  if (!title) {
    return null;
  }

  const dbResult = await tryPrisma(async (prisma) => {
    const existing = await prisma.aiSession.findFirst({
      where: {
        id: input.sessionId,
        userId: input.userId,
        mode: SessionMode.CHAT,
      },
      select: { id: true },
    });

    if (!existing) {
      return null;
    }

    const session = await prisma.aiSession.update({
      where: { id: input.sessionId },
      data: { title },
      include: {
        messages: {
          where: {
            OR: [
              { turnId: null },
              { turn: { status: { in: visibleTurnStatuses } } },
            ],
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    return normalizeRecentChatSession(session);
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireChatSessionDatabaseWrite();

  const session = sessions.find(
    (item) => item.id === input.sessionId && item.userId === input.userId,
  );

  if (!session) {
    return null;
  }

  session.title = title;
  session.updatedAt = new Date().toISOString();
  return normalizeRecentChatSession(session);
}

export async function deleteChatSession(input: {
  userId: string;
  sessionId: string;
}) {
  const dbResult = await tryPrisma(async (prisma) => {
    const existing = await prisma.aiSession.findFirst({
      where: {
        id: input.sessionId,
        userId: input.userId,
        mode: SessionMode.CHAT,
      },
      select: { activeTurnId: true },
    });

    if (!existing) {
      return false as const;
    }

    if (existing.activeTurnId) {
      return "busy" as const;
    }

    const result = await prisma.aiSession.deleteMany({
      where: {
        id: input.sessionId,
        userId: input.userId,
        mode: SessionMode.CHAT,
        activeTurnId: null,
      },
    });

    return result.count > 0 ? true as const : "busy" as const;
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireChatSessionDatabaseWrite();

  const index = sessions.findIndex(
    (item) => item.id === input.sessionId && item.userId === input.userId,
  );

  if (index < 0) {
    return false;
  }

  sessions.splice(index, 1);
  return true;
}
