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
};

type MinorCardMeaning = {
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
  { rank: "ace", label: "王牌", code: "A" },
  { rank: "two", label: "二", code: "02" },
  { rank: "three", label: "三", code: "03" },
  { rank: "four", label: "四", code: "04" },
  { rank: "five", label: "五", code: "05" },
  { rank: "six", label: "六", code: "06" },
  { rank: "seven", label: "七", code: "07" },
  { rank: "eight", label: "八", code: "08" },
  { rank: "nine", label: "九", code: "09" },
  { rank: "ten", label: "十", code: "10" },
  { rank: "page", label: "侍从", code: "侍" },
  { rank: "knight", label: "骑士", code: "骑" },
  { rank: "queen", label: "王后", code: "后" },
  { rank: "king", label: "国王", code: "王" },
] satisfies MinorRankProfile[];

const minorCardMeanings = {
  wands: {
    ace: { keywords: ["灵感", "启动", "创造"], upright: "灵感和行动火花出现，适合启动有热情的新方向。", reversed: "动力受阻、方向不明或开局过热，想法尚未形成稳定行动。", advice: "先把最有生命力的想法落成一个具体开端。", context: "关键是这股新动力能否真正启动，而不只是短暂兴奋。" },
    two: { keywords: ["规划", "远景", "选择"], upright: "已经站在现有成果上观察更远的可能，适合制定扩展计划。", reversed: "害怕未知、规划不足或只守着熟悉范围，选择因此迟滞。", advice: "先确认长期方向，再比较每条路需要承担的代价。", context: "重点是未来版图和行动路径，而不是当下谁更热闹。" },
    three: { keywords: ["拓展", "远见", "进展"], upright: "前期投入开始向外延伸，合作、市场或远方反馈逐渐出现。", reversed: "扩展延误、协作受阻或预期过大，外部回应没有按计划到来。", advice: "检查外部条件和合作分工，再决定是否扩大。", context: "重点是已经发出的行动能否获得持续的外部回应。" },
    four: { keywords: ["庆祝", "归属", "稳定"], upright: "阶段成果值得庆祝，关系或团队形成了较稳定的共同基础。", reversed: "表面热闹但归属感不足，家庭、团队或承诺基础仍不稳。", advice: "确认共同基础和归属，再进入下一阶段。", context: "关键在于成果能否沉淀成稳定关系、共同空间或正式节点。" },
    five: { keywords: ["竞争", "摩擦", "较量"], upright: "多方目标和意见互相碰撞，竞争会消耗精力，也可能激发新办法。", reversed: "冲突被压住、竞争失序或各方避免真正对话，问题仍未解决。", advice: "先明确共同规则，区分建设性讨论和无效争胜。", context: "重点是竞争与分歧如何被管理，而不是简单判定谁输谁赢。" },
    six: { keywords: ["胜利", "认可", "可见度"], upright: "努力获得认可，成果被看见，当前有胜利或提升影响力的机会。", reversed: "认可落空、过度在意评价或成绩没有得到应有确认。", advice: "让成果被清楚看见，同时确认认可是否真实且可持续。", context: "关键是成果、声誉和公开认可，而不是互惠或过渡。" },
    seven: { keywords: ["坚守", "防卫", "立场"], upright: "已有位置值得守住，但需要面对挑战并清楚表达立场。", reversed: "压力过大、边界松动或因缺乏信心而放弃原有优势。", advice: "守住最重要的底线，不必同时回应所有挑战。", context: "重点是能否在外部压力下守住立场和既有成果。" },
    eight: { keywords: ["加速", "消息", "进展"], upright: "信息和行动快速推进，延误减少，事情可能在短期集中发生。", reversed: "消息延误、行动混乱或速度快于协调能力，容易误判节奏。", advice: "抓住窗口，但先确认信息一致和行动顺序。", context: "关键是快速到来的消息、移动和进展能否被接住。" },
    nine: { keywords: ["韧性", "警戒", "边界"], upright: "经历消耗后仍有守住最后一段的韧性，需要警觉但不必退缩。", reversed: "疲惫、防御过度或旧伤影响判断，继续硬撑可能得不偿失。", advice: "保护边界并补足体力，再判断最后一步是否值得。", context: "重点是经历考验后的承受力、警戒和最后防线。" },
    ten: { keywords: ["重担", "责任", "超载"], upright: "责任和任务压得过重，成果背后伴随明显负担。", reversed: "开始卸下重担，也可能因逃避责任而把压力转给别人。", advice: "删减、委派或重排责任，不要把所有任务独自扛完。", context: "关键是负担是否超过承载，而不是一般的周期收尾。" },
    page: { keywords: ["探索", "消息", "热情"], upright: "新鲜热情、创意消息或探索机会出现，适合试着走出第一步。", reversed: "热情不稳、缺乏跟进或消息只停留在口号层面。", advice: "保留好奇，但用一个完成动作检验热情。", context: "重点是新出现的行动消息和探索欲是否有后续。" },
    knight: { keywords: ["冲刺", "冒险", "行动"], upright: "行动迅速、敢于冒险和追求目标，局面充满推进力。", reversed: "冲动、急躁、忽冷忽热或只顾追求刺激，承诺不够稳定。", advice: "可以推进，但先设方向、边界和减速点。", context: "关键是强烈推进力能否保持方向和持续性。" },
    queen: { keywords: ["自信", "魅力", "独立"], upright: "自信、热情和感染力增强，能以成熟姿态吸引资源与支持。", reversed: "自信受损、嫉妒或过度依赖外界肯定，热情变得不稳定。", advice: "先站稳自己的价值，再主动表达和连接。", context: "重点是内在自信、个人魅力和独立行动力。" },
    king: { keywords: ["远见", "领导", "开拓"], upright: "具备远见和领导力，适合定方向、整合团队并推动长期目标。", reversed: "专断、急于掌控或愿景脱离执行，权威可能压过合作。", advice: "用愿景带动行动，也要让责任和执行可检验。", context: "关键是领导者能否把远见变成稳定而负责的推进。" },
  },
  cups: {
    ace: { keywords: ["情感开启", "爱", "直觉"], upright: "情感重新流动，爱、善意或直觉体验有了新的开端。", reversed: "情绪堵塞、压抑感受或把爱过度向外倾倒，内在容器不足。", advice: "先接住自己的真实感受，再决定如何表达。", context: "关键是新的情感连接是否真诚流动。" },
    two: { keywords: ["互相吸引", "结合", "对等"], upright: "双方有相互吸引、理解或合作意愿，关系强调对等回应。", reversed: "关系失衡、沟通断裂或价值不一致，吸引不足以维持连接。", advice: "确认双方是否都在回应和承担，不要只看感觉。", context: "重点是两方能否形成对等、互相承认的连接。" },
    three: { keywords: ["友谊", "庆祝", "支持"], upright: "朋友、团队和社群带来支持，适合分享成果和共同庆祝。", reversed: "社交过度、圈内矛盾或第三方干扰，让关系失去边界。", advice: "享受支持，同时厘清核心关系与群体影响。", context: "关键是社群支持、共同喜悦和第三方边界。" },
    four: { keywords: ["冷淡", "停顿", "重新评估"], upright: "对现有机会缺乏兴趣，情绪进入停顿，需要重新看见真正需求。", reversed: "开始走出封闭、重新接受机会，也可能因害怕错过而仓促回应。", advice: "先分辨是确实不合适，还是疲惫让你看不见机会。", context: "重点是情感停滞与重新评估，不是简单的稳定。" },
    five: { keywords: ["失落", "哀伤", "遗憾"], upright: "注意力停留在失去和遗憾上，需要允许哀伤，也要看见仍然保留的部分。", reversed: "逐渐接受损失、开始修复，或仍被旧遗憾拉回。", advice: "承认已经失去的，同时盘点仍可依靠的人与资源。", context: "关键是如何面对失落，并从遗憾中恢复。" },
    six: { keywords: ["回忆", "重逢", "纯真"], upright: "过去的记忆、旧人或熟悉的安全感重新出现，带来温柔连接。", reversed: "困在过去、过度美化回忆，或开始摆脱旧模式走向成熟。", advice: "珍惜真实的温情，但用现在的行为校验旧印象。", context: "重点是过去、重逢和熟悉感如何影响当下。" },
    seven: { keywords: ["幻想", "选择", "投射"], upright: "情感想象和选项过多，容易把愿望、诱惑或投射当成事实。", reversed: "幻想开始退潮，选择逐渐聚焦，但仍需核实现实条件。", advice: "把每个选项写成现实条件，只保留最值得验证的方向。", context: "重点是分辨想象、诱惑和真实回应。" },
    eight: { keywords: ["离开", "寻求", "放下"], upright: "现有情感投入已难满足深层需要，适合离开旧局面寻找更真实的意义。", reversed: "害怕离开、反复回头，或尚未确认是否真的该放下。", advice: "确认你离开的原因和要寻找的东西，不要只靠逃避推动变化。", context: "关键是何时承认情感不再满足，并成熟地离开。" },
    nine: { keywords: ["满足", "愿望", "享受"], upright: "个人愿望得到满足，情绪上有享受、充足和阶段性如愿。", reversed: "表面满足但内在空虚，期待过高或把享乐当成真正幸福。", advice: "享受成果，同时检查它是否满足了你的核心需要。", context: "重点是个人满足和愿望实现是否具有真实内涵。" },
    ten: { keywords: ["情感圆满", "家庭", "和谐"], upright: "关系、家庭或群体呈现情感圆满与共同归属的可能。", reversed: "家庭期待、价值差异或表面和谐掩盖了真实裂缝。", advice: "把共同愿景落到日常责任和真实沟通。", context: "关键是长期情感归属、家庭价值与共同生活。" },
    page: { keywords: ["情感消息", "敏感", "直觉"], upright: "温柔的消息、情感表达或直觉灵感出现，带有试探与真诚。", reversed: "情绪不成熟、过度敏感或表达含糊，消息难以稳定落地。", advice: "允许柔软表达，也要观察后续行动是否一致。", context: "重点是新出现的情感消息和直觉回应。" },
    knight: { keywords: ["邀约", "浪漫", "追求"], upright: "浪漫邀约、情感追求或理想驱动的行动出现。", reversed: "理想化、情绪承诺反复或只会制造浪漫而缺少承担。", advice: "听见表达，也要用持续行动检验承诺。", context: "关键是追求与邀约能否从浪漫走向现实承担。" },
    queen: { keywords: ["共情", "直觉", "情感成熟"], upright: "共情、直觉和情感承载力较强，能温柔理解自己与他人。", reversed: "情绪淹没判断、过度照顾或边界不清，容易吸收他人压力。", advice: "相信感受，但先分清哪些情绪属于自己。", context: "重点是共情、情绪边界和内在直觉。" },
    king: { keywords: ["情绪稳定", "包容", "外交"], upright: "情绪成熟而稳定，能在复杂感受中保持包容和清楚判断。", reversed: "压抑情绪、被动操控或表面冷静，真实感受没有被负责地处理。", advice: "稳定表达感受，用成熟沟通代替情绪控制。", context: "关键是情绪掌控、包容和成熟沟通。" },
  },
  swords: {
    ace: { keywords: ["真相", "清晰", "突破"], upright: "思路突破、事实澄清或关键决定出现，适合直面真相。", reversed: "判断混乱、真相被扭曲或沟通缺乏清晰度，贸然决定容易出错。", advice: "先确认事实与定义，再做清楚而诚实的决定。", context: "重点是能否凭真相和清晰判断打开局面。" },
    two: { keywords: ["僵局", "回避", "权衡"], upright: "两个方向形成僵局，当事人可能暂时封闭感受、回避选择。", reversed: "信息过载、犹豫加剧，或被迫看见无法继续回避的事实。", advice: "承认真正冲突，补齐决定所需的关键信息。", context: "关键是打破回避和僵持，而不是维持表面平衡。" },
    three: { keywords: ["心痛", "分离", "真相"], upright: "失望、刺痛或难以回避的事实浮现，需要先承认伤口。", reversed: "伤口开始修复，也可能因压抑或反复回想而延长痛苦。", advice: "把事实和感受分开看清，再决定修复、沟通或退出。", context: "重点是面对失望、分离和造成刺痛的事实。" },
    four: { keywords: ["休息", "恢复", "暂停"], upright: "需要暂时退出冲突、休息与整合思绪，恢复本身就是当前任务。", reversed: "休息不足、重新投入过早，或长期停滞让焦虑累积。", advice: "安排真正的暂停，等思路和精力恢复后再行动。", context: "关键是通过休整恢复判断力，而不是继续硬推。" },
    five: { keywords: ["冲突", "空洞胜利", "损伤"], upright: "争胜可能带来表面优势，却伤害信任与长期合作。", reversed: "有意结束冲突、修复关系，也可能仍对旧争执耿耿于怀。", advice: "先判断这场胜负是否值得付出关系和信誉成本。", context: "重点是冲突代价，以及赢了局面是否失去更重要的东西。" },
    six: { keywords: ["过渡", "离开困境", "迁移"], upright: "正在离开混乱进入较平静阶段，变化仍带着未完全消化的负担。", reversed: "难以离开旧问题、转变受阻或反复把过去带进新阶段。", advice: "接受过渡需要时间，明确要带走和要放下的部分。", context: "关键是从困境迁移到新阶段，而不是互惠交换。" },
    seven: { keywords: ["策略", "隐瞒", "绕行"], upright: "需要独立策略或谨慎行动，也可能出现隐瞒、逃避责任和不透明做法。", reversed: "隐情暴露、良心不安或策略失效，事情要求更坦白的处理。", advice: "可以保护信息，但不要用策略掩盖关键事实和责任。", context: "重点是策略与隐瞒的边界，以及信息是否可信。" },
    eight: { keywords: ["受限", "困住", "思维束缚"], upright: "感觉无路可走，但限制中有一部分来自恐惧和既有想法。", reversed: "开始看见出口、松开自我限制，也可能仍害怕采取行动。", advice: "区分真实限制和想象限制，先移动一个可控步骤。", context: "关键是识别自我束缚，并看见仍然存在的选择。" },
    nine: { keywords: ["焦虑", "失眠", "担忧"], upright: "忧虑、内疚或失眠放大了最坏想象，心理压力需要被认真处理。", reversed: "焦虑开始缓解，或压力已累积到难以独自承担。", advice: "把担忧写成事实与假设，必要时寻求现实支持。", context: "重点是焦虑和最坏想象如何影响判断。" },
    ten: { keywords: ["痛苦终结", "崩溃", "触底"], upright: "一段痛苦局面到达终点，事实虽难受，却也意味着不能再维持旧模式。", reversed: "开始从低点恢复，或拒绝结束而让痛苦延长。", advice: "承认这个阶段已经结束，把精力转向恢复和重建。", context: "关键是不可继续的旧局面如何结束，而不是一般的责任收尾。" },
    page: { keywords: ["警觉", "求知", "消息"], upright: "好奇、警觉和信息搜集增强，适合提问、观察和学习。", reversed: "流言、试探过度或只收集信息不验证，沟通容易失真。", advice: "保持敏锐，但核实来源后再传播或行动。", context: "重点是新信息、观察力和消息可信度。" },
    knight: { keywords: ["果断", "急进", "辩论"], upright: "思路和行动快速而直接，适合突破阻碍，但容易忽略他人节奏。", reversed: "鲁莽、争辩、行动失控或只求速度不顾后果。", advice: "保留果断，同时检查事实、语气和行动代价。", context: "关键是快速决断能否避免演变成冲动冲突。" },
    queen: { keywords: ["清醒", "独立", "边界"], upright: "判断清醒、表达直接，能以经验和事实建立明确边界。", reversed: "尖锐、冷漠或因旧伤过度防御，判断可能失去弹性。", advice: "说清事实和边界，也给复杂处境留出理解空间。", context: "重点是独立判断、诚实表达和清楚边界。" },
    king: { keywords: ["理性权威", "原则", "裁断"], upright: "逻辑、原则和专业判断占据主导，适合做有依据的决定。", reversed: "滥用权威、过度苛刻或只讲逻辑不顾事实全貌。", advice: "用一致标准做决定，并承担决定造成的影响。", context: "关键是理性权威能否建立在事实与公平原则上。" },
  },
  pentacles: {
    ace: { keywords: ["物质机会", "资源", "落地"], upright: "新的工作、收入、资源或可落地机会出现，具备长期生长潜力。", reversed: "机会错失、资金不足或计划没有现实基础，开端难以落地。", advice: "核实资源、预算和执行条件，再把机会接稳。", context: "重点是现实机会能否形成可持续的物质基础。" },
    two: { keywords: ["调度", "优先级", "适应"], upright: "多项责任需要灵活调度，暂时能维持平衡，但资源有限。", reversed: "事务超载、优先级混乱或财务失衡，继续兼顾会降低质量。", advice: "明确优先级，减少同时推进的事项。", context: "关键是时间、金钱和责任如何被动态分配。" },
    three: { keywords: ["协作", "技能", "建设"], upright: "专业技能、清楚分工和团队协作正在形成可见成果。", reversed: "合作质量不足、标准不一或能力没有被正确使用。", advice: "对齐质量标准、角色和交付方式，再继续建设。", context: "重点是专业能力如何通过协作变成实际成果。" },
    four: { keywords: ["占有", "安全", "控制"], upright: "重视稳定与守成，但抓得过紧可能让资源和关系失去流动。", reversed: "开始放松控制，也可能因财务不稳或挥霍而失去安全感。", advice: "守住底线资金和边界，同时检查控制是否过度。", context: "关键是安全感、占有与资源流动之间的平衡。" },
    five: { keywords: ["匮乏", "困难", "被排除"], upright: "现实资源短缺、孤立或生活压力明显，但附近可能仍有可求助的支持。", reversed: "困境逐渐缓解、支持重新出现，或匮乏心态仍阻碍恢复。", advice: "先处理基本保障，并主动寻找可获得的现实支持。", context: "重点是如何面对匮乏、排斥感和现实困难。" },
    six: { keywords: ["给予", "交换", "权力"], upright: "资源给予与接受较为流动，但双方位置和权力并不完全相同。", reversed: "付出附带条件、债务失衡或单方面索取，互惠关系出现问题。", advice: "看清谁掌握资源、交换条件是否公平、回报是否可持续。", context: "关键是给予、接受和权力差异，而不是笼统的过渡。" },
    seven: { keywords: ["耐心", "评估", "长期回报"], upright: "长期投入进入等待和评估期，成果尚未成熟，需要检查投入产出。", reversed: "急于见效、投入方向错误或长期等待没有合理回报。", advice: "盘点已经投入的成本，设定继续等待的期限和标准。", context: "重点是长期投入是否值得继续等待。" },
    eight: { keywords: ["工艺", "练习", "专注"], upright: "专注练习和重复打磨会提升技能，成果来自认真做工。", reversed: "敷衍重复、完美主义或只忙不精，努力没有转化成能力。", advice: "聚焦一个关键技能，用可检验的作品衡量进步。", context: "关键是通过专注练习形成专业能力和稳定质量。" },
    nine: { keywords: ["独立", "丰足", "自给"], upright: "独立积累带来舒适、选择权和对成果的享受。", reversed: "表面丰足但依赖他人、过度消费或价值感建立在物质展示上。", advice: "确认你的稳定来自真实能力和资产，而不是外在证明。", context: "重点是独立成果、生活品质和自主选择权。" },
    ten: { keywords: ["长期稳定", "家业", "传承"], upright: "长期财富、家庭结构或组织基础趋于稳定，强调传承和共同利益。", reversed: "家族或组织利益冲突、长期基础不稳，短期收益伤害了传承。", advice: "把长期规则、利益分配和共同责任说清楚。", context: "关键是长期稳定、家族或组织资源与传承。" },
    page: { keywords: ["学习机会", "务实消息", "起步"], upright: "学习、工作或财务方面出现务实机会，适合认真研究和打基础。", reversed: "缺乏计划、学习不落地或只关注结果而忽视基本功。", advice: "把机会转成学习计划和第一份可交付成果。", context: "重点是务实的新机会能否通过学习真正落地。" },
    knight: { keywords: ["可靠", "勤勉", "稳定推进"], upright: "以稳定、耐心和责任感推进，速度不快但可持续。", reversed: "停滞、固执、机械劳动或对责任失去投入感。", advice: "保持规律执行，同时检查方法是否需要更新。", context: "关键是承诺、可靠性和长期执行，而不是快速推进。" },
    queen: { keywords: ["务实照料", "资源管理", "丰盛"], upright: "能务实照顾人和资源，把安全感落实到生活与管理。", reversed: "过度付出、忽视自己或因现实焦虑而控制资源。", advice: "照顾现实需要，也要保留自己的时间和资源边界。", context: "重点是务实照料、资源管理和生活稳定。" },
    king: { keywords: ["物质掌控", "经营", "稳健"], upright: "具备经营、资源整合和长期建设能力，成果建立在稳健管理上。", reversed: "唯利是图、控制资源或过度保守，稳定可能变成僵化。", advice: "以长期价值管理资源，不要让占有欲替代责任。", context: "关键是财富与资源能否被成熟、稳健地经营。" },
  },
} satisfies Record<TarotSuit, Record<string, MinorCardMeaning>>;

