import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  type IntegrationDiagnostics,
  type IntegrationProbeItem,
  getIntegrationDiagnostics,
} from "@/lib/integration-diagnostics";
import {
  type LaunchAcceptanceCase,
  type LaunchAcceptanceMatrix,
} from "@/lib/launch-acceptance";
import {
  getLaunchAiStorageAcceptanceEvidenceRecords,
  latestLaunchAiStorageAcceptanceEvidenceByItem,
  summarizeLaunchAiStorageAcceptanceEvidenceRecords,
  type LaunchAiStorageAcceptanceEvidenceRecord,
  type LaunchAiStorageAcceptanceEvidenceSummary,
} from "@/lib/launch-ai-storage-acceptance";
import {
  getLaunchApplicationPack,
  type LaunchApplicationPack,
  type LaunchApplicationPlatform,
} from "@/lib/launch-application-pack";
import {
  getLaunchCallbackChecklist,
  type LaunchCallbackChecklist,
  type LaunchCallbackItem,
} from "@/lib/launch-callbacks";
import {
  getLaunchEnvChecklist,
  type LaunchEnvChecklist,
  type LaunchEnvChecklistItem,
} from "@/lib/launch-env-checklist";
import {
  getLaunchExternalReadiness,
  type ExternalReadinessItem,
  type LaunchExternalReadiness,
} from "@/lib/launch-external-readiness";
import {
  getLaunchUnitEconomics,
  type LaunchUnitEconomics,
} from "@/lib/launch-unit-economics";

export type LaunchAiStoragePlanStepId =
  | "openai_application"
  | "openai_env"
  | "openai_cost_rates"
  | "openai_diagnostics"
  | "qiniu_application"
  | "qiniu_env"
  | "qiniu_callbacks"
  | "palm_vision"
  | "deep_report"
  | "cost_sample";

export type LaunchAiStoragePlanStep = {
  id: LaunchAiStoragePlanStepId;
  order: number;
  title: string;
  status: HealthStatus;
  owner: string;
  detail: string;
  action: string;
  evidence: string;
  routes?: string[];
  envKeys?: string[];
  commands?: string[];
};

export type LaunchAiStoragePlanCommand = {
  label: string;
  command: string;
  detail: string;
};

export type LaunchAiStoragePlanCommandGroup = {
  title: string;
  when: string;
  commands: LaunchAiStoragePlanCommand[];
};

export type LaunchAiStoragePlan = {
  generatedAt: string;
  status: HealthStatus;
  label: string;
  detail: string;
  action: string;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
    openaiReady: boolean;
    qiniuReady: boolean;
    aiCostSamples: number;
    missingCostSamples: number;
  };
  diagnostics: {
    openai: HealthStatus;
    qiniu: HealthStatus;
    appUrl: string;
  };
  aiStorage: {
    evidenceRecordCount: number;
    latestEvidenceAt?: string;
  };
  evidenceSummary: LaunchAiStorageAcceptanceEvidenceSummary;
  evidenceRecords: LaunchAiStorageAcceptanceEvidenceRecord[];
  steps: LaunchAiStoragePlanStep[];
  nextSteps: LaunchAiStoragePlanStep[];
  commandGroups: LaunchAiStoragePlanCommandGroup[];
  evidence: string[];
  copyText: string;
};

type LaunchAiStoragePlanInput = {
  envChecklist?: LaunchEnvChecklist;
  integrationDiagnostics?: IntegrationDiagnostics;
  applicationPack?: LaunchApplicationPack;
  callbacks?: LaunchCallbackChecklist;
  acceptance?: LaunchAcceptanceMatrix;
  externalReadiness?: LaunchExternalReadiness;
  unitEconomics?: LaunchUnitEconomics;
  evidenceRecords?: LaunchAiStorageAcceptanceEvidenceRecord[];
};

