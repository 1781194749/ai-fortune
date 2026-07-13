import { recordAdminAudit } from "@/lib/admin-audit";
import { canAccessAdmin } from "@/lib/admin-auth";
import { getChannelBudgetConfigMap } from "@/lib/channel-budget-config";
import {
  normalizeChannelBudgetReviewDecision,
  recordChannelBudgetReview,
  reviewDecisionLabel,
} from "@/lib/channel-budget-review";
import { normalizeChannelSource } from "@/lib/channel-source";
import { buildGrowthRoiRows } from "@/lib/growth-roi";
import { getUsageLogsByFeature } from "@/lib/usage-log-store";

export async function POST(request: Request) {
  const url = new URL(request.url);

  if (!(await canAccessAdmin(Object.fromEntries(url.searchParams)))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        source?: unknown;
        decision?: unknown;
        note?: unknown;
      }
    | null;

  if (!body || typeof body.source !== "string" || !body.source.trim()) {
    return Response.json({ ok: false, message: "请填写渠道 source。" }, { status: 400 });
  }

  const decision = normalizeChannelBudgetReviewDecision(body.decision);

  if (!decision) {
    return Response.json({ ok: false, message: "请选择复盘结论。" }, { status: 400 });
  }

  const source = normalizeChannelSource(body.source);
  const [attributionLogs, promotionLogs, budgetConfigs] = await Promise.all([
    getUsageLogsByFeature("share_attribution", { take: 5000 }),
    getUsageLogsByFeature("promo_event", { take: 5000 }),
    getChannelBudgetConfigMap(),
  ]);
  const rows = buildGrowthRoiRows([...attributionLogs, ...promotionLogs], budgetConfigs);
  const row = rows.find((item) => item.source === source);
  const budgetConfig = budgetConfigs.get(source);
  const review = await recordChannelBudgetReview({
    source,
    decision,
    row,
    budgetConfig,
    note: typeof body.note === "string" ? body.note : undefined,
  });

  await recordAdminAudit({
    action: "channel_budget_review_archive",
    status: "success",
    resourceType: "channel",
    resourceId: source,
    amount: row?.budgetCents ?? budgetConfig?.budgetCents,
    reason: `归档渠道预算复盘：${reviewDecisionLabel(decision)}`,
    request,
    details: {
      source,
      decision,
      hasBudgetConfig: Boolean(budgetConfig),
      hasRoiRow: Boolean(row),
    },
  });

  return Response.json({ ok: true, review });
}
