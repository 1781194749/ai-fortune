import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  getLaunchAcceptanceEvidenceRecords,
  saveLaunchAcceptanceEvidence,
  type LaunchAcceptanceEvidenceRecord,
} from "@/lib/launch-acceptance-evidence";
import { getLaunchReadiness } from "@/lib/launch-readiness";
import type { LaunchReadinessItem } from "@/lib/launch-readiness";

export type LaunchAcceptanceCase = {
  id: string;
  group: string;
  title: string;
  status: HealthStatus;
  owner: string;
  goal: string;
  routes: string[];
  steps: string[];
  expected: string[];
  evidence: string;
  relatedCheckIds: string[];
  relatedIssues: Array<Pick<LaunchReadinessItem, "id" | "group" | "label" | "status" | "action">>;
  evidenceRecordCount: number;
  latestEvidence?: LaunchAcceptanceEvidenceRecord;
};

export type LaunchAcceptanceMatrix = {
  generatedAt: string;
  status: HealthStatus;
  label: string;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
    evidenceRecords: number;
    casesWithEvidence: number;
    latestEvidenceAt?: string;
  };
  cases: LaunchAcceptanceCase[];
  nextCases: LaunchAcceptanceCase[];
  evidenceRecords: LaunchAcceptanceEvidenceRecord[];
  copyText: string;
};

type CaseTemplate = Omit<
  LaunchAcceptanceCase,
  "status" | "relatedIssues" | "evidenceRecordCount" | "latestEvidence"
>;

