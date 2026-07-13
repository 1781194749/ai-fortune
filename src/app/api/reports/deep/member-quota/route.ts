import { isDeepReportProductCode } from "@/lib/deep-report";
import {
  createQueuedDeepReport,
  startDeepReportJob,
} from "@/lib/deep-report-job";
import { spendMemberEntitlement } from "@/lib/entitlement-store";
import {
  createEntitlementUsageSnapshot,
  getMemberEntitlementSummary,
} from "@/lib/member-entitlements";
import { getUserMockOrders } from "@/lib/mock-payment-store";
import { getUserMockReports, updateMockReport } from "@/lib/report-store";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { productCode?: string }
    | null;
  const productCode = body?.productCode ?? "";

  if (!isDeepReportProductCode(productCode)) {
    return Response.json(
      { ok: false, message: "请选择可生成的深度报告。" },
      { status: 400 },
    );
  }

  const [orders, reports] = await Promise.all([
    getUserMockOrders(session.userId),
    getUserMockReports(session.userId),
  ]);
  const entitlements = await getMemberEntitlementSummary({
    userId: session.userId,
    orders,
    reports,
  });

  if (entitlements.reportQuota.remaining <= 0) {
    return Response.json(
      {
        ok: false,
        message: "深度报告额度不足，请购买会员或单次报告。",
        entitlement: entitlements.reportQuota,
      },
      { status: 402 },
    );
  }

  const entitlement = createEntitlementUsageSnapshot("deep_report");
  const report = await createQueuedDeepReport({
    userId: session.userId,
    productCode,
    entitlement,
    startJob: false,
  });
  const spendEntitlement = await spendMemberEntitlement({
    userId: session.userId,
    kind: "deep_report",
    reportId: report.id,
    reason: `${report.title} 使用 1 份会员深度报告额度`,
    metadata: {
      productCode,
    },
  });

  if (!spendEntitlement.ok) {
    await updateMockReport({
      reportId: report.id,
      userId: session.userId,
      status: "FAILED",
      summary: "会员报告额度不足，本次没有扣除额度。",
      content: "会员报告额度已被其他任务使用，请购买会员或单次报告后重新发起。",
      toolResults: {
        analyzer: "member_entitlement_ledger",
        status: "failed",
        reason: spendEntitlement.reason,
        productCode,
      },
      modelUsed: "entitlement-ledger",
      costTokens: 0,
    });

    return Response.json(
      {
        ok: false,
        message: "深度报告额度不足，请购买会员或单次报告。",
        entitlement: spendEntitlement.balance,
      },
      { status: 402 },
    );
  }

  startDeepReportJob({
    report,
    userId: session.userId,
    productCode,
    entitlement,
  });

  return Response.json({
    ok: true,
    report,
    queued: true,
    entitlement: spendEntitlement.balance,
  });
}
