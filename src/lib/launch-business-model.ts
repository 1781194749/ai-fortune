import "server-only";

import {
  formatPrice,
  membershipProducts,
  oneTimeProducts,
  type FeatureCode,
  type Product,
  type ProductCode,
} from "@/lib/commerce";
import { getChannelBudgetConfigMap } from "@/lib/channel-budget-config";
import { buildGrowthRoiRows, type GrowthRoiRow } from "@/lib/growth-roi";
import type { HealthStatus } from "@/lib/health-checks";
import {
  getLaunchUnitEconomics,
  type LaunchUnitEconomics,
} from "@/lib/launch-unit-economics";
import type { LaunchUnitEconomicsCostSample } from "@/lib/launch-unit-economics-sample";
import { getAdminUsageLogs } from "@/lib/usage-log-store";

export type LaunchBusinessModelPersona = {
  id: string;
  title: string;
  ageRange: string;
  need: string;
  payTrigger: string;
  entryOffer: string;
  upgradePath: string[];
  targetProducts: ProductCode[];
  status: HealthStatus;
  action: string;
};

export type LaunchBusinessModelProduct = {
  code: ProductCode;
  name: string;
  type: Product["type"];
  priceLabel: string;
  priceCents: number;
  estimatedAiCostCents?: number;
  estimatedAiCostSharePercent?: number;
  paymentFeeCents: number;
  reserveCents: number;
  contributionCents?: number;
  suggestedMaxCacCents?: number;
  missingCostFeatures: FeatureCode[];
  status: HealthStatus;
  detail: string;
  action: string;
};

export type LaunchBusinessModelGuardrail = {
  id: string;
  label: string;
  status: HealthStatus;
  target: string;
  current: string;
  action: string;
};

export type LaunchBusinessModel = {
  generatedAt: string;
  status: HealthStatus;
  label: string;
  detail: string;
  action: string;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
    personas: number;
    products: number;
    productsWithCostEstimate: number;
    targetAiCostShareMaxPercent: number;
    averageAiCostSharePercent?: number;
    paidOrders: number;
    revenueCents: number;
    marketingCostCents: number;
    blendedRoiMultiple?: number;
  };
  personas: LaunchBusinessModelPersona[];
  products: LaunchBusinessModelProduct[];
  guardrails: LaunchBusinessModelGuardrail[];
  topChannels: Array<{
    source: string;
    paidOrders: number;
    revenueCents: number;
    marketingCostCents: number;
    blendedRoiMultiple?: number;
  }>;
  nextActions: LaunchBusinessModelGuardrail[];
  copyText: string;
};

type ProductCostPlan = {
  features: Array<{
    feature: FeatureCode;
    quantity: number;
  }>;
};

const targetAiCostShareMaxPercent = 25;
const paymentFeeRate = 0.006;
const reserveRate = 0.05;
const maxCacShareOfContribution = 0.45;

const oneTimeCostPlans: Partial<Record<ProductCode, ProductCostPlan>> = {
  tarot_love: { features: [{ feature: "tarot_love", quantity: 1 }] },
  palm_brief: { features: [{ feature: "palm_reading", quantity: 1 }] },
  bazi_detail: { features: [{ feature: "deep_report", quantity: 1 }] },
  composite_report: {
    features: [
      { feature: "palm_reading", quantity: 1 },
      { feature: "deep_report", quantity: 1 },
    ],
  },
  yearly_report: { features: [{ feature: "yearly_report", quantity: 1 }] },
};

function membershipCostPlan(product: Product): ProductCostPlan {
  const features: ProductCostPlan["features"] = [
    { feature: "palm_reading", quantity: product.palmQuota ?? 0 },
    { feature: "deep_report", quantity: product.reportQuota ?? 0 },
  ];

  return {
    features: features.filter((item) => item.quantity > 0),
  };
}

