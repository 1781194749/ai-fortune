import "server-only";

export type TarotTopic = "general" | "love" | "career" | "wealth" | "wellbeing" | "decision";
export type TarotArcana = "major" | "minor";
export type TarotSuit = "wands" | "cups" | "swords" | "pentacles";

export type TarotCard = {
  id: string;
  name: string;
  arcana: TarotArcana;
  suit?: TarotSuit;
  rank?: string;
  element?: string;
  keywords: string[];
  upright: string;
  reversed: string;
  advice: string;
  contexts: Record<TarotTopic, string>;
  visual: {
    code: string;
    symbol: string;
    tone: "spirit" | "fire" | "water" | "air" | "earth";
  };
};

function majorContexts(
  love: string,
  career: string,
  wealth: string,
  wellbeing: string,
  decision: string,
): Record<TarotTopic, string> {
  return {
    general: decision,
    love,
    career,
    wealth,
    wellbeing,
    decision,
  };
}

const majorArcana = [
  {
    id: "major-00-fool",
    name: "愚者",
    arcana: "major",
    keywords: ["新开始", "尝试", "自由", "未知"],
    upright: "新的开始、轻装上路、愿意尝试，局面还没有被旧经验完全限定。",
    reversed: "冲动、准备不足、忽略现实边界，容易把期待当成计划。",
    advice: "先允许自己看见机会，但别急着把所有筹码一次押上。",
    contexts: majorContexts(
      "关系里有新鲜感和试探，也需要确认对方是否愿意一起承担后果。",
      "适合探索新方向、投递、试水，但要先做小范围验证。",
      "不要被短期兴奋带着消费或投资，先设止损和预算。",
      "身心需要空间和松弛，别用逃离感替代真正休息。",
      "可以开始，但要用低成本动作验证，而不是直接跳进不可逆选择。",
    ),
    visual: { code: "00", symbol: "新", tone: "spirit" },
  },
  {
    id: "major-01-magician",
    name: "魔术师",
    arcana: "major",
    keywords: ["资源", "表达", "行动", "启动"],
    upright: "资源整合、表达力、行动开启，手边条件已经足够先动起来。",
    reversed: "分心、技巧被滥用、承诺过度，容易讲得比做得多。",
    advice: "把手边资源列清楚，先完成一个能产生反馈的小动作。",
    contexts: majorContexts(
      "吸引力来自清楚表达和主动安排，不是反复试探。",
      "适合主动提案、展示能力、推动项目进入第一轮反馈。",
      "现金、技能、人脉需要整合成一个清楚方案。",
      "把精力集中在一个具体习惯上，别同时开太多头。",
      "选能让你马上调用资源并看见反馈的那条路。",
    ),
    visual: { code: "01", symbol: "术", tone: "spirit" },
  },
  {
    id: "major-02-high-priestess",
    name: "女祭司",
    arcana: "major",
    keywords: ["直觉", "隐藏信息", "观察", "沉静"],
    upright: "直觉、隐藏信息、内在观察，答案暂时不适合被催促出来。",
    reversed: "压抑直觉、信息不透明、过度猜测，容易用脑补填空。",
    advice: "先不要急着定论，多观察对方的稳定行为。",
    contexts: majorContexts(
      "对方或你都有未说出口的部分，先看长期一致性。",
      "项目里还有信息差，适合调研、旁听和收集证据。",
      "合同、数据或真实成本需要再核对，不要只听口头承诺。",
      "情绪和睡眠在提示你放慢，身体比意志更诚实。",
      "暂缓表态，先补齐关键信息，再做判断。",
    ),
    visual: { code: "02", symbol: "隐", tone: "spirit" },
  },
  {
    id: "major-03-empress",
    name: "皇后",
    arcana: "major",
    keywords: ["滋养", "吸引力", "生长", "丰盛"],
    upright: "滋养、吸引力、关系生长，事物正在通过照料与回应变得更丰盛。",
    reversed: "消耗、边界松动、过度照顾，容易把付出变成透支。",
    advice: "照顾别人之前，先确认你自己的能量没有被透支。",
    contexts: majorContexts(
      "关系有温度和靠近空间，但要避免单方面照顾。",
      "创意、内容、服务型工作会因持续打磨而增长。",
      "收入来自长期养成的资产，不适合急功近利。",
      "需要补充睡眠、饮食和身体感受，恢复比硬撑重要。",
      "选能长期滋养你、而不是只让你证明价值的方案。",
    ),
    visual: { code: "03", symbol: "生", tone: "spirit" },
  },
  {
    id: "major-04-emperor",
    name: "皇帝",
    arcana: "major",
    keywords: ["秩序", "责任", "边界", "规则"],
    upright: "秩序、责任、明确规则，事情需要被结构化和稳定执行。",
    reversed: "控制、僵硬、权力拉扯，规则可能变成压迫或防御。",
    advice: "把期待说成规则，把情绪留给沟通而不是试探。",
    contexts: majorContexts(
      "关系需要清楚边界和责任分配，不要只靠默契。",
      "适合定目标、排优先级、明确谁负责什么。",
      "预算、合同和权责要写清楚，稳定比面子重要。",
      "身体需要规律，过度控制也会造成紧绷。",
      "选规则更清晰、责任更可控的方案。",
    ),
    visual: { code: "04", symbol: "序", tone: "spirit" },
  },
  {
    id: "major-05-hierophant",
    name: "教皇",
    arcana: "major",
    keywords: ["传统", "承诺", "学习", "制度"],
    upright: "传统经验、承诺、学习与制度支持，适合向成熟框架借力。",
    reversed: "教条、外界压力、形式大于真实，容易为了合群压住自己。",
    advice: "参考规则，但别把别人的标准直接当成你的答案。",
    contexts: majorContexts(
      "关系议题会落到承诺、家庭或价值观是否一致。",
      "适合培训、认证、师长建议或进入更正规的平台。",
      "稳健制度和长期规划优先于短线技巧。",
      "用稳定作息和专业建议帮助恢复，不要独自硬扛。",
      "选能通过规则、资质或长期信用积累优势的路径。",
    ),
    visual: { code: "05", symbol: "规", tone: "spirit" },
  },
  {
    id: "major-06-lovers",
    name: "恋人",
    arcana: "major",
    keywords: ["选择", "吸引", "价值观", "结合"],
    upright: "选择、吸引、价值观对齐，核心不是喜欢，而是能否共同承担。",
    reversed: "摇摆、诱惑、关系失衡，选择背后可能缺少一致承诺。",
    advice: "真正的问题不是喜不喜欢，而是能不能一起承担选择。",
    contexts: majorContexts(
      "吸引存在，但要看价值观、节奏和承诺是否同向。",
      "合作能打开空间，前提是目标和分工一致。",
      "财务合作要先谈清楚利益分配，别只凭信任。",
      "身心状态受关系牵动，需要诚实面对真实需求。",
      "选与你核心价值观更一致、也愿意承担后果的人或事。",
    ),
    visual: { code: "06", symbol: "合", tone: "spirit" },
  },
  {
    id: "major-07-chariot",
    name: "战车",
    arcana: "major",
    keywords: ["推进", "胜负心", "方向", "控制"],
    upright: "推进、掌控方向、克服阻力，适合集中火力往前冲。",
    reversed: "急躁、失控、方向分裂，越用力越容易偏离真正目标。",
    advice: "先定一个方向，不要同时追逐多个互相冲突的结果。",
    contexts: majorContexts(
      "关系里需要明确行动，而不是只停留在情绪拉扯。",
      "适合冲刺、竞争、谈判和拿结果，但要守住节奏。",
      "资金安排可以更主动，但不能忽视风险控制。",
      "精力消耗偏大，运动和休息要配套。",
      "选能让你集中推进且有明确胜负标准的方案。",
    ),
    visual: { code: "07", symbol: "进", tone: "spirit" },
  },
  {
    id: "major-08-strength",
    name: "力量",
    arcana: "major",
    keywords: ["耐心", "温柔", "韧性", "驯服"],
    upright: "温柔的坚持、耐心、内在力量，越重要越需要稳定推进。",
    reversed: "自我怀疑、压抑怒气、耗竭，可能把忍耐误当成成熟。",
    advice: "用稳定代替用力，越重要的事越需要慢慢推进。",
    contexts: majorContexts(
      "关系需要耐心沟通，也要承认自己的真实情绪。",
      "长期技能和信誉正在累积，别被短期挫折打断。",
      "适合稳健投入和慢慢修复现金流，不适合赌气决策。",
      "压力需要被温和释放，别把强撑当成答案。",
      "选能让你持续而不耗竭的路径。",
    ),
    visual: { code: "08", symbol: "韧", tone: "spirit" },
  },
  {
    id: "major-09-hermit",
    name: "隐者",
    arcana: "major",
    keywords: ["独处", "复盘", "答案", "沉淀"],
    upright: "独处、复盘、寻找答案，需要从噪音中退一步。",
    reversed: "逃避、孤立、拒绝求助，把沉默当成唯一答案。",
    advice: "留一点安静时间给自己，但别把沉默当成唯一答案。",
    contexts: majorContexts(
      "先看清自己真正要什么，再决定是否靠近或离开。",
      "适合研究、复盘和找导师，不急着曝光结果。",
      "财务上适合审账和减少冲动支出。",
      "需要独处恢复，但长期封闭会让问题变重。",
      "暂时不抢答，先复盘过往经验和真实证据。",
    ),
    visual: { code: "09", symbol: "灯", tone: "spirit" },
  },
  {
    id: "major-10-wheel",
    name: "命运之轮",
    arcana: "major",
    keywords: ["转机", "周期", "变化", "机会"],
    upright: "转机、周期变化、机会到来，局势正在进入新阶段。",
    reversed: "反复、卡点、被动等待，同样的模式可能再次出现。",
    advice: "变化会来，但你要提前准备能接住变化的位置。",
    contexts: majorContexts(
      "关系节奏会变化，重点是你们能否打破旧循环。",
      "机会窗口出现，但准备度决定能不能接住。",
      "市场或收入周期波动，适合预留缓冲。",
      "状态有起伏，别用一天的好坏定义长期趋势。",
      "选能顺势调整、且保留备选空间的方案。",
    ),
    visual: { code: "10", symbol: "轮", tone: "spirit" },
  },
  {
    id: "major-11-justice",
    name: "正义",
    arcana: "major",
    keywords: ["公平", "因果", "判断", "契约"],
    upright: "公平、因果、清晰判断，事实与责任会逐渐浮上台面。",
    reversed: "偏见、逃避责任、信息不全，判断可能被情绪带偏。",
    advice: "回到事实，不要只根据对方一句话或一次反应下结论。",
    contexts: majorContexts(
      "关系需要公平沟通和责任对等，不能只有一方承担。",
      "合同、绩效、流程和证据是关键。",
      "财务往来要留记录，避免口头约定变成纠纷。",
      "压力来自不公平感，需要清楚表达界限。",
      "选证据更充分、权责更对等的方案。",
    ),
    visual: { code: "11", symbol: "衡", tone: "spirit" },
  },
  {
    id: "major-12-hanged-man",
    name: "倒吊人",
    arcana: "major",
    keywords: ["暂停", "换角度", "等待", "牺牲"],
    upright: "暂停、换角度、等待，暂时放下控制反而能看清局面。",
    reversed: "无效牺牲、拖延、看不见回报，等待可能变成消耗。",
    advice: "如果你已经付出很多，就要确认这份等待是否仍有意义。",
    contexts: majorContexts(
      "关系里需要换位理解，但不能长期单方面牺牲。",
      "项目进入停顿期，适合重新审视方法而不是硬推。",
      "资金可能被占用，先确认流动性。",
      "身体在要求暂停，硬撑会拉长恢复时间。",
      "先延后不可逆决定，用新视角重新评估代价。",
    ),
    visual: { code: "12", symbol: "停", tone: "spirit" },
  },
  {
    id: "major-13-death",
    name: "死神",
    arcana: "major",
    keywords: ["结束", "转化", "清理", "重生"],
    upright: "结束、转化、清理旧模式，一段关系或阶段需要真正翻篇。",
    reversed: "抗拒结束、旧模式拖延、害怕改变，越抓越难重生。",
    advice: "把必须结束的部分说清楚，给新的秩序腾出位置。",
    contexts: majorContexts(
      "某种相处模式必须结束，才有机会重新定义关系。",
      "适合停止低效项目、调整岗位或砍掉沉没成本。",
      "清理亏损、无效支出和不再适合的资产。",
      "需要排毒式整理生活节奏，旧消耗不能继续。",
      "选能真正结束旧问题的方案，即使短期不舒服。",
    ),
    visual: { code: "13", symbol: "变", tone: "spirit" },
  },
  {
    id: "major-14-temperance",
    name: "节制",
    arcana: "major",
    keywords: ["调和", "修复", "平衡", "整合"],
    upright: "调和、修复、平衡，多个因素可以慢慢被整合成可持续方案。",
    reversed: "失衡、过量、节奏不一致，沟通或资源分配需要校准。",
    advice: "别追求一次到位，先把节奏调到双方都能承受。",
    contexts: majorContexts(
      "关系有修复空间，关键是节奏和边界都要温和稳定。",
      "适合跨团队协作、流程优化和渐进式调整。",
      "财务上要平衡收入、储蓄和必要投入。",
      "身心需要规律和适度，不适合极端方案。",
      "选能兼顾多个条件、且可持续迭代的方案。",
    ),
    visual: { code: "14", symbol: "和", tone: "spirit" },
  },
  {
    id: "major-15-devil",
    name: "恶魔",
    arcana: "major",
    keywords: ["执念", "诱惑", "束缚", "成瘾"],
    upright: "执念、诱惑、现实束缚，某个欲望或依赖正在放大影响。",
    reversed: "看见束缚、松绑、戒断旧模式，开始有机会拿回主动权。",
    advice: "先承认真正牵住你的是什么，再决定要不要继续付代价。",
    contexts: majorContexts(
      "强吸引不等于健康关系，要看是否伴随控制或依赖。",
      "利益、权力或短期回报很诱人，但可能有隐性代价。",
      "警惕高杠杆、债务、诱导消费和不透明收益。",
      "压力可能通过上瘾式行为释放，需要换成更健康的出口。",
      "别选只是满足短期欲望、却让你失去自由的方案。",
    ),
    visual: { code: "15", symbol: "缚", tone: "spirit" },
  },
  {
    id: "major-16-tower",
    name: "高塔",
    arcana: "major",
    keywords: ["崩塌", "真相", "突变", "重建"],
    upright: "突发变化、旧结构崩塌、真相显现，虚假的稳定会被打破。",
    reversed: "延迟爆发、害怕拆除、危机被压住但未解决。",
    advice: "别再维护明显不稳的结构，先保安全，再谈重建。",
    contexts: majorContexts(
      "关系中的隐患会显形，逃避只会让冲突更突然。",
      "项目或组织结构可能大调整，要准备应急方案。",
      "避免高风险投入，先保护现金流和基本盘。",
      "身体在用强烈信号提醒你停下，不能忽视。",
      "远离根基不稳的选项，先做风险隔离。",
    ),
    visual: { code: "16", symbol: "裂", tone: "spirit" },
  },
  {
    id: "major-17-star",
    name: "星星",
    arcana: "major",
    keywords: ["希望", "修复", "愿景", "疗愈"],
    upright: "希望、修复、长期愿景，局面虽然未定，但仍有温柔的恢复力。",
    reversed: "失望、信心不足、期待落空，理想和现实之间需要重新校准。",
    advice: "保留希望，但用行动计划保护你的期待。",
    contexts: majorContexts(
      "关系有修复和重新信任的可能，但需要时间。",
      "长期愿景仍值得守护，先做能恢复信心的小成果。",
      "财务适合长期规划，不要因短期失望放弃积累。",
      "疗愈和恢复是重点，别急着证明自己已经好了。",
      "选能让你看见长期希望、也有实际路径的方案。",
    ),
    visual: { code: "17", symbol: "星", tone: "spirit" },
  },
  {
    id: "major-18-moon",
    name: "月亮",
    arcana: "major",
    keywords: ["迷雾", "潜意识", "不安", "梦境"],
    upright: "迷雾、不安、潜意识涌动，眼前信息可能真假混杂。",
    reversed: "迷雾散开、恐惧被看见、真相逐步浮出。",
    advice: "不要在情绪最浓的时候做最终决定，先验证事实。",
    contexts: majorContexts(
      "暧昧、误解或投射较多，别把猜测当事实。",
      "项目信息不透明，适合风控和二次确认。",
      "警惕不清楚的账目、夸大宣传和情绪化消费。",
      "睡眠、焦虑和直觉都需要被照顾。",
      "先等信息更明朗，当前不适合押重注。",
    ),
    visual: { code: "18", symbol: "月", tone: "spirit" },
  },
  {
    id: "major-19-sun",
    name: "太阳",
    arcana: "major",
    keywords: ["清晰", "成功", "活力", "公开"],
    upright: "清晰、成功、活力和公开表达，事情有机会走向明亮面。",
    reversed: "过度乐观、短暂延迟、光亮被遮住，需要避免轻敌。",
    advice: "把好消息落成具体成果，别只停在兴奋里。",
    contexts: majorContexts(
      "关系有明朗和公开的动力，适合坦诚表达。",
      "项目能见度提升，适合展示、发布和争取认可。",
      "收入或资源有增长机会，但仍要把账算清楚。",
      "精力回升，适合户外、运动和恢复自信。",
      "选更透明、更积极、能被公开检验的方案。",
    ),
    visual: { code: "19", symbol: "日", tone: "spirit" },
  },
  {
    id: "major-20-judgement",
    name: "审判",
    arcana: "major",
    keywords: ["觉醒", "复盘", "召唤", "决定"],
    upright: "觉醒、复盘、重要决定，过去经验正在召唤你做升级选择。",
    reversed: "逃避召唤、自责、迟迟不愿面对结果。",
    advice: "把过去的教训整理成新的判断标准，而不是继续责怪自己。",
    contexts: majorContexts(
      "旧关系或旧议题会被重新审视，关键是能否以新标准面对。",
      "适合复盘、转型、面试和重新定位。",
      "财务上要总结旧账，决定下一阶段资源怎么配置。",
      "放下过度自责，用清醒的复盘替代内耗。",
      "选让你完成升级、而不是重复旧模式的方案。",
    ),
    visual: { code: "20", symbol: "醒", tone: "spirit" },
  },
  {
    id: "major-21-world",
    name: "世界",
    arcana: "major",
    keywords: ["完成", "整合", "阶段成果", "圆满"],
    upright: "完成、整合、阶段成果，某个周期正在收束并走向更成熟的位置。",
    reversed: "未完成、临门一脚、收尾拖延，成果还缺最后的整合。",
    advice: "把已经走完的部分正式收尾，再进入下一阶段。",
    contexts: majorContexts(
      "关系进入阶段性定型，要么更完整，要么需要成熟告别。",
      "项目适合交付、复盘、上线或进入更大的舞台。",
      "财务上看见阶段成果，也要处理好收尾与分配。",
      "身心需要完成一个恢复周期，别急着立刻开启新压力。",
      "选能完成闭环、扩大格局并减少反复的方案。",
    ),
    visual: { code: "21", symbol: "成", tone: "spirit" },
  },
] satisfies TarotCard[];

