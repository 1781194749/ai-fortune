import "server-only";

import { z } from "zod";
import type {
  ChatAnswerShape,
  ChatConclusion,
} from "@/lib/ai-orchestrator";
import type {
  FortuneAnswer,
  ReadingEvidencePackage,
  ServiceTier,
} from "@/lib/prompts";

const text = (max: number) => z.string().trim().min(1).max(max);

const directAnswerSchema = z.object({
  kind: z.literal("direct"),
  answer: text(1800),
  followUp: text(160).nullable(),
}).strict();

const missingInputAnswerSchema = z.object({
  kind: z.literal("missing_input"),
  question: text(420),
  missingFields: z.array(text(80)).min(1).max(5),
  knownInformation: z.array(text(180)).max(5),
  whyNeeded: text(260),
}).strict();

const decisionAnswerSchema = z.object({
  kind: z.literal("decision"),
  verdict: text(420),
  optionAnalysis: z.array(z.object({
    option: text(120),
    assessment: text(420),
    evidenceId: text(120).nullable(),
  }).strict()).max(4),
  reasons: z.array(z.object({
    text: text(360),
    evidenceId: text(120).nullable(),
  }).strict()).min(1).max(5),
  mainRisk: text(320),
  actions: z.array(text(320)).min(1).max(5),
  changeConditions: z.array(text(260)).max(4),
  disclaimer: text(260).nullable(),
}).strict();

const readingAnswerSchema = z.object({
  kind: z.literal("reading"),
  verdict: text(500),
  evidence: z.array(z.object({
    evidenceId: text(120),
    fact: text(300),
    interpretation: text(520),
  }).strict()).min(1).max(12),
  uncertainty: text(320),
  actions: z.array(text(320)).min(1).max(6),
  followUps: z.array(text(140)).max(4),
  disclaimer: text(260).nullable(),
}).strict();

const safetyAnswerSchema = z.object({
  kind: z.literal("safety"),
  answer: text(1200),
  resources: z.array(text(260)).max(5),
}).strict();

const answerKindSchema = z.enum([
  "direct",
  "missing_input",
  "decision",
  "reading",
  "safety",
]);
export type AgentAnswerKind = z.infer<typeof answerKindSchema>;

const detailSchema = z.object({
  evidenceId: text(120).nullable().describe("对应的真实 evidenceId；非证据项填 null。"),
  label: text(300).describe("选项名、证据事实或小标题。"),
  content: text(520).describe("对应的判断、解释或内容。"),
}).strict();

const readingDetailSchema = detailSchema.extend({
  evidenceId: text(120).describe("必须引用控制器提供的真实 evidenceId。"),
  label: text(300).describe("必须原样复制该 evidenceId 对应的控制器证据 label，不得改写或概括。"),
}).strict();

const reasonSchema = z.object({
  evidenceId: text(120).nullable().describe("支持这条依据的真实 evidenceId；现实比较依据填 null。"),
  text: text(360).describe("简洁、可核验的依据。"),
}).strict();

/**
 * Model-facing schema. Keep this as one ordinary object: some Responses API
 * compatible gateways reject discriminated unions/oneOf even when every
 * branch is valid JSON Schema. Unused fields are represented by null or [].
 * Kind-specific requirements are enforced by decodeAgentAnswer below.
 */
const agentAnswerPayloadFields = {
    version: z.literal("answer-v3"),
    primary: text(1800).describe("direct/safety 的正文、missing_input 的追问，或 decision/reading 的结论。"),
    secondary: text(360).nullable().describe("missing_input 的必要性、decision 的主要风险、reading 的不确定性；其他类型填 null。"),
    details: z.array(detailSchema).max(12).describe("decision 的选项分析或 reading 的证据解释；其他类型填 []。"),
    reasons: z.array(reasonSchema).max(5).describe("decision 的关键依据；其他类型填 []。"),
    actions: z.array(text(320)).max(6).describe("decision/reading 的下一步，或 safety 的支持资源；其他类型填 []。"),
    fields: z.array(text(80)).max(5).describe("missing_input 实际缺少的字段；其他类型填 []。"),
    known: z.array(text(180)).max(5).describe("missing_input 已确认的信息；其他类型填 []。"),
    followUps: z.array(text(260)).max(4).describe("direct 的具体下一步、reading 的后续问题、decision 的改判条件；不需要时填 []。"),
    disclaimer: text(260).nullable().describe("decision/reading 必要时的边界说明；其他类型填 null。"),
};

export const agentAnswerSchema = z.object({
  answer: z.object({
    kind: answerKindSchema,
    ...agentAnswerPayloadFields,
  }).strict(),
}).strict();