const openAiEnvKeys = [
  "OPENAI_API_KEY",
  "OPENAI_DEFAULT_MODEL",
  "OPENAI_FAST_MODEL",
  "OPENAI_PREMIUM_MODEL",
  "OPENAI_VISION_MODEL",
];

const openAiCostRateEnvKeys = [
  "OPENAI_DEFAULT_INPUT_CENTS_PER_1M_TOKENS",
  "OPENAI_DEFAULT_OUTPUT_CENTS_PER_1M_TOKENS",
];

const qiniuEnvKeys = [
  "QINIU_ACCESS_KEY",
  "QINIU_SECRET_KEY",
  "QINIU_BUCKET",
  "QINIU_REGION",
  "QINIU_PUBLIC_DOMAIN",
];

function statusRank(status: HealthStatus) {
  if (status === "blocking") {
    return 0;
  }

  if (status === "warning") {
    return 1;
  }

  return 2;
}

function worstStatus(statuses: HealthStatus[]) {
  return statuses.sort((a, b) => statusRank(a) - statusRank(b))[0] ?? "ready";
}

function statusLabel(status: HealthStatus) {
  if (status === "ready") {
    return "已完成";
  }

  if (status === "blocking") {
    return "阻断";
  }

  return "需复核";
}

function dateLabel(value: string | undefined) {
  return value ? value.slice(0, 16).replace("T", " ") : "未记录";
}

function evidenceRecordLabel(record: LaunchAiStorageAcceptanceEvidenceRecord | undefined) {
  if (!record) {
    return undefined;
  }

  const firstUrl =
    record.metadata.evidenceUrl ??
    record.metadata.diagnosticUrl ??
    record.metadata.publicImageUrl ??
    record.metadata.palmReportUrl ??
    record.metadata.deepReportUrl ??
    record.metadata.costSampleUrl;
  const extra = record.metadata.note ?? firstUrl ?? "已保存后台证据";

  return `最近证据：${statusLabel(record.metadata.status)}，${dateLabel(
    record.metadata.savedAt,
  )}，${extra}`;
}

function statusWithEvidence(
  baseStatus: HealthStatus,
  evidence: LaunchAiStorageAcceptanceEvidenceRecord | undefined,
) {
  if (!evidence) {
    return baseStatus;
  }

  if (evidence.metadata.status === "blocking") {
    return "blocking" as const;
  }

  if (baseStatus === "ready" && evidence.metadata.status === "warning") {
    return "warning" as const;
  }

  return baseStatus;
}

function envByKey(envChecklist: LaunchEnvChecklist) {
  return new Map(envChecklist.items.map((item) => [item.key, item]));
}

function platformById(applicationPack: LaunchApplicationPack) {
  return new Map(applicationPack.platforms.map((platform) => [platform.id, platform]));
}

function callbackById(callbacks: LaunchCallbackChecklist) {
  return new Map(callbacks.items.map((callback) => [callback.id, callback]));
}

function diagnosticById(integrationDiagnostics: IntegrationDiagnostics) {
  return new Map(integrationDiagnostics.items.map((item) => [item.id, item]));
}

function externalById(externalReadiness: LaunchExternalReadiness) {
  return new Map(externalReadiness.items.map((item) => [item.id, item]));
}

function caseById(acceptance: LaunchAcceptanceMatrix) {
  return new Map(acceptance.cases.map((item) => [item.id, item]));
}

function envSummary(items: Array<LaunchEnvChecklistItem | undefined>) {
  const existing = items.filter((item): item is LaunchEnvChecklistItem => Boolean(item));
  const missing = existing.filter((item) => item.status !== "ready");

  return {
    status: existing.length > 0 ? worstStatus(existing.map((item) => item.status)) : "blocking",
    detail:
      missing.length > 0
        ? `待处理变量：${missing.map((item) => `${item.label}(${item.stateLabel})`).join("、")}`
        : "相关生产变量已通过核对。",
    action:
      missing[0]?.action ?? "保留部署平台环境变量脱敏截图，并在上线前重新运行生产变量核对。",
  };
}

