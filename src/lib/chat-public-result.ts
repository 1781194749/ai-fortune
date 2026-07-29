import "server-only";

import type { AiChatStep, AiToolCall, ChatAnswerShape, ChatIntent } from "@/lib/ai-orchestrator";
import type {
  ChatCompleteData,
  ChatProgressData,
  ChatInternalCompleteData,
  ChatPublicEvidence,
  ChatRitualItem,
  ChatTrace,
} from "@/lib/chat-ui-message";
import type { ChatServiceIntent } from "@/lib/chat-service";
import {
  sanitizeCustomerAnswer,
  sanitizeCustomerDocument,
} from "@/lib/product-identity";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown, key: string) {
  if (!isRecord(value)) return null;
  const nested = value[key];
  return isRecord(nested) ? nested : null;
}

function readArray(value: unknown, key: string) {
  if (!isRecord(value)) return [];
  const nested = value[key];
  return Array.isArray(nested) ? nested : [];
}

function readText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toPublicMethod(intent: ChatIntent): ChatServiceIntent {
  return intent;
}

function shouldShowRitual(answerShape: ChatAnswerShape) {
  return answerShape !== "identity_boundary" &&
    answerShape !== "missing_info" &&
    answerShape !== "safety_boundary";
}

const publicStepsByMethod: Record<ChatServiceIntent, AiChatStep[]> = {
  general: [
    { label: "理解问题", detail: "确认当前问题、边界和希望得到的结果。" },
    { label: "梳理条件", detail: "整理与判断直接相关的现实信息。" },
    { label: "形成建议", detail: "给出结论、依据、风险和下一步。" },
  ],
  tarot: [
    { label: "确认问题", detail: "明确本轮牌阵要回应的核心问题。" },
    { label: "展开牌阵", detail: "整理牌面位置与相互关系。" },
    { label: "形成解读", detail: "结合问题给出判断和行动建议。" },
  ],
  bazi: [
    { label: "核对信息", detail: "确认本轮可用的出生与档案信息。" },
    { label: "展开命盘", detail: "整理四柱、五行与阶段线索。" },
    { label: "形成解读", detail: "结合问题给出判断和行动建议。" },
  ],
  bagua: [
    { label: "确认主题", detail: "明确本轮问事对象与时间范围。" },
    { label: "展开卦象", detail: "整理本卦、动爻与变化关系。" },
    { label: "形成解读", detail: "结合问题给出判断和行动建议。" },
  ],
  palm: [
    { label: "检查图片", detail: "确认手掌图片是否清晰、完整且可分析。" },
    { label: "整理特征", detail: "提取与当前问题相关的可见特征。" },
    { label: "形成解读", detail: "结合问题给出判断和行动建议。" },
  ],
};

function toPublicSteps(intent: ChatServiceIntent, source: AiChatStep[]) {
  return source.length > 0 ? publicStepsByMethod[intent] : [];
}

function publicEvidenceLabel(toolName: AiToolCall["name"]) {
  const labels: Partial<Record<AiToolCall["name"], string>> = {
    intent_classifier: "问题类型判断",
    safety_risk_classifier: "安全边界检查",
    profile_reader: "档案核对",
    tarot_spread_generator: "塔罗牌阵",
    bazi_calculator: "八字命盘",
    birth_info_checker: "出生信息核对",
    bagua_generator: "八卦卦象",
    palm_image_checker: "手相图片检查",
  };

  return labels[toolName] ?? "分析依据";
}

function sanitizeRitualItem(item: ChatRitualItem): ChatRitualItem {
  if (item.kind === "tarot_card") {
    return {
      kind: item.kind,
      index: item.index,
      total: item.total,
      title: sanitizeCustomerDocument(item.title),
      position: sanitizeCustomerDocument(item.position),
      orientation: sanitizeCustomerDocument(item.orientation),
      meaning: sanitizeCustomerDocument(item.meaning),
    };
  }

  if (item.kind === "bagua_stage") {
    return {
      kind: item.kind,
      stage: item.stage,
      title: sanitizeCustomerDocument(item.title),
      detail: sanitizeCustomerDocument(item.detail),
    };
  }

  if (item.kind === "bazi_pillars") {
    return {
      kind: item.kind,
      pillars: item.pillars.map(sanitizeCustomerDocument),
    };
  }

  if (item.kind === "bazi_wuxing") {
    return {
      kind: item.kind,
      counts: { ...item.counts },
      strongest: sanitizeCustomerDocument(item.strongest),
      weakest: item.weakest.map(sanitizeCustomerDocument),
    };
  }

  return {
    kind: item.kind,
    title: sanitizeCustomerDocument(item.title),
    detail: sanitizeCustomerDocument(item.detail),
  };
}

function publicProgressCopy(progress: Omit<ChatProgressData, "sequence">) {
  const completed = progress.status === "completed";

  if (progress.step === "classify") {
    return completed
      ? { label: "问题已确认", detail: "已确认本轮问题类型与回答边界。" }
      : { label: "理解你的问题", detail: "正在确认问题重点与回答边界。" };
  }

  if (progress.step === "profile") {
    return completed
      ? { label: "相关档案已核对", detail: "已整理本轮可使用的档案信息。" }
      : { label: "核对相关档案", detail: "正在整理与当前问题有关的信息。" };
  }

  if (progress.step === "tool") {
    return completed
      ? { label: "分析依据已准备", detail: "本轮所需依据已经整理完成。" }
      : { label: "整理分析依据", detail: "正在准备与当前问题直接相关的依据。" };
  }

  if (progress.step === "ritual") {
    return completed
      ? { label: "推演结果已显现", detail: "正在结合问题整理最终解释。" }
      : { label: "推演结果正在显现", detail: "正在展开本轮推演结果。" };
  }

  return completed
    ? { label: "顾问结论已完成", detail: "完整回答已经生成。" }
    : { label: "生成顾问结论", detail: "正在形成结论、依据、风险和下一步。" };
}