export function agentAnswerSchemaForKinds(
  kinds: readonly [AgentAnswerKind, ...AgentAnswerKind[]],
) {
  const onlyKind = kinds.length === 1 ? kinds[0] : null;
  const payloadFields = {
    ...agentAnswerPayloadFields,
    ...(onlyKind === "reading"
      ? {
          secondary: text(360).describe("明确说明不确定性和现实影响因素。"),
          details: z.array(readingDetailSchema).min(1).max(12)
            .describe("至少一条基于真实 evidenceId 的证据解释。"),
          actions: z.array(text(320)).min(1).max(6)
            .describe("至少一条具体、可观察的下一步。"),
        }
      : {}),
    ...(onlyKind === "decision"
      ? {
          secondary: text(360).describe("当前判断的主要风险。"),
          reasons: z.array(reasonSchema).min(1).max(5)
            .describe("至少一条关键依据。命理依据必须引用真实 evidenceId。"),
          actions: z.array(text(320)).min(1).max(6)
            .describe("至少一条低成本、可验证的下一步。"),
        }
      : {}),
    ...(onlyKind === "missing_input"
      ? {
          secondary: text(360).describe("解释为什么只需要补这些字段。"),
          fields: z.array(text(80)).min(1).max(5)
            .describe("只列实际缺失的字段。"),
        }
      : {}),
  };

  return z.object({
    answer: z.object({
      kind: z.enum([...kinds] as [AgentAnswerKind, ...AgentAnswerKind[]]),
      ...payloadFields,
    }).strict(),
  }).strict();
}

export type AgentAnswer =
  | z.infer<typeof directAnswerSchema>
  | z.infer<typeof missingInputAnswerSchema>
  | z.infer<typeof decisionAnswerSchema>
  | z.infer<typeof readingAnswerSchema>
  | z.infer<typeof safetyAnswerSchema>;

export type AgentAnswerV3 = AgentAnswer;

export type AgentAnswerOutput = z.infer<typeof agentAnswerSchema>;

export function decodeAgentAnswer(output: AgentAnswerOutput): AgentAnswer {
  const value = output.answer;

  if (value.kind === "direct") {
    return directAnswerSchema.parse({
      kind: value.kind,
      answer: value.primary,
      followUp: value.followUps[0]?.slice(0, 160) ?? null,
    });
  }

  if (value.kind === "missing_input") {
    return missingInputAnswerSchema.parse({
      kind: value.kind,
      question: value.primary.slice(0, 420),
      missingFields: value.fields,
      knownInformation: value.known,
      whyNeeded: value.secondary?.slice(0, 260) ?? null,
    });
  }

  if (value.kind === "decision") {
    return decisionAnswerSchema.parse({
      kind: value.kind,
      verdict: value.primary.slice(0, 420),
      optionAnalysis: value.details.slice(0, 4).map((item) => ({
        option: item.label.slice(0, 120),
        assessment: item.content.slice(0, 420),
        evidenceId: item.evidenceId,
      })),
      reasons: value.reasons,
      mainRisk: value.secondary?.slice(0, 320) ?? null,
      actions: value.actions.slice(0, 5),
      changeConditions: value.followUps,
      disclaimer: value.disclaimer,
    });
  }

  if (value.kind === "reading") {
    return readingAnswerSchema.parse({
      kind: value.kind,
      verdict: value.primary.slice(0, 500),
      evidence: value.details.map((item) => ({
        evidenceId: item.evidenceId,
        fact: item.label,
        interpretation: item.content,
      })).filter((item): item is typeof item & { evidenceId: string } => Boolean(item.evidenceId)),
      uncertainty: value.secondary?.slice(0, 320) ?? null,
      actions: value.actions,
      followUps: value.followUps.map((item) => item.slice(0, 140)),
      disclaimer: value.disclaimer,
    });
  }

  return safetyAnswerSchema.parse({
    kind: value.kind,
    answer: value.primary.slice(0, 1200),
    resources: value.actions.slice(0, 5),
  });
}

const cultureDisclaimer = "以上内容仅供文化参考、自我探索和情绪陪伴，不替代医疗、法律、投资等专业意见或重大决策。";

function sentence(value: string) {
  const normalized = value.trim();
  return /[。！？!?]$/.test(normalized) ? normalized : `${normalized}。`;
}

function directVerdict(value: string) {
  const normalized = value.trim();
  if (/^直接判断[：:]/.test(normalized)) return normalized;
  if (/^(?:直接看|结论)[：:]/.test(normalized)) {
    return normalized.replace(/^(?:直接看|结论)[：:]\s*/, "直接判断：");
  }
  return `直接判断：${normalized}`;
}

