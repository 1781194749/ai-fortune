import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Camera,
  Coins,
  FileText,
  Gift,
  Hexagon,
  MessageCircle,
  Route,
  ScrollText,
  Sparkles,
  Target,
  UserRound,
} from "lucide-react";
import { getRecentChatSessions } from "@/lib/ai-session-store";
import { getFortuneProfile } from "@/lib/fortune-profile-store";
import { getInviteRewardSummary } from "@/lib/invite-rewards";
import { hasMemberCompanionAccess } from "@/lib/member-companion-access";
import { getMemberCompanionState } from "@/lib/member-companion-store";
import {
  getEntitlementUsageLabel,
  getMemberEntitlementSummary,
} from "@/lib/member-entitlements";
import { getUserMockOrders } from "@/lib/mock-payment-store";
import { getUserMockReports } from "@/lib/report-store";
import { getRequiredMemberSession, getChatIntentLabel, formatTime } from "./member-data";
import { EmptyState, MetricCard, PageHeader, Panel } from "./member-ui";

const quickActions = [
  { href: "/chat", label: "AI 问事", detail: "继续对话", icon: Bot },
  { href: "/reports/deep", label: "深度报告", detail: "生成报告", icon: ScrollText },
  { href: "/tarot", label: "塔罗", detail: "三牌阵", icon: Sparkles },
  { href: "/bazi", label: "八字", detail: "五行排盘", icon: Hexagon },
  { href: "/bagua", label: "八卦", detail: "起卦问事", icon: Target },
  { href: "/palm", label: "手相", detail: "图片分析", icon: Camera },
] as const;

export default async function MemberOverviewPage() {
  const session = await getRequiredMemberSession();
  const canUseCompanion = hasMemberCompanionAccess(session.tier);
  const [rawOrders, reports, profile, recentChats, inviteRewardSummary, companionState] = await Promise.all([
    getUserMockOrders(session.userId),
    getUserMockReports(session.userId),
    getFortuneProfile(session.userId),
    getRecentChatSessions(session.userId, 4),
    getInviteRewardSummary(session.userId),
    canUseCompanion ? getMemberCompanionState(session.userId) : Promise.resolve(null),
  ]);
  const entitlementSummary = await getMemberEntitlementSummary({
    userId: session.userId,
    orders: rawOrders,
    reports,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="账户概览"
        description="这里只放账户核心状态和下一步入口。具体管理项在左侧拆分页面里处理。"
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="星力余额" value={session.starBalance} suffix="星力" detail="聊天与推演消耗" icon={Coins} />
        <MetricCard
          label="深度报告"
          value={entitlementSummary.reportQuota.remaining}
          suffix="份"
          detail={`用量 ${getEntitlementUsageLabel(entitlementSummary.reportQuota)}`}
          icon={FileText}
        />
        <MetricCard
          label="手相额度"
          value={entitlementSummary.palmQuota.remaining}
          suffix="次"
          detail={`用量 ${getEntitlementUsageLabel(entitlementSummary.palmQuota)}`}
          icon={Camera}
        />
        <MetricCard
          label="档案完整度"
          value={profile?.completeness ?? 0}
          suffix="%"
          detail={profile ? "命理档案状态" : "尚未建档"}
          icon={UserRound}
        />
        <MetricCard
          label="成功邀请"
          value={inviteRewardSummary.totalAccepted}
          suffix="人"
          detail={`已得 ${inviteRewardSummary.totalStarsEarned} 星力`}
          icon={Gift}
        />
      </section>

      <Link
        href="/member/companion"
        className="group grid gap-px overflow-hidden rounded-lg border border-[#303642] bg-[#303642] transition hover:border-[#c9a35f]/45 lg:grid-cols-[minmax(0,1fr)_auto]"
      >
        <div className="flex min-w-0 items-start gap-4 bg-[#101318] p-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-[#c9a35f]/35 bg-[#c9a35f]/8 text-[#d8b873]">
            <Route size={18} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-medium text-[#d8b873]">关键阶段陪伴</span>
            <span className="mt-1 block truncate text-base font-semibold text-[#f4efe5]">
              {companionState?.theme?.title ?? (canUseCompanion ? "设置这 30 天最重要的核心主题" : "把零散问事变成连续 30 天的阶段判断")}
            </span>
            <span className="mt-2 block text-sm leading-6 text-[#8d98a8]">
              {companionState?.theme
                ? `${companionState.availability.weekly.message} ${companionState.reviews.length} 份阶段记录已沉淀。`
                : canUseCompanion
                  ? "你的会员已包含此能力，现在可以直接开启。"
                  : "¥99 深度陪伴会员专属：每周复盘，30 天后生成阶段总结。"}
            </span>
          </span>
        </div>
        <span className="flex min-h-14 items-center justify-between gap-3 bg-[#0d1015] px-5 py-4 text-sm font-medium text-[#efd9a6] lg:min-w-48">
          {canUseCompanion ? (companionState?.theme ? "查看陪伴进度" : "开启陪伴") : "查看专属权益"}
          <ArrowRight size={16} className="transition group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </Link>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Panel title="快速入口" description="开始一个明确动作" icon={Target}>
          <div className="grid gap-px bg-[#20252d] sm:grid-cols-2 lg:grid-cols-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.href} href={action.href} className="group bg-[#101318] p-4 transition hover:bg-[#151a21]">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-md border border-[#303642] bg-[#0b0d11] text-[#d8b873]">
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-[#d7dee8]">{action.label}</span>
                      <span className="mt-1 block text-xs text-[#697386]">{action.detail}</span>
                    </span>
                    <ArrowRight size={15} className="ml-auto text-[#596273] transition group-hover:translate-x-0.5 group-hover:text-[#d8b873]" aria-hidden="true" />
                  </div>
                </Link>
              );
            })}
          </div>
        </Panel>

        <Panel title="最近对话" description="只展示最近 4 条，完整对话到 Chat 里继续" icon={MessageCircle}>
          <div className="divide-y divide-[#20252d]">
            {recentChats.length > 0 ? (
              recentChats.map((chat) => (
                <Link key={chat.id} href="/chat" className="group flex items-center gap-4 px-5 py-4 transition hover:bg-[#151a21]">
                  <span className="rounded-md border border-[#303642] px-2 py-1 text-xs text-[#8d98a8]">{getChatIntentLabel(chat.intent)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[#d7dee8]">{chat.title}</span>
                    <span className="mt-1 block truncate text-xs text-[#697386]">{chat.answer || chat.question}</span>
                  </span>
                  <span className="shrink-0 text-xs text-[#697386]">{formatTime(chat.updatedAt)}</span>
                </Link>
              ))
            ) : (
              <div className="p-5">
                <EmptyState icon={MessageCircle} title="暂无对话记录" action={{ href: "/chat", label: "开始问事" }} />
              </div>
            )}
          </div>
        </Panel>
      </section>
    </div>
  );
}
