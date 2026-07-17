import "server-only";

import { Solar, type EightChar } from "lunar-typescript";

export type BaziInput = {
  name?: string;
  gender?: string;
  birthDate: string;
  birthTime: string;
  birthPlace?: string;
};

export type WuxingName = "木" | "火" | "土" | "金" | "水";
type YinYang = "阳" | "阴";
type PillarKey = "year" | "month" | "day" | "time";

const wuxingOrder: WuxingName[] = ["木", "火", "土", "金", "水"];
const stemElement: Record<string, WuxingName> = {
  甲: "木",
  乙: "木",
  丙: "火",
  丁: "火",
  戊: "土",
  己: "土",
  庚: "金",
  辛: "金",
  壬: "水",
  癸: "水",
};

const stemYinYang: Record<string, YinYang> = {
  甲: "阳",
  乙: "阴",
  丙: "阳",
  丁: "阴",
  戊: "阳",
  己: "阴",
  庚: "阳",
  辛: "阴",
  壬: "阳",
  癸: "阴",
};

const elementGenerates: Record<WuxingName, WuxingName> = {
  木: "火",
  火: "土",
  土: "金",
  金: "水",
  水: "木",
};

const elementControls: Record<WuxingName, WuxingName> = {
  木: "土",
  土: "水",
  水: "火",
  火: "金",
  金: "木",
};

const branchMainElement: Record<string, WuxingName> = {
  子: "水",
  丑: "土",
  寅: "木",
  卯: "木",
  辰: "土",
  巳: "火",
  午: "火",
  未: "土",
  申: "金",
  酉: "金",
  戌: "土",
  亥: "水",
};

const seasonElementByMonthBranch: Record<string, WuxingName> = {
  寅: "木",
  卯: "木",
  辰: "木",
  巳: "火",
  午: "火",
  未: "火",
  申: "金",
  酉: "金",
  戌: "金",
  亥: "水",
  子: "水",
  丑: "水",
};

const tenGodAdvice: Record<string, string> = {
  比肩: "重自我、同辈和主见，优势是坚持，风险是固执或单打独斗。",
  劫财: "重竞争、伙伴和资源流动，优势是冲劲，风险是冲动分利。",
  食神: "重表达、作品和舒展，优势是稳定输出，风险是贪舒适。",
  伤官: "重突破、表达和不服管，优势是创意，风险是顶撞规则。",
  偏财: "重机会、市场和外部资源，优势是灵活，风险是分散。",
  正财: "重现金流、责任和稳定收入，优势是踏实，风险是保守。",
  七杀: "重压力、目标和竞争，优势是抗压，风险是紧绷。",
  正官: "重规则、职位和长期信用，优势是秩序，风险是拘谨。",
  偏印: "重洞察、学习和非标经验，优势是敏感，风险是想太多。",
  正印: "重支持、学习和保护，优势是恢复力，风险是依赖。",
  日主: "日主代表本人，是整张命盘判断强弱和取用的中心。",
};

const wuxingSuggestions: Record<WuxingName, string> = {
  木: "用学习、规划、成长型关系和长期项目补木。",
  火: "用表达、曝光、运动、热情连接和公开反馈补火。",
  土: "用稳定节奏、边界感、储蓄、复盘和落地执行补土。",
  金: "用规则、判断、断舍离、专业标准和流程化补金。",
  水: "用休息、流动、信息收集、倾听和情绪弹性补水。",
};

const relationPairs = {
  sixHarmony: [
    ["子", "丑", "土"],
    ["寅", "亥", "木"],
    ["卯", "戌", "火"],
    ["辰", "酉", "金"],
    ["巳", "申", "水"],
    ["午", "未", "土"],
  ],
  clashes: [
    ["子", "午"],
    ["丑", "未"],
    ["寅", "申"],
    ["卯", "酉"],
    ["辰", "戌"],
    ["巳", "亥"],
  ],
  harms: [
    ["子", "未"],
    ["丑", "午"],
    ["寅", "巳"],
    ["卯", "辰"],
    ["申", "亥"],
    ["酉", "戌"],
  ],
  threeHarmony: [
    ["申", "子", "辰", "水"],
    ["亥", "卯", "未", "木"],
    ["寅", "午", "戌", "火"],
    ["巳", "酉", "丑", "金"],
  ],
} as const;

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

