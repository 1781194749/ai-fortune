#!/usr/bin/env node

import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
} from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const statuses = {
  ready: "ready",
  warning: "warning",
  blocking: "blocking",
};

const defaultEnvFiles = [".env.production.local", ".env.production"];
const alipayFields = [
  "ALIPAY_APP_ID",
  "ALIPAY_PRIVATE_KEY",
  "ALIPAY_PUBLIC_KEY",
];
const wechatPayFields = [
  "WECHAT_APP_ID",
  "WECHAT_PAY_MCH_ID",
  "WECHAT_PAY_API_V3_KEY",
  "WECHAT_PAY_PRIVATE_KEY",
  "WECHAT_PAY_SERIAL_NO",
  "WECHAT_PAY_PLATFORM_PUBLIC_KEY",
];

function parseArgs(argv) {
  const args = {
    baseUrl: undefined,
    envFile: undefined,
    json: false,
    noFail: false,
    timeoutMs: 45000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--base-url") {
      args.baseUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--base-url=")) {
      args.baseUrl = arg.slice("--base-url=".length);
      continue;
    }

    if (arg === "--env") {
      args.envFile = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--env=")) {
      args.envFile = arg.slice("--env=".length);
      continue;
    }

    if (arg === "--json") {
      args.json = true;
      continue;
    }

    if (arg === "--timeout-ms") {
      args.timeoutMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--timeout-ms=")) {
      args.timeoutMs = Number(arg.slice("--timeout-ms=".length));
      continue;
    }

    if (arg === "--no-fail") {
      args.noFail = true;
    }
  }

  return args;
}

function validateTimeoutMs(value) {
  return Number.isInteger(value) && value >= 1000 && value <= 120000;
}

function normalizeBaseUrl(rawValue) {
  if (!rawValue) {
    return undefined;
  }

  const normalized = rawValue.trim().replace(/\/$/, "");
  const parsed = new URL(normalized);

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("base-url must use http or https.");
  }

  return normalized;
}

function stripComment(line) {
  let quote = "";

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if ((char === "\"" || char === "'") && line[index - 1] !== "\\") {
      quote = quote === char ? "" : quote || char;
    }

    if (char === "#" && !quote) {
      return line.slice(0, index);
    }
  }

  return line;
}

function unquote(value) {
  const trimmed = value.trim();
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];

  if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1).replaceAll("\\n", "\n");
  }

  return trimmed;
}

function parseEnvFile(filename) {
  const content = readFileSync(filename, "utf8");
  const env = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();

    if (!line || !line.includes("=")) {
      continue;
    }

    const normalized = line.startsWith("export ") ? line.slice("export ".length) : line;
    const separatorIndex = normalized.indexOf("=");
    const key = normalized.slice(0, separatorIndex).trim();
    const value = normalized.slice(separatorIndex + 1);

    if (/^[A-Z0-9_]+$/.test(key)) {
      env[key] = unquote(value);
    }
  }

  return env;
}

function pickDefaultEnvFile() {
  return defaultEnvFiles.find((filename) => existsSync(filename));
}

function value(env, key) {
  return env[key]?.trim() ?? "";
}

function isPlaceholder(rawValue) {
  const normalized = rawValue.trim().toLowerCase();

  return (
    !normalized ||
    normalized.startsWith("<") ||
    normalized.includes("<") ||
    normalized.includes(">") ||
    normalized.includes("your-") ||
    normalized.includes("example.") ||
    normalized.includes("replace") ||
    normalized.includes("changeme") ||
    normalized.includes("todo")
  );
}

function hasRealValue(env, key) {
  return Boolean(value(env, key)) && !isPlaceholder(value(env, key));
}

function missingFields(env, fields) {
  return fields.filter((field) => !hasRealValue(env, field));
}

function isLocalHost(hostname) {
  return /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)$/i.test(hostname);
}

function normalizePem(rawValue, type) {
  const trimmed = rawValue.trim();

  if (trimmed.includes("-----BEGIN")) {
    return trimmed;
  }

  const body = trimmed.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n") ?? trimmed;
  return `-----BEGIN ${type}-----\n${body}\n-----END ${type}-----`;
}

function readError(error) {
  if (error instanceof Error) {
    return error.message.split("\n").find((line) => line.trim()) ?? error.name;
  }

  return String(error);
}

function addCheck(result, check) {
  result.checks.push(check);
}

