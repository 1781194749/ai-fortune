import { redirect } from "next/navigation";
import { Hexagon } from "lucide-react";
import { ToolPageShell } from "@/app/_components/tool-page-shell";
import { createLoginHref } from "@/lib/return-to";
import { getSession } from "@/lib/session";
import { BaguaClient } from "./bagua-client";

export default async function BaguaPage() {
  const session = await getSession();

  if (!session) {
    redirect(createLoginHref("/bagua"));
  }

  return (
    <ToolPageShell
      eyebrow="BAGUA DIVINATION"
      title="为一件具体的事起卦，看清变化从哪里发生"
      description="八卦适合有明确对象和时间范围的问题。玄机会展示六爻、本卦、动爻与变卦，再把变化线索落到可执行的建议上。"
      icon={Hexagon}
      accent="gold"
    >
      <BaguaClient initialBalance={session.starBalance} />
    </ToolPageShell>
  );
}