const personas = [
  {
    id: "relationship_anxiety",
    title: "情感困惑用户",
    ageRange: "20-35",
    need: "想知道对方想法、复合可能、关系走向。",
    payTrigger: "问题有情绪张力，愿意为即时安慰和下一步建议付费。",
    entryOffer: "塔罗爱情牌阵",
    upgradePath: ["AI 情感追问", "月度会员", "关系主题深度报告"],
    targetProducts: ["tarot_love", "monthly", "composite_report"],
    status: "ready",
    action: "首页和分享页优先放塔罗爱情牌阵，用低客单拉首付，再引导月度会员追问。",
  },
  {
    id: "career_planning",
    title: "职场焦虑用户",
    ageRange: "22-40",
    need: "跳槽、事业、财运、年度规划，需要结构化报告。",
    payTrigger: "遇到选择节点，希望得到可保存、可反复看的解释和行动建议。",
    entryOffer: "八字五行详批",
    upgradePath: ["年度大报告", "进阶会员", "年度会员"],
    targetProducts: ["bazi_detail", "yearly_report", "pro_monthly"],
    status: "ready",
    action: "把八字详批和年度报告做成高信任入口，强调报告沉淀和行动建议。",
  },
  {
    id: "mystic_enthusiast",
    title: "玄学兴趣用户",
    ageRange: "25-45",
    need: "塔罗、八字、手相都想体验，愿意比较不同体系。",
    payTrigger: "多工具组合带来更强专业感，适合会员与综合命盘。",
    entryOffer: "手相 + 八字综合报告",
    upgradePath: ["进阶会员", "长期档案", "每月主题报告"],
    targetProducts: ["composite_report", "pro_monthly", "yearly"],
    status: "warning",
    action: "综合报告要补足手相和深度报告成本样本，再作为高客单主推。",
  },
  {
    id: "shareable_fun",
    title: "分享型用户",
    ageRange: "18-35",
    need: "好玩、好看、能晒，愿意先免费体验再小额付费。",
    payTrigger: "海报、今日塔罗、五行人格和手相图形成社交传播。",
    entryOffer: "今日塔罗 / 手相简析",
    upgradePath: ["体验卡", "手相简析", "月度会员"],
    targetProducts: ["trial_7d", "palm_brief", "monthly"],
    status: "warning",
    action: "先收集分享落地到支付样本；ROI 未稳定前限制投放预算。",
  },
  {
    id: "high_ticket",
    title: "高客单决策用户",
    ageRange: "28-50",
    need: "取名、择日、合婚、重大选择，希望有更完整解释。",
    payTrigger: "强需求、低频高客单，愿意为专项报告和人工增强服务付费。",
    entryOffer: "年度大报告",
    upgradePath: ["年度会员", "专项报告预留", "人工咨询预留"],
    targetProducts: ["yearly_report", "yearly", "composite_report"],
    status: "warning",
    action: "第一版先用年度报告承接，不急着承诺真人咨询或复杂专项服务。",
  },
] satisfies LaunchBusinessModelPersona[];

function statusRank(status: HealthStatus) {
  if (status === "blocking") {
    return 0;
  }

  if (status === "warning") {
    return 1;
  }

  return 2;
}

function worstStatus(statuses: HealthStatus[]) {
  return statuses.sort((a, b) => statusRank(a) - statusRank(b))[0] ?? "ready";
}

