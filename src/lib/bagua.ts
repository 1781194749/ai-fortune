import "server-only";

import { createHash } from "crypto";

export type BaguaInput = {
  question: string;
  timeframe?: string;
  userId: string;
};

type Wuxing = "木" | "火" | "土" | "金" | "水";

type Trigram = {
  key: string;
  name: string;
  symbol: string;
  lines: [number, number, number];
  element: Wuxing;
  image: string;
  advice: string;
};

const trigrams: Trigram[] = [
  {
    key: "111",
    name: "乾",
    symbol: "☰",
    lines: [1, 1, 1],
    element: "金",
    image: "天",
    advice: "主动、规则、领导力和明确目标。",
  },
  {
    key: "011",
    name: "兑",
    symbol: "☱",
    lines: [1, 1, 0],
    element: "金",
    image: "泽",
    advice: "沟通、协商、悦纳和关系润滑。",
  },
  {
    key: "101",
    name: "离",
    symbol: "☲",
    lines: [1, 0, 1],
    element: "火",
    image: "火",
    advice: "表达、曝光、看清事实和建立信心。",
  },
  {
    key: "001",
    name: "震",
    symbol: "☳",
    lines: [1, 0, 0],
    element: "木",
    image: "雷",
    advice: "启动、突破、先行动再校准。",
  },
  {
    key: "110",
    name: "巽",
    symbol: "☴",
    lines: [0, 1, 1],
    element: "木",
    image: "风",
    advice: "渗透、策略、柔性推进和长期影响。",
  },
  {
    key: "010",
    name: "坎",
    symbol: "☵",
    lines: [0, 1, 0],
    element: "水",
    image: "水",
    advice: "风险、信息、流动和情绪弹性。",
  },
  {
    key: "100",
    name: "艮",
    symbol: "☶",
    lines: [0, 0, 1],
    element: "土",
    image: "山",
    advice: "停止、边界、复盘和守住节奏。",
  },
  {
    key: "000",
    name: "坤",
    symbol: "☷",
    lines: [0, 0, 0],
    element: "土",
    image: "地",
    advice: "承载、配合、落地和稳步积累。",
  },
];

const elementGenerates: Record<Wuxing, Wuxing> = {
  木: "火",
  火: "土",
  土: "金",
  金: "水",
  水: "木",
};

const elementControls: Record<Wuxing, Wuxing> = {
  木: "土",
  土: "水",
  水: "火",
  火: "金",
  金: "木",
};

function hashToBytes(seed: string) {
  return createHash("sha256").update(seed).digest();
}

function getTrigram(lines: number[]) {
  const key = lines.join("");
  const trigram = trigrams.find((item) => item.key === key);

  if (!trigram) {
    throw new Error(`Unknown trigram: ${key}`);
  }

  return trigram;
}

function detectTopic(question: string) {
  if (/感情|关系|复合|对方|婚|恋|喜欢/.test(question)) {
    return "关系";
  }

  if (/事业|工作|项目|跳槽|创业|老板|同事/.test(question)) {
    return "事业";
  }

  if (/钱|财|收入|投资|买|卖|合作/.test(question)) {
    return "财务";
  }

  if (/选择|要不要|是否|还是|决策|机会/.test(question)) {
    return "选择";
  }

  return "综合";
}

function elementRelation(upper: Wuxing, lower: Wuxing) {
  if (upper === lower) {
    return "同气";
  }

  if (elementGenerates[lower] === upper) {
    return "内生外";
  }

  if (elementGenerates[upper] === lower) {
    return "外生内";
  }

  if (elementControls[lower] === upper) {
    return "内克外";
  }

  if (elementControls[upper] === lower) {
    return "外克内";
  }

  return "相持";
}

