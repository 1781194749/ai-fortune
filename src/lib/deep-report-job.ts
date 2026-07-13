import "server-only";

import { getProduct } from "@/lib/commerce";
import {
  buildPaidDeepReport,
  getDeepReportType,
  type DeepReportProductCode,
} from "@/lib/deep-report";
import { refundMemberEntitlement } from "@/lib/entitlement-store";
import {
  createMockReport,
  updateMockReport,
  type MockReport,
} from "@/lib/report-store";

type DeepReportEntitlement = {
  paymentSource: "membership_quota";
  entitlementKind: "deep_report";
};

declare global {
  var xuanjiDeepReportJobs: Set<string> | undefined;
}

const deepReportJobs = globalThis.xuanjiDeepReportJobs ?? new Set<string>();

if (!globalThis.xuanjiDeepReportJobs) {
  globalThis.xuanjiDeepReportJobs = deepReportJobs;
}

export function getPendingDeepReportText(productCode: DeepReportProductCode) {
  const product = getProduct(productCode);

  return {
    title: `${product?.name ?? "深度报告"}生成中`,
    summary: "深度报告已进入生成队列，系统正在整理会员档案、命理结构和报告正文。",
    content: "报告正在生成中，请稍后查看完整正文。",
  };
}

export function startDeepReportJob(input: {
  report: MockReport;
  userId: string;
  productCode: DeepReportProductCode;
  orderId?: string;
  entitlement?: DeepReportEntitlement;
}) {
  if (deepReportJobs.has(input.report.id)) {
    return false;
  }

  deepReportJobs.add(input.report.id);

  setTimeout(() => {
    void (async () => {
      try {
        const draft = await buildPaidDeepReport({
          userId: input.userId,
          productCode: input.productCode,
          orderId: input.orderId,
          entitlement: input.entitlement,
        });

        await updateMockReport({
          reportId: input.report.id,
          userId: input.userId,
          status: "COMPLETED",
          title: draft.title,
          summary: draft.summary,
          content: draft.content,
          inputSnapshot: draft.inputSnapshot,
          toolResults: draft.toolResults,
          modelUsed: draft.modelUsed,
          costTokens: draft.costTokens,
          ensureShareSlug: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const refundTransaction = input.entitlement
          ? await refundMemberEntitlement({
              userId: input.userId,
              kind: "deep_report",
              reportId: input.report.id,
              reason: "深度报告生成失败，退回 1 份会员报告额度",
              metadata: {
                productCode: input.productCode,
                error: message,
              },
            }).catch(() => null)
          : null;

        if (process.env.NODE_ENV !== "production") {
          console.warn(`Deep report generation failed. ${message}`);
        }

        await updateMockReport({
          reportId: input.report.id,
          userId: input.userId,
          status: "FAILED",
          summary: "深度报告生成失败，请稍后重试。",
          content: input.orderId
            ? "本次生成没有完成，订单仍然有效，可以重新发起生成。"
            : "本次生成没有完成，会员报告额度没有最终消耗，可以重新发起生成。",
          toolResults: {
            analyzer: "deep_report_async_job",
            status: "failed",
            error: message,
            entitlementRefundTransactionId: refundTransaction?.id,
          },
          modelUsed: "generation-failed",
          costTokens: 0,
        });
      } finally {
        deepReportJobs.delete(input.report.id);
      }
    })();
  }, 0);

  return true;
}

export async function createQueuedDeepReport(input: {
  userId: string;
  orderId?: string;
  productCode: DeepReportProductCode;
  entitlement?: DeepReportEntitlement;
  startJob?: boolean;
}) {
  const pendingText = getPendingDeepReportText(input.productCode);
  const report = await createMockReport({
    userId: input.userId,
    orderId: input.orderId,
    type: getDeepReportType(input.productCode),
    status: "GENERATING",
    title: pendingText.title,
    summary: pendingText.summary,
    content: pendingText.content,
    inputSnapshot: {
      orderId: input.orderId,
      productCode: input.productCode,
      ...input.entitlement,
      status: "queued",
    },
    toolResults: {
      analyzer: "deep_report_async_job",
      status: "queued",
      orderId: input.orderId,
      productCode: input.productCode,
      paymentSource: input.entitlement?.paymentSource,
      entitlementKind: input.entitlement?.entitlementKind,
    },
    modelUsed: "pending",
    costTokens: 0,
  });

  if (input.startJob ?? true) {
    startDeepReportJob({
      report,
      userId: input.userId,
      productCode: input.productCode,
      orderId: input.orderId,
      entitlement: input.entitlement,
    });
  }

  return report;
}

export async function retryQueuedDeepReport(input: {
  report: MockReport;
  productCode: DeepReportProductCode;
  operator?: string;
  entitlement?: DeepReportEntitlement;
}) {
  const pendingText = getPendingDeepReportText(input.productCode);
  const retriedReport = await updateMockReport({
    reportId: input.report.id,
    userId: input.report.userId,
    status: "GENERATING",
    ...pendingText,
    toolResults: {
      analyzer: "deep_report_async_job",
      status: "retrying",
      orderId: input.report.orderId,
      productCode: input.productCode,
      paymentSource: input.entitlement?.paymentSource,
      entitlementKind: input.entitlement?.entitlementKind,
      operator: input.operator,
    },
    modelUsed: "pending",
    costTokens: 0,
  });

  if (!retriedReport || (!input.report.orderId && !input.entitlement)) {
    return null;
  }

  startDeepReportJob({
    report: retriedReport,
    userId: input.report.userId,
    productCode: input.productCode,
    orderId: input.report.orderId,
    entitlement: input.entitlement,
  });

  return retriedReport;
}
