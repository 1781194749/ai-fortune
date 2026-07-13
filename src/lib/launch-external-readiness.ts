import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  createUsageLog,
  getUsageLogsByFeature,
  type UsageLogRecord,
} from "@/lib/usage-log-store";

export const launchExternalReadinessFeature = "launch_external_readiness";

export type ExternalReadinessStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "ready"
  | "blocked";

export type ExternalReadinessItemId =
  | "entity"
  | "domain"
  | "icp"
  | "postgres"
  | "openai"
  | "qiniu"
  | "wechat_open"
  | "wechat_pay"
  | "alipay"
  | "legal_review";

export type ExternalReadinessItem = {
  id: ExternalReadinessItemId;
  group: string;
  title: string;
  owner: string;
  status: ExternalReadinessStatus;
  healthStatus: HealthStatus;
  why: string;
  action: string;
  evidence: string;
  targetDate?: string;
  receiptNo?: string;
  evidenceUrl?: string;
  evidenceNote?: string;
  note?: string;
  updatedAt?: string;
  updatedBy?: string;
};

export type LaunchExternalReadiness = {
  generatedAt: string;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
  };
  items: ExternalReadinessItem[];
  nextItems: ExternalReadinessItem[];
};

type ExternalReadinessSnapshot = {
  id: ExternalReadinessItemId;
  status: ExternalReadinessStatus;
  targetDate?: string;
  receiptNo?: string;
  evidenceUrl?: string;
  evidenceNote?: string;
  note?: string;
  updatedAt: string;
  updatedBy: string;
};

type ExternalReadinessUpdateInput = {
  id?: unknown;
  status?: unknown;
  targetDate?: unknown;
  receiptNo?: unknown;
  evidenceUrl?: unknown;
  evidenceNote?: unknown;
  note?: unknown;
};

export type ExternalReadinessMetadata = {
  event: "launch_external_readiness_updated";
  items: ExternalReadinessSnapshot[];
  updatedBy: string;
  updatedAt: string;
  note?: string;
};

declare global {
  var xuanjiLaunchExternalReadiness:
    | Map<ExternalReadinessItemId, ExternalReadinessSnapshot>
    | undefined;
}

const runtimeItems =
  globalThis.xuanjiLaunchExternalReadiness ??
  new Map<ExternalReadinessItemId, ExternalReadinessSnapshot>();

if (!globalThis.xuanjiLaunchExternalReadiness) {
  globalThis.xuanjiLaunchExternalReadiness = runtimeItems;
}

const defaultItems = [
  {
    id: "entity",
    group: "主体合规",
    title: "确定可备案和收款主体",
    owner: "创始人 / 财务",
    why: "域名备案、支付宝、微信支付、协议主体和发票口径需要同一主体承接。",
    action: "确定公司或个体工商户路径，准备营业执照、法人信息、对公账户或经营者收款材料。",
    evidence: "主体名称、证照信息和支付申请主体一致。",
  },
  {
    id: "domain",
    group: "域名与备案",
    title: "购买并解析正式域名",
    owner: "技术 / 运维",
    why: "APP_URL、支付回调、公开分享和 SEO 都依赖稳定 HTTPS 域名。",
    action: "完成域名购买、实名认证、DNS 解析和 HTTPS 证书配置。",
    evidence: "正式域名可访问首页、登录页、会员页和公开分享页。",
  },
  {
    id: "icp",
    group: "域名与备案",
    title: "完成 ICP 备案",
    owner: "运营 / 法务",
    why: "国内服务器正式提供 Web 服务通常需要完成备案并展示备案号。",
    action: "用确定主体提交域名备案，备案号下发后配置 ICP_RECORD_NO。",
    evidence: "页脚和协议页展示备案号，备案主体与实际运营主体一致。",
  },
  {
    id: "postgres",
    group: "生产基础设施",
    title: "生产 PostgreSQL 实例",
    owner: "技术 / 运维",
    why: "订单、会员、钱包、报告、审计和运营配置必须可恢复。",
    action: "创建生产 PostgreSQL，配置 DATABASE_URL，执行迁移并运行落库探针。",
    evidence: "/admin/health 显示 PostgreSQL 读写验收通过。",
  },
  {
    id: "openai",
    group: "AI 与存储",
    title: "OpenAI Key、模型和预算",
    owner: "技术 / 产品",
    why: "AI 对话、手相视觉和深度报告需要真实模型能力与成本边界。",
    action: "配置 OPENAI_API_KEY、默认模型、视觉模型和预算上限，运行第三方诊断。",
    evidence: "OpenAI 模型读取通过，UsageLog 能记录 tokens 和成本。",
  },
  {
    id: "qiniu",
    group: "AI 与存储",
    title: "七牛 bucket、域名和跨域",
    owner: "技术 / 运维",
    why: "手相上传和视觉模型读取依赖稳定公开图片 URL。",
    action: "创建 bucket，绑定公开域名，配置 AK/SK、region 和 CORS。",
    evidence: "浏览器可上传手相图片，公开 URL 可访问，视觉报告可生成。",
  },
  {
    id: "wechat_open",
    group: "微信生态",
    title: "微信开放平台应用",
    owner: "运营 / 技术",
    why: "微信扫码登录能降低国内用户登录阻力，并为后续小程序预留主体关系。",
    action: "完成微信开放平台资质、网站应用创建、回调域名配置和 App Secret 获取。",
    evidence: "微信扫码登录可创建或恢复用户账号。",
  },
  {
    id: "wechat_pay",
    group: "支付",
    title: "微信支付商户号",
    owner: "财务 / 技术",
    why: "微信 Native 支付是国内扫码支付核心渠道之一。",
    action: "完成微信支付商户申请，配置 mch_id、API v3 key、商户私钥、序列号和平台公钥。",
    evidence: "微信支付诊断通过，小额扫码订单回调后自动发放权益。",
  },
  {
    id: "alipay",
    group: "支付",
    title: "支付宝开放平台应用",
    owner: "财务 / 技术",
    why: "支付宝电脑网站支付覆盖中文 Web 付费场景。",
    action: "创建支付宝应用，配置 APP_ID、应用私钥、支付宝公钥和回调地址。",
    evidence: "支付宝诊断通过，小额订单支付后自动发放权益。",
  },
  {
    id: "legal_review",
    group: "法务与风控",
    title: "协议、免责声明和模型供应商披露",
    owner: "运营 / 法务",
    why: "AI 命理产品要明确娱乐参考、图片授权、隐私处理和付费退款边界。",
    action: "审查用户协议、隐私政策、免责声明、上传授权和支付退款说明。",
    evidence: "协议主体、备案主体、支付主体一致，页面可访问且版本已留档。",
  },
] satisfies Array<Omit<ExternalReadinessItem, "status" | "healthStatus">>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeStatus(value: unknown): ExternalReadinessStatus | undefined {
  return value === "not_started" ||
    value === "in_progress" ||
    value === "submitted" ||
    value === "ready" ||
    value === "blocked"
    ? value
    : undefined;
}

