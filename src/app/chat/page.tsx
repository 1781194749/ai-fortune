import { redirect } from "next/navigation";
import { getRecentChatSessions } from "@/lib/ai-session-store";
import { isAdminUserId } from "@/lib/admin-auth";
import { getFortuneProfile } from "@/lib/fortune-profile-store";
import { getInviteRewardSummary } from "@/lib/invite-rewards";
import { createLoginHref } from "@/lib/return-to";
import { getSession } from "@/lib/session";
import { ChatClient } from "./chat-client";

function getWuxingSummary(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const profile = value as { strongest?: unknown; weakest?: unknown };
  const strongest = typeof profile.strongest === "string" ? profile.strongest : null;
  const weakest = Array.isArray(profile.weakest)
    ? profile.weakest.filter((item): item is string => typeof item === "string")
    : [];

  if (!strongest && weakest.length === 0) {
    return null;
  }

  return [strongest ? `${strongest}偏强` : null, weakest.length > 0 ? `${weakest.join("、")}需照顾` : null]
    .filter(Boolean)
    .join(" · ");
}

export default async function ChatPage() {
  const session = await getSession();

  if (!session) {
    redirect(createLoginHref("/chat"));
  }

  const [recentChats, profile, canAccessAdmin, inviteRewardSummary] = await Promise.all([
    getRecentChatSessions(session.userId, 12),
    getFortuneProfile(session.userId),
    isAdminUserId(session.userId),
    getInviteRewardSummary(session.userId),
  ]);

  return (
    <ChatClient
      initialBalance={session.starBalance}
      initialRecentChats={recentChats}
      inviteUrl={inviteRewardSummary.inviteUrl}
      account={{ email: session.emailMasked, tier: session.tier, canAccessAdmin }}
      profile={{
        name: profile?.name ?? null,
        completeness: profile?.completeness ?? 0,
        memorySummary: profile?.memorySummary ?? null,
        zodiac: profile?.zodiac ?? null,
        wuxingSummary: getWuxingSummary(profile?.wuxingProfile),
        topics: profile?.recurringTopics ?? [],
      }}
    />
  );
}
