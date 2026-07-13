import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  getLaunchAiStoragePlan,
  type LaunchAiStoragePlan,
  type LaunchAiStoragePlanStep,
} from "@/lib/launch-ai-storage-plan";
import {
  getLaunchCompliancePlan,
  type LaunchCompliancePlan,
  type LaunchCompliancePlanStep,
} from "@/lib/launch-compliance-plan";
import {
  getLaunchDatabasePlan,
  type LaunchDatabasePlan,
  type LaunchDatabasePlanStep,
} from "@/lib/launch-database-plan";
import {
  getLaunchDeploymentPlan,
  type LaunchDeploymentPlan,
  type LaunchDeploymentPlanStep,
} from "@/lib/launch-deployment-plan";
import {
  getLaunchEnvChecklist,
  type LaunchEnvChecklist,
  type LaunchEnvChecklistItem,
} from "@/lib/launch-env-checklist";
import {
  getLaunchPaymentPlan,
  type LaunchPaymentPlan,
  type LaunchPaymentPlanStep,
} from "@/lib/launch-payment-plan";

type Summary = {
  ready: number;
  warning: number;
  blocking: number;
  total: number;
};

export type LaunchProductionGateStepId =
  | "preflight"
  | "database"
  | "url"
  | "ai_storage"
  | "compliance"
  | "payment";

export type LaunchProductionGateItem = {
  id: string;
  label: string;
  status: HealthStatus;
  detail: string;
  action: string;
  evidence?: string;
};

export type LaunchProductionGateStep = {
  id: LaunchProductionGateStepId;
  label: string;
  status: HealthStatus;
  command: string;
  detail: string;
  action: string;
  evidence: string;
  summary: Summary;
  blockingItems: LaunchProductionGateItem[];
  warningItems: LaunchProductionGateItem[];
};

export type LaunchProductionGate = {
  generatedAt: string;
  status: HealthStatus;
  releaseReady: boolean;
  label: string;
  detail: string;
  action: string;
  summary: Summary;
  checkSummary: Summary;
  steps: LaunchProductionGateStep[];
  nextSteps: LaunchProductionGateStep[];
  nextActions: LaunchProductionGateItem[];
  commands: Array<{
    label: string;
    command: string;
    detail: string;
  }>;
  copyText: string;
};

type LaunchProductionGateInput = {
  envChecklist?: LaunchEnvChecklist;
  databasePlan?: LaunchDatabasePlan;
  deploymentPlan?: LaunchDeploymentPlan;
  aiStoragePlan?: LaunchAiStoragePlan;
  compliancePlan?: LaunchCompliancePlan;
  paymentPlan?: LaunchPaymentPlan;
};

function statusRank(status: HealthStatus) {
  if (status === "blocking") {
    return 0;
  }

  if (status === "warning") {
    return 1;
  }

  return 2;
}

function summarizeSteps(steps: LaunchProductionGateStep[]) {
  return {
    ready: steps.filter((step) => step.status === "ready").length,
    warning: steps.filter((step) => step.status === "warning").length,
    blocking: steps.filter((step) => step.status === "blocking").length,
    total: steps.length,
  };
}

function sumSummaries(steps: LaunchProductionGateStep[]) {
  return steps.reduce(
    (total, step) => ({
      ready: total.ready + step.summary.ready,
      warning: total.warning + step.summary.warning,
      blocking: total.blocking + step.summary.blocking,
      total: total.total + step.summary.total,
    }),
    { ready: 0, warning: 0, blocking: 0, total: 0 },
  );
}

function gateStatus(summary: Summary) {
  if (summary.blocking > 0) {
    return "blocking" as const;
  }

  if (summary.warning > 0) {
    return "warning" as const;
  }

  return "ready" as const;
}

function gateLabel(status: HealthStatus) {
  if (status === "ready") {
    return "生产门禁已全绿";
  }

  if (status === "warning") {
    return "可进入收费灰度复核";
  }

  return "暂不可收费上线";
}

function gateDetail(input: { status: HealthStatus; summary: Summary; checkSummary: Summary }) {
  if (input.status === "ready") {
    return "生产变量、数据库、公网路由、AI/七牛、合规主体和真实支付签名门禁均已通过。";
  }

  if (input.status === "warning") {
    return `当前无阻断步骤，但还有 ${input.checkSummary.warning} 个警告检查，需要在上线证据中说明或补齐。`;
  }

  return `当前 ${input.summary.blocking} 个门禁步骤仍有阻断，合计 ${input.checkSummary.blocking} 个阻断检查。`;
}

