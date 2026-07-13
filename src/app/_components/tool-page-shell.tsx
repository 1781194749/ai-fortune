import Link from "next/link";
import { ChevronRight, LayoutDashboard, MessageCircle, ShieldCheck, type LucideIcon } from "lucide-react";
import { brand } from "@/lib/site";
import { LogoutButton } from "@/app/member/logout-button";
import { XuanjiMark } from "./xuanji-mark";

type Accent = "gold" | "peacock" | "vermillion";

const accentStyles: Record<Accent, { icon: string; glow: string; line: string }> = {
  gold: {
    icon: "border-[#c9a35f]/30 bg-[#c9a35f]/8 text-[#c9a35f]",
    glow: "bg-[#c9a35f]/7",
    line: "via-[#c9a35f]/28",
  },
  peacock: {
    icon: "border-[#2c7b78]/35 bg-[#2c7b78]/10 text-[#79b8b1]",
    glow: "bg-[#2c7b78]/8",
    line: "via-[#79b8b1]/25",
  },
  vermillion: {
    icon: "border-[#b84b37]/35 bg-[#b84b37]/9 text-[#d98572]",
    glow: "bg-[#b84b37]/7",
    line: "via-[#d98572]/24",
  },
};

export function ToolPageShell({
  eyebrow,
  title,
  description,
  icon: Icon,
  accent = "gold",
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent?: Accent;
  children: React.ReactNode;
}) {
  const styles = accentStyles[accent];

  return (
    <main className="min-h-screen overflow-hidden bg-[#080907] text-[#f4efe5]">
      <header className="sticky top-0 z-50 border-b border-[#24251f]/90 bg-[#080907]/84 backdrop-blur-2xl">
        <div className="mx-auto flex h-[72px] max-w-[1320px] items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="返回玄机 AI 首页">
            <XuanjiMark />
            <span>
              <span className="block font-ritual text-lg tracking-[0.08em]">{brand.cn}</span>
              <span className="block text-[9px] tracking-[0.22em] text-[#777168]">{eyebrow}</span>
            </span>
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/chat" className="hidden h-10 items-center gap-2 rounded-full px-4 text-[#aaa294] transition hover:bg-[#11120f] hover:text-[#efd9a6] sm:inline-flex">
              <MessageCircle size={15} aria-hidden="true" />
              Chat
            </Link>
            <Link href="/member" className="inline-flex h-10 items-center gap-1 rounded-full border border-[#34352e] bg-[#11120f] px-4 text-[#aaa294] transition hover:border-[#c9a35f]/45 hover:text-[#efd9a6]">
              <LayoutDashboard size={15} aria-hidden="true" />
              个人中心
              <ChevronRight size={14} aria-hidden="true" />
            </Link>
            <LogoutButton />
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-[1320px] px-5 py-8 sm:px-8 sm:py-12">
        <div className="relative isolate mb-7 overflow-hidden rounded-[30px] border border-[#34352e] bg-[#11120f] px-6 py-9 sm:px-9 sm:py-11 lg:px-11">
          <div className="absolute inset-0 xuanji-stars opacity-20" />
          <div className={`absolute right-[-8%] top-[-90%] size-[520px] rounded-full ${styles.glow} blur-[110px]`} />
          <div className={`absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent ${styles.line} to-transparent`} />
          <div className="relative grid gap-7 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-4xl">
              <div className="flex items-center gap-3">
                <span className={`flex size-11 items-center justify-center rounded-full border ${styles.icon}`}>
                  <Icon size={19} aria-hidden="true" />
                </span>
                <p className="text-[10px] tracking-[0.24em] text-[#8f887b]">{eyebrow}</p>
              </div>
              <h1 className="mt-6 max-w-4xl font-ritual text-4xl leading-tight tracking-[-0.035em] sm:text-5xl lg:text-6xl">{title}</h1>
              <p className="mt-5 max-w-3xl text-sm leading-8 text-[#aaa294] sm:text-base">{description}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-[#777168] lg:max-w-[260px] lg:justify-end">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#30312b] bg-[#0b0c0a]/75 px-3 py-1.5"><ShieldCheck size={13} className="text-[#79b8b1]" />过程可见</span>
              <span className="rounded-full border border-[#30312b] bg-[#0b0c0a]/75 px-3 py-1.5">结果自动沉淀</span>
              <span className="rounded-full border border-[#30312b] bg-[#0b0c0a]/75 px-3 py-1.5">可回到 Chat 追问</span>
            </div>
          </div>
        </div>

        {children}
      </section>
    </main>
  );
}