function renderNextStep(value: string) {
  const normalized = value.trim();
  if (/^下一步[：:]/.test(normalized)) return normalized;
  if (/^下一步/.test(normalized)) {
    return `下一步：${sentence(normalized.replace(/^下一步[，,、\s]*/, ""))}`;
  }
  if (/^接下来[：:]/.test(normalized)) {
    return normalized.replace(/^接下来[：:]\s*/, "下一步：");
  }
  return `下一步：${sentence(normalized)}`;
}

export function renderAgentAnswer(
  answer: AgentAnswer,
  options: { serviceTier?: ServiceTier; focusedReading?: boolean } = {},
) {
  if (answer.kind === "direct") {
    const paragraphs = answer.answer
      .split(/\n{2,}/)
      .map((item) => item.trim())
      .filter(Boolean);
    const inferredFollowUp = !answer.followUp && paragraphs.length > 1 &&
      /^(?:你可以|可以|先|请|建议|接下来|如果你)/.test(paragraphs.at(-1) ?? "")
      ? paragraphs.pop() ?? null
      : null;
    const followUpText = answer.followUp ?? inferredFollowUp;
    const followUp = followUpText
      ? renderNextStep(followUpText)
      : "";
    return [directVerdict(paragraphs.join("\n\n")), followUp].filter(Boolean).join("\n\n");
  }

  if (answer.kind === "missing_input") {
    return answer.question;
  }

  if (answer.kind === "safety") {
    return [
      answer.answer,
      answer.resources.length > 0 ? answer.resources.map((item) => `- ${item}`).join("\n") : "",
    ].filter(Boolean).join("\n\n");
  }

  if (answer.kind === "decision") {
    const optionLines = answer.optionAnalysis.length > 0
      ? answer.optionAnalysis.map((item) => `- ${item.option}：${item.assessment}`).join("\n")
      : "";
    const uniqueReasons = answer.reasons.filter((reason) =>
      !answer.optionAnalysis.some((option) => {
        const assessment = option.assessment.trim();
        const reasonText = reason.text.trim();
        return assessment === reasonText || assessment.includes(reasonText) || reasonText.includes(assessment);
      })
    );
    const reasons = uniqueReasons.map((item) => `- ${item.text}`).join("\n");
    const actions = answer.actions.map((item) => `- ${item}`).join("\n");
    if (options.serviceTier === "quick") {
      return [
        directVerdict(answer.verdict),
        optionLines,
        uniqueReasons[0] ? `关键依据：${uniqueReasons[0].text}` : "",
        answer.actions[0] ? renderNextStep(answer.actions[0]) : "",
      ].filter(Boolean).join("\n\n");
    }
    const conditions = answer.changeConditions.length > 0
      ? `如果出现这些情况，需要改判：\n${answer.changeConditions.map((item) => `- ${item}`).join("\n")}`
      : "";
    const comparison = optionLines && reasons
      ? `选项对比：\n${optionLines}`
      : "";
    const keyReasons = reasons || optionLines;
    return [
      directVerdict(answer.verdict),
      comparison,
      keyReasons ? `关键依据：\n${keyReasons}` : "",
      `主要风险：${answer.mainRisk}`,
      `下一步：\n${actions}`,
      "现实校验：先用低成本、可逆的小范围行动验证关键假设，再根据真实反馈调整选择。",
      conditions,
      answer.disclaimer,
    ].filter(Boolean).join("\n\n");
  }

  if (options.serviceTier === "quick") {
    return [
      directVerdict(answer.verdict),
      answer.evidence.length > 0
        ? `关键依据：\n${answer.evidence.slice(0, 2).map((item) => `- ${item.fact}：${item.interpretation}`).join("\n")}`
        : "",
      answer.actions[0] ? renderNextStep(answer.actions[0]) : "",
      answer.disclaimer ?? cultureDisclaimer,
    ].filter(Boolean).join("\n\n");
  }

  if (options.focusedReading) {
    return [
      directVerdict(answer.verdict),
      answer.evidence.length > 0
        ? `关键依据：\n${answer.evidence.slice(0, 2).map((item) => `- ${item.fact}\n  ${item.interpretation}`).join("\n")}`
        : "",
      answer.actions[0] ? renderNextStep(answer.actions[0]) : "",
    ].filter(Boolean).join("\n\n");
  }

  return [
    directVerdict(answer.verdict),
    `关键依据：\n${answer.evidence.map((item) => `- ${item.fact}\n  ${item.interpretation}`).join("\n")}`,
    `不确定性：${answer.uncertainty}`,
    `下一步：\n${answer.actions.map((item) => `- ${item}`).join("\n")}`,
    "现实校验：用接下来真实发生的行动、反馈和结果校验本轮解读。",
    answer.followUps.length > 0
      ? `可以继续问：${answer.followUps.join("；")}`
      : "",
    answer.disclaimer ?? cultureDisclaimer,
  ].filter(Boolean).join("\n\n");
}