function readProjectFile(root, filename) {
  const absolutePath = path.resolve(root, filename);

  if (!existsSync(absolutePath)) {
    return "";
  }

  return readFileSync(absolutePath, "utf8");
}
function readAdminHealthContent(root) {
  return [
    readProjectFile(root, "src/app/admin/health/page.tsx"),
    readProjectFile(root, "src/app/admin/health/full/page.tsx"),
  ]
    .filter(Boolean)
    .join("\n");
}


function summarize(result) {
  result.summary = {
    ready: result.checks.filter((item) => item.status === statuses.ready).length,
    warning: result.checks.filter((item) => item.status === statuses.warning).length,
    blocking: result.checks.filter((item) => item.status === statuses.blocking).length,
    total: result.checks.length,
  };
  result.ok = result.summary.blocking === 0;

  return result;
}

function signAndVerifyWithPrivateKey(rawPrivateKey, sample) {
  const privateKey = createPrivateKey(normalizePem(rawPrivateKey, "PRIVATE KEY"));
  const publicKey = createPublicKey(privateKey);
  const signer = createSign("RSA-SHA256");

  signer.update(sample, "utf8");
  signer.end();

  const signature = signer.sign(privateKey);
  const verifier = createVerify("RSA-SHA256");

  verifier.update(sample, "utf8");
  verifier.end();

  return verifier.verify(publicKey, signature);
}

function parsePublicKey(rawPublicKey) {
  createPublicKey(normalizePem(rawPublicKey, "PUBLIC KEY"));
}

function decryptWechatResourceForSmoke(apiV3Key, resource) {
  const encrypted = Buffer.from(resource.ciphertext, "base64");
  const authTag = encrypted.subarray(encrypted.length - 16);
  const data = encrypted.subarray(0, encrypted.length - 16);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(apiV3Key, "utf8"),
    Buffer.from(resource.nonce, "utf8"),
  );

  decipher.setAAD(Buffer.from(resource.associated_data, "utf8"));
  decipher.setAuthTag(authTag);

  const plainText = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  return JSON.parse(plainText);
}

function smokeWechatResourceDecrypt(apiV3Key) {
  const plainText = JSON.stringify({
    out_trade_no: "xuanji-payment-smoke-order",
    transaction_id: "4200000000000000000000000000",
    trade_state: "SUCCESS",
    appid: "wx-smoke-app",
    mchid: "1900000001",
    amount: { total: 990 },
  });
  const resource = {
    nonce: "xuanji-smoke",
    associated_data: "transaction",
  };
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(apiV3Key, "utf8"),
    Buffer.from(resource.nonce, "utf8"),
  );

  cipher.setAAD(Buffer.from(resource.associated_data, "utf8"));

  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const decoded = decryptWechatResourceForSmoke(apiV3Key, {
    ...resource,
    ciphertext: encrypted.toString("base64"),
  });

  return (
    decoded.out_trade_no === "xuanji-payment-smoke-order" &&
    decoded.trade_state === "SUCCESS" &&
    decoded.amount?.total === 990
  );
}

function validateAppUrl(result, env) {
  const appUrl = value(env, "APP_URL").replace(/\/$/, "");

  if (!appUrl || isPlaceholder(appUrl)) {
    addCheck(result, {
      id: "app-url",
      group: "通用",
      label: "APP_URL",
      status: statuses.blocking,
      detail: appUrl ? "仍是占位值" : "未配置",
      action: "配置正式 HTTPS 域名，用于支付宝和微信支付回调。",
    });
    return;
  }

  try {
    const parsedUrl = new URL(appUrl);
    const ready = parsedUrl.protocol === "https:" && !isLocalHost(parsedUrl.hostname);

    addCheck(result, {
      id: "app-url",
      group: "通用",
      label: "APP_URL",
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready ? appUrl : "必须是非本地 HTTPS 域名",
      action: ready ? "保留正式域名和 HTTPS 证据。" : "正式支付回调不能使用 localhost、HTTP 或占位域名。",
    });
  } catch {
    addCheck(result, {
      id: "app-url",
      group: "通用",
      label: "APP_URL",
      status: statuses.blocking,
      detail: "APP_URL 不是有效 URL。",
      action: "使用 https://your-domain.com 格式。",
    });
  }
}