const minorArcana = minorSuits.flatMap((suit) =>
  minorRanks.map((rank) => {
    const meaning = (minorCardMeanings[suit.suit] as Record<string, MinorCardMeaning>)[rank.rank];

    if (!meaning) {
      throw new Error(`Missing Minor Arcana meaning for ${suit.suit}.${rank.rank}.`);
    }

    return {
      id: `minor-${suit.suit}-${rank.rank}`,
      name: `${suit.name}${rank.label}`,
      arcana: "minor" as const,
      suit: suit.suit,
      rank: rank.rank,
      element: suit.element,
      keywords: [...meaning.keywords, ...suit.keywords].slice(0, 6),
      upright: meaning.upright,
      reversed: meaning.reversed,
      advice: meaning.advice,
      contexts: {
        general: `${meaning.context}${suit.contexts.general}`,
        love: `${meaning.context}${suit.contexts.love}`,
        career: `${meaning.context}${suit.contexts.career}`,
        wealth: `${meaning.context}${suit.contexts.wealth}`,
        wellbeing: `${meaning.context}${suit.contexts.wellbeing}`,
        decision: `${meaning.context}${suit.contexts.decision}`,
      },
      visual: {
        code: rank.code,
        symbol: suit.symbol,
        tone: suit.tone,
      },
    };
  }),
) satisfies TarotCard[];

export const tarotDeck: TarotCard[] = [...majorArcana, ...minorArcana];

const uniqueCardIds = new Set(tarotDeck.map((card) => card.id));
const uniqueCardNames = new Set(tarotDeck.map((card) => card.name));

if (tarotDeck.length !== 78 || uniqueCardIds.size !== 78 || uniqueCardNames.size !== 78) {
  throw new Error("Tarot deck must contain 78 unique cards before launch.");
}
