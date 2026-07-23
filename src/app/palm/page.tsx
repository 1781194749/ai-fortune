import { redirect } from "next/navigation";
import { Camera } from "lucide-react";
import { ToolPageShell } from "@/app/_components/tool-page-shell";
import { getUserPalmImages } from "@/lib/image-upload-store";
import { getMemberEntitlementSummary } from "@/lib/member-entitlements";
import { getUserMockOrders } from "@/lib/mock-payment-store";
import { getUserMockReports } from "@/lib/report-store";
import { createLoginHref } from "@/lib/return-to";
import { getSession } from "@/lib/session";
import { PalmClient } from "./palm-client";

export default async function PalmPage() {
  const session = await getSession();

  if (!session) {
    redirect(createLoginHref("/palm"));
  }

  const [orders, reports, images] = await Promise.all([
    getUserMockOrders(session.userId),
    getUserMockReports(session.userId),
    getUserPalmImages(session.userId),
  ]);
  const entitlementSummary = await getMemberEntitlementSummary({
    userId: session.userId,
    orders,
    reports,
  });

  return (
    <ToolPageShell
      eyebrow="PALM READING"
      title="从掌纹里，观察你此刻的状态与行动倾向"
      description="上传一张清晰的手掌图片，并告诉玄机你最关注的方向。图片会在获得授权后用于本次分析，结果会保存到你的报告中。"
      icon={Camera}
      accent="vermillion"
      chatMethod="palm"
    >
      <PalmClient
        initialBalance={session.starBalance}
        initialPalmQuota={entitlementSummary.palmQuota.remaining}
        initialImage={images[0] ?? null}
      />
    </ToolPageShell>
  );
}
