import "server-only";

import type { ChatServiceMode } from "@/lib/chat-service";
import type {
  ReadingEvidenceItem,
  ReadingEvidencePackage,
  ReadingMethod,
} from "@/lib/prompts";
import { getChatOpenAIModel } from "@/lib/openai-client";

export const answerQualityContractVersion = "answer-quality-2026-07-27.1" as const;

export type AnswerTopic =
  | "career"
  | "relationship"
  | "wealth"
  | "wellbeing"
  | "general";

export type AnswerRequirements = {
  contractVersion: typeof answerQualityContractVersion;
  answerKind: "direct" | "missing_input" | "decision" | "reading" | "safety";
  topic: AnswerTopic;
  serviceMode: ChatServiceMode;
  directQuestion: string;
  decisionOptions: string[];
  requiredEvidenceIds: string[];
  unavailableRequiredEvidenceIds: string[];
  minEvidence: number;
  maxEvidence: number;
  minActions: number;
  maxActions: number;
  maxVisibleChars: number;
  requireEvidenceLinks: boolean;
  requireExplicitUncertainty: boolean;
  allowDirectionalVerdict: boolean;
  successCriteria: string[];
};

export type EvidencePriorityReason =
  | "explicit_user_reference"
  | "question_topic"
  | "method_core"
  | "current_timing"
  | "supporting_context";

export type RankedEvidence = {
  item: ReadingEvidenceItem;
  rank: number;
  score: number;
  required: boolean;
  reasons: EvidencePriorityReason[];
};

export type ChatModelPolicy = {
  model: string;
  reasoningEffort: "max";
  maxOutputTokens: number;
  historyCharBudget: number;
  maxHistoryMessages: number;
  maxVisibleChars: number;
};

type ChatModelEnvironment = Record<string, string | undefined>;

const methodCoreScore: Record<ReadingEvidenceItem["kind"], number> = {
  context: 5,
  subject_boundary: 10,
  tarot_spread: 30,
  tarot_card: 110,
  bagua_hexagram: 90,
  bagua_moving_line: 140,
  bazi_pillars: 70,
  bazi_wuxing: 100,
  bazi_day_master: 115,
  bazi_luck: 125,
  palm_image: 80,
  palm_signal: 110,
};

