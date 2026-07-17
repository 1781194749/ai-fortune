import {
  deleteChatSession,
  getChatSessionDetail,
  updateChatSessionTitle,
} from "@/lib/ai-session-store";
import { getSession } from "@/lib/session";
import type { ChatAnswerShape, ChatConclusion } from "@/lib/ai-orchestrator";
import type { FortuneAnswer } from "@/lib/prompts/contracts";
import { isChatServiceMode } from "@/lib/chat-service";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const answerShapes = new Set<ChatAnswerShape>([
  "decision_ab",
  "tool_followup",
  "identity_boundary",
  "safety_boundary",
  "missing_info",
  "single_reading",
  "general_clarify",
]);
const answerStatuses = new Set<FortuneAnswer["status"]>([
  "ok",
  "needs_input",
  "blocked",
  "fallback",
]);

function readHistoryMetadata(toolResult: unknown) {
  if (!isRecord(toolResult)) {
    return { intent: null, toolNames: [] as string[] };
  }

  const intent = typeof toolResult.intent === "string" ? toolResult.intent : null;
  const toolNames = Array.isArray(toolResult.toolCalls)
    ? toolResult.toolCalls
        .map((tool) => (isRecord(tool) && typeof tool.name === "string" ? tool.name : ""))
        .filter(Boolean)
    : [];
  const serviceMode = isChatServiceMode(toolResult.serviceMode) ? toolResult.serviceMode : undefined;
  const answerShape = typeof toolResult.answerShape === "string" && answerShapes.has(toolResult.answerShape as ChatAnswerShape)
    ? toolResult.answerShape as ChatAnswerShape
    : undefined;
  const answerStatus = typeof toolResult.answerStatus === "string" && answerStatuses.has(toolResult.answerStatus as FortuneAnswer["status"])
    ? toolResult.answerStatus as FortuneAnswer["status"]
    : undefined;
  const conclusion = isRecord(toolResult.conclusion) &&
    typeof toolResult.conclusion.verdict === "string" &&
    Array.isArray(toolResult.conclusion.reasons) &&
    typeof toolResult.conclusion.risk === "string" &&
    typeof toolResult.conclusion.nextStep === "string" &&
    Array.isArray(toolResult.conclusion.followUps)
    ? toolResult.conclusion as ChatConclusion
    : undefined;

  return { intent, toolNames, serviceMode, answerShape, answerStatus, conclusion };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const session = await getSession();

  if (!session) {
    return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
  }

  const { sessionId } = await context.params;
  const chat = await getChatSessionDetail({
    userId: session.userId,
    sessionId,
  });

  if (!chat) {
    return Response.json({ ok: false, message: "对话不存在。" }, { status: 404 });
  }

  return Response.json(
    {
      ok: true,
      chat: {
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        messages: chat.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
          ...(message.role === "assistant"
            ? readHistoryMetadata(message.toolResult)
            : {}),
        })),
      },
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const session = await getSession();

  if (!session) {
    return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
  }

  const { sessionId } = await context.params;
  const body = (await request.json().catch(() => null)) as { title?: string } | null;
  const title = body?.title?.trim() ?? "";

  if (title.length < 1 || title.length > 40) {
    return Response.json(
      { ok: false, message: "标题长度需在 1-40 个字符之间。" },
      { status: 400 },
    );
  }

  const chat = await updateChatSessionTitle({
    userId: session.userId,
    sessionId,
    title,
  });

  if (!chat) {
    return Response.json({ ok: false, message: "对话不存在。" }, { status: 404 });
  }

  return Response.json({ ok: true, chat });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const session = await getSession();

  if (!session) {
    return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
  }

  const { sessionId } = await context.params;
  const deleted = await deleteChatSession({
    userId: session.userId,
    sessionId,
  });

  if (deleted === "busy") {
    return Response.json(
      { ok: false, message: "对话正在生成回答，完成或停止后才能删除。" },
      { status: 409 },
    );
  }

  if (!deleted) {
    return Response.json({ ok: false, message: "对话不存在。" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
