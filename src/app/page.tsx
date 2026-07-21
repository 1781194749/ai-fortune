import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { HomeCapabilityStage } from "./_components/home-capability-stage";
import { HomeConversionPreview } from "./_components/home-conversion-preview";
import { HomeHeroOracle } from "./_components/home-hero-oracle";
import { HomeProcessStage } from "./_components/home-process-stage";
import { XuanjiMark } from "./_components/xuanji-mark";
import { getLegalEntity } from "@/lib/legal";
import { createLoginHref } from "@/lib/return-to";
import { getSession } from "@/lib/session";
import { brand } from "@/lib/site";

const trustPoints = ["档案仅用于个性化推演", "工具过程可见", "结果可继续追问"] as const;

export default async function Home() {
  const legalEntity = getLegalEntity();
  const session = await getSession();
  const startHref = session ? "/chat" : createLoginHref("/chat");
  const startLabel = "开始问事";

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#080907] text-[#f4efe5]">
      <header className="sticky top-0 z-50 border-b border-[#24251f]/90 bg-[#080907]/82 backdrop-blur-2xl">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link href="/" className="flex items-center gap-3" aria-label="玄机 AI 首页">
            <XuanjiMark />
            <span>
              <span className="block font-ritual text-lg tracking-[0.08em]">{brand.cn}</span>
              <span className="block text-[9px] tracking-[0.24em] text-[#777168]">{brand.en.toUpperCase()}</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm text-[#aaa294] md:flex" aria-label="首页导航">
            <Link href="#how" className="transition hover:text-[#efd9a6]">如何推演</Link>
            <Link href="#abilities" className="transition hover:text-[#efd9a6]">能力</Link>
            <Link href="/pricing" className="transition hover:text-[#efd9a6]">会员</Link>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href={startHref}
              className="group inline-flex h-10 items-center gap-2 rounded-full border border-[#c9a35f]/45 bg-[#c9a35f]/10 px-4 text-sm font-medium text-[#efd9a6] transition hover:border-[#c9a35f]/70 hover:bg-[#c9a35f]/16"
            >
              {startLabel}
              <ChevronRight size={15} className="transition group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <section className="relative isolate flex min-h-[calc(100svh-72px)] items-center overflow-hidden px-5 py-16 sm:px-8 lg:px-12">
        <div className="absolute inset-0 xuanji-stars opacity-70" />
        <div className="absolute left-[-12%] top-[14%] size-[520px] rounded-full bg-[#2c7b78]/8 blur-[110px]" />
        <div className="absolute right-[-12%] top-[8%] size-[620px] rounded-full bg-[#c9a35f]/8 blur-[130px]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#c9a35f]/30 to-transparent" />

        <div className="relative mx-auto grid w-full max-w-[1440px] gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
          <div className="max-w-3xl pt-4 lg:pt-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#323128] bg-[#11120f]/70 px-3 py-1.5 text-xs tracking-[0.14em] text-[#aaa294] backdrop-blur">
              <span className="size-1.5 rounded-full bg-[#79b8b1] shadow-[0_0_12px_rgba(121,184,177,0.9)]" />
              一个会记住你的 AI 命理顾问
            </div>
            <h1 className="mt-7 max-w-[760px] font-ritual text-[clamp(3.25rem,7vw,7.2rem)] leading-[0.98] tracking-[-0.05em] text-[#f6f0e5]">
              看得见
              <span className="block text-[#c9a35f]">推演过程</span>
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-8 text-[#aaa294] sm:text-lg sm:leading-9">
              先为你起盘建档，再结合塔罗、八字、八卦与近期对话，陪你把一个问题持续推演清楚。
            </p>
            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-xs text-[#777168]">
              {trustPoints.map((point) => (
                <span key={point} className="inline-flex items-center gap-2">
                  <ShieldCheck size={14} className="text-[#79b8b1]" aria-hidden="true" />
                  {point}
                </span>
              ))}
            </div>
          </div>

          <HomeHeroOracle />
        </div>
      </section>

      <section id="how" className="xuanji-section relative flex min-h-screen items-center border-b border-[#24251f] px-5 py-24 sm:px-8 lg:px-12">
        <div className="absolute inset-0 xuanji-grid opacity-25" />
        <div className="relative mx-auto w-full max-w-[1280px]">
          <div className="mb-12 max-w-3xl lg:mb-16">
            <p className="text-xs tracking-[0.28em] text-[#c9a35f]">不只给一句结论</p>
            <h2 className="mt-5 font-ritual text-4xl leading-tight tracking-[-0.03em] text-[#f4efe5] sm:text-5xl lg:text-6xl">
              每一步为什么这样判断，
              <span className="block text-[#aaa294]">你都能看见。</span>
            </h2>
          </div>
          <HomeProcessStage />
        </div>
      </section>

      <section id="abilities" className="xuanji-section relative flex min-h-screen items-center border-b border-[#24251f] px-5 py-24 sm:px-8 lg:px-12">
        <div className="absolute right-[-10%] top-[20%] size-[480px] rounded-full bg-[#2c7b78]/7 blur-[120px]" />
        <div className="relative mx-auto w-full max-w-[1280px]">
          <div className="mb-12 flex flex-col justify-between gap-6 lg:mb-14 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <p className="text-xs tracking-[0.28em] text-[#c9a35f]">一次建档，多种方式持续陪伴</p>
              <h2 className="mt-5 font-ritual text-4xl leading-tight tracking-[-0.03em] text-[#f4efe5] sm:text-5xl lg:text-6xl">
                不是工具集合，
                <span className="text-[#aaa294]">是一套顾问能力。</span>
              </h2>
            </div>
            <p className="max-w-md text-sm leading-7 text-[#8f887b]">
              用户只需要描述问题。玄机 AI 会判断此刻该聊天、抽牌、起卦、读取命盘，还是生成一份深度报告。
            </p>
          </div>
          <HomeCapabilityStage />
        </div>
      </section>

      <section id="start" className="xuanji-section relative flex min-h-screen flex-col justify-between overflow-hidden px-5 pt-24 sm:px-8 lg:px-12">
        <div className="absolute inset-0 xuanji-stars opacity-35" />
        <div className="absolute left-1/2 top-[18%] size-[720px] -translate-x-1/2 rounded-full bg-[#c9a35f]/6 blur-[150px]" />

        <div className="relative mx-auto w-full max-w-[1280px] text-center">
          <p className="text-xs tracking-[0.28em] text-[#c9a35f]">从第一次问事开始</p>
          <h2 className="mx-auto mt-5 max-w-4xl font-ritual text-4xl leading-tight tracking-[-0.03em] text-[#f4efe5] sm:text-5xl lg:text-6xl">
            建立你的命理档案，
            <span className="block text-[#aaa294]">让每一次回答都有上下文。</span>
          </h2>
          <HomeConversionPreview />
          <div className="mx-auto flex max-w-2xl flex-col items-center">
            <Link
              href={startHref}
              className="group inline-flex h-14 items-center justify-center gap-3 rounded-full bg-[#c9a35f] px-9 font-semibold text-[#17130d] shadow-[0_18px_55px_rgba(201,163,95,0.2)] transition hover:bg-[#efd9a6]"
            >
              {session ? "开始问事" : "建立档案，开始第一次问事"}
              <ArrowRight size={18} className="transition group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-[#777168]">
              <span className="inline-flex items-center gap-1.5"><LockKeyhole size={13} />隐私信息加密保存</span>
              <span className="inline-flex items-center gap-1.5"><MessageCircle size={13} />AI 辅助分析，不替代专业建议</span>
            </div>
          </div>
        </div>

        <footer className="relative mx-auto mt-24 flex w-full max-w-[1280px] flex-col gap-5 border-t border-[#24251f] py-8 text-xs text-[#777168] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-ritual text-sm text-[#aaa294]">{brand.cn} / {brand.en}</p>
            {legalEntity.companyName || legalEntity.icpRecordNo ? (
              <p className="mt-1">{[legalEntity.companyName, legalEntity.icpRecordNo].filter(Boolean).join(" · ")}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/legal/terms" className="transition hover:text-[#efd9a6]">用户协议</Link>
            <Link href="/legal/privacy" className="transition hover:text-[#efd9a6]">隐私政策</Link>
            <Link href="/legal/disclaimer" className="transition hover:text-[#efd9a6]">AI 辅助说明</Link>
            <Link href="/legal/upload-consent" className="transition hover:text-[#efd9a6]">图片授权</Link>
          </div>
        </footer>
      </section>
    </main>
  );
}
