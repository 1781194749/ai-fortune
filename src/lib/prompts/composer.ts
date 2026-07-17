import "server-only";

import { createHash } from "crypto";
import type { ModelMessage } from "ai";
import { protectedIdentityAnswer } from "@/lib/prompts/base-identity";
import { buildRepairTemplate } from "@/lib/prompts/repair-template";
import { resolvePromptRelease } from "@/lib/prompts/registry";
import {
  fortuneAnswerSchema,
  type FortuneAnswer,
  type PromptRoute,
  type PromptRunMetadata,
  type PromptValidationSummary,
  type ReadingEvidencePackage,
  type ReadingMethod,
  type ServiceTier,
} from "@/lib/prompts/contracts";
import {
  findReadingEvidenceItem,
  serializeEvidenceForPrompt,
  validateFortuneAnswerAgainstEvidence,
} from "@/lib/prompts/evidence";
import {
  validateFortuneAnswerSafety,
  validateFortuneAnswerStatus,
  validateFortuneAnswerTier,
} from "@/lib/prompts/validation";

type PromptConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type FortunePromptInput = {
  userId?: string;
  question: string;
  serviceTier: ServiceTier;
  method: ReadingMethod;
  route: PromptRoute;
  evidence: ReadingEvidencePackage;
  answerShape: string;
  draftAnswer: string;
  contextSummary: unknown;
  conversationHistory?: PromptConversationMessage[];
  profileMemory?: string;
  reportMode?: boolean;
};

export type FortunePromptCompilation = {
  instructions: string;
  messages: ModelMessage[];
  userPayloadText: string;
  metadataBase: Omit<PromptRunMetadata, "validation">;
};