function compactText(value: string, maxLength: number) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, Math.max(1, maxLength - 3))}...`;
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function hasOptionScopedEvidence(
  decisionOptions: readonly string[],
  evidence: ReadingEvidencePackage,
) {
  if (decisionOptions.length < 2) return false;
  const optionLabels = ["A", "B", "C", "D"];

  return decisionOptions.slice(0, 4).every((_, index) => {
    const label = optionLabels[index];
    if (!label) return false;
    const optionPattern = new RegExp(`(?:选项|方案)\\s*${label}|${label}\\s*(?:选项|方案)`, "i");
    return evidence.items.some((item) =>
      optionPattern.test([item.label, item.summary, ...item.allowedTerms].join(" "))
    );
  });
}

export function detectAnswerTopic(question: string): AnswerTopic {
  if (/事业|职业|工作|岗位|offer|公司|创业|合伙|晋升|跳槽/i.test(question)) return "career";
  if (/感情|关系|婚恋|婚姻|伴侣|复合|对方|约会/.test(question)) return "relationship";
  if (/财富|财运|收入|薪资|工资|投资|现金流|预算|债务/.test(question)) return "wealth";
  if (/健康|身体|睡眠|情绪|压力|作息|恢复/.test(question)) return "wellbeing";
  return "general";
}

function requiredEvidenceIds(question: string) {
  const required: string[] = [];
  if (/动爻|变爻|爻辞/.test(question)) required.push("bagua.moving");

  const tarotOrdinal = question.match(/第\s*([一二三四五六七八九十\d]+)\s*张/)?.[1];
  if (tarotOrdinal) {
    const ordinalMap: Record<string, number> = {
      一: 1, 二: 2, 三: 3, 四: 4, 五: 5,
      六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
    };
    const index = Number.parseInt(tarotOrdinal, 10) || ordinalMap[tarotOrdinal] || 0;
    if (index > 0) required.push(`tarot.card.${index}`);
  }

  return required;
}

export function resolveChatModelPolicy(
  serviceMode: ChatServiceMode,
  env: ChatModelEnvironment = process.env,
): ChatModelPolicy {
  const model = getChatOpenAIModel(env);

  if (serviceMode === "quick") {
    return {
      model,
      reasoningEffort: "max",
      maxOutputTokens: 3000,
      historyCharBudget: 8000,
      maxHistoryMessages: 12,
      maxVisibleChars: 520,
    };
  }

  if (serviceMode === "deep") {
    return {
      model,
      reasoningEffort: "max",
      maxOutputTokens: 7500,
      historyCharBudget: 22000,
      maxHistoryMessages: 28,
      maxVisibleChars: 2600,
    };
  }

  return {
    model,
    reasoningEffort: "max",
    maxOutputTokens: 5000,
    historyCharBudget: 14000,
    maxHistoryMessages: 20,
    maxVisibleChars: 1500,
  };
}

export function buildAnswerRequirements(input: {
  question: string;
  answerKind: AnswerRequirements["answerKind"];
  serviceMode: ChatServiceMode;
  method: ReadingMethod;
  decisionOptions?: string[];
  evidence: ReadingEvidencePackage;
  conversationHistory?: readonly { role: "user" | "assistant"; content: string }[];
}): AnswerRequirements {
  const substantiveEvidence = input.evidence.items.filter((item) =>
    item.kind !== "context" && item.kind !== "subject_boundary"
  );
  const policy = resolveChatModelPolicy(input.serviceMode);
  const historicalUserText = (input.conversationHistory ?? [])
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n");
  const currentTopic = detectAnswerTopic(input.question);
  const topic = currentTopic === "general"
    ? detectAnswerTopic(historicalUserText)
    : currentTopic;
  const requestedVisibleLimits = Array.from(
    `${historicalUserText}\n${input.question}`.matchAll(/(?:回答|回复|最终回答|最终回复)?[^\d\n]{0,8}(?:不超过|最多|控制在)\s*(\d{2,4})\s*(?:个)?字/g),
    (match) => Number.parseInt(match[1] ?? "", 10),
  ).filter((value) => Number.isFinite(value) && value >= 80);
  const maxVisibleChars = Math.min(policy.maxVisibleChars, ...requestedVisibleLimits);
  const requestedRequiredIds = requiredEvidenceIds(input.question);
  if (
    input.serviceMode === "deep" &&
    input.method === "tarot" &&
    /三个月|未来.{0,8}(?:月|阶段)|行动节奏/.test(input.question)
  ) {
    const usesThreeMonthSpread = ["tarot.card.1", "tarot.card.2", "tarot.card.3"].every(
      (evidenceId) => input.evidence.allowedEvidenceIds.includes(evidenceId),
    ) && !input.evidence.allowedEvidenceIds.includes("tarot.card.10");
    requestedRequiredIds.push(
      ...(usesThreeMonthSpread
        ? ["tarot.card.1", "tarot.card.2", "tarot.card.3"]
        : ["tarot.card.6", "tarot.card.10"]),
    );
  }
  const requiredIds = requestedRequiredIds.filter((evidenceId) =>
    input.evidence.allowedEvidenceIds.includes(evidenceId)
  );
  const unavailableRequiredIds = requestedRequiredIds.filter((evidenceId) =>
    !input.evidence.allowedEvidenceIds.includes(evidenceId)
  );
  const isEvidenceAnswer = input.answerKind === "reading" || input.answerKind === "decision";
  const focusesSingleTarotCard = input.method === "tarot" && /第[一二三四五六七八九十\d]+张/.test(input.question);
  const minEvidence = isEvidenceAnswer && substantiveEvidence.length > 0
    ? Math.min(
        substantiveEvidence.length,
        focusesSingleTarotCard
          ? 1
          : input.serviceMode === "deep" ? 3 : input.serviceMode === "formal" ? 2 : 1,
      )
    : 0;
  const maxEvidence = focusesSingleTarotCard
    ? 2
    : input.serviceMode === "quick" ? 2 : input.serviceMode === "deep" ? 6 : 4;
  const asksForAction = /怎么|如何|下一步|先做|调整|选择|选哪个|验证|建议/.test(input.question);
  const requiresPhasedActionPlan =
    input.answerKind === "reading" &&
    input.serviceMode === "deep" &&
    input.method === "tarot" &&
    /三个月|未来.{0,8}(?:月|阶段)|行动节奏/.test(input.question);
  const minActions = requiresPhasedActionPlan
    ? 3
    : input.answerKind === "decision" || input.answerKind === "reading" || asksForAction
      ? input.serviceMode === "deep" ? 2 : 1
    : 0;
  const allowDirectionalVerdict = input.answerKind !== "decision" || hasOptionScopedEvidence(
    input.decisionOptions ?? [],
    input.evidence,
  );

  return {
    contractVersion: answerQualityContractVersion,
    answerKind: input.answerKind,
    topic,
    serviceMode: input.serviceMode,
    directQuestion: compactText(input.question, 420),
    decisionOptions: unique((input.decisionOptions ?? []).map((item) => compactText(item, 120))).slice(0, 4),
    requiredEvidenceIds: requiredIds,
    unavailableRequiredEvidenceIds: unavailableRequiredIds,
    minEvidence,
    maxEvidence,
    minActions,
    maxActions: requiresPhasedActionPlan
      ? 3
      : input.serviceMode === "quick" ? 1 : input.serviceMode === "deep" ? 6 : 3,
    maxVisibleChars,
    requireEvidenceLinks: isEvidenceAnswer && substantiveEvidence.length > 0,
    requireExplicitUncertainty: isEvidenceAnswer,
    allowDirectionalVerdict,
    successCriteria: [
      "开头直接回应当前问题，不复述任务或处理过程。",
      "每个命理解读都引用真实 evidenceId，事实与解释可追溯。",
      ...(unavailableRequiredIds.length > 0
        ? [`控制器缺少本轮必需证据：${unavailableRequiredIds.join("、")}；本轮不得伪装成证据齐全。`]
        : []),
      "没有足够比较依据时不偏向任一选项，改为说明改判条件和验证动作。",
      "行动建议必须贴合用户明确主题，并且具体、低成本、可观察。",
      ...(requiresPhasedActionPlan
        ? ["行动必须恰好分成三段，清晰覆盖未来 7 天、第 2-4 周和第三个月复盘，不得把三个阶段塞进同一条行动。"]
        : []),
      `最终可见回答不超过 ${maxVisibleChars} 个字符，且不靠重复模板凑深度。`,
    ],
  };
}

function topicScore(topic: AnswerTopic, item: ReadingEvidenceItem) {
  if (topic === "career") {
    if (item.kind === "bazi_luck") return 55;
    if (item.kind === "bazi_day_master" || item.kind === "bazi_wuxing") return 35;
  }
  if (topic === "relationship" && (item.kind === "tarot_card" || item.kind === "bagua_moving_line")) {
    return 35;
  }
  if (topic === "wellbeing" && item.kind === "palm_signal") return 30;
  return 0;
}

export function rankEvidenceForAnswer(input: {
  question: string;
  evidence: ReadingEvidencePackage;
  topic?: AnswerTopic;
  serviceMode?: ChatServiceMode;
}): RankedEvidence[] {
  const topic = input.topic ?? detectAnswerTopic(input.question);
  const explicitIds = requiredEvidenceIds(input.question);
  const currentYear = String(new Date().getFullYear());

  return input.evidence.items
    .map((item, originalIndex) => {
      const reasons: EvidencePriorityReason[] = [];
      let score = methodCoreScore[item.kind] - originalIndex;
      const searchable = [item.label, item.summary, ...item.allowedTerms].join(" ");
      const required = explicitIds.includes(item.evidenceId);

      if (required) {
        score += 1000;
        reasons.push("explicit_user_reference");
      }
      const topical = topicScore(topic, item);
      if (topical > 0) {
        score += topical;
        reasons.push("question_topic");
      }
      if (methodCoreScore[item.kind] >= 70) reasons.push("method_core");
      if ((/今年|本年|当前|流年/.test(input.question) || input.question.includes(currentYear)) &&
        (item.kind === "bazi_luck" || searchable.includes(currentYear))) {
        score += 80;
        reasons.push("current_timing");
      }
      if (reasons.length === 0) reasons.push("supporting_context");

      return { item, score, required, reasons, rank: 0 } satisfies RankedEvidence;
    })
    .sort((left, right) => right.score - left.score)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function selectModelConversationHistory<T extends { role: "user" | "assistant"; content: string }>(
  history: readonly T[],
  policy: Pick<ChatModelPolicy, "historyCharBudget" | "maxHistoryMessages">,
) {
  const selected: Array<{ role: T["role"]; content: string; sourceIndex: number }> = [];
  let remaining = policy.historyCharBudget;

  for (let index = history.length - 1; index >= 0 && selected.length < policy.maxHistoryMessages; index -= 1) {
    const message = history[index];
    if (!message) continue;
    const content = compactText(message.content, 1800);
    if (!content) continue;
    if (content.length > remaining && selected.length >= 4) continue;
    const bounded = compactText(content, Math.max(160, remaining));
    selected.push({ role: message.role, content: bounded, sourceIndex: index });
    remaining -= bounded.length;
    if (remaining <= 160) break;
  }

  const firstUserIndex = history.findIndex((message) => message.role === "user" && message.content.trim());
  if (firstUserIndex >= 0 && !selected.some((message) => message.sourceIndex === firstUserIndex)) {
    const firstUser = history[firstUserIndex]!;
    selected.push({
      role: firstUser.role,
      content: compactText(firstUser.content, 600),
      sourceIndex: firstUserIndex,
    });
  }

  return selected
    .sort((left, right) => left.sourceIndex - right.sourceIndex)
    .map(({ role, content }) => ({ role, content }));
}