function createCounts() {
  return Object.fromEntries(wuxingOrder.map((item) => [item, 0])) as Record<WuxingName, number>;
}

function countVisibleWuxing(wuxingPillars: string[]) {
  const counts = createCounts();

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

function elementThatGenerates(target: WuxingName) {
  return wuxingOrder.find((element) => elementGenerates[element] === target) ?? "水";
}

function elementThatControls(target: WuxingName) {
  return wuxingOrder.find((element) => elementControls[element] === target) ?? "金";
}

function getTenGod(dayStem: string, targetStem: string) {
  const dayElement = stemElement[dayStem];
  const targetElement = stemElement[targetStem];
  const samePolarity = stemYinYang[dayStem] === stemYinYang[targetStem];

  if (!dayElement || !targetElement) {
    return "未知";
  }

  if (targetStem === dayStem) {
    return "日主";
  }

  if (targetElement === dayElement) {
    return samePolarity ? "比肩" : "劫财";
  }

  if (elementGenerates[dayElement] === targetElement) {
    return samePolarity ? "食神" : "伤官";
  }

  if (elementControls[dayElement] === targetElement) {
    return samePolarity ? "偏财" : "正财";
  }

  if (elementControls[targetElement] === dayElement) {
    return samePolarity ? "七杀" : "正官";
  }

  if (elementGenerates[targetElement] === dayElement) {
    return samePolarity ? "偏印" : "正印";
  }

  return "未知";
}

function tenGodElementRole(dayElement: WuxingName, element: WuxingName) {
  if (element === dayElement) return "同我";
  if (elementGenerates[element] === dayElement) return "生我";
  if (elementGenerates[dayElement] === element) return "我生";
  if (elementControls[dayElement] === element) return "我克";
  if (elementControls[element] === dayElement) return "克我";
  return "相持";
}

function normalizeGender(gender?: string) {
  const normalized = gender?.trim() ?? "";

  if (/女|female|woman|f\b/i.test(normalized)) {
    return { value: 0, label: "女命" };
  }

  if (/男|male|man|m\b/i.test(normalized)) {
    return { value: 1, label: "男命" };
  }

  return { value: 1, label: "未填写，按男命顺逆规则暂排" };
}

function buildWeightedCounts(pillars: Array<{ heavenlyStem: string; hiddenStems: string[] }>) {
  const counts = createCounts();

  for (const pillar of pillars) {
    const visibleElement = stemElement[pillar.heavenlyStem];

    if (visibleElement) {
      counts[visibleElement] += 1;
    }

    pillar.hiddenStems.forEach((stem, index) => {
      const element = stemElement[stem];
      const weight = index === 0 ? 0.7 : index === 1 ? 0.35 : 0.2;

      if (element) {
        counts[element] += weight;
      }
    });
  }

  return Object.fromEntries(
    wuxingOrder.map((element) => [element, Number(counts[element].toFixed(2))]),
  ) as Record<WuxingName, number>;
}

function evaluateDayMaster(input: {
  dayStem: string;
  monthBranch: string;
  weightedCounts: Record<WuxingName, number>;
  branches: string[];
}) {
  const element = stemElement[input.dayStem] ?? "木";
  const resourceElement = elementThatGenerates(element);
  const outputElement = elementGenerates[element];
  const wealthElement = elementControls[element];
  const officerElement = elementThatControls(element);
  const seasonElement = seasonElementByMonthBranch[input.monthBranch] ?? branchMainElement[input.monthBranch] ?? element;
  const supportScore =
    input.weightedCounts[element] * 1.2 +
    input.weightedCounts[resourceElement] * 0.9 +
    (seasonElement === element ? 1.4 : seasonElement === resourceElement ? 0.9 : 0) +
    input.branches.filter((branch) => branchMainElement[branch] === element).length * 0.5;
  const drainScore =
    input.weightedCounts[outputElement] * 0.8 +
    input.weightedCounts[wealthElement] +
    input.weightedCounts[officerElement] * 1.1;
  const balanceScore = Number((supportScore - drainScore).toFixed(2));
  const strengthLabel =
    balanceScore >= 2.2
      ? "身强"
      : balanceScore >= 0.8
        ? "偏强"
        : balanceScore <= -2.2
          ? "身弱"
          : balanceScore <= -0.8
            ? "偏弱"
            : "中和";
  const usefulElements =
    strengthLabel === "身强" || strengthLabel === "偏强"
      ? [outputElement, wealthElement, officerElement]
      : strengthLabel === "身弱" || strengthLabel === "偏弱"
        ? [resourceElement, element]
        : [resourceElement, outputElement];
  const avoidElements =
    strengthLabel === "身强" || strengthLabel === "偏强"
      ? [resourceElement, element]
      : strengthLabel === "身弱" || strengthLabel === "偏弱"
        ? [wealthElement, outputElement, officerElement]
        : [];

  return {
    stem: input.dayStem,
    element,
    yinYang: stemYinYang[input.dayStem] ?? "阳",
    seasonElement,
    supportScore: Number(supportScore.toFixed(2)),
    drainScore: Number(drainScore.toFixed(2)),
    balanceScore,
    strengthLabel,
    usefulElements: [...new Set(usefulElements)],
    avoidElements: [...new Set(avoidElements)],
    explanation:
      strengthLabel === "中和"
        ? "日主支持与消耗接近，取用更重视具体问题和当前阶段。"
        : strengthLabel === "身强" || strengthLabel === "偏强"
          ? "日主获得同类或印星支持较多，宜用输出、财星或官杀把能量导向结果。"
          : "日主承压或耗泄偏多，宜先补印比与稳定支持，再谈外部扩张。",
  };
}

function detectBranchRelations(branchValues: string[]) {
  const branchSet = new Set(branchValues);
  const relations: Array<{ type: string; branches: string[]; element?: string; advice: string }> = [];

  for (const [first, second, element] of relationPairs.sixHarmony) {
    if (branchSet.has(first) && branchSet.has(second)) {
      relations.push({
        type: "六合",
        branches: [first, second],
        element,
        advice: "有合化与协作信号，适合把资源整合成明确承诺。",
      });
    }
  }

  for (const [first, second] of relationPairs.clashes) {
    if (branchSet.has(first) && branchSet.has(second)) {
      relations.push({
        type: "六冲",
        branches: [first, second],
        advice: "冲动代表变化、迁移或对立，需要先稳住节奏和边界。",
      });
    }
  }

  for (const [first, second] of relationPairs.harms) {
    if (branchSet.has(first) && branchSet.has(second)) {
      relations.push({
        type: "六害",
        branches: [first, second],
        advice: "害象提示暗耗、误会或不明说的压力，适合把条件谈清楚。",
      });
    }
  }

  for (const [first, second, third, element] of relationPairs.threeHarmony) {
    const present = [first, second, third].filter((branch) => branchSet.has(branch));

    if (present.length >= 2) {
      relations.push({
        type: present.length === 3 ? "三合局" : "半合局",
        branches: present,
        element,
        advice: present.length === 3
          ? "三合成局，某类五行主题会被明显放大。"
          : "半合有成势倾向，但仍需要外部条件补齐。",
      });
    }
  }

  return relations;
}

function buildTenGodCounts(
  pillars: Array<{ stemTenGod: string; hiddenStems: Array<{ tenGod: string }> }>,
) {
  const counts: Record<string, number> = {};

  for (const pillar of pillars) {
    counts[pillar.stemTenGod] = (counts[pillar.stemTenGod] ?? 0) + 1;

    for (const hidden of pillar.hiddenStems) {
      counts[hidden.tenGod] = (counts[hidden.tenGod] ?? 0) + 0.5;
    }
  }

  return Object.fromEntries(
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([key, value]) => [key, Number(value.toFixed(1))]),
  );
}

