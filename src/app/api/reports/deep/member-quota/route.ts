import { isDeepReportProductCode } from "@/lib/deep-report";
import {
  DeepReportRequirementsError,
  getDeepReportRequirementsErrorResponse,
} from "@/lib/deep-report-readiness";
import {
  createDeepReportWithMemberQuota,
  InsufficientDeepReportEntitlementError,
} from "@/lib/deep-report-job";
import {
  getMemberEntitlementSummary,
} from "@/lib/member-entitlements";
import { getUserMockOrders } from "@/lib/mock-payment-store";
import { publicApiErrorResponse } from "@/lib/public-api-error";
import { toCustomerReport } from "@/lib/report-public-view";
import { getUserMockReports } from "@/lib/report-store";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  try {
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

    const result = await createDeepReportWithMemberQuota({
      userId: session.userId,
      productCode,
    });

    return Response.json(
      {
        ok: true,
        report: toCustomerReport(result.report),
        queued: result.queued,
        entitlement: result.entitlement,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof DeepReportRequirementsError) {
      return Response.json(getDeepReportRequirementsErrorResponse(error), {
        status: error.status,
      });
    }

    if (error instanceof InsufficientDeepReportEntitlementError) {
      return Response.json(
        {
          ok: false,
          message: "深度报告额度不足，请购买会员或单次报告。",
          entitlement: error.balance,
        },
        { status: 402 },
      );
    }

    return publicApiErrorResponse(error, {
      context: "create report with member quota",
      message: "会员报告生成失败，请稍后重试。",
      status: 503,
      unavailableMessage: "报告服务暂时不可用，请稍后重试。",
    });
  }
}
