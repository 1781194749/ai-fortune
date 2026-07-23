import "server-only";

import { createHash } from "crypto";

export type BaguaInput = {
  question: string;
  timeframe?: string;
  userId: string;
};

type Wuxing = "木" | "火" | "土" | "金" | "水";
type BaguaTopic = "关系" | "事业" | "财务" | "选择" | "健康" | "综合";

type Trigram = {
  key: string;
  name: string;
  symbol: string;
  lines: [number, number, number];
  element: Wuxing;
  image: string;
  advice: string;
};

type HexagramDefinition = {
  number: number;
  name: string;
  upper: string;
  lower: string;
  nature: string;
  judgment: string;
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
    key: "110",
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
    key: "100",
    name: "震",
    symbol: "☳",
    lines: [1, 0, 0],
    element: "木",
    image: "雷",
    advice: "启动、突破、先行动再校准。",
  },
  {
    key: "011",
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
    key: "001",
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

const hexagramSeeds = [
  [1, "乾为天", "乾", "乾", "纯阳健行", "势能充足，利于主动开局和承担领导责任。", "天行健，自强不息。", "可以推进，但必须把目标、规则和边界讲清楚。"],
  [2, "坤为地", "坤", "坤", "纯阴承载", "重在接纳、配合和积累，不宜抢先硬冲。", "地势坤，厚德载物。", "先稳基本盘，借助团队和长期耐心。"],
  [3, "水雷屯", "坎", "震", "始生多阻", "新局初成但阻力明显，开头难是常态。", "云雷屯，君子经纶。", "先处理风险和资源，再谈速度。"],
  [4, "山水蒙", "艮", "坎", "启蒙求明", "信息不足，需要学习、请教和建立判断。", "山下出泉，蒙。", "不要急着定论，先补知识和证据。"],
  [5, "水天需", "坎", "乾", "等待时机", "有实力但前方有险，宜等待条件成熟。", "云上于天，需。", "准备充分，设时间窗口等待。"],
  [6, "天水讼", "乾", "坎", "争讼分歧", "立场冲突明显，容易进入争辩或合同纠纷。", "天与水违行，讼。", "先定事实和边界，避免情绪化对抗。"],
  [7, "地水师", "坤", "坎", "组织用众", "需要纪律、团队和明确指挥来过险。", "地中有水，师。", "用制度和协同解决，不宜单兵冒进。"],
  [8, "水地比", "坎", "坤", "亲比结盟", "适合靠近可靠资源，建立互信和联盟。", "地上有水，比。", "选择可信的人同行，先看长期一致性。"],
  [9, "风天小畜", "巽", "乾", "小有蓄积", "力量被温和约束，适合小步积累。", "风行天上，小畜。", "先攒筹码，不急着一次突破。"],
  [10, "天泽履", "乾", "兑", "谨慎履险", "面对强势规则，要靠礼、分寸和谨慎前行。", "上天下泽，履。", "保持礼貌和边界，少冒犯权威。"],
  [11, "地天泰", "坤", "乾", "通泰交融", "上下相通，局势顺畅，利合作与推进。", "天地交，泰。", "趁通畅推进，但别放松管理。"],
  [12, "天地否", "乾", "坤", "闭塞不通", "上下不交，沟通卡住，短期难硬推。", "天地不交，否。", "先保守，等通道打开再加码。"],
  [13, "天火同人", "乾", "离", "同道聚合", "适合公开协作、寻找同盟和价值观对齐。", "天与火，同人。", "把共同目标说清楚，凝聚同路人。"],
  [14, "火天大有", "离", "乾", "资源丰盛", "资源、可见度和成果较强，利于展示。", "火在天上，大有。", "善用优势，也要防止骄满。"],
  [15, "地山谦", "坤", "艮", "谦退得益", "低姿态、守分寸反而有利。", "地中有山，谦。", "收敛锋芒，用稳健赢得支持。"],
  [16, "雷地豫", "震", "坤", "动而有备", "情绪和动能被激发，适合预备后行动。", "雷出地奋，豫。", "先做动员和计划，别只凭兴奋。"],
  [17, "泽雷随", "兑", "震", "顺势跟随", "顺应变化、跟随强信号比固执更有利。", "泽中有雷，随。", "看清趋势后跟进，不要盲从。"],
  [18, "山风蛊", "艮", "巽", "整顿旧弊", "旧问题累积，需要修复、清理和重建。", "山下有风，蛊。", "先治旧病，再谈增长。"],
  [19, "地泽临", "坤", "兑", "临近成长", "机会靠近，适合主动照看和扩大影响。", "泽上有地，临。", "趁势靠近关键对象，但要持续。"],
  [20, "风地观", "巽", "坤", "观察取象", "局势适合观察、审视和建立判断。", "风行地上，观。", "先看全局和长期行为，再决定。"],
  [21, "火雷噬嗑", "离", "震", "咬合除障", "有阻隔必须被处理，适合断案、执行和清障。", "雷电噬嗑。", "明确规则，解决卡点，不要拖。"],
  [22, "山火贲", "艮", "离", "文饰成形", "外在呈现重要，但不能只有包装。", "山下有火，贲。", "美化表达可以，但内核要扎实。"],
  [23, "山地剥", "艮", "坤", "剥落衰退", "基础被削弱，适合止损和保护核心。", "山附于地，剥。", "减少投入，保住底层资源。"],
  [24, "地雷复", "坤", "震", "一阳来复", "低点后开始回升，适合重新启动。", "雷在地中，复。", "小步回归，不要急着证明结果。"],
  [25, "天雷无妄", "乾", "震", "无妄守正", "顺正道而动，最忌妄想和侥幸。", "天下雷行，无妄。", "回到真实动机和事实，不走偏门。"],
  [26, "山天大畜", "艮", "乾", "大蓄待发", "能力和资源被蓄积，适合先养后发。", "天在山中，大畜。", "沉住气，储备够了再出手。"],
  [27, "山雷颐", "艮", "震", "养正养口", "重点在滋养、输入和说话方式。", "山下有雷，颐。", "管住消耗，选择真正滋养你的事。"],
  [28, "泽风大过", "兑", "巽", "过重失衡", "压力过载，结构承重已经偏高。", "泽灭木，大过。", "先减压和分担，避免硬撑断裂。"],
  [29, "坎为水", "坎", "坎", "重险习坎", "险象重复，需要经验、信息和心理韧性。", "水洊至，习坎。", "一步一验，不要冒险跨越。"],
  [30, "离为火", "离", "离", "重明附丽", "清晰、表达和依附关系是关键。", "明两作，离。", "把事情照亮，也要找到稳定依托。"],
  [31, "泽山咸", "兑", "艮", "感应相吸", "彼此有感应，适合柔性沟通。", "山上有泽，咸。", "真诚回应，不要操控情绪。"],
  [32, "雷风恒", "震", "巽", "恒久持续", "长期稳定和持续执行是重点。", "雷风，恒。", "少折腾，用可持续节奏见成果。"],
  [33, "天山遁", "乾", "艮", "退避保身", "形势不利硬拼，适合退守和保存实力。", "天下有山，遁。", "主动后撤不是失败，是保留选择权。"],
  [34, "雷天大壮", "震", "乾", "壮势需正", "力量强，但越强越要守正。", "雷在天上，大壮。", "可以强推，但要防过猛。"],
  [35, "火地晋", "离", "坤", "进升显达", "曝光和上升机会出现，利于被看见。", "明出地上，晋。", "积极展示成果，争取支持。"],
  [36, "地火明夷", "坤", "离", "明入地中", "光被遮蔽，才华或真相暂时受压。", "明入地中，明夷。", "低调保护自己，等待环境转明。"],
  [37, "风火家人", "巽", "离", "内外有序", "关系、团队和家庭规则需要各安其位。", "风自火出，家人。", "先正内部秩序，再谈外部推进。"],
  [38, "火泽睽", "离", "兑", "异中求同", "分歧明显，但未必不能合作。", "上火下泽，睽。", "承认不同，找最小共识。"],
  [39, "水山蹇", "坎", "艮", "遇险止步", "前路艰难，宜求助、绕行或暂缓。", "山上有水，蹇。", "先找帮手，别独自硬闯。"],
  [40, "雷水解", "震", "坎", "解困释放", "困局有松动，适合解除压力。", "雷雨作，解。", "抓住松动点，尽快化解误会。"],
  [41, "山泽损", "艮", "兑", "减损成益", "适合减少、取舍和优化结构。", "山下有泽，损。", "舍小保大，减少不必要消耗。"],
  [42, "风雷益", "巽", "震", "增益扶助", "有增长、助力和扩大空间。", "风雷，益。", "把助力转为具体行动，不要空想。"],
  [43, "泽天夬", "兑", "乾", "决断去弊", "需要公开决断，清除阻滞。", "泽上于天，夬。", "说清底线，果断处理关键问题。"],
  [44, "天风姤", "乾", "巽", "偶遇相逢", "突发相遇带来机会，也有诱惑。", "天下有风，姤。", "可以接触，但先看边界和代价。"],
  [45, "泽地萃", "兑", "坤", "聚集成群", "资源、人气或问题正在聚集。", "泽上于地，萃。", "组织人和资源，防止只热闹无结果。"],
  [46, "地风升", "坤", "巽", "渐升上行", "柔性累积带来上升机会。", "地中生木，升。", "稳扎稳打，向上争取。"],
  [47, "泽水困", "兑", "坎", "困厄守心", "外在受困，内在定力很重要。", "泽无水，困。", "先降期待，守住核心资源。"],
  [48, "水风井", "坎", "巽", "井养不迁", "基础资源稳定，关键是修井取水。", "木上有水，井。", "改善系统和渠道，让资源可持续。"],
  [49, "泽火革", "兑", "离", "变革去旧", "旧模式需要改革，变动不可避免。", "泽中有火，革。", "先取得共识，再启动变革。"],
  [50, "火风鼎", "离", "巽", "鼎新承载", "适合重组资源、升级系统和建立新秩序。", "木上有火，鼎。", "把变化落成制度和可复制流程。"],
  [51, "震为雷", "震", "震", "震动惊醒", "突发变化强，适合醒悟和启动。", "洊雷，震。", "先稳心神，再迅速处理最关键事项。"],
  [52, "艮为山", "艮", "艮", "止定守界", "停止、边界和复盘比推进更重要。", "兼山，艮。", "该停则停，别把停顿误解为失败。"],
  [53, "风山渐", "巽", "艮", "渐进成序", "进展缓慢但有序，利长期关系和阶段成长。", "山上有木，渐。", "按阶段推进，不要催熟。"],
  [54, "雷泽归妹", "震", "兑", "失序嫁妹", "关系或合作位置不正，容易被动。", "泽上有雷，归妹。", "先校正身份、承诺和条件。"],
  [55, "雷火丰", "震", "离", "盛大丰盈", "高峰期资源旺盛，但盛极易转。", "雷电皆至，丰。", "趁高峰完成关键交付，也要准备收束。"],
  [56, "火山旅", "离", "艮", "旅居暂处", "处在过渡和外地感中，宜守礼谨慎。", "山上有火，旅。", "别把临时状态当永久承诺。"],
  [57, "巽为风", "巽", "巽", "柔入渗透", "柔性影响、长期渗透和策略沟通有效。", "随风，巽。", "用持续和细节推进，不硬碰硬。"],
  [58, "兑为泽", "兑", "兑", "悦言互通", "沟通、人情和愉悦感突出。", "丽泽，兑。", "善用沟通，但别只听好听话。"],
  [59, "风水涣", "巽", "坎", "涣散重聚", "分散、误会或距离需要重新凝聚。", "风行水上，涣。", "先打通信息，再重建共同目标。"],
  [60, "水泽节", "坎", "兑", "节制有度", "需要限制、规则和分寸。", "泽上有水，节。", "设预算、边界和截止时间。"],
  [61, "风泽中孚", "巽", "兑", "诚信感通", "诚信、信任和内外一致是关键。", "泽上有风，中孚。", "用真实行动建立信任，不靠试探。"],
  [62, "雷山小过", "震", "艮", "小过谨行", "小事可过，大事需谨慎。", "山上有雷，小过。", "做小调整，别做大冒险。"],
  [63, "水火既济", "坎", "离", "已成防乱", "阶段完成，但完成后更要防失衡。", "水在火上，既济。", "收尾、复盘和维护比继续冲刺重要。"],
  [64, "火水未济", "离", "坎", "未成待渡", "事情尚未完成，最后一步仍有险。", "火在水上，未济。", "不要急着宣布成功，先补最后缺口。"],
] satisfies Array<[number, string, string, string, string, string, string, string]>;

const hexagrams = hexagramSeeds.map(
  ([number, name, upper, lower, nature, judgment, image, advice]) => ({
    number,
    name,
    upper,
    lower,
    nature,
    judgment,
    image,
    advice,
  }),
) satisfies HexagramDefinition[];

const hexagramByTrigrams = new Map(hexagrams.map((item) => [`${item.upper}:${item.lower}`, item]));

if (hexagrams.length !== 64 || hexagramByTrigrams.size !== 64) {
  throw new Error("Bagua hexagram table must contain all 64 unique hexagrams before launch.");
}

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

const lineRoles = [
  { position: "初爻", stage: "起点", role: "事情刚起头，底层动机和基础条件最关键。" },
  { position: "二爻", stage: "内在执行", role: "进入可执行层，适合找稳定支持和可落地步骤。" },
  { position: "三爻", stage: "内外交界", role: "内外交界处容易反复，最忌情绪化推进。" },
  { position: "四爻", stage: "外部变量", role: "外部环境开始介入，需要调整策略和沟通方式。" },
  { position: "五爻", stage: "核心位置", role: "核心位置被触动，适合做关键判断但要留余地。" },
  { position: "上爻", stage: "尾声临界", role: "已到尾声或临界点，适合收束、复盘或换路径。" },
] as const;

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

function getHexagram(upper: Trigram, lower: Trigram) {
  const hexagram = hexagramByTrigrams.get(`${upper.name}:${lower.name}`);

  if (!hexagram) {
    throw new Error(`Unknown hexagram: ${upper.name}:${lower.name}`);
  }

  return hexagram;
}

function detectTopic(question: string): BaguaTopic {
  if (
    /二选一|选择|选哪(?:个|一个)?|哪个更|哪一个更|要不要|是否|还是|决策|该不该|能不能/i.test(
      question,
    )
  ) {
    return "选择";
  }

  if (/感情|关系|复合|对方|婚|恋|喜欢/.test(question)) {
    return "关系";
  }

  if (/事业|工作|项目|跳槽|创业|老板|同事|offer|岗位/.test(question)) {
    return "事业";
  }

  if (/钱|财|收入|投资|买|卖|合作|合同|副业/.test(question)) {
    return "财务";
  }

  if (/健康|身体|睡眠|压力|状态|焦虑/.test(question)) {
    return "健康";
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

function topicAdvice(topic: BaguaTopic, definition: HexagramDefinition) {
  if (topic === "关系") {
    return `${definition.name}落在关系里，重点是回应质量、边界和承诺是否与卦意一致。`;
  }

  if (topic === "事业") {
    return `${definition.name}落在事业里，先看资源、位置、节奏和外部规则能否支撑推进。`;
  }

  if (topic === "财务") {
    return `${definition.name}落在财务里，优先确认现金流、合同、风险和退出条件。`;
  }

  if (topic === "健康") {
    return `${definition.name}落在身心状态里，适合把它理解为节奏、压力和恢复方式的提醒。`;
  }

  if (topic === "选择") {
    return `${definition.name}落在选择题里，重点不是立刻定输赢，而是看哪条路更符合当前时机。`;
  }

  return `${definition.name}提示先回到卦意本身，再结合现实证据判断。`;
}

function buildHexagramSnapshot(lines: [number, number, number, number, number, number], topic: BaguaTopic) {
  const lower = getTrigram(lines.slice(0, 3));
  const upper = getTrigram(lines.slice(3, 6));
  const definition = getHexagram(upper, lower);
  const relation = elementRelation(upper.element, lower.element);

  return {
    number: definition.number,
    name: definition.name,
    nature: definition.nature,
    judgment: definition.judgment,
    image: definition.image,
    advice: definition.advice,
    topicAdvice: topicAdvice(topic, definition),
    upper,
    lower,
    relation,
    relationAdvice: relationAdvice(relation),
  };
}

function asSixLines(lines: number[]) {
  if (lines.length !== 6) {
    throw new Error("Hexagram lines must contain six values.");
  }

  return lines as [number, number, number, number, number, number];
}

function invertLines(lines: [number, number, number, number, number, number]) {
  return asSixLines(lines.map((line) => (line === 1 ? 0 : 1)));
}

function reverseLines(lines: [number, number, number, number, number, number]) {
  return asSixLines([...lines].reverse());
}

function mutualLines(lines: [number, number, number, number, number, number]) {
  return asSixLines([lines[1], lines[2], lines[3], lines[2], lines[3], lines[4]]);
}

function movingLineAdvice(input: {
  line: number;
  active: boolean;
  main: ReturnType<typeof buildHexagramSnapshot>;
  changed: ReturnType<typeof buildHexagramSnapshot>;
  topic: BaguaTopic;
}) {
  const role = lineRoles[input.line - 1];
  const yinYang = input.active ? "阳爻" : "阴爻";
  const movement = input.active ? "由阳转阴，表示外放力量需要收束。" : "由阴转阳，表示被动条件开始转为行动。";

  return {
    position: role.position,
    stage: role.stage,
    yinYang,
    role: role.role,
    text: `${input.main.name}${role.position}发动，${movement}${topicAdvice(input.topic, {
      number: input.main.number,
      name: input.main.name,
      upper: input.main.upper.name,
      lower: input.main.lower.name,
      nature: input.main.nature,
      judgment: input.main.judgment,
      image: input.main.image,
      advice: input.main.advice,
    })}`,
    advice: `${role.role}${input.changed.name}作为变卦，提示后续要转向「${input.changed.nature}」：${input.changed.advice}`,
  };
}

function buildYao(lines: [number, number, number, number, number, number], movingLine: number) {
  return lines.map((line, index) => ({
    index: index + 1,
    position: lineRoles[index].position,
    stage: lineRoles[index].stage,
    yinYang: line === 1 ? "阳爻" : "阴爻",
    active: line === 1,
    moving: movingLine === index + 1,
    role: lineRoles[index].role,
  }));
}

export function generateBagua(input: BaguaInput, readingSeed = "") {
  const dayKey = new Date().toISOString().slice(0, 10);
  const seed = `${input.userId}:${input.question}:${input.timeframe ?? ""}:${dayKey}:${readingSeed}`;
  const bytes = hashToBytes(seed);
  const lines = asSixLines(Array.from({ length: 6 }, (_, index) => bytes[index] % 2));
  const movingLine = (bytes[6] % 6) + 1;
  const changedLines = [...lines] as typeof lines;
  const topic = detectTopic(input.question);

  changedLines[movingLine - 1] = changedLines[movingLine - 1] === 1 ? 0 : 1;

  const mainHexagram = buildHexagramSnapshot(lines, topic);
  const changedHexagram = buildHexagramSnapshot(changedLines, topic);
  const mutualHexagram = buildHexagramSnapshot(mutualLines(lines), topic);
  const oppositeHexagram = buildHexagramSnapshot(invertLines(lines), topic);
  const reversedHexagram = buildHexagramSnapshot(reverseLines(lines), topic);
  const moving = movingLineAdvice({
    line: movingLine,
    active: lines[movingLine - 1] === 1,
    main: mainHexagram,
    changed: changedHexagram,
    topic,
  });
  const choiceDirection = topic === "选择"
    ? /(?:A|Ａ).*?(?:B|Ｂ)|(?:B|Ｂ).*?(?:A|Ａ)/i.test(input.question)
      ? `选择方向：当前更适合优先验证选项 ${bytes[7] % 2 === 0 ? "A" : "B"}，先用一个可回滚的小动作确认资源、边界和真实反馈；若关键条件不满足，再回到另一项比较。`
      : ["同气", "内生外"].includes(mainHexagram.relation)
        ? "选择方向：当前更适合先推进并做低成本验证，再根据外部反馈加码。"
        : "选择方向：当前更适合先补信息、设停止条件，再决定是否推进。"
    : undefined;

  return {
    input,
    topic,
    lines,
    yao: buildYao(lines, movingLine),
    movingLine,
    moving,
    choiceDirection,
    mainHexagram,
    changedHexagram,
    mutualHexagram,
    oppositeHexagram,
    reversedHexagram,
    audit: {
      method: "six-line-hash",
      hexagramTableSize: hexagrams.length,
      hasFullHexagramTable: hexagrams.length === 64,
    },
  };
}

export function buildBaguaReading(result: ReturnType<typeof generateBagua>) {
  const focus = result.input.question.trim();
  const timeframe = result.input.timeframe?.trim() || "当前时间窗口";
  const summary = `围绕「${focus}」，本次起得第 ${result.mainHexagram.number} 卦「${result.mainHexagram.name}」，动爻为${result.moving.position}，变卦为第 ${result.changedHexagram.number} 卦「${result.changedHexagram.name}」。`;
  const content = [
    summary,
    `问事主题：${result.topic}；观察时间：${timeframe}。`,
    `本卦：${result.mainHexagram.upper.symbol}${result.mainHexagram.upper.name}上 / ${result.mainHexagram.lower.symbol}${result.mainHexagram.lower.name}下，卦意为「${result.mainHexagram.nature}」。${result.mainHexagram.judgment}${result.mainHexagram.topicAdvice}`,
    `内外关系：上卦五行为${result.mainHexagram.upper.element}，下卦五行为${result.mainHexagram.lower.element}，关系为「${result.mainHexagram.relation}」。${result.mainHexagram.relationAdvice}`,
    `动爻：${result.moving.position}（${result.moving.yinYang}）发动。${result.moving.text}${result.moving.advice}`,
    `变卦：${result.changedHexagram.name}，卦意为「${result.changedHexagram.nature}」。${result.changedHexagram.judgment}${result.changedHexagram.relationAdvice}`,
    `互卦：${result.mutualHexagram.name}，看事情内部结构和隐含过程，提示「${result.mutualHexagram.nature}」。`,
    `错卦：${result.oppositeHexagram.name}，看反面风险；综卦：${result.reversedHexagram.name}，看换位视角。两者用于校验盲点，不单独定吉凶。`,
    `行动建议：${result.mainHexagram.advice}${result.changedHexagram.advice}先用一个可验证的小动作观察现实反馈，再决定是否加码。`,
    result.choiceDirection ?? "",
    "边界提醒：八卦问事适合判断当前窗口、节奏和行动提醒，不应替代医疗、法律、投资或重大现实决策中的专业意见。",
  ].join("\n\n");

  return {
    title: "六十四卦问事详解",
    summary,
    content,
  };
}