function currentYear() {
  return new Date().getFullYear();
}

function yearGanZhi(year: number) {
  return Solar.fromYmdHms(year, 7, 1, 12, 0, 0).getLunar().getYearInGanZhiExact();
}

function summarizeLuckGanZhi(dayStem: string, ganZhi: string) {
  const gan = ganZhi[0] ?? "";
  const zhi = ganZhi[1] ?? "";
  const ganElement = stemElement[gan];
  const zhiElement = branchMainElement[zhi];
  const role = ganElement ? tenGodElementRole(stemElement[dayStem] ?? "木", ganElement) : "未知";
  const tenGod = gan ? getTenGod(dayStem, gan) : "";

  return {
    gan,
    zhi,
    ganElement,
    zhiElement,
    tenGod,
    role,
  };
}

function buildLuck(input: {
  eightChar: EightChar;
  genderValue: number;
  dayStem: string;
  natalBranches: string[];
}) {
  const year = currentYear();
  const yun = input.eightChar.getYun(input.genderValue);
  const daYun = yun.getDaYun(10).slice(1).map((item) => {
    const ganZhi = item.getGanZhi();
    const summary = summarizeLuckGanZhi(input.dayStem, ganZhi);

    return {
      index: item.getIndex(),
      startYear: item.getStartYear(),
      endYear: item.getEndYear(),
      startAge: item.getStartAge(),
      endAge: item.getEndAge(),
      ganZhi,
      xun: item.getXun(),
      xunKong: item.getXunKong(),
      phase: year >= item.getStartYear() && year <= item.getEndYear()
        ? "current"
        : year > item.getEndYear()
          ? "past"
          : "future",
      ...summary,
      advice: summary.tenGod
        ? `${ganZhi}大运透出「${summary.tenGod}」，重点看${tenGodAdvice[summary.tenGod] ?? "阶段资源和责任变化"}`
        : "起运前后以原局基础为主，先看家庭、学习和底层节奏。",
    };
  });
  const annual = Array.from({ length: 6 }, (_, index) => {
    const flowYear = year + index;
    const ganZhi = yearGanZhi(flowYear);
    const summary = summarizeLuckGanZhi(input.dayStem, ganZhi);
    const branchHits = input.natalBranches
      .filter((branch) => branch === summary.zhi)
      .map((branch) => `${branch}伏吟`);

    for (const [first, second] of relationPairs.clashes) {
      if (summary.zhi && ((summary.zhi === first && input.natalBranches.includes(second)) || (summary.zhi === second && input.natalBranches.includes(first)))) {
        branchHits.push(`${summary.zhi}${summary.zhi === first ? second : first}冲`);
      }
    }

    return {
      year: flowYear,
      ganZhi,
      ...summary,
      branchSignals: branchHits,
      advice: summary.tenGod
        ? `${flowYear} 年以「${summary.tenGod}」为显性主题，${branchHits.length > 0 ? `同时触发 ${branchHits.join("、")}。` : "可结合当年目标做节奏调整。"}`
        : "年度干支需要结合当年现实目标观察。",
    };
  });

  return {
    start: {
      years: yun.getStartYear(),
      months: yun.getStartMonth(),
      days: yun.getStartDay(),
      hours: yun.getStartHour(),
      solar: yun.getStartSolar().toYmd(),
      direction: yun.isForward() ? "顺行" : "逆行",
    },
    daYun,
    currentDaYun: daYun.find((item) => item.phase === "current") ?? daYun[0],
    annual,
  };
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
  const counts = countVisibleWuxing(wuxing);
  const genderRule = normalizeGender(input.gender);
  const pillarSources: Array<{
    key: PillarKey;
    label: string;
    ganzhi: string;
    gan: string;
    zhi: string;
    hiddenGan: string[];
    wuxing: string;
    naYin: string;
    diShi: string;
    xunKong: string;
    stemTenGod: string;
    hiddenTenGod: string[];
  }> = [
    {
      key: "year",
      label: "年柱",
      ganzhi: eightChar.getYear(),
      gan: eightChar.getYearGan(),
      zhi: eightChar.getYearZhi(),
      hiddenGan: eightChar.getYearHideGan(),
      wuxing: eightChar.getYearWuXing(),
      naYin: eightChar.getYearNaYin(),
      diShi: eightChar.getYearDiShi(),
      xunKong: eightChar.getYearXunKong(),
      stemTenGod: eightChar.getYearShiShenGan(),
      hiddenTenGod: eightChar.getYearShiShenZhi(),
    },
    {
      key: "month",
      label: "月柱",
      ganzhi: eightChar.getMonth(),
      gan: eightChar.getMonthGan(),
      zhi: eightChar.getMonthZhi(),
      hiddenGan: eightChar.getMonthHideGan(),
      wuxing: eightChar.getMonthWuXing(),
      naYin: eightChar.getMonthNaYin(),
      diShi: eightChar.getMonthDiShi(),
      xunKong: eightChar.getMonthXunKong(),
      stemTenGod: eightChar.getMonthShiShenGan(),
      hiddenTenGod: eightChar.getMonthShiShenZhi(),
    },
    {
      key: "day",
      label: "日柱",
      ganzhi: eightChar.getDay(),
      gan: eightChar.getDayGan(),
      zhi: eightChar.getDayZhi(),
      hiddenGan: eightChar.getDayHideGan(),
      wuxing: eightChar.getDayWuXing(),
      naYin: eightChar.getDayNaYin(),
      diShi: eightChar.getDayDiShi(),
      xunKong: eightChar.getDayXunKong(),
      stemTenGod: "日主",
      hiddenTenGod: eightChar.getDayShiShenZhi(),
    },
    {
      key: "time",
      label: "时柱",
      ganzhi: eightChar.getTime(),
      gan: eightChar.getTimeGan(),
      zhi: eightChar.getTimeZhi(),
      hiddenGan: eightChar.getTimeHideGan(),
      wuxing: eightChar.getTimeWuXing(),
      naYin: eightChar.getTimeNaYin(),
      diShi: eightChar.getTimeDiShi(),
      xunKong: eightChar.getTimeXunKong(),
      stemTenGod: eightChar.getTimeShiShenGan(),
      hiddenTenGod: eightChar.getTimeShiShenZhi(),
    },
  ];
  const pillars = pillarSources.map((pillar) => ({
    key: pillar.key,
    label: pillar.label,
    ganzhi: pillar.ganzhi,
    heavenlyStem: pillar.gan,
    earthlyBranch: pillar.zhi,
    stemElement: stemElement[pillar.gan],
    branchElement: branchMainElement[pillar.zhi],
    yinYang: stemYinYang[pillar.gan],
    wuxing: pillar.wuxing,
    naYin: pillar.naYin,
    diShi: pillar.diShi,
    xunKong: pillar.xunKong,
    stemTenGod: pillar.stemTenGod,
    hiddenStems: pillar.hiddenGan.map((stem, index) => ({
      stem,
      element: stemElement[stem],
      tenGod: pillar.hiddenTenGod[index] ?? getTenGod(eightChar.getDayGan(), stem),
    })),
  }));
  const hiddenInput = pillars.map((pillar) => ({
    heavenlyStem: pillar.heavenlyStem,
    hiddenStems: pillar.hiddenStems.map((item) => item.stem),
  }));
  const weightedCounts = buildWeightedCounts(hiddenInput);
  const ranked = rankElements(weightedCounts);
  const strongest = ranked[0] ?? "木";
  const weakestCount = weightedCounts[ranked[ranked.length - 1] ?? "木"];
  const weakest = [...ranked].reverse().filter((element) => weightedCounts[element] === weakestCount);
  const dayMaster = evaluateDayMaster({
    dayStem: eightChar.getDayGan(),
    monthBranch: eightChar.getMonthZhi(),
    weightedCounts,
    branches: pillars.map((pillar) => pillar.earthlyBranch),
  });
  const tenGodCounts = buildTenGodCounts(pillars);
  const branchRelations = detectBranchRelations(pillars.map((pillar) => pillar.earthlyBranch));
  const luck = buildLuck({
    eightChar,
    genderValue: genderRule.value,
    dayStem: eightChar.getDayGan(),
    natalBranches: pillars.map((pillar) => pillar.earthlyBranch),
  });

  return {
    input,
    solar: solar.toYmdHms(),
    lunar: lunar.toString(),
    zodiac: lunar.getYearShengXiao(),
    bazi,
    wuxing,
    counts,
    weightedCounts,
    strongest,
    weakest,
    pillars,
    dayMaster,
    tenGodCounts,
    branchRelations,
    luck,
    auxiliary: {
      taiYuan: eightChar.getTaiYuan(),
      taiYuanNaYin: eightChar.getTaiYuanNaYin(),
      taiXi: eightChar.getTaiXi(),
      taiXiNaYin: eightChar.getTaiXiNaYin(),
      mingGong: eightChar.getMingGong(),
      mingGongNaYin: eightChar.getMingGongNaYin(),
      shenGong: eightChar.getShenGong(),
      shenGongNaYin: eightChar.getShenGongNaYin(),
    },
    genderRule,
  };
}

