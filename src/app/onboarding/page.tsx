import Link from "next/link";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/app/member/profile-form";
import { XuanjiMark } from "@/app/_components/xuanji-mark";
import { getFortuneProfile, hasSavedFortuneProfile } from "@/lib/fortune-profile-store";
import { createLoginHref } from "@/lib/return-to";
import { getSession } from "@/lib/session";
import { brand } from "@/lib/site";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string | string[] }>;
}) {
  const session = await getSession();

  if (!session) {
    redirect(createLoginHref("/chat"));
  }

  const { edit: rawEdit } = await searchParams;
  const edit = Array.isArray(rawEdit) ? rawEdit[0] : rawEdit;
  const profile = await getFortuneProfile(session.userId);

  if (hasSavedFortuneProfile(profile) && edit !== "1") {
    redirect("/chat");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#080907] px-5 pb-16 text-[#f4efe5] sm:px-8">
      <div className="absolute inset-0 xuanji-stars opacity-40" />
      <div className="absolute left-1/2 top-[-18%] size-[720px] -translate-x-1/2 rounded-full bg-[#c9a35f]/7 blur-[140px]" />

      <header className="relative mx-auto flex h-[76px] max-w-6xl items-center justify-between border-b border-[#24251f]">
        <Link href="/" className="flex items-center gap-3" aria-label="返回玄机 AI 首页">
          <XuanjiMark />
          <span>
            <span className="block font-ritual text-lg">{brand.cn}</span>
            <span className="block text-[9px] tracking-[0.22em] text-[#777168]">起盘建档</span>
          </span>
        </Link>
        <Link href="/chat" className="text-sm text-[#8f887b] transition hover:text-[#efd9a6]">
          跳过，先去 Chat
        </Link>
      </header>

      <section className="relative mx-auto max-w-6xl py-12 sm:py-16">
        <div className="mb-10 max-w-3xl">
          <p className="text-xs tracking-[0.28em] text-[#c9a35f]">WELCOME TO XUANJI</p>
          <h1 className="mt-5 font-ritual text-4xl leading-tight text-[#f4efe5] sm:text-5xl">
            在第一次问事前，
            <span className="text-[#aaa294]">先让我记住你。</span>
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-[#8f887b] sm:text-base">
            这不是一张传统资料表。我们会用几轮轻量对话建立基础档案，让之后的每次推演都有属于你的上下文。
          </p>
        </div>

        <ProfileForm initialProfile={profile} mode="onboarding" />
      </section>
    </main>
  );
}
