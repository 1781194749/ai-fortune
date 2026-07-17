import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  getLaunchReadiness,
  type LaunchReadiness,
  type LaunchReadinessItem,
} from "@/lib/launch-readiness";

type RunbookTemplate = {
  id: string;
  groupId: string;
  groupTitle: string;
  title: string;
  owner: string;
  why: string;
  action: string;
  evidence: string;
  relatedCheckIds: string[];
};

export type LaunchRunbookRelatedIssue = Pick<
  LaunchReadinessItem,
  "id" | "group" | "label" | "status" | "detail" | "action"
>;

export type LaunchRunbookStep = {
  id: string;
  groupId: string;
  title: string;
  owner: string;
  status: HealthStatus;
  why: string;
  action: string;
  evidence: string;
  relatedCheckIds: string[];
  relatedIssues: LaunchRunbookRelatedIssue[];
};

export type LaunchRunbookGroup = {
  id: string;
  title: string;
  status: HealthStatus;
  steps: LaunchRunbookStep[];
};

export type LaunchRunbook = {
  generatedAt: string;
  status: HealthStatus;
  label: string;
  detail: string;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
  };
  groups: LaunchRunbookGroup[];
  nextSteps: LaunchRunbookStep[];
};

const templates = [
  {
    id: "foundation-domain",
    groupId: "foundation",
    groupTitle: "基础安全",
    title: "绑定正式 HTTPS 域名和 APP_URL",
    owner: "技术 / 运维",
    why: "支付回调、邮件链接、公开分享和 SEO 都依赖稳定正式域名。",
    action: "完成域名解析、HTTPS 证书和 APP_URL 配置，确认生产环境不再指向 localhost。",
    evidence: "截图或记录 APP_URL、证书状态，并访问首页、登录页和公开分享页。",
    relatedCheckIds: ["check:app-url", "env:APP_URL", "external:domain"],
  },
  {
    id: "foundation-admin-auth",
    groupId: "foundation",
    groupTitle: "基础安全",
    title: "启用后台保护和会话密钥",
    owner: "技术 / 运维",
    why: "后台包含订单、用户、投放和诊断信息，生产环境不能裸露访问。",
    action: "配置 AUTH_SESSION_SECRET、ADMIN_DASHBOARD_ENABLED=true 和高强度 ADMIN_ACCESS_TOKEN。",
    evidence: "无 token 访问 /admin 返回 404，带 token 可进入后台；记录密钥轮换负责人。",
    relatedCheckIds: [
      "check:auth-secret",
      "check:admin",
      "env:AUTH_SESSION_SECRET",
      "env:ADMIN_DASHBOARD_ENABLED",
      "env:ADMIN_ACCESS_TOKEN",
    ],
  },
  {
    id: "database-migration",
    groupId: "database",
    groupTitle: "生产数据",
    title: "完成 PostgreSQL 迁移和落库探针",
    owner: "技术 / 运维",
    why: "订单、会员、钱包、报告、审计和运营配置必须能在服务重启后恢复。",
    action: "配置生产 DATABASE_URL，执行 Prisma 迁移或推送 Schema，然后在后台运行落库探针。",
    evidence: "保留迁移日志，/api/admin/persistence/probe 的 POST 返回 ok，/admin/health 显示落库已验收。",
    relatedCheckIds: [
      "check:database",
      "env:DATABASE_URL",
      "persistence:database",
      "external:postgres",
    ],
  },
  {
    id: "ai-openai",
    groupId: "ai-storage",
    groupTitle: "AI 与图片",
    title: "配置 OpenAI 模型和预算上限",
    owner: "技术 / 产品",
    why: "AI 对话、塔罗表达、手相视觉和深度报告都需要真实模型能力与成本边界。",
    action: "配置 OPENAI_API_KEY、默认模型和视觉模型，运行第三方诊断并做一次真实对话和报告生成。",
    evidence: "诊断显示 OpenAI 模型读取通过；UsageLog 能记录模型、tokens 和成本。",
    relatedCheckIds: [
      "check:openai",
      "check:openai-vision",
      "env:OPENAI_API_KEY",
      "env:OPENAI_DEFAULT_MODEL",
      "env:OPENAI_FAST_MODEL",
      "env:OPENAI_PREMIUM_MODEL",
      "env:OPENAI_VISION_MODEL",
      "integration:openai",
      "external:openai",
    ],
  },
  {
    id: "storage-qiniu",
    groupId: "ai-storage",
    groupTitle: "AI 与图片",
    title: "配置七牛 bucket、公开域名和跨域",
    owner: "技术 / 运维",
    why: "手相上传需要真实对象存储，视觉模型也需要可访问的公开图片 URL。",
    action: "配置七牛 AK/SK、bucket、region、公开域名和 CORS，运行诊断后上传真实手相样图。",
    evidence: "浏览器上传成功；七牛公开 URL 可打开；手相报告能读取图片并保存报告。",
    relatedCheckIds: [
      "check:qiniu",
      "env:QINIU_ACCESS_KEY",
      "env:QINIU_SECRET_KEY",
      "env:QINIU_BUCKET",
      "env:QINIU_REGION",
      "env:QINIU_PUBLIC_DOMAIN",
      "integration:qiniu",
      "external:qiniu",
    ],
  },
  {
    id: "payment-alipay",
    groupId: "payment",
    groupTitle: "支付联调",
    title: "支付宝应用参数和小额订单验收",
    owner: "技术 / 财务",
    why: "支付宝是中文 Web 首批核心收款方式，需要验证下单、回调验签和权益发放。",
    action: "主体应用通过后配置支付宝 APP_ID、公私钥，切换 live 模式，先跑诊断再做小额支付。",
    evidence: "支付宝诊断通过；一笔小额订单从待支付变为已支付；会员或星力自动到账。",
    relatedCheckIds: [
      "check:payment-mode",
      "check:payment-channel",
      "check:alipay",
      "env:PAYMENT_PROVIDER",
      "env:PAYMENT_CALLBACK_DEV_BYPASS",
      "env:ALIPAY_ENABLED",
      "env:ALIPAY_GATEWAY",
      "env:ALIPAY_APP_ID",
      "env:ALIPAY_PRIVATE_KEY",
      "env:ALIPAY_PUBLIC_KEY",
      "integration:alipay",
      "external:entity",
      "external:alipay",
    ],
  },
  {
    id: "payment-wechat",
    groupId: "payment",
    groupTitle: "支付联调",
    title: "微信支付商户参数和 Native 支付验收",
    owner: "技术 / 财务",
    why: "微信支付覆盖国内扫码支付场景，需要验证签名、通知验签和发放链路。",
    action: "主体商户号就绪后配置 mch_id、API v3 key、私钥、序列号和平台公钥，再做小额扫码支付。",
    evidence: "微信支付诊断通过；扫码支付回调入账；订单、钱包流水和会员权益一致。",
    relatedCheckIds: [
      "check:payment-mode",
      "check:payment-channel",
      "check:wechat-pay",
      "env:PAYMENT_PROVIDER",
      "env:PAYMENT_CALLBACK_DEV_BYPASS",
      "env:WECHAT_PAY_ENABLED",
      "env:WECHAT_PAY_MCH_ID",
      "env:WECHAT_PAY_API_V3_KEY",
      "env:WECHAT_PAY_PRIVATE_KEY",
      "env:WECHAT_PAY_SERIAL_NO",
      "env:WECHAT_PAY_PLATFORM_PUBLIC_KEY",
      "integration:wechat_pay",
      "external:entity",
      "external:wechat_pay",
    ],
  },
  {
    id: "login-wechat",
    groupId: "account",
    groupTitle: "账号登录",
    title: "确认 Google / 微信登录配置",
    owner: "技术 / 运营",
    why: "第一版必须保证至少一个账号入口可用；当前以 Google 邮箱登录承接，国内转化会继续受益于微信扫码登录。",
    action:
      "开启 AUTH_GOOGLE_ENABLED 并配置 GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET；微信开放平台完成后再配置 WECHAT_APP_ID、WECHAT_APP_SECRET。",
    evidence: "Google OAuth 或微信扫码登录至少一种方式可创建或恢复用户。",
    relatedCheckIds: [
      "check:login-any",
      "check:google-login",
      "env:AUTH_GOOGLE_ENABLED",
      "env:GOOGLE_CLIENT_ID",
      "env:GOOGLE_CLIENT_SECRET",
      "env:AUTH_WECHAT_ENABLED",
      "env:WECHAT_APP_ID",
      "env:WECHAT_APP_SECRET",
      "external:wechat_open",
    ],
  },
  {
    id: "compliance-icp",
    groupId: "compliance",
    groupTitle: "主体合规",
    title: "补齐主体、ICP备案和协议展示",
    owner: "运营 / 法务",
    why: "国内正式收费需要主体、备案、支付商户和协议主体一致。",
    action: "确定公司或个体工商户主体，完成域名备案，并把 COMPANY_NAME、ICP_RECORD_NO 写入生产配置。",
    evidence: "页脚、用户协议、隐私政策、免责声明展示同一主体和备案号。",
    relatedCheckIds: [
      "check:compliance",
      "env:COMPANY_NAME",
      "env:ICP_RECORD_NO",
      "external:entity",
      "external:icp",
      "external:legal_review",
    ],
  },
  {
    id: "launch-final-gate",
    groupId: "release",
    groupTitle: "上线放量",
    title: "复核 Go / No-Go 并保留灰度回滚方案",
    owner: "产品 / 技术",
    why: "正式收费前需要统一确认阻断项、警告项和外部联调证据。",
    action: "在 /admin/health 复核上线总闸；无 blocking 后先小流量开放，保留 PAYMENT_PROVIDER 回退和后台补偿流程。",
    evidence: "/api/admin/launch/readiness 返回无 blocking；首批真实订单、回调、权益和退款预案完成记录。",
    relatedCheckIds: [],
  },
] satisfies RunbookTemplate[];

