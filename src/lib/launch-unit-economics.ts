import "server-only";

import {
  formatPrice,
  getStarCostLabel,
  membershipProducts,
  oneTimeProducts,
  starCosts,
  type FeatureCode,
  type Product,
  type ProductCode,
} from "@/lib/commerce";
import type { HealthStatus } from "@/lib/health-checks";
import {
  getLaunchUnitEconomicsCostSamples,
  type LaunchUnitEconomicsCostSample,
} from "@/lib/launch-unit-economics-sample";
import { getAdminUsageLogs, type UsageLogRecord } from "@/lib/usage-log-store";

export type LaunchUnitEconomicsProduct = {
  code: ProductCode;
  name: string;
  type: Product["type"];
  status: HealthStatus;
  priceLabel: string;
  priceCents: number;
  starGrant?: number;
  durationDays?: number;
  mappedFeature?: FeatureCode;
  starCostLabel?: string;
  revenuePerGrantedStarCents?: number;
  revenuePerMaxFeatureStarCents?: number;
  issue?: string;
  action: string;
};

export type LaunchUnitEconomicsIssue = {
  id: string;
  group: string;
  title: string;
  status: HealthStatus;
  detail: string;
  action: string;
  evidence: string;
};

export type LaunchUnitEconomics = {
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
    productCount: number;
    openaiLogCount: number;
    missingOpenaiCostCount: number;
    recordedAiCostCents: number;
    aiTokens: number;
    costSampleCount: number;
    latestCostSampleAt?: string;
  };
  products: LaunchUnitEconomicsProduct[];
  costSamples: LaunchUnitEconomicsCostSample[];
  issues: LaunchUnitEconomicsIssue[];
  nextIssues: LaunchUnitEconomicsIssue[];
  copyText: string;
};

const productFeatureMap: Partial<Record<ProductCode, FeatureCode>> = {
  tarot_love: "tarot_love",
  palm_brief: "palm_reading",
  bazi_detail: "deep_report",
  composite_report: "deep_report",
  yearly_report: "yearly_report",
};

const aiFeatureCodes = new Set([
  "chat_basic",
  "palm_reading",
  "deep_report",
  "yearly_report",
]);

function statusRank(status: HealthStatus) {
  if (status === "blocking") {
    return 0;
  }

  if (status === "warning") {
    return 1;
  }

  return 2;
}

function formatCents(value: number) {
  return `${(value / 100).toFixed(2)} 元`;
}

function economicsForMembership(product: Product): LaunchUnitEconomicsProduct {
  if (!product.starGrant || product.starGrant <= 0) {
    return {
      code: product.code,
      name: product.name,
      type: product.type,
      status: "blocking",
      priceLabel: formatPrice(product.priceCents, product.currency),
      priceCents: product.priceCents,
      starGrant: product.starGrant,
      durationDays: product.durationDays,
      issue: "会员商品没有明确发放星力，权益和毛利无法核算。",
      action: "为会员商品配置 starGrant，或明确这是无星力会员并补充权益核算口径。",
    };
  }

  const revenuePerGrantedStarCents = product.priceCents / product.starGrant;
  const yearlyCadenceRisk =
    product.code === "yearly" &&
    (product.durationDays ?? 0) >= 365 &&
    product.starGrant < 12 * (membershipProducts.find((item) => item.code === "monthly")?.starGrant ?? 0);

  if (yearlyCadenceRisk) {
    return {
      code: product.code,
      name: product.name,
      type: product.type,
      status: "warning",
      priceLabel: formatPrice(product.priceCents, product.currency),
      priceCents: product.priceCents,
      starGrant: product.starGrant,
      durationDays: product.durationDays,
      revenuePerGrantedStarCents,
      issue: "年度会员文案偏向按月发放，但当前支付链路只会一次性发放 starGrant。",
      action: "确认年费星力是一次性发放还是按月发放；若按月发放，需要补自动发放或运营发放规则。",
    };
  }

  return {
    code: product.code,
    name: product.name,
    type: product.type,
    status: "ready",
    priceLabel: formatPrice(product.priceCents, product.currency),
    priceCents: product.priceCents,
    starGrant: product.starGrant,
    durationDays: product.durationDays,
    revenuePerGrantedStarCents,
    action: `当前每发放 1 星力约对应 ${formatCents(revenuePerGrantedStarCents)} 收入，后续需与 AI 成本和投放成本一起复盘。`,
  };
}

