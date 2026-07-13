import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { isAdminUserId } from "@/lib/admin-auth";
import type { MembershipTierCode } from "@/lib/commerce";
import { createLoginHref } from "@/lib/return-to";
import { getSession } from "@/lib/session";

export const tierMeta: Record<MembershipTierCode, { label: string; description: string }> = {
  FREE: {
    label: "基础用户",
    description: "可使用基础档案、AI 对话与单项推演。",
  },
  TRIAL: {
    label: "体验会员",
    description: "体验完整顾问能力，适合从具体问题持续追问。",
  },
  MONTHLY: {
    label: "月度会员",
    description: "每月获得稳定星力与报告额度。",
  },
  PRO: {
    label: "进阶会员",
    description: "适合高频问事、深度报告与手相分析。",
  },
  YEARLY: {
    label: "深度陪伴会员",
    description: "围绕一个核心主题连续跟进 30 天，并获得周复盘与阶段总结。",
  },
};

export const getRequiredMemberSession = cache(async () => {
  const session = await getSession();

  if (!session) {
    redirect(createLoginHref("/member"));
  }

  return session;
});

export const getMemberShellData = cache(async () => {
  const session = await getRequiredMemberSession();
  const canAccessAdmin = await isAdminUserId(session.userId);

  return {
    session,
    canAccessAdmin,
    membership: tierMeta[session.tier],
    isFree: session.tier === "FREE",
  };
});

export function formatTime(value: string | undefined) {
  if (!value) {
    return "未设置";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatPercent(value: number) {
  return `${Math.max(0, Math.min(value, 100))}%`;
}

export function getReportTypeLabel(type: string) {
  if (type === "BAZI_WUXING") return "八字";
  if (type === "BAGUA") return "八卦";
  if (type === "PALM") return "手相";
  if (type === "COMPOSITE") return "综合";
  if (type === "YEARLY") return "年度";
  return "塔罗";
}

export function getReportStatusLabel(status: string) {
  if (status === "GENERATING") return "生成中";
  if (status === "FAILED") return "失败";
  return "完成";
}

export function getChatIntentLabel(intent: string | null) {
  if (intent === "tarot") return "塔罗";
  if (intent === "bazi") return "八字";
  if (intent === "bagua") return "八卦";
  if (intent === "palm") return "手相";
  return "对话";
}

export function getOrderStatusLabel(status: string) {
  if (status === "PAID") return "已完成";
  if (status === "PENDING") return "待支付";
  if (status === "REFUNDED") return "已退款";
  if (status === "CLOSED") return "已关闭";
  return "未完成";
}
