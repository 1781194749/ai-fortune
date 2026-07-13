import "server-only";

import { createPrivateKey, createPublicKey, createSign } from "crypto";
import type { HealthStatus } from "@/lib/health-checks";
import {
  getDefaultOpenAIModel,
  getOpenAIBaseURL,
  getOpenAIUserAgent,
  getVisionOpenAIModel,
} from "@/lib/openai-client";
import { getLivePaymentStatus, type LivePaymentChannel } from "@/lib/payment-adapters";
import { createQiniuUploadToken, getQiniuUploadHost } from "@/lib/qiniu";
import { createUsageLog, getUsageLogsByFeature, type UsageLogRecord } from "@/lib/usage-log-store";

export const integrationProbeFeature = "integration_probe";

export type IntegrationId = "openai" | "qiniu" | "alipay" | "wechat_pay";

export type IntegrationProbeItem = {
  id: IntegrationId;
  group: string;
  label: string;
  status: HealthStatus;
  detail: string;
  action: string;
  checkedAt?: string;
  diagnostics: Array<{
    label: string;
    value: string;
    status: HealthStatus;
  }>;
};

export type IntegrationDiagnostics = {
  generatedAt: string;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
  };
  items: IntegrationProbeItem[];
};

type IntegrationProbeMetadata = {
  event: "integration_probe";
  checkedAt: string;
  items: IntegrationProbeItem[];
};

type Env = Record<string, string | undefined>;

const qiniuRequiredFields = [
  "QINIU_ACCESS_KEY",
  "QINIU_SECRET_KEY",
  "QINIU_BUCKET",
  "QINIU_PUBLIC_DOMAIN",
] as const;

function present(env: Env, key: string) {
  return Boolean(env[key]?.trim());
}

function missingFields(env: Env, fields: readonly string[]) {
  return fields.filter((field) => !present(env, field));
}

function summarize(items: IntegrationProbeItem[]) {
  return {
    ready: items.filter((item) => item.status === "ready").length,
    warning: items.filter((item) => item.status === "warning").length,
    blocking: items.filter((item) => item.status === "blocking").length,
    total: items.length,
  };
}

function item(input: IntegrationProbeItem) {
  return input;
}

function maskStatus(ready: boolean) {
  return ready ? "已配置" : "未配置";
}

function normalizePem(value: string, type: "PRIVATE KEY" | "PUBLIC KEY") {
  if (value.includes("-----BEGIN")) {
    return value;
  }

  const body = value.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n") ?? value;
  return `-----BEGIN ${type}-----\n${body}\n-----END ${type}-----`;
}

function readError(error: unknown) {
  if (error instanceof Error) {
    return error.message.split("\n").find((line) => line.trim()) ?? error.name;
  }

  return String(error);
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const timeout = AbortSignal.timeout(8000);

  return fetch(url, {
    ...init,
    signal: timeout,
  });
}

function baselineOpenAI(env: Env): IntegrationProbeItem {
  const configured = present(env, "OPENAI_API_KEY");
  const defaultModel = getDefaultOpenAIModel(env);
  const visionModel = getVisionOpenAIModel(env);
  const baseURL = getOpenAIBaseURL(env);
  const userAgent = getOpenAIUserAgent(env);

  return item({
    id: "openai",
    group: "AI 能力",
    label: "OpenAI 模型连通性",
    status: configured ? "warning" : "warning",
    detail: configured
      ? "API Key 已配置，等待后台探针确认模型读取权限。"
      : "未配置 OPENAI_API_KEY，AI 对话和手相视觉会使用本地降级回答。",
    action: configured
      ? "运行第三方诊断，确认默认模型可被当前 key 读取。"
      : "配置 OPENAI_API_KEY、OPENAI_DEFAULT_MODEL 和 OPENAI_VISION_MODEL 后再运行诊断。",
    diagnostics: [
      { label: "API Key", value: maskStatus(configured), status: configured ? "ready" : "warning" },
      { label: "API 地址", value: baseURL, status: "ready" },
      { label: "请求标识", value: userAgent, status: "ready" },
      { label: "默认模型", value: defaultModel, status: "ready" },
      { label: "视觉模型", value: visionModel, status: visionModel ? "ready" : "warning" },
    ],
  });
}

