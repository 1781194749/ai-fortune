import "server-only";

import { createHash } from "crypto";
import { tarotDeck, type TarotCard, type TarotTopic } from "@/lib/tarot-deck";

export type TarotSpread =
  | "daily"
  | "three_card"
  | "love"
  | "decision"
  | "career"
  | "celtic_cross";

type SpreadPosition = {
  name: string;
  focus: string;
};

type SpreadDefinition = {
  title: string;
  subtitle: string;
  positions: SpreadPosition[];
};

export type TarotDrawnCard = {
  position: string;
  positionMeaning: string;
  card: string;
  orientation: "正位" | "逆位";
  meaning: string;
  contextMeaning: string;
  advice: string;
  keywords: string[];
  arcana: TarotCard["arcana"];
  suit?: TarotCard["suit"];
  element?: string;
  visual: TarotCard["visual"];
};

const topicLabels: Record<TarotTopic, string> = {
  general: "当前主题",
  love: "感情关系",
  career: "事业工作",
  wealth: "财务资源",
  wellbeing: "身心状态",
  decision: "选择决策",
};

const spreadDefinitions: Record<TarotSpread, SpreadDefinition> = {
  daily: {
    title: "今日塔罗单牌",
    subtitle: "用一张牌抓住今日最需要被看见的提醒。",
    positions: [
      { name: "今日指引", focus: "今天最该被看见的核心提醒和行动方向。" },
    ],
  },
  three_card: {
    title: "塔罗三牌阵",
    subtitle: "从过去影响、当前状态到未来趋势，快速看清一件事的走向。",
    positions: [
      { name: "过去影响", focus: "影响这件事的旧模式、前因或已经发生的关键线索。" },
      { name: "当前状态", focus: "此刻正在起作用的情绪、资源、阻力和真实位置。" },
      { name: "未来趋势", focus: "如果延续当前节奏，短期最可能显现的方向。" },
    ],
  },
  love: {
    title: "塔罗爱情牌阵",
    subtitle: "把感情里的你、对方、阻力、走向和行动建议拆开看。",
    positions: [
      { name: "你的心意", focus: "你在这段关系中的真实需求、期待和不安。" },
      { name: "对方状态", focus: "对方当前更明显的情绪、行动倾向或回避点。" },
      { name: "互动阻力", focus: "关系里最容易让你们卡住的模式或误会。" },
      { name: "关系走向", focus: "在当前互动方式下，关系短期更可能走向哪里。" },
      { name: "行动建议", focus: "你现在最适合采取或暂缓的具体动作。" },
    ],
  },
  decision: {
    title: "塔罗二选一牌阵",
    subtitle: "用于 A/B 方案、该不该、要不要这类选择题。",
    positions: [
      { name: "选项 A", focus: "第一个选择的优势、代价和真实推动力。" },
      { name: "选项 B", focus: "第二个选择的优势、代价和真实推动力。" },
      { name: "关键变量", focus: "真正影响选择成败的隐藏条件或风险点。" },
      { name: "建议动作", focus: "下一步最适合验证的低成本行动。" },
    ],
  },
  career: {
    title: "塔罗事业牌阵",
    subtitle: "围绕事业状态、机会、能力资产、风险和下一步行动展开。",
    positions: [
      { name: "当前职业状态", focus: "你现在在事业里的真实处境、能量和卡点。" },
      { name: "外部机会", focus: "环境、平台、贵人、市场或岗位里正在出现的机会。" },
      { name: "能力资产", focus: "你已经拥有、可以被放大的经验与资源。" },
      { name: "阻碍风险", focus: "最需要提前识别的消耗、盲点或阻力。" },
      { name: "下一步", focus: "近期最适合执行的具体推进方向。" },
    ],
  },
  celtic_cross: {
    title: "凯尔特十字牌阵",
    subtitle: "用于复杂主题、长期困局和需要深度拆解的问题。",
    positions: [
      { name: "核心现状", focus: "问题中心正在发生什么。" },
      { name: "横阻/助力", focus: "横在眼前的阻力，也可能是需要善用的力量。" },
      { name: "根基", focus: "更深层的原因、潜意识需求或长期背景。" },
      { name: "过去", focus: "刚刚退场但仍在影响局面的经验。" },
      { name: "显意识目标", focus: "你以为自己正在追求的目标和判断。" },
      { name: "近期趋势", focus: "接下来一段时间更容易显现的变化。" },
      { name: "自我位置", focus: "你在这件事中真正扮演的角色和状态。" },
      { name: "外部环境", focus: "他人、环境、规则或市场对这件事的影响。" },
      { name: "希望与恐惧", focus: "你最期待也最害怕的部分。" },
      { name: "综合走向", focus: "整组牌合起来给出的阶段性结论。" },
    ],
  },
};

export const supportedTarotSpreads = Object.keys(spreadDefinitions) as TarotSpread[];

export function isTarotSpread(value: string): value is TarotSpread {
  return supportedTarotSpreads.includes(value as TarotSpread);
}

export function getTarotSpreadDefinition(spread: TarotSpread) {
  return spreadDefinitions[spread];
}

export function getTarotDeckAudit() {
  return {
    total: tarotDeck.length,
    major: tarotDeck.filter((card) => card.arcana === "major").length,
    minor: tarotDeck.filter((card) => card.arcana === "minor").length,
  };
}

function hashToNumber(seed: string) {
  return Number.parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 8), 16);
}

