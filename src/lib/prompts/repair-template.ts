import "server-only";

export const repairPolicyPrompt =
  "修复只能纠正结构、证据引用、档位和安全问题，不得添加证据包之外的新事实。";

export function buildRepairTemplate(input: {
  validationErrors: string[];
  allowedEvidenceIds: string[];
  previousOutput: string;
}) {
  return JSON.stringify({
    task: "repair_fortune_answer",
    instruction:
      `上一次输出没有通过契约、事实、档位或安全校验。${repairPolicyPrompt}只修复为合法 JSON，不要解释修复过程，不要输出 Markdown。`,
    validationErrors: input.validationErrors,
    allowedEvidenceIds: input.allowedEvidenceIds,
    previousOutput: input.previousOutput.slice(0, 6000),
  });
}