function validateGlobalPayment(result, env) {
  addCheck(result, {
    id: "payment-provider",
    group: "通用",
    label: "支付模式",
    status: value(env, "PAYMENT_PROVIDER") === "live" ? statuses.ready : statuses.blocking,
    detail: `PAYMENT_PROVIDER=${value(env, "PAYMENT_PROVIDER") || "mock"}`,
    action: "正式收费前必须配置 PAYMENT_PROVIDER=live。",
  });
  addCheck(result, {
    id: "payment-callback-dev-bypass",
    group: "通用",
    label: "支付回调开发旁路",
    status: value(env, "PAYMENT_CALLBACK_DEV_BYPASS") === "true" ? statuses.blocking : statuses.ready,
    detail: `PAYMENT_CALLBACK_DEV_BYPASS=${value(env, "PAYMENT_CALLBACK_DEV_BYPASS") || "false"}`,
    action: "生产环境必须保持 false，不能绕过真实回调验签。",
  });
}

function validateAlipay(result, env) {
  const enabled = value(env, "ALIPAY_ENABLED") === "true";
  const missing = missingFields(env, alipayFields);
  const gateway = value(env, "ALIPAY_GATEWAY") || "https://openapi.alipay.com/gateway.do";

  addCheck(result, {
    id: "alipay-enabled",
    group: "支付宝",
    label: "支付宝开关",
    status: enabled ? statuses.ready : statuses.warning,
    detail: enabled ? "已开启。" : "未开启。",
    action: enabled ? "继续检查商户参数和签名能力。" : "支付宝应用通过后开启 ALIPAY_ENABLED=true。",
  });
  addCheck(result, {
    id: "alipay-fields",
    group: "支付宝",
    label: "支付宝核心参数",
    status: missing.length === 0 ? statuses.ready : enabled ? statuses.blocking : statuses.warning,
    detail: missing.length === 0 ? "APP_ID、应用私钥和支付宝公钥已配置。" : `缺少 ${missing.join(", ")}`,
    action: missing.length === 0 ? "继续运行密钥格式和签名检查。" : "补齐支付宝开放平台应用参数。",
  });

  try {
    const parsedGateway = new URL(gateway);
    const gatewayReady = parsedGateway.protocol === "https:";

    addCheck(result, {
      id: "alipay-gateway",
      group: "支付宝",
      label: "支付宝网关",
      status: gatewayReady ? statuses.ready : statuses.blocking,
      detail: gateway,
      action: gatewayReady ? "保留正式网关配置。" : "支付宝网关必须使用 HTTPS。",
    });
  } catch {
    addCheck(result, {
      id: "alipay-gateway",
      group: "支付宝",
      label: "支付宝网关",
      status: statuses.blocking,
      detail: "ALIPAY_GATEWAY 不是有效 URL。",
      action: "配置支付宝正式网关。",
    });
  }

  if (missing.length > 0) {
    return;
  }

  try {
    const ok = signAndVerifyWithPrivateKey(
      value(env, "ALIPAY_PRIVATE_KEY"),
      "xuanji-alipay-signature-check",
    );

    addCheck(result, {
      id: "alipay-private-key-sign",
      group: "支付宝",
      label: "应用私钥签名",
      status: ok ? statuses.ready : statuses.blocking,
      detail: ok ? "应用私钥可完成 RSA2 签名。" : "应用私钥签名校验失败。",
      action: ok ? "保留签名检查输出。" : "检查应用私钥格式是否为支付宝开放平台应用私钥。",
    });
  } catch (error) {
    addCheck(result, {
      id: "alipay-private-key-sign",
      group: "支付宝",
      label: "应用私钥签名",
      status: statuses.blocking,
      detail: readError(error),
      action: "检查 ALIPAY_PRIVATE_KEY PEM 格式或单行 base64 内容。",
    });
  }

  try {
    parsePublicKey(value(env, "ALIPAY_PUBLIC_KEY"));
    addCheck(result, {
      id: "alipay-public-key-parse",
      group: "支付宝",
      label: "支付宝公钥格式",
      status: statuses.ready,
      detail: "支付宝公钥可被解析。",
      action: "继续通过小额订单回调验证真实验签。",
    });
  } catch (error) {
    addCheck(result, {
      id: "alipay-public-key-parse",
      group: "支付宝",
      label: "支付宝公钥格式",
      status: statuses.blocking,
      detail: readError(error),
      action: "检查 ALIPAY_PUBLIC_KEY 是否为支付宝平台公钥。",
    });
  }
}

