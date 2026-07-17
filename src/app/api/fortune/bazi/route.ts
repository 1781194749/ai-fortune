import { checkEntitlement, getResolvedStarCost } from "@/lib/entitlements";
import { spendStars } from "@/lib/mock-payment-store";
import { createMockReport } from "@/lib/report-store";
import { buildBaziReading, calculateBazi, type BaziInput } from "@/lib/bazi";
import { createSession, getSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Partial<BaziInput> | null;
  const input: BaziInput = {
    name: body?.name?.trim(),
    gender: body?.gender?.trim(),
    birthDate: body?.birthDate?.trim() ?? "",
    birthTime: body?.birthTime?.trim() ?? "",
    birthPlace: body?.birthPlace?.trim(),
  };

  const entitlement = checkEntitlement(session, "bazi_brief");

  if (!entitlement.ok) {
    return Response.json(
      {
        ok: false,
        message: `本次八字命盘服务预计需要 ${entitlement.requiredStars} 星力追问余量，当前可用 ${entitlement.balance} 星力。`,
        requiredStars: entitlement.requiredStars,
        balance: entitlement.balance,
      },
      { status: 402 },
    );
  }

  let chart: ReturnType<typeof calculateBazi>;

  try {
    chart = calculateBazi(input);
  } catch {
    return Response.json(
      { ok: false, message: "出生日期或时间格式不正确。" },
      { status: 400 },
    );
  }

  const reading = buildBaziReading(chart);
  const cost = getResolvedStarCost("bazi_brief");
  const spendResult = await spendStars(session, {
    featureCode: "bazi_brief",
    amount: cost,
    reason: `${reading.title} 服务消耗 ${cost} 星力`,
  });

  if (!spendResult.ok) {
    return Response.json(
      { ok: false, message: "追问余量不足，无法完成本次八字命盘服务。本次不会生成报告。" },
      { status: 402 },
    );
  }

  const report = await createMockReport({
    userId: session.userId,
    type: "BAZI_WUXING",
    title: reading.title,
    summary: reading.summary,
    content: reading.content,
    inputSnapshot: input,
    toolResults: chart,
    modelUsed: "local-bazi-calculator",
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
    steps: ["校验出生信息", "计算四柱十神", "分析旺衰喜忌", "排大运流年", "生成命盘报告"],
    cost,
    balanceAfter: spendResult.nextSession.starBalance,
    chart,
    report,
  });
}