type MinorSuitProfile = {
  suit: TarotSuit;
  name: string;
  element: string;
  tone: TarotCard["visual"]["tone"];
  symbol: string;
  keywords: string[];
  uprightFocus: string;
  reversedFocus: string;
  advice: string;
  contexts: Record<TarotTopic, string>;
};

type MinorRankProfile = {
  rank: string;
  label: string;
  code: string;
  keywords: string[];
  upright: string;
  reversed: string;
  advice: string;
  context: string;
};

const minorSuits = [
  {
    suit: "wands",
    name: "权杖",
    element: "火",
    tone: "fire",
    symbol: "火",
    keywords: ["行动", "热情", "创造", "事业"],
    uprightFocus: "行动力、热情和主动推进正在成为关键。",
    reversedFocus: "行动节奏、热度或方向感需要重新校准。",
    advice: "先把热情落成日程和责任人。",
    contexts: {
      general: "事情的核心在行动和动力，拖太久会消耗气势。",
      love: "关系里的热度、主动性和吸引力是重点。",
      career: "事业推进、项目启动和竞争位置是重点。",
      wealth: "收入增长来自主动开拓，但要防止冲动投入。",
      wellbeing: "精力偏向外放，注意别燃烧过度。",
      decision: "优先看哪个选项更能带来行动反馈。",
    },
  },
  {
    suit: "cups",
    name: "圣杯",
    element: "水",
    tone: "water",
    symbol: "水",
    keywords: ["情感", "关系", "直觉", "疗愈"],
    uprightFocus: "情绪、连接和内在感受正在主导判断。",
    reversedFocus: "情绪流动受阻，可能有逃避、投射或失望。",
    advice: "先承认真实感受，再决定如何表达。",
    contexts: {
      general: "事情的核心在情绪体验和人与人的连接。",
      love: "关系亲密度、回应质量和情绪安全感是重点。",
      career: "团队氛围、价值认同和工作满意度会影响结果。",
      wealth: "消费和收入选择容易受情绪影响，需要留出冷静期。",
      wellbeing: "情绪照顾、睡眠和内在安全感比硬撑更重要。",
      decision: "优先看哪个选项让你更诚实、更安稳。",
    },
  },
  {
    suit: "swords",
    name: "宝剑",
    element: "风",
    tone: "air",
    symbol: "风",
    keywords: ["思考", "沟通", "冲突", "判断"],
    uprightFocus: "事实、沟通和判断标准需要被摆到台面上。",
    reversedFocus: "思绪、误解或冲突正在干扰清晰判断。",
    advice: "把问题写成事实清单，先排除猜测。",
    contexts: {
      general: "事情的核心在信息、沟通和边界。",
      love: "关系里的话语、误解和边界比情绪表面更重要。",
      career: "决策、谈判、汇报和风险判断是重点。",
      wealth: "合同、条款、账目和信息透明度必须核对。",
      wellbeing: "压力、睡眠和过度思考需要被处理。",
      decision: "优先看哪个选项事实更清楚、风险更可控。",
    },
  },
  {
    suit: "pentacles",
    name: "星币",
    element: "土",
    tone: "earth",
    symbol: "土",
    keywords: ["现实", "资源", "金钱", "身体"],
    uprightFocus: "现实资源、长期积累和可落地成果正在成为关键。",
    reversedFocus: "资源分配、稳定性或现实承诺出现松动。",
    advice: "用预算、时间表和可交付成果检验承诺。",
    contexts: {
      general: "事情的核心在资源、时间和现实承诺。",
      love: "关系是否能落到陪伴、责任和生活安排上是重点。",
      career: "技能、收入、岗位稳定性和长期积累会影响判断。",
      wealth: "资产、现金流和实际收益需要被稳稳管理。",
      wellbeing: "身体、作息和生活秩序是恢复基础。",
      decision: "优先看哪个选项更可持续、更能落地。",
    },
  },
] satisfies MinorSuitProfile[];

