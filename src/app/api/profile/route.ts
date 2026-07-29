import { randomUUID } from "crypto";
import {
  getFortuneProfile,
  listFortuneProfiles,
  ProfileLimitError,
  upsertFortuneProfile,
} from "@/lib/fortune-profile-store";
import { toPublicFortuneProfile } from "@/lib/fortune-profile-public";
import { publicApiErrorResponse } from "@/lib/public-api-error";
import { getSession } from "@/lib/session";

export async function GET(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
    }

    const subjectKey = new URL(request.url).searchParams.get("subjectKey") ?? "self";
    const profile = await getFortuneProfile(session.userId, subjectKey);
    const profiles = await listFortuneProfiles(session.userId);

    return Response.json({
      ok: true,
      profile: profile ? toPublicFortuneProfile(profile) : null,
      profiles: profiles.map(toPublicFortuneProfile),
      profileLimit: session.profileLimit ?? 3,
    });
  } catch (error) {
    return publicApiErrorResponse(error, {
      context: "read customer profiles",
      message: "档案读取失败，请稍后重试。",
      unavailableMessage: "档案服务暂时不可用，请稍后重试。",
    });
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
          subjectKey?: string | null;
          gender?: string | null;
          birthDate?: string | null;
          lunarBirthDate?: string | null;
          yinliBirthDate?: string | null;
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

    const subjectKey = body.subjectKey === "new"
      ? `person_${randomUUID().replaceAll("-", "")}`
      : body.subjectKey ?? "self";
    const profile = await upsertFortuneProfile(
      session.userId,
      { ...body, subjectKey },
      subjectKey,
      session.profileLimit ?? 3,
    );

    return Response.json({
      ok: true,
      profile: toPublicFortuneProfile(profile),
    });
  } catch (error) {
    if (error instanceof ProfileLimitError) {
      return Response.json(
        {
          ok: false,
          message: `当前会员最多保存 ${error.limit} 份档案，请升级会员后再添加。`,
          profileLimit: error.limit,
        },
        { status: 409 },
      );
    }

    return publicApiErrorResponse(error, {
      context: "save customer profile",
      message: "档案保存失败，请稍后重试。",
      unavailableMessage: "档案服务暂时不可用，请稍后重试。",
    });
  }
}