function percent(value: number | undefined) {
  if (value === undefined) {
    return "暂无";
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function formatMultiple(value: number | undefined) {
  if (value === undefined) {
    return "暂无";
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)}x`;
}

function buildFeatureCostMap(samples: LaunchUnitEconomicsCostSample[]) {
  const groups = new Map<FeatureCode, { totalCostCents: number; count: number }>();

  for (const sample of samples) {
    const current = groups.get(sample.featureCode) ?? { totalCostCents: 0, count: 0 };

    current.totalCostCents += sample.costCents;
    current.count += 1;
    groups.set(sample.featureCode, current);
  }

  return new Map(
    Array.from(groups.entries()).map(([feature, group]) => [
      feature,
      group.count > 0 ? group.totalCostCents / group.count : undefined,
    ]),
  );
}

function productCostPlan(product: Product): ProductCostPlan {
  if (product.type === "membership") {
    return membershipCostPlan(product);
  }

  return oneTimeCostPlans[product.code] ?? { features: [] };
}

function estimateAiCost(input: {
  product: Product;
  featureCosts: Map<FeatureCode, number | undefined>;
}) {
  const plan = productCostPlan(input.product);
  const missingCostFeatures: FeatureCode[] = [];
  let total = 0;

  for (const item of plan.features) {
    const cost = input.featureCosts.get(item.feature);

    if (cost === undefined) {
      missingCostFeatures.push(item.feature);
      continue;
    }

    total += cost * item.quantity;
  }

  return {
    estimatedAiCostCents: missingCostFeatures.length > 0 ? undefined : Math.round(total),
    missingCostFeatures: Array.from(new Set(missingCostFeatures)),
  };
}

function buildProductProjection(input: {
  product: Product;
  featureCosts: Map<FeatureCode, number | undefined>;
}) {
  const { estimatedAiCostCents, missingCostFeatures } = estimateAiCost(input);
  const paymentFeeCents = Math.ceil(input.product.priceCents * paymentFeeRate);
  const reserveCents = Math.ceil(input.product.priceCents * reserveRate);
  const estimatedAiCostSharePercent =
    estimatedAiCostCents === undefined
      ? undefined
      : (estimatedAiCostCents / input.product.priceCents) * 100;
  const contributionCents =
    estimatedAiCostCents === undefined
      ? undefined
      : input.product.priceCents - estimatedAiCostCents - paymentFeeCents - reserveCents;
  const suggestedMaxCacCents =
    contributionCents === undefined
      ? undefined
      : Math.max(0, Math.floor(contributionCents * maxCacShareOfContribution));
  const status: HealthStatus =
    missingCostFeatures.length > 0
      ? "warning"
      : (estimatedAiCostSharePercent ?? 0) > targetAiCostShareMaxPercent
        ? "blocking"
        : "ready";
  const detail =
    missingCostFeatures.length > 0
      ? `缺少 ${missingCostFeatures.join("、")} 成本样本，暂不能精确核算单次毛利。`
      : `AI 成本约占 ${percent(estimatedAiCostSharePercent)}，扣除支付费和运营预留后贡献毛利约 ${formatPrice(
          contributionCents ?? 0,
        )}。`;
  const action =
    status === "blocking"
      ? "先优化模型、减少上下文或上调价格，否则不建议放量该商品。"
      : status === "warning"
        ? "补齐对应真实成本样本后，再决定是否进入投放或主推。"
        : `首单获客成本建议控制在 ${formatPrice(suggestedMaxCacCents ?? 0)} 以内。`;

  return {
    code: input.product.code,
    name: input.product.name,
    type: input.product.type,
    priceLabel: formatPrice(input.product.priceCents, input.product.currency),
    priceCents: input.product.priceCents,
    estimatedAiCostCents,
    estimatedAiCostSharePercent,
    paymentFeeCents,
    reserveCents,
    contributionCents,
    suggestedMaxCacCents,
    missingCostFeatures,
    status,
    detail,
    action,
  } satisfies LaunchBusinessModelProduct;
}

function summarizeProducts(products: LaunchBusinessModelProduct[]) {
  const estimated = products.filter((product) => product.estimatedAiCostSharePercent !== undefined);
  const averageAiCostSharePercent =
    estimated.length > 0
      ? estimated.reduce((sum, product) => sum + (product.estimatedAiCostSharePercent ?? 0), 0) /
        estimated.length
      : undefined;

  return {
    ready: products.filter((product) => product.status === "ready").length,
    warning: products.filter((product) => product.status === "warning").length,
    blocking: products.filter((product) => product.status === "blocking").length,
    total: products.length,
    productsWithCostEstimate: estimated.length,
    averageAiCostSharePercent,
  };
}

function summarizeGrowth(rows: GrowthRoiRow[]) {
  const revenueCents = rows.reduce((sum, row) => sum + row.revenueCents, 0);
  const paidOrders = rows.reduce((sum, row) => sum + row.paidOrders, 0);
  const marketingCostCents = rows.reduce(
    (sum, row) => sum + row.discountCents + row.budgetCents,
    0,
  );

  return {
    paidOrders,
    revenueCents,
    marketingCostCents,
    blendedRoiMultiple: marketingCostCents > 0 ? revenueCents / marketingCostCents : undefined,
  };
}

function buildTopChannels(rows: GrowthRoiRow[]) {
  return rows.slice(0, 5).map((row) => ({
    source: row.source,
    paidOrders: row.paidOrders,
    revenueCents: row.revenueCents,
    marketingCostCents: row.discountCents + row.budgetCents,
    blendedRoiMultiple: row.blendedRoiMultiple,
  }));
}

function guardrails(input: {
  productSummary: ReturnType<typeof summarizeProducts>;
  growthSummary: ReturnType<typeof summarizeGrowth>;
  unitEconomics: LaunchUnitEconomics;
}): LaunchBusinessModelGuardrail[] {
  const costCoverageStatus: HealthStatus =
    input.productSummary.productsWithCostEstimate >= Math.ceil(input.productSummary.total * 0.6)
      ? "ready"
      : input.unitEconomics.summary.costSampleCount > 0
        ? "warning"
        : "blocking";
  const avgCostStatus: HealthStatus =
    input.productSummary.averageAiCostSharePercent === undefined
      ? "warning"
      : input.productSummary.averageAiCostSharePercent > targetAiCostShareMaxPercent
        ? "blocking"
        : "ready";
  const growthStatus: HealthStatus =
    input.growthSummary.paidOrders > 0
      ? input.growthSummary.blendedRoiMultiple === undefined ||
        input.growthSummary.blendedRoiMultiple >= 1
        ? "ready"
        : "warning"
      : "warning";
  const packageStatus: HealthStatus =
    input.productSummary.blocking > 0
      ? "blocking"
      : input.productSummary.warning > 0
        ? "warning"
        : "ready";

  return [
    {
      id: "cost_coverage",
      label: "成本覆盖",
      status: costCoverageStatus,
      target: "至少 60% 收费商品可估算 AI 成本",
      current: `${input.productSummary.productsWithCostEstimate}/${input.productSummary.total} 个商品有成本估算`,
      action:
        costCoverageStatus === "ready"
          ? "继续用真实订单补充成本样本，优先覆盖主推商品。"
          : "优先补手相、深度报告、年度报告和塔罗爱情牌阵的真实成本样本。",
    },
    {
      id: "ai_cost_share",
      label: "AI 成本占比",
      status: avgCostStatus,
      target: `平均 AI 成本占比不超过 ${targetAiCostShareMaxPercent}%`,
      current: percent(input.productSummary.averageAiCostSharePercent),
      action:
        avgCostStatus === "blocking"
          ? "先优化模型和报告长度，或调整对应商品价格。"
          : "把主推商品成本压在收入 15%-25% 区间内，再开启投放。",
    },
    {
      id: "growth_payback",
      label: "获客回收",
      status: growthStatus,
      target: "渠道实收能覆盖投放和优惠成本",
      current:
        input.growthSummary.paidOrders > 0
          ? `${input.growthSummary.paidOrders} 笔支付 / ${formatMultiple(
              input.growthSummary.blendedRoiMultiple,
            )} 综合回收`
          : "暂无真实支付归因样本",
      action:
        input.growthSummary.paidOrders > 0
          ? "保留来源、优惠码和投放成本记录，按渠道决定加码或暂停。"
          : "真实支付前只做小预算或自然分享，等小额订单样本回来再放量。",
    },
    {
      id: "offer_ladder",
      label: "收费梯度",
      status: packageStatus,
      target: "低门槛体验、中客单会员、高客单报告三层清晰",
      current: `${input.productSummary.ready} ready / ${input.productSummary.warning} warning / ${input.productSummary.blocking} blocking`,
      action:
        packageStatus === "ready"
          ? "保持体验卡、月度会员和深度报告作为首发主梯度。"
          : "先修复 warning/blocking 商品，再决定首页主推顺序。",
    },
  ];
}

function statusCopy(status: HealthStatus) {
  if (status === "blocking") {
    return {
      label: "商业模型存在阻断",
      detail: "部分主推商品的成本或毛利不满足收费放量要求。",
      action: "先补成本样本、优化模型成本或调整商品价格，再进入真实付费放量。",
    };
  }

  if (status === "warning") {
    return {
      label: "商业模型可小额验证",
      detail: "收费梯度和用户画像已成型，但成本覆盖、真实支付归因或部分商品毛利仍需样本复核。",
      action: "先用内部小额订单和自然分享收集成本、支付和渠道样本，暂不做大额投放。",
    };
  }

  return {
    label: "商业模型可进入灰度",
    detail: "用户画像、收费梯度、成本占比和获客回收没有发现阻断项。",
    action: "可以按灰度计划放开首批真实收费流量，并按渠道复盘回收。",
  };
}

function buildCopyText(input: {
  status: HealthStatus;
  label: string;
  products: LaunchBusinessModelProduct[];
  guardrails: LaunchBusinessModelGuardrail[];
  growthSummary: ReturnType<typeof summarizeGrowth>;
}) {
  const productLines = input.products
    .slice(0, 8)
    .map(
      (product) =>
        `- [${product.status}] ${product.name} ${product.priceLabel}：AI 成本 ${
          product.estimatedAiCostCents === undefined
            ? "待补样本"
            : `${formatPrice(product.estimatedAiCostCents)} / ${percent(product.estimatedAiCostSharePercent)}`
        }，CAC 上限 ${
          product.suggestedMaxCacCents === undefined
            ? "待估"
            : formatPrice(product.suggestedMaxCacCents)
        }`,
    );
  const guardrailLines = input.guardrails.map(
    (item, index) => `${index + 1}. [${item.status}] ${item.label}：${item.current}，${item.action}`,
  );

  return [
    "玄机 AI 商业模型与收费回收检查",
    `状态：${input.label} (${input.status})`,
    `真实支付归因：${input.growthSummary.paidOrders} 笔 / 收入 ${formatPrice(
      input.growthSummary.revenueCents,
    )} / 成本 ${formatPrice(input.growthSummary.marketingCostCents)} / 回收 ${formatMultiple(
      input.growthSummary.blendedRoiMultiple,
    )}`,
    "",
    "主推商品：",
    ...productLines,
    "",
    "经营护栏：",
    ...guardrailLines,
  ].join("\n");
}

export async function getLaunchBusinessModel(input?: {
  unitEconomics?: LaunchUnitEconomics;
  growthRows?: GrowthRoiRow[];
}) {
  const [unitEconomics, growthRows] = await Promise.all([
    input?.unitEconomics ?? getLaunchUnitEconomics(),
    input?.growthRows ??
      Promise.all([getAdminUsageLogs({ take: 500 }), getChannelBudgetConfigMap()]).then(
        ([logs, budgets]) => buildGrowthRoiRows(logs, budgets),
      ),
  ]);
  const featureCosts = buildFeatureCostMap(unitEconomics.costSamples);
  const products = [...membershipProducts, ...oneTimeProducts]
    .map((product) => buildProductProjection({ product, featureCosts }))
    .sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        b.priceCents - a.priceCents ||
        a.name.localeCompare(b.name, "zh-CN"),
    );
  const productSummary = summarizeProducts(products);
  const growthSummary = summarizeGrowth(growthRows);
  const businessGuardrails = guardrails({
    productSummary,
    growthSummary,
    unitEconomics,
  });
  const status = worstStatus(businessGuardrails.map((item) => item.status));
  const copy = statusCopy(status);

  return {
    generatedAt: new Date().toISOString(),
    status,
    ...copy,
    summary: {
      ready: businessGuardrails.filter((item) => item.status === "ready").length,
      warning: businessGuardrails.filter((item) => item.status === "warning").length,
      blocking: businessGuardrails.filter((item) => item.status === "blocking").length,
      total: businessGuardrails.length,
      personas: personas.length,
      products: products.length,
      productsWithCostEstimate: productSummary.productsWithCostEstimate,
      targetAiCostShareMaxPercent,
      averageAiCostSharePercent: productSummary.averageAiCostSharePercent,
      paidOrders: growthSummary.paidOrders,
      revenueCents: growthSummary.revenueCents,
      marketingCostCents: growthSummary.marketingCostCents,
      blendedRoiMultiple: growthSummary.blendedRoiMultiple,
    },
    personas,
    products,
    guardrails: businessGuardrails,
    topChannels: buildTopChannels(growthRows),
    nextActions: businessGuardrails.filter((item) => item.status !== "ready").slice(0, 6),
    copyText: buildCopyText({
      status,
      label: copy.label,
      products,
      guardrails: businessGuardrails,
      growthSummary,
    }),
  } satisfies LaunchBusinessModel;
}
