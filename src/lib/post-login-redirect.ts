import "server-only";

import {
  getFortuneProfile,
  hasSavedFortuneProfile,
} from "@/lib/fortune-profile-store";
import { sanitizeReturnTo } from "@/lib/return-to";

function isOnboardingReturnTo(path: string) {
  return (
    path === "/onboarding" ||
    path.startsWith("/onboarding?") ||
    path.startsWith("/onboarding#") ||
    path.startsWith("/onboarding/")
  );
}

export async function resolvePostLoginRedirect(input: {
  returnTo?: string | null;
  userId: string;
  isNewUser: boolean;
}) {
  const redirectTo = sanitizeReturnTo(input.returnTo);

  if (!isOnboardingReturnTo(redirectTo) || input.isNewUser) {
    return redirectTo;
  }

  const profile = await getFortuneProfile(input.userId);
  return hasSavedFortuneProfile(profile) ? "/chat" : redirectTo;
}