export function buildBaziReading(result: ReturnType<typeof calculateBazi>) {
  const name = result.input.name?.trim() || "你";
  const weakestText = result.weakest.join("、");
  const usefulText = result.dayMaster.usefulElements.join("、");
  const avoidText = result.dayMaster.avoidElements.length > 0
    ? result.dayMaster.avoidElements.join("、")
    : "无明显单一忌向";
  const countText = wuxingOrder
    .map((element) => `${element}:${result.weightedCounts[element]}`)
    .join(" / ");
  const topTenGod = Object.entries(result.tenGodCounts)
    .filter(([god]) => god !== "日主")
    .slice(0, 3)
    .map(([god, count]) => `${god}${count}`)
    .join("、");
  const currentLuck = result.luck.currentDaYun;
  const branchRelationText = result.branchRelations.length > 0
    ? result.branchRelations
        .slice(0, 4)
        .map((relation) => `${relation.type}${relation.branches.join("")}${relation.element ? `化${relation.element}` : ""}`)
        .join("、")
    : "未见明显合冲刑害成组";
  const focusAdvice = result.dayMaster.usefulElements.map((element) => wuxingSuggestions[element]).join(" ");
  const annualText = result.luck.annual.slice(0, 3).map((item) => `${item.year}${item.ganZhi}`).join("、");
  const summary = `${name}的四柱为 ${result.bazi.join("、")}，日主为「${result.dayMaster.stem}${result.dayMaster.element}」，旺衰判断为「${result.dayMaster.strengthLabel}」。`;
  const content = [
    summary,
    `命盘结构：五行加权分布为 ${countText}；偏强为「${result.strongest}」，相对需要照顾「${weakestText}」。${result.dayMaster.explanation}`,
    `十神重点：${topTenGod || "十神分布较平均"}。这代表本盘在表达、资源、压力、财务或人际上的外显方式，需要结合具体问题使用。`,
    `藏干与地支：四柱地支关系显示「${branchRelationText}」。合象更利整合，冲害更提示变化、暗耗或边界议题。`,
    `喜用方向：优先照顾「${usefulText}」，谨慎过度放大「${avoidText}」。行动建议：${focusAdvice}`,
    currentLuck
      ? `大运节奏：${result.luck.start.direction}，起运约 ${result.luck.start.solar}；当前大运为「${currentLuck.ganZhi}」（${currentLuck.startYear}-${currentLuck.endYear}），${currentLuck.advice}`
      : `大运节奏：${result.luck.start.direction}，起运约 ${result.luck.start.solar}。`,
    `未来流年参考：${annualText}。流年只适合作阶段节奏观察，要结合实际选择、环境和长期反馈。`,
    `辅星参考：胎元 ${result.auxiliary.taiYuan}（${result.auxiliary.taiYuanNaYin}），命宫 ${result.auxiliary.mingGong}（${result.auxiliary.mingGongNaYin}），身宫 ${result.auxiliary.shenGong}（${result.auxiliary.shenGongNaYin}）。`,
    "本报告仅供娱乐、文化参考和自我探索，不构成医疗、投资、法律或重大人生决策建议。",
  ].join("\n\n");

  return {
    title: "八字命盘详析",
    summary,
    content,
  };
}