function statusRank(status: HealthStatus) {
  if (status === "blocking") {
    return 0;
  }

  if (status === "warning") {
    return 1;
  }

  return 2;
}

function summarizeSteps(steps: LaunchRunbookStep[]) {
  return {
    ready: steps.filter((step) => step.status === "ready").length,
    warning: steps.filter((step) => step.status === "warning").length,
    blocking: steps.filter((step) => step.status === "blocking").length,
    total: steps.length,
  };
}

function statusFromSteps(steps: LaunchRunbookStep[]) {
  if (steps.some((step) => step.status === "blocking")) {
    return "blocking";
  }

  if (steps.some((step) => step.status === "warning")) {
    return "warning";
  }

  return "ready";
}

function statusFromIssues(issues: LaunchRunbookRelatedIssue[]) {
  if (issues.some((issue) => issue.status === "blocking")) {
    return "blocking";
  }

  if (issues.some((issue) => issue.status === "warning")) {
    return "warning";
  }

  return "ready";
}

function runbookLabel(status: HealthStatus) {
  if (status === "blocking") {
    return "先处理阻断项";
  }

  if (status === "warning") {
    return "可进入灰度准备";
  }

  return "可执行上线灰度";
}

function runbookDetail(status: HealthStatus, summary: LaunchRunbook["summary"]) {
  if (status === "blocking") {
    return `当前 Runbook 还有 ${summary.blocking} 个阻断步骤，暂不建议开启真实收费流量。`;
  }

  if (status === "warning") {
    return `当前 Runbook 无阻断步骤，但还有 ${summary.warning} 个警告步骤，适合内部或小流量灰度。`;
  }

  return "上线 Runbook 已全部通过，可以进入小额真实订单和灰度放量。";
}

