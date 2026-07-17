import "server-only";

import { getOpenAIClient } from "@/lib/openai-client";
import type { FortuneAnswer, SafetyAssessment, SafetyRiskCategory } from "@/lib/prompts/contracts";

export const safetyPolicyPrompt = [
  "安全策略：",
  "- 高风险、专业判断和人身安全优先于任何命理解释。",
  "- 不得承诺复合、发财、改命、中奖、疾病结果或诉讼结果。",
  "- 不得建议买卖投资品、调整药物、规避就医、实施跟踪纠缠或伤害行为。",
  "- 高风险场景不得诱导购买会员、星力或报告。",
].join("\n");

type RiskRule = {
  category: SafetyRiskCategory;
  level: SafetyAssessment["riskLevel"];
  patterns: RegExp[];
  message: string;
};

const riskRules: RiskRule[] = [
  {
    category: "self_harm",
    level: "high",
    patterns: [/自杀|轻生|不想活|想死|活不下去|结束(?:生命|自己)|伤害自己|割腕|跳楼|跳下去|吞药|没必要活|suicide|kill myself|self[-\s]?harm/i],
    message: "如果你有立即伤害自己的风险，请马上联系当地紧急电话或身边可信任的人；我可以陪你把当下先撑过这一刻。",
  },
  {
    category: "violence",
    level: "high",
    patterns: [/杀了|报复|打死|弄死|伤害他人|暴力|weapon|kill (him|her|them)|hurt (him|her|them)/i],
    message: "涉及伤害他人的内容不能用命理判断推进；请先远离冲突现场并寻求现实帮助。",
  },
  {
    category: "domestic_abuse",
    level: "high",
    patterns: [/家暴|被打|控制我|威胁我|不让我走|domestic abuse|intimate partner violence/i],
    message: "如果你处在家暴或控制关系里，安全计划和现实支持优先，不适合做付费命理推演。",
  },
  {
    category: "medical",
    level: "high",
    patterns: [/癌|肿瘤|怀疑.*病|是不是得了|诊断|药量|吃什么药|停药|手术|抑郁症|焦虑症|精神科|还能活多久|medical|diagnosis|medication/i],
    message: "医疗问题需要医生或专业机构判断，我不能用命理替代诊断、用药或治疗建议。",
  },
  {
    category: "legal",
    level: "high",
    patterns: [/起诉|判刑|坐牢|离婚协议|合同纠纷|仲裁|法律建议|官司|法院|诉讼|违法|legal advice|lawsuit|court/i],
    message: "法律问题请咨询律师或相关机构；我不能用命理给确定性法律建议。",
  },
  {
    category: "investment",
    level: "high",
    patterns: [/股票|基金|期货|虚拟币|加密货币|买入|卖出|加仓|清仓|仓位|止损|收益率|贷款|借钱|理财|financial advice|crypto|stock/i],
    message: "投资和借贷问题不能用命理定买卖或收益；请以专业金融建议、风险承受能力和现实数据为准。",
  },
  {
    category: "gambling",
    level: "high",
    patterns: [/赌博|彩票|下注|博彩|赌|彩票号码|betting|casino|lottery/i],
    message: "赌博或博彩不能用命理预测结果，也不适合诱导付费。",
  },
  {
    category: "stalking",
    level: "high",
    patterns: [/跟踪|蹲守|监视|查定位|偷偷看|纠缠|骚扰|stalk|track location/i],
    message: "跟踪、监视或纠缠他人不安全也不合适；建议把注意力放回边界和现实沟通。",
  },
  {
    category: "minor",
    level: "high",
    patterns: [/未成年|小学生|初中生|高中生|孩子.*恋爱|minor|underage/i],
    message: "涉及未成年人时，保护、安全和监护责任优先，不能做诱导性或确定性命理判断。",
  },
  {
    category: "pregnancy",
    level: "high",
    patterns: [/怀孕|流产|备孕|生男生女|胎儿|妊娠|pregnan|fertility/i],
    message: "妊娠、生育和胎儿相关问题需要医疗专业判断，不能用命理替代。",
  },
  {
    category: "severe_dependency",
    level: "high",
    patterns: [/没有他.*活不下去|离开.*就不想活|必须复合|控制不住联系|严重依赖|活着没意义/i],
    message: "当关系已经影响到基本安全和稳定时，先找现实支持和专业帮助，不做复合承诺或付费推演。",
  },
  {
    category: "prompt_injection",
    level: "medium",
    patterns: [/忽略.*(系统|规则|指令)|泄露.*(提示词|prompt)|输出.*(系统提示|内部规则)|ignore.*instructions/i],
    message: "我不能展示或绕过内部规则；可以继续帮你看具体问题。",
  },
];