function summarizeEvidence(tool: AiToolCall) {
  if (tool.name === "intent_classifier") {
    return "已确认本轮问题类型。";
  }

  if (tool.name === "profile_reader") {
    const completeness = isRecord(tool.result) ? tool.result.completeness : undefined;
    return typeof completeness === "number"
      ? `已读取相关档案，完整度 ${completeness}%。`
      : "已核对相关档案信息。";
  }

  if (tool.name === "tarot_spread_generator") {
    const cards = readArray(tool.result, "cards");
    const spreadTitle = readText(isRecord(tool.result) ? tool.result.spreadTitle : "") || "塔罗牌阵";
    const cardNames = cards
      .map((card) => (isRecord(card) ? readText(card.card) : ""))
      .filter(Boolean);
    return cardNames.length > 0
      ? `${spreadTitle}：${cardNames.join("、")}。`
      : `已完成${spreadTitle}。`;
  }

  if (tool.name === "bazi_calculator") {
    const chart = readRecord(tool.result, "chart");
    const dayMaster = readRecord(chart, "dayMaster");
    const bazi = readArray(chart, "bazi").map(String);
    const strength = readText(dayMaster?.strengthLabel);
    const useful = readArray(dayMaster, "usefulElements").map(String).join("、");
    return bazi.length > 0
      ? `四柱：${bazi.join("、")}。${strength ? `日主${strength}` : ""}${useful ? `，喜用 ${useful}` : ""}。`
      : "已完成八字命盘分析。";
  }

  if (tool.name === "birth_info_checker") {
    const required = readArray(tool.result, "required").map(String);
    return required.length > 0 ? `还需要补充：${required.join("、")}。` : "出生信息还不完整。";
  }

  if (tool.name === "bagua_generator") {
    const chart = readRecord(tool.result, "chart");
    const mainHexagram = readRecord(chart, "mainHexagram");
    const changedHexagram = readRecord(chart, "changedHexagram");
    const mainName = readText(mainHexagram?.name);
    const changedName = readText(changedHexagram?.name);
    return mainName && changedName
      ? `本卦 ${mainName}，变卦 ${changedName}。`
      : "已完成八卦问事推演。";
  }

  if (tool.name === "palm_image_checker") {
    if (tool.status !== "completed") {
      const code = readText(isRecord(tool.result) ? tool.result.code : "");
      return code === "needs_image"
        ? "还需要上传清晰、完整的手掌图片。"
        : "图片分析暂时未完成，请稍后重试。";
    }
    const imageId = readText(isRecord(tool.result) ? tool.result.imageId : "");
    return imageId ? "手相图片已完成分析。" : "手相图片已完成检查。";
  }

  return tool.status === "needs_input" ? "还需要补充必要信息。" : "相关依据已完成整理。";
}

export function toPublicEvidence(toolCalls: AiToolCall[]): ChatPublicEvidence[] {
  return toolCalls.map((tool) => ({
    label: publicEvidenceLabel(tool.name),
    status: tool.status,
    summary: sanitizeCustomerDocument(summarizeEvidence(tool)),
  }));
}

export function toPublicChatTrace(input: {
  intent: ChatIntent;
  steps: AiChatStep[];
  toolCalls: AiToolCall[];
  answerShape: ChatAnswerShape;
}): ChatTrace {
  return {
    method: toPublicMethod(input.intent),
    steps: toPublicSteps(toPublicMethod(input.intent), input.steps),
    evidence: toPublicEvidence(input.toolCalls),
    showRitual: shouldShowRitual(input.answerShape),
  };
}

export function toPublicChatProgress(
  progress: Omit<ChatProgressData, "sequence">,
): Omit<ChatProgressData, "sequence"> {
  const copy = publicProgressCopy(progress);

  return {
    step: progress.step,
    status: progress.status,
    label: copy.label,
    detail: copy.detail,
    serviceMode: progress.serviceMode,
    ...(progress.method ? { method: progress.method } : {}),
    ...(progress.ritualItem ? { ritualItem: sanitizeRitualItem(progress.ritualItem) } : {}),
  };
}

export function toPublicChatComplete(data: ChatInternalCompleteData): ChatCompleteData {
  const counted = typeof data.counted === "boolean"
    ? data.counted
    : !data.validation.degraded &&
      data.answerShape !== "identity_boundary" &&
      data.answerShape !== "missing_info" &&
      data.answerShape !== "safety_boundary";

  return {
    ok: true,
    ...toPublicChatTrace(data),
    answer: sanitizeCustomerAnswer(data.answer, data.answerShape, data.question),
    serviceMode: data.serviceMode,
    cost: data.cost,
    balanceAfter: data.balanceAfter,
    quotaTotal: data.quotaTotal,
    quotaUsed: data.quotaUsed,
    quotaRemaining: data.quotaRemaining,
    chatSessionId: data.chatSessionId,
    turnId: data.turnId,
    turnSequence: data.turnSequence,
    turnStatus: data.turnStatus,
    counted,
    replayed: data.replayed,
    question: data.question,
  };
}