function gateAction(status: HealthStatus) {
  if (status === "ready") {
    return "可以进入真实支付小额订单、对账复核和灰度放量。";
  }

  if (status === "warning") {
    return "先按内部账号小额真实支付灰度，复核警告项并归档证据。";
  }

  return "优先处理 BLOCK 项；补齐生产变量、外部资质和第三方诊断后重新运行 npm run launch:production-gate。";
}

function envGateItems(items: LaunchEnvChecklistItem[]) {
  return items.map((item) => ({
    id: `env:${item.key}`,
    label: `${item.label} (${item.key})`,
    status: item.status,
    detail: item.detail || `${item.stateLabel}：${item.displayValue}`,
    action: item.action,
    evidence: item.sourceItems.length > 0 ? item.sourceItems.join("、") : undefined,
  }));
}

function planItems(
  prefix: string,
  steps: Array<
    | LaunchDatabasePlanStep
    | LaunchDeploymentPlanStep
    | LaunchAiStoragePlanStep
    | LaunchCompliancePlanStep
    | LaunchPaymentPlanStep
  >,
) {
  return steps.map((step) => ({
    id: `${prefix}:${step.id}`,
    label: step.title,
    status: step.status,
    detail: step.detail,
    action: step.action,
    evidence: step.evidence,
  }));
}

function splitItems(items: LaunchProductionGateItem[]) {
  return {
    blocking: items.filter((item) => item.status === "blocking").slice(0, 8),
    warning: items.filter((item) => item.status === "warning").slice(0, 5),
  };
}

function preflightStep(envChecklist: LaunchEnvChecklist): LaunchProductionGateStep {
  const items = envGateItems(envChecklist.items);
  const split = splitItems(items);

  return {
    id: "preflight",
    label: "生产变量预检",
    status: gateStatus(envChecklist.summary),
    command: "npm run launch:preflight",
    detail: "核对正式域名、生产库、安全密钥、登录、AI/七牛、支付和主体备案变量。",
    action: "补齐阻断变量后，重新运行上线预检和生产门禁。",
    evidence: "生产变量核对输出、部署平台环境变量脱敏截图和上线证据归档。",
    summary: {
      ready: envChecklist.summary.ready,
      warning: envChecklist.summary.warning,
      blocking: envChecklist.summary.blocking,
      total: envChecklist.summary.total,
    },
    blockingItems: split.blocking,
    warningItems: split.warning,
  };
}

function databaseStep(databasePlan: LaunchDatabasePlan): LaunchProductionGateStep {
  const split = splitItems(planItems("database", databasePlan.steps));

  return {
    id: "database",
    label: "PostgreSQL 与 Prisma Schema",
    status: databasePlan.status,
    command: "npm run launch:db-check -- --schema",
    detail: databasePlan.detail,
    action: databasePlan.action,
    evidence: "数据库连接检查、Prisma 核心表检查、后台落库探针和备份回滚证据。",
    summary: databasePlan.summary,
    blockingItems: split.blocking,
    warningItems: split.warning,
  };
}

function urlStep(deploymentPlan: LaunchDeploymentPlan): LaunchProductionGateStep {
  const split = splitItems(planItems("deployment", deploymentPlan.steps));

  return {
    id: "url",
    label: "公网域名与关键路由",
    status: deploymentPlan.status,
    command: "npm run launch:url-check",
    detail: deploymentPlan.detail,
    action: deploymentPlan.action,
    evidence: "APP_URL、HTTPS、首页/协议/后台健康页、支付回调和上传接口公网验收输出。",
    summary: deploymentPlan.summary,
    blockingItems: split.blocking,
    warningItems: split.warning,
  };
}

function aiStorageStep(aiStoragePlan: LaunchAiStoragePlan): LaunchProductionGateStep {
  const split = splitItems(planItems("ai-storage", aiStoragePlan.steps));

  return {
    id: "ai_storage",
    label: "OpenAI 与七牛云",
    status: aiStoragePlan.status,
    command: "npm run launch:ai-storage-check",
    detail: aiStoragePlan.detail,
    action: aiStoragePlan.action,
    evidence: "OpenAI 模型读取、成本费率、七牛上传 token、上传域名、公开域名和手相/深度报告样本证据。",
    summary: aiStoragePlan.summary,
    blockingItems: split.blocking,
    warningItems: split.warning,
  };
}

