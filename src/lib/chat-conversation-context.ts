import "server-only";

import type { ChatConversationMessage } from "@/lib/ai-session-store";
import {
  selectModelConversationHistory,
  type ChatModelPolicy,
} from "@/lib/chat-answer-quality";

export type ChatConversationContextPolicy = Pick<
  ChatModelPolicy,
  "historyCharBudget" | "maxHistoryMessages"
>;

export type ChatConversationContextMessage = Pick<
  ChatConversationMessage,
  "role" | "content"
>;

export type DurableChatConversationContext = {
  messages: ChatConversationContextMessage[];
  sourceMessageCount: number;
  recentTurnCount: number;
  summarizedToolConclusionCount: number;
  characterCount: number;
};

export type BuildDurableChatConversationContextInput = {
  history: readonly ChatConversationMessage[];
  policy: ChatConversationContextPolicy;
};

type IndexedConversationMessage = ChatConversationContextMessage & {
  sourceIndex: number;
};

type CompleteConversationTurn = {
  user: IndexedConversationMessage;
  assistant: IndexedConversationMessage;
};

type ToolConclusionSummary = {
  category: string;
  sourceIndex: number;
  content: string;
};

const internalIdentifierPattern = /\b(?:profile_reader|tarot_spread_generator|bazi_calculator|bagua_generator|palm_image_checker|intent_classifier)\b/gi;
const internalCodePattern = /\b(?:MODEL|TOOL)_[A-Z0-9_]+\b/g;
const internalSnakeCasePattern = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gi;
const constraintPattern = /不要|不得|不能|必须|务必|只要|只能|仅限|避免|保留|优先|预算|截止|期限|范围|目标|重点|要求|条件|最多|上限|两周|作息|撤回|可逆|观察|一次|must\b|do not\b|don't\b|only\b|avoid\b|without\b|budget\b|deadline\b|constraint\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function sanitizeContextText(value: string) {
  return normalizeText(value)
    .replace(internalIdentifierPattern, "既有能力")
    .replace(internalCodePattern, "内部标识")
    .replace(internalSnakeCasePattern, "内部标识");
}

function compactText(value: string, maxLength: number) {
  const normalized = sanitizeContextText(value);
  const boundedLength = Math.max(0, Math.floor(maxLength));

  if (!normalized || boundedLength === 0) return "";
  if (normalized.length <= boundedLength) return normalized;
  if (boundedLength <= 6) return normalized.slice(0, boundedLength);

  const separator = " ... ";
  const available = boundedLength - separator.length;
  const headLength = Math.ceil(available * 0.68);
  const tailLength = Math.max(1, available - headLength);
  return `${normalized.slice(0, headLength)}${separator}${normalized.slice(-tailLength)}`;
}

function normalizeHistory(history: readonly ChatConversationMessage[]) {
  return history
    .map((message, sourceIndex) => ({
      role: message.role,
      content: sanitizeContextText(message.content),
      sourceIndex,
    }))
    .filter((message) => Boolean(message.content));
}

function collectCompleteTurns(messages: readonly IndexedConversationMessage[]) {
  const turns: CompleteConversationTurn[] = [];
  let currentUser: IndexedConversationMessage | null = null;
  let currentAssistant: IndexedConversationMessage | null = null;

  for (const message of messages) {
    if (message.role === "user") {
      if (currentUser && currentAssistant) {
        turns.push({ user: currentUser, assistant: currentAssistant });
      }
      currentUser = message;
      currentAssistant = null;
      continue;
    }

    if (currentUser) {
      currentAssistant = message;
    }
  }

  if (currentUser && currentAssistant) {
    turns.push({ user: currentUser, assistant: currentAssistant });
  }

  return turns;
}

