import "server-only";

import {
  getProduct,
  type FeatureCode,
} from "@/lib/commerce";
import {
  buildProfileMemory,
  getFortuneProfile,
  type FortuneProfileRecord,
} from "@/lib/fortune-profile-store";
import { buildAiCostMetadata, estimateOpenAiCostCents } from "@/lib/ai-cost";
import { getOpenAIClient, getPremiumOpenAIModel } from "@/lib/openai-client";
import type { MockReportType } from "@/lib/report-store";
import { createUsageLog } from "@/lib/usage-log-store";

export const deepReportProductCodes = [
  "bazi_detail",
  "composite_report",
  "yearly_report",
] as const;

export type DeepReportProductCode = (typeof deepReportProductCodes)[number];

export type DeepReportDraft = {
  type: MockReportType;
  title: string;
  summary: string;
  content: string;
  inputSnapshot: unknown;
  toolResults: unknown;
  modelUsed: string;
  costTokens: number;
  usageLogId: string;
};

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 2));
}

export function isDeepReportProductCode(value: string): value is DeepReportProductCode {
  return deepReportProductCodes.includes(value as DeepReportProductCode);
}

export function getDeepReportType(productCode: DeepReportProductCode): MockReportType {
  if (productCode === "yearly_report") {
    return "YEARLY";
  }

  if (productCode === "composite_report") {
    return "COMPOSITE";
  }

  return "BAZI_WUXING";
}

function readBazi(profile: FortuneProfileRecord | null) {
  const chart =
    profile?.baziChart && typeof profile.baziChart === "object"
      ? (profile.baziChart as { bazi?: string[]; pillars?: unknown[] })
      : null;
  const wuxing =
    profile?.wuxingProfile && typeof profile.wuxingProfile === "object"
      ? (profile.wuxingProfile as {
          counts?: Record<string, number>;
          strongest?: string;
          weakest?: string[];
        })
      : null;

  return { chart, wuxing };
}

function buildLocalDeepReport(input: {
  productCode: DeepReportProductCode;
  profile: FortuneProfileRecord | null;
  profileMemory: string;
}) {
  const product = getProduct(input.productCode);
  const reportType = getDeepReportType(input.productCode);
  const { chart, wuxing } = readBazi(input.profile);
  const baziText = chart?.bazi?.length ? chart.bazi.join("、") : "档案尚未形成完整四柱";
  const weakestText = wuxing?.weakest?.length ? wuxing.weakest.join("、") : "待补充";
  const strongestText = wuxing?.strongest ?? "待补充";
  const name = input.profile?.name || "你";
  const title =
    input.productCode === "yearly_report"
      ? "年度运势深度报告"
      : input.productCode === "composite_report"
        ? "手相 + 八字综合报告"
        : "八字五行详批";
  const summary = `${name}的${product?.name ?? title}已生成：核心参考为 ${baziText}，五行偏强为「${strongestText}」，需要照顾「${weakestText}」。`;
  const content = [
    summary,
    "一、档案基线",
    input.profileMemory,
    "",
    "二、命理结构",
    `四柱参考：${baziText}。五行结构里，「${strongestText}」更容易成为外显优势，「${weakestText}」更适合通过习惯、环境和选择去补足。`,
    "",
    "三、关键主题",
    input.productCode === "yearly_report"
      ? "未来一年建议把注意力放在节奏、资源分配和长期关系质量上。年度报告更适合按季度复盘，而不是追求一次性定论。"
      : input.productCode === "composite_report"
        ? "综合报告建议把八字结构作为长期底色，把手相和近期问题作为当下状态参考，两者交叉看行动节奏。"
        : "八字详批建议先抓五行偏性，再看现实中的职业、关系和精力管理是否与结构相互支持。",
    "",
    "四、行动建议",
    "1. 先选择一个最重要的主题，不要同时押注太多方向。",
    "2. 把接下来 30 天拆成一个可执行的小周期，记录情绪、机会和阻力。",
    "3. 遇到重大医疗、法律、投资或人生选择时，以专业意见和现实证据为准。",
    "",
    "本报告仅供娱乐、文化参考和自我探索，不构成医疗、投资、法律或重大人生决策建议。",
  ].join("\n");

  return {
    type: reportType,
    title,
    summary,
    content,
    toolResults: {
      analyzer: "local_deep_report_v1",
      bazi: chart,
      wuxing,
      profileCompleteness: input.profile?.completeness ?? 0,
    },
  };
}

