export type ChatServiceMode = "quick" | "formal" | "deep";

export type ChatServiceIntent = "general" | "tarot" | "bazi" | "bagua" | "palm";
export type ChatReadingMethod = Exclude<ChatServiceIntent, "general">;

export type ChatServiceBrief = {
  intent: ChatServiceIntent;
  type: string;
  method: string;
  recommendedMode: ChatServiceMode;
};

export const chatServiceModes = [
  {
    id: "quick",
    label: "快速问答",
    cost: 1,
    description: "快速判断",
    output: "核心判断 + 一个下一步",
  },
  {
    id: "formal",
    label: "正式问事",
    cost: 12,
    description: "完整仪式",
    output: "专属推演 + 结论卡",
  },
  {
    id: "deep",
    label: "深度推演",
    cost: 30,
    description: "多维分析",
    output: "深度解释 + 行动方案",
  },
] as const satisfies ReadonlyArray<{
  id: ChatServiceMode;
  label: string;
  cost: number;
  description: string;
  output: string;
}>;

const decisionPattern = /选择|决策|哪个|哪一个|还是|要不要|是否应该|该不该|A\/B|Ａ\/Ｂ/i;
const careerPattern = /事业|工作|项目|跳槽|创业|offer|岗位|职业|公司|老板|同事/i;
const relationshipPattern = /感情|关系|复合|前任|对方|婚|恋爱|喜欢/i;

export function isChatServiceMode(value: unknown): value is ChatServiceMode {
  return value === "quick" || value === "formal" || value === "deep";
}

export function isChatReadingMethod(value: unknown): value is ChatReadingMethod {
  return value === "tarot" || value === "bazi" || value === "bagua" || value === "palm";
}

export function getChatServiceMode(mode: ChatServiceMode) {
  return chatServiceModes.find((item) => item.id === mode) ?? chatServiceModes[0];
}

export function inferChatService(question: string, hasPalmImage = false): ChatServiceBrief {
  const normalized = question.trim();

  if (hasPalmImage || /手相|掌纹|手掌|照片|图片/.test(normalized)) {
    return {
      intent: "palm",
      type: "手相追问",
      method: "图片校验 + AI 顾问总结",
      recommendedMode: "formal",
    };
  }

  if (/八字|五行|四柱|生日|出生|命盘/.test(normalized)) {
    return {
      intent: "bazi",
      type: /继续|刚才|原盘|上次/.test(normalized) ? "八字追问" : "八字问事",
      method: "四柱十神 + 大运流年 + AI 顾问总结",
      recommendedMode: "formal",
    };
  }

  if (/塔罗|牌阵|抽牌/.test(normalized)) {
    return {
      intent: "tarot",
      type: /复合|前任/.test(normalized) ? "感情复合" : "塔罗追问",
      method: "智能塔罗牌阵 + AI 顾问总结",
      recommendedMode: "formal",
    };
  }

  if (/八卦|起卦|起一卦|算一卦|占一卦|卦象|问事/.test(normalized)) {
    return {
      intent: "bagua",
      type: careerPattern.test(normalized) ? "事业选择" : "八卦问事",
      method: "六十四卦 + 动爻互错综 + AI 顾问总结",
      recommendedMode: "formal",
    };
  }

  return {
    intent: "general",
    type: careerPattern.test(normalized)
      ? "事业咨询"
      : relationshipPattern.test(normalized)
        ? "关系咨询"
        : decisionPattern.test(normalized)
          ? "选择咨询"
          : "综合问事",
    method: decisionPattern.test(normalized)
      ? "议题梳理 + 方法推荐 + AI 行动建议"
      : "议题梳理 + AI 行动建议",
    recommendedMode: normalized.length >= 36 ? "formal" : "quick",
  };
}