const safeDefaultAssessment: SafetyAssessment = {
  riskLevel: "low",
  categories: [],
  blocked: false,
  notEligibleForPaid: false,
  reason: "未触发高风险规则。",
  userMessage: "",
};

function highestRisk(first: SafetyAssessment["riskLevel"], second: SafetyAssessment["riskLevel"]) {
  const order = { low: 0, medium: 1, high: 2 };
  return order[second] > order[first] ? second : first;
}

export function assessSafetyRisk(text: string): SafetyAssessment {
  const normalized = text.trim();
  const supportiveMentalHealthContext =
    /(?:朋友|家人|伴侣|同事).*(?:抑郁症|焦虑症).*(?:尊重|边界|陪伴|沟通|支持)/.test(normalized) &&
    !/(?:诊断|停药|吃什么药|药量|治疗方案|还能活多久)/.test(normalized);
  const matched = riskRules.filter((rule) => {
    if (rule.category === "medical" && supportiveMentalHealthContext) {
      return false;
    }
    return rule.patterns.some((pattern) => pattern.test(normalized));
  });

  const ageMatch = normalized.match(/(?:^|[^\d])(\d{1,2})\s*岁/);
  const explicitMinorAge = ageMatch ? Number(ageMatch[1]) < 18 : false;
  const effectiveMatched = explicitMinorAge
    ? [
        ...matched,
        {
          category: "minor" as const,
          level: "high" as const,
          patterns: [],
          message: "涉及未成年人时，保护、安全和监护责任优先，不能做诱导性或确定性命理判断。",
        },
      ]
    : matched;

  if (effectiveMatched.length === 0) {
    return { ...safeDefaultAssessment };
  }

  const riskLevel = effectiveMatched.reduce<SafetyAssessment["riskLevel"]>(
    (level, rule) => highestRisk(level, rule.level),
    "low",
  );
  const categories = Array.from(new Set(effectiveMatched.map((rule) => rule.category)));
  const blocked = riskLevel === "high";

  return {
    riskLevel,
    categories,
    blocked,
    notEligibleForPaid: blocked,
    reason: effectiveMatched.map((rule) => rule.category).join(","),
    userMessage: effectiveMatched[0]?.message ?? "这个问题需要先回到现实安全与专业支持。",
  };
}

export async function assessSafetyRiskWithModeration(text: string) {
  const deterministic = assessSafetyRisk(text);
  if (deterministic.blocked) {
    return deterministic;
  }

  const client = getOpenAIClient();
  if (!client || process.env.OPENAI_MODERATION_ENABLED === "false") {
    return deterministic;
  }

  try {
    const moderation = await client.moderations.create(
      { model: "omni-moderation-latest", input: text },
      { timeout: 2500, maxRetries: 0 },
    );
    const categories = moderation.results[0]?.categories;
    const selfHarm = Boolean(
      categories?.["self-harm/intent"] || categories?.["self-harm/instructions"],
    );
    const violence = Boolean(
      categories?.["harassment/threatening"] || categories?.["illicit/violent"],
    );
    const minor = Boolean(categories?.["sexual/minors"]);

    if (!selfHarm && !violence && !minor) {
      return deterministic;
    }

    const matchedCategories: SafetyRiskCategory[] = [
      ...(selfHarm ? ["self_harm" as const] : []),
      ...(violence ? ["violence" as const] : []),
      ...(minor ? ["minor" as const] : []),
    ];
    return {
      riskLevel: "high" as const,
      categories: Array.from(new Set([...deterministic.categories, ...matchedCategories])),
      blocked: true,
      notEligibleForPaid: true,
      reason: `moderation:${matchedCategories.join(",")}`,
      userMessage: selfHarm
        ? "如果你有立即伤害自己的风险，请马上联系当地紧急电话或身边可信任的人；我可以陪你先稳定下来。"
        : "这个问题涉及现实安全，不能进入命理推演或诱导付费；请先寻求可信任的人或专业机构帮助。",
    };
  } catch {
    return deterministic;
  }
}

