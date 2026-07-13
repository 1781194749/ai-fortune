import "server-only";

import { randomUUID } from "node:crypto";
import { getRecentChatSessions } from "@/lib/ai-session-store";
import { tryPrisma } from "@/lib/prisma";
import { ensureDbUser } from "@/lib/user-store";

const companionFeature = "member_key_stage_companion";
const companionDurationDays = 30;

export type CompanionReviewKind = "weekly" | "monthly";

export type CompanionTheme = {
  id: string;
  userId: string;
  title: string;
  context: string | null;
  startedAt: string;
  endsAt: string;
  updatedAt: string;
};

export type CompanionReview = {
  id: string;
  themeId: string;
  kind: CompanionReviewKind;
  title: string;
  summary: string;
  signals: string[];
  nextActions: string[];
  chatCount: number;
  createdAt: string;
};

export type MemberCompanionState = {
  theme: CompanionTheme | null;
  reviews: CompanionReview[];
  availability: {
    weekly: CompanionReviewAvailability;
    monthly: CompanionReviewAvailability;
  };
};

export type CompanionReviewAvailability = {
  available: boolean;
  nextAt: string | null;
  message: string;
};

type CompanionEvent =
  | {
      id: string;
      type: "theme_saved";
      theme: CompanionTheme;
      createdAt: string;
    }
  | {
      id: string;
      type: "review_created";
      review: CompanionReview;
      createdAt: string;
    };

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCompanionEvent(value: unknown): value is CompanionEvent {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.createdAt !== "string") {
    return false;
  }

  if (value.type === "theme_saved") {
    return isRecord(value.theme) && typeof value.theme.id === "string";
  }

  return value.type === "review_created" && isRecord(value.review) && typeof value.review.id === "string";
}

function stateFromEvents(events: CompanionEvent[]): MemberCompanionState {
  const ordered = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let theme: CompanionTheme | null = null;
  const reviews: CompanionReview[] = [];

  for (const event of ordered) {
    if (event.type === "theme_saved") {
      theme = event.theme;
    } else {
      reviews.push(event.review);
    }
  }

  const activeTheme = theme
    ? {
        ...theme,
      }
    : null;

  const activeReviews = activeTheme
    ? reviews
        .filter((review) => review.themeId === activeTheme.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];

  return {
    theme: activeTheme,
    reviews: activeReviews,
    availability: getReviewAvailability(activeTheme, activeReviews),
  };
}

function getReviewAvailability(
  theme: CompanionTheme | null,
  reviews: CompanionReview[],
): MemberCompanionState["availability"] {
  if (!theme) {
    const unavailable = {
      available: false,
      nextAt: null,
      message: "设置核心主题后开始计算复盘周期。",
    };

    return { weekly: unavailable, monthly: unavailable };
  }

  const now = Date.now();
  const startedAt = new Date(theme.startedAt);
  const endsAt = new Date(theme.endsAt);
  const latestWeekly = reviews.find((review) => review.kind === "weekly");
  const hasMonthly = reviews.some((review) => review.kind === "monthly");
  const weeklyBase = latestWeekly ? new Date(latestWeekly.createdAt) : startedAt;
  const weeklyAt = addDays(weeklyBase, 7);
  const weeklyAvailable = now >= weeklyAt.getTime() && now < endsAt.getTime();
  const monthlyAvailable = now >= endsAt.getTime() && !hasMonthly;

  return {
    weekly: {
      available: weeklyAvailable,
      nextAt: weeklyAvailable ? null : weeklyAt.toISOString(),
      message: weeklyAvailable
        ? "本周复盘已开放。"
        : now >= endsAt.getTime()
          ? "本阶段已结束，请生成 30 天总结。"
          : "每满 7 天开放一次 AI 周复盘。",
    },
    monthly: {
      available: monthlyAvailable,
      nextAt: monthlyAvailable || hasMonthly ? null : endsAt.toISOString(),
      message: hasMonthly
        ? "本阶段总结已生成。"
        : monthlyAvailable
          ? "30 天阶段总结已开放。"
          : "核心主题满 30 天后开放阶段总结。",
    },
  };
}

function eventFromLog(log: { id: string; metadata: unknown; createdAt: Date }) {
  if (!isRecord(log.metadata)) {
    return null;
  }

  const event = {
    ...log.metadata,
    id: log.id,
    createdAt: log.createdAt.toISOString(),
  };

  return isCompanionEvent(event) ? event : null;
}

async function writeEvent(userId: string, event: CompanionEvent) {
  const dbResult = await tryPrisma(async (prisma) => {
    await ensureDbUser(prisma, { userId });
    const log = await prisma.usageLog.create({
      data: {
        userId,
        provider: "system",
        model: "member-companion-v1",
        feature: companionFeature,
        metadata: event as never,
      },
    });

    return {
      ...event,
      id: log.id,
      createdAt: log.createdAt.toISOString(),
    } satisfies CompanionEvent;
  });
  if (!dbResult.ok) {
    throw new Error("PostgreSQL 暂时不可用，阶段陪伴数据未保存。请稍后重试。");
  }

  return dbResult.value;
}

