"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  ChevronDown,
  Gift,
  LockKeyhole,
  MessageCircle,
  ReceiptText,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { XuanjiMark } from "@/app/_components/xuanji-mark";
import { brand } from "@/lib/site";
import { LogoutButton } from "./logout-button";

const navItems = [
  { href: "/member/profile", label: "我的档案" },
  { href: "/member/companion", label: "阶段陪伴" },
  { href: "/member/reports", label: "我的报告" },
  { href: "/member/entitlements", label: "套餐与用量" },
] as const;

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MemberNav({
  emailMasked,
  tierLabel,
  starBalance,
  chatQuota,
  chatUsed,
  canAccessAdmin,
  isFree,
}: {
  emailMasked: string;
  tierLabel: string;
  starBalance: number;
  chatQuota: number;
  chatUsed: number;
  canAccessAdmin: boolean;
  isFree: boolean;
}) {
  const pathname = usePathname();
  const remainingChats = Math.max(0, chatQuota - chatUsed);

  return (
    <header className="sticky top-0 z-40 border-b border-[#20252d] bg-[#090b0e]/94 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="返回玄机 AI 首页">
            <XuanjiMark className="size-9 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate font-ritual text-base text-[#f4efe5]">{brand.cn}</span>
              <span className="block text-[11px] text-[#8d98a8]">个人空间</span>
            </span>
          </Link>

          <div className="flex items-center gap-1 sm:gap-2">
            <span className="mr-2 hidden text-right lg:block">
              <span className="block text-xs text-[#c8d0dc]">{emailMasked}</span>
              <span className="mt-0.5 block text-[11px] text-[#8d98a8]">{tierLabel} · {remainingChats} 次问答可用</span>
            </span>
            <Link
              href="/chat"
              className="inline-flex h-9 items-center gap-2 rounded-md px-2.5 text-sm text-[#c8d0dc] transition hover:bg-[#171a20] hover:text-[#f4efe5] sm:px-3"
            >
              <MessageCircle size={16} aria-hidden="true" />
              <span className="hidden sm:inline">开始问事</span>
            </Link>
            <Link
              href={isFree ? "/pricing" : "/member/entitlements"}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[#c9a35f] px-3 text-sm font-medium text-[#17130d] transition hover:bg-[#efd9a6]"
            >
              <BadgeCheck size={15} aria-hidden="true" />
              {isFree ? "升级" : "我的套餐"}
            </Link>
            <details key={pathname} className="group relative">
              <summary
                className="flex h-9 list-none items-center gap-1 rounded-md px-2 text-[#8d98a8] transition hover:bg-[#171a20] hover:text-[#f4efe5] [&::-webkit-details-marker]:hidden"
                aria-label="打开账户菜单"
                title="账户菜单"
              >
                <UserRound size={17} aria-hidden="true" />
                <ChevronDown
                  size={14}
                  className="hidden transition group-open:rotate-180 sm:block"
                  aria-hidden="true"
                />
              </summary>

              <div className="absolute right-0 top-11 z-50 w-[min(19rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-[#2b3038] bg-[#101318] shadow-[0_22px_70px_rgba(0,0,0,0.5)]">
                <div className="border-b border-[#252a32] px-4 py-4">
                  <p className="truncate text-sm font-medium text-[#e8edf4]">{emailMasked}</p>
                  <p className="mt-1 text-xs text-[#8d98a8]">
                    {tierLabel} · {remainingChats} 次问答可用 · {starBalance} 星力
                  </p>
                </div>

                <div className="p-2">
                  <Link
                    href="/member/records"
                    className="flex h-10 items-center gap-3 rounded-md px-3 text-sm text-[#c8d0dc] transition hover:bg-[#191d24] hover:text-[#f4efe5]"
                  >
                    <ReceiptText size={16} className="text-[#8d98a8]" aria-hidden="true" />
                    订单与星力记录
                  </Link>
                  <Link
                    href="/member/invite"
                    className="flex h-10 items-center gap-3 rounded-md px-3 text-sm text-[#c8d0dc] transition hover:bg-[#191d24] hover:text-[#f4efe5]"
                  >
                    <Gift size={16} className="text-[#8d98a8]" aria-hidden="true" />
                    邀请有礼
                  </Link>
                  <Link
                    href="/legal/privacy"
                    className="flex h-10 items-center gap-3 rounded-md px-3 text-sm text-[#c8d0dc] transition hover:bg-[#191d24] hover:text-[#f4efe5]"
                  >
                    <LockKeyhole size={16} className="text-[#8d98a8]" aria-hidden="true" />
                    隐私政策
                  </Link>
                  {canAccessAdmin ? (
                    <Link
                      href="/admin"
                      className="flex h-10 items-center gap-3 rounded-md px-3 text-sm text-[#d8b873] transition hover:bg-[#19160f] hover:text-[#efd9a6]"
                    >
                      <ShieldCheck size={16} aria-hidden="true" />
                      管理后台
                    </Link>
                  ) : null}
                </div>

                <div className="border-t border-[#252a32] p-2">
                  <LogoutButton variant="menu" />
                </div>
              </div>
            </details>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-6">
          <nav className="xuanji-scrollbar flex min-w-0 flex-1 items-center gap-6 overflow-x-auto text-sm" aria-label="个人空间导航">
            {navItems.map((item) => {
              const active = isActivePath(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex h-12 shrink-0 items-center border-b-2 px-0.5 transition ${
                    active
                      ? "border-[#c9a35f] text-[#efd9a6]"
                      : "border-transparent text-[#8d98a8] hover:text-[#d7dee8]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
