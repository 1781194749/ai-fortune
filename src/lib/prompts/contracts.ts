import "server-only";

import { z } from "zod";

export const promptContractVersions = {
  templateVersion: "template-2026-07-16.3",
  policyVersion: "policy-2026-07-16.3",
  outputSchemaVersion: "fortune-answer-2026-07-16.3",
  routerVersion: "router-2026-07-16.3",
  toolSchemaVersion: "reading-evidence-2026-07-16.3",
} as const;

export const readingMethods = ["general", "tarot", "bagua", "bazi", "palm"] as const;
export const serviceTiers = ["quick", "formal", "deep"] as const;
export const promptScenes = [
  "general_guidance",
  "relationship",
  "career",
  "wealth",
  "wellbeing",
  "identity_boundary",
  "missing_info",
  "high_risk",
] as const;

export type ReadingMethod = (typeof readingMethods)[number];
export type PromptScene = (typeof promptScenes)[number];
export type ServiceTier = (typeof serviceTiers)[number];

export type SafetyRiskCategory =
  | "self_harm"
  | "violence"
  | "domestic_abuse"
  | "medical"
  | "legal"
  | "investment"
  | "gambling"
  | "stalking"
  | "minor"
  | "pregnancy"
  | "severe_dependency"
  | "prompt_injection";

export type SafetyAssessment = {
  riskLevel: "low" | "medium" | "high";
  categories: SafetyRiskCategory[];
  blocked: boolean;
  notEligibleForPaid: boolean;
  reason: string;
  userMessage: string;
};

export type ReadingSubjectContract = {
  kind: "self" | "other" | "relationship" | "unspecified";
  label: string;
  memberProfileRole: "subject" | "questioner" | "none";
};

export type ReadingEvidenceItem = {
  evidenceId: string;
  method: ReadingMethod;
  kind:
    | "context"
    | "subject_boundary"
    | "tarot_spread"
    | "tarot_card"
    | "bagua_hexagram"
    | "bagua_moving_line"
    | "bazi_pillars"
    | "bazi_wuxing"
    | "bazi_day_master"
    | "bazi_luck"
    | "palm_image"
    | "palm_signal";
  label: string;
  summary: string;
  data: unknown;
  allowedTerms: string[];
  sensitive?: boolean;
};

export type ReadingEvidencePackage = {
  evidencePackageId: string;
  toolSchemaVersion: string;
  method: ReadingMethod;
  subject: ReadingSubjectContract;
  items: ReadingEvidenceItem[];
  allowedEvidenceIds: string[];
  factDigest: string;
};

export type PromptRoute = {
  method: ReadingMethod;
  scene: PromptScene;
  serviceTier: ServiceTier;
  routeReason:
    | "explicit_method"
    | "page_entry"
    | "follow_up"
    | "ordinary_consultation"
    | "missing_info"
    | "high_risk"
    | "identity_boundary";
  shouldCallModel: boolean;
  allowPaid: boolean;
  safety: SafetyAssessment;
};

export type PromptVersionMetadata = {
  promptReleaseId: string;
  templateVersion: string;
  policyVersion: string;
  outputSchemaVersion: string;
  routerVersion: string;
  toolSchemaVersion: string;
  contentDigest: string;
  releaseStatus: "active" | "canary" | "rolled_back";
  rolloutPercent: number;
};

export type PromptComponentSet = {
  baseIdentity: string;
  factBoundary: string;
  subjectPolicy: string;
  safetyPolicy: string;
  methodModules: Record<ReadingMethod, string>;
  sceneModules: Record<PromptScene, string>;
  serviceTierPrompts: Record<ServiceTier, string>;
  reportTemplate: string;
  outputContract: string;
  repairPolicy: string;
};

export type ResolvedPromptRelease = {
  metadata: PromptVersionMetadata;
  components: PromptComponentSet;
};

export type PromptValidationSummary = {
  ok: boolean;
  errors: string[];
  repaired: boolean;
  repairAttempts: number;
  degraded: boolean;
};

export type PromptRunMetadata = {
  prompt: PromptVersionMetadata;
  route: Omit<PromptRoute, "safety"> & {
    safetyRiskLevel: SafetyAssessment["riskLevel"];
    safetyCategories: SafetyRiskCategory[];
  };
  evidence: {
    evidencePackageId: string;
    toolSchemaVersion: string;
    evidenceCount: number;
    factDigest: string;
  };
  validation: PromptValidationSummary;
  privacy: {
    inputHash: string;
    promptStored: false;
    sensitiveFieldsStored: false;
  };
};

const boundedText = (max: number) => z.string().trim().min(1).max(max);

export const fortuneAnswerSchema = z.object({
  status: z.enum(["ok", "needs_input", "blocked", "fallback"]),
  verdict: z.object({
    summary: boundedText(220),
    stance: boundedText(80).nullable(),
    confidence: z.enum(["low", "medium", "high"]),
  }).strict(),
  evidenceRefs: z.array(boundedText(120)).max(16),
  interpretations: z.array(
    z.object({
      evidenceId: boundedText(120),
      claim: boundedText(360),
      meaning: boundedText(360),
      limitation: boundedText(260).nullable(),
    }).strict(),
  ).max(10),
  uncertainty: z.object({
    level: z.enum(["low", "medium", "high"]),
    reasons: z.array(boundedText(180)).min(1).max(5),
  }).strict(),
  actions: z.array(
    z.object({
      label: boundedText(80),
      detail: boundedText(260),
      horizon: boundedText(60),
      reversible: z.boolean(),
    }).strict(),
  ).min(1).max(6),
  realityChecks: z.array(boundedText(220)).min(1).max(6),
  followUps: z.array(boundedText(80)).min(1).max(5),
  safetyNotice: boundedText(260),
}).strict();

export type FortuneAnswer = z.infer<typeof fortuneAnswerSchema>;

export const deepReportAnswerSchema = z.object({
  status: z.enum(["ok", "fallback"]),
  executiveSummary: z.object({
    title: boundedText(120),
    summary: boundedText(700),
    confidence: z.enum(["low", "medium", "high"]),
  }).strict(),
  sections: z.array(
    z.object({
      sectionId: z.enum([
        "profile_baseline",
        "structure",
        "themes",
        "timing",
        "action_strategy",
        "limitations",
      ]),
      title: boundedText(100),
      evidenceRefs: z.array(boundedText(120)).min(1).max(10),
      insights: z.array(boundedText(520)).min(1).max(6),
    }).strict(),
  ).min(4).max(6),
  actionPlan: z.array(
    z.object({
      label: boundedText(100),
      detail: boundedText(360),
      horizon: boundedText(80),
      successSignal: boundedText(240),
      reversible: z.boolean(),
    }).strict(),
  ).min(3).max(8),
  uncertainty: z.object({
    level: z.enum(["low", "medium", "high"]),
    reasons: z.array(boundedText(240)).min(1).max(6),
  }).strict(),
  realityChecks: z.array(boundedText(280)).min(2).max(8),
  safetyNotice: boundedText(320),
}).strict();

export type DeepReportAnswer = z.infer<typeof deepReportAnswerSchema>;

export function parseFortuneAnswer(value: unknown) {
  return fortuneAnswerSchema.safeParse(value);
}
