import "server-only";

import { createHash } from "crypto";

export type TarotSpread = "daily" | "three_card" | "love";

type TarotCard = {
  name: string;
  upright: string;
  reversed: string;
  advice: string;
};

const majorArcana: TarotCard[] = [
  {
    name: "愚者",
    upright: "新的开始、轻装上路、愿意尝试。",
    reversed: "冲动、准备不足、忽略现实边界。",
    advice: "先允许自己看见机会，但别急着把所有筹码一次押上。",
  },
  {
    name: "魔术师",
    upright: "资源整合、表达力、行动开启。",
    reversed: "分心、技巧被滥用、承诺过度。",
    advice: "把手边资源列清楚，先完成一个能产生反馈的小动作。",
  },
  {
    name: "女祭司",
    upright: "直觉、隐藏信息、内在观察。",
    reversed: "压抑直觉、信息不透明、过度猜测。",
    advice: "先不要急着定论，多观察对方的稳定行为。",
  },
  {
    name: "皇后",
    upright: "滋养、吸引力、关系生长。",
    reversed: "消耗、边界松动、过度照顾。",
    advice: "照顾别人之前，先确认你自己的能量没有被透支。",
  },
  {
    name: "皇帝",
    upright: "秩序、责任、明确规则。",
    reversed: "控制、僵硬、权力拉扯。",
    advice: "把期待说成规则，把情绪留给沟通而不是试探。",
  },
  {
    name: "恋人",
    upright: "选择、吸引、价值观对齐。",
    reversed: "摇摆、诱惑、关系失衡。",
    advice: "真正的问题不是喜不喜欢，而是能不能一起承担选择。",
  },
  {
    name: "战车",
    upright: "推进、掌控方向、克服阻力。",
    reversed: "急躁、失控、方向分裂。",
    advice: "先定一个方向，不要同时追逐多个互相冲突的结果。",
  },
  {
    name: "力量",
    upright: "温柔的坚持、耐心、内在力量。",
    reversed: "自我怀疑、压抑怒气、耗竭。",
    advice: "用稳定代替用力，越重要的事越需要慢慢推进。",
  },
  {
    name: "隐者",
    upright: "独处、复盘、寻找答案。",
    reversed: "逃避、孤立、拒绝求助。",
    advice: "留一点安静时间给自己，但别把沉默当成唯一答案。",
  },
  {
    name: "命运之轮",
    upright: "转机、周期变化、机会到来。",
    reversed: "反复、卡点、被动等待。",
    advice: "变化会来，但你要提前准备能接住变化的位置。",
  },
  {
    name: "正义",
    upright: "公平、因果、清晰判断。",
    reversed: "偏见、逃避责任、信息不全。",
    advice: "回到事实，不要只根据对方一句话或一次反应下结论。",
  },
  {
    name: "星星",
    upright: "希望、修复、长期愿景。",
    reversed: "失望、信心不足、期待落空。",
    advice: "保留希望，但用行动计划保护你的期待。",
  },
];

const spreadPositions: Record<TarotSpread, string[]> = {
  daily: ["今日指引"],
  three_card: ["过去影响", "当前状态", "未来趋势"],
  love: ["你的心意", "对方状态", "关系走向"],
};

function hashToNumber(seed: string) {
  return Number.parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 8), 16);
}

export function drawTarot(spread: TarotSpread, question: string, userId: string) {
  const positions = spreadPositions[spread];
  const used = new Set<number>();

  return positions.map((position, index) => {
    let cardIndex = hashToNumber(`${userId}:${spread}:${question}:${index}`) % majorArcana.length;

    while (used.has(cardIndex)) {
      cardIndex = (cardIndex + 1) % majorArcana.length;
    }

    used.add(cardIndex);

    const card = majorArcana[cardIndex];
    const reversed = hashToNumber(`${question}:${position}:${card.name}`) % 2 === 1;

    return {
      position,
      card: card.name,
      orientation: reversed ? "逆位" : "正位",
      meaning: reversed ? card.reversed : card.upright,
      advice: card.advice,
    };
  });
}

export function buildTarotReading(input: {
  spread: TarotSpread;
  question: string;
  cards: ReturnType<typeof drawTarot>;
}) {
  const title =
    input.spread === "daily"
      ? "今日塔罗单牌"
      : input.spread === "love"
        ? "塔罗爱情牌阵"
        : "塔罗三牌阵";
  const focus = input.question.trim() || "当前最需要被看见的主题";
  const lines = input.cards.map(
    (card) =>
      `${card.position}抽到「${card.card}」${card.orientation}，代表${card.meaning}${card.advice}`,
  );
  const summary = `围绕「${focus}」，这次牌阵的主题是：${input.cards
    .map((card) => card.card)
    .join("、")}。`;
  const content = [
    summary,
    ...lines,
    "建议把这次解读作为自我观察和行动提醒，不把它当成绝对结果。",
  ].join("\n\n");

  return {
    title,
    summary,
    content,
  };
}
