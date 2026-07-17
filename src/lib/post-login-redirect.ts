import "server-only";

import { sanitizeReturnTo } from "@/lib/return-to";

function isOnboardingReturnTo(path: string) {
  return (
    path === "/onboarding" ||
    path.startsWith("/onboarding?") ||
    path.startsWith("/onboarding#") ||
    path.startsWith("/onboarding/")
  );
}

function shouldDefaultToChat(path: string) {
  return path === "/member" || isOnboardingReturnTo(path);
}

export async function resolvePostLoginRedirect(input: {
  returnTo?: string | null;
  userId: string;
  isNewUser: boolean;
}) {
  const redirectTo = sanitizeReturnTo(input.returnTo);

  if (shouldDefaultToChat(redirectTo)) {
    return "/chat";
  }

  return redirectTo;
}