function complianceStep(compliancePlan: LaunchCompliancePlan): LaunchProductionGateStep {
  const split = splitItems(planItems("compliance", compliancePlan.steps));

  return {
    id: "compliance",
    label: "合规与主体一致性",
    status: compliancePlan.status,
    command: "npm run launch:compliance-check",
    detail: compliancePlan.detail,
    action: compliancePlan.action,
    evidence: "协议四件套、主体名称、ICP备案、支付主体一致、退款客服口径、图片授权和法务归档证据。",
    summary: compliancePlan.summary,
    blockingItems: split.blocking,
    warningItems: split.warning,
  };
}

function paymentStep(paymentPlan: LaunchPaymentPlan): LaunchProductionGateStep {
  const split = splitItems(planItems("payment", paymentPlan.nextSteps));

  return {
    id: "payment",
    label: "真实支付签名门禁",
    status: paymentPlan.status,
    command: "npm run launch:payment-check",
    detail: paymentPlan.detail,
    action: paymentPlan.action,
    evidence: "支付宝/微信支付参数、密钥签名诊断、小额订单、权益到账和对账证据。",
    summary: paymentPlan.summary,
    blockingItems: split.blocking,
    warningItems: split.warning,
  };
}

function buildCopyText(input: LaunchProductionGate) {
  const lines = [
    `玄机 AI 生产上线总门禁：${input.label}`,
    `门禁步骤：${input.summary.ready} ready / ${input.summary.warning} warning / ${input.summary.blocking} blocking`,
    `细分检查：${input.checkSummary.ready} ready / ${input.checkSummary.warning} warning / ${input.checkSummary.blocking} blocking`,
    `结论：${input.detail}`,
    `动作：${input.action}`,
    "",
    "优先处理：",
    ...(input.nextActions.length > 0
      ? input.nextActions.slice(0, 6).map((item) => `- ${item.label}：${item.action}`)
      : ["- 暂无阻断或警告项。"]),
    "",
    "命令：",
    ...input.commands.map((item) => `- ${item.command} # ${item.detail}`),
  ];

  return lines.join("\n");
}

export async function getLaunchProductionGate(input: LaunchProductionGateInput = {}) {
  const [envChecklist, databasePlan, deploymentPlan, aiStoragePlan, compliancePlan, paymentPlan] =
    await Promise.all([
      input.envChecklist ?? getLaunchEnvChecklist(),
      input.databasePlan ?? getLaunchDatabasePlan(),
      input.deploymentPlan ?? getLaunchDeploymentPlan(),
      input.aiStoragePlan ?? getLaunchAiStoragePlan(),
      input.compliancePlan ?? getLaunchCompliancePlan(),
      input.paymentPlan ?? getLaunchPaymentPlan(),
    ]);
  const steps = [
    preflightStep(envChecklist),
    databaseStep(databasePlan),
    urlStep(deploymentPlan),
    aiStorageStep(aiStoragePlan),
    complianceStep(compliancePlan),
    paymentStep(paymentPlan),
  ];
  const summary = summarizeSteps(steps);
  const checkSummary = sumSummaries(steps);
  const status = gateStatus(summary);
  const nextSteps = steps
    .filter((step) => step.status !== "ready")
    .sort((a, b) => statusRank(a.status) - statusRank(b.status));
  const nextActions = steps
    .flatMap((step) => [...step.blockingItems, ...step.warningItems])
    .sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        a.label.localeCompare(b.label, "zh-CN"),
    )
    .slice(0, 10);
  const gate = {
    generatedAt: new Date().toISOString(),
    status,
    releaseReady: status !== "blocking",
    label: gateLabel(status),
    detail: gateDetail({ status, summary, checkSummary }),
    action: gateAction(status),
    summary,
    checkSummary,
    steps,
    nextSteps,
    nextActions,
    commands: steps.map((step) => ({
      label: step.label,
      command: step.command,
      detail: step.detail,
    })),
    copyText: "",
  } satisfies LaunchProductionGate;

  return {
    ...gate,
    copyText: buildCopyText(gate),
  } satisfies LaunchProductionGate;
}