function extractConstraintSnippets(messages: readonly IndexedConversationMessage[]) {
  const snippets: string[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    if (message.role !== "user") continue;

    const fragments = message.content
      .split(/[。！？!?；;\n]+/)
      .map(normalizeText)
      .filter((fragment) => fragment.length >= 2 && constraintPattern.test(fragment));

    for (const fragment of fragments) {
      const snippet = compactText(fragment, 180);
      const fingerprint = snippet.toLowerCase();
      if (!snippet || seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      snippets.push(snippet);
      if (snippets.length >= 12) return snippets;
    }
  }

  return snippets;
}

function buildFirstUserGoalSummary(
  firstUser: IndexedConversationMessage,
  messages: readonly IndexedConversationMessage[],
) {
  const constraints = extractConstraintSnippets(messages);
  return [
    `会话长期目标：${firstUser.content}`,
    constraints.length > 0
      ? `需要持续遵守的限制：${constraints.join("；")}`
      : "",
  ].filter(Boolean).join("\n");
}

function readString(value: unknown) {
  return typeof value === "string" ? normalizeText(value) : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(readString).filter(Boolean)
    : [];
}

function summarizeTarotResult(result: Record<string, unknown>) {
  const title = readString(result.spreadTitle) || "既有牌阵";
  const cards = Array.isArray(result.cards)
    ? result.cards.map((card) => {
        if (!isRecord(card)) return "";
        const position = readString(card.position);
        const name = readString(card.card);
        const orientation = readString(card.orientation);
        return [position, `${name}${orientation}`].filter(Boolean).join("：");
      }).filter(Boolean)
    : [];

  return cards.length > 0
    ? `牌阵结果：${title}；${cards.join(" / ")}`
    : `牌阵结果：${title}已完成`;
}

function summarizeBaziResult(result: Record<string, unknown>) {
  const chart = isRecord(result.chart) ? result.chart : null;
  if (!chart) return "";

  const pillars = readStringArray(chart.bazi);
  const dayMaster = isRecord(chart.dayMaster) ? chart.dayMaster : null;
  const dayMasterText = dayMaster
    ? [
        readString(dayMaster.stem),
        readString(dayMaster.element),
        readString(dayMaster.strengthLabel),
      ].filter(Boolean).join("")
    : "";
  const usefulElements = dayMaster ? readStringArray(dayMaster.usefulElements) : [];

  if (pillars.length === 0 && !dayMasterText && usefulElements.length === 0) return "";
  return [
    pillars.length > 0 ? `四柱：${pillars.join("、")}` : "",
    dayMasterText ? `日主：${dayMasterText}` : "",
    usefulElements.length > 0 ? `喜用：${usefulElements.join("、")}` : "",
  ].filter(Boolean).join("；");
}

function summarizeBaguaResult(result: Record<string, unknown>) {
  const chart = isRecord(result.chart) ? result.chart : null;
  const main = chart && isRecord(chart.mainHexagram) ? chart.mainHexagram : null;
  const changed = chart && isRecord(chart.changedHexagram) ? chart.changedHexagram : null;
  const moving = chart && isRecord(chart.moving) ? chart.moving : null;
  const mainName = main ? readString(main.name) : "";
  const changedName = changed ? readString(changed.name) : "";
  const movingPosition = moving ? readString(moving.position) : "";

  if (!mainName && !changedName && !movingPosition) return "";
  return [
    mainName ? `本卦：${mainName}` : "",
    movingPosition ? `动爻：${movingPosition}` : "",
    changedName ? `变卦：${changedName}` : "",
  ].filter(Boolean).join("；");
}

function firstUsefulResultText(result: Record<string, unknown>) {
  const direct = [result.state, result.summary, result.message]
    .map(readString)
    .find(Boolean);
  if (direct) return direct;

  const reading = isRecord(result.reading) ? result.reading : null;
  return reading
    ? [reading.summary, reading.content].map(readString).find(Boolean) ?? ""
    : "";
}

function summarizeToolCall(value: unknown) {
  if (!isRecord(value)) return null;

  const name = readString(value.name);
  const status = readString(value.status);
  const result = isRecord(value.result) ? value.result : null;
  if (!name || !result || name === "profile_reader" || name === "intent_classifier") {
    return null;
  }

  let content = "";
  let category = name;

  if (name === "tarot_spread_generator") {
    category = "tarot";
    content = summarizeTarotResult(result);
  } else if (name === "bazi_calculator") {
    category = "bazi";
    content = summarizeBaziResult(result);
  } else if (name === "bagua_generator") {
    category = "bagua";
    content = summarizeBaguaResult(result);
  } else if (name === "palm_image_checker") {
    category = "palm";
    content = firstUsefulResultText(result);
  } else {
    category = "other";
    content = firstUsefulResultText(result);
  }

  if (!content) return null;
  const prefix = status === "needs_input" ? "待补充信息" : "既有结果";
  return { category, content: `${prefix}：${compactText(content, 420)}` };
}

function summarizePersistedToolResult(
  toolResult: unknown,
  sourceIndex: number,
): ToolConclusionSummary[] {
  if (!isRecord(toolResult)) return [];

  const calls = Array.isArray(toolResult.toolCalls) ? toolResult.toolCalls : [];
  const summaries = calls
    .map(summarizeToolCall)
    .filter((summary): summary is NonNullable<ReturnType<typeof summarizeToolCall>> => Boolean(summary));
  const legacyContext = isRecord(toolResult.contextSummary) ? toolResult.contextSummary : null;
  const legacySummaries = legacyContext
    ? readStringArray(legacyContext.usedToolResults).slice(0, 3)
    : [];

  if (summaries.length === 0 && legacySummaries.length === 0) return [];

  const conclusion = isRecord(toolResult.conclusion) ? toolResult.conclusion : null;
  const verdict = conclusion ? readString(conclusion.verdict) : "";
  const risk = conclusion ? readString(conclusion.risk) : "";
  const nextStep = conclusion ? readString(conclusion.nextStep) : "";
  const conclusionParts = [
    verdict ? `当时判断：${compactText(verdict, 260)}` : "",
    risk ? `边界或风险：${compactText(risk, 180)}` : "",
    nextStep ? `已建议下一步：${compactText(nextStep, 200)}` : "",
  ].filter(Boolean);
  const content = [
    ...summaries.map((summary) => summary.content),
    ...legacySummaries.map((summary) => `既有结果：${compactText(summary, 420)}`),
    ...conclusionParts,
  ].join("；");
  const categories = summaries.map((summary) => summary.category).sort();

  return [{
    category: categories.join("+") || "legacy",
    sourceIndex,
    content: compactText(content, 760),
  }];
}

function collectToolConclusionSummaries(
  history: readonly ChatConversationMessage[],
  maxEntries: number,
) {
  const latestByCategory = new Map<string, ToolConclusionSummary>();

  history.forEach((message, sourceIndex) => {
    if (message.role !== "assistant") return;
    for (const summary of summarizePersistedToolResult(message.toolResult, sourceIndex)) {
      latestByCategory.set(summary.category, summary);
    }
  });

  return Array.from(latestByCategory.values())
    .sort((left, right) => left.sourceIndex - right.sourceIndex)
    .slice(-Math.max(0, maxEntries));
}

function buildToolConclusionContext(summaries: readonly ToolConclusionSummary[]) {
  if (summaries.length === 0) return "";
  return [
    "会话中已确认、可继续沿用的结论：",
    ...summaries.map((summary) => `- ${summary.content}`),
  ].join("\n");
}

function allocateMessageContents(
  messages: readonly IndexedConversationMessage[],
  budget: number,
) {
  const targets = messages.map((message) => compactText(message.content, 1800));
  const allocations = targets.map(() => 0);
  let remaining = Math.max(0, Math.floor(budget));

  while (remaining > 0) {
    const active = allocations
      .map((allocated, index) => ({ allocated, index }))
      .filter(({ allocated, index }) => allocated < (targets[index]?.length ?? 0));
    if (active.length === 0) break;

    const share = Math.max(1, Math.floor(remaining / active.length));
    let granted = 0;
    for (const { allocated, index } of active) {
      if (remaining <= 0) break;
      const targetLength = targets[index]?.length ?? 0;
      const amount = Math.min(targetLength - allocated, share, remaining);
      allocations[index] = allocated + amount;
      remaining -= amount;
      granted += amount;
    }
    if (granted === 0) break;
  }

  return messages.map((message, index) => ({
    role: message.role,
    content: compactText(message.content, allocations[index] ?? 0),
  })).filter((message) => Boolean(message.content));
}

export function buildDurableChatConversationContext(
  input: BuildDurableChatConversationContextInput,
): DurableChatConversationContext {
  const historyCharBudget = Math.max(0, Math.floor(input.policy.historyCharBudget));
  const maxHistoryMessages = Math.max(0, Math.floor(input.policy.maxHistoryMessages));
  const normalizedHistory = normalizeHistory(input.history);

  if (historyCharBudget === 0 || maxHistoryMessages === 0 || normalizedHistory.length === 0) {
    return {
      messages: [],
      sourceMessageCount: normalizedHistory.length,
      recentTurnCount: 0,
      summarizedToolConclusionCount: 0,
      characterCount: 0,
    };
  }

  const firstUser = normalizedHistory.find((message) => message.role === "user") ?? null;
  const completeTurns = collectCompleteTurns(normalizedHistory);
  const maxSummaryEntries = Math.min(6, Math.max(2, Math.floor(maxHistoryMessages / 4)));
  let toolSummaries = collectToolConclusionSummaries(input.history, maxSummaryEntries);
  let includeToolSummary = toolSummaries.length > 0;
  let recentTurns = completeTurns.slice(-Math.floor(maxHistoryMessages / 2));

  const recentContainsFirstUser = () => Boolean(
    firstUser && recentTurns.some((turn) => turn.user.sourceIndex === firstUser.sourceIndex),
  );
  const needsFirstUserSummary = () => Boolean(firstUser && !recentContainsFirstUser());
  const selectedMessageCount = () =>
    recentTurns.length * 2 +
    (needsFirstUserSummary() ? 1 : 0) +
    (includeToolSummary ? 1 : 0);

  while (recentTurns.length > 0 && selectedMessageCount() > maxHistoryMessages) {
    recentTurns = recentTurns.slice(1);
  }

  if (selectedMessageCount() > maxHistoryMessages && includeToolSummary) {
    includeToolSummary = false;
    toolSummaries = [];
  }

  if (selectedMessageCount() > maxHistoryMessages) {
    recentTurns = [];
  }

  const includeFirstUserSummary = needsFirstUserSummary();
  const goalBudget = includeFirstUserSummary
    ? Math.min(1200, Math.max(1, Math.floor(historyCharBudget * 0.18)))
    : 0;
  const toolSummaryBudget = includeToolSummary
    ? Math.min(1800, Math.max(1, Math.floor(historyCharBudget * 0.22)))
    : 0;
  const goalMessage = includeFirstUserSummary && firstUser
    ? compactText(buildFirstUserGoalSummary(firstUser, normalizedHistory), goalBudget)
    : "";
  const toolSummaryMessage = includeToolSummary
    ? compactText(buildToolConclusionContext(toolSummaries), toolSummaryBudget)
    : "";
  const recentMessages = recentTurns.flatMap((turn) => [turn.user, turn.assistant]);
  const recentBudget = Math.max(
    0,
    historyCharBudget - goalMessage.length - toolSummaryMessage.length,
  );
  const candidates: ChatConversationContextMessage[] = [
    ...(goalMessage ? [{ role: "user" as const, content: goalMessage }] : []),
    ...allocateMessageContents(recentMessages, recentBudget),
    ...(toolSummaryMessage
      ? [{ role: "assistant" as const, content: toolSummaryMessage }]
      : []),
  ];
  const selectedMessages = selectModelConversationHistory(candidates, {
    historyCharBudget,
    maxHistoryMessages,
  });
  const selectionPreservesCompleteContext =
    selectedMessages.length === candidates.length &&
    selectedMessages.every((message, index) =>
      message.role === candidates[index]?.role &&
      message.content === candidates[index]?.content
    );
  const messages = selectionPreservesCompleteContext ? selectedMessages : candidates;

  return {
    messages,
    sourceMessageCount: normalizedHistory.length,
    recentTurnCount: recentTurns.length,
    summarizedToolConclusionCount: toolSummaryMessage ? toolSummaries.length : 0,
    characterCount: messages.reduce((total, message) => total + message.content.length, 0),
  };
}