function relationAdvice(relation: string) {
  if (relation === "同气") {
    return "内外能量一致，适合把重点放在聚焦和持续推进。";
  }

  if (relation === "内生外") {
    return "内在准备能推动外部结果，先补资源，再争取机会。";
  }

  if (relation === "外生内") {
    return "外部环境对你有助力，适合借势，但要避免完全依赖他人。";
  }

  if (relation === "内克外") {
    return "你对外部局势有控制欲或推进力，适合定边界，但别急于硬碰硬。";
  }

  if (relation === "外克内") {
    return "外部压力明显，先降风险、补信息，再做承诺。";
  }

  return "局势有拉扯，适合先定时间窗口和可验证的小目标。";
}

function movingLineAdvice(line: number) {
  const position = ["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"][line - 1];
  const advice = [
    "事情刚起头，先看动机和底层条件。",
    "进入可执行阶段，适合寻找稳定支持。",
    "中段容易反复，避免情绪化推进。",
    "外部变量变多，需要调整策略和沟通方式。",
    "核心位置被触动，适合做关键决定但要保留余地。",
    "已到尾声或临界点，适合收束、复盘或换路径。",
  ][line - 1];

  return { position, advice };
}

export function generateBagua(input: BaguaInput) {
  const dayKey = new Date().toISOString().slice(0, 10);
  const seed = `${input.userId}:${input.question}:${input.timeframe ?? ""}:${dayKey}`;
  const bytes = hashToBytes(seed);
  const lines = Array.from({ length: 6 }, (_, index) => bytes[index] % 2) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const movingLine = (bytes[6] % 6) + 1;
  const changedLines = [...lines] as typeof lines;

  changedLines[movingLine - 1] = changedLines[movingLine - 1] === 1 ? 0 : 1;

  const lower = getTrigram(lines.slice(0, 3));
  const upper = getTrigram(lines.slice(3, 6));
  const changedLower = getTrigram(changedLines.slice(0, 3));
  const changedUpper = getTrigram(changedLines.slice(3, 6));
  const relation = elementRelation(upper.element, lower.element);
  const changedRelation = elementRelation(changedUpper.element, changedLower.element);
  const moving = movingLineAdvice(movingLine);

  return {
    input,
    topic: detectTopic(input.question),
    lines,
    movingLine,
    moving,
    mainHexagram: {
      name: `${upper.name}上${lower.name}下`,
      upper,
      lower,
      relation,
      relationAdvice: relationAdvice(relation),
    },
    changedHexagram: {
      name: `${changedUpper.name}上${changedLower.name}下`,
      upper: changedUpper,
      lower: changedLower,
      relation: changedRelation,
      relationAdvice: relationAdvice(changedRelation),
    },
  };
}

export function buildBaguaReading(result: ReturnType<typeof generateBagua>) {
  const focus = result.input.question.trim();
  const timeframe = result.input.timeframe?.trim() || "未限定";
  const summary = `围绕「${focus}」，本次起得本卦「${result.mainHexagram.name}」，动爻为${result.moving.position}，变卦为「${result.changedHexagram.name}」。`;
  const content = [
    summary,
    `问题类型：${result.topic}。观察时间：${timeframe}。`,
    `本卦：上卦${result.mainHexagram.upper.name}为${result.mainHexagram.upper.image}，五行为${result.mainHexagram.upper.element}；下卦${result.mainHexagram.lower.name}为${result.mainHexagram.lower.image}，五行为${result.mainHexagram.lower.element}。内外关系为「${result.mainHexagram.relation}」，${result.mainHexagram.relationAdvice}`,
    `动爻：${result.moving.position}发动，提示：${result.moving.advice}`,
    `变卦：${result.changedHexagram.name}，内外关系转为「${result.changedHexagram.relation}」。${result.changedHexagram.relationAdvice}`,
    `行动建议：如果这是${result.topic}问题，先把决定拆成一个可验证的小动作，在 ${timeframe} 内观察反馈，不要只靠一次情绪波动下判断。`,
    "本报告仅供娱乐、文化参考和自我探索，不构成医疗、投资、法律或重大人生决策建议。",
  ].join("\n\n");

  return {
    title: "八卦问事",
    summary,
    content,
  };
}
