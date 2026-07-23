import "server-only";

import type { ModelMessage } from "ai";
import {
  deepReportAnswerSchema,
  type DeepReportAnswer,
  type PromptRoute,
  type PromptRunMetadata,
  type PromptValidationSummary,
  type ReadingEvidencePackage,
} from "@/lib/prompts/contracts";
import {
  findReadingEvidenceItem,
  serializeEvidenceForPrompt,
  validateGeneratedTextAgainstEvidence,
} from "@/lib/prompts/evidence";
import { buildOpenAiSafetyIdentifier } from "@/lib/prompts/composer";
import { resolvePromptRelease } from "@/lib/prompts/registry";
import { validateGeneratedTextSafety } from "@/lib/prompts/validation";

function compactText(value: string, maxLength: number) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength)}...`;
}

export type DeepReportPromptCompilation = {
  instructions: string;
  messages: ModelMessage[];
  userPayloadText: string;
  metadataBase: Omit<PromptRunMetadata, "validation">;
  safetyIdentifier: string;
};

export function composeDeepReportPrompt(input: {
  userId: string;
  productCode: string;
  productName: string;
  profileMemory: string;
  localDraft: { title: string; summary: string; content: string; type: string };
  route: PromptRoute;
  evidence: ReadingEvidencePackage;
  profileCompleteness: number;
}): DeepReportPromptCompilation {
  const release = resolvePromptRelease({ cohortKey: input.userId });
  const userPayload = {
    task: "create_structured_paid_deep_report",
    productCode: input.productCode,
    productName: input.productName,
    profileCompleteness: input.profileCompleteness,
    profileMemory: input.profileMemory,
    localDraft: input.localDraft,
    readingEvidence: serializeEvidenceForPrompt(input.evidence),
    requirements: {
      minimumSections: 4,
      minimumActions: 3,
      evidenceIdsMustBeAllowed: true,
      noInventedPalmOrBirthFacts: true,
    },
  };
  const userPayloadText = JSON.stringify(userPayload);

  return {
    instructions: [
      release.components.baseIdentity,
      release.components.factBoundary,
      release.components.subjectPolicy,
      release.components.safetyPolicy,
      release.components.methodModules.bazi,
      release.components.serviceTierPrompts.deep,
      release.components.reportTemplate,
      "输出必须严格满足 DeepReportAnswer Schema。报告至少四章、三个行动项；缺少手相或其他资料时必须写入限制，不得补造。",
    ].join("\n\n"),
    messages: [{ role: "user", content: userPayloadText }],
    userPayloadText,
    metadataBase: {
      prompt: release.metadata,
      route: {
        method: input.route.method,
        scene: input.route.scene,
        serviceTier: input.route.serviceTier,
        routeReason: input.route.routeReason,
        shouldCallModel: input.route.shouldCallModel,
        allowPaid: input.route.allowPaid,
        safetyRiskLevel: input.route.safety.riskLevel,
        safetyCategories: input.route.safety.categories,
      },
      evidence: {
        evidencePackageId: input.evidence.evidencePackageId,
        toolSchemaVersion: input.evidence.toolSchemaVersion,
        evidenceCount: input.evidence.items.length,
        factDigest: input.evidence.factDigest,
      },
      privacy: {
        inputHash: release.metadata.contentDigest,
        promptStored: false,
        sensitiveFieldsStored: false,
      },
    },
    safetyIdentifier: buildOpenAiSafetyIdentifier(input.userId),
  };
}

function reportText(answer: DeepReportAnswer) {
  return [
    answer.executiveSummary.title,
    answer.executiveSummary.summary,
    ...answer.sections.flatMap((section) => [section.title, ...section.insights]),
    ...answer.actionPlan.flatMap((action) => [action.label, action.detail, action.successSignal]),
    ...answer.uncertainty.reasons,
    ...answer.realityChecks,
    answer.safetyNotice,
  ].join("\n");
}

export function validateStructuredDeepReport(input: {
  answer: DeepReportAnswer;
  evidence: ReadingEvidencePackage;
}) {
  const shape = deepReportAnswerSchema.safeParse(input.answer);
  if (!shape.success) {
    return {
      ok: false,
      errors: shape.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }

  const allowed = new Set(input.evidence.allowedEvidenceIds);
  const errors: string[] = [];
  if (shape.data.status !== "ok") {
    errors.push("Model-generated deep report must return status=ok.");
  }
  const sectionIds = shape.data.sections.map((section) => section.sectionId);
  if (new Set(sectionIds).size !== sectionIds.length) {
    errors.push("Deep-report sectionId values must be unique.");
  }
  for (const required of ["profile_baseline", "structure", "themes", "action_strategy"] as const) {
    if (!sectionIds.includes(required)) {
      errors.push(`Deep report is missing required section: ${required}`);
    }
  }
  for (const section of shape.data.sections) {
    for (const evidenceId of section.evidenceRefs) {
      if (!allowed.has(evidenceId)) {
        errors.push(`Unknown deep-report evidenceId: ${evidenceId}`);
      }
    }
  }
  const text = reportText(shape.data);
  errors.push(...validateGeneratedTextAgainstEvidence(text, input.evidence));
  errors.push(...validateGeneratedTextSafety(text));
  return { ok: errors.length === 0, errors };
}

function splitLocalSections(content: string) {
  const chunks = content
    .split(/\n(?=[一二三四五六七八九十]+、)/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  return chunks.length > 1 ? chunks.slice(1) : chunks;
}

export function buildDeterministicDeepReport(input: {
  title: string;
  summary: string;
  content: string;
  evidence: ReadingEvidencePackage;
  reason: string;
}): DeepReportAnswer {
  const refs = input.evidence.allowedEvidenceIds.filter((id) => id !== "context.subject");
  const primaryRef = refs[0] ?? input.evidence.allowedEvidenceIds[0] ?? "report.localDraft";
  const sourceSections = splitLocalSections(input.content);
  const sectionIds: DeepReportAnswer["sections"][number]["sectionId"][] = [
    "profile_baseline",
    "structure",
    "themes",
    "action_strategy",
  ];
  const sectionTitles = ["档案基线", "命理结构", "关键主题", "行动策略"];
  const sections = sectionIds.map((sectionId, index) => ({
    sectionId,
    title: sectionTitles[index]!,
    evidenceRefs: refs.slice(index, index + 2).length > 0 ? refs.slice(index, index + 2) : [primaryRef],
    insights: [compactText(
      sourceSections[index] ?? "当前资料有限，本章仅保留本地确定性草稿中的稳健结论。",
      500,
    )],
  }));

  return {
    status: "fallback",
    executiveSummary: {
      title: input.title,
      summary: input.summary,
      confidence: "low",
    },
    sections,
    actionPlan: [
      {
        label: "确定一个核心主题",
        detail: "只选择当前最重要的一项推进，避免同时在多个方向消耗。",
        horizon: "今天",
        successSignal: "能够用一句话说明本阶段最重要的现实目标。",
        reversible: true,
      },
      {
        label: "建立三十天记录",
        detail: "按周记录精力、机会、阻力与实际结果，用现实变化校准报告解释。",
        horizon: "未来 30 天",
        successSignal: "至少形成四次有事实依据的周复盘。",
        reversible: true,
      },
      {
        label: "设置复盘与退出条件",
        detail: "提前写下继续、暂停和调整方向的条件，避免把报告当成不可逆命令。",
        horizon: "2-4 周",
        successSignal: "到期能够根据事实决定继续、调整或停止。",
        reversible: true,
      },
    ],
    uncertainty: {
      level: "high",
      reasons: [
        input.reason,
        "本轮使用完整本地报告降级，未扩展证据包之外的新事实。",
      ],
    },
    realityChecks: [
      "重大医疗、法律、投资、妊娠或人身安全问题必须以专业意见为准。",
      "报告里的时间窗口必须通过实际行动、反馈和环境变化复核。",
    ],
    safetyNotice: "本报告仅供文化参考、自我探索和情绪陪伴，不替代专业建议或重大人生决策。",
  };
}

export function renderDeepReportAnswer(answer: DeepReportAnswer, evidence: ReadingEvidencePackage) {
  const lines = [
    `# ${answer.executiveSummary.title}`,
    answer.executiveSummary.summary,
  ];

  for (const section of answer.sections) {
    lines.push(`## ${section.title}`);
    for (const evidenceId of section.evidenceRefs) {
      const item = findReadingEvidenceItem(evidence, evidenceId);
      if (item) {
        const summaryAlreadyLabeled =
          item.summary.startsWith(`${item.label}：`) || item.summary.startsWith(`${item.label}:`);
        const evidenceText = !item.summary
          ? item.label
          : summaryAlreadyLabeled
            ? item.summary
            : `${item.label}：${item.summary}`;
        lines.push(`- 证据：${evidenceText}`);
      }
    }
    lines.push(...section.insights);
  }

  lines.push("## 行动计划");
  lines.push(...answer.actionPlan.map((action, index) =>
    `${index + 1}. ${action.label}：${action.detail}（${action.horizon}；验证信号：${action.successSignal}）`,
  ));
  lines.push("## 不确定性与现实校验");
  lines.push(...answer.uncertainty.reasons.map((reason) => `- ${reason}`));
  lines.push(...answer.realityChecks.map((item) => `- ${item}`));
  lines.push(answer.safetyNotice);
  return lines.join("\n\n");
}

export function buildDeepReportPromptRunMetadata(input: {
  compilation: DeepReportPromptCompilation;
  validation: PromptValidationSummary;
}): PromptRunMetadata {
  return { ...input.compilation.metadataBase, validation: input.validation };
}
