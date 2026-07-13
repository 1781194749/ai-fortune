import { redirect } from "next/navigation";
import { ScrollText } from "lucide-react";
import { ToolPageShell } from "@/app/_components/tool-page-shell";
import { formatPrice, oneTimeProducts } from "@/lib/commerce";
import { isDeepReportProductCode } from "@/lib/deep-report";
import {
  getMemberEntitlementSummary,
  isMemberEntitlementUsage,
} from "@/lib/member-entitlements";
import { getUserMockOrders, getOrderDisplay } from "@/lib/mock-payment-store";
import { getUserMockReports } from "@/lib/report-store";
import { createLoginHref } from "@/lib/return-to";
import { getSession } from "@/lib/session";
import { DeepReportClient } from "./deep-report-client";

export default async function DeepReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { orderId } = await searchParams;
  const session = await getSession();

  if (!session) {
    redirect(createLoginHref(orderId ? `/reports/deep?orderId=${encodeURIComponent(orderId)}` : "/reports/deep"));
  }

  const products = oneTimeProducts
    .filter((product) => isDeepReportProductCode(product.code))
    .map((product) => ({
      code: product.code,
      name: product.name,
      priceLabel: formatPrice(product.priceCents, product.currency),
      description: product.description,
    }));
  const rawOrders = await getUserMockOrders(session.userId);
  const allReports = await getUserMockReports(session.userId);
  const entitlementSummary = await getMemberEntitlementSummary({
    userId: session.userId,
    orders: rawOrders,
    reports: allReports,
  });
  const orders = rawOrders
    .filter((order) => isDeepReportProductCode(order.productCode))
    .map(getOrderDisplay);
  const reports = allReports
    .filter(
      (report) =>
        Boolean(report.orderId) || isMemberEntitlementUsage(report, "deep_report"),
    )
    .map((report) => ({
      id: report.id,
      orderId: report.orderId,
      title: report.title,
      summary: report.summary,
      shareSlug: report.shareSlug,
      status: report.status,
  }));

  return (
    <ToolPageShell
      eyebrow="DEEP REPORT"
      title="把零散的问题，整理成一份可以反复回看的判断"
      description="选择报告主题后，玄机会综合你的档案、问题与对应推演方式，形成更完整的分析、建议和后续观察重点。"
      icon={ScrollText}
      accent="peacock"
    >
      <DeepReportClient
        products={products}
        initialOrders={orders}
        initialReports={reports}
        initialReportQuota={entitlementSummary.reportQuota}
        highlightedOrderId={orderId}
      />
    </ToolPageShell>
  );
}