function applicationDetail(input: {
  platform?: LaunchApplicationPlatform;
  external?: ExternalReadinessItem;
}) {
  const pieces = [
    input.platform ? `${input.platform.title}：${input.platform.label}` : undefined,
    input.platform?.submission.statusLabel
      ? `外部状态：${input.platform.submission.statusLabel}`
      : undefined,
    input.platform?.submission.receiptNo ? `回执：${input.platform.submission.receiptNo}` : undefined,
    input.external?.targetDate ? `目标日期：${input.external.targetDate}` : undefined,
    input.external?.evidenceNote ? `证据：${input.external.evidenceNote}` : undefined,
  ];

  return pieces.filter(Boolean).join("；") || "平台材料尚未闭合。";
}

function callbackDetail(callbacks: Array<LaunchCallbackItem | undefined>) {
  const existing = callbacks.filter((item): item is LaunchCallbackItem => Boolean(item));

  return existing
    .map((item) => `${item.configName}: ${item.value}`)
    .join("；") || "七牛 CORS 或公开域名配置项缺失。";
}

function acceptanceDetail(testCase: LaunchAcceptanceCase | undefined) {
  if (!testCase) {
    return "验收矩阵中没有找到该用例。";
  }

  return `${testCase.goal}；路线：${testCase.routes.join("、")}`;
}

function summarize(steps: LaunchAiStoragePlanStep[], unitEconomics: LaunchUnitEconomics) {
  return {
    ready: steps.filter((step) => step.status === "ready").length,
    warning: steps.filter((step) => step.status === "warning").length,
    blocking: steps.filter((step) => step.status === "blocking").length,
    total: steps.length,
    openaiReady: steps
      .filter((step) => step.id.startsWith("openai"))
      .every((step) => step.status === "ready"),
    qiniuReady: steps
      .filter((step) => step.id.startsWith("qiniu"))
      .every((step) => step.status === "ready"),
    aiCostSamples: unitEconomics.summary.openaiLogCount,
    missingCostSamples: unitEconomics.summary.missingOpenaiCostCount,
  };
}

function planStatus(summary: ReturnType<typeof summarize>) {
  if (summary.blocking > 0) {
    return "blocking" as const;
  }

  if (summary.warning > 0) {
    return "warning" as const;
  }

  return "ready" as const;
}

function labelFor(status: HealthStatus, summary: LaunchAiStoragePlan["summary"]) {
  if (status === "blocking") {
    return `AI 与图片能力未闭合：${summary.blocking} 个阻断步骤`;
  }

  if (status === "warning") {
    return `AI 与图片能力待复核：${summary.warning} 个步骤`;
  }

  return "AI 与图片能力已可进入收费灰度";
}

function detailFor(input: {
  status: HealthStatus;
  openaiDiagnostic?: IntegrationProbeItem;
  qiniuDiagnostic?: IntegrationProbeItem;
}) {
  if (input.status === "ready") {
    return "OpenAI、七牛、手相视觉、深度报告和 AI 成本样本均已形成上线闭环。";
  }

  if (input.openaiDiagnostic?.status !== "ready") {
    return "当前优先补 OpenAI：API Key、模型权限、视觉模型和成本记录决定 AI 对话、手相与深度报告质量。";
  }

  if (input.qiniuDiagnostic?.status !== "ready") {
    return "OpenAI 已基本就绪，下一步补七牛 bucket、公开域名、CORS 和真实手相图片读取。";
  }

  return "基础模型和存储已接近就绪，下一步补端到端手测和 AI 成本样本。";
}

