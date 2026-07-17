import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  getLaunchCallbackChecklist,
  type LaunchCallbackChecklist,
} from "@/lib/launch-callbacks";
import {
  getLaunchEnvDraft,
  type LaunchEnvDraft,
  type LaunchEnvDraftEntry,
} from "@/lib/launch-env-draft";
import {
  getLaunchMaterialPack,
  type LaunchMaterialItem,
  type LaunchMaterialPack,
} from "@/lib/launch-materials";

export type LaunchEnvBatchPlanBatchId =
  | "security"
  | "subject_domain"
  | "database"
  | "ai"
  | "storage"
  | "payment"
  | "wechat_login";

export type LaunchEnvBatchPlanEntry = {
  key: string;
  label: string;
  status: HealthStatus;
  stateLabel: string;
  isSecret: boolean;
  safeValue: string;
  action: string;
  sourceItems: string[];
  platformHints: string[];
};

export type LaunchEnvBatchPlanBatch = {
  id: LaunchEnvBatchPlanBatchId;
  order: number;
  title: string;
  status: HealthStatus;
  label: string;
  owner: string;
  goal: string;
  when: string;
  action: string;
  evidence: string;
  validation: string[];
  materialTitles: string[];
  callbackHints: string[];
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
    secret: number;
  };
  entries: LaunchEnvBatchPlanEntry[];
};

export type LaunchEnvBatchPlan = {
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
    batches: number;
    nextEntries: number;
  };
  currentBatch: LaunchEnvBatchPlanBatch;
  batches: LaunchEnvBatchPlanBatch[];
  nextEntries: Array<LaunchEnvBatchPlanEntry & { batchTitle: string; batchId: LaunchEnvBatchPlanBatchId }>;
  copyText: string;
};

type LaunchEnvBatchPlanInput = {
  envDraft?: LaunchEnvDraft;
  materials?: LaunchMaterialPack;
  callbacks?: LaunchCallbackChecklist;
};

type BatchTemplate = {
  id: LaunchEnvBatchPlanBatchId;
  order: number;
  title: string;
  owner: string;
  goal: string;
  when: string;
  keys: string[];
  materialIds: string[];
  callbackIds?: string[];
  validation: string[];
  evidence: string;
};

