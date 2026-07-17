import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  History,
  RefreshCw,
} from "lucide-react";
import {
  getEntitlementUsageLabel,
  getMemberEntitlementSummary,
} from "@/lib/member-entitlements";
import { getUserMockOrders } from "@/lib/mock-payment-store";
import { getUserMockReports } from "@/lib/report-store";
import { getMembershipLifecycleSnapshot } from "@/lib/membership-lifecycle";
import { formatPercent, formatTime, getRequiredMemberSession, tierMeta } from "../member-data";
import { PageHeader, Panel } from "../member-ui";

export default async function MemberEntitlementsPage() {
  const session = await getRequiredMemberSession();
  const [rawOrders, reports, lifecycle] = await Promise.all([
    getUserMockOrders(session.userId),
    getUserMockReports(session.userId),
    getMembershipLifecycleSnapshot(session.userId),
  ]);
  const entitlementSummary = await getMemberEntitlementSummary({
    userId: session.userId,
    orders: rawOrders,
    reports,
  });
  const membership = tierMeta[lifecycle.tier];
  const statusLabel = lifecycle.status === "ACTIVE"
    ? "生效中"
    : lifecycle.status === "EXPIRING_SOON"
      ? "即将到期"
      : lifecycle.status === "EXPIRED"
        ? "已到期"
        : "未开通";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Entitlements"
        title="权益额度"
        description="集中管理会员身份、陪伴周期、报告额度、手相额度和必要追问余量。"
        action={{ href: "/pricing", label: "管理会员方案", icon: CircleDollarSign }}
      />

      {lifecycle.status === "EXPIRING_SOON" ? (
        <div className="flex flex-col gap-3 rounded-lg border border-[#d8b873]/35 bg-[#19160f] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-[#efd9a6]">
            <AlertTriangle size={16} aria-hidden="true" />
            当前会员将在 {lifecycle.daysRemaining} 天后到期，到期后身份和未使用会员额度会自动失效。
          </p>
          <Link href="/pricing#plans" className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-[#c9a35f] px-3 text-sm font-medium text-[#17130d]">
            <RefreshCw size={14} aria-hidden="true" />
            立即续费
          </Link>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-[#252a32] bg-[#101318] p-5">
          <p className="text-xs text-[#697386]">当前身份</p>
          <p className="mt-3 text-2xl font-semibold text-[#d8b873]">{membership.label}</p>
          <p className="mt-3 text-sm leading-6 text-[#8d98a8]">{statusLabel}</p>
        </div>
        <div className="rounded-lg border border-[#252a32] bg-[#101318] p-5">
          <p className="text-xs text-[#697386]">会员有效期</p>
          <p className="mt-3 text-2xl font-semibold text-[#f4efe5]">{lifecycle.endsAt ? formatTime(lifecycle.endsAt) : "未开通"}</p>
          <p className="mt-3 text-sm text-[#8d98a8]">{lifecycle.daysRemaining !== null ? `剩余 ${lifecycle.daysRemaining} 天` : "当前没有有效会员周期"}</p>
        </div>
        <div className="rounded-lg border border-[#252a32] bg-[#101318] p-5">
          <p className="text-xs text-[#697386]">续费方式</p>
          <p className="mt-3 text-2xl font-semibold text-[#f4efe5]">手动续费</p>
          <p className="mt-3 text-sm text-[#8d98a8]">当前未开启自动扣款。</p>
        </div>
        <div className="rounded-lg border border-[#252a32] bg-[#101318] p-5">
          <p className="text-xs text-[#697386]">累计续期</p>
          <p className="mt-3 text-2xl font-semibold text-[#f4efe5]">{lifecycle.renewalCount} 次</p>
          <p className="mt-3 text-sm text-[#8d98a8]">同档续费会从当前到期日顺延。</p>
        </div>
      </section>

      <Panel title="会员周期" description="当前周期与关键状态" icon={CalendarClock}>
        <div className="grid gap-px bg-[#20252d] sm:grid-cols-3">
          <div className="bg-[#101318] p-5">
            <p className="text-xs text-[#697386]">开始时间</p>
            <p className="mt-3 text-sm font-medium text-[#d7dee8]">{lifecycle.startsAt ? formatTime(lifecycle.startsAt) : "未开始"}</p>
          </div>
          <div className="bg-[#101318] p-5">
            <p className="text-xs text-[#697386]">到期时间</p>
            <p className="mt-3 text-sm font-medium text-[#d7dee8]">{lifecycle.endsAt ? formatTime(lifecycle.endsAt) : "未设置"}</p>
          </div>
          <div className="bg-[#101318] p-5">
            <p className="text-xs text-[#697386]">追问余量</p>
            <p className="mt-3 text-sm font-medium text-[#d7dee8]">{session.starBalance} 星力</p>
          </div>
        </div>
      </Panel>

      <Panel title="额度明细" description="每类权益独立展示，不和其他管理项混在一起" icon={BadgeCheck}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-[#252a32] text-xs text-[#697386]">
              <tr>
                <th className="px-5 py-3 font-medium">权益</th>
                <th className="px-5 py-3 font-medium">来源订单</th>
                <th className="px-5 py-3 font-medium">总额度</th>
                <th className="px-5 py-3 font-medium">已用</th>
                <th className="px-5 py-3 font-medium">剩余</th>
                <th className="px-5 py-3 font-medium">进度</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#20252d]">
              {entitlementSummary.balances.map((balance) => {
                const percent = balance.granted > 0 ? Math.round((balance.used / balance.granted) * 100) : 0;

                return (
                  <tr key={balance.kind} className="text-[#c8d0dc]">
                    <td className="px-5 py-4 font-medium">{balance.label}</td>
                    <td className="px-5 py-4">{balance.sourceOrders}</td>
                    <td className="px-5 py-4">{balance.granted}</td>
                    <td className="px-5 py-4">{balance.used}</td>
                    <td className="px-5 py-4">{balance.remaining}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-1.5 w-28 overflow-hidden rounded-full bg-[#252a32]">
                          <span className="block h-full rounded-full bg-[#3c8b72]" style={{ width: formatPercent(percent) }} />
                        </span>
                        <span className="text-xs text-[#8d98a8]">{getEntitlementUsageLabel(balance)}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-[#252a32] px-5 py-4">
          <Link href="/pricing" className="inline-flex h-9 items-center gap-2 rounded-md border border-[#303642] px-3 text-sm text-[#d8b873] transition hover:border-[#c9a35f]/55 hover:bg-[#19160f]">
            <CircleDollarSign size={15} aria-hidden="true" />
            查看可购买方案
          </Link>
        </div>
      </Panel>

      <Panel title="生命周期记录" description="开通、续期、升档、退款与到期记录" icon={History}>
        {lifecycle.events.length > 0 ? (
          <div className="divide-y divide-[#20252d]">
            {lifecycle.events.map((event) => {
              const metadata = typeof event.metadata === "object" && event.metadata !== null && !Array.isArray(event.metadata)
                ? event.metadata as Record<string, unknown>
                : {};
              const action = typeof metadata.action === "string" ? metadata.action : "UPDATED";
              const actionLabel = action === "ACTIVATED"
                ? "会员已开通"
                : action === "RENEWED"
                  ? "会员已续期"
                  : action === "UPGRADED"
                    ? "会员已升档"
                    : action === "EXPIRED"
                      ? "会员已到期"
                      : "会员状态已校准";

              return (
                <div key={event.id} className="flex items-start gap-3 px-5 py-4">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-[#303642] bg-[#0b0d11] text-[#d8b873]">
                    <Clock3 size={14} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#d7dee8]">{actionLabel}</p>
                    <p className="mt-1 text-xs text-[#697386]">{formatTime(event.createdAt)}</p>
                  </div>
                  <span className="text-xs text-[#8d98a8]">
                    {typeof metadata.tierAfter === "string" ? tierMeta[metadata.tierAfter as keyof typeof tierMeta]?.label : ""}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-5 text-sm text-[#8d98a8]">暂无会员变更记录。</div>
        )}
      </Panel>
    </div>
  );
}