const templates = [
  {
    id: "auth-google-member-profile",
    group: "账号与档案",
    title: "Google 登录、Chat 首屏和命理档案保存",
    owner: "产品 / 测试",
    goal: "确认新用户能完成 Google 邮箱登录，直接进入 Chat，并可继续保存出生信息和长期关注主题。",
    routes: ["/login", "/chat", "/member", "/api/auth/google", "/api/auth/google/callback", "/api/profile"],
    steps: [
      "用测试 Google 账号完成登录。",
      "确认登录成功后直接进入 /chat。",
      "从 Chat 或会员中心补充称呼、生日、出生时间、出生地和关注主题。",
      "刷新页面后重新进入 Chat 和档案页。",
    ],
    expected: [
      "登录后直接进入 /chat。",
      "会员档案保存成功并展示八字/五行摘要。",
      "刷新后档案仍可读取。",
    ],
    evidence: "保留登录成功后进入 Chat、档案保存和刷新后档案仍存在的截图或录屏。",
    relatedCheckIds: [
      "env:AUTH_GOOGLE_ENABLED",
      "env:GOOGLE_CLIENT_ID",
      "env:GOOGLE_CLIENT_SECRET",
      "env:DATABASE_URL",
      "persistence:database",
    ],
  },
  {
    id: "ai-chat-profile-memory",
    group: "AI 对话",
    title: "AI 对话读取会员档案并展示推演步骤",
    owner: "产品 / 测试",
    goal: "确认对话能读取会员档案，并展示不是干等的推演过程。",
    routes: ["/chat", "/api/chat", "/api/profile"],
    steps: [
      "使用已保存档案的账号进入 /chat。",
      "询问一个和事业或感情相关的问题。",
      "观察推演步骤、工具轨迹和最终回答。",
    ],
    expected: [
      "回答能引用会员档案中的长期关注或出生信息。",
      "界面展示推演步骤。",
      "UsageLog 记录模型、tokens 和成本。",
    ],
    evidence: "保留聊天步骤、最终回复和 UsageLog 成本记录。",
    relatedCheckIds: [
      "env:OPENAI_API_KEY",
      "env:OPENAI_DEFAULT_MODEL",
      "env:OPENAI_FAST_MODEL",
      "integration:openai",
      "persistence:database",
    ],
  },
  {
    id: "fortune-tools-report-save",
    group: "命理工具",
    title: "塔罗、八字和八卦工具扣费与报告沉淀",
    owner: "产品 / 测试",
    goal: "确认三类核心工具可用，付费工具扣星力，结果进入报告中心。",
    routes: [
      "/tarot",
      "/bazi",
      "/bagua",
      "/api/fortune/tarot",
      "/api/fortune/bazi",
      "/api/fortune/bagua",
      "/reports/[reportId]",
    ],
    steps: [
      "完成一次塔罗三牌阵。",
      "填写生日信息完成八字五行简析。",
      "输入问题完成一次八卦问事。",
      "分别进入生成的报告详情页。",
    ],
    expected: [
      "工具过程展示清晰。",
      "付费项目按星力规则扣费。",
      "报告可在详情页反复查看。",
    ],
    evidence: "保留三类工具结果、星力扣费流水和报告详情页。",
    relatedCheckIds: ["env:DATABASE_URL", "persistence:database"],
  },
  {
    id: "palm-upload-vision-report",
    group: "手相图片",
    title: "七牛上传、手相视觉分析和报告保存",
    owner: "产品 / 测试",
    goal: "确认用户能上传手相图片，视觉模型能读取公开 URL 并生成报告。",
    routes: [
      "/palm",
      "/api/storage/qiniu/upload-token",
      "/api/images/palm",
      "/api/fortune/palm",
      "/reports/[reportId]",
    ],
    steps: [
      "在 /palm 上传 JPG/PNG/WebP 手掌图片。",
      "确认图片保存到七牛并返回公开 URL。",
      "生成手相分析报告并进入报告详情页。",
    ],
    expected: [
      "图片上传成功且可删除。",
      "公开 URL 可访问。",
      "视觉模型或降级逻辑生成手相报告，报告保存成功。",
    ],
    evidence: "保留上传成功记录、七牛公开 URL、视觉报告和报告详情页。",
    relatedCheckIds: [
      "env:QINIU_ACCESS_KEY",
      "env:QINIU_SECRET_KEY",
      "env:QINIU_BUCKET",
      "env:QINIU_REGION",
      "env:QINIU_PUBLIC_DOMAIN",
      "env:OPENAI_VISION_MODEL",
      "integration:qiniu",
      "integration:openai",
      "external:qiniu",
    ],
  },
  {
    id: "mock-payment-benefits",
    group: "收费闭环",
    title: "mock payment 下单、支付成功和权益发放",
    owner: "产品 / 测试",
    goal: "确认在没有真实支付资质时，开发链路仍可完整验证订单和权益。",
    routes: ["/member", "/api/payments/mock/orders", "/checkout/mock/[orderId]"],
    steps: [
      "在会员页购买体验卡或月度会员。",
      "进入 mock 支付页点击支付成功。",
      "返回会员中心查看会员档位、星力和钱包流水。",
    ],
    expected: [
      "订单创建成功。",
      "支付成功后订单变为已支付。",
      "会员和星力权益到账。",
    ],
    evidence: "保留订单、支付成功页、会员权益和钱包流水。",
    relatedCheckIds: ["env:DATABASE_URL", "persistence:database"],
  },
  {
    id: "live-payment-alipay-wechat",
    group: "收费闭环",
    title: "支付宝或微信支付小额真实订单",
    owner: "产品 / 技术 / 财务",
    goal: "确认至少一个真实支付渠道完成下单、回调验签和权益发放。",
    routes: [
      "/member",
      "/api/payments/live/orders",
      "/api/payments/alipay/notify",
      "/api/payments/wechat/notify",
    ],
    steps: [
      "切换 PAYMENT_PROVIDER=live。",
      "用支付宝或微信支付创建一笔小额订单。",
      "完成真实支付并等待异步通知。",
      "核对订单、钱包流水、会员权益和支付平台账单。",
    ],
    expected: [
      "真实支付渠道能创建订单。",
      "异步通知验签通过。",
      "权益自动到账，金额和渠道账单一致。",
    ],
    evidence: "保留支付平台交易号、订单状态、钱包流水和权益到账截图。",
    relatedCheckIds: [
      "check:payment-mode",
      "check:payment-channel",
      "check:alipay",
      "check:wechat-pay",
      "env:PAYMENT_PROVIDER",
      "env:ALIPAY_ENABLED",
      "env:WECHAT_PAY_ENABLED",
      "integration:alipay",
      "integration:wechat_pay",
      "external:alipay",
      "external:wechat_pay",
    ],
  },
  {
    id: "deep-report-paid-generation",
    group: "深度报告",
    title: "单次付费深度报告下单、生成和轮询",
    owner: "产品 / 测试",
    goal: "确认深度报告能从付费订单进入生成中，再异步完成并可查看。",
    routes: [
      "/reports/deep",
      "/api/reports/deep/orders",
      "/api/reports/deep/orders/[orderId]/generate",
      "/api/reports/[reportId]",
    ],
    steps: [
      "购买一个深度报告商品。",
      "支付成功后触发报告生成。",
      "观察生成中状态并等待完成。",
      "打开报告详情页。",
    ],
    expected: [
      "报告先进入 GENERATING。",
      "后台任务完成后变为 COMPLETED。",
      "报告正文、模型和 token 成本可见。",
    ],
    evidence: "保留订单、生成中状态、完成状态和报告详情页。",
    relatedCheckIds: [
      "env:DATABASE_URL",
      "env:OPENAI_API_KEY",
      "env:OPENAI_PREMIUM_MODEL",
      "persistence:database",
      "integration:openai",
    ],
  },
  {
    id: "report-share-poster-attribution",
    group: "分享增长",
    title: "报告公开分享、海报二维码和归因回流",
    owner: "产品 / 运营",
    goal: "确认报告分享链路能带来公开访问、海报下载和回流归因。",
    routes: [
      "/reports/[reportId]",
      "/share/[shareSlug]",
      "/share/[shareSlug]/poster",
      "/api/reports/[reportId]/share",
      "/api/attribution/share/[shareSlug]",
    ],
    steps: [
      "在报告详情页开启公开分享。",
      "打开公开分享页并生成海报。",
      "通过带 source 或二维码参数的链接回流登录和下单。",
    ],
    expected: [
      "公开页不暴露原始输入和账户信息。",
      "海报二维码可跳回公开页。",
      "后台记录 landing、login、order_created 或 paid 归因事件。",
    ],
    evidence: "保留公开页、海报、二维码链接和归因后台记录。",
    relatedCheckIds: ["env:APP_URL", "env:DATABASE_URL", "persistence:database"],
  },
  {
    id: "admin-launch-evidence",
    group: "后台验收",
    title: "后台健康页、探针和上线证据归档",
    owner: "产品 / 技术",
    goal: "确认后台可查看上线状态，运行探针，并归档上线证据。",
    routes: [
      "/admin/health",
      "/api/admin/persistence/probe",
      "/api/admin/integrations/probe",
      "/api/admin/launch/evidence",
    ],
    steps: [
      "用后台 token 访问 /admin/health。",
      "运行落库探针和第三方诊断。",
      "归档一次上线证据。",
      "刷新后确认最新证据和当前状态一致。",
    ],
    expected: [
      "无 token 生产访问受保护。",
      "探针结果进入健康页。",
      "上线证据写入 UsageLog 并可回看。",
    ],
    evidence: "保留后台访问保护、探针结果和上线证据归档记录。",
    relatedCheckIds: [
      "env:ADMIN_DASHBOARD_ENABLED",
      "env:ADMIN_ACCESS_TOKEN",
      "env:AUTH_SESSION_SECRET",
      "persistence:database",
    ],
  },
] satisfies CaseTemplate[];

