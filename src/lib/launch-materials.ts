import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  externalReadinessStatusLabel,
  getLaunchExternalReadiness,
  type ExternalReadinessItem,
  type ExternalReadinessItemId,
  type ExternalReadinessStatus,
} from "@/lib/launch-external-readiness";

type LaunchMaterialTemplate = {
  id: ExternalReadinessItemId;
  priority: number;
  phase: string;
  dependencies?: ExternalReadinessItemId[];
  materials: string[];
  steps: string[];
  outputs: string[];
  envKeys: string[];
  verification: string[];
};

export type LaunchMaterialItem = {
  id: ExternalReadinessItemId;
  group: string;
  phase: string;
  title: string;
  owner: string;
  status: ExternalReadinessStatus;
  statusLabel: string;
  healthStatus: HealthStatus;
  targetDate?: string;
  receiptNo?: string;
  evidenceUrl?: string;
  note?: string;
  evidenceNote?: string;
  priority: number;
  blockedBy: string[];
  materials: string[];
  steps: string[];
  outputs: string[];
  envKeys: string[];
  verification: string[];
  currentAction: string;
  currentEvidence: string;
};

export type LaunchMaterialPack = {
  generatedAt: string;
  summary: {
    ready: number;
    pending: number;
    blocking: number;
    total: number;
    envKeyCount: number;
    materialCount: number;
  };
  items: LaunchMaterialItem[];
  nextItems: LaunchMaterialItem[];
  envKeys: string[];
};

