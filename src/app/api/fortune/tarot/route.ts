import { checkEntitlement, getResolvedStarCost } from "@/lib/entitlements";
import { claimDailyExperience } from "@/lib/daily-experience-store";
import { spendStars } from "@/lib/mock-payment-store";
import { createMockReport } from "@/lib/report-store";
import { buildTarotReading, drawTarot, type TarotSpread } from "@/lib/tarot";
import { createSession, getSession } from "@/lib/session";
import type { FeatureCode } from "@/lib/commerce";

const spreadToFeature: Record<TarotSpread, FeatureCode> = {
  daily: "tarot_daily",
  three_card: "tarot_three_card",
  love: "tarot_love",
};

function isTarotSpread(value: string): value is TarotSpread {
  return value === "daily" || value === "three_card" || value === "love";
}

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { spread?: string; question?: string }
    | null;
  const spread = body?.spread ?? "";
  const question = body?.question?.trim() ?? "";

  if (!isTarotSpread(spread)) {
    return Response.json(
      { ok: false, message: "暂不支持该牌阵。" },
      { status: 400 },
    );
  }

  const featureCode = spreadToFeature[spread];
  const entitlement = checkEntitlement(session, featureCode);

  if (!entitlement.ok) {
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

  if (
    spread === "daily" &&
    !(await claimDailyExperience({
      userId: session.userId,
      experience: "tarot_daily",
    }))
  ) {
    return Response.json(
      {
        ok: false,
        message: "今天的免费单牌已经抽过了，明天再来看看新的提醒。",
        balance: session.starBalance,
      },
      { status: 429 },
    );
  }

  const cards = drawTarot(spread, question, session.userId);
  const reading = buildTarotReading({ spread, question, cards });
  const report = await createMockReport({
    userId: session.userId,
    type: "TAROT",
    title: reading.title,
    summary: reading.summary,
    content: reading.content,
    inputSnapshot: {
      spread,
      question,
      featureCode,
    },
    toolResults: {
      cards,
    },
    modelUsed: "local-tarot-spread",
    costTokens: 0,
  });
  const cost = getResolvedStarCost(featureCode);
  const spendResult = await spendStars(session, {
    featureCode,
    amount: cost,
    reportId: report.id,
    reason: `${reading.title} 消耗 ${cost} 星力`,
  });

  if (!spendResult.ok) {
    return Response.json(
      { ok: false, message: "星力不足，无法完成本次解读。" },
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
    steps: ["识别问题类型", "洗牌并抽取牌阵", "解释牌面象征", "生成专属解读"],
    cost,
    balanceAfter: spendResult.nextSession.starBalance,
    report,
    cards,
  });
}
