import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createGoogleOAuthAttempt, buildGoogleAuthorizationUrl, isGoogleAuthConfigured } from "@/lib/google-auth";
import { sanitizeReturnTo } from "@/lib/return-to";

const attemptCookie = "xuanji_google_oauth";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const returnTo = sanitizeReturnTo(requestUrl.searchParams.get("returnTo") ?? undefined);

  if (!isGoogleAuthConfigured()) {
    return NextResponse.redirect(new URL(`/login?googleError=not_configured&returnTo=${encodeURIComponent(returnTo)}`, requestUrl.origin));
  }

  const { state, codeVerifier, codeChallenge } = createGoogleOAuthAttempt();
  const redirectUri = new URL("/api/auth/google/callback", requestUrl.origin).toString();
  const authorizationUrl = buildGoogleAuthorizationUrl({ redirectUri, state, codeChallenge });
  const cookieStore = await cookies();
  cookieStore.set(attemptCookie, Buffer.from(JSON.stringify({ state, codeVerifier, returnTo })).toString("base64url"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 10 * 60,
  });

  return NextResponse.redirect(authorizationUrl);
}