export function agentAnswerShape(answer: AgentAnswer): ChatAnswerShape {
  if (answer.kind === "missing_input") return "missing_info";
  if (answer.kind === "safety") return "safety_boundary";
  if (answer.kind === "decision") return "decision_ab";
  if (answer.kind === "reading") return "single_reading";
  return "general_clarify";
}

export function agentAnswerStatus(answer: AgentAnswer): FortuneAnswer["status"] {
  if (answer.kind === "missing_input") return "needs_input";
  if (answer.kind === "safety") return "blocked";
  return "ok";
}

function compatibleAction(item: string, index: number, missingInput: boolean) {
  const sevenDay = item.match(/^未来\s*7\s*天[：:]\s*(.+)$/);
  if (sevenDay) {
    return { label: "未来 7 天", detail: sevenDay[1], horizon: "未来 7 天" };
  }

  const secondStage = item.match(/^第二阶段(?:（([^）]+)）)?[：:]\s*(.+)$/);
  if (secondStage) {
    return {
      label: "第二阶段",
      detail: secondStage[2],
      horizon: secondStage[1] ?? "第二阶段",
    };
  }

  const thirdMonth = item.match(/^第三个月复盘[：:]\s*(.+)$/);
  if (thirdMonth) {
    return { label: "第三个月复盘", detail: thirdMonth[1], horizon: "第三个月" };
  }

  return {
    label: index === 0 ? "下一步" : `行动 ${index + 1}`,
    detail: item,
    horizon: missingInput ? "补充资料后" : "近期",
  };
}

function actionIsReversible(item: string) {
  const irreversibleAction = /(?:辞职|离职|裸辞|签约|签合同|付款|转账|购买|下单|接受\s*offer|正式入职|结婚|离婚|分手|复合|起诉|投资|借款|贷款)/i
    .test(item);
  const explicitlyDeferred = /(?:不要|暂不|先不|避免|仅|只做|核实|收集|评估|比较|试做|小范围|草案|模拟|咨询|观察|设定条件)/
    .test(item);
  return !irreversibleAction || explicitlyDeferred;
}

