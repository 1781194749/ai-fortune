import "server-only";

import { sanitizeReturnTo } from "@/lib/return-to";
import { getFortuneProfile, hasSavedFortuneProfile } from "@/lib/fortune-profile-store";

function isOnboardingReturnTo(path: string) {
  return (
    path === "/onboarding" ||
    path.startsWith("/onboarding?") ||
    path.startsWith("/onboarding#") ||
    path.startsWith("/onboarding/")
  );
}

function shouldDefaultToChat(path: string) {
  return isOnboardingReturnTo(path);
}

export async function resolvePostLoginRedirect(input: {
  returnTo?: string | null;
  userId: string;
  isNewUser: boolean;
}) {
  const redirectTo = sanitizeReturnTo(input.returnTo);

  const profile = await getFortuneProfile(input.userId);
  const hasCompleteProfile = hasSavedFortuneProfile(profile);

  if (input.isNewUser || !hasCompleteProfile) {
    if (redirectTo === "/chat" || shouldDefaultToChat(redirectTo)) {
      return "/onboarding";
    }
  }

  if (shouldDefaultToChat(redirectTo)) {
    return "/chat";
  }

  return redirectTo;
}