function buildIssueMap(readiness: LaunchReadiness) {
  return new Map(
    [...readiness.blockers, ...readiness.warnings].map((item) => [
      item.id,
      {
        id: item.id,
        group: item.group,
        label: item.label,
        status: item.status,
        detail: item.detail,
        action: item.action,
      } satisfies LaunchRunbookRelatedIssue,
    ]),
  );
}

export function buildLaunchRunbook(readiness: LaunchReadiness) {
  const issuesById = buildIssueMap(readiness);
  const steps = templates.map((template) => {
    const relatedIssues = template.relatedCheckIds
      .map((id) => issuesById.get(id))
      .filter((issue): issue is LaunchRunbookRelatedIssue => Boolean(issue));
    const status =
      template.id === "launch-final-gate" ? readiness.status : statusFromIssues(relatedIssues);

    return {
      id: template.id,
      groupId: template.groupId,
      title: template.title,
      owner: template.owner,
      status,
      why: template.why,
      action: template.action,
      evidence: template.evidence,
      relatedCheckIds: template.relatedCheckIds,
      relatedIssues,
    } satisfies LaunchRunbookStep;
  });
  const groups = templates.reduce<LaunchRunbookGroup[]>((acc, template) => {
    if (acc.some((group) => group.id === template.groupId)) {
      return acc;
    }

    const groupSteps = steps.filter((step) => step.groupId === template.groupId);

    acc.push({
      id: template.groupId,
      title: template.groupTitle,
      status: statusFromSteps(groupSteps),
      steps: groupSteps,
    });

    return acc;
  }, []);
  const summary = summarizeSteps(steps);
  const status = statusFromSteps(steps);
  const nextSteps = steps
    .filter((step) => step.status !== "ready")
    .sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        a.groupId.localeCompare(b.groupId, "zh-CN") ||
        a.title.localeCompare(b.title, "zh-CN"),
    )
    .slice(0, 6);

  return {
    generatedAt: readiness.generatedAt,
    status,
    label: runbookLabel(status),
    detail: runbookDetail(status, summary),
    summary,
    groups,
    nextSteps,
  } satisfies LaunchRunbook;
}

export async function getLaunchRunbook() {
  const readiness = await getLaunchReadiness();

  return buildLaunchRunbook(readiness);
}
