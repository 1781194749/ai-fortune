import "server-only";

import type { HealthCheck, HealthStatus } from "@/lib/health-checks";
import { getProductionHealthChecks, summarizeHealth } from "@/lib/health-checks";
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
import { getLaunchEnvDraft, type LaunchEnvDraft } from "@/lib/launch-env-draft";
import {
  externalReadinessStatusLabel,
  getLaunchExternalReadiness,
  type ExternalReadinessItem,
  type LaunchExternalReadiness,
} from "@/lib/launch-external-readiness";
import {
  getLaunchDeploymentAcceptanceEvidenceRecords,
  latestLaunchDeploymentAcceptanceEvidenceByItem,
  summarizeLaunchDeploymentAcceptanceEvidenceRecords,
  type LaunchDeploymentAcceptanceEvidenceRecord,
  type LaunchDeploymentAcceptanceEvidenceSummary,
} from "@/lib/launch-deployment-acceptance";

export type LaunchDeploymentPlanStepId =
  | "domain_dns"
  | "https_app_url"
  | "deploy_env"
  | "admin_security"
  | "session_secret"
  | "public_callbacks"
  | "preflight"
  | "page_smoke"
  | "restart_rollback";

export type LaunchDeploymentPlanStep = {
  id: LaunchDeploymentPlanStepId;
  order: number;
  title: string;
  status: HealthStatus;
  owner: string;
  detail: string;
  action: string;
  evidence: string;
  envKeys?: string[];
  routes?: string[];
  commands?: string[];
};

export type LaunchDeploymentPlanCommand = {
  label: string;
  command: string;
  detail: string;
};

export type LaunchDeploymentPlanCommandGroup = {
  title: string;
  when: string;
  commands: LaunchDeploymentPlanCommand[];
};

export type LaunchDeploymentPlan = {
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
    appUrlReady: boolean;
    deployEnvBlocking: number;
    requiredCallbacksReady: number;
    requiredCallbacksTotal: number;
    healthBlocking: number;
  };
  deployment: {
    appUrl: string;
    domainStatus: string;
    envDraftLabel: string;
    healthReady: number;
    healthWarning: number;
    healthBlocking: number;
    evidenceRecordCount: number;
    latestEvidenceAt?: string;
  };
  evidenceSummary: LaunchDeploymentAcceptanceEvidenceSummary;
  evidenceRecords: LaunchDeploymentAcceptanceEvidenceRecord[];
  steps: LaunchDeploymentPlanStep[];
  nextSteps: LaunchDeploymentPlanStep[];
  commandGroups: LaunchDeploymentPlanCommandGroup[];
  evidence: string[];
  copyText: string;
};

type LaunchDeploymentPlanInput = {
  envChecklist?: LaunchEnvChecklist;
  envDraft?: LaunchEnvDraft;
  callbacks?: LaunchCallbackChecklist;
  externalReadiness?: LaunchExternalReadiness;
  healthChecks?: HealthCheck[];
  evidenceRecords?: LaunchDeploymentAcceptanceEvidenceRecord[];
};

