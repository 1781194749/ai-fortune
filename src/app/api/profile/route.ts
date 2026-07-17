import { getFortuneProfile, upsertFortuneProfile } from "@/lib/fortune-profile-store";
import { isDatabaseUnavailableError } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
    }

    const profile = await getFortuneProfile(session.userId);

    return Response.json({
      ok: true,
      profile,
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return Response.json(
        { ok: false, code: error.code, message: error.message },
        { status: error.status },
      );
    }

    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | {
          name?: string | null;
          gender?: string | null;
          birthDate?: string | null;
          birthTime?: string | null;
          birthPlace?: string | null;
          calendarType?: string | null;
          relationshipStatus?: string | null;
          careerFocus?: string | null;
          recurringTopics?: string | string[] | null;
        }
      | null;

    if (!body) {
      return Response.json({ ok: false, message: "档案内容无效。" }, { status: 400 });
    }

    const profile = await upsertFortuneProfile(session.userId, body);

    return Response.json({
      ok: true,
      profile,
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return Response.json(
        { ok: false, code: error.code, message: error.message },
        { status: error.status },
      );
    }

    throw error;
  }
}
