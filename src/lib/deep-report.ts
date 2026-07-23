import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import {
  getProduct,
  type FeatureCode,
} from "@/lib/commerce";
import {
  buildProfileMemory,
  type FortuneProfileRecord,
} from "@/lib/fortune-profile-store";
import {
  assertDeepReportReady,
  type DeepReportPalmEvidence,
} from "@/lib/deep-report-readiness";
import { buildAiCostMetadata, estimateOpenAiCostCents } from "@/lib/ai-cost";
import { getOpenAIClient, getPremiumOpenAIModel } from "@/lib/openai-client";
import type { MockReportType } from "@/lib/report-store";
import { createUsageLog } from "@/lib/usage-log-store";
import {
  assessSafetyRisk,
  buildDeepReportPromptRunMetadata,
  buildDeepReportEvidencePackage,
  buildDeterministicDeepReport,
  composeDeepReportPrompt,
  deepReportAnswerSchema,
  renderDeepReportAnswer,
  routePromptRequest,
  validateStructuredDeepReport,
  type DeepReportAnswer,
  type PromptValidationSummary,
} from "@/lib/prompts";

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

export type DeepReportGenerationInputSnapshot = {
  version: 1;
  capturedAt: string;
  productCode: DeepReportProductCode;
  productName?: string;
  orderId?: string;
  paymentSource?: "membership_quota";
  entitlementKind?: "deep_report";
  profile: FortuneProfileRecord | null;
  palmEvidence?: DeepReportPalmEvidence;
  profileMemory: string;
  localDraft: {
    type: MockReportType;
    title: string;
    summary: string;
    content: string;
    toolResults: unknown;
  };
  profileId?: string;
  profileCompleteness: number;
};

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 2));
}

function asObjectRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function validationSummary(input: {
  ok: boolean;
  errors?: string[];
  repaired?: boolean;
  repairAttempts?: number;
  degraded?: boolean;
}): PromptValidationSummary {
  return {
    ok: input.ok,
    errors: input.errors ?? [],
    repaired: input.repaired ?? false,
    repairAttempts: input.repairAttempts ?? 0,
    degraded: input.degraded ?? false,
  };
}

function createDeepReportPrompt(input: {
  userId: string;
  inputSnapshot: DeepReportGenerationInputSnapshot;
}) {
  const subject = {
    kind: "self" as const,
    label: input.inputSnapshot.profile?.name || "本人",
    memberProfileRole: "subject" as const,
  };
  const safety = assessSafetyRisk(`${input.inputSnapshot.productName ?? "深度报告"} 深度报告`);
  const evidence = buildDeepReportEvidencePackage({
    subject,
    profile: input.inputSnapshot.profile,
    localDraft: input.inputSnapshot.localDraft,
  });
  const route = routePromptRequest({
    question: input.inputSnapshot.productName ?? "深度报告",
    serviceTier: "deep",
    safety,
    method: "bazi",
    explicitMethod: true,
    isFollowUp: false,
    answerShape: "single_reading",
  });
  const compilation = composeDeepReportPrompt({
    userId: input.userId,
    productCode: input.inputSnapshot.productCode,
    productName: input.inputSnapshot.productName ?? "深度报告",
    profileMemory: input.inputSnapshot.profileMemory,
    localDraft: {
      title: input.inputSnapshot.localDraft.title,
      summary: input.inputSnapshot.localDraft.summary,
      content: input.inputSnapshot.localDraft.content,
      type: input.inputSnapshot.localDraft.type,
    },
    route,
    evidence,
    profileCompleteness: input.inputSnapshot.profileCompleteness,
  });

  return { evidence, route, compilation };
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
  palmEvidence?: DeepReportPalmEvidence;
}) {
  const product = getProduct(input.productCode);
  const reportType = getDeepReportType(input.productCode);
  const { chart, wuxing } = readBazi(input.profile);
  const baziText = chart?.bazi?.join("、") ?? "";
  const weakestText = wuxing?.weakest?.join("、") ?? "";
  const strongestText = wuxing?.strongest ?? "";
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
    input.productCode === "composite_report"
      ? `手相分析摘要：${input.palmEvidence?.summary ?? ""}`
      : "",
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
      palmEvidence: input.palmEvidence,
      profileCompleteness: input.profile?.completeness ?? 0,
    },
  };
}

function getFeatureCode(productCode: DeepReportProductCode): FeatureCode {
  return productCode === "yearly_report" ? "yearly_report" : "deep_report";
}

