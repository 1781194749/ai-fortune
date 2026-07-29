import "server-only";

import type {
  FortuneAnswer,
  PromptRoute,
  ReadingEvidencePackage,
  ServiceTier,
} from "@/lib/prompts/contracts";
import { getCustomerAnswerBoundaryIssues } from "@/lib/product-identity";

const absolutePromisePatterns = [
  /(?:百分之百|100%)(?=[^。；\n]{0,20}(?:会|能|可以|确定|保证|确保|准确|复合|发财|中奖|治愈|胜诉|成功|回来))|必定|命中注定/,
  /(?:一定|必然|肯定|注定|绝对)(?:会|能|可以|要)?[^。；\n]{0,20}(?:复合|发财|中奖|治愈|胜诉|成功|回来)/,
  /(?<!不)(?<!不能)(?:保证|确保|包你)[^。；\n]{0,20}(?:复合|发财|中奖|治愈|胜诉|成功)/,
];

const professionalDirectivePatterns = [
  /(?:立即|现在|应该|必须|建议你)(?:买入|卖出|加仓|清仓|贷款|借钱)/,
  /(?:立即|现在|应该|必须|建议你)(?:停药|减药|加药|拒绝治疗|不去医院)/,
  /(?:一定|肯定|绝对)(?:不会被判|会胜诉|没有病|能治好|能中奖)/,
  /(?:稳赚|稳赢|必赚|内幕号码|彩票号码是)/,
];

const invasiveRelationshipPatterns = [
  /对方(?:一定|肯定|百分之百|绝对).{0,16}(?:爱你|想你|会回来|会复合|在撒谎)/,
  /(?:跟踪|蹲守|监视|查定位|骚扰).{0,16}(?:对方|前任|伴侣)/,
];

const paidPressurePatterns = [
  /(?:充值|付费|购买|开通).{0,16}(?:才能|才会|保证|改命|转运|复合|发财)/,
  /(?:不付费|不充值).{0,16}(?:就不能|会错过|会失去)/,
];

function answerText(answer: FortuneAnswer) {
  return [
    answer.verdict.summary,
    answer.verdict.stance ?? "",
    ...answer.interpretations.flatMap((item) => [item.claim, item.meaning, item.limitation ?? ""]),
    ...answer.uncertainty.reasons,
    ...answer.actions.flatMap((item) => [item.label, item.detail, item.horizon]),
    ...answer.realityChecks,
    ...answer.followUps,
    answer.safetyNotice,
  ].join("\n");
}

function patternErrors(text: string, label: string, patterns: RegExp[]) {
  return patterns
    .filter((pattern) => pattern.test(text))
    .map((pattern) => `${label}: ${pattern.source}`);
}

function maskNegatedPromiseClauses(text: string) {
  return text.replace(
    /(?:不代表|并不代表|不能说明|无法说明|不意味着|并不意味着|不等于|不能保证|无法保证|不保证)[^。；！？\n]{0,60}(?:(?:一定|必然|肯定|注定|绝对)(?:会|能|可以|要)?[^。；！？\n]{0,20}(?:复合|发财|中奖|治愈|胜诉|成功|回来)|对方(?:一定|肯定|百分之百|绝对).{0,16}(?:爱你|想你|会回来|会复合|在撒谎))/g,
    "[已说明并非确定结果]",
  );
}

export function validateGeneratedTextSafety(text: string) {
  const assertionText = maskNegatedPromiseClauses(text);
  return [
    ...patternErrors(assertionText, "Absolute promise is not allowed", absolutePromisePatterns),
    ...patternErrors(text, "Professional directive is not allowed", professionalDirectivePatterns),
    ...patternErrors(assertionText, "Invasive relationship advice is not allowed", invasiveRelationshipPatterns),
    ...patternErrors(text, "Paid pressure is not allowed", paidPressurePatterns),
    ...getCustomerAnswerBoundaryIssues(text).map(
      (issue) => `Customer-visible implementation detail is not allowed: ${issue}`,
    ),
  ];
}

export function validateFortuneAnswerSafety(answer: FortuneAnswer) {
  return validateGeneratedTextSafety(answerText(answer));
}

export function validateFortuneAnswerStatus(answer: FortuneAnswer, route?: PromptRoute) {
  if (!route) {
    return [];
  }

  const errors: string[] = [];
  if (route.safety.blocked && answer.status !== "blocked") {
    errors.push("High-risk route must return status=blocked.");
  }
  if (!route.safety.blocked && answer.status === "blocked") {
    errors.push("Low-risk route cannot return status=blocked.");
  }
  if (route.routeReason === "missing_info" && answer.status !== "needs_input") {
    errors.push("Missing-info route must return status=needs_input.");
  }
  if (answer.status === "needs_input" && answer.verdict.confidence === "high") {
    errors.push("Missing-info answer cannot use high confidence.");
  }
  return errors;
}

export function validateFortuneAnswerTier(input: {
  answer: FortuneAnswer;
  serviceTier?: ServiceTier;
  evidence: ReadingEvidencePackage;
  route?: PromptRoute;
}) {
  if (!input.serviceTier || input.answer.status === "blocked" || input.answer.status === "needs_input") {
    return [];
  }

  const errors: string[] = [];
  const evidenceRich = input.evidence.items.filter((item) => item.kind !== "context" && item.kind !== "subject_boundary").length >= 2;

  if (input.serviceTier === "quick") {
    if (input.answer.interpretations.length > 2) errors.push("quick allows at most 2 interpretations.");
    if (input.answer.actions.length > 1) errors.push("quick requires exactly 1 next action.");
  }

  if (
    input.serviceTier === "formal" &&
    input.route?.routeReason !== "follow_up" &&
    evidenceRich &&
    input.answer.interpretations.length < 2
  ) {
    errors.push("formal requires at least 2 evidence interpretations when evidence is available.");
  }

  if (input.serviceTier === "deep" && evidenceRich) {
    if (input.answer.interpretations.length < 3) errors.push("deep requires at least 3 evidence interpretations.");
    if (input.answer.actions.length < 2) errors.push("deep requires at least 2 actions.");
    if (input.answer.realityChecks.length < 2) errors.push("deep requires at least 2 reality checks.");
  }

  return errors;
}
