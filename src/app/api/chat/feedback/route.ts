import { getSession } from "@/lib/session";
import { createUsageLog } from "@/lib/usage-log-store";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { turnId?: unknown; code?: unknown; question?: unknown }
    | null;
  const turnId = typeof body?.turnId === "string" ? body.turnId.slice(0, 120) : undefined;
  const code = typeof body?.code === "string" ? body.code.slice(0, 80) : "CHAT_CLIENT_ERROR";
  const question = typeof body?.question === "string" ? body.question.trim().slice(0, 800) : "";

  if (!question) {
    return Response.json({ ok: false, message: "缺少本轮问题。" }, { status: 400 });
  }

  try {
    const feedback = await createUsageLog({
      userId: session.userId,
      provider: "internal",
      model: "chat-feedback",
      feature: "chat_feedback",
      metadata: { turnId, code, question },
    });

    return Response.json({ ok: true, feedbackId: feedback.id });
  } catch {
    return Response.json({ ok: false, message: "反馈暂时无法提交。" }, { status: 503 });
  }
}