export async function createDeepReportGenerationInputSnapshot(input: {
  userId: string;
  productCode: DeepReportProductCode;
  orderId?: string;
  entitlement?: {
    paymentSource: "membership_quota";
    entitlementKind: "deep_report";
  };
}) {
  const readiness = await assertDeepReportReady({
    userId: input.userId,
    productCode: input.productCode,
  });
  const profile = readiness.profile;
  const profileMemory = buildProfileMemory(profile);
  const local = buildLocalDeepReport({
    productCode: input.productCode,
    profile,
    profileMemory,
    palmEvidence: readiness.palmEvidence,
  });
  const product = getProduct(input.productCode);

  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    productCode: input.productCode,
    productName: product?.name,
    orderId: input.orderId,
    ...input.entitlement,
    profile,
    palmEvidence: readiness.palmEvidence,
    profileMemory,
    localDraft: local,
    profileId: profile?.id,
    profileCompleteness: profile?.completeness ?? 0,
  } satisfies DeepReportGenerationInputSnapshot;
}

export async function buildPaidDeepReport(input: {
  userId: string;
  productCode: DeepReportProductCode;
  orderId?: string;
  entitlement?: {
    paymentSource: "membership_quota";
    entitlementKind: "deep_report";
  };
  generationInput?: DeepReportGenerationInputSnapshot;
  usageIdempotencyKey?: string;
}): Promise<DeepReportDraft> {
  const inputSnapshot =
    input.generationInput ??
    (await createDeepReportGenerationInputSnapshot({
      userId: input.userId,
      productCode: input.productCode,
      orderId: input.orderId,
      entitlement: input.entitlement,
    }));
  const local = inputSnapshot.localDraft;
  const client = getOpenAIClient();
  const model = getPremiumOpenAIModel();
  const feature = getFeatureCode(inputSnapshot.productCode);
  const prompt = createDeepReportPrompt({
    userId: input.userId,
    inputSnapshot,
  });

  if (client) {
    try {
      const response = await client.responses.parse({
        model,
        instructions: prompt.compilation.instructions,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: prompt.compilation.userPayloadText,
              },
            ],
          },
        ],
        text: {
          format: zodTextFormat(deepReportAnswerSchema, "xuanji_deep_report"),
        },
        max_output_tokens: inputSnapshot.productCode === "yearly_report" ? 3200 : 2400,
        prompt_cache_key: `xuanji:deep-report:${prompt.compilation.metadataBase.prompt.promptReleaseId}`,
        safety_identifier: prompt.compilation.safetyIdentifier,
        store: false,
      });
      let tokensIn =
        response.usage?.input_tokens ?? estimateTokens(inputSnapshot.profileMemory);
      let tokensOut = response.usage?.output_tokens ?? estimateTokens(response.output_text ?? "");
      let structuredAnswer: DeepReportAnswer | null = response.output_parsed;
      let validation = validationSummary({
        ok: false,
        errors: structuredAnswer ? [] : ["MODEL_STRUCTURED_REPORT_MISSING"],
      });

      if (structuredAnswer) {
        const checked = validateStructuredDeepReport({
          answer: structuredAnswer,
          evidence: prompt.evidence,
        });

        if (checked.ok) {
          validation = validationSummary({ ok: true });
        } else {
          validation = validationSummary({ ok: false, errors: checked.errors });
          structuredAnswer = null;
        }
      }

      if (!structuredAnswer) {
        const repaired = await client.responses.parse({
          model,
          instructions: prompt.compilation.instructions,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: JSON.stringify({
                    task: "repair_structured_deep_report",
                    originalPayload: prompt.compilation.userPayloadText,
                    validationErrors: validation.errors,
                    allowedEvidenceIds: prompt.evidence.allowedEvidenceIds,
                    previousOutput: (response.output_text ?? "").slice(0, 12000),
                    instruction: "只修复结构、证据引用、报告深度和安全问题，不得增加证据包之外的新事实。",
                  }),
                },
              ],
            },
          ],
          text: {
            format: zodTextFormat(deepReportAnswerSchema, "xuanji_deep_report_repair"),
          },
          max_output_tokens: inputSnapshot.productCode === "yearly_report" ? 3200 : 2400,
          prompt_cache_key: `xuanji:deep-report-repair:${prompt.compilation.metadataBase.prompt.promptReleaseId}`,
          safety_identifier: prompt.compilation.safetyIdentifier,
          store: false,
        });
        tokensIn += repaired.usage?.input_tokens ?? 0;
        tokensOut += repaired.usage?.output_tokens ?? 0;
        const repairedAnswer = repaired.output_parsed;

        if (repairedAnswer) {
          const rechecked = validateStructuredDeepReport({
            answer: repairedAnswer,
            evidence: prompt.evidence,
          });

          if (rechecked.ok) {
            structuredAnswer = repairedAnswer;
            validation = validationSummary({ ok: true, repaired: true, repairAttempts: 1 });
          } else {
            validation = validationSummary({
              ok: false,
              errors: [...validation.errors, ...rechecked.errors].slice(0, 8),
              repaired: true,
              repairAttempts: 1,
              degraded: true,
            });
          }
        } else {
          validation = validationSummary({
            ok: false,
            errors: [...validation.errors, "REPAIRED_STRUCTURED_REPORT_MISSING"].slice(0, 8),
            repaired: true,
            repairAttempts: 1,
            degraded: true,
          });
        }
      }

      if (!structuredAnswer) {
        structuredAnswer = buildDeterministicDeepReport({
          title: local.title,
          summary: local.summary,
          content: local.content,
          evidence: prompt.evidence,
          reason: "MODEL_OUTPUT_VALIDATION_FAILED",
        });
        validation = validationSummary({
          ok: true,
          errors: validation.errors,
          repaired: validation.repaired,
          repairAttempts: validation.repairAttempts,
          degraded: true,
        });
      }

      const content = renderDeepReportAnswer(structuredAnswer, prompt.evidence);
      tokensIn = tokensIn || estimateTokens(inputSnapshot.profileMemory);
      tokensOut = tokensOut || estimateTokens(content);
      const costEstimate = estimateOpenAiCostCents({ model, tokensIn, tokensOut });
      const promptMetadata = buildDeepReportPromptRunMetadata({
        compilation: prompt.compilation,
        validation,
      });
      const usageLog = await createUsageLog({
        userId: input.userId,
        provider: "openai",
        model,
        feature,
        tokensIn,
        tokensOut,
        costCents: costEstimate?.costCents,
        idempotencyKey: input.usageIdempotencyKey,
        metadata: {
          orderId: inputSnapshot.orderId,
          paymentSource: inputSnapshot.paymentSource,
          entitlementKind: inputSnapshot.entitlementKind,
          productCode: inputSnapshot.productCode,
          reportType: local.type,
          fallback: validation.degraded,
          promptMetadata,
          validation,
          evidence: {
            evidencePackageId: prompt.evidence.evidencePackageId,
            evidenceCount: prompt.evidence.items.length,
            factDigest: prompt.evidence.factDigest,
          },
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
          ...asObjectRecord(local.toolResults),
          analyzer: "openai_deep_report_v2",
          usageLogId: usageLog.id,
          structuredReport: structuredAnswer,
          promptMetadata,
          validation,
        },
        modelUsed: model,
        costTokens: tokensIn + tokensOut,
        usageLogId: usageLog.id,
      };
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
        console.warn(`OpenAI deep report failed; using deterministic fallback. ${message}`);
      }
    }
  }

  const fallbackAnswer = buildDeterministicDeepReport({
    title: local.title,
    summary: local.summary,
    content: local.content,
    evidence: prompt.evidence,
    reason: client ? "MODEL_GENERATION_FAILED" : "MODEL_PROVIDER_UNAVAILABLE",
  });
  const fallbackValidation = validationSummary({
    ok: true,
    degraded: true,
    errors: client ? ["MODEL_GENERATION_FAILED"] : ["MODEL_PROVIDER_UNAVAILABLE"],
  });
  const promptMetadata = buildDeepReportPromptRunMetadata({
    compilation: prompt.compilation,
    validation: fallbackValidation,
  });
  const fallbackContent = renderDeepReportAnswer(fallbackAnswer, prompt.evidence);
  const tokensIn = estimateTokens(inputSnapshot.profileMemory);
  const tokensOut = estimateTokens(fallbackContent);
  const usageLog = await createUsageLog({
    userId: input.userId,
    provider: "local",
    model: "local-deep-report",
    feature,
    tokensIn,
    tokensOut,
    costCents: 0,
    idempotencyKey: input.usageIdempotencyKey,
    metadata: {
      orderId: inputSnapshot.orderId,
      paymentSource: inputSnapshot.paymentSource,
      entitlementKind: inputSnapshot.entitlementKind,
      productCode: inputSnapshot.productCode,
      reportType: local.type,
      fallback: true,
      promptMetadata,
      validation: fallbackValidation,
      evidence: {
        evidencePackageId: prompt.evidence.evidencePackageId,
        evidenceCount: prompt.evidence.items.length,
        factDigest: prompt.evidence.factDigest,
      },
      costCurrency: "CNY",
      estimatedCost: false,
      costSource: "local_no_model_cost",
    },
  });

  return {
    type: local.type,
    title: local.title,
    summary: local.summary,
    content: fallbackContent,
    inputSnapshot,
    toolResults: {
      ...asObjectRecord(local.toolResults),
      usageLogId: usageLog.id,
      structuredReport: fallbackAnswer,
      promptMetadata,
      validation: fallbackValidation,
    },
    modelUsed: "local-deep-report",
    costTokens: tokensIn + tokensOut,
    usageLogId: usageLog.id,
  };
}
