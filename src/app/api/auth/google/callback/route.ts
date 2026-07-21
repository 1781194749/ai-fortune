import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  exchangeGoogleCode,
  getGoogleRedirectUri,
  getGoogleUser,
  getPublicAppOrigin,
} from "@/lib/google-auth";
import { maskEmail, normalizeEmail } from "@/lib/email-auth";
import { createSession } from "@/lib/session";
import { completeInviteRewardForLogin } from "@/lib/invite-rewards";
import { settleOptionalSideEffects } from "@/lib/optional-side-effects";
import { isDatabaseUnavailableError } from "@/lib/prisma";
import { recordShareAttributionConversion } from "@/lib/share-attribution";
import { ensureGoogleUserAndGetState } from "@/lib/user-store";
import { resolvePostLoginRedirect } from "@/lib/post-login-redirect";

const attemptCookie = "xuanji_google_oauth";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const publicOrigin = getPublicAppOrigin(requestUrl.origin);
  const cookieStore = await cookies();
  const encodedAttempt = cookieStore.get(attemptCookie)?.value;
  cookieStore.delete(attemptCookie);

  try {
    const attempt = JSON.parse(Buffer.from(encodedAttempt ?? "", "base64url").toString("utf8")) as {
      state?: string;
      codeVerifier?: string;
      returnTo?: string;
    };
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");

    if (!code || !state || state !== attempt.state || !attempt.codeVerifier) {
      throw new Error("Invalid Google OAuth callback.");
    }

    const redirectUri = getGoogleRedirectUri(requestUrl.origin);
    const accessToken = await exchangeGoogleCode({ code, codeVerifier: attempt.codeVerifier, redirectUri });
    const googleUser = await getGoogleUser(accessToken);
    const email = normalizeEmail(googleUser.email);
    const account = await ensureGoogleUserAndGetState({
      providerUserId: googleUser.sub,
      email,
      displayName: googleUser.name,
      avatarUrl: googleUser.picture,
    });

    await createSession({
      userId: account.userId,
      emailMasked: maskEmail(email),
      tier: account.tier,
      starBalance: account.starBalance,
    });
    await settleOptionalSideEffects("google login telemetry", [
      recordShareAttributionConversion({ event: "login", userId: account.userId }),
    ]);
    await completeInviteRewardForLogin({
      userId: account.userId,
      isNewUser: account.isNewUser,
    });
    const redirectTo = await resolvePostLoginRedirect({
      returnTo: attempt.returnTo,
      userId: account.userId,
      isNewUser: account.isNewUser,
    });

    return NextResponse.redirect(new URL(redirectTo, publicOrigin));
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.redirect(
        new URL("/login?googleError=database_unavailable", publicOrigin),
      );
    }

    console.error(
      "Google OAuth callback failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.redirect(new URL("/login?googleError=callback_failed", publicOrigin));
  }
}