function economicsForOneTime(product: Product): LaunchUnitEconomicsProduct {
  const mappedFeature = productFeatureMap[product.code];
  const featureCost = mappedFeature ? starCosts[mappedFeature] : undefined;
  const revenuePerMaxFeatureStarCents =
    featureCost && featureCost.max > 0 ? product.priceCents / featureCost.max : undefined;

  if (!mappedFeature || !featureCost) {
    return {
      code: product.code,
      name: product.name,
      type: product.type,
      status: "warning",
      priceLabel: formatPrice(product.priceCents, product.currency),
      priceCents: product.priceCents,
      issue: "单次付费商品没有映射到星力消耗或 AI 成本特征。",
      action: "为该商品明确对应 featureCode，便于按订单复盘模型成本和报告成本。",
    };
  }

  return {
    code: product.code,
    name: product.name,
    type: product.type,
    status: "ready",
    priceLabel: formatPrice(product.priceCents, product.currency),
    priceCents: product.priceCents,
    mappedFeature,
    starCostLabel: getStarCostLabel(mappedFeature),
    revenuePerMaxFeatureStarCents,
    action: `按最高 ${featureCost.max} 星力折算，每 1 星力约对应 ${formatCents(
      revenuePerMaxFeatureStarCents ?? 0,
    )} 收入。`,
  };
}

function productEconomics() {
  return [
    ...membershipProducts.map(economicsForMembership),
    ...oneTimeProducts.map(economicsForOneTime),
  ].sort(
    (a, b) =>
      statusRank(a.status) - statusRank(b.status) ||
      a.type.localeCompare(b.type, "zh-CN") ||
      a.priceCents - b.priceCents,
  );
}

function isAiUsageLog(log: UsageLogRecord) {
  return log.provider === "openai" || log.provider === "local" || aiFeatureCodes.has(log.feature);
}

function costIssues(logs: UsageLogRecord[], costSamples: LaunchUnitEconomicsCostSample[]) {
  const aiLogs = logs.filter(isAiUsageLog);
  const openaiLogs = aiLogs.filter((log) => log.provider === "openai");
  const missingOpenaiCost = openaiLogs.filter((log) => log.costCents === undefined);
  const recordedAiCostCents = aiLogs.reduce((sum, log) => sum + (log.costCents ?? 0), 0);
  const aiTokens = aiLogs.reduce((sum, log) => sum + (log.tokensIn ?? 0) + (log.tokensOut ?? 0), 0);
  const issues: LaunchUnitEconomicsIssue[] = [];

  if (aiLogs.length === 0) {
    issues.push({
      id: "ai-cost:no-sample",
      group: "AI 成本",
      title: "暂无真实 AI 成本样本",
      status: "warning",
      detail: "当前后台还没有可用于毛利复盘的 AI 使用样本。",
      action: "生产变量配置完成后，至少跑一次 AI 对话、手相视觉和深度报告，并确认 UsageLog 写入 tokens 与成本。",
      evidence: "UsageLog 中出现 chat_basic、palm_reading、deep_report 或 yearly_report 记录。",
    });
  }

  if (missingOpenaiCost.length > 0) {
    issues.push({
      id: "ai-cost:missing-openai-cost",
      group: "AI 成本",
      title: "OpenAI 调用缺少成本金额",
      status: "warning",
      detail: `最近 ${openaiLogs.length} 条 OpenAI 日志中有 ${missingOpenaiCost.length} 条没有 costCents，毛利只能看到 tokens，无法直接算钱。`,
      action: "上线前补成本估算或账单回填机制，把 OpenAI 调用的 costCents 写入 UsageLog。",
      evidence: "OpenAI UsageLog 记录包含 tokensIn、tokensOut、model 和 costCents。",
    });
  }

  return {
    aiLogs,
    openaiLogs,
    costSamples,
    missingOpenaiCost,
    recordedAiCostCents,
    aiTokens,
    issues,
  };
}

function productIssues(products: LaunchUnitEconomicsProduct[]) {
  return products
    .filter((product) => product.status !== "ready")
    .map((product) => ({
      id: `product:${product.code}`,
      group: "产品毛利",
      title: product.name,
      status: product.status,
      detail: product.issue ?? "产品单位经济需要复核。",
      action: product.action,
      evidence: `${product.priceLabel} / ${
        product.starGrant ? `${product.starGrant} 星力` : product.starCostLabel ?? "未映射"
      }`,
    })) satisfies LaunchUnitEconomicsIssue[];
}