function validateWechatPay(result, env) {
  const enabled = value(env, "WECHAT_PAY_ENABLED") === "true";
  const missing = missingFields(env, wechatPayFields);
  const apiV3Key = value(env, "WECHAT_PAY_API_V3_KEY");

  addCheck(result, {
    id: "wechat-pay-enabled",
    group: "微信支付",
    label: "微信支付开关",
    status: enabled ? statuses.ready : statuses.warning,
    detail: enabled ? "已开启。" : "未开启。",
    action: enabled ? "继续检查商户参数和签名能力。" : "微信支付商户号通过后开启 WECHAT_PAY_ENABLED=true。",
  });
  addCheck(result, {
    id: "wechat-pay-fields",
    group: "微信支付",
    label: "微信支付核心参数",
    status: missing.length === 0 ? statuses.ready : enabled ? statuses.blocking : statuses.warning,
    detail: missing.length === 0 ? "App ID、mch_id、API v3 key、私钥、序列号和平台公钥已配置。" : `缺少 ${missing.join(", ")}`,
    action: missing.length === 0 ? "继续运行密钥格式和签名检查。" : "补齐微信支付商户平台参数。",
  });

  if (missing.length === 0) {
    addCheck(result, {
      id: "wechat-pay-api-v3-key",
      group: "微信支付",
      label: "API v3 key 长度",
      status: Buffer.byteLength(apiV3Key, "utf8") === 32 ? statuses.ready : statuses.blocking,
      detail: `当前长度 ${Buffer.byteLength(apiV3Key, "utf8")} 字节。`,
      action: "微信支付 API v3 key 必须为 32 字节，不能使用占位值。",
    });
  }

  if (missing.length > 0) {
    return;
  }

  try {
    const ok = smokeWechatResourceDecrypt(apiV3Key);

    addCheck(result, {
      id: "wechat-pay-resource-decrypt-smoke",
      group: "微信支付",
      label: "API v3 resource 解密烟测",
      status: ok ? statuses.ready : statuses.blocking,
      detail: ok ? "当前 API v3 key 可完成 AES-256-GCM 通知资源解密。" : "合成通知资源解密失败。",
      action: ok ? "保留检查输出；真实小额订单继续核对 transaction_id 和金额。" : "检查 WECHAT_PAY_API_V3_KEY 是否为 32 字节 API v3 密钥。",
    });
  } catch (error) {
    addCheck(result, {
      id: "wechat-pay-resource-decrypt-smoke",
      group: "微信支付",
      label: "API v3 resource 解密烟测",
      status: statuses.blocking,
      detail: readError(error),
      action: "检查 WECHAT_PAY_API_V3_KEY 是否为 32 字节 API v3 密钥。",
    });
  }

  try {
    const ok = signAndVerifyWithPrivateKey(
      value(env, "WECHAT_PAY_PRIVATE_KEY"),
      "xuanji-wechat-pay-signature-check",
    );

    addCheck(result, {
      id: "wechat-pay-private-key-sign",
      group: "微信支付",
      label: "商户私钥签名",
      status: ok ? statuses.ready : statuses.blocking,
      detail: ok ? "商户私钥可完成 RSA 签名。" : "商户私钥签名校验失败。",
      action: ok ? "保留签名检查输出。" : "检查商户私钥格式和证书序列号是否匹配。",
    });
  } catch (error) {
    addCheck(result, {
      id: "wechat-pay-private-key-sign",
      group: "微信支付",
      label: "商户私钥签名",
      status: statuses.blocking,
      detail: readError(error),
      action: "检查 WECHAT_PAY_PRIVATE_KEY PEM 格式或单行 base64 内容。",
    });
  }

  try {
    parsePublicKey(value(env, "WECHAT_PAY_PLATFORM_PUBLIC_KEY"));
    addCheck(result, {
      id: "wechat-pay-platform-public-key",
      group: "微信支付",
      label: "平台公钥格式",
      status: statuses.ready,
      detail: "微信支付平台公钥可被解析。",
      action: "继续通过小额订单回调验证真实验签。",
    });
  } catch (error) {
    addCheck(result, {
      id: "wechat-pay-platform-public-key",
      group: "微信支付",
      label: "平台公钥格式",
      status: statuses.blocking,
      detail: readError(error),
      action: "检查 WECHAT_PAY_PLATFORM_PUBLIC_KEY 是否为微信支付平台公钥。",
    });
  }
}

