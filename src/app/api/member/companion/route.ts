import { hasMemberCompanionAccess } from "@/lib/member-companion-access";
import {
  generateMemberCompanionReview,
  getMemberCompanionState,
  saveMemberCompanionTheme,
  type CompanionReviewKind,
} from "@/lib/member-companion-store";
import { getSession } from "@/lib/session";

type CompanionAction =
  | { action: "save_theme"; title?: unknown; context?: unknown }
  | { action: "generate_review"; kind?: unknown };

function isReviewKind(value: unknown): value is CompanionReviewKind {
  return value === "weekly" || value === "monthly";
}

async function getAuthorizedSession() {
  const session = await getSession();

  if (!session) {
    return {
      response: Response.json({ ok: false, message: "请先登录。" }, { status: 401 }),
      session: null,
    };
  }

  if (!hasMemberCompanionAccess(session.tier)) {
    return {
      response: Response.json(
        { ok: false, message: "关键阶段陪伴仅对 99 元深度陪伴会员开放。" },
        { status: 403 },
      ),
      session: null,
    };
  }

  return { response: null, session };
}

export async function GET() {
  const auth = await getAuthorizedSession();

  if (!auth.session) {
    return auth.response;
  }

  try {
    const state = await getMemberCompanionState(auth.session.userId);
    return Response.json({ ok: true, state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "数据库暂时不可用。";
    return Response.json({ ok: false, message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await getAuthorizedSession();

  if (!auth.session) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as CompanionAction | null;

  try {
    if (body?.action === "save_theme") {
      const state = await saveMemberCompanionTheme({
        userId: auth.session.userId,
        title: typeof body.title === "string" ? body.title : "",
        context: typeof body.context === "string" ? body.context : null,
      });

      return Response.json({ ok: true, state, message: "核心主题已保存。" });
    }

    if (body?.action === "generate_review" && isReviewKind(body.kind)) {
      const state = await generateMemberCompanionReview({
        userId: auth.session.userId,
        kind: body.kind,
      });

      return Response.json({
        ok: true,
        state,
        message: body.kind === "weekly" ? "本周复盘已生成。" : "30 天阶段总结已生成。",
      });
    }

    return Response.json({ ok: false, message: "无法识别本次操作。" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "操作失败，请稍后重试。";
    return Response.json({ ok: false, message }, { status: 400 });
  }
}