function summarize(issues: LaunchUnitEconomicsIssue[], input: ReturnType<typeof costIssues>) {
  return {
    ready: issues.filter((item) => item.status === "ready").length,
    warning: issues.filter((item) => item.status === "warning").length,
    blocking: issues.filter((item) => item.status === "blocking").length,
    total: issues.length,
    productCount: membershipProducts.length + oneTimeProducts.length,
    openaiLogCount: input.openaiLogs.length,
    missingOpenaiCostCount: input.missingOpenaiCost.length,
    recordedAiCostCents: input.recordedAiCostCents,
    aiTokens: input.aiTokens,
    costSampleCount: input.costSamples.length,
    latestCostSampleAt: input.costSamples
      .map((sample) => sample.metadata.savedAt)
      .sort((a, b) => b.localeCompare(a))[0],
  };
}

function statusFromSummary(summary: ReturnType<typeof summarize>) {
  if (summary.blocking > 0) {
    return {
      status: "blocking" as const,
      label: `单位经济有 ${summary.blocking} 个阻断项`,
      detail: "产品定价、权益发放或成本记录存在硬阻断，暂不适合公开收费放量。",
      action: "先修复阻断项，再用真实 AI 样本和支付订单复核毛利。",
    };
  }

  if (summary.warning > 0) {
    return {
      status: "warning" as const,
      label: `单位经济有 ${summary.warning} 个待复核项`,
      detail: "产品定价和收费链路基本可用，但 AI 成本样本、年度会员发放节奏或成本金额仍需复核。",
      action: "上线前跑真实样本并补齐 costCents，确认会员发放节奏与页面承诺一致。",
    };
  }

  return {
    status: "ready" as const,
    label: "单位经济可进入灰度复盘",
    detail: "产品定价、星力口径和 AI 成本记录没有发现阻断或警告。",
    action: "进入小额真实订单灰度后，按订单、星力消耗、AI 成本和渠道成本复盘毛利。",
  };
}

function buildCopyText(input: {
  status: HealthStatus;
  label: string;
  products: LaunchUnitEconomicsProduct[];
  issues: LaunchUnitEconomicsIssue[];
  summary: LaunchUnitEconomics["summary"];
}) {
  const productLines = input.products.map((product) => {
    const unit =
      product.revenuePerGrantedStarCents !== undefined
        ? `每星力收入 ${formatCents(product.revenuePerGrantedStarCents)}`
        : product.revenuePerMaxFeatureStarCents !== undefined
          ? `按最高消耗每星力收入 ${formatCents(product.revenuePerMaxFeatureStarCents)}`
          : "未形成星力折算";

    return `- [${product.status}] ${product.name} ${product.priceLabel}：${unit}`;
  });
  const issueLines =
    input.issues.length > 0
      ? input.issues.map((issue, index) => `${index + 1}. [${issue.status}] ${issue.title}：${issue.action}`)
      : ["- 暂无单位经济缺口。"];

  return [
    "玄机 AI 单位经济与 AI 成本检查",
    `状态：${input.label} (${input.status})`,
    `AI tokens：${input.summary.aiTokens}`,
    `已记录 AI 成本：${formatPrice(input.summary.recordedAiCostCents)}`,
    `成本样本：${input.summary.costSampleCount} 条`,
    "",
    "产品折算：",
    ...productLines,
    "",
    "待处理：",
    ...issueLines,
  ].join("\n");
}

export async function getLaunchUnitEconomics() {
  const [logs, costSamples] = await Promise.all([
    getAdminUsageLogs({ take: 500 }),
    getLaunchUnitEconomicsCostSamples({ take: 500 }),
  ]);
  const products = productEconomics();
  const cost = costIssues(logs, costSamples);
  const issues = [...productIssues(products), ...cost.issues].sort(
    (a, b) =>
      statusRank(a.status) - statusRank(b.status) ||
      a.group.localeCompare(b.group, "zh-CN") ||
      a.title.localeCompare(b.title, "zh-CN"),
  );
  const summary = summarize(issues, cost);
  const status = statusFromSummary(summary);

  return {
    generatedAt: new Date().toISOString(),
    ...status,
    summary,
    products,
    costSamples: costSamples.slice(0, 24),
    issues,
    nextIssues: issues.filter((issue) => issue.status !== "ready").slice(0, 8),
    copyText: buildCopyText({
      status: status.status,
      label: status.label,
      products,
      issues,
      summary,
    }),
  } satisfies LaunchUnitEconomics;
}