function validateReadyChannel(result, env) {
  const alipayReady =
    value(env, "ALIPAY_ENABLED") === "true" && missingFields(env, alipayFields).length === 0;
  const wechatReady =
    value(env, "WECHAT_PAY_ENABLED") === "true" &&
    missingFields(env, wechatPayFields).length === 0;

  addCheck(result, {
    id: "payment-channel-ready",
    group: "通用",
    label: "至少一个真实支付渠道",
    status: alipayReady || wechatReady ? statuses.ready : statuses.blocking,
    detail: [
      alipayReady ? "支付宝可进入签名/下单验收" : undefined,
      wechatReady ? "微信支付可进入签名/下单验收" : undefined,
    ]
      .filter(Boolean)
      .join("；") || "支付宝和微信支付都未完整配置。",
    action: "先完整闭合支付宝或微信支付任一渠道，再进入 paid_smoke 小额真实订单。",
  });
}

function validateCallbackBusinessGuards(result) {
  const root = process.cwd();
  const adapter = readProjectFile(root, "src/lib/payment-adapters.ts");
  const alipayRoute = readProjectFile(root, "src/app/api/payments/alipay/notify/route.ts");
  const wechatRoute = readProjectFile(root, "src/app/api/payments/wechat/notify/route.ts");
  const ready =
    adapter.includes("validateAlipayNotifyBusiness") &&
    adapter.includes("validateWechatPayNotifyBusiness") &&
    adapter.includes("decryptWechatPayResource") &&
    adapter.includes("aes-256-gcm") &&
    adapter.includes("decipher.setAAD") &&
    adapter.includes("decipher.setAuthTag") &&
    adapter.includes("AMOUNT_MISMATCH") &&
    adapter.includes("PROVIDER_MISMATCH") &&
    adapter.includes("APP_ID_MISMATCH") &&
    adapter.includes("MCH_ID_MISMATCH") &&
    alipayRoute.includes("validateAlipayNotifyBusiness(params)") &&
    wechatRoute.includes("decryptWechatPayResource(payload.resource)") &&
    wechatRoute.includes("validateWechatPayNotifyBusiness(transaction)");

  addCheck(result, {
    id: "payment-callback-business-guard",
    group: "回调安全",
    label: "回调业务字段校验",
    status: ready ? statuses.ready : statuses.blocking,
    detail: ready
      ? "支付宝/微信支付回调在验签后会校验订单渠道、应用/商户号和金额，微信支付会解密 API v3 resource，再发放权益。"
      : "回调路由缺少订单渠道、应用/商户号、金额一致性校验或微信支付资源解密。",
    action: ready
      ? "保留业务字段校验；小额订单联调时核对金额、平台交易号和权益到账。"
      : "在 markPaid 前补齐 validateAlipayNotifyBusiness / validateWechatPayNotifyBusiness。",
  });
}

function validatePaymentPlanCallbackGuard(result) {
  const root = process.cwd();
  const paymentPlan = readProjectFile(root, "src/lib/launch-payment-plan.ts");
  const healthPage = readAdminHealthContent(root);
  const apiRoute = readProjectFile(root, "src/app/api/admin/launch/payment-plan/route.ts");
  const ready =
    paymentPlan.includes('"callback_guard"') &&
    paymentPlan.includes('stepId: "callback_guard"') &&
    paymentPlan.includes('title: "回调业务防护"') &&
    paymentPlan.includes("PAYMENT_CALLBACK_DEV_BYPASS") &&
    paymentPlan.includes("微信支付先解密 API v3 resource") &&
    paymentPlan.includes("launch:payment-check 回调安全检查通过") &&
    apiRoute.includes("getLaunchPaymentPlan") &&
    apiRoute.includes('cache-control": "no-store"') &&
    healthPage.includes("launchPaymentPlan");

  addCheck(result, {
    id: "payment-plan-callback-guard-step",
    group: "后台计划",
    label: "支付落地计划回调防护步骤",
    status: ready ? statuses.ready : statuses.blocking,
    detail: ready
      ? "后台支付落地计划会展示回调业务防护步骤，并把开发旁路作为阻断。"
      : "后台支付落地计划缺少 callback_guard 步骤、API 输出或健康页展示。",
    action: ready
      ? "保留该步骤；小额联调时把 launch:payment-check 输出归档为证据。"
      : "在 getLaunchPaymentPlan 中恢复 callback_guard，并确保 /admin/health 和 API 可见。",
  });
}