function buildSteps(input: {
  envChecklist: LaunchEnvChecklist;
  integrationDiagnostics: IntegrationDiagnostics;
  applicationPack: LaunchApplicationPack;
  callbacks: LaunchCallbackChecklist;
  acceptance: LaunchAcceptanceMatrix;
  externalReadiness: LaunchExternalReadiness;
  unitEconomics: LaunchUnitEconomics;
  evidenceRecords: LaunchAiStorageAcceptanceEvidenceRecord[];
}) {
  const env = envByKey(input.envChecklist);
  const platforms = platformById(input.applicationPack);
  const callbacks = callbackById(input.callbacks);
  const diagnostics = diagnosticById(input.integrationDiagnostics);
  const external = externalById(input.externalReadiness);
  const cases = caseById(input.acceptance);
  const openaiPlatform = platforms.get("openai");
  const qiniuPlatform = platforms.get("qiniu");
  const openaiExternal = external.get("openai");
  const qiniuExternal = external.get("qiniu");
  const openaiEnv = envSummary(openAiEnvKeys.map((key) => env.get(key)));
  const openaiCostRates = envSummary(openAiCostRateEnvKeys.map((key) => env.get(key)));
  const qiniuEnv = envSummary(qiniuEnvKeys.map((key) => env.get(key)));
  const openaiDiagnostic = diagnostics.get("openai");
  const qiniuDiagnostic = diagnostics.get("qiniu");
  const qiniuCallbacks = [callbacks.get("qiniu:cors-origin"), callbacks.get("qiniu:public-domain")];
  const qiniuCallbackStatus = worstStatus(
    qiniuCallbacks
      .filter((item): item is LaunchCallbackItem => Boolean(item))
      .map((item) => item.status),
  );
  const palmCase = cases.get("palm-upload-vision-report");
  const chatCase = cases.get("ai-chat-profile-memory");
  const deepReportCase = cases.get("deep-report-paid-generation");
  const evidenceByItem = latestLaunchAiStorageAcceptanceEvidenceByItem(input.evidenceRecords);
  const openaiApplicationEvidence = evidenceByItem.get("openai_application");
  const openaiEnvEvidence = evidenceByItem.get("openai_env");
  const openaiCostRatesEvidence = evidenceByItem.get("openai_cost_rates");
  const openaiDiagnosticsEvidence = evidenceByItem.get("openai_diagnostics");
  const qiniuApplicationEvidence = evidenceByItem.get("qiniu_application");
  const qiniuEnvEvidence = evidenceByItem.get("qiniu_env");
  const qiniuCallbacksEvidence = evidenceByItem.get("qiniu_callbacks");
  const palmVisionEvidence = evidenceByItem.get("palm_vision");
  const deepReportEvidence = evidenceByItem.get("deep_report");
  const costSampleEvidence = evidenceByItem.get("cost_sample");
  const costStatus =
    input.unitEconomics.summary.openaiLogCount > 0 &&
    input.unitEconomics.summary.missingOpenaiCostCount === 0
      ? "ready"
      : input.unitEconomics.summary.openaiLogCount > 0
        ? "warning"
        : "warning";

  return [
    {
      id: "openai_application",
      order: 1,
      title: "OpenAI 项目、Key 和预算",
      status: statusWithEvidence(
        worstStatus([
          openaiPlatform?.status ?? "blocking",
          openaiExternal?.healthStatus ?? "blocking",
        ]),
        openaiApplicationEvidence,
      ),
      owner: "技术 / 产品",
      detail: applicationDetail({ platform: openaiPlatform, external: openaiExternal }),
      action:
        openaiPlatform?.status === "ready" && openaiExternal?.healthStatus === "ready"
          ? "保留 OpenAI 项目、预算上限和 Key 管理证据。"
          : openaiPlatform?.nextAction ?? openaiExternal?.action ?? "创建生产 OpenAI 项目、API Key 和预算上限。",
      evidence:
        evidenceRecordLabel(openaiApplicationEvidence) ??
        openaiPlatform?.evidence.join("；") ??
        openaiExternal?.evidenceNote ??
        "OpenAI 项目截图、预算上限截图、Key 已写入部署平台的脱敏截图。",
      envKeys: ["OPENAI_API_KEY"],
    },
    {
      id: "openai_env",
      order: 2,
      title: "OpenAI 模型变量",
      status: statusWithEvidence(openaiEnv.status, openaiEnvEvidence),
      owner: "技术",
      detail: openaiEnv.detail,
      action: openaiEnv.action,
      evidence:
        evidenceRecordLabel(openaiEnvEvidence) ??
        "OPENAI_API_KEY、默认模型、低成本模型、深度报告模型和视觉模型的脱敏配置截图。",
      envKeys: openAiEnvKeys,
    },
    {
      id: "openai_diagnostics",
      order: 4,
      title: "OpenAI 模型读取诊断",
      status: statusWithEvidence(
        openaiDiagnostic?.status ?? "warning",
        openaiDiagnosticsEvidence,
      ),
      owner: "技术",
      detail: openaiDiagnostic?.detail ?? "尚未运行 OpenAI 模型读取诊断。",
      action: openaiDiagnostic?.action ?? "运行第三方诊断，确认默认模型可被当前 Key 读取。",
      evidence:
        evidenceRecordLabel(openaiDiagnosticsEvidence) ??
        "后台第三方诊断中 OpenAI 模型读取通过，并写入 integration_probe。",
      commands: ["npm run launch:ai-storage-check", "POST /api/admin/integrations/probe"],
    },
    {
      id: "openai_cost_rates",
      order: 3,
      title: "OpenAI 成本费率",
      status: statusWithEvidence(openaiCostRates.status, openaiCostRatesEvidence),
      owner: "产品 / 技术 / 财务",
      detail: openaiCostRates.detail,
      action:
        openaiCostRates.status === "ready"
          ? "保留 OpenAI 账单费率来源，并在模型价格变更后同步环境变量。"
          : "填入 OpenAI 输入/输出每百万 token 的人民币分成本，避免单位经济只依赖启动估算表。",
      evidence:
        evidenceRecordLabel(openaiCostRatesEvidence) ??
        "OPENAI_DEFAULT_INPUT_CENTS_PER_1M_TOKENS、OPENAI_DEFAULT_OUTPUT_CENTS_PER_1M_TOKENS 的部署变量截图和费率来源。",
      envKeys: openAiCostRateEnvKeys,
      commands: ["npm run launch:ai-storage-check", "GET /api/admin/launch/unit-economics"],
    },
    {
      id: "qiniu_application",
      order: 5,
      title: "七牛 bucket、域名和存储项目",
      status: statusWithEvidence(
        worstStatus([
          qiniuPlatform?.status ?? "blocking",
          qiniuExternal?.healthStatus ?? "blocking",
        ]),
        qiniuApplicationEvidence,
      ),
      owner: "技术 / 运维",
      detail: applicationDetail({ platform: qiniuPlatform, external: qiniuExternal }),
      action:
        qiniuPlatform?.status === "ready" && qiniuExternal?.healthStatus === "ready"
          ? "保留 bucket、公开域名和 CORS 配置截图。"
          : qiniuPlatform?.nextAction ?? qiniuExternal?.action ?? "创建七牛 bucket，绑定 HTTPS 公开域名和跨域规则。",
      evidence:
        evidenceRecordLabel(qiniuApplicationEvidence) ??
        qiniuPlatform?.evidence.join("；") ??
        qiniuExternal?.evidenceNote ??
        "七牛 bucket、公开域名、HTTPS 和 CORS 配置截图。",
      envKeys: ["QINIU_BUCKET", "QINIU_PUBLIC_DOMAIN"],
    },
    {
      id: "qiniu_env",
      order: 6,
      title: "七牛生产变量",
      status: statusWithEvidence(qiniuEnv.status, qiniuEnvEvidence),
      owner: "技术 / 运维",
      detail: qiniuEnv.detail,
      action: qiniuEnv.action,
      evidence:
        evidenceRecordLabel(qiniuEnvEvidence) ??
        "QINIU_ACCESS_KEY、QINIU_SECRET_KEY、bucket、region、公开域名的脱敏配置截图。",
      envKeys: qiniuEnvKeys,
    },
    {
      id: "qiniu_callbacks",
      order: 7,
      title: "七牛 CORS 与公开 URL",
      status: statusWithEvidence(qiniuCallbackStatus, qiniuCallbacksEvidence),
      owner: "技术 / 运维",
      detail: callbackDetail(qiniuCallbacks),
      action:
        qiniuCallbacks.find((item) => item?.status !== "ready")?.action ??
        "保留 CORS 和公开域名配置，继续做真实手相上传验收。",
      evidence:
        evidenceRecordLabel(qiniuCallbacksEvidence) ??
        "七牛 CORS 允许正式 APP_URL、上传后的公开 URL 可访问。",
      commands: ["npm run launch:ai-storage-check"],
    },
    {
      id: "palm_vision",
      order: 8,
      title: "手相上传与视觉报告",
      status: statusWithEvidence(
        worstStatus([
          palmCase?.status ?? "warning",
          qiniuDiagnostic?.status ?? "warning",
          openaiDiagnostic?.status ?? "warning",
        ]),
        palmVisionEvidence,
      ),
      owner: "产品 / 测试 / 技术",
      detail: acceptanceDetail(palmCase),
      action:
        palmCase?.status === "ready"
          ? "保留手相上传、公开 URL、视觉报告和报告详情页证据。"
          : "用真实账号上传 JPG/PNG/WebP 手掌图片，确认七牛公开 URL 可被视觉模型读取并生成报告。",
      evidence:
        evidenceRecordLabel(palmVisionEvidence) ??
        palmCase?.evidence ??
        "上传成功记录、七牛公开 URL、视觉模型报告和报告详情页。",
      routes: palmCase?.routes,
      commands: ["npm run launch:ai-storage-check", "POST /api/fortune/palm"],
    },
    {
      id: "deep_report",
      order: 9,
      title: "付费深度报告生成",
      status: statusWithEvidence(
        worstStatus([
          deepReportCase?.status ?? "warning",
          openaiDiagnostic?.status ?? "warning",
          input.unitEconomics.status,
        ]),
        deepReportEvidence,
      ),
      owner: "产品 / 测试 / 技术",
      detail: acceptanceDetail(deepReportCase),
      action:
        deepReportCase?.status === "ready"
          ? "保留付费订单、报告生成、报告详情页和成本记录证据。"
          : "用真实账号完成一笔深度报告订单，确认生成任务、报告详情页、失败重试和成本记录都可追溯。",
      evidence:
        evidenceRecordLabel(deepReportEvidence) ??
        deepReportCase?.evidence ??
        "付费订单、报告生成任务、报告详情页、失败重试入口和 OpenAI 成本样本。",
      routes: deepReportCase?.routes,
      commands: ["POST /api/reports/deep/orders", "POST /api/reports/deep/orders/[orderId]/generate"],
    },
    {
      id: "cost_sample",
      order: 10,
      title: "AI 对话、深度报告和成本样本",
      status: statusWithEvidence(
        worstStatus([costStatus, chatCase?.status ?? "warning", input.unitEconomics.status]),
        costSampleEvidence,
      ),
      owner: "产品 / 技术 / 财务",
      detail: `OpenAI 日志 ${input.unitEconomics.summary.openaiLogCount} 条，缺成本 ${input.unitEconomics.summary.missingOpenaiCostCount} 条，tokens ${input.unitEconomics.summary.aiTokens}。`,
      action:
        input.unitEconomics.summary.openaiLogCount > 0
          ? input.unitEconomics.action
          : "至少跑一次 AI 对话、手相视觉和深度报告，确认 UsageLog 写入 provider/model/tokens/costCents。",
      evidence:
        evidenceRecordLabel(costSampleEvidence) ??
        "UsageLog 中出现 chat_basic、palm_reading、deep_report 或 yearly_report，且包含模型、tokens 和成本金额或回填口径。",
      routes: Array.from(new Set([...(chatCase?.routes ?? []), ...(deepReportCase?.routes ?? [])])),
    },
  ] satisfies LaunchAiStoragePlanStep[];
}