async function probeOpenAI(env: Env): Promise<IntegrationProbeItem> {
  const baseline = baselineOpenAI(env);
  const apiKey = env.OPENAI_API_KEY?.trim();
  const model = getDefaultOpenAIModel(env);
  const baseURL = getOpenAIBaseURL(env);
  const userAgent = getOpenAIUserAgent(env);

  if (!apiKey) {
    return baseline;
  }

  try {
    const response = await fetchWithTimeout(
      `${baseURL}/models/${encodeURIComponent(model)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "User-Agent": userAgent,
        },
      },
    );

    if (!response.ok) {
      return {
        ...baseline,
        status: response.status === 404 ? "warning" : "blocking",
        detail: `OpenAI 返回 HTTP ${response.status}，默认模型或 API Key 需要检查。`,
        action: "确认 OPENAI_API_KEY 有效、账号额度正常，并核对 OPENAI_DEFAULT_MODEL 名称。",
        checkedAt: new Date().toISOString(),
        diagnostics: [
          ...baseline.diagnostics,
          { label: "模型读取", value: `HTTP ${response.status}`, status: "blocking" },
        ],
      };
    }

    return {
      ...baseline,
      status: "ready",
      detail: `默认模型 ${model} 可被当前 API Key 读取。`,
      action: "继续配置视觉模型并用真实手相图片做端到端验证。",
      checkedAt: new Date().toISOString(),
      diagnostics: [
        ...baseline.diagnostics,
        { label: "模型读取", value: "通过", status: "ready" },
      ],
    };
  } catch (error) {
    return {
      ...baseline,
      status: "blocking",
      detail: `OpenAI 连通性探测失败：${readError(error)}`,
      action: "检查服务器出站网络、API Key、模型名称和 OpenAI 账号状态。",
      checkedAt: new Date().toISOString(),
      diagnostics: [
        ...baseline.diagnostics,
        { label: "模型读取", value: "失败", status: "blocking" },
      ],
    };
  }
}

function baselineQiniu(env: Env): IntegrationProbeItem {
  const missing = missingFields(env, qiniuRequiredFields);
  const configured = missing.length === 0;
  const uploadHost = getQiniuUploadHost(env.QINIU_REGION);

  return item({
    id: "qiniu",
    group: "图片存储",
    label: "七牛上传链路",
    status: configured ? "warning" : "warning",
    detail: configured
      ? "七牛核心参数已配置，等待后台探针确认 token 生成和上传域名可达。"
      : `缺少 ${missing.join(", ")}，当前只能走 mock 上传 token。`,
    action: configured
      ? "运行第三方诊断，确认上传 token 可生成且上传域名可访问。"
      : "配置七牛 AK/SK、bucket、region、公开域名和跨域规则。",
    diagnostics: [
      {
        label: "核心参数",
        value: configured ? "完整" : `缺 ${missing.length} 项`,
        status: configured ? "ready" : "warning",
      },
      { label: "上传域名", value: uploadHost, status: "ready" },
      {
        label: "公开域名",
        value: env.QINIU_PUBLIC_DOMAIN?.trim() || "未配置",
        status: env.QINIU_PUBLIC_DOMAIN?.trim() ? "ready" : "warning",
      },
    ],
  });
}

async function probeQiniu(env: Env): Promise<IntegrationProbeItem> {
  const baseline = baselineQiniu(env);
  const missing = missingFields(env, qiniuRequiredFields);

  if (missing.length > 0) {
    return baseline;
  }

  const token = createQiniuUploadToken({
    userId: "diagnostics",
    filename: "palm-diagnostics.jpg",
    contentType: "image/jpeg",
    sizeBytes: 1024,
  });

  if (token.mode !== "qiniu" || !token.uploadUrl || !token.publicUrl) {
    return {
      ...baseline,
      status: "blocking",
      detail: "七牛 token 生成结果不完整。",
      action: "检查 bucket、公开域名和 AK/SK 是否配置正确。",
      checkedAt: new Date().toISOString(),
      diagnostics: [
        ...baseline.diagnostics,
        { label: "Token", value: "异常", status: "blocking" },
      ],
    };
  }

  try {
    const response = await fetchWithTimeout(token.uploadUrl, { method: "HEAD" });
    const reachable = response.status < 500;

    return {
      ...baseline,
      status: reachable ? "ready" : "blocking",
      detail: reachable
        ? `上传 token 可生成，上传域名返回 HTTP ${response.status}。`
        : `上传域名返回 HTTP ${response.status}，可能不可用。`,
      action: reachable
        ? "继续在浏览器上传真实手相图片，并确认七牛公开 URL 可被视觉模型读取。"
        : "检查 QINIU_REGION、上传域名和服务器出站网络。",
      checkedAt: new Date().toISOString(),
      diagnostics: [
        ...baseline.diagnostics,
        { label: "Token", value: "已生成", status: "ready" },
        {
          label: "上传域名",
          value: `HTTP ${response.status}`,
          status: reachable ? "ready" : "blocking",
        },
      ],
    };
  } catch (error) {
    return {
      ...baseline,
      status: "blocking",
      detail: `七牛上传域名探测失败：${readError(error)}`,
      action: "检查 QINIU_REGION、上传域名和服务器出站网络。",
      checkedAt: new Date().toISOString(),
      diagnostics: [
        ...baseline.diagnostics,
        { label: "Token", value: "已生成", status: "ready" },
        { label: "上传域名", value: "失败", status: "blocking" },
      ],
    };
  }
}

function paymentLabel(channel: LivePaymentChannel) {
  return channel === "alipay" ? "支付宝电脑网站支付" : "微信 Native 支付";
}

function paymentGroup(channel: LivePaymentChannel) {
  return channel === "alipay" ? "支付" : "支付";
}

function baselinePayment(env: Env, channel: LivePaymentChannel): IntegrationProbeItem {
  const status = getLivePaymentStatus(channel);
  const enabledKey = channel === "alipay" ? "ALIPAY_ENABLED" : "WECHAT_PAY_ENABLED";
  const enabled = env[enabledKey] === "true";

  return item({
    id: channel,
    group: paymentGroup(channel),
    label: paymentLabel(channel),
    status: !enabled ? "warning" : status.missingFields.length > 0 ? "blocking" : "warning",
    detail: !enabled
      ? `${paymentLabel(channel)}未开启，当前不会进入真实收款。`
      : status.missingFields.length > 0
        ? `缺少 ${status.missingFields.join(", ")}。`
        : "支付参数已配置，等待后台探针确认密钥格式和签名能力。",
    action: !enabled
      ? `主体和商户参数就绪后设置 ${enabledKey}=true。`
      : status.missingFields.length > 0
        ? "补齐缺失字段后再运行诊断。"
        : "运行第三方诊断，确认本地签名和公钥格式可用。",
    diagnostics: [
      { label: "开关", value: enabled ? "已开启" : "未开启", status: enabled ? "ready" : "warning" },
      {
        label: "必填参数",
        value: status.missingFields.length > 0 ? `缺 ${status.missingFields.length} 项` : "完整",
        status: status.missingFields.length > 0 ? "blocking" : "ready",
      },
    ],
  });
}

function smokeSign(privateKey: string) {
  const signer = createSign("RSA-SHA256");
  signer.update("xuanji-diagnostics", "utf8");
  signer.end();

  return signer.sign(normalizePem(privateKey, "PRIVATE KEY"), "base64");
}

async function probeAlipay(env: Env): Promise<IntegrationProbeItem> {
  const baseline = baselinePayment(env, "alipay");
  const status = getLivePaymentStatus("alipay");

  if (env.ALIPAY_ENABLED !== "true" || status.missingFields.length > 0) {
    return baseline;
  }

  try {
    const signature = smokeSign(env.ALIPAY_PRIVATE_KEY ?? "");
    createPublicKey(normalizePem(env.ALIPAY_PUBLIC_KEY ?? "", "PUBLIC KEY"));

    return {
      ...baseline,
      status: "ready",
      detail: "支付宝私钥签名和支付宝公钥格式校验通过。",
      action: "下一步使用支付宝沙箱或正式应用创建小额测试订单，验证异步通知验签。",
      checkedAt: new Date().toISOString(),
      diagnostics: [
        ...baseline.diagnostics,
        { label: "私钥签名", value: signature ? "通过" : "失败", status: signature ? "ready" : "blocking" },
        { label: "公钥格式", value: "通过", status: "ready" },
      ],
    };
  } catch (error) {
    return {
      ...baseline,
      status: "blocking",
      detail: `支付宝签名烟测失败：${readError(error)}`,
      action: "检查 ALIPAY_PRIVATE_KEY 是否为应用私钥，ALIPAY_PUBLIC_KEY 是否为支付宝公钥 PEM 或裸 key。",
      checkedAt: new Date().toISOString(),
      diagnostics: [
        ...baseline.diagnostics,
        { label: "签名烟测", value: "失败", status: "blocking" },
      ],
    };
  }
}

async function probeWechatPay(env: Env): Promise<IntegrationProbeItem> {
  const baseline = baselinePayment(env, "wechat_pay");
  const status = getLivePaymentStatus("wechat_pay");

  if (env.WECHAT_PAY_ENABLED !== "true" || status.missingFields.length > 0) {
    return baseline;
  }

  try {
    const signature = smokeSign(env.WECHAT_PAY_PRIVATE_KEY ?? "");
    createPrivateKey(normalizePem(env.WECHAT_PAY_PRIVATE_KEY ?? "", "PRIVATE KEY"));
    createPublicKey(normalizePem(env.WECHAT_PAY_PLATFORM_PUBLIC_KEY ?? "", "PUBLIC KEY"));
    const apiV3KeyOk = (env.WECHAT_PAY_API_V3_KEY ?? "").trim().length === 32;

    return {
      ...baseline,
      status: apiV3KeyOk ? "ready" : "blocking",
      detail: apiV3KeyOk
        ? "微信支付商户私钥签名、平台公钥格式和 API v3 key 长度校验通过。"
        : "微信支付 API v3 key 长度不是 32 位。",
      action: apiV3KeyOk
        ? "下一步使用微信支付沙箱或小额订单验证 Native 下单和异步通知验签。"
        : "重新生成 32 位 API v3 key，并同步到微信商户平台。",
      checkedAt: new Date().toISOString(),
      diagnostics: [
        ...baseline.diagnostics,
        { label: "商户私钥签名", value: signature ? "通过" : "失败", status: signature ? "ready" : "blocking" },
        { label: "平台公钥格式", value: "通过", status: "ready" },
        { label: "API v3 key", value: apiV3KeyOk ? "32 位" : "长度异常", status: apiV3KeyOk ? "ready" : "blocking" },
      ],
    };
  } catch (error) {
    return {
      ...baseline,
      status: "blocking",
      detail: `微信支付签名烟测失败：${readError(error)}`,
      action: "检查商户私钥、平台公钥、证书序列号和 API v3 key 是否来自同一个商户号。",
      checkedAt: new Date().toISOString(),
      diagnostics: [
        ...baseline.diagnostics,
        { label: "签名烟测", value: "失败", status: "blocking" },
      ],
    };
  }
}

function baselineItems(env: Env = process.env) {
  return [
    baselineOpenAI(env),
    baselineQiniu(env),
    baselinePayment(env, "alipay"),
    baselinePayment(env, "wechat_pay"),
  ] satisfies IntegrationProbeItem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDiagnosticItem(value: unknown): value is IntegrationProbeItem {
  return (
    isRecord(value) &&
    (value.id === "openai" ||
      value.id === "qiniu" ||
      value.id === "alipay" ||
      value.id === "wechat_pay") &&
    typeof value.label === "string" &&
    (value.status === "ready" || value.status === "warning" || value.status === "blocking")
  );
}

function readProbeMetadata(log: UsageLogRecord): IntegrationProbeMetadata | undefined {
  if (log.feature !== integrationProbeFeature || !isRecord(log.metadata)) {
    return undefined;
  }

  if (log.metadata.event !== "integration_probe" || typeof log.metadata.checkedAt !== "string") {
    return undefined;
  }

  if (!Array.isArray(log.metadata.items) || !log.metadata.items.every(isDiagnosticItem)) {
    return undefined;
  }

  return {
    event: "integration_probe",
    checkedAt: log.metadata.checkedAt,
    items: log.metadata.items,
  };
}

function mergeLatestProbe(
  baseline: IntegrationProbeItem[],
  latest: IntegrationProbeMetadata | undefined,
) {
  if (!latest) {
    return baseline;
  }

  const latestById = new Map(latest.items.map((probeItem) => [probeItem.id, probeItem]));

  return baseline.map((baselineItem) => {
    const probed = latestById.get(baselineItem.id);

    if (!probed) {
      return baselineItem;
    }

    const missingConfigLabels = baselineItem.diagnostics
      .filter(
        (diagnostic) =>
          ["核心参数", "必填参数", "API Key"].includes(diagnostic.label) &&
          diagnostic.status !== "ready",
      )
      .map((diagnostic) => diagnostic.label);
    const latestConflictsWithMissingConfig = missingConfigLabels.some(
      (label) =>
        probed.diagnostics.find((diagnostic) => diagnostic.label === label)?.status === "ready",
    );

    if (latestConflictsWithMissingConfig) {
      return baselineItem;
    }

    return probed;
  });
}

export async function getIntegrationDiagnostics() {
  const baseline = baselineItems();
  const logs = await getUsageLogsByFeature(integrationProbeFeature, { take: 1 });
  const latest = logs[0] ? readProbeMetadata(logs[0]) : undefined;
  const items = mergeLatestProbe(baseline, latest);

  return {
    generatedAt: latest?.checkedAt ?? new Date().toISOString(),
    summary: summarize(items),
    items,
  } satisfies IntegrationDiagnostics;
}

export async function runIntegrationDiagnostics() {
  const checkedAt = new Date().toISOString();
  const items = await Promise.all([
    probeOpenAI(process.env),
    probeQiniu(process.env),
    probeAlipay(process.env),
    probeWechatPay(process.env),
  ]);
  const normalizedItems = items.map((probeItem) => ({
    ...probeItem,
    checkedAt: probeItem.checkedAt ?? checkedAt,
  }));
  const diagnostics = {
    generatedAt: checkedAt,
    summary: summarize(normalizedItems),
    items: normalizedItems,
  } satisfies IntegrationDiagnostics;

  await createUsageLog({
    provider: "internal",
    model: "integration-diagnostics",
    feature: integrationProbeFeature,
    costCents: 0,
    metadata: {
      event: "integration_probe",
      checkedAt,
      items: normalizedItems,
    } satisfies IntegrationProbeMetadata,
  });

  return diagnostics;
}