const deploymentEnvKeys = [
  "APP_URL",
  "AUTH_SESSION_SECRET",
  "ADMIN_DASHBOARD_ENABLED",
  "ADMIN_ACCESS_TOKEN",
  "DATABASE_URL",
  "AUTH_EMAIL_ENABLED",
  "AUTH_GOOGLE_ENABLED",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "AUTH_WECHAT_ENABLED",
  "WECHAT_APP_ID",
  "WECHAT_APP_SECRET",
  "PAYMENT_PROVIDER",
  "PAYMENT_CALLBACK_DEV_BYPASS",
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

function evidenceRecordLabel(record: LaunchDeploymentAcceptanceEvidenceRecord | undefined) {
  if (!record) {
    return undefined;
  }

  const firstUrl =
    record.metadata.evidenceUrl ??
    record.metadata.urlCheckUrl ??
    record.metadata.preflightUrl ??
    record.metadata.smokeRecordingUrl ??
    record.metadata.rollbackUrl;
  const extra = record.metadata.note ?? firstUrl ?? "已保存后台证据";

  return `最近证据：${statusLabel(record.metadata.status)}，${dateLabel(
    record.metadata.savedAt,
  )}，${extra}`;
}

function statusWithEvidence(
  baseStatus: HealthStatus,
  evidence: LaunchDeploymentAcceptanceEvidenceRecord | undefined,
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

function summarize(steps: LaunchDeploymentPlanStep[]) {
  return {
    ready: steps.filter((step) => step.status === "ready").length,
    warning: steps.filter((step) => step.status === "warning").length,
    blocking: steps.filter((step) => step.status === "blocking").length,
    total: steps.length,
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

function externalStatus(item: ExternalReadinessItem | undefined): HealthStatus {
  if (!item) {
    return "blocking";
  }

  if (item.status === "ready") {
    return "ready";
  }

  if (item.status === "in_progress" || item.status === "submitted") {
    return "warning";
  }

  return "blocking";
}

function envByKey(envChecklist: LaunchEnvChecklist) {
  return new Map(envChecklist.items.map((item) => [item.key, item]));
}

function callbackById(callbacks: LaunchCallbackChecklist) {
  return new Map(callbacks.items.map((item) => [item.id, item]));
}

function healthById(checks: HealthCheck[]) {
  return new Map(checks.map((item) => [item.id, item]));
}

function envDetail(items: Array<LaunchEnvChecklistItem | undefined>) {
  const existing = items.filter((item): item is LaunchEnvChecklistItem => Boolean(item));
  const missing = existing.filter((item) => item.status !== "ready");

  if (existing.length === 0) {
    return "生产变量清单未生成。";
  }

  if (missing.length === 0) {
    return "部署相关变量已通过核对。";
  }

  return `待处理变量：${missing
    .map((item) => `${item.key}(${item.stateLabel})`)
    .join("、")}`;
}

function callbackDetail(items: Array<LaunchCallbackItem | undefined>) {
  const existing = items.filter((item): item is LaunchCallbackItem => Boolean(item));
  const missing = existing.filter((item) => item.status !== "ready");

  if (existing.length === 0) {
    return "公网回调清单未生成。";
  }

  if (missing.length === 0) {
    return "支付、七牛和协议公网地址均已通过核对。";
  }

  return `待处理回调：${missing.map((item) => `${item.platform}/${item.configName}`).join("、")}`;
}

function externalDetail(item: ExternalReadinessItem | undefined) {
  if (!item) {
    return "外部事项未登记。";
  }

  return [
    `状态：${externalReadinessStatusLabel(item.status)}`,
    item.targetDate ? `目标日：${item.targetDate}` : undefined,
    item.evidenceNote ? `证据：${item.evidenceNote}` : undefined,
    item.receiptNo ? `回执：${item.receiptNo}` : undefined,
  ]
    .filter(Boolean)
    .join("；");
}

function healthDetail(items: Array<HealthCheck | undefined>) {
  const existing = items.filter((item): item is HealthCheck => Boolean(item));
  const missing = existing.filter((item) => item.status !== "ready");

  if (missing.length === 0) {
    return "生产健康检查相关项已通过。";
  }

  return missing.map((item) => `${item.label}：${item.detail}`).join("；");
}

function buildCopyText(input: {
  status: HealthStatus;
  label: string;
  appUrl: string;
  steps: LaunchDeploymentPlanStep[];
  evidenceSummary: LaunchDeploymentAcceptanceEvidenceSummary;
}) {
  const lines = input.steps.map((step, index) =>
    [
      `${index + 1}. [${step.status}] ${step.title} / ${step.owner}`,
      `动作：${step.action}`,
      `证据：${step.evidence}`,
      step.envKeys?.length ? `变量：${step.envKeys.join("、")}` : undefined,
      step.routes?.length ? `路径：${step.routes.join("、")}` : undefined,
      step.commands?.length ? `命令：${step.commands.join("；")}` : undefined,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return [
    "玄机 AI 域名与部署落地计划",
    `APP_URL：${input.appUrl}`,
    `状态：${input.label} (${input.status})`,
    `部署验收证据：${input.evidenceSummary.readyItems}/${input.evidenceSummary.trackedItems} 个条目已通过，最近证据 ${dateLabel(input.evidenceSummary.latestEvidenceAt)}`,
    "",
    ...lines,
  ].join("\n\n");
}

function buildSteps(input: {
  envChecklist: LaunchEnvChecklist;
  envDraft: LaunchEnvDraft;
  callbacks: LaunchCallbackChecklist;
  externalReadiness: LaunchExternalReadiness;
  healthChecks: HealthCheck[];
  evidenceRecords: LaunchDeploymentAcceptanceEvidenceRecord[];
}) {
  const envItems = envByKey(input.envChecklist);
  const callbackItems = callbackById(input.callbacks);
  const healthItems = healthById(input.healthChecks);
  const domain = input.externalReadiness.items.find((item) => item.id === "domain");
  const icp = input.externalReadiness.items.find((item) => item.id === "icp");
  const appUrlEnv = envItems.get("APP_URL");
  const appBaseCallback = callbackItems.get("app:base-url");
  const requiredCallbacks = input.callbacks.items.filter((item) => item.requiredForLaunch);
  const deployEnvItems = deploymentEnvKeys.map((key) => envItems.get(key));
  const adminEnvItems = [
    envItems.get("ADMIN_DASHBOARD_ENABLED"),
    envItems.get("ADMIN_ACCESS_TOKEN"),
  ];
  const authSecret = envItems.get("AUTH_SESSION_SECRET");
  const healthSummary = summarizeHealth(input.healthChecks);
  const domainStatus = externalStatus(domain);
  const appUrlStatus = worstStatus([
    appUrlEnv?.status ?? "blocking",
    appBaseCallback?.status ?? "blocking",
    domainStatus === "ready" ? "ready" : domainStatus,
  ]);
  const requiredCallbackStatus = worstStatus(requiredCallbacks.map((item) => item.status));
  const preflightStatus =
    healthSummary.blocking > 0
      ? "blocking"
      : healthSummary.warning > 0
        ? "warning"
        : "ready";
  const pageSmokeStatus = worstStatus([
    appUrlStatus,
    healthItems.get("admin")?.status ?? "blocking",
  ]);
  const evidenceByItem = latestLaunchDeploymentAcceptanceEvidenceByItem(input.evidenceRecords);
  const domainDnsEvidence = evidenceByItem.get("domain_dns");
  const httpsAppUrlEvidence = evidenceByItem.get("https_app_url");
  const deployEnvEvidence = evidenceByItem.get("deploy_env");
  const adminSecurityEvidence = evidenceByItem.get("admin_security");
  const sessionSecretEvidence = evidenceByItem.get("session_secret");
  const publicCallbacksEvidence = evidenceByItem.get("public_callbacks");
  const preflightEvidence = evidenceByItem.get("preflight");
  const pageSmokeEvidence = evidenceByItem.get("page_smoke");
  const restartRollbackEvidence = evidenceByItem.get("restart_rollback");

  return [
    {
      id: "domain_dns",
      order: 1,
      title: "购买域名、实名和 DNS 解析",
      status: statusWithEvidence(domainStatus, domainDnsEvidence),
      owner: "创始人 / 运维",
      detail: externalDetail(domain),
      action:
        domain?.status === "ready"
          ? "保留域名实名、DNS 解析和证书配置截图，作为正式部署证据。"
          : "购买正式域名，完成实名认证，配置 DNS 到生产部署服务，并准备 ICP 备案材料。",
      evidence:
        evidenceRecordLabel(domainDnsEvidence) ??
        "域名注册/实名记录、DNS 解析记录、部署平台绑定域名截图。",
      envKeys: ["APP_URL"],
    },
    {
      id: "https_app_url",
      order: 2,
      title: "HTTPS APP_URL 与备案依赖",
      status: statusWithEvidence(appUrlStatus, httpsAppUrlEvidence),
      owner: "技术 / 运维 / 运营",
      detail: [
        appUrlEnv ? `APP_URL：${appUrlEnv.displayValue} / ${appUrlEnv.stateLabel}` : "APP_URL 未核对",
        appBaseCallback ? `回调基准：${appBaseCallback.value}` : "回调基准未生成",
        `ICP备案：${externalDetail(icp)}`,
      ].join("；"),
      action:
        appUrlStatus === "ready"
          ? "确认生产域名使用 HTTPS，且首页、登录、会员、协议和分享页面均以该域名访问。"
          : "把 APP_URL 设置为正式 HTTPS 域名，不能使用 localhost、HTTP 或占位域名；国内正式访问同步推进 ICP。",
      evidence:
        evidenceRecordLabel(httpsAppUrlEvidence) ??
        "APP_URL 可公网访问首页、登录页、会员页、协议页和公开分享页。",
      envKeys: ["APP_URL", "ICP_RECORD_NO"],
      routes: ["/", "/login", "/member", "/legal/terms"],
      commands: ["npm run launch:url-check"],
    },
    {
      id: "deploy_env",
      order: 3,
      title: "部署平台生产变量",
      status: statusWithEvidence(
        worstStatus(deployEnvItems.map((item) => item?.status ?? "blocking")),
        deployEnvEvidence,
      ),
      owner: "技术 / 运维",
      detail: envDetail(deployEnvItems),
      action:
        input.envDraft.status === "ready"
          ? "将生产变量草案同步到部署平台，并保留脱敏截图。"
          : "优先补齐 APP_URL、会话密钥、后台 token、DATABASE_URL、登录方式和支付模式，再运行预检。",
      evidence:
        evidenceRecordLabel(deployEnvEvidence) ??
        "部署平台环境变量截图；`/api/admin/launch/env-draft` 无 deployment blocking。",
      envKeys: deploymentEnvKeys,
      routes: ["/api/admin/launch/env-draft", "/api/admin/launch/env-checklist"],
    },
    {
      id: "admin_security",
      order: 4,
      title: "后台访问保护",
      status: statusWithEvidence(
        worstStatus([
          ...adminEnvItems.map((item) => item?.status ?? "blocking"),
          healthItems.get("admin")?.status ?? "blocking",
        ]),
        adminSecurityEvidence,
      ),
      owner: "技术 / 运维",
      detail: [
        envDetail(adminEnvItems),
        healthItems.get("admin") ? healthItems.get("admin")?.detail : undefined,
      ]
        .filter(Boolean)
        .join("；"),
      action: "生产环境开启 ADMIN_DASHBOARD_ENABLED，并配置至少 32 字符 ADMIN_ACCESS_TOKEN；验证无 token 时后台返回 404。",
      evidence:
        evidenceRecordLabel(adminSecurityEvidence) ??
        "无 token 访问 /admin 返回 404；带 token 可访问 /admin/health。",
      envKeys: ["ADMIN_DASHBOARD_ENABLED", "ADMIN_ACCESS_TOKEN"],
      routes: ["/admin", "/admin/health"],
    },
    {
      id: "session_secret",
      order: 5,
      title: "会话密钥与登录安全",
      status: statusWithEvidence(
        worstStatus([
          authSecret?.status ?? "blocking",
          healthItems.get("auth-secret")?.status ?? "blocking",
        ]),
        sessionSecretEvidence,
      ),
      owner: "技术",
      detail: [
        authSecret ? `${authSecret.key}：${authSecret.stateLabel}` : "AUTH_SESSION_SECRET 未核对",
        healthItems.get("auth-secret")?.detail,
      ]
        .filter(Boolean)
        .join("；"),
      action: "生成高强度会话密钥并只写入部署平台环境变量，避免提交到代码仓库。",
      evidence:
        evidenceRecordLabel(sessionSecretEvidence) ??
        "部署平台显示 AUTH_SESSION_SECRET 已配置且长度充足；登录后 session 可稳定保持。",
      envKeys: ["AUTH_SESSION_SECRET"],
      routes: ["/login", "/member"],
    },
    {
      id: "public_callbacks",
      order: 6,
      title: "公网回调与协议链接",
      status: statusWithEvidence(requiredCallbackStatus, publicCallbacksEvidence),
      owner: "技术 / 支付 / 运维",
      detail: callbackDetail(requiredCallbacks),
      action:
        requiredCallbackStatus === "ready"
          ? "把支付宝、微信支付、七牛 CORS、协议和隐私链接同步到对应平台。"
          : "先让 APP_URL 成为正式 HTTPS，再检查支付宝/微信支付通知、七牛 CORS、用户协议和隐私政策链接。",
      evidence:
        evidenceRecordLabel(publicCallbacksEvidence) ??
        "第三方平台回调配置截图；协议链接和通知地址均使用正式 APP_URL。",
      envKeys: ["APP_URL", "QINIU_PUBLIC_DOMAIN"],
      routes: requiredCallbacks.map((item) => item.value),
      commands: ["npm run launch:url-check"],
    },
    {
      id: "preflight",
      order: 7,
      title: "上线预检脚本",
      status: statusWithEvidence(preflightStatus, preflightEvidence),
      owner: "技术 / 运维",
      detail: `生产健康检查 ready=${healthSummary.ready} warning=${healthSummary.warning} blocking=${healthSummary.blocking}。`,
      action:
        preflightStatus === "ready"
          ? "把预检输出归档到上线证据。"
          : "在部署平台变量补齐后运行 launch:preflight，直到 blocking 清零。",
      evidence:
        evidenceRecordLabel(preflightEvidence) ??
        "`npm run launch:preflight` 输出无 blocking，并归档到上线证据。",
      commands: ["npm run launch:preflight"],
    },
    {
      id: "page_smoke",
      order: 8,
      title: "生产页面烟测",
      status: statusWithEvidence(pageSmokeStatus, pageSmokeEvidence),
      owner: "产品 / 技术",
      detail: healthDetail([
        healthItems.get("app-url"),
        healthItems.get("admin"),
        healthItems.get("database"),
      ]),
      action:
        pageSmokeStatus === "ready"
          ? "完成首页、登录、会员、工具、协议、后台健康页和公开分享页截图留证。"
          : "先完成正式域名、后台 token 和生产数据库，再进行页面烟测。",
      evidence:
        evidenceRecordLabel(pageSmokeEvidence) ??
        "首页、登录、会员、工具、协议、后台健康页和公开分享页截图或录屏。",
      routes: ["/", "/login", "/member", "/chat", "/tarot", "/bazi", "/bagua", "/palm", "/legal/privacy", "/admin/health"],
      commands: ["npm run launch:url-check"],
    },
    {
      id: "restart_rollback",
      order: 9,
      title: "重启恢复与回滚记录",
      status: statusWithEvidence(
        worstStatus([
          healthItems.get("database")?.status ?? "blocking",
          input.envDraft.status,
        ]),
        restartRollbackEvidence,
      ),
      owner: "技术 / 运维",
      detail: "部署上线前需要证明重启后订单、会员、钱包、报告、外部事项和证据归档可恢复。",
      action:
        healthItems.get("database")?.status === "ready"
          ? "执行一次生产重启/回滚演练，确认数据恢复和后台健康页状态一致。"
          : "先配置生产 PostgreSQL 和环境变量，再补重启恢复与回滚演练证据。",
      evidence:
        evidenceRecordLabel(restartRollbackEvidence) ??
        "重启前后后台状态截图、落库探针记录、部署平台回滚或重启记录。",
      envKeys: ["DATABASE_URL"],
      routes: ["/api/admin/persistence/probe", "/admin/health"],
    },
  ] satisfies LaunchDeploymentPlanStep[];
}

export async function getLaunchDeploymentPlan(input?: LaunchDeploymentPlanInput) {
  const [envChecklist, envDraft, callbacks, externalReadiness, evidenceRecords] =
    await Promise.all([
      input?.envChecklist ?? getLaunchEnvChecklist(),
      input?.envDraft ?? getLaunchEnvDraft(),
      input?.callbacks ?? getLaunchCallbackChecklist(),
      input?.externalReadiness ?? getLaunchExternalReadiness(),
      input?.evidenceRecords ?? getLaunchDeploymentAcceptanceEvidenceRecords({ take: 80 }),
    ]);
  const healthChecks = input?.healthChecks ?? getProductionHealthChecks();
  const evidenceSummary =
    summarizeLaunchDeploymentAcceptanceEvidenceRecords(evidenceRecords);
  const steps = buildSteps({
    envChecklist,
    envDraft,
    callbacks,
    externalReadiness,
    healthChecks,
    evidenceRecords,
  }).sort((a, b) => a.order - b.order);
  const baseSummary = summarize(steps);
  const status = planStatus(baseSummary);
  const requiredCallbacks = callbacks.items.filter((item) => item.requiredForLaunch);
  const healthSummary = summarizeHealth(healthChecks);
  const appUrlItem = envChecklist.items.find((item) => item.key === "APP_URL");
  const domain = externalReadiness.items.find((item) => item.id === "domain");
  const label =
    status === "ready"
      ? "域名与部署落地已闭合"
      : status === "warning"
        ? `域名与部署落地有 ${baseSummary.warning} 个待复核步骤`
        : `域名与部署落地有 ${baseSummary.blocking} 个阻断步骤`;

  return {
    generatedAt: new Date().toISOString(),
    status,
    label,
    detail:
      status === "ready"
        ? "正式域名、生产变量、后台安全、公网回调、预检、页面烟测和回滚证据均已闭合。"
        : "真实收费前，需要先让生产站点以正式 HTTPS 域名稳定运行，并证明后台、安全变量、公网回调、预检和重启恢复都可验收。",
    action:
      status === "blocking"
        ? "先处理域名/DNS、APP_URL、部署平台变量、后台 token、预检脚本和重启恢复阻断项。"
        : status === "warning"
          ? "补齐公网回调、页面烟测或回滚演练证据后，再进入小额真实订单。"
          : "归档部署证据，并把该计划作为真实收费灰度前的部署放行记录。",
    summary: {
      ...baseSummary,
      appUrlReady: appUrlItem?.status === "ready",
      deployEnvBlocking: deploymentEnvKeys
        .map((key) => envChecklist.items.find((item) => item.key === key))
        .filter((item) => item?.status === "blocking").length,
      requiredCallbacksReady: requiredCallbacks.filter((item) => item.status === "ready").length,
      requiredCallbacksTotal: requiredCallbacks.length,
      healthBlocking: healthSummary.blocking,
    },
    deployment: {
      appUrl: callbacks.appUrl,
      domainStatus: domain ? externalReadinessStatusLabel(domain.status) : "未登记",
      envDraftLabel: envDraft.label,
      healthReady: healthSummary.ready,
      healthWarning: healthSummary.warning,
      healthBlocking: healthSummary.blocking,
      evidenceRecordCount: evidenceSummary.total,
      latestEvidenceAt: evidenceSummary.latestEvidenceAt,
    },
    evidenceSummary,
    evidenceRecords,
    steps,
    nextSteps: steps.filter((step) => step.status !== "ready").slice(0, 6),
    commandGroups: [
      {
        title: "部署变量",
        when: "配置生产部署平台环境变量时使用。",
        commands: [
          {
            label: "生成变量草案",
            command: "/api/admin/launch/env-draft",
            detail: "复制草案到部署平台，真实密钥和连接串只在部署平台填写。",
          },
          {
            label: "本地预检样例",
            command: "npm run launch:preflight:example",
            detail: "用示例变量确认预检脚本能暴露占位值和缺失项。",
          },
        ],
      },
      {
        title: "上线前验证",
        when: "部署到正式域名后使用。",
        commands: [
          {
            label: "生产预检",
            command: "npm run launch:preflight",
            detail: "读取生产变量文件或部署环境，blocking 必须清零。",
          },
          {
            label: "公网 URL 验收",
            command: "npm run launch:url-check",
            detail: "确认 APP_URL、公开页面、协议链接、后台健康页和支付/七牛回调路径可达。",
          },
          {
            label: "后台健康页",
            command: `${callbacks.appUrl}/admin/health?token=<ADMIN_ACCESS_TOKEN>`,
            detail: "确认部署、数据库、支付、AI、合规和证据看板都能访问。",
          },
        ],
      },
      {
        title: "烟测路径",
        when: "正式域名可访问后使用。",
        commands: [
          {
            label: "公开页面",
            command: "npm run launch:url-check",
            detail: "脚本会访问首页、登录页、协议页、会员页保护和回调路径；再截图归档关键页面。",
          },
          {
            label: "后台与探针",
            command: `${callbacks.appUrl}/admin/health  ${callbacks.appUrl}/api/admin/persistence/probe`,
            detail: "后台需带 token；探针用于验证生产数据库恢复能力。",
          },
        ],
      },
    ],
    evidence: [
      "域名实名、DNS 解析、HTTPS 证书和部署平台绑定截图",
      "生产环境变量脱敏截图和 env-draft 复制记录",
      "无 token 后台 404、带 token 后台可访问截图",
      "支付宝/微信支付/七牛/协议公网回调配置截图",
      "launch:preflight 无 blocking 输出",
      "首页、登录、会员、协议、工具和后台健康页烟测截图",
      "重启恢复、落库探针和回滚演练记录",
    ],
    copyText: buildCopyText({
      status,
      label,
      appUrl: callbacks.appUrl,
      steps,
      evidenceSummary,
    }),
  } satisfies LaunchDeploymentPlan;
}
