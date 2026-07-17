import "server-only";

import { createHash } from "crypto";
import { baseIdentityPrompt } from "@/lib/prompts/base-identity";
import { factBoundaryPrompt } from "@/lib/prompts/fact-boundary";
import { methodModules } from "@/lib/prompts/method-modules";
import {
  promptContractVersions,
  type PromptComponentSet,
  type PromptVersionMetadata,
  type ResolvedPromptRelease,
} from "@/lib/prompts/contracts";
import { repairPolicyPrompt } from "@/lib/prompts/repair-template";
import { reportTemplatePrompt } from "@/lib/prompts/report-templates";
import { safetyPolicyPrompt } from "@/lib/prompts/safety-policy";
import { sceneModules } from "@/lib/prompts/scene-modules";
import { serviceTierPrompts } from "@/lib/prompts/service-tiers";
import { subjectPolicyPrompt } from "@/lib/prompts/subject-policy";

export function digestPromptContent(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 24);
}

const outputContractPrompt = [
  "输出必须满足当前结构化 Schema。",
  "所有事实解释必须绑定允许的 evidenceId。",
  "程序会执行证据、安全、状态和服务档位校验。",
].join("\n");

const stableComponents = Object.freeze({
  baseIdentity: baseIdentityPrompt,
  factBoundary: factBoundaryPrompt,
  subjectPolicy: subjectPolicyPrompt,
  safetyPolicy: safetyPolicyPrompt,
  methodModules,
  sceneModules,
  serviceTierPrompts,
  reportTemplate: reportTemplatePrompt,
  outputContract: outputContractPrompt,
  repairPolicy: repairPolicyPrompt,
}) satisfies PromptComponentSet;

const candidateComponents = Object.freeze({
  ...stableComponents,
  factBoundary: [
    factBoundaryPrompt,
    "解释字段只能说明证据与现实问题的关系；牌名、卦名、干支、五行数量和日主等原始事实由系统渲染，不得自行改写。",
  ].join("\n"),
  safetyPolicy: [
    safetyPolicyPrompt,
    "任何确定性承诺、专业领域指令、跟踪纠缠建议或高风险付费引导都会被程序拒绝。",
  ].join("\n"),
}) satisfies PromptComponentSet;

type PromptReleaseDefinition = {
  metadata: Omit<PromptVersionMetadata, "releaseStatus" | "rolloutPercent">;
  components: PromptComponentSet;
};
type PromptEnvironment = Record<string, string | undefined>;

const stableReleaseId = "xuanji-prompt-2026-07-16-stable";
const candidateReleaseId = "xuanji-prompt-2026-07-16.2";

function defineRelease(
  promptReleaseId: string,
  components: PromptComponentSet,
  versions: {
    templateVersion: string;
    policyVersion: string;
    outputSchemaVersion: string;
    routerVersion: string;
    toolSchemaVersion: string;
  },
): PromptReleaseDefinition {
  return Object.freeze({
    metadata: Object.freeze({
      promptReleaseId,
      ...versions,
      contentDigest: digestPromptContent({ promptReleaseId, versions, components }),
    }),
    components,
  });
}

const codeDefinedReleases = Object.freeze({
  [stableReleaseId]: defineRelease(stableReleaseId, stableComponents, {
    templateVersion: "template-2026-07-16.1",
    policyVersion: "policy-2026-07-16.1",
    outputSchemaVersion: "fortune-answer-2026-07-16.1",
    routerVersion: "router-2026-07-16.1",
    toolSchemaVersion: "reading-evidence-2026-07-16.1",
  }),
  [candidateReleaseId]: defineRelease(candidateReleaseId, candidateComponents, {
    ...promptContractVersions,
    templateVersion: "template-2026-07-16.2",
    policyVersion: "policy-2026-07-16.2",
  }),
}) satisfies Readonly<Record<string, PromptReleaseDefinition>>;

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 100;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function cohortPercent(cohortKey: string) {
  const digest = createHash("sha256").update(cohortKey).digest("hex").slice(0, 8);
  return Number.parseInt(digest, 16) % 100;
}

function releaseById(releaseId: string | undefined, fallbackId: string) {
  const releases: Readonly<Record<string, PromptReleaseDefinition>> = codeDefinedReleases;
  return releases[releaseId ?? ""] ?? releases[fallbackId]!;
}

export function resolvePromptRelease(input: {
  cohortKey?: string;
  env?: PromptEnvironment;
} = {}): ResolvedPromptRelease {
  const env = input.env ?? process.env;
  const stable = releaseById(env.XUANJI_PROMPT_STABLE_RELEASE_ID?.trim(), stableReleaseId);
  const requested = releaseById(env.XUANJI_PROMPT_RELEASE_ID?.trim(), candidateReleaseId);
  const rolloutPercent = clampPercent(
    env.XUANJI_PROMPT_ROLLOUT_PERCENT
      ? Number(env.XUANJI_PROMPT_ROLLOUT_PERCENT)
      : 100,
  );
  const rolledBack = env.XUANJI_PROMPT_ROLLED_BACK === "true";
  const cohortKey = input.cohortKey ?? "anonymous";
  const inCandidateCohort = cohortPercent(`${requested.metadata.promptReleaseId}:${cohortKey}`) < rolloutPercent;
  const selected = rolledBack || !inCandidateCohort ? stable : requested;
  const releaseStatus: PromptVersionMetadata["releaseStatus"] = rolledBack
    ? "rolled_back"
    : selected.metadata.promptReleaseId === stable.metadata.promptReleaseId && rolloutPercent < 100
      ? "active"
      : rolloutPercent < 100
        ? "canary"
        : "active";

  return {
    metadata: {
      ...selected.metadata,
      releaseStatus,
      rolloutPercent: rolledBack ? 0 : rolloutPercent,
    },
    components: selected.components,
  };
}

export function getPromptRelease(input: {
  cohortKey?: string;
  env?: PromptEnvironment;
} = {}) {
  return resolvePromptRelease(input).metadata;
}

export function listPromptReleases(): PromptVersionMetadata[] {
  return Object.values(codeDefinedReleases).map((release) => ({
    ...release.metadata,
    releaseStatus: "active",
    rolloutPercent: release.metadata.promptReleaseId === candidateReleaseId ? 100 : 0,
  }));
}