const minorRanks = [
  {
    rank: "ace",
    label: "王牌",
    code: "A",
    keywords: ["开端", "潜力", "种子"],
    upright: "新的种子出现，机会还小但很有生命力。",
    reversed: "开端受阻，可能有迟疑、资源不足或时机未到。",
    advice: "先保护这个起点，用一个小承诺让它发芽。",
    context: "重点是新机会和第一步验证。",
  },
  {
    rank: "two",
    label: "二",
    code: "02",
    keywords: ["选择", "平衡", "协商"],
    upright: "两股力量需要平衡，选择必须从现实比较开始。",
    reversed: "摇摆、僵持或回避决定，拖延会消耗窗口。",
    advice: "把两个选项的成本、收益和退出条件写清楚。",
    context: "重点是对比、协商和决定标准。",
  },
  {
    rank: "three",
    label: "三",
    code: "03",
    keywords: ["合作", "扩展", "反馈"],
    upright: "事情进入合作和扩展阶段，外部反馈开始变重要。",
    reversed: "协作不顺、期待不齐或扩张过快。",
    advice: "先对齐目标和分工，再谈扩大规模。",
    context: "重点是合作质量和外部回应。",
  },
  {
    rank: "four",
    label: "四",
    code: "04",
    keywords: ["稳定", "结构", "安全"],
    upright: "局面需要稳定结构，安全感来自清楚边界。",
    reversed: "稳定变成停滞，或者安全感建立在过度防守上。",
    advice: "保留基本盘，同时给变化留一点空间。",
    context: "重点是稳定、边界和安全感。",
  },
  {
    rank: "five",
    label: "五",
    code: "05",
    keywords: ["冲突", "损耗", "挑战"],
    upright: "挑战、竞争或损耗浮现，需要正视问题而非绕开。",
    reversed: "冲突开始缓和，但旧损耗仍需修复。",
    advice: "先止损，再判断是否值得继续投入。",
    context: "重点是冲突、损耗和修复成本。",
  },
  {
    rank: "six",
    label: "六",
    code: "06",
    keywords: ["调整", "互惠", "过渡"],
    upright: "局面进入过渡与调整期，互惠关系会带来支持。",
    reversed: "支持不对等，或者旧问题反复影响前进。",
    advice: "确认谁在付出、谁在受益，别让关系失衡。",
    context: "重点是互惠、修复和过渡安排。",
  },
  {
    rank: "seven",
    label: "七",
    code: "07",
    keywords: ["评估", "防守", "策略"],
    upright: "需要策略、防守和阶段评估，别急着全盘暴露。",
    reversed: "防守过度、判断分散或因为怀疑错过窗口。",
    advice: "设一个观察期，用事实更新策略。",
    context: "重点是观察、策略和阶段性判断。",
  },
  {
    rank: "eight",
    label: "八",
    code: "08",
    keywords: ["推进", "练习", "速度"],
    upright: "事情进入加速或重复练习期，熟练度会带来突破。",
    reversed: "急躁、重复低效或节奏失控。",
    advice: "把动作拆小，用稳定频率替代一阵猛冲。",
    context: "重点是节奏、效率和持续练习。",
  },
  {
    rank: "nine",
    label: "九",
    code: "09",
    keywords: ["成熟", "临界", "独立"],
    upright: "已经接近成熟或临界点，个人判断变得很关键。",
    reversed: "疲惫、过度警惕或对成果缺少信任。",
    advice: "承认已有成果，同时给自己补足恢复空间。",
    context: "重点是临界点、个人承受力和成果确认。",
  },
  {
    rank: "ten",
    label: "十",
    code: "10",
    keywords: ["完成", "压力", "结果"],
    upright: "一个周期走向结果，责任和收尾工作同时加重。",
    reversed: "负担过重、结尾拖延或不愿放下旧责任。",
    advice: "该收尾的收尾，该分担的分担，不要一个人扛完。",
    context: "重点是周期结果、责任分配和收尾。",
  },
  {
    rank: "page",
    label: "侍从",
    code: "侍",
    keywords: ["学习", "消息", "试探"],
    upright: "新的消息、学习心态和试探动作出现。",
    reversed: "经验不足、信息幼稚或试探缺少诚意。",
    advice: "先学习规则，再用小行动测试回应。",
    context: "重点是消息、学习和初步试探。",
  },
  {
    rank: "knight",
    label: "骑士",
    code: "骑",
    keywords: ["追求", "移动", "推进"],
    upright: "主动追求和移动带来变化，局面不适合原地等待。",
    reversed: "行动过猛、方向摇摆或承诺不稳定。",
    advice: "允许推进，但要给行动设置节奏和边界。",
    context: "重点是主动推进、速度和方向稳定性。",
  },
  {
    rank: "queen",
    label: "王后",
    code: "后",
    keywords: ["成熟", "照料", "内在掌控"],
    upright: "成熟的照料、接纳和内在掌控正在发挥作用。",
    reversed: "情绪消耗、边界松动或过度承担。",
    advice: "用成熟照顾局面，也要照顾自己的边界。",
    context: "重点是成熟处理、接纳和边界照料。",
  },
  {
    rank: "king",
    label: "国王",
    code: "王",
    keywords: ["掌控", "领导", "定局"],
    upright: "成熟掌控、领导力和定局能力出现。",
    reversed: "控制欲、固执或责任使用不当。",
    advice: "把权力用在承担责任上，而不是压住别人。",
    context: "重点是掌控、责任和成熟定局。",
  },
] satisfies MinorRankProfile[];

