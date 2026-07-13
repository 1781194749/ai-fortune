import { NextResponse } from "next/server";
import { sanitizeReturnTo } from "@/lib/return-to";
import { parseInviteCode, writeInviteAttribution } from "@/lib/invite-rewards";

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const requestUrl = new URL(request.url);
  const { code } = await context.params;
  const returnTo = sanitizeReturnTo(
    requestUrl.searchParams.get("returnTo"),
    "/onboarding",
  );
  const invite = parseInviteCode(code);

  if (!invite) {
    return NextResponse.redirect(
      new URL(
        `/login?inviteError=invalid&returnTo=${encodeURIComponent(returnTo)}`,
        requestUrl.origin,
      ),
    );
  }

  await writeInviteAttribution({
    code: invite.code,
    referrer: request.headers.get("referer") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.redirect(
    new URL(
      `/login?invite=1&returnTo=${encodeURIComponent(returnTo)}`,
      requestUrl.origin,
    ),
  );
}
