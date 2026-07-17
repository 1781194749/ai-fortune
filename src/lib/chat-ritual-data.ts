import "server-only";

import type { AiToolCall, ChatCompiledContext } from "@/lib/ai-orchestrator";
import type { ChatRitualItem } from "@/lib/chat-ui-message";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordText(value: unknown, key: string) {
  return isRecord(value) && typeof value[key] === "string" ? value[key] : "";
}

export function buildChatRitualItems(
  toolCalls: AiToolCall[],
  context: ChatCompiledContext,
): ChatRitualItem[] {
  const tool = toolCalls.find(
    (item) => !["intent_classifier", "profile_reader"].includes(item.name),
  );
  const result = isRecord(tool?.result) ? tool.result : {};

  if (tool?.name === "tarot_spread_generator" && Array.isArray(result.cards)) {
    const cards = result.cards;

    return cards.slice(0, 10).flatMap((card, index) =>
      isRecord(card)
        ? [{
            kind: "tarot_card" as const,
            index,
            total: Math.min(10, cards.length),
            title: recordText(card, "card") || `第 ${index + 1} 张牌`,
            position: recordText(card, "position") || ["起因", "当下", "趋势", "关键", "行动"][index] || "牌位",
            orientation: recordText(card, "orientation"),
            meaning: recordText(card, "contextMeaning") || recordText(card, "meaning"),
          }]
        : [],
    );
  }

  if (tool?.name === "bagua_generator") {
    const chart = isRecord(result.chart) ? result.chart : {};
    const main = isRecord(chart.mainHexagram) ? chart.mainHexagram : {};
    const moving = isRecord(chart.moving) ? chart.moving : {};
    const changed = isRecord(chart.changedHexagram) ? chart.changedHexagram : {};

    return [
      {
        kind: "bagua_stage",
        stage: "main",
        title: `本卦 · ${typeof main.number === "number" ? `第 ${main.number} 卦 ` : ""}${recordText(main, "name") || "卦象已成"}`,
        detail: recordText(main, "judgment") || recordText(main, "relationAdvice") || "正在观察六十四卦卦意。",
      },
      {
        kind: "bagua_stage",
        stage: "moving",
        title: `动爻 · ${recordText(moving, "position") || String(chart.movingLine ?? "已定")}`,
        detail: recordText(moving, "text") || recordText(moving, "advice") || "正在确认变化发生的位置。",
      },
      {
        kind: "bagua_stage",
        stage: "changed",
        title: `变卦 · ${typeof changed.number === "number" ? `第 ${changed.number} 卦 ` : ""}${recordText(changed, "name") || "变势已明"}`,
        detail: recordText(changed, "topicAdvice") || recordText(changed, "relationAdvice") || "正在判断后续趋势。",
      },
    ];
  }

  if (tool?.name === "bazi_calculator") {
    const chart = isRecord(result.chart) ? result.chart : {};
    const rawCounts = isRecord(chart.counts) ? chart.counts : {};
    const weightedCounts = isRecord(chart.weightedCounts) ? chart.weightedCounts : rawCounts;
    const dayMaster = isRecord(chart.dayMaster) ? chart.dayMaster : {};
    const counts = Object.fromEntries(
      ["木", "火", "土", "金", "水"].map((element) => [
        element,
        typeof weightedCounts[element] === "number" ? weightedCounts[element] : 0,
      ]),
    );

    return [
      {
        kind: "bazi_pillars",
        pillars: Array.isArray(chart.bazi) ? chart.bazi.map(String).slice(0, 4) : [],
      },
      {
        kind: "bazi_wuxing",
        counts,
        strongest: recordText(dayMaster, "strengthLabel") || recordText(chart, "strongest"),
        weakest: Array.isArray(dayMaster.usefulElements)
          ? dayMaster.usefulElements.map(String)
          : Array.isArray(chart.weakest)
            ? chart.weakest.map(String)
            : [],
      },
    ];
  }

  return [{
    kind: "general_signal",
    title: tool?.status === "needs_input" ? "等待补充关键信息" : "核心议题已确认",
    detail: context.coreConcern || context.currentDecisionTopic,
  }];
}