function statusRank(status: HealthStatus) {
  if (status === "blocking") {
    return 0;
  }

  if (status === "warning") {
    return 1;
  }

  return 2;
}

function caseStatus(input: {
  issues: LaunchAcceptanceCase["relatedIssues"];
  latestEvidence?: LaunchAcceptanceEvidenceRecord;
}): HealthStatus {
  if (
    input.issues.some((issue) => issue.status === "blocking") ||
    input.latestEvidence?.metadata.status === "blocking"
  ) {
    return "blocking";
  }

  if (
    input.issues.some((issue) => issue.status === "warning") ||
    !input.latestEvidence ||
    input.latestEvidence.metadata.status === "warning"
  ) {
    return "warning";
  }

  return "ready";
}

function summarize(cases: LaunchAcceptanceCase[]) {
  return {
    ready: cases.filter((item) => item.status === "ready").length,
    warning: cases.filter((item) => item.status === "warning").length,
    blocking: cases.filter((item) => item.status === "blocking").length,
    total: cases.length,
    evidenceRecords: cases.reduce((total, item) => total + item.evidenceRecordCount, 0),
    casesWithEvidence: cases.filter((item) => item.evidenceRecordCount > 0).length,
    latestEvidenceAt: cases
      .map((item) => item.latestEvidence?.metadata.savedAt)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => b.localeCompare(a))[0],
  };
}

