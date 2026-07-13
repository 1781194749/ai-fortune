import "server-only";

import { Solar } from "lunar-typescript";

export type BaziInput = {
  name?: string;
  gender?: string;
  birthDate: string;
  birthTime: string;
  birthPlace?: string;
};

export type WuxingName = "木" | "火" | "土" | "金" | "水";

const wuxingOrder: WuxingName[] = ["木", "火", "土", "金", "水"];
const wuxingSuggestions: Record<WuxingName, string> = {
  木: "适合补充学习、规划、成长型关系和长期项目。",
  火: "适合补充表达、曝光、热情和主动连接。",
  土: "适合补充稳定节奏、边界感、储蓄和落地执行。",
  金: "适合补充规则、判断、断舍离和专业能力。",
  水: "适合补充休息、流动、信息收集和情绪弹性。",
};

function parseBirth(input: BaziInput) {
  const [year, month, day] = input.birthDate.split("-").map(Number);
  const [hour, minute] = input.birthTime.split(":").map(Number);

  if (
    !year ||
    !month ||
    !day ||
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error("Invalid birth input.");
  }

  return { year, month, day, hour, minute };
}

function countWuxing(wuxingPillars: string[]) {
  const counts = Object.fromEntries(wuxingOrder.map((item) => [item, 0])) as Record<
    WuxingName,
    number
  >;

  for (const pillar of wuxingPillars) {
    for (const element of wuxingOrder) {
      counts[element] += [...pillar].filter((char) => char === element).length;
    }
  }

  return counts;
}

function rankElements(counts: Record<WuxingName, number>) {
  return [...wuxingOrder].sort((a, b) => counts[b] - counts[a]);
}

export function calculateBazi(input: BaziInput) {
  const birth = parseBirth(input);
  const solar = Solar.fromYmdHms(
    birth.year,
    birth.month,
    birth.day,
    birth.hour,
    birth.minute,
    0,
  );
  const lunar = solar.getLunar();
  const eightChar = lunar.getEightChar();
  const bazi = lunar.getBaZi();
  const wuxing = lunar.getBaZiWuXing();
  const counts = countWuxing(wuxing);
  const ranked = rankElements(counts);
  const strongest = ranked[0] ?? "木";
  const weakestCount = counts[ranked[ranked.length - 1] ?? "木"];
  const weakest = [...ranked].reverse().filter((element) => counts[element] === weakestCount);
  const pillars = [
    { label: "年柱", ganzhi: eightChar.getYear(), wuxing: eightChar.getYearWuXing() },
    { label: "月柱", ganzhi: eightChar.getMonth(), wuxing: eightChar.getMonthWuXing() },
    { label: "日柱", ganzhi: eightChar.getDay(), wuxing: eightChar.getDayWuXing() },
    { label: "时柱", ganzhi: eightChar.getTime(), wuxing: eightChar.getTimeWuXing() },
  ];

  return {
    input,
    solar: solar.toYmdHms(),
    lunar: lunar.toString(),
    zodiac: lunar.getYearShengXiao(),
    bazi,
    wuxing,
    counts,
    strongest,
    weakest,
    pillars,
  };
}

export function buildBaziReading(result: ReturnType<typeof calculateBazi>) {
  const name = result.input.name?.trim() || "你";
  const weakestText = result.weakest.join("、");
  const focusAdvice = result.weakest.map((element) => wuxingSuggestions[element]).join(" ");
  const countText = wuxingOrder
    .map((element) => `${element}:${result.counts[element]}`)
    .join(" / ");
  const summary = `${name}的四柱为 ${result.bazi.join("、")}，五行分布为 ${countText}。`;
  const content = [
    summary,
    `整体上，当前盘面里「${result.strongest}」的存在感更强，「${weakestText}」相对需要被照顾。这里的判断用于第一版简析，后续深度报告会结合大运、流年和具体问题继续细化。`,
    `行动建议：${focusAdvice}`,
    `生肖参考：${result.zodiac}。出生地记录为：${result.input.birthPlace || "未填写"}。`,
    "本报告仅供娱乐、文化参考和自我探索，不构成医疗、投资、法律或重大人生决策建议。",
  ].join("\n\n");

  return {
    title: "八字五行简析",
    summary,
    content,
  };
}
