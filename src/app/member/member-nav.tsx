"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  FileText,
  Gift,
  Grid2X2,
  LayoutDashboard,
  MessageCircle,
  Route,
  ShieldCheck,
  UserRound,
  WalletCards,
} from "lucide-react";
import { XuanjiMark } from "@/app/_components/xuanji-mark";
import { brand } from "@/lib/site";
import { LogoutButton } from "./logout-button";

const navItems = [
  { href: "/member", label: "账户概览", icon: LayoutDashboard },
  { href: "/member/companion", label: "阶段陪伴", icon: Route },
  { href: "/member/entitlements", label: "权益额度", icon: Grid2X2 },
  { href: "/member/invite", label: "邀请有礼", icon: Gift },
  { href: "/member/profile", label: "命理档案", icon: UserRound },
  { href: "/member/reports", label: "报告文件", icon: FileText },
  { href: "/member/records", label: "交易记录", icon: WalletCards },
] as const;

function isActivePath(pathname: string, href: string) {
  return href === "/member" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function MemberNav({
  emailMasked,
  tierLabel,
  starBalance,
  canAccessAdmin,
}: {
  emailMasked: string;
  tierLabel: string;
  starBalance: number;
  canAccessAdmin: boolean;
}) {
  const pathname = usePathname();

  return (
    <>
      <aside className="hidden w-[260px] shrink-0 flex-col border-r border-[#20252d] bg-[#0d1015] px-4 py-5 lg:flex">
        <Link href="/" className="flex items-center gap-3 rounded-lg px-2 py-2" aria-label="返回玄机 AI 首页">
          <XuanjiMark className="size-9" />
          <span>
            <span className="block font-ritual text-base tracking-[0.08em] text-[#f4efe5]">{brand.cn}</span>
            <span className="block text-[10px] tracking-[0.18em] text-[#667085]">PERSONAL CENTER</span>
          </span>
        </Link>

        <nav className="mt-7 space-y-1 text-sm" aria-label="个人中心导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex h-10 items-center gap-3 rounded-md px-3 transition ${
                  active
                    ? "bg-[#19160f] text-[#efd9a6]"
                    : "text-[#a8b0bd] hover:bg-[#161b22] hover:text-[#f4efe5]"
                }`}
              >
                <Icon size={16} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
          {canAccessAdmin ? (
            <Link
              href="/admin"
              className="flex h-10 items-center gap-3 rounded-md px-3 text-[#d8b873] transition hover:bg-[#19160f] hover:text-[#efd9a6]"
            >
              <ShieldCheck size={16} aria-hidden="true" />
              平台后台
            </Link>
          ) : null}
        </nav>

        <div className="mt-7 rounded-lg border border-[#252a32] bg-[#101318] p-4">
          <p className="text-xs text-[#697386]">当前账户</p>
          <p className="mt-2 truncate text-sm font-medium text-[#d7dee8]">{emailMasked}</p>
          <div className="mt-4 flex items-center justify-between gap-3 text-xs">
            <span className="rounded-md border border-[#c9a35f]/28 bg-[#c9a35f]/8 px-2 py-1 text-[#d8b873]">{tierLabel}</span>
            <span className="text-[#8d98a8]">{starBalance} 星力</span>
          </div>
        </div>

        <div className="mt-auto pt-4">
          <LogoutButton variant="menu" />
        </div>
      </aside>

      <div className="border-b border-[#20252d] bg-[#0d1015] lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2" aria-label="返回玄机 AI 首页">
            <XuanjiMark className="size-8" />
            <span className="font-ritual text-base tracking-[0.08em] text-[#f4efe5]">{brand.cn}</span>
          </Link>
          <LogoutButton />
        </div>
        <nav className="xuanji-scrollbar flex gap-2 overflow-x-auto px-4 pb-3 text-sm" aria-label="个人中心移动导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 ${
                  active
                    ? "border-[#c9a35f]/45 bg-[#19160f] text-[#efd9a6]"
                    : "border-[#303642] bg-[#11151b] text-[#c8d0dc]"
                }`}
              >
                <Icon size={15} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
          {canAccessAdmin ? (
            <Link
              href="/admin"
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-[#c9a35f]/35 bg-[#19160f] px-3 text-[#efd9a6]"
            >
              <ShieldCheck size={15} aria-hidden="true" />
              平台后台
            </Link>
          ) : null}
        </nav>
      </div>
    </>
  );
}

export function MemberTopActions({ isFree }: { isFree: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href="/chat"
        className="inline-flex h-9 items-center gap-2 rounded-md border border-[#303642] bg-[#11151b] px-3 text-sm text-[#c8d0dc] transition hover:border-[#3d4654] hover:bg-[#161b22]"
      >
        <MessageCircle size={15} aria-hidden="true" />
        Chat
      </Link>
      <Link
        href="/member/invite"
        className="inline-flex h-9 items-center gap-2 rounded-md border border-[#3c8b72]/35 bg-[#3c8b72]/10 px-3 text-sm text-[#8ad5bd] transition hover:border-[#8ad5bd]/55 hover:bg-[#3c8b72]/15"
      >
        <Gift size={15} aria-hidden="true" />
        邀请有礼
      </Link>
      <Link
        href={isFree ? "/pricing" : "/member/entitlements"}
        className="inline-flex h-9 items-center gap-2 rounded-md bg-[#c9a35f] px-3 text-sm font-medium text-[#17130d] transition hover:bg-[#efd9a6]"
      >
        <BadgeCheck size={15} aria-hidden="true" />
        {isFree ? "升级会员" : "权益额度"}
      </Link>
    </div>
  );
}