const batchTemplates = [
  {
    id: "security",
    order: 10,
    title: "基础安全",
    owner: "技术 / 运维",
    goal: "让生产后台、会话和支付回调旁路先处于可控状态。",
    when: "部署平台项目创建后立即填写。",
    keys: [
      "APP_LOCALE",
      "AUTH_EMAIL_ENABLED",
      "AUTH_SESSION_SECRET",
      "ADMIN_DASHBOARD_ENABLED",
      "ADMIN_ACCESS_TOKEN",
      "PAYMENT_CALLBACK_DEV_BYPASS",
    ],
    materialIds: [],
    validation: [
      "npm run launch:secrets",
      "npm run launch:preflight",
      "GET /admin/health",
      "GET /login",
    ],
    evidence: "密钥生成命令输出、部署平台环境变量脱敏截图、后台访问 token 测试和预检截图。",
  },
  {
    id: "subject_domain",
    order: 20,
    title: "主体、域名与备案",
    owner: "创始人 / 技术 / 运营",
    goal: "让官网、协议、支付回调和备案展示全部使用同一正式 HTTPS 域名与主体。",
    when: "主体路径确定、域名购买并完成实名认证后填写。",
    keys: ["APP_URL", "COMPANY_NAME", "ICP_RECORD_NO"],
    materialIds: ["entity", "domain", "icp", "legal_review"],
    callbackIds: [
      "alipay:notify-url",
      "wechat-pay:notify-url",
      "wechat-open:redirect-domain",
      "legal:terms",
      "legal:privacy",
      "legal:disclaimer",
      "qiniu:cors-origin",
    ],
    validation: [
      "npm run launch:url-check",
      "npm run launch:preflight",
      "GET /",
      "GET /legal/terms",
      "GET /api/admin/launch/callbacks",
    ],
    evidence: "正式域名、ICP备案号、URL 验收输出、协议页主体和第三方平台回调 URL 截图。",
  },
  {
    id: "database",
    order: 30,
    title: "生产数据库",
    owner: "技术 / 运维",
    goal: "让订单、会员、报告、证据、承诺和后台审计可持久化恢复。",
    when: "PostgreSQL 实例、数据库用户和访问白名单创建后填写。",
    keys: ["DATABASE_URL"],
    materialIds: ["postgres"],
    validation: [
      "npm run launch:db-check",
      "npm run prisma:push",
      "npm run launch:db-check -- --schema",
      "POST /api/admin/persistence/probe",
      "GET /api/admin/launch/database-plan",
    ],
    evidence: "DATABASE_URL 脱敏截图、数据库连接检查、迁移日志、落库探针通过和备份策略截图。",
  },
  {
    id: "ai",
    order: 40,
    title: "OpenAI 模型",
    owner: "技术 / 产品",
    goal: "让 AI 对话、塔罗/八字表达、手相视觉和深度报告使用真实模型并记录成本。",
    when: "OpenAI 项目、API Key、预算上限和模型策略确定后填写。",
    keys: [
      "OPENAI_API_KEY",
      "OPENAI_DEFAULT_MODEL",
      "OPENAI_FAST_MODEL",
      "OPENAI_PREMIUM_MODEL",
      "OPENAI_VISION_MODEL",
    ],
    materialIds: ["openai"],
    validation: [
      "npm run launch:ai-storage-check",
      "POST /api/admin/integrations/probe",
      "POST /api/chat",
      "POST /api/fortune/palm",
    ],
    evidence: "OpenAI 项目预算截图、命令行模型读取检查、后台模型读取诊断、AI 对话/视觉报告和 UsageLog 成本样本。",
  },
  {
    id: "storage",
    order: 50,
    title: "七牛图片存储",
    owner: "技术 / 运维",
    goal: "让手相图片可上传、公开 URL 可访问，并能被视觉模型读取。",
    when: "七牛 bucket、公开域名、HTTPS 和 CORS 建好后填写。",
    keys: [
      "QINIU_ACCESS_KEY",
      "QINIU_SECRET_KEY",
      "QINIU_BUCKET",
      "QINIU_REGION",
      "QINIU_PUBLIC_DOMAIN",
    ],
    materialIds: ["qiniu"],
    callbackIds: ["qiniu:cors-origin", "qiniu:public-domain"],
    validation: [
      "npm run launch:ai-storage-check",
      "POST /api/admin/integrations/probe",
      "POST /api/storage/qiniu/upload-token",
      "POST /api/images/palm",
    ],
    evidence: "七牛 bucket、公开域名、CORS、命令行上传 token 检查、上传凭证和真实手相图片 URL 截图。",
  },
  {
    id: "payment",
    order: 60,
    title: "真实支付",
    owner: "财务 / 技术",
    goal: "让至少一个真实支付渠道可创建小额订单、回调验签、权益到账和对账留证。",
    when: "主体资质、支付宝应用或微信支付商户号审核通过后填写。",
    keys: [
      "PAYMENT_PROVIDER",
      "LIVE_PAYMENT_SMOKE_TEST_USER_IDS",
      "ALIPAY_ENABLED",
      "ALIPAY_GATEWAY",
      "ALIPAY_APP_ID",
      "ALIPAY_PRIVATE_KEY",
      "ALIPAY_PUBLIC_KEY",
      "WECHAT_PAY_ENABLED",
      "WECHAT_APP_ID",
      "WECHAT_PAY_MCH_ID",
      "WECHAT_PAY_API_V3_KEY",
      "WECHAT_PAY_PRIVATE_KEY",
      "WECHAT_PAY_SERIAL_NO",
      "WECHAT_PAY_PLATFORM_PUBLIC_KEY",
    ],
    materialIds: ["alipay", "wechat_pay"],
    callbackIds: ["alipay:notify-url", "wechat-pay:notify-url"],
    validation: [
      "npm run launch:payment-check",
      "npm run launch:preflight",
      "POST /api/admin/integrations/probe",
      "POST /api/payments/live/orders",
      "GET /api/admin/launch/payment-plan",
    ],
    evidence: "支付平台应用/商户截图、密钥脱敏截图、签名诊断、小额订单、PAID 回调和权益到账截图。",
  },
  {
    id: "wechat_login",
    order: 70,
    title: "微信扫码登录",
    owner: "运营 / 技术",
    goal: "让国内用户可用微信扫码登录，同时保留 Google 登录主入口。",
    when: "微信开放平台网站应用审核通过后填写；第一版可后置。",
    keys: ["AUTH_WECHAT_ENABLED", "WECHAT_APP_ID", "WECHAT_APP_SECRET"],
    materialIds: ["wechat_open"],
    callbackIds: ["wechat-open:redirect-domain"],
    validation: ["GET /login", "微信扫码登录一次新用户和一次老用户"],
    evidence: "微信开放平台应用截图、回调域名截图、扫码登录成功截图。",
  },
] satisfies BatchTemplate[];

