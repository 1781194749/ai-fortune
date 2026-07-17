import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { ToolPageShell } from "@/app/_components/tool-page-shell";
import { createLoginHref } from "@/lib/return-to";
import { getSession } from "@/lib/session";
import { isTarotSpread } from "@/lib/tarot";
import { TarotClient } from "./tarot-client";

export default async function TarotPage({
  searchParams,
}: {
  searchParams: Promise<{ spread?: string | string[] }>;
}) {
  const { spread: rawSpread } = await searchParams;
  const requestedSpread = Array.isArray(rawSpread) ? rawSpread[0] : rawSpread;
  const initialSpread = requestedSpread && isTarotSpread(requestedSpread) ? requestedSpread : "three_card";
  const session = await getSession();

  if (!session) {
    redirect(createLoginHref(`/tarot?spread=${initialSpread}`));
  }

  return (
    <ToolPageShell
      eyebrow="TAROT READING"
      title="把一个具体问题，交给完整牌阵慢慢展开"
      description="从日签、三牌到爱情、事业、二选一和凯尔特十字，按问题选择牌阵。玄机会展示抽牌与解释过程，并把这次判断保存到你的报告中。"
      icon={Sparkles}
      accent="vermillion"
      chatMethod="tarot"
    >
      <TarotClient initialBalance={session.starBalance} initialSpread={initialSpread} />
    </ToolPageShell>
  );
}
