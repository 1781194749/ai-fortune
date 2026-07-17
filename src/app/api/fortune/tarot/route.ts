import { randomUUID } from "node:crypto";
import { checkEntitlement, getResolvedStarCost } from "@/lib/entitlements";
import { claimDailyExperience } from "@/lib/daily-experience-store";
import { spendStars } from "@/lib/mock-payment-store";
import { createMockReport } from "@/lib/report-store";
import {
  buildTarotReading,
  drawTarot,
  getTarotDeckAudit,
  isTarotSpread,
  type TarotSpread,
} from "@/lib/tarot";
import { createSession, getSession } from "@/lib/session";
import type { FeatureCode } from "@/lib/commerce";

const spreadToFeature: Record<TarotSpread, FeatureCode> = {
  daily: "tarot_daily",
  three_card: "tarot_three_card",
  love: "tarot_love",
  decision: "tarot_three_card",
  career: "tarot_three_card",
  celtic_cross: "tarot_love",
};

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
        message: `本次塔罗服务预计需要 ${entitlement.requiredStars} 星力追问余量，当前可用 ${entitlement.balance} 星力。`,
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

  const cards = drawTarot(spread, question, session.userId, randomUUID());
  const reading = buildTarotReading({ spread, question, cards });
  const cost = getResolvedStarCost(featureCode);
  const spendResult = await spendStars(session, {
    featureCode,
    amount: cost,
    reason: `${reading.title} 服务消耗 ${cost} 星力`,
  });

  if (!spendResult.ok) {
    return Response.json(
      { ok: false, message: "追问余量不足，无法完成本次塔罗服务。本次不会生成报告。" },
      { status: 402 },
    );
  }

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
      deckAudit: getTarotDeckAudit(),
    },
    toolResults: {
      cards,
      reading,
    },
    modelUsed: "local-tarot-spread",
    costTokens: 0,
  });

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