function buildCommandGroups(appUrl: string) {
  return [
    {
      title: "OpenAI 生产变量",
      when: "创建生产项目和预算上限后配置。",
      commands: [
        {
          label: "模型变量",
          command:
            "OPENAI_API_KEY=<openai-api-key> OPENAI_DEFAULT_MODEL=<default-model> OPENAI_FAST_MODEL=<fast-model> OPENAI_PREMIUM_MODEL=<premium-model> OPENAI_VISION_MODEL=<vision-model> OPENAI_DEFAULT_INPUT_CENTS_PER_1M_TOKENS=<input-cents> OPENAI_DEFAULT_OUTPUT_CENTS_PER_1M_TOKENS=<output-cents>",
          detail: "写入部署平台环境变量，Key 不提交代码仓库；成本费率按人民币分/百万 token 填写。",
        },
      ],
    },
    {
      title: "七牛生产变量",
      when: "bucket、公开域名和 CORS 建好后配置。",
      commands: [
        {
          label: "存储变量",
          command:
            "QINIU_ACCESS_KEY=<ak> QINIU_SECRET_KEY=<sk> QINIU_BUCKET=<bucket> QINIU_REGION=<region> QINIU_PUBLIC_DOMAIN=https://<image-domain>",
          detail: `CORS 允许来源需要包含 ${appUrl}。`,
        },
      ],
    },
    {
      title: "上线前烟测",
      when: "OpenAI 和七牛变量部署后执行。",
      commands: [
        {
          label: "命令行前置检查",
          command: "npm run launch:ai-storage-check",
          detail: "确认 OpenAI Key/模型、七牛上传 token、上传域名和公开域名可达。",
        },
        {
          label: "第三方诊断",
          command: "POST /api/admin/integrations/probe",
          detail: "确认 OpenAI 模型读取、七牛 token 生成和上传域名可达。",
        },
        {
          label: "手相上传",
          command: "POST /api/storage/qiniu/upload-token -> POST /api/images/palm -> POST /api/fortune/palm",
          detail: "用真实图片验证公开 URL、视觉模型报告和报告保存。",
        },
        {
          label: "成本样本",
          command: "完成 /chat、/palm、/reports/deep 各一条真实样本",
          detail: "确认 UsageLog 记录 provider、model、tokens、costCents、estimatedCost 和 costSource。",
        },
      ],
    },
  ] satisfies LaunchAiStoragePlanCommandGroup[];
}

