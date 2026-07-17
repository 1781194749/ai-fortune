import { redirect } from "next/navigation";
import { Hexagon } from "lucide-react";
import { ToolPageShell } from "@/app/_components/tool-page-shell";
import { getFortuneProfile } from "@/lib/fortune-profile-store";
import { createLoginHref } from "@/lib/return-to";
import { getSession } from "@/lib/session";
import { BaziClient } from "./bazi-client";

export default async function BaziPage() {
  const session = await getSession();

  if (!session) {
    redirect(createLoginHref("/bazi"));
  }

  const profile = await getFortuneProfile(session.userId);

  return (
    <ToolPageShell
      eyebrow="BAZI & FIVE ELEMENTS"
      title="读取你的四柱结构、喜忌与阶段节奏"
      description="选择出生历法与时辰，玄机会完成四柱十神、藏干纳音、旺衰喜忌、大运和未来流年分析，帮你看见更适合自己的行动节奏。"
      icon={Hexagon}
      accent="peacock"
      chatMethod="bazi"
    >
      <BaziClient
        initialBalance={session.starBalance}
        initialProfile={{
          name: profile?.name ?? null,
          gender: profile?.gender ?? null,
          birthDate: profile?.birthDate ?? null,
          birthTime: profile?.birthTime ?? null,
          birthPlace: profile?.birthPlace ?? null,
          calendarType: profile?.calendarType ?? "solar",
        }}
      />
    </ToolPageShell>
  );
}
