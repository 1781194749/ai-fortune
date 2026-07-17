import {
  emailToUserId,
  isValidEmail,
  maskEmail,
  normalizeEmail,
  verifyEmailCode,
} from "@/lib/email-auth";
import { createSession } from "@/lib/session";
import { completeInviteRewardForLogin } from "@/lib/invite-rewards";
import { settleOptionalSideEffects } from "@/lib/optional-side-effects";
import { isDatabaseUnavailableError } from "@/lib/prisma";
import { recordShareAttributionConversion } from "@/lib/share-attribution";
import { ensureEmailUserAndGetState } from "@/lib/user-store";
import { resolvePostLoginRedirect } from "@/lib/post-login-redirect";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { email?: string; code?: string; returnTo?: string }
    | null;
  const email = normalizeEmail(body?.email ?? "");
  const code = body?.code?.trim() ?? "";

  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    return Response.json(
      { ok: false, message: "邮箱或验证码格式不正确。" },
      { status: 400 },
    );
  }

  if (!verifyEmailCode(email, code)) {
    return Response.json(
      { ok: false, message: "验证码错误或已过期。" },
      { status: 401 },
    );
  }

  try {
    const fallbackUserId = emailToUserId(email);
    const accountState = await ensureEmailUserAndGetState({
      userId: fallbackUserId,
      email,
    });

    await createSession({
      userId: accountState.userId,
      emailMasked: maskEmail(email),
      tier: accountState.tier,
      starBalance: accountState.starBalance,
    });
    await settleOptionalSideEffects("email login telemetry", [
      recordShareAttributionConversion({
        event: "login",
        userId: accountState.userId,
      }),
    ]);
    await completeInviteRewardForLogin({
      userId: accountState.userId,
      isNewUser: accountState.isNewUser,
    });
    const redirectTo = await resolvePostLoginRedirect({
      returnTo: body?.returnTo,
      userId: accountState.userId,
      isNewUser: accountState.isNewUser,
    });

    return Response.json({
      ok: true,
      redirectTo,
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