export async function getMemberCompanionState(userId: string) {
  const dbResult = await tryPrisma(async (prisma) => {
    const logs = await prisma.usageLog.findMany({
      where: { userId, feature: companionFeature },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: { id: true, metadata: true, createdAt: true },
    });

    return logs.map(eventFromLog).filter((event): event is CompanionEvent => Boolean(event));
  });

  if (!dbResult.ok) {
    throw new Error("PostgreSQL 暂时不可用，无法读取阶段陪伴数据。");
  }

  return stateFromEvents(dbResult.value);
}

export async function saveMemberCompanionTheme(input: {
  userId: string;
  title: string;
  context?: string | null;
}) {
  const title = cleanText(input.title, 60);
  const context = cleanText(input.context, 500) || null;

  if (!title) {
    throw new Error("请填写本月最重要的核心主题。");
  }

  const state = await getMemberCompanionState(input.userId);
  const now = new Date();
  const currentTheme = state.theme;
  const stillActive = currentTheme && new Date(currentTheme.endsAt).getTime() > now.getTime();
  const theme: CompanionTheme = {
    id: stillActive ? currentTheme.id : `theme_${randomUUID()}`,
    userId: input.userId,
    title,
    context,
    startedAt: stillActive ? currentTheme.startedAt : now.toISOString(),
    endsAt: stillActive ? currentTheme.endsAt : addDays(now, companionDurationDays).toISOString(),
    updatedAt: now.toISOString(),
  };
  const event: CompanionEvent = {
    id: `companion_${randomUUID()}`,
    type: "theme_saved",
    theme,
    createdAt: now.toISOString(),
  };

  await writeEvent(input.userId, event);
  return getMemberCompanionState(input.userId);
}

function buildReview(input: {
  theme: CompanionTheme;
  kind: CompanionReviewKind;
  chats: Awaited<ReturnType<typeof getRecentChatSessions>>;
}) {
  const createdAt = new Date().toISOString();
  const periodLabel = input.kind === "weekly" ? "本周" : "本阶段";
  const chatTitles = input.chats.map((chat) => chat.title).filter(Boolean).slice(0, 3);
  const signals = chatTitles.length > 0
    ? chatTitles
    : ["当前还没有围绕核心主题产生新的对话记录"];
  const summary = input.chats.length > 0
    ? `${periodLabel}围绕「${input.theme.title}」完成了 ${input.chats.length} 次相关推演。当前更值得关注的不是一次性结论，而是这些问题里反复出现的选择、阻力和现实条件。`
    : `${periodLabel}已经进入「${input.theme.title}」的跟进周期，但暂时没有新的对话记录。先补充最近发生的变化，后续复盘才会形成更准确的上下文。`;
  const nextActions = [
    `在 Chat 中补充「${input.theme.title}」最近一周发生的一个具体变化`,
    "记录一个支持当前方向的现实证据，以及一个需要继续验证的风险",
    input.kind === "weekly" ? "下周复盘时对照本次判断是否发生变化" : "从本阶段结论中选出下一周期唯一优先事项",
  ];

  return {
    id: `review_${randomUUID()}`,
    themeId: input.theme.id,
    kind: input.kind,
    title: input.kind === "weekly" ? "阶段周复盘" : "30 天阶段总结",
    summary,
    signals,
    nextActions,
    chatCount: input.chats.length,
    createdAt,
  } satisfies CompanionReview;
}

export async function generateMemberCompanionReview(input: {
  userId: string;
  kind: CompanionReviewKind;
}) {
  const state = await getMemberCompanionState(input.userId);

  if (!state.theme) {
    throw new Error("请先设置本月核心主题。");
  }

  const availability = state.availability[input.kind];

  if (!availability.available) {
    throw new Error(availability.message);
  }

  const recentChats = await getRecentChatSessions(input.userId, 20);
  const startedAt = new Date(state.theme.startedAt).getTime();
  const cutoff = input.kind === "weekly"
    ? Date.now() - 7 * 24 * 60 * 60 * 1000
    : startedAt;
  const chats = recentChats.filter((chat) => new Date(chat.updatedAt).getTime() >= cutoff);
  const review = buildReview({ theme: state.theme, kind: input.kind, chats });
  const event: CompanionEvent = {
    id: `companion_${randomUUID()}`,
    type: "review_created",
    review,
    createdAt: review.createdAt,
  };

  await writeEvent(input.userId, event);
  return getMemberCompanionState(input.userId);
}