function normalizeItemId(value: unknown): ExternalReadinessItemId | undefined {
  return defaultItems.some((item) => item.id === value) ? (value as ExternalReadinessItemId) : undefined;
}

export function externalReadinessStatusLabel(status: ExternalReadinessStatus) {
  if (status === "ready") {
    return "已完成";
  }

  if (status === "in_progress") {
    return "处理中";
  }

  if (status === "submitted") {
    return "已提交";
  }

  if (status === "blocked") {
    return "卡住";
  }

  return "未开始";
}

function healthStatus(status: ExternalReadinessStatus): HealthStatus {
  if (status === "ready") {
    return "ready";
  }

  return "blocking";
}

function statusRank(status: ExternalReadinessStatus) {
  if (status === "blocked" || status === "not_started") {
    return 0;
  }

  if (status === "in_progress" || status === "submitted") {
    return 1;
  }

  return 2;
}

function normalizeOptionalText(value: unknown, maxLength = 180) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim().replace(/\s+/g, " ");

  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function normalizeOptionalUrl(value: unknown) {
  const text = normalizeOptionalText(value, 500);

  if (!text) {
    return undefined;
  }

  if (!/^https?:\/\/[^\s]+$/i.test(text)) {
    throw new Error("EVIDENCE_URL_INVALID");
  }

  return text;
}

function normalizeTargetDate(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("TARGET_DATE_INVALID");
  }

  return value;
}

function readSnapshot(value: unknown): ExternalReadinessSnapshot | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = normalizeItemId(value.id);
  const status = normalizeStatus(value.status);
  const updatedAt = readString(value.updatedAt);
  const updatedBy = readString(value.updatedBy);

  if (!id || !status || !updatedAt || !updatedBy) {
    return undefined;
  }

  return {
    id,
    status,
    targetDate: readString(value.targetDate),
    receiptNo: readString(value.receiptNo),
    evidenceUrl: readString(value.evidenceUrl),
    evidenceNote: readString(value.evidenceNote),
    note: readString(value.note),
    updatedAt,
    updatedBy,
  };
}

function applySnapshot(items: ExternalReadinessSnapshot[]) {
  runtimeItems.clear();

  for (const item of items) {
    runtimeItems.set(item.id, item);
  }
}