function statusLabel(status: HealthStatus) {
  if (status === "ready") {
    return "已完成";
  }

  if (status === "blocking") {
    return "阻断";
  }

  return "待复核";
}

function envEntryByKey(envDraft: LaunchEnvDraft) {
  return new Map(envDraft.groups.flatMap((group) => group.entries.map((entry) => [entry.key, entry])));
}

function materialById(materials: LaunchMaterialPack) {
  return new Map(materials.items.map((item) => [item.id, item]));
}

function statusForEntries(entries: LaunchEnvBatchPlanEntry[]) {
  if (entries.some((entry) => entry.status === "blocking")) {
    return "blocking" as const;
  }

  if (entries.some((entry) => entry.status === "warning")) {
    return "warning" as const;
  }

  return "ready" as const;
}

function entryFromDraft(entry: LaunchEnvDraftEntry) {
  return {
    key: entry.key,
    label: entry.label,
    status: entry.status,
    stateLabel: entry.stateLabel,
    isSecret: entry.isSecret,
    safeValue: entry.safeValue,
    action: entry.action,
    sourceItems: entry.sourceItems,
    platformHints: entry.platformHints,
  } satisfies LaunchEnvBatchPlanEntry;
}

function batchLabel(title: string, status: HealthStatus, summary: LaunchEnvBatchPlanBatch["summary"]) {
  if (status === "ready") {
    return `${title} 已闭合`;
  }

  if (status === "warning") {
    return `${title} 有 ${summary.warning} 个变量待复核`;
  }

  return `${title} 有 ${summary.blocking} 个变量阻断`;
}

function buildBatch(input: {
  template: BatchTemplate;
  entryMap: Map<string, LaunchEnvDraftEntry>;
  materialMap: Map<string, LaunchMaterialItem>;
  callbacks: LaunchCallbackChecklist;
}) {
  const entries = input.template.keys
    .map((key) => input.entryMap.get(key))
    .filter((entry): entry is LaunchEnvDraftEntry => Boolean(entry))
    .map(entryFromDraft);
  const status = statusForEntries(entries);
  const summary = {
    ready: entries.filter((entry) => entry.status === "ready").length,
    warning: entries.filter((entry) => entry.status === "warning").length,
    blocking: entries.filter((entry) => entry.status === "blocking").length,
    total: entries.length,
    secret: entries.filter((entry) => entry.isSecret).length,
  };
  const materialTitles = input.template.materialIds
    .map((id) => input.materialMap.get(id)?.title)
    .filter((title): title is string => Boolean(title));
  const callbackHints = (input.template.callbackIds ?? [])
    .map((id) => input.callbacks.items.find((item) => item.id === id))
    .filter((item): item is LaunchCallbackChecklist["items"][number] => Boolean(item))
    .map((item) => `${item.platform} / ${item.configName}: ${item.value}`);
  const firstGap = entries.find((entry) => entry.status !== "ready");

  return {
    id: input.template.id,
    order: input.template.order,
    title: input.template.title,
    status,
    label: batchLabel(input.template.title, status, summary),
    owner: input.template.owner,
    goal: input.template.goal,
    when: input.template.when,
    action: firstGap?.action ?? "保留本批变量脱敏截图，并进入下一批变量配置。",
    evidence: input.template.evidence,
    validation: input.template.validation,
    materialTitles,
    callbackHints,
    summary,
    entries,
  } satisfies LaunchEnvBatchPlanBatch;
}