const minorArcana = minorSuits.flatMap((suit) =>
  minorRanks.map((rank) => ({
    id: `minor-${suit.suit}-${rank.rank}`,
    name: `${suit.name}${rank.label}`,
    arcana: "minor" as const,
    suit: suit.suit,
    rank: rank.rank,
    element: suit.element,
    keywords: [...rank.keywords, ...suit.keywords].slice(0, 6),
    upright:
      suit.suit === "cups" && rank.rank === "seven"
        ? "情感想象、选项过多或投射感增强，容易把期待当成事实。"
        : suit.suit === "swords" && rank.rank === "three"
          ? "失望、刺痛或难以回避的沟通浮现，需要先承认事实再修复。"
          : `${rank.upright}${suit.uprightFocus}`,
    reversed:
      suit.suit === "cups" && rank.rank === "seven"
        ? "幻想开始退潮，但仍要分辨真实感受与逃避。"
        : suit.suit === "swords" && rank.rank === "three"
          ? "伤口正在被看见，适合停止反复内耗并寻找修复方式。"
          : `${rank.reversed}${suit.reversedFocus}`,
    advice:
      suit.suit === "cups" && rank.rank === "seven"
        ? "把选项写成现实条件，只保留一个最值得验证的方向。"
        : suit.suit === "swords" && rank.rank === "three"
          ? "先把事实和感受分开写清楚，再决定是否沟通或退出。"
          : `${rank.advice}${suit.advice}`,
    contexts: {
      general:
        suit.suit === "cups" && rank.rank === "seven"
          ? "重点是分辨情感投射、想象和真实回应。"
          : suit.suit === "swords" && rank.rank === "three"
            ? "重点是承认失望、厘清沟通事实并设置修复边界。"
            : `${rank.context}${suit.contexts.general}`,
      love:
        suit.suit === "cups" && rank.rank === "seven"
          ? "关系里容易出现理想化或选项过多，先看持续回应而非想象。"
          : suit.suit === "swords" && rank.rank === "three"
            ? "关系里有失望或刺痛的沟通议题，先确认事实再决定修复方式。"
            : `${rank.context}${suit.contexts.love}`,
      career: `${rank.context}${suit.contexts.career}`,
      wealth: `${rank.context}${suit.contexts.wealth}`,
      wellbeing: `${rank.context}${suit.contexts.wellbeing}`,
      decision:
        suit.suit === "cups" && rank.rank === "seven"
          ? "优先选择事实更清楚、能减少投射的一项。"
          : suit.suit === "swords" && rank.rank === "three"
            ? "优先选择能正面处理事实、降低持续损耗的一项。"
            : `${rank.context}${suit.contexts.decision}`,
    },
    visual: {
      code: rank.code,
      symbol: suit.symbol,
      tone: suit.tone,
    },
  })),
) satisfies TarotCard[];

export const tarotDeck: TarotCard[] = [...majorArcana, ...minorArcana];

const uniqueCardIds = new Set(tarotDeck.map((card) => card.id));
const uniqueCardNames = new Set(tarotDeck.map((card) => card.name));

if (tarotDeck.length !== 78 || uniqueCardIds.size !== 78 || uniqueCardNames.size !== 78) {
  throw new Error("Tarot deck must contain 78 unique cards before launch.");
}