function buildCopyText(input: {
  generatedAt: string;
  label: string;
  status: HealthStatus;
  steps: LaunchAiStoragePlanStep[];
  nextSteps: LaunchAiStoragePlanStep[];
  evidenceSummary: LaunchAiStorageAcceptanceEvidenceSummary;
}) {
  const stepLines = input.steps.map(
    (step) =>
      `${step.order}. [${statusLabel(step.status)}] ${step.title} / ${step.owner}：${step.action} 验收：${step.evidence}`,
  );
  const nextLines =
    input.nextSteps.length > 0
      ? input.nextSteps.map((step, index) => `${index + 1}. ${step.title}：${step.action}`)
      : ["- 当前没有 AI 与图片能力缺口。"];

  return [
    "玄机 AI 的 AI 与图片能力落地计划",
    `生成时间：${input.generatedAt.slice(0, 16).replace("T", " ")}`,
    `状态：${input.label} (${input.status})`,
    `AI/图片验收证据：${input.evidenceSummary.readyItems}/${input.evidenceSummary.trackedItems} 个条目已通过，最近证据 ${dateLabel(input.evidenceSummary.latestEvidenceAt)}`,
    "",
    "步骤：",
    ...stepLines,
    "",
    "优先处理：",
    ...nextLines,
  ].join("\n");
}