const templates = [
  {
    id: "entity",
    priority: 10,
    phase: "主体先行",
    materials: [
      "公司或个体工商户路径选择",
      "营业执照、经营者或法人身份信息",
      "主体联系人手机号、邮箱和收款账户信息",
    ],
    steps: [
      "确定后续备案、支付、协议统一使用的主体名称",
      "准备证照、联系人、收款账户和实名核验材料",
      "把主体名称同步到协议、支付申请和备案资料中",
    ],
    outputs: ["主体名称", "统一社会信用代码或个体工商户证照信息", "经营者或法人联系人信息"],
    envKeys: ["COMPANY_NAME"],
    verification: ["用户协议、隐私政策、支付申请和备案主体名称一致"],
  },
  {
    id: "domain",
    priority: 20,
    phase: "域名与访问",
    dependencies: ["entity"],
    materials: ["候选域名", "域名实名认证资料", "DNS 服务商账号"],
    steps: [
      "购买并完成域名实名认证",
      "解析正式站点域名到生产服务",
      "配置 HTTPS 证书并确认首页、登录页、会员页可访问",
    ],
    outputs: ["正式 HTTPS 域名", "DNS 解析记录", "证书状态截图或记录"],
    envKeys: ["APP_URL"],
    verification: ["APP_URL 不再指向 localhost，公开页面可通过 HTTPS 访问"],
  },
  {
    id: "icp",
    priority: 30,
    phase: "域名与访问",
    dependencies: ["entity", "domain"],
    materials: ["主体证照", "域名实名认证信息", "服务器备案服务码", "负责人手机号和核验材料"],
    steps: [
      "用正式主体和域名提交 ICP 备案",
      "完成短信、负责人和服务商核验",
      "备案号下发后写入页脚和协议相关页面",
    ],
    outputs: ["ICP备案号", "备案主体记录", "备案通过截图或通知"],
    envKeys: ["ICP_RECORD_NO"],
    verification: ["页脚和协议页展示备案号，备案主体与运营主体一致"],
  },
  {
    id: "postgres",
    priority: 40,
    phase: "生产基础设施",
    materials: ["云数据库账号", "数据库地域与规格", "备份策略", "生产访问白名单"],
    steps: [
      "创建生产 PostgreSQL 实例和数据库用户",
      "配置 DATABASE_URL 并执行 Prisma 迁移或推送",
      "在后台健康页运行落库探针",
    ],
    outputs: ["PostgreSQL 连接串", "迁移日志", "落库探针通过记录"],
    envKeys: ["DATABASE_URL"],
    verification: ["后台显示真实 PostgreSQL 写入读回成功，服务重启后数据可恢复"],
  },
  {
    id: "openai",
    priority: 50,
    phase: "AI 能力",
    materials: ["OpenAI 项目或组织", "API Key", "计费方式", "月度预算上限"],
    steps: [
      "创建生产 API Key 并限制用途",
      "确认默认模型、低成本模型、高质量模型和视觉模型",
      "运行 OpenAI 模型读取诊断，并做一次真实对话和手相图片测试",
    ],
    outputs: ["生产 API Key", "模型清单", "预算和告警设置"],
    envKeys: [
      "OPENAI_API_KEY",
      "OPENAI_DEFAULT_MODEL",
      "OPENAI_FAST_MODEL",
      "OPENAI_PREMIUM_MODEL",
      "OPENAI_VISION_MODEL",
    ],
    verification: ["第三方诊断显示 OpenAI 通过，UsageLog 记录模型、tokens 和成本"],
  },
  {
    id: "qiniu",
    priority: 60,
    phase: "图片存储",
    dependencies: ["domain"],
    materials: ["七牛云账号", "bucket 名称", "存储区域", "公开访问域名", "跨域规则"],
    steps: [
      "创建 bucket 并绑定公开访问域名",
      "配置 AK/SK、region、bucket 和 CORS",
      "上传真实手相样图并确认公开 URL 可访问",
    ],
    outputs: ["七牛 bucket", "公开图片域名", "AK/SK", "CORS 配置截图"],
    envKeys: [
      "QINIU_ACCESS_KEY",
      "QINIU_SECRET_KEY",
      "QINIU_BUCKET",
      "QINIU_REGION",
      "QINIU_PUBLIC_DOMAIN",
    ],
    verification: ["手相图片能上传到七牛，视觉模型可读取公开 URL 并生成报告"],
  },
  {
    id: "wechat_open",
    priority: 70,
    phase: "微信生态",
    dependencies: ["entity", "domain"],
    materials: ["微信开放平台主体", "网站应用名称与图标", "授权回调域名", "隐私与服务协议链接"],
    steps: [
      "创建微信开放平台网站应用",
      "配置授权回调域名和应用资料",
      "拿到 App ID / Secret 后开启灰度扫码登录",
    ],
    outputs: ["微信开放平台 App ID", "App Secret", "授权回调配置"],
    envKeys: ["AUTH_WECHAT_ENABLED", "WECHAT_APP_ID", "WECHAT_APP_SECRET"],
    verification: ["微信扫码登录能创建或恢复同一用户，邮箱登录仍可作为备选"],
  },
  {
    id: "alipay",
    priority: 80,
    phase: "支付收款",
    dependencies: ["entity", "domain"],
    materials: ["支付宝开放平台账号", "网站应用资料", "应用私钥", "支付宝公钥", "异步通知地址"],
    steps: [
      "创建支付宝应用并开通电脑网站支付能力",
      "生成应用私钥，配置支付宝公钥和回调地址",
      "运行支付宝签名诊断，再做小额订单验收",
    ],
    outputs: ["支付宝 APP_ID", "应用私钥", "支付宝公钥", "支付产品开通状态"],
    envKeys: [
      "LIVE_PAYMENT_SMOKE_TEST_USER_IDS",
      "ALIPAY_ENABLED",
      "ALIPAY_GATEWAY",
      "ALIPAY_APP_ID",
      "ALIPAY_PRIVATE_KEY",
      "ALIPAY_PUBLIC_KEY",
    ],
    verification: ["小额订单从待支付变为已支付，会员或星力自动到账"],
  },
  {
    id: "wechat_pay",
    priority: 90,
    phase: "支付收款",
    dependencies: ["entity", "domain", "wechat_open"],
    materials: ["微信支付商户号", "API v3 key", "商户私钥", "商户证书序列号", "平台公钥"],
    steps: [
      "完成微信支付商户申请和 Native 支付能力开通",
      "配置商户密钥、证书序列号、平台公钥和回调地址",
      "运行微信支付签名诊断，再做小额扫码订单验收",
    ],
    outputs: ["mch_id", "API v3 key", "商户私钥", "证书序列号", "平台公钥"],
    envKeys: [
      "WECHAT_APP_ID",
      "LIVE_PAYMENT_SMOKE_TEST_USER_IDS",
      "WECHAT_PAY_ENABLED",
      "WECHAT_PAY_MCH_ID",
      "WECHAT_PAY_API_V3_KEY",
      "WECHAT_PAY_PRIVATE_KEY",
      "WECHAT_PAY_SERIAL_NO",
      "WECHAT_PAY_PLATFORM_PUBLIC_KEY",
    ],
    verification: ["扫码支付回调入账，订单、钱包流水和会员权益一致"],
  },
  {
    id: "legal_review",
    priority: 100,
    phase: "法务与风控",
    dependencies: ["entity", "icp"],
    materials: ["用户协议", "隐私政策", "免责声明", "图片上传授权", "支付退款说明"],
    steps: [
      "确认 AI 命理内容定位为娱乐参考和自我探索",
      "审查图片上传授权、隐私处理、模型供应商披露和退款边界",
      "把主体、备案和联系方式同步到所有协议页面",
    ],
    outputs: ["协议版本记录", "免责声明版本", "退款和客服说明"],
    envKeys: ["COMPANY_NAME", "ICP_RECORD_NO", "APP_URL"],
    verification: ["协议页可访问，主体、备案、支付主体一致，上传前授权勾选存在"],
  },
] satisfies LaunchMaterialTemplate[];

