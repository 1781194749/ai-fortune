import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Camera,
  Coins,
  FileText,
  Gift,
  Hexagon,
  History,
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
import { getOrderDisplay, getUserMockOrders } from "@/lib/mock-payment-store";
import { getUserMockReports } from "@/lib/report-store";
import {
  getRequiredMemberSession,
  getChatIntentLabel,
  getOrderStatusLabel,
  getReportStatusLabel,
  getReportTypeLabel,
  formatTime,
} from "./member-data";
import { EmptyState, MetricCard, PageHeader, Panel } from "./member-ui";

const quickActions = [
  { href: "/chat", label: "AI 问事", detail: "先确认方式", icon: Bot },
  { href: "/reports/deep", label: "深度报告", detail: "沉淀判断", icon: ScrollText },
  { href: "/tarot", label: "塔罗", detail: "牌阵问事", icon: Sparkles },
  { href: "/bazi", label: "八字", detail: "命盘详析", icon: Hexagon },
  { href: "/bagua", label: "八卦", detail: "六十四卦", icon: Target },
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
  const recentReports = reports.slice(0, 3);
  const recentOrders = rawOrders.map(getOrderDisplay).slice(0, 3);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="账户概览"
        description="这里只放账户核心状态和下一步入口。具体管理项在左侧拆分页面里处理。"
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          label="陪伴状态"
          value={companionState?.theme ? "跟进中" : canUseCompanion ? "待开启" : "未开启"}
          detail={companionState?.theme?.title ?? (canUseCompanion ? "设置 30 天核心主题" : "¥99 方案解锁主题陪伴")}
          icon={Route}
        />
        <MetricCard
          label="深度报告额度"
          value={entitlementSummary.reportQuota.remaining}
          suffix="份"
          detail={`${entitlementSummary.reportQuota.remaining} 份深度报告额度 · 用量 ${getEntitlementUsageLabel(entitlementSummary.reportQuota)}`}
          icon={FileText}
        />
        <MetricCard
          label="手相额度"
          value={entitlementSummary.palmQuota.remaining}
          suffix="次"
          detail={`${entitlementSummary.palmQuota.remaining} 次手相额度 · 用量 ${getEntitlementUsageLabel(entitlementSummary.palmQuota)}`}
          icon={Camera}
        />
        <MetricCard
          label="档案完整度"
          value={profile?.completeness ?? 0}
          suffix="%"
          detail={profile ? "命理档案状态" : "尚未建档"}
          icon={UserRound}
        />
        <MetricCard label="追问余量" value={session.starBalance} suffix="星力" detail="按服务确认后消耗" icon={Coins} />
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

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="最近报告" description="完成、生成中和失败状态都在这里回看" icon={FileText}>
          <div className="divide-y divide-[#20252d]">
            {recentReports.length > 0 ? (
              recentReports.map((report) => (
                <Link
                  key={report.id}
                  href={report.status === "COMPLETED" ? `/reports/${report.id}` : "/reports/deep"}
                  className="group flex items-center gap-4 px-5 py-4 transition hover:bg-[#151a21]"
                >
                  <span className="rounded-md border border-[#303642] px-2 py-1 text-xs text-[#8d98a8]">
                    {getReportTypeLabel(report.type)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[#d7dee8]">{report.title}</span>
                    <span className="mt-1 block truncate text-xs text-[#697386]">{report.summary || "报告内容整理中"}</span>
                  </span>
                  <span className="shrink-0 text-xs text-[#d8b873]">{getReportStatusLabel(report.status)}</span>
                </Link>
              ))
            ) : (
              <div className="p-5">
                <EmptyState icon={FileText} title="暂无报告文件" action={{ href: "/reports/deep", label: "生成报告" }} />
              </div>
            )}
          </div>
          <div className="border-t border-[#20252d] px-5 py-4">
            <Link href="/member/reports" className="inline-flex h-9 items-center gap-2 rounded-md border border-[#303642] px-3 text-sm text-[#d8b873] transition hover:border-[#c9a35f]/55 hover:bg-[#19160f]">
              查看全部报告
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </Panel>

        <Panel title="最近交易" description="订单、星力流水和权益用量分开管理" icon={History}>
          <div className="divide-y divide-[#20252d]">
            {recentOrders.length > 0 ? (
              recentOrders.map((order) => (
                <Link
                  key={order.id}
                  href="/member/records"
                  className="group flex items-center gap-4 px-5 py-4 transition hover:bg-[#151a21]"
                >
                  <span className="rounded-md border border-[#303642] px-2 py-1 text-xs text-[#8d98a8]">
                    {getOrderStatusLabel(order.status)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[#d7dee8]">{order.productName}</span>
                    <span className="mt-1 block truncate text-xs text-[#697386]">{formatTime(order.createdAt)}</span>
                  </span>
                  <span className="shrink-0 text-xs text-[#d8b873]">{order.priceLabel}</span>
                </Link>
              ))
            ) : (
              <div className="p-5">
                <EmptyState icon={History} title="暂无交易记录" action={{ href: "/pricing", label: "查看会员" }} />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-[#20252d] px-5 py-4">
            <Link href="/member/records" className="inline-flex h-9 items-center gap-2 rounded-md border border-[#303642] px-3 text-sm text-[#d8b873] transition hover:border-[#c9a35f]/55 hover:bg-[#19160f]">
              交易记录
            </Link>
            <Link href="/member/entitlements" className="inline-flex h-9 items-center gap-2 rounded-md border border-[#303642] px-3 text-sm text-[#d8b873] transition hover:border-[#c9a35f]/55 hover:bg-[#19160f]">
              权益额度
            </Link>
          </div>
        </Panel>
      </section>
    </div>
  );
}