export async function getLaunchAiStoragePlan(
  input?: LaunchAiStoragePlanInput,
): Promise<LaunchAiStoragePlan> {
  const [
    envChecklist,
    integrationDiagnostics,
    applicationPack,
    callbacks,
    acceptance,
    externalReadiness,
    unitEconomics,
    evidenceRecords,
  ] = await Promise.all([
    input?.envChecklist ?? getLaunchEnvChecklist(),
    input?.integrationDiagnostics ?? getIntegrationDiagnostics(),
    input?.applicationPack ?? getLaunchApplicationPack(),
    input?.callbacks ?? getLaunchCallbackChecklist(),
    input?.acceptance ??
      import("@/lib/launch-acceptance").then((module) => module.getLaunchAcceptanceMatrix()),
    input?.externalReadiness ?? getLaunchExternalReadiness(),
    input?.unitEconomics ?? getLaunchUnitEconomics(),
    input?.evidenceRecords ?? getLaunchAiStorageAcceptanceEvidenceRecords({ take: 80 }),
  ]);
  const generatedAt = new Date().toISOString();
  const evidenceSummary =
    summarizeLaunchAiStorageAcceptanceEvidenceRecords(evidenceRecords);
  const steps = buildSteps({
    envChecklist,
    integrationDiagnostics,
    applicationPack,
    callbacks,
    acceptance,
    externalReadiness,
    unitEconomics,
    evidenceRecords,
  }).sort((a, b) => a.order - b.order);
  const diagnostics = diagnosticById(integrationDiagnostics);
  const openaiDiagnostic = diagnostics.get("openai");
  const qiniuDiagnostic = diagnostics.get("qiniu");
  const summary = summarize(steps, unitEconomics);
  const status = planStatus(summary);
  const label = labelFor(status, summary);
  const nextSteps = steps
    .filter((step) => step.status !== "ready")
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.order - b.order)
    .slice(0, 6);

  return {
    generatedAt,
    status,
    label,
    detail: detailFor({ status, openaiDiagnostic, qiniuDiagnostic }),
    action: nextSteps[0]?.action ?? unitEconomics.action,
    summary,
    diagnostics: {
      openai: openaiDiagnostic?.status ?? "warning",
      qiniu: qiniuDiagnostic?.status ?? "warning",
      appUrl: callbacks.appUrl,
    },
    aiStorage: {
      evidenceRecordCount: evidenceRecords.length,
      latestEvidenceAt: evidenceSummary.latestEvidenceAt,
    },
    evidenceSummary,
    evidenceRecords,
    steps,
    nextSteps,
    commandGroups: buildCommandGroups(callbacks.appUrl),
    evidence: [
      "OpenAI 项目、预算上限和 API Key 脱敏配置截图。",
      "OpenAI 默认模型、低成本模型、深度报告模型、视觉模型和成本费率诊断截图。",
      "七牛 bucket、HTTPS 公开域名、CORS 和生产变量脱敏截图。",
      "真实手相图片上传成功、公开 URL 可访问、视觉报告生成和报告详情页截图。",
      "AI 对话、手相视觉、深度报告 UsageLog 成本样本。",
      "单位经济检查中 OpenAI tokens、costCents、estimatedCost、costSource 和产品星力折算记录。",
    ],
    copyText: buildCopyText({
      generatedAt,
      label,
      status,
      steps,
      nextSteps,
      evidenceSummary,
    }),
  } satisfies LaunchAiStoragePlan;
}
