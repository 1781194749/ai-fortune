import {
  deleteChatSession,
  getChatSessionDetail,
  updateChatSessionTitle,
} from "@/lib/ai-session-store";
import { getSession } from "@/lib/session";
import type { ChatAnswerShape } from "@/lib/ai-orchestrator";
import {
  isChatServiceIntent,
  isChatServiceMode,
} from "@/lib/chat-service";
import { recoverPendingChatDeliveries } from "@/lib/chat-turn-service";
import { sanitizeCustomerAnswer } from "@/lib/product-identity";
import { publicApiErrorResponse } from "@/lib/public-api-error";

type SessionRouteContext = { params: Promise<{ sessionId: string }> };

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
function readHistoryMetadata(toolResult: unknown) {
  if (!isRecord(toolResult)) {
    return {
      answerShape: undefined,
      publicMetadata: {
        method: "general" as const,
        showRitual: false,
      },
    };
  }

  const method = isChatServiceIntent(toolResult.intent) ? toolResult.intent : "general";
  const serviceMode = isChatServiceMode(toolResult.serviceMode) ? toolResult.serviceMode : undefined;
  const answerShape = typeof toolResult.answerShape === "string" && answerShapes.has(toolResult.answerShape as ChatAnswerShape)
    ? toolResult.answerShape as ChatAnswerShape
    : undefined;
  return {
    answerShape,
    publicMetadata: {
      method,
      serviceMode,
      showRitual: answerShape !== "identity_boundary" &&
        answerShape !== "missing_info" &&
        answerShape !== "safety_boundary",
    },
  };
}

async function getChatSessionResponse(
  _request: Request,
  context: SessionRouteContext,
) {
  const session = await getSession();

  if (!session) {
    return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
  }

  const { sessionId } = await context.params;
  await recoverPendingChatDeliveries({
    userId: session.userId,
    sessionId,
    take: 1,
  });
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
        messages: chat.messages.map((message, index) => {
          const metadata = message.role === "assistant"
            ? readHistoryMetadata(message.toolResult)
            : null;

          return {
            id: message.id,
            role: message.role,
            content: message.role === "assistant"
              ? sanitizeCustomerAnswer(
                  message.content,
                  metadata?.answerShape,
                  chat.messages[index - 1]?.role === "user"
                    ? chat.messages[index - 1].content
                    : null,
                )
              : message.content,
            createdAt: message.createdAt,
            ...(metadata ? metadata.publicMetadata : {}),
          };
        }),
      },
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}

export async function GET(request: Request, context: SessionRouteContext) {
  try {
    return await getChatSessionResponse(request, context);
  } catch (error) {
    return publicApiErrorResponse(error, {
      context: "read chat session",
      message: "对话记录暂时无法读取，请稍后重试。",
      status: 503,
    });
  }
}

async function updateChatSessionResponse(
  request: Request,
  context: SessionRouteContext,
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

export async function PATCH(request: Request, context: SessionRouteContext) {
  try {
    return await updateChatSessionResponse(request, context);
  } catch (error) {
    return publicApiErrorResponse(error, {
      context: "update chat session",
      message: "对话标题暂时无法更新，请稍后重试。",
      status: 503,
    });
  }
}

async function deleteChatSessionResponse(
  _request: Request,
  context: SessionRouteContext,
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

export async function DELETE(request: Request, context: SessionRouteContext) {
  try {
    return await deleteChatSessionResponse(request, context);
  } catch (error) {
    return publicApiErrorResponse(error, {
      context: "delete chat session",
      message: "对话暂时无法删除，请稍后重试。",
      status: 503,
    });
  }
}