export function inferTarotTopic(question: string): TarotTopic {
  if (/感情|关系|复合|前任|喜欢|恋|婚|对方|暧昧/.test(question)) {
    return "love";
  }

  if (/事业|工作|职业|跳槽|创业|项目|老板|同事|offer|岗位|升职|离职/i.test(question)) {
    return "career";
  }

  if (/钱|财|收入|投资|买|卖|合作|合同|副业|生意|债/.test(question)) {
    return "wealth";
  }

  if (/健康|身体|睡眠|焦虑|压力|状态|能量|情绪/.test(question)) {
    return "wellbeing";
  }

  if (/选择|二选一|A|B|该不该|要不要|能不能|是否|还是|纠结|犹豫/i.test(question)) {
    return "decision";
  }

  return "general";
}

export function selectTarotSpread(question: string): TarotSpread {
  const normalized = question.trim();

  if (/日签|今日|今天|每日|一天/.test(normalized)) {
    return "daily";
  }

  if (/三牌|三张|过去.*现在.*未来|过去.*当前.*未来/.test(normalized)) {
    return "three_card";
  }

  if (/凯尔特|十字|十张|全局|深度|复杂|长期|整体拆解/.test(normalized)) {
    return "celtic_cross";
  }

  if (/二选一|A\s*(?:和|或|\/|还是)\s*B|选择|该不该|要不要|是否|纠结|犹豫/i.test(normalized)) {
    return "decision";
  }

  if (/事业|工作|职业|跳槽|创业|项目|offer|岗位|升职|离职/i.test(normalized)) {
    return "career";
  }

  if (/感情|关系|复合|前任|喜欢|恋|婚|对方|暧昧/.test(normalized)) {
    return "love";
  }

  return "three_card";
}

function cardLine(card: TarotDrawnCard) {
  return [
    `${card.position}抽到「${card.card}」${card.orientation}。`,
    `牌位提示：${card.positionMeaning}`,
    `牌面含义：${card.meaning}`,
    `落到当前主题：${card.contextMeaning}`,
    `建议：${card.advice}`,
  ].join("");
}

function buildSynthesis(cards: TarotDrawnCard[], topic: TarotTopic) {
  const majorCount = cards.filter((card) => card.arcana === "major").length;
  const reversedCount = cards.filter((card) => card.orientation === "逆位").length;
  const suitCounts = cards.reduce<Record<string, number>>((counts, card) => {
    const key = card.element ?? (card.arcana === "major" ? "大阿卡那" : "未明");
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const dominantElement = Object.entries(suitCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "未明";
  const topicLabel = topicLabels[topic];

  const structure =
    majorCount >= Math.ceil(cards.length / 2)
      ? "这组牌大阿卡那占比偏高，说明它更像阶段性主题或人生模式，而不只是一次小波动。"
      : "这组牌小阿卡那占比更高，说明答案会落到具体行动、沟通、资源和日常选择里。";
  const direction =
    reversedCount >= Math.ceil(cards.length / 2)
      ? "逆位较多，当前更需要先处理阻塞、误解或能量不足，再谈推进。"
      : "正位较多，当前具备推进空间，但仍要按牌位提示控制节奏。";

  return `综合看，${topicLabel}的主调落在「${dominantElement}」这条线上。${structure}${direction}`;
}

export function drawTarot(
  spread: TarotSpread,
  question: string,
  userId: string,
  readingSeed = "",
) {
  const definition = spreadDefinitions[spread];
  const topic = inferTarotTopic(question);
  const used = new Set<number>();

  return definition.positions.map((position, index): TarotDrawnCard => {
    let cardIndex = hashToNumber(`${userId}:${spread}:${question}:${readingSeed}:${index}`) % tarotDeck.length;

    while (used.has(cardIndex)) {
      cardIndex = (cardIndex + 1) % tarotDeck.length;
    }

    used.add(cardIndex);

    const card = tarotDeck[cardIndex]!;
    const reversed = hashToNumber(`${userId}:${question}:${readingSeed}:${position.name}:${card.id}`) % 2 === 1;

    return {
      position: position.name,
      positionMeaning: position.focus,
      card: card.name,
      orientation: reversed ? "逆位" : "正位",
      meaning: reversed ? card.reversed : card.upright,
      contextMeaning: card.contexts[topic],
      advice: card.advice,
      keywords: card.keywords,
      arcana: card.arcana,
      suit: card.suit,
      element: card.element,
      visual: card.visual,
    };
  });
}

export function buildTarotReading(input: {
  spread: TarotSpread;
  question: string;
  cards: ReturnType<typeof drawTarot>;
}) {
  const definition = spreadDefinitions[input.spread];
  const focus = input.question.trim() || "当前最需要被看见的主题";
  const topic = inferTarotTopic(input.question);
  const summary = `围绕「${focus}」，本次使用「${definition.title}」，抽到：${input.cards
    .map((card) => `${card.position}「${card.card}」${card.orientation}`)
    .join("、")}。`;
  const content = [
    summary,
    buildSynthesis(input.cards, topic),
    ...input.cards.map(cardLine),
    "边界提醒：塔罗适合做自我观察、关系复盘和行动校准，不应替代医疗、法律、投资或重大现实决策中的专业意见。",
  ].join("\n\n");

  return {
    title: definition.title,
    subtitle: definition.subtitle,
    topic,
    topicLabel: topicLabels[topic],
    summary,
    content,
  };
}
