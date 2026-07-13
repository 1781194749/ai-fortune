import "server-only";

import { randomUUID } from "crypto";
import { MessageRole, SessionMode } from "@/generated/prisma/enums";
import { tryPrisma } from "@/lib/prisma";
import { ensureDbUser } from "@/lib/user-store";

type ChatTurnInput = {
  userId: string;
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

if (!globalThis.xuanjiAiSessions) {
  globalThis.xuanjiAiSessions = sessions;
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

    const session = await prisma.aiSession.create({
      data: {
        userId: input.userId,
        mode: SessionMode.CHAT,
        title: titleFromQuestion(input.question),
        messages: {
          create: [
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
          ],
        },
      },
    });

    return session.id;
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  const createdAt = new Date().toISOString();
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

export async function getRecentChatSessions(userId: string, limit = 5) {
  const take = Math.max(1, Math.min(limit, 20));
  const dbResult = await tryPrisma(async (prisma) => {
    const rows = await prisma.aiSession.findMany({
      where: {
        userId,
        mode: SessionMode.CHAT,
      },
      orderBy: {
        updatedAt: "desc",
      },
      take,
      include: {
        messages: {
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
    const result = await prisma.aiSession.deleteMany({
      where: {
        id: input.sessionId,
        userId: input.userId,
        mode: SessionMode.CHAT,
      },
    });

    return result.count > 0;
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  const index = sessions.findIndex(
    (item) => item.id === input.sessionId && item.userId === input.userId,
  );

  if (index < 0) {
    return false;
  }

  sessions.splice(index, 1);
  return true;
}