export function readExternalReadinessMetadata(log: UsageLogRecord) {
  if (log.feature !== launchExternalReadinessFeature || !isRecord(log.metadata)) {
    return undefined;
  }

  if (
    log.metadata.event !== "launch_external_readiness_updated" ||
    !Array.isArray(log.metadata.items)
  ) {
    return undefined;
  }

  const items = log.metadata.items
    .map(readSnapshot)
    .filter((item): item is ExternalReadinessSnapshot => Boolean(item));
  const updatedBy = readString(log.metadata.updatedBy);
  const updatedAt = readString(log.metadata.updatedAt);

  if (!updatedBy || !updatedAt) {
    return undefined;
  }

  return {
    event: "launch_external_readiness_updated",
    items,
    updatedBy,
    updatedAt,
    note: readString(log.metadata.note),
  } satisfies ExternalReadinessMetadata;
}

async function ensureLoaded() {
  if (runtimeItems.size > 0) {
    return;
  }

  const logs = await getUsageLogsByFeature(launchExternalReadinessFeature, { take: 20 });
  const latest = logs.map(readExternalReadinessMetadata).find(Boolean);

  if (latest) {
    applySnapshot(latest.items);
  }
}

function buildItem(base: (typeof defaultItems)[number]) {
  const snapshot = runtimeItems.get(base.id);
  const status = snapshot?.status ?? "not_started";

  return {
    ...base,
    status,
    healthStatus: healthStatus(status),
    targetDate: snapshot?.targetDate,
    receiptNo: snapshot?.receiptNo,
    evidenceUrl: snapshot?.evidenceUrl,
    evidenceNote: snapshot?.evidenceNote,
    note: snapshot?.note,
    updatedAt: snapshot?.updatedAt,
    updatedBy: snapshot?.updatedBy,
  } satisfies ExternalReadinessItem;
}

function summarize(items: ExternalReadinessItem[]) {
  return {
    ready: items.filter((item) => item.healthStatus === "ready").length,
    warning: items.filter((item) => item.healthStatus === "warning").length,
    blocking: items.filter((item) => item.healthStatus === "blocking").length,
    total: items.length,
  };
}

export async function getLaunchExternalReadiness() {
  await ensureLoaded();

  const items = defaultItems.map(buildItem);

  return {
    generatedAt: new Date().toISOString(),
    summary: summarize(items),
    items,
    nextItems: [...items]
      .filter((item) => item.status !== "ready")
      .sort(
        (a, b) =>
          statusRank(a.status) - statusRank(b.status) ||
          a.group.localeCompare(b.group, "zh-CN") ||
          a.title.localeCompare(b.title, "zh-CN"),
      )
      .slice(0, 6),
  } satisfies LaunchExternalReadiness;
}

export async function saveLaunchExternalReadinessItem(input: {
  id: unknown;
  status: unknown;
  targetDate?: unknown;
  receiptNo?: unknown;
  evidenceUrl?: unknown;
  evidenceNote?: unknown;
  note?: unknown;
  updatedBy?: string;
}) {
  return saveLaunchExternalReadinessItems({
    items: [input],
    updatedBy: input.updatedBy,
  });
}

export async function saveLaunchExternalReadinessItems(input: {
  items: ExternalReadinessUpdateInput[];
  updatedBy?: string;
}) {
  await ensureLoaded();

  if (input.items.length === 0 || input.items.length > defaultItems.length) {
    throw new Error("ITEM_INVALID");
  }

  const updatedAt = new Date().toISOString();
  const updatedBy = input.updatedBy ?? process.env.ADMIN_AUDIT_OPERATOR ?? "admin";
  const seenIds = new Set<ExternalReadinessItemId>();
  const snapshots = input.items.map((item) => {
    const id = normalizeItemId(item.id);
    const status = normalizeStatus(item.status);

    if (!id || !status || seenIds.has(id)) {
      throw new Error("ITEM_INVALID");
    }

    seenIds.add(id);

    return {
      id,
      status,
      targetDate: normalizeTargetDate(item.targetDate),
      receiptNo: normalizeOptionalText(item.receiptNo, 120),
      evidenceUrl: normalizeOptionalUrl(item.evidenceUrl),
      evidenceNote: normalizeOptionalText(item.evidenceNote, 220),
      note: normalizeOptionalText(item.note, 220),
      updatedAt,
      updatedBy,
    } satisfies ExternalReadinessSnapshot;
  });

  for (const snapshot of snapshots) {
    runtimeItems.set(snapshot.id, snapshot);
  }

  const metadata = {
    event: "launch_external_readiness_updated",
    items: Array.from(runtimeItems.values()),
    updatedBy,
    updatedAt,
    note: normalizeOptionalText(
      snapshots.map((snapshot) => snapshot.note).filter(Boolean).join("；"),
      240,
    ),
  } satisfies ExternalReadinessMetadata;

  await createUsageLog({
    provider: "internal",
    model: "launch-external-readiness",
    feature: launchExternalReadinessFeature,
    costCents: 0,
    metadata,
  });

  return {
    metadata,
    readiness: await getLaunchExternalReadiness(),
  };
}