function summarize(batches: LaunchEnvBatchPlanBatch[]) {
  return {
    ready: batches.filter((batch) => batch.status === "ready").length,
    warning: batches.filter((batch) => batch.status === "warning").length,
    blocking: batches.filter((batch) => batch.status === "blocking").length,
    total: batches.length,
  };
}

function planStatus(batches: LaunchEnvBatchPlanBatch[]) {
  if (batches.some((batch) => batch.status === "blocking")) {
    return "blocking" as const;
  }

  if (batches.some((batch) => batch.status === "warning")) {
    return "warning" as const;
  }

  return "ready" as const;
}

function buildCopyText(input: {
  status: HealthStatus;
  label: string;
  batches: LaunchEnvBatchPlanBatch[];
  nextEntries: LaunchEnvBatchPlan["nextEntries"];
}) {
  const batchLines = input.batches.map(
    (batch) =>
      `- [${statusLabel(batch.status)}] ${batch.title}：${batch.summary.ready}/${batch.summary.total} ready；验证：${batch.validation.join(" -> ")}`,
  );
  const entryLines = input.nextEntries.length
    ? input.nextEntries.map(
        (entry, index) =>
          `${index + 1}. ${entry.batchTitle} / ${entry.key} (${entry.label})：${entry.action}；建议值：${entry.safeValue}`,
      )
    : ["暂无待填写变量。"];

  return [
    "玄机 AI 生产变量批次清单",
    `状态：${input.label} (${input.status})`,
    "",
    "批次：",
    ...batchLines,
    "",
    "优先填写：",
    ...entryLines,
  ].join("\n");
}

export async function getLaunchEnvBatchPlan(input?: LaunchEnvBatchPlanInput) {
  const [envDraft, materials, callbacks] = await Promise.all([
    input?.envDraft ?? getLaunchEnvDraft(),
    input?.materials ?? getLaunchMaterialPack(),
    input?.callbacks ?? getLaunchCallbackChecklist(),
  ]);
  const entryMap = envEntryByKey(envDraft);
  const materialMap = materialById(materials);
  const batches = batchTemplates
    .map((template) =>
      buildBatch({
        template,
        entryMap,
        materialMap,
        callbacks,
      }),
    )
    .sort((a, b) => a.order - b.order);
  const summaryBase = summarize(batches);
  const status = planStatus(batches);
  const currentBatch = batches.find((batch) => batch.status !== "ready") ?? batches[0];
  const nextEntries = batches
    .flatMap((batch) =>
      batch.entries
        .filter((entry) => entry.status !== "ready")
        .slice(0, batch.status === "blocking" ? 3 : 1)
        .map((entry) => ({
          ...entry,
          batchTitle: batch.title,
          batchId: batch.id,
        })),
    )
    .slice(0, 12);
  const label =
    status === "ready"
      ? "生产变量批次已闭合"
      : status === "warning"
        ? `生产变量批次有 ${summaryBase.warning} 组待复核`
        : `生产变量批次有 ${summaryBase.blocking} 组阻断`;

  return {
    generatedAt: new Date().toISOString(),
    status,
    label,
    detail:
      status === "ready"
        ? "生产变量已按安全、主体域名、数据库、AI、七牛、支付和微信登录批次完成。"
        : `当前先填写「${currentBatch.title}」批次：${currentBatch.goal}`,
    action:
      nextEntries[0]?.action ??
      "保留生产变量脱敏截图，运行预检、第三方诊断、落库探针和小额支付验收。",
    summary: {
      ...summaryBase,
      batches: batches.length,
      nextEntries: nextEntries.length,
    },
    currentBatch,
    batches,
    nextEntries,
    copyText: buildCopyText({
      status,
      label,
      batches,
      nextEntries,
    }),
  } satisfies LaunchEnvBatchPlan;
}