function getFeatureCode(productCode: DeepReportProductCode): FeatureCode {
  return productCode === "yearly_report" ? "yearly_report" : "deep_report";
}

export async function buildPaidDeepReport(input: {
  userId: string;
  productCode: DeepReportProductCode;
  orderId?: string;
  entitlement?: {
    paymentSource: "membership_quota";
    entitlementKind: "deep_report";
  };
}): Promise<DeepReportDraft> {
  const profile = await getFortuneProfile(input.userId);
  const profileMemory = buildProfileMemory(profile);
  const local = buildLocalDeepReport({
    productCode: input.productCode,
    profile,
    profileMemory,
  });
  const product = getProduct(input.productCode);
  const inputSnapshot = {
    productCode: input.productCode,
    productName: product?.name,
    orderId: input.orderId,
    ...input.entitlement,
    profileId: profile?.id,
    profileCompleteness: profile?.completeness ?? 0,
  };
  const client = getOpenAIClient();
  const model = getPremiumOpenAIModel();
  const feature = getFeatureCode(input.productCode);

  if (client) {
    try {
      const response = await client.responses.create({
        model,
        instructions:
          "你是玄机 AI 的深度报告顾问。请基于后端提供的会员档案、八字五行摘要和本地报告草稿，生成中文深度报告。语气温和、克制、专业。不要编造后端没有提供的出生信息、手相细节或确定性预测。不得给医疗、投资、法律或重大人生决策的确定性建议。",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({
                  product,
                  inputSnapshot,
                  profileMemory,
                  localDraft: local.content,
                }),
              },
            ],
          },
        ],
        max_output_tokens: input.productCode === "yearly_report" ? 1500 : 1100,
        prompt_cache_key: `xuanji:deep-report:${input.userId}`,
      });
      const content = response.output_text?.trim() || local.content;
      const tokensIn = response.usage?.input_tokens ?? estimateTokens(profileMemory);
      const tokensOut = response.usage?.output_tokens ?? estimateTokens(content);
      const costEstimate = estimateOpenAiCostCents({ model, tokensIn, tokensOut });
      const usageLog = await createUsageLog({
        userId: input.userId,
        provider: "openai",
        model,
        feature,
        tokensIn,
        tokensOut,
        costCents: costEstimate?.costCents,
        metadata: {
          orderId: input.orderId,
          paymentSource: input.entitlement?.paymentSource,
          entitlementKind: input.entitlement?.entitlementKind,
          productCode: input.productCode,
          reportType: local.type,
          fallback: false,
          ...buildAiCostMetadata(costEstimate),
        },
      });

      return {
        type: local.type,
        title: local.title,
        summary: local.summary,
        content,
        inputSnapshot,
        toolResults: {
          ...local.toolResults,
          analyzer: "openai_deep_report_v1",
          usageLogId: usageLog.id,
        },
        modelUsed: model,
        costTokens: tokensIn + tokensOut,
        usageLogId: usageLog.id,
      };
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
        console.warn(`OpenAI deep report failed; using local fallback. ${message}`);
      }
    }
  }

  const tokensIn = estimateTokens(profileMemory);
  const tokensOut = estimateTokens(local.content);
  const usageLog = await createUsageLog({
    userId: input.userId,
    provider: "local",
    model: "local-deep-report",
    feature,
    tokensIn,
    tokensOut,
    costCents: 0,
    metadata: {
      orderId: input.orderId,
      paymentSource: input.entitlement?.paymentSource,
      entitlementKind: input.entitlement?.entitlementKind,
      productCode: input.productCode,
      reportType: local.type,
      fallback: true,
      costCurrency: "CNY",
      estimatedCost: false,
      costSource: "local_no_model_cost",
    },
  });

  return {
    type: local.type,
    title: local.title,
    summary: local.summary,
    content: local.content,
    inputSnapshot,
    toolResults: {
      ...local.toolResults,
      usageLogId: usageLog.id,
    },
    modelUsed: "local-deep-report",
    costTokens: tokensIn + tokensOut,
    usageLogId: usageLog.id,
  };
}