function paymentPlanApiUrl(baseUrl, env) {
  const url = new URL("/api/admin/launch/payment-plan", baseUrl);
  const adminToken = value(env, "ADMIN_ACCESS_TOKEN");

  if (adminToken && !isPlaceholder(adminToken)) {
    url.searchParams.set("token", adminToken);
  }

  return url;
}

async function validatePaymentPlanApi(result, input) {
  if (!input.baseUrl) {
    return;
  }

  try {
    const response = await fetch(paymentPlanApiUrl(input.baseUrl, input.env), {
      signal: AbortSignal.timeout(input.timeoutMs),
      headers: { accept: "application/json" },
    });
    const payload = await response.json().catch(() => null);
    const channels = Array.isArray(payload?.paymentPlan?.channels)
      ? payload.paymentPlan.channels
      : [];
    const missingChannels = channels
      .filter(
        (channel) =>
          !Array.isArray(channel.steps) ||
          !channel.steps.some((step) => step.stepId === "callback_guard"),
      )
      .map((channel) => channel.label ?? channel.id ?? "unknown");
    const ready = response.ok && payload?.ok === true && channels.length > 0 && missingChannels.length === 0;

    addCheck(result, {
      id: "payment-plan-api-callback-guard-step",
      group: "后台计划",
      label: "支付落地计划 API 回调防护",
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? `/api/admin/launch/payment-plan 返回 ${channels.length} 个渠道，均包含 callback_guard。`
        : `API 状态 ${response.status}，缺失渠道：${missingChannels.join("、") || "无法读取渠道步骤"}`,
      action: ready
        ? "保留运行时验收；上线前用正式后台 token 再跑一次。"
        : "检查后台访问 token、paymentPlan.channels 和 callback_guard 输出。",
    });
  } catch (error) {
    addCheck(result, {
      id: "payment-plan-api-callback-guard-step",
      group: "后台计划",
      label: "支付落地计划 API 回调防护",
      status: statuses.blocking,
      detail: readError(error),
      action: "确认应用已启动、base-url 可访问，并带上 ADMIN_ACCESS_TOKEN。",
    });
  }
}

async function runChecks(input) {
  const result = {
    ok: false,
    generatedAt: new Date().toISOString(),
    envFile: input.envFile,
    baseUrl: input.baseUrl,
    checks: [],
  };

  validateGlobalPayment(result, input.env);
  validateAppUrl(result, input.env);
  validateAlipay(result, input.env);
  validateWechatPay(result, input.env);
  validateReadyChannel(result, input.env);
  validateCallbackBusinessGuards(result);
  validatePaymentPlanCallbackGuard(result);
  await validatePaymentPlanApi(result, input);

  return summarize(result);
}

function statusIcon(status) {
  if (status === statuses.ready) {
    return "OK";
  }

  if (status === statuses.warning) {
    return "WARN";
  }

  return "BLOCK";
}

function printTextReport(result) {
  console.log(`真实支付上线检查 env=${result.envFile || "process.env"}`);
  console.log(`baseUrl=${result.baseUrl || "未启用运行时检查"}`);
  console.log(
    `summary ready=${result.summary.ready} warning=${result.summary.warning} blocking=${result.summary.blocking} total=${result.summary.total}`,
  );
  console.log("");

  for (const item of result.checks) {
    console.log(`[${statusIcon(item.status)}] ${item.group} / ${item.label}`);
    console.log(`  ${item.detail}`);
    console.log(`  ${item.action}`);
  }
}

const args = parseArgs(process.argv.slice(2));
let baseUrl;

try {
  baseUrl = normalizeBaseUrl(args.baseUrl);
} catch (error) {
  console.error(readError(error));
  process.exit(args.noFail ? 0 : 1);
}

if (!validateTimeoutMs(args.timeoutMs)) {
  console.error("--timeout-ms must be an integer between 1000 and 120000.");
  process.exit(args.noFail ? 0 : 1);
}

const envFile = args.envFile ?? pickDefaultEnvFile();
const cwd = process.cwd();
let fileEnv = {};

if (envFile) {
  const envPath = path.resolve(cwd, envFile);

  if (!existsSync(envPath)) {
    console.error(`Env file not found: ${envFile}`);
    process.exit(args.noFail ? 0 : 1);
  }

  fileEnv = parseEnvFile(envPath);
}

const env = { ...process.env, ...fileEnv };
const result = await runChecks({
  baseUrl,
  env,
  envFile,
  timeoutMs: args.timeoutMs,
});

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printTextReport(result);
}

if (!result.ok && !args.noFail) {
  process.exit(1);
}