function matrixStatus(summary: ReturnType<typeof summarize>): HealthStatus {
  if (summary.blocking > 0) {
    return "blocking";
  }

  if (summary.warning > 0) {
    return "warning";
  }

  return "ready";
}

function matrixLabel(status: HealthStatus, summary: ReturnType<typeof summarize>) {
  if (status === "blocking") {
    return `上线验收矩阵有 ${summary.blocking} 个阻断用例`;
  }

  if (status === "warning") {
    return `上线验收矩阵有 ${summary.warning} 个待复核用例`;
  }

  return "上线验收矩阵可执行";
}

function buildIssueMap(items: LaunchReadinessItem[]) {
  return new Map(items.map((item) => [item.id, item]));
}

function latestEvidenceByCase(records: LaunchAcceptanceEvidenceRecord[]) {
  const evidenceByCase = new Map<string, LaunchAcceptanceEvidenceRecord[]>();

  for (const record of records) {
    evidenceByCase.set(record.metadata.caseId, [
      ...(evidenceByCase.get(record.metadata.caseId) ?? []),
      record,
    ]);
  }

  return evidenceByCase;
}

function buildCopyText(input: {
  status: HealthStatus;
  label: string;
  cases: LaunchAcceptanceCase[];
}) {
  const lines = input.cases.map(
    (item, index) =>
      `${index + 1}. [${item.status}] ${item.group} / ${item.title} / ${item.owner} / 留证 ${item.evidenceRecordCount}：${item.evidence}`,
  );

  return [
    "玄机 AI 上线验收用例矩阵",
    `状态：${input.label} (${input.status})`,
    "",
    ...lines,
  ].join("\n");
}

function templateById(caseId: unknown) {
  if (typeof caseId !== "string") {
    return undefined;
  }

  return templates.find((template) => template.id === caseId);
}

export async function saveLaunchAcceptanceCaseEvidence(input: {
  caseId: unknown;
  status: unknown;
  tester?: unknown;
  evidenceUrl?: unknown;
  recordingUrl?: unknown;
  note?: unknown;
  request?: Request;
  operator?: string;
}) {
  const template = templateById(input.caseId);

  if (!template) {
    throw new Error("CASE_ID_INVALID");
  }

  return saveLaunchAcceptanceEvidence({
    caseId: template.id,
    caseTitle: template.title,
    caseGroup: template.group,
    status: input.status,
    tester: input.tester,
    evidenceUrl: input.evidenceUrl,
    recordingUrl: input.recordingUrl,
    note: input.note,
    request: input.request,
    operator: input.operator,
  });
}

export async function getLaunchAcceptanceMatrix() {
  const [launchReadiness, evidenceRecords] = await Promise.all([
    getLaunchReadiness(),
    getLaunchAcceptanceEvidenceRecords({ take: 120 }),
  ]);
  const recordsByCase = latestEvidenceByCase(evidenceRecords);
  const issueMap = buildIssueMap([
    ...launchReadiness.blockers,
    ...launchReadiness.warnings,
  ]);
  const cases = templates
    .map((template) => {
      const relatedIssues = template.relatedCheckIds
        .map((id) => issueMap.get(id))
        .filter((item): item is LaunchReadinessItem => Boolean(item))
        .map((item) => ({
          id: item.id,
          group: item.group,
          label: item.label,
          status: item.status,
          action: item.action,
        }));
      const caseRecords = recordsByCase.get(template.id) ?? [];
      const latestEvidence = caseRecords[0];

      return {
        ...template,
        status: caseStatus({ issues: relatedIssues, latestEvidence }),
        relatedIssues,
        evidenceRecordCount: caseRecords.length,
        latestEvidence,
      } satisfies LaunchAcceptanceCase;
    })
    .sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        a.group.localeCompare(b.group, "zh-CN") ||
        a.title.localeCompare(b.title, "zh-CN"),
    );
  const summary = summarize(cases);
  const status = matrixStatus(summary);
  const label = matrixLabel(status, summary);
  const nextCases = cases.filter((item) => item.status !== "ready").slice(0, 8);

  return {
    generatedAt: new Date().toISOString(),
    status,
    label,
    summary,
    cases,
    nextCases,
    evidenceRecords,
    copyText: buildCopyText({ status, label, cases }),
  } satisfies LaunchAcceptanceMatrix;
}