export function buildSafetyFortuneAnswer(assessment: SafetyAssessment): FortuneAnswer {
  const primary = assessment.userMessage || "这个问题需要先回到现实安全与专业支持。";
  const categories = new Set(assessment.categories);
  const domesticAbuseRisk = categories.has("domestic_abuse");
  const crisisRisk = categories.has("self_harm") || categories.has("violence") ||
    categories.has("severe_dependency");
  const pregnancyRisk = categories.has("pregnancy");
  const medicalRisk = categories.has("medical");
  const legalRisk = categories.has("legal");
  const investmentRisk = categories.has("investment");
  const gamblingRisk = categories.has("gambling");
  const stalkingRisk = categories.has("stalking");
  const minorRisk = categories.has("minor");
  const response = crisisRisk
    ? {
        meaning: "先处理现实安全、可信任支持和可执行的保护动作。",
        actionLabel: "先确保当下安全",
        actionDetail: "暂停命理判断，离开可能升级的环境，并联系身边可信任的人、专业支持或当地紧急服务。",
        realityChecks: [
          "确认自己和他人此刻是否处于安全环境",
          "如果存在即时危险，请立即联系当地紧急服务或身边可信任的人",
        ],
        followUps: ["帮我先把情绪稳定下来", "帮我整理一个安全计划", "我可以联系谁获得支持"],
        notice: "本轮不进行命理推演，也不会建议为人身安全或危机场景付费。",
      }
    : domesticAbuseRisk
      ? {
          meaning: "家暴或控制关系里，安全计划、隐私保护和现实援助优先；塔罗或命理不能判断对方会不会改变，也不能替代保护行动。",
          actionLabel: "先做安全计划",
          actionDetail: "如果你正处在即时危险中，请优先联系当地紧急服务或可信任的人；如果暂时不方便求助，先保护设备隐私，避免在对方可能看到记录时摊牌或贸然行动，并选择安全时机联系反家暴、妇联、警方、法律援助或本地支持机构。",
          realityChecks: [
            "确认手机、聊天记录、定位和浏览记录是否可能被对方查看",
            "准备一个可联系的可信任对象、可去的安全地点和必要证件/现金/药品",
            "不要用对方的承诺替代连续、可验证的安全改变",
          ],
          followUps: ["帮我整理一个安全计划", "帮我列可以联系的现实支持", "我现在只想稳定情绪"],
          notice: "本轮不进行塔罗或命理推演，也不会建议为家暴、控制或人身安全问题付费。",
        }
    : pregnancyRisk
      ? {
          meaning: "胎儿性别、妊娠状态和孕期健康都不能用八字、塔罗或民间说法判断；这类问题要以合法合规的信息、产检结果和医生说明为准。",
          actionLabel: "回到产检与合规信息",
          actionDetail: "不要用命理判断胎儿性别；如果你关心孕期健康、检查安排或情绪压力，请把具体担忧带给产科医生或可信任的现实支持。",
          realityChecks: [
            "确认问题是否在询问胎儿性别、妊娠结果或孕期健康结论",
            "涉及孕期健康时，以产检报告、医生说明和当地法律法规为准",
          ],
          followUps: ["我只想做孕期情绪梳理", "帮我整理产检要问医生的问题", "帮我把问题改成低风险表达"],
          notice: "本轮不进行胎儿性别或妊娠结论的命理判断，也不会建议为此付费。",
        }
      : medicalRisk
      ? {
          meaning: "先以医生面诊、正规检查和实际症状为准，不用命理判断疾病诊断、寿命或治疗结果。",
          actionLabel: "预约正规就医",
          actionDetail: "如果担心癌症、严重疾病或生命风险，请尽快联系正规医疗机构做检查；若有急性疼痛、出血、呼吸困难等紧急症状，请直接使用当地急救资源。",
          realityChecks: [
            "记录当前症状、持续时间、既往检查结果和家族/个人病史",
            "向医生确认需要做哪些检查、何时复诊以及哪些症状需要立即处理",
          ],
          followUps: ["帮我整理要问医生的问题", "帮我整理症状和检查记录", "我只想做情绪梳理"],
          notice: "本轮不进行医疗命理判断，也不会建议为诊断、寿命或治疗结果付费。",
        }
      : legalRisk
        ? {
            meaning: "先依据合同、证据和适用规则咨询律师或相关机构，不用命理替代法律判断。",
            actionLabel: "整理事实与材料",
            actionDetail: "保存合同、沟通记录和时间线，向具备资质的律师或相关机构确认权利义务。",
            realityChecks: ["确认关键期限和需要保存的证据", "避免在没有专业意见时作出不可逆承诺"],
            followUps: ["帮我整理事实时间线", "帮我列一份咨询律师的问题", "帮我梳理当前担忧"],
            notice: "本轮不进行确定性法律命理判断，也不会建议为诉讼或合同结果付费。",
          }
        : gamblingRisk
          ? {
              meaning: "彩票、下注和博彩结果不能用塔罗、八字或起卦预测；这类问题更需要预算上限、停止条件和对随机性的清醒认识。",
              actionLabel: "暂停下注决定",
              actionDetail: "不要根据命理、号码暗示或他人承诺下注；先设定不再加注的边界，把可承受损失、生活必要支出和求助对象写清楚。",
              realityChecks: [
                "确认没有把生活费、借款或应急资金投入彩票或博彩",
                "如果已经很难停止下注，优先联系可信任的人或本地成瘾支持资源",
              ],
              followUps: ["帮我做停止下注计划", "帮我整理预算边界", "我想把问题改成低风险表达"],
              notice: "本轮不进行命理推演，不提供号码、胜负或下注建议，也不会建议为赌博或博彩预测付费。",
            }
          : investmentRisk
            ? {
                meaning: "先依据真实财务数据、风险承受能力和专业意见判断，不用命理决定投资交易或借贷。",
                actionLabel: "暂停交易决定",
                actionDetail: "不要依据本轮内容买入、卖出、加仓或借贷；先核对资金期限、最大可承受损失和独立风险信息。",
                realityChecks: ["确认最坏情况下可承受的现实损失", "核对信息来源、费用、流动性和退出条件"],
                followUps: ["帮我做非交易性的风险清单", "帮我梳理资金期限", "帮我整理要问专业人士的问题"],
                notice: "本轮不进行命理推演，也不提供投资或借贷指令，不会建议为收益预测付费。",
              }
            : stalkingRisk
              ? {
                  meaning: "先停止跟踪、监视或纠缠，把注意力放回个人边界和合法、尊重的沟通。",
                  actionLabel: "停止越界行为",
                  actionDetail: "不要查定位、蹲守或反复联系；先拉开距离，并寻求可信任的人帮助你稳定情绪。",
                  realityChecks: ["确认没有继续查看或追踪对方位置", "只在对方明确同意的边界内沟通"],
                  followUps: ["帮我制定停止联系计划", "帮我整理关系边界", "我现在只想稳定情绪"],
                  notice: "本轮不进行复合承诺，也不会为跟踪、监视或纠缠提供付费推演。",
                }
              : minorRisk
                ? {
                    meaning: "涉及未成年人时，保护、监护责任和年龄适宜的支持优先。",
                    actionLabel: "回到保护与沟通",
                    actionDetail: "由监护人或可信任成年人提供支持，不对未成年人作确定性关系或命运判断。",
                    realityChecks: ["确认沟通内容符合年龄和保护要求", "需要时寻求学校、监护人或专业机构支持"],
                    followUps: ["帮我整理适龄沟通方式", "帮我列保护边界", "帮我梳理监护人能做什么"],
                    notice: "本轮不对未成年人作诱导性命理判断，也不会建议为此付费。",
                  }
                : {
                    meaning: "先回到现实边界和专业支持，再决定下一步。",
                    actionLabel: "暂停命理判断",
                    actionDetail: "不要把高风险或专业问题交给命理决定；先向对应专业人士确认。",
                    realityChecks: ["确认现实风险和专业责任边界", "优先选择可验证、可回滚的行动"],
                    followUps: ["帮我把问题改成低风险表达", "帮我整理现实信息", "我下一步先做什么"],
                    notice: "本轮不进行高风险命理推演，也不会建议为此付费。",
                  };

  return {
    status: "blocked",
    verdict: {
      summary: primary,
      stance: "安全优先",
      confidence: "high",
    },
    evidenceRefs: ["safety.assessment"],
    interpretations: [
      {
        evidenceId: "safety.assessment",
        claim: "本轮命中了高风险或专业边界，不能进入命理推演或诱导付费。",
        meaning: response.meaning,
        limitation: "这不是医疗、法律、投资或危机干预服务。",
      },
    ],
    uncertainty: {
      level: "high",
      reasons: ["线上文字无法确认现实风险程度，需要以线下安全和专业判断优先。"],
    },
    actions: [
      {
        label: response.actionLabel,
        detail: response.actionDetail,
        horizon: "现在",
        reversible: true,
      },
    ],
    realityChecks: response.realityChecks,
    followUps: response.followUps,
    safetyNotice: response.notice,
  };
}
