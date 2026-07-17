import { randomUUID } from "node:crypto";
import { checkEntitlement, getResolvedStarCost } from "@/lib/entitlements";
import { buildBaguaReading, generateBagua } from "@/lib/bagua";
import { spendStars } from "@/lib/mock-payment-store";
import { createMockReport } from "@/lib/report-store";
import { createSession, getSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { question?: string; timeframe?: string }
    | null;
  const question = body?.question?.trim() ?? "";
  const timeframe = body?.timeframe?.trim();

  if (question.length < 4) {
    return Response.json(
      { ok: false, message: "请把要问的事情写得更具体一些。" },
      { status: 400 },
    );
  }

  if (question.length > 300) {
    return Response.json(
      { ok: false, message: "问题太长了，请压缩到 300 字以内。" },
      { status: 400 },
    );
  }

  const entitlement = checkEntitlement(session, "bagua_question");

  if (!entitlement.ok) {
    return Response.json(
      {
        ok: false,
        message: `本次八卦问事服务预计需要 ${entitlement.requiredStars} 星力追问余量，当前可用 ${entitlement.balance} 星力。`,
        requiredStars: entitlement.requiredStars,
        balance: entitlement.balance,
      },
      { status: 402 },
    );
  }

  const chart = generateBagua({
    userId: session.userId,
    question,
    timeframe,
  }, randomUUID());
  const reading = buildBaguaReading(chart);
  const cost = getResolvedStarCost("bagua_question");
  const spendResult = await spendStars(session, {
    featureCode: "bagua_question",
    amount: cost,
    reason: `${reading.title} 服务消耗 ${cost} 星力`,
  });

  if (!spendResult.ok) {
    return Response.json(
      { ok: false, message: "追问余量不足，无法完成本次八卦问事服务。本次不会生成报告。" },
      { status: 402 },
    );
  }

  const report = await createMockReport({
    userId: session.userId,
    type: "BAGUA",
    title: reading.title,
    summary: reading.summary,
    content: reading.content,
    inputSnapshot: {
      question,
      timeframe,
    },
    toolResults: chart,
    modelUsed: "local-bagua-generator",
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
    steps: ["确定问事主题", "生成六爻卦象", "定位六十四卦", "识别动爻互错综", "生成问事建议"],
    cost,
    balanceAfter: spendResult.nextSession.starBalance,
    chart,
    report,
  });
}