function statusRank(status: ExternalReadinessStatus) {
  if (status === "blocked" || status === "not_started") {
    return 0;
  }

  if (status === "in_progress" || status === "submitted") {
    return 1;
  }

  return 2;
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  );
}

function buildMaterialItem(
  item: ExternalReadinessItem,
  template: LaunchMaterialTemplate,
  itemsById: Map<ExternalReadinessItemId, ExternalReadinessItem>,
): LaunchMaterialItem {
  const blockedBy =
    template.dependencies
      ?.map((id) => itemsById.get(id))
      .filter((dependency): dependency is ExternalReadinessItem => Boolean(dependency))
      .filter((dependency) => dependency.status !== "ready")
      .map((dependency) => dependency.title) ?? [];
  const currentEvidence = [
    item.evidenceNote ?? item.evidence,
    item.receiptNo ? `回执：${item.receiptNo}` : undefined,
    item.evidenceUrl ? `证据链接：${item.evidenceUrl}` : undefined,
  ]
    .filter(Boolean)
    .join("；");

  return {
    id: item.id,
    group: item.group,
    phase: template.phase,
    title: item.title,
    owner: item.owner,
    status: item.status,
    statusLabel: externalReadinessStatusLabel(item.status),
    healthStatus: item.healthStatus,
    targetDate: item.targetDate,
    receiptNo: item.receiptNo,
    evidenceUrl: item.evidenceUrl,
    note: item.note,
    evidenceNote: item.evidenceNote,
    priority: template.priority,
    blockedBy,
    materials: template.materials,
    steps: template.steps,
    outputs: template.outputs,
    envKeys: template.envKeys,
    verification: template.verification,
    currentAction: item.action,
    currentEvidence,
  } satisfies LaunchMaterialItem;
}

export async function getLaunchMaterialPack() {
  const readiness = await getLaunchExternalReadiness();
  const itemsById = new Map(readiness.items.map((item) => [item.id, item]));
  const items = templates
    .map((template) => {
      const item = itemsById.get(template.id);

      if (!item) {
        return undefined;
      }

      return buildMaterialItem(item, template, itemsById);
    })
    .filter((item): item is LaunchMaterialItem => Boolean(item));
  const envKeys = uniqueSorted(items.flatMap((item) => item.envKeys));
  const nextItems = [...items]
    .filter((item) => item.status !== "ready")
    .sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        a.priority - b.priority ||
        a.title.localeCompare(b.title, "zh-CN"),
    )
    .slice(0, 6);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      ready: items.filter((item) => item.status === "ready").length,
      pending: items.filter((item) => item.status !== "ready").length,
      blocking: items.filter((item) => item.healthStatus === "blocking").length,
      total: items.length,
      envKeyCount: envKeys.length,
      materialCount: items.reduce((sum, item) => sum + item.materials.length, 0),
    },
    items,
    nextItems,
    envKeys,
  } satisfies LaunchMaterialPack;
}
