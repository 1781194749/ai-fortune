import "server-only";

import {
  type PromptRoute,
  type PromptScene,
  type ReadingMethod,
  type SafetyAssessment,
  type ServiceTier,
} from "@/lib/prompts/contracts";

const explicitMethodPatterns: Array<[ReadingMethod, RegExp]> = [
  ["tarot", /塔罗|牌阵|抽牌/],
  ["bagua", /八卦|起卦|起一卦|算一卦|占一卦|卦象|六十四卦/],
  ["bazi", /八字|四柱|五行|命盘|大运|流年|出生|生日/],
  ["palm", /手相|掌纹|手掌|掌丘|生命线|智慧线|感情线/],
];

export function detectExplicitMethod(question: string, hasPalmImage = false): ReadingMethod | null {
  if (hasPalmImage) {
    return "palm";
  }

  const normalized = question.trim();
  return explicitMethodPatterns.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;
}

export function detectPromptScene(question: string): PromptScene {
  if (/感情|关系|复合|前任|对方|婚|恋|喜欢|伴侣/.test(question)) {
    return "relationship";
  }

  if (/事业|工作|职业|跳槽|创业|项目|老板|同事|offer|岗位|升职|离职/i.test(question)) {
    return "career";
  }

  if (/钱|财|收入|投资|买|卖|合作|合同|副业|借贷|股票|基金|币/.test(question)) {
    return "wealth";
  }

  if (/健康|身体|睡眠|焦虑|压力|状态|情绪|能量/.test(question)) {
    return "wellbeing";
  }

  return "general_guidance";
}

export function routePromptRequest(input: {
  question: string;
  serviceTier: ServiceTier;
  safety: SafetyAssessment;
  method: ReadingMethod;
  explicitMethod: boolean;
  pageEntry?: boolean;
  isFollowUp: boolean;
  answerShape: string;
  hasPalmImage?: boolean;
}) : PromptRoute {
  if (input.safety.blocked) {
    return {
      method: "general",
      scene: "high_risk",
      serviceTier: input.serviceTier,
      routeReason: "high_risk",
      shouldCallModel: false,
      allowPaid: false,
      safety: input.safety,
    };
  }

  if (input.answerShape === "identity_boundary") {
    return {
      method: "general",
      scene: "identity_boundary",
      serviceTier: input.serviceTier,
      routeReason: "identity_boundary",
      shouldCallModel: false,
      allowPaid: false,
      safety: input.safety,
    };
  }

  if (input.answerShape === "missing_info") {
    return {
      method: input.method,
      scene: "missing_info",
      serviceTier: input.serviceTier,
      routeReason: "missing_info",
      shouldCallModel: false,
      allowPaid: false,
      safety: input.safety,
    };
  }

  if (input.pageEntry || input.hasPalmImage) {
    return {
      method: "palm",
      scene: detectPromptScene(input.question),
      serviceTier: input.serviceTier,
      routeReason: "page_entry",
      shouldCallModel: true,
      allowPaid: true,
      safety: input.safety,
    };
  }

  if (input.explicitMethod) {
    return {
      method: input.method,
      scene: detectPromptScene(input.question),
      serviceTier: input.serviceTier,
      routeReason: "explicit_method",
      shouldCallModel: true,
      allowPaid: true,
      safety: input.safety,
    };
  }

  if (input.isFollowUp) {
    return {
      method: input.method,
      scene: detectPromptScene(input.question),
      serviceTier: input.serviceTier,
      routeReason: "follow_up",
      shouldCallModel: true,
      allowPaid: true,
      safety: input.safety,
    };
  }

  return {
    method: "general",
    scene: detectPromptScene(input.question),
    serviceTier: input.serviceTier,
    routeReason: "ordinary_consultation",
    shouldCallModel: true,
    allowPaid: true,
    safety: input.safety,
  };
}