function hashSensitiveText(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export function buildOpenAiSafetyIdentifier(userId: string) {
  return `xuanji_${hashSensitiveText(userId)}`;
}

function compactText(text: string, maxLength: number) {
  const normalized = text.trim().replace(/\s+/g, " ");
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength)}...`;
}

function extractDeterministicVerdict(draftAnswer: string) {
  const direct = draftAnswer.match(/(?:直接判断|直接看|我的判断)[：:]\s*([^\n]{2,220})/)?.[1];
  const firstParagraph = draftAnswer
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .find((paragraph) => paragraph && !paragraph.startsWith("|"));
  return compactText((direct ?? firstParagraph ?? protectedIdentityAnswer).replace(/^(?:直接判断|直接看)[：:]\s*/, ""), 220);
}

function fallbackReasonText(reason?: string) {
  const labels: Record<string, string> = {
    MODEL_PROVIDER_UNAVAILABLE: "当前使用本地证据解读",
    MODEL_GENERATION_FAILED: "模型暂不可用，已切换本地安全解读",
    MODEL_OUTPUT_VALIDATION_FAILED: "模型输出未通过事实校验，已切换本地安全解读",
  };
  return reason ? labels[reason] ?? "当前使用稳健降级解读" : "稳健解读";
}

function schemaForPrompt() {
  return {
    status: "ok | needs_input | blocked | fallback",
    verdict: {
      summary: "string <= 220 chars",
      stance: "string <= 80 chars or null",
      confidence: "low | medium | high",
    },
    evidenceRefs: ["evidenceId from allowedEvidenceIds only"],
    interpretations: [
      {
        evidenceId: "evidenceId from allowedEvidenceIds only",
        claim: "what the evidence supports",
        meaning: "how it maps to the user's question",
        limitation: "uncertainty or missing fact, otherwise null",
      },
    ],
    uncertainty: {
      level: "low | medium | high",
      reasons: ["1-5 concise reasons"],
    },
    actions: [
      {
        label: "short action label",
        detail: "concrete, non-deterministic, reversible when possible",
        horizon: "today / 7 days / 2-4 weeks etc",
        reversible: true,
      },
    ],
    realityChecks: ["signals the user can verify in real life"],
    followUps: ["safe follow-up questions"],
    safetyNotice: "cultural reference / self exploration / professional boundary",
  };
}

function buildInstructions(input: FortunePromptInput, components: ReturnType<typeof resolvePromptRelease>["components"]) {
  return [
    components.baseIdentity,
    components.factBoundary,
    components.subjectPolicy,
    components.safetyPolicy,
    components.methodModules[input.method],
    components.sceneModules[input.route.scene],
    components.serviceTierPrompts[input.serviceTier],
    input.reportMode ? components.reportTemplate : "",
    components.outputContract,
    [
      "输出契约：",
      "- 只输出一个合法 FortuneAnswer JSON 对象。",
      "- 不要输出 Markdown、代码块、解释性前后缀或多余文本。",
      "- evidenceRefs 和 interpretations[].evidenceId 只能使用 allowedEvidenceIds。",
      "- status=blocked 时不得继续命理推演；status=needs_input 时只追问必要资料。",
      "- quick/formal/deep 只影响交付深度，不改变事实边界和安全标准。",
    ].join("\n"),
  ].filter(Boolean).join("\n\n");
}

function buildUserPayload(input: FortunePromptInput) {
  return {
    task: input.reportMode ? "create_structured_deep_report" : "create_structured_chat_answer",
    question: input.question,
    serviceTier: input.serviceTier,
    method: input.method,
    route: {
      method: input.route.method,
      scene: input.route.scene,
      serviceTier: input.route.serviceTier,
      routeReason: input.route.routeReason,
      shouldCallModel: input.route.shouldCallModel,
      allowPaid: input.route.allowPaid,
      safety: input.route.safety,
    },
    answerShape: input.answerShape,
    contextSummary: input.contextSummary,
    profileMemory: input.profileMemory,
    conversationHistory: (input.conversationHistory ?? []).slice(-8).map((message) => ({
      role: message.role,
      content: compactText(message.content, 1200),
    })),
    readingEvidence: serializeEvidenceForPrompt(input.evidence),
    localDraftForFallback: input.draftAnswer,
    outputSchemaVersion: "fortuneAnswerSchema",
    outputSchema: schemaForPrompt(),
  };
}

export function composeFortunePrompt(input: FortunePromptInput): FortunePromptCompilation {
  const release = resolvePromptRelease({ cohortKey: input.userId ?? input.question });
  const userPayload = buildUserPayload(input);
  const userPayloadText = JSON.stringify(userPayload);

  return {
    instructions: buildInstructions(input, release.components),
    messages: [
      {
        role: "user",
        content: userPayloadText,
      },
    ],
    userPayloadText,
    metadataBase: {
      prompt: release.metadata,
      route: {
        method: input.route.method,
        scene: input.route.scene,
        serviceTier: input.route.serviceTier,
        routeReason: input.route.routeReason,
        shouldCallModel: input.route.shouldCallModel,
        allowPaid: input.route.allowPaid,
        safetyRiskLevel: input.route.safety.riskLevel,
        safetyCategories: input.route.safety.categories,
      },
      evidence: {
        evidencePackageId: input.evidence.evidencePackageId,
        toolSchemaVersion: input.evidence.toolSchemaVersion,
        evidenceCount: input.evidence.items.length,
        factDigest: input.evidence.factDigest,
      },
      privacy: {
        inputHash: hashSensitiveText(input.question),
        promptStored: false,
        sensitiveFieldsStored: false,
      },
    },
  };
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced?.startsWith("{") && fenced.endsWith("}")) {
    return fenced;
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  return first >= 0 && last > first ? trimmed.slice(first, last + 1) : trimmed;
}

export function parseStructuredFortuneAnswer(text: string) {
  try {
    const parsed = JSON.parse(extractJsonObject(text));
    return fortuneAnswerSchema.safeParse(parsed);
  } catch (error) {
    return {
      success: false as const,
      error,
    };
  }
}

export function validateStructuredFortuneAnswer(input: {
  answer: FortuneAnswer;
  evidence: ReadingEvidencePackage;
  serviceTier?: ServiceTier;
  route?: PromptRoute;
}) {
  const shape = fortuneAnswerSchema.safeParse(input.answer);

  if (!shape.success) {
    return {
      ok: false,
      errors: shape.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }

  const errors = [
    ...validateFortuneAnswerAgainstEvidence(shape.data, input.evidence).errors,
    ...validateFortuneAnswerSafety(shape.data),
    ...validateFortuneAnswerStatus(shape.data, input.route),
    ...validateFortuneAnswerTier({
      answer: shape.data,
      serviceTier: input.serviceTier,
      evidence: input.evidence,
    }),
  ];

  return { ok: errors.length === 0, errors };
}

function firstEvidenceRefs(evidence: ReadingEvidencePackage) {
  return evidence.allowedEvidenceIds
    .filter((id) => id !== "context.question")
    .slice(0, 4);
}

function stripLeadingVerdictLabel(value: string) {
  return value.trim().replace(/^(?:直接判断|直接结论|结论)\s*[：:]\s*/u, "");
}

function stripTrailingSentencePunctuation(value: string) {
  return value.trim().replace(/[。；;，,、：:]$/u, "");
}

export function buildDeterministicFortuneAnswer(input: {
  evidence: ReadingEvidencePackage;
  draftAnswer: string;
  method: ReadingMethod;
  serviceTier?: ServiceTier;
  status?: FortuneAnswer["status"];
  reason?: string;
}) : FortuneAnswer {
  const refs = firstEvidenceRefs(input.evidence);
  const primaryEvidence = refs[0] ?? input.evidence.allowedEvidenceIds[0] ?? "context.subject";
  const subject = input.evidence.subject.label || "本轮问题";
  const draft = extractDeterministicVerdict(input.draftAnswer);
  const userFacingReason = fallbackReasonText(input.reason);
  const methodLabel = {
    general: "问题边界",
    tarot: "牌阵证据",
    bagua: "卦象证据",
    bazi: "命盘证据",
    palm: "图片证据",
  }[input.method];
  const needsInput = input.status === "needs_input";
  const interpretationLimit = input.serviceTier === "deep" ? 3 : input.serviceTier === "formal" ? 2 : 1;
  const interpretationRefs = (refs.length > 0 ? refs : [primaryEvidence]).slice(0, interpretationLimit);
  const actions = needsInput
    ? [{
        label: input.method === "bazi" ? "补充出生资料" : "补充必要资料",
        detail: input.method === "bazi"
          ? "提供问事对象的公历出生日期、尽量准确的出生时间和出生地，再开始排盘。"
          : "补齐当前推演明确要求的信息后，再生成正式判断。",
        horizon: "准备好后",
        reversible: true,
      }]
    : [
        {
          label: "先做低成本验证",
          detail: "把结论落实成一个可观察的小动作，不做不可逆承诺。",
          horizon: "7 天内",
          reversible: true,
        },
        ...(input.serviceTier === "deep"
          ? [{
              label: "设置复盘节点",
              detail: "记录现实反馈，在预定时间按事实调整方向，不因单次推演持续加码。",
              horizon: "2-4 周",
              reversible: true,
            }]
          : []),
      ];

  return {
    status: input.status ?? "fallback",
    verdict: {
      summary: draft,
      stance: userFacingReason,
      confidence: input.method === "general" ? "medium" : "low",
    },
    evidenceRefs: refs.length > 0 ? refs : [primaryEvidence],
    interpretations: interpretationRefs.map((evidenceId) => ({
        evidenceId,
        claim: `${methodLabel}已由后端确定性工具生成。`,
        meaning: `围绕${subject}，本轮只使用证据包中已有内容给出保守解释。`,
        limitation: needsInput
          ? "必要资料尚未补齐，本轮不会生成排盘结论。"
          : "当前信息有限，本轮只给出保守判断，建议结合现实反馈继续验证。",
      })),
    uncertainty: {
      level: input.method === "general" ? "medium" : "high",
      reasons: needsInput
        ? ["必要资料尚未补齐，当前不能生成可靠的正式推演。"]
        : [
            `${userFacingReason}，不扩展证据包之外的新事实。`,
            "命理结果只适合文化参考和自我探索，需要用现实反馈验证。",
          ],
    },
    actions,
    realityChecks: needsInput
      ? ["资料补齐前不生成四柱、牌面、卦象或其他确定性结论。"]
      : [
          "观察对方或环境是否给出持续行动，而不是只看一句话。",
          "涉及医疗、法律、投资、妊娠、暴力或人身安全时，以专业与现实支持为准。",
        ],
    followUps: needsInput
      ? input.method === "bazi"
        ? ["我来补充出生信息", "不知道准确时辰怎么办", "先做不依赖八字的现实梳理"]
        : ["我来补充资料", "还缺哪些信息", "先做不依赖术数的现实梳理"]
      : ["帮我把问题收窄成可验证动作", "哪些证据最关键？", "我下一步先做什么？"],
    safetyNotice: "本回答仅供文化参考、自我探索和情绪陪伴，不替代专业建议或重大决策。",
  };
}

export function renderFortuneAnswer(answer: FortuneAnswer, input: {
  serviceTier?: ServiceTier;
  reportMode?: boolean;
  evidence?: ReadingEvidencePackage;
} = {}) {
  const confidenceLabel = { low: "低", medium: "中", high: "高" }[answer.verdict.confidence];
  const verdictSummary = stripLeadingVerdictLabel(answer.verdict.summary);
  const stance = answer.verdict.stance
    ? stripTrailingSentencePunctuation(answer.verdict.stance)
    : "";
  if (answer.status === "blocked") {
    return [
      `直接判断：${verdictSummary}`,
      answer.interpretations.map((item) => item.meaning).join("\n"),
      `现在可以做：${answer.actions.map((action) => `${action.label}：${action.detail}`).join("；")}`,
      `现实校验：${answer.realityChecks.map(stripTrailingSentencePunctuation).join("；")}`,
      answer.safetyNotice,
    ].filter(Boolean).join("\n\n");
  }

  const evidenceLines = answer.interpretations
    .slice(0, input.serviceTier === "quick" ? 2 : 6)
    .map((item) => {
      const evidenceItem = input.evidence
        ? findReadingEvidenceItem(input.evidence, item.evidenceId)
        : null;
      const trustedFact = evidenceItem
        ? `${evidenceItem.label}：${evidenceItem.summary}`
        : item.claim;
      return `- ${trustedFact}\n  解读：${item.meaning}${item.limitation ? `（${item.limitation}）` : ""}`;
    });
  const actionLines = answer.actions
    .slice(0, input.serviceTier === "quick" ? 2 : 5)
    .map((action) => `- ${action.label}：${action.detail}（${action.horizon}${action.reversible ? "，可回滚" : ""}）`);
  const sections = [
    `直接判断：${verdictSummary}`,
    stance ? `判断倾向：${stance}；信息置信度：${confidenceLabel}` : `信息置信度：${confidenceLabel}`,
    evidenceLines.length > 0 ? `关键依据：\n${evidenceLines.join("\n")}` : "",
    `不确定性：${answer.uncertainty.reasons.map(stripTrailingSentencePunctuation).join("；")}`,
    actionLines.length > 0 ? `下一步：\n${actionLines.join("\n")}` : "",
    input.serviceTier === "quick" ? "" : `现实校验：\n${answer.realityChecks.map((item) => `- ${item}`).join("\n")}`,
    answer.safetyNotice,
  ].filter(Boolean);

  if (input.reportMode) {
    return sections.join("\n\n");
  }

  return sections.join("\n\n");
}

export function composeRepairPrompt(input: {
  compilation: FortunePromptCompilation;
  validationErrors: string[];
  allowedEvidenceIds: string[];
  previousOutput: string;
}) {
  return {
    instructions: input.compilation.instructions,
    messages: [
      ...input.compilation.messages,
      {
        role: "assistant" as const,
        content: input.previousOutput.slice(0, 6000),
      },
      {
        role: "user" as const,
        content: buildRepairTemplate({
          validationErrors: input.validationErrors,
          allowedEvidenceIds: input.allowedEvidenceIds,
          previousOutput: input.previousOutput,
        }),
      },
    ] satisfies ModelMessage[],
  };
}

export function buildPromptRunMetadata(input: {
  compilation: FortunePromptCompilation;
  validation: PromptValidationSummary;
}): PromptRunMetadata {
  return {
    ...input.compilation.metadataBase,
    validation: input.validation,
  };
}
