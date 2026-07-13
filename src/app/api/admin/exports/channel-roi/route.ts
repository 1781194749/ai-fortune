import { recordAdminAudit } from "@/lib/admin-audit";
import { canAccessAdmin } from "@/lib/admin-auth";
import { getChannelBudgetConfigMap } from "@/lib/channel-budget-config";
import { normalizeChannelBudgetReviewDecision } from "@/lib/channel-budget-review";
import { normalizeChannelSource } from "@/lib/channel-source";
import { buildChannelReviewExport } from "@/lib/channel-export";
import { getUsageLogsByFeature } from "@/lib/usage-log-store";

function exportFileName(reviewDecision?: string) {
  const date = new Date().toISOString().slice(0, 10);
  const suffix = reviewDecision ? `-${reviewDecision}` : "";

  return `xuanji-channel-review${suffix}-${date}.csv`;
}

function readFilterSource(url: URL) {
  const source = url.searchParams.get("source")?.trim();

  return source ? normalizeChannelSource(source) : undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (!(await canAccessAdmin(Object.fromEntries(url.searchParams)))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const reviewDecision = normalizeChannelBudgetReviewDecision(
    url.searchParams.get("reviewDecision"),
  );
  const source = readFilterSource(url);
  const [attributionLogs, promotionLogs, reviewLogs, channelBudgetConfigs] = await Promise.all([
    getUsageLogsByFeature("share_attribution", { take: 5000 }),
    getUsageLogsByFeature("promo_event", { take: 5000 }),
    getUsageLogsByFeature("channel_budget_review", { take: 5000 }),
    getChannelBudgetConfigMap(),
  ]);
  const exportData = buildChannelReviewExport(
    [...attributionLogs, ...promotionLogs, ...reviewLogs],
    channelBudgetConfigs,
    { reviewDecision, source },
  );

  await recordAdminAudit({
    action: "channel_review_export",
    status: "success",
    resourceType: "export",
    resourceId: "channel-roi",
    reason: "导出渠道投放复盘 CSV",
    request,
    details: {
      channelSegments: exportData.channelSegments.length,
      sources: exportData.growthRows.length,
      budgetSources: channelBudgetConfigs.size,
      reviews: reviewLogs.length,
      exportedReviews: exportData.reviewArchive.length,
      reviewDecision,
      source,
      generatedAt: exportData.generatedAt,
    },
  });

  return new Response(exportData.csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFileName(reviewDecision)}"`,
      "cache-control": "no-store",
    },
  });
}
