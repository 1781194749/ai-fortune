"use client";

import { useState } from "react";
import { Check, Copy, Gift, Link2, UsersRound } from "lucide-react";
import type { InviteRewardSummary } from "@/lib/invite-rewards";

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 12)}...` : value;
}

function formatTime(value: string) {
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

export function InviteRewardCard({ summary }: { summary: InviteRewardSummary }) {
  const [copied, setCopied] = useState(false);

  async function copyInviteUrl() {
    try {
      await navigator.clipboard.writeText(summary.inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section id="invite-reward" className="min-w-0 scroll-mt-24 rounded-lg border border-[#252a32] bg-[#101318]">
      <div className="flex items-center justify-between border-b border-[#252a32] px-5 py-4">
        <div>
          <h2 className="font-semibold text-[#f4efe5]">邀请渠道</h2>
          <p className="mt-1 text-xs text-[#697386]">新人注册奖励与链接管理</p>
        </div>
        <span className="flex size-9 items-center justify-center rounded-md bg-[#3c8b72]/10 text-[#8ad5bd]">
          <Gift size={17} aria-hidden="true" />
        </span>
      </div>

      <div className="space-y-4 p-5">
        <div className="rounded-lg border border-[#303642] bg-[#0b0d11] p-4">
          <div className="flex items-center gap-2 text-xs text-[#8d98a8]">
            <Link2 size={14} aria-hidden="true" />
            专属邀请链接
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <div className="min-w-0 flex-1 rounded-md border border-[#252a32] bg-[#090b0e] px-3 py-2 font-mono text-xs leading-5 text-[#c8d0dc]">
              <span className="break-all">{summary.inviteUrl}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                void copyInviteUrl();
              }}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-[#3c8b72] px-3 text-sm font-medium text-[#06130f] transition hover:bg-[#8ad5bd]"
            >
              {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
              {copied ? "已复制" : "复制"}
            </button>
          </div>
          <p className="mt-2 truncate font-mono text-[11px] text-[#697386]">邀请码 {summary.code}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-[#303642] bg-[#0b0d11] p-3">
            <p className="text-xs text-[#697386]">邀请人奖励</p>
            <p className="mt-2 text-lg font-semibold text-[#8ad5bd]">+{summary.inviterStarGrant}</p>
          </div>
          <div className="rounded-lg border border-[#303642] bg-[#0b0d11] p-3">
            <p className="text-xs text-[#697386]">新人星力</p>
            <p className="mt-2 text-lg font-semibold text-[#f4efe5]">+{summary.inviteeStarGrant}</p>
          </div>
          <div className="rounded-lg border border-[#303642] bg-[#0b0d11] p-3">
            <p className="text-xs text-[#697386]">新人报告</p>
            <p className="mt-2 text-lg font-semibold text-[#f4efe5]">+{summary.inviteeDeepReportGrant}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[#303642] bg-[#0b0d11] p-4">
            <div className="flex items-center gap-2 text-xs text-[#697386]">
              <UsersRound size={14} aria-hidden="true" />
              成功邀请
            </div>
            <p className="mt-2 text-2xl font-semibold text-[#f4efe5]">{summary.totalAccepted}</p>
          </div>
          <div className="rounded-lg border border-[#303642] bg-[#0b0d11] p-4">
            <p className="text-xs text-[#697386]">累计获得</p>
            <p className="mt-2 text-2xl font-semibold text-[#f4efe5]">{summary.totalStarsEarned}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[#303642]">
          <div className="border-b border-[#303642] bg-[#0b0d11] px-4 py-3 text-xs font-medium text-[#8d98a8]">
            近期邀请记录
          </div>
          <div className="divide-y divide-[#20252d]">
            {summary.recentRewards.length > 0 ? (
              summary.recentRewards.map((reward) => (
                <div key={`${reward.inviteeId}-${reward.createdAt}`} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
                  <span className="min-w-0 truncate text-[#c8d0dc]">新人 {shortId(reward.inviteeId)}</span>
                  <span className="shrink-0 text-[#8ad5bd]">+{reward.inviterStarGrant} · {formatTime(reward.createdAt)}</span>
                </div>
              ))
            ) : (
              <p className="px-4 py-6 text-center text-sm text-[#697386]">暂无成功邀请记录</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
