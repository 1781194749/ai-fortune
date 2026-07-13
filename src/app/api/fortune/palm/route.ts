import { checkEntitlement, getResolvedStarCost } from "@/lib/entitlements";
import { spendMemberEntitlement } from "@/lib/entitlement-store";
import { getPalmImageUpload } from "@/lib/image-upload-store";
import {
  createEntitlementUsageSnapshot,
  getMemberEntitlementSummary,
} from "@/lib/member-entitlements";
import { spendStars } from "@/lib/mock-payment-store";
import { getUserMockOrders } from "@/lib/mock-payment-store";
import { analyzePalmImage } from "@/lib/palm";
import {
  createMockReport,
  getUserMockReports,
  updateMockReport,
} from "@/lib/report-store";
import { createSession, getSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { imageId?: string; focus?: string }
    | null;
  const imageId = body?.imageId?.trim() ?? "";
  const image = await getPalmImageUpload(imageId);

  if (!image || image.userId !== session.userId || image.deletedAt) {
    return Response.json(
      { ok: false, message: "请先上传一张可用的手相图片。" },
      { status: 404 },
    );
  }

  const [orders, reports] = await Promise.all([
    getUserMockOrders(session.userId),
    getUserMockReports(session.userId),
  ]);
  const memberEntitlements = await getMemberEntitlementSummary({
    userId: session.userId,
    orders,
    reports,
  });
  const useMembershipQuota = memberEntitlements.palmQuota.remaining > 0;
  const entitlement = useMembershipQuota
    ? null
    : checkEntitlement(session, "palm_reading");

  if (entitlement && !entitlement.ok) {
    return Response.json(
      {
        ok: false,
        message: `星力不足，需要 ${entitlement.requiredStars} 星力，当前 ${entitlement.balance} 星力。`,
        requiredStars: entitlement.requiredStars,
        balance: entitlement.balance,
      },
      { status: 402 },
    );
  }

  const reading = await analyzePalmImage({
    image,
    focus: body?.focus,
    userId: session.userId,
  });
  const report = await createMockReport({
    userId: session.userId,
    type: "PALM",
    title: reading.title,
    summary: reading.summary,
    content: reading.content,
    inputSnapshot: {
      imageId: image.id,
      focus: body?.focus?.trim(),
      ...(useMembershipQuota ? createEntitlementUsageSnapshot("palm_reading") : {}),
    },
    toolResults: {
      image,
      signals: reading.signals,
      analyzer: reading.analyzer,
      provider: reading.provider,
      model: reading.model,
      tokensIn: reading.tokensIn,
      tokensOut: reading.tokensOut,
      costCents: reading.costCents,
      usageLogId: reading.usageLogId,
      fallbackReason: reading.fallbackReason,
    },
    modelUsed: reading.model,
    costTokens: (reading.tokensIn ?? 0) + (reading.tokensOut ?? 0),
  });
  const cost = getResolvedStarCost("palm_reading");

  if (useMembershipQuota) {
    const spendEntitlement = await spendMemberEntitlement({
      userId: session.userId,
      kind: "palm_reading",
      reportId: report.id,
      reason: `${reading.title} 使用 1 次会员手相额度`,
      metadata: {
        imageId: image.id,
        focus: body?.focus?.trim(),
      },
    });

    if (!spendEntitlement.ok) {
      await updateMockReport({
        reportId: report.id,
        userId: session.userId,
        status: "FAILED",
        summary: "会员手相额度不足，本次没有扣除额度。",
        content: "会员手相额度已被其他任务使用，请购买会员或使用星力重新发起。",
        toolResults: {
          image,
          analyzer: "member_entitlement_ledger",
          status: "failed",
          reason: spendEntitlement.reason,
        },
        modelUsed: "entitlement-ledger",
        costTokens: 0,
      });

      return Response.json(
        {
          ok: false,
          message: "会员手相额度不足，请购买会员或使用星力重新发起。",
          entitlement: spendEntitlement.balance,
        },
        { status: 402 },
      );
    }

    return Response.json({
      ok: true,
      steps: [
        "校验手相图片",
        "读取会员手相额度",
        "读取图片档案",
        reading.provider === "openai" ? "调用视觉模型" : "本地降级分析",
        "生成手相报告",
      ],
      cost: 0,
      balanceAfter: session.starBalance,
      paymentSource: "membership_quota",
      entitlement: {
        kind: "palm_reading",
        remainingBefore: memberEntitlements.palmQuota.remaining,
        remainingAfter: spendEntitlement.balance.remaining,
      },
      image,
      report,
    });
  }

  const spendResult = await spendStars(session, {
    featureCode: "palm_reading",
    amount: cost,
    reportId: report.id,
    reason: `${reading.title} 消耗 ${cost} 星力`,
  });

  if (!spendResult.ok) {
    return Response.json(
      { ok: false, message: "星力不足，无法完成本次手相简析。" },
      { status: 402 },
    );
  }

  await createSession({
    userId: spendResult.nextSession.userId,
    emailMasked: spendResult.nextSession.emailMasked,
    tier: spendResult.nextSession.tier,
    starBalance: spendResult.nextSession.starBalance,
  });

  return Response.json({
    ok: true,
    steps: [
      "校验手相图片",
      "读取图片档案",
      reading.provider === "openai" ? "调用视觉模型" : "本地降级分析",
      "生成手相报告",
    ],
    cost,
    balanceAfter: spendResult.nextSession.starBalance,
    image,
    report,
  });
}
