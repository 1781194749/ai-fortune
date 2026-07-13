import {
  deleteChatSession,
  updateChatSessionTitle,
} from "@/lib/ai-session-store";
import { getSession } from "@/lib/session";

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

  if (!deleted) {
    return Response.json({ ok: false, message: "对话不存在。" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