export function toCompatibleFortuneAnswer(
  answer: AgentAnswer,
  evidence?: ReadingEvidencePackage,
  serviceTier: ServiceTier = "formal",
): FortuneAnswer {
  const status = agentAnswerStatus(answer);
  const verdict = answer.kind === "direct" || answer.kind === "safety"
    ? answer.answer
    : answer.kind === "missing_input"
      ? answer.question
      : answer.verdict;
  const availableEvidence = evidence?.items ?? [];
  const substantiveEvidence = availableEvidence.filter((item) =>
    item.kind !== "context" && item.kind !== "subject_boundary"
  );
  const contextEvidenceId = availableEvidence.find((item) => item.evidenceId === "context.question")
    ?.evidenceId ?? availableEvidence[0]?.evidenceId ?? "context.question";
  const answerEvidence = answer.kind === "reading"
    ? answer.evidence
    : answer.kind === "decision"
      ? [
          ...answer.optionAnalysis.map((item) => ({
            fact: `选项：${item.option}`,
            interpretation: item.assessment,
            evidenceId: item.evidenceId ?? contextEvidenceId,
          })),
          ...answer.reasons.map((item) => ({
            fact: "决策依据",
            interpretation: item.text,
            evidenceId: item.evidenceId ?? contextEvidenceId,
          })),
        ]
      : [{ fact: "当前问题", interpretation: verdict, evidenceId: contextEvidenceId }];
  const compatibleEvidence = answerEvidence;
  const actions = answer.kind === "reading" || answer.kind === "decision"
    ? answer.actions
    : answer.kind === "missing_input"
      ? [answer.question]
      : answer.kind === "safety"
        ? [answer.resources[0] ?? "优先联系可信赖的人或专业支持。"]
        : [answer.followUp ?? "如需更具体的建议，可以补充目标、限制和时间范围。"];
  const followUps = answer.kind === "reading"
    ? answer.followUps
    : answer.kind === "direct"
      ? [answer.followUp ?? "你还想继续了解哪一部分？"]
      : answer.kind === "missing_input"
        ? [`补充${answer.missingFields.join("、")}`]
        : answer.kind === "decision"
          ? ["帮我细化下一步验证", "哪些情况会改变结论？"]
          : ["我现在可以先做什么？"];
  const uncertainty = answer.kind === "reading"
    ? answer.uncertainty
    : answer.kind === "decision"
      ? answer.mainRisk
      : answer.kind === "missing_input"
        ? answer.whyNeeded
      : "具体情境和后续事实可能改变建议。";
  const compatibleActions = actions;
  const interpretationLimit = serviceTier === "quick" ? 2 : 10;
  const actionLimit = serviceTier === "quick" ? 1 : 6;

  return {
    status,
    verdict: {
      summary: verdict.slice(0, 220),
      stance: answer.kind === "decision" ? "基于当前信息的阶段性判断" : null,
      confidence: answer.kind === "reading" || answer.kind === "decision" ? "medium" : "low",
    },
    evidenceRefs: compatibleEvidence
      .map((item) => item.evidenceId)
      .filter((item, index, items) => items.indexOf(item) === index)
      .slice(0, 16),
    interpretations: compatibleEvidence.slice(0, interpretationLimit).map((item) => ({
      evidenceId: item.evidenceId,
      claim: item.fact.slice(0, 360),
      meaning: item.interpretation.slice(0, 360),
      limitation: null,
    })),
    uncertainty: {
      level: answer.kind === "reading" || answer.kind === "decision" ? "medium" : "high",
      reasons: [uncertainty.slice(0, 180)],
    },
    actions: compatibleActions.slice(0, actionLimit).map((item, index) => {
      const action = compatibleAction(item, index, answer.kind === "missing_input");
      return {
        ...action,
        detail: action.detail.slice(0, 260),
        reversible: answer.kind !== "missing_input" && actionIsReversible(item),
      };
    }),
    realityChecks: [
      answer.kind === "reading"
        ? "用接下来真实发生的行动、反馈和结果校验本轮解读。"
        : "以现实信息和可观察结果持续校验当前判断。",
      ...(serviceTier === "deep" && substantiveEvidence.length > 0
        ? ["在两到四周后复盘一次；如果出现相反证据，就及时调整原判断。"]
        : []),
    ],
    followUps: (followUps.length > 0 ? followUps : ["继续说明你的具体问题"])
      .slice(0, 5)
      .map((item) => item.slice(0, 80)),
    safetyNotice: answer.kind === "direct"
      ? "以上为一般信息与现实问题梳理。"
      : answer.kind === "safety"
        ? "涉及人身安全或紧急风险时，请优先联系当地紧急服务和可信赖的人。"
        : answer.kind === "missing_input"
          ? "资料补齐前不会编造正式推演结果。"
          : answer.disclaimer ?? cultureDisclaimer,
  };
}

export function buildAgentConclusion(answer: AgentAnswer): ChatConclusion {
  if (answer.kind === "decision") {
    return {
      verdict: answer.verdict,
      reasons: answer.reasons.slice(0, 3).map((item) => item.text),
      risk: answer.mainRisk,
      nextStep: answer.actions[0],
      followUps: ["帮我细化下一步验证", ...answer.changeConditions].slice(0, 4),
    };
  }

  if (answer.kind === "reading") {
    return {
      verdict: answer.verdict,
      reasons: answer.evidence.slice(0, 3).map((item) => `${item.fact}：${item.interpretation}`),
      risk: answer.uncertainty,
      nextStep: answer.actions[0],
      followUps: answer.followUps.length > 0 ? answer.followUps : ["我下一步先验证什么？"],
    };
  }

  if (answer.kind === "missing_input") {
    return {
      verdict: answer.question,
      reasons: [answer.whyNeeded, ...answer.knownInformation].slice(0, 3),
      risk: "缺少必要资料时继续推演会产生错误结论。",
      nextStep: `补充：${answer.missingFields.join("、")}`,
      followUps: ["我来补充资料"],
    };
  }

  const plainAnswer = answer.answer;
  return {
    verdict: sentence(plainAnswer).slice(0, 500),
    reasons: [],
    risk: answer.kind === "safety" ? "当前问题涉及需要优先处理的现实安全风险。" : "具体情境可能改变建议。",
    nextStep: answer.kind === "safety"
      ? answer.resources[0] ?? "优先联系可信赖的人或专业支持。"
      : answer.followUp ?? "补充具体目标和限制后可以继续细化。",
    followUps: answer.kind === "direct" && answer.followUp ? [answer.followUp] : [],
  };
}
