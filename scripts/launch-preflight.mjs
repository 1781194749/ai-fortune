#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const statuses = {
  ready: "ready",
  warning: "warning",
  blocking: "blocking",
};

const defaultEnvFiles = [".env.production.local", ".env.production"];

function parseArgs(argv) {
  const args = {
    envFile: undefined,
    json: false,
    noFail: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

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

    if (arg === "--no-fail") {
      args.noFail = true;
    }
  }

  return args;
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

function present(env, key) {
  return Boolean(env[key]?.trim());
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
  return present(env, key) && !isPlaceholder(value(env, key));
}

function allReal(env, keys) {
  return keys.every((key) => hasRealValue(env, key));
}

function isLocalUrl(rawValue) {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(rawValue);
}

function check(input) {
  return input;
}

function buildChecks(env) {
  const alipayFields = ["ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY", "ALIPAY_PUBLIC_KEY"];
  const wechatPayFields = [
    "WECHAT_APP_ID",
    "WECHAT_PAY_MCH_ID",
    "WECHAT_PAY_API_V3_KEY",
    "WECHAT_PAY_PRIVATE_KEY",
    "WECHAT_PAY_SERIAL_NO",
    "WECHAT_PAY_PLATFORM_PUBLIC_KEY",
  ];
  const qiniuFields = [
    "QINIU_ACCESS_KEY",
    "QINIU_SECRET_KEY",
    "QINIU_BUCKET",
    "QINIU_PUBLIC_DOMAIN",
  ];
  const appUrl = value(env, "APP_URL");
  const paymentProvider = value(env, "PAYMENT_PROVIDER") || "mock";
  const alipayReady = value(env, "ALIPAY_ENABLED") === "true" && allReal(env, alipayFields);
  const wechatPayReady =
    value(env, "WECHAT_PAY_ENABLED") === "true" && allReal(env, wechatPayFields);
  const livePaymentReady = paymentProvider === "live" && (alipayReady || wechatPayReady);
  const livePaymentSmokeAllowlistReady =
    hasRealValue(env, "LIVE_PAYMENT_SMOKE_TEST_USER_IDS") ||
    hasRealValue(env, "LIVE_PAYMENT_SMOKE_TEST_EMAILS");
  const loginReady =
    value(env, "AUTH_EMAIL_ENABLED") === "true" || value(env, "AUTH_WECHAT_ENABLED") === "true";

  return [
    check({
      id: "app-url",
      group: "基础配置",
      label: "APP_URL",
      status:
        hasRealValue(env, "APP_URL") && appUrl.startsWith("https://") && !isLocalUrl(appUrl)
          ? statuses.ready
          : statuses.blocking,
      detail: appUrl || "未配置",
      action: "配置正式 HTTPS 域名，用于支付回调、邮件链接和公开分享。",
    }),
    check({
      id: "database",
      group: "基础配置",
      label: "DATABASE_URL",
      status: hasRealValue(env, "DATABASE_URL") ? statuses.ready : statuses.blocking,
      detail: hasRealValue(env, "DATABASE_URL") ? "已填写" : "未填写或仍是占位值",
      action: "填写生产 PostgreSQL 连接串，并完成 Prisma 迁移。",
    }),
    check({
      id: "auth-secret",
      group: "基础配置",
      label: "AUTH_SESSION_SECRET",
      status:
        hasRealValue(env, "AUTH_SESSION_SECRET") && value(env, "AUTH_SESSION_SECRET").length >= 32
          ? statuses.ready
          : statuses.blocking,
      detail: hasRealValue(env, "AUTH_SESSION_SECRET")
        ? `${value(env, "AUTH_SESSION_SECRET").length} 字符`
        : "未填写或仍是占位值",
      action: "使用至少 32 字符的高强度随机密钥。",
    }),
    check({
      id: "admin",
      group: "基础配置",
      label: "后台访问保护",
      status:
        value(env, "ADMIN_DASHBOARD_ENABLED") === "true" &&
        hasRealValue(env, "ADMIN_ACCESS_TOKEN") &&
        value(env, "ADMIN_ACCESS_TOKEN").length >= 32
          ? statuses.ready
          : statuses.blocking,
      detail:
        value(env, "ADMIN_DASHBOARD_ENABLED") === "true"
          ? "后台开关已开启"
          : "ADMIN_DASHBOARD_ENABLED 未开启",
      action: "生产环境开启后台并配置至少 32 字符的 ADMIN_ACCESS_TOKEN。",
    }),
    check({
      id: "dev-bypass",
      group: "基础配置",
      label: "支付回调开发旁路",
      status: value(env, "PAYMENT_CALLBACK_DEV_BYPASS") === "true" ? statuses.blocking : statuses.ready,
      detail: `PAYMENT_CALLBACK_DEV_BYPASS=${value(env, "PAYMENT_CALLBACK_DEV_BYPASS") || "false"}`,
      action: "生产环境必须保持 PAYMENT_CALLBACK_DEV_BYPASS=false。",
    }),
    check({
      id: "login",
      group: "登录",
      label: "至少一个登录方式",
      status: loginReady ? statuses.ready : statuses.blocking,
      detail: loginReady ? "登录入口已开启" : "邮箱和微信登录都未开启",
      action: "第一版至少保持 AUTH_EMAIL_ENABLED=true；微信扫码可在资质完成后开启。",
    }),
    check({
      id: "wechat-login",
      group: "登录",
      label: "微信扫码登录",
      status:
        value(env, "AUTH_WECHAT_ENABLED") === "true"
          ? hasRealValue(env, "WECHAT_APP_ID") && hasRealValue(env, "WECHAT_APP_SECRET")
            ? statuses.ready
            : statuses.blocking
          : statuses.warning,
      detail:
        value(env, "AUTH_WECHAT_ENABLED") === "true"
          ? "已开启"
          : "未开启，第一版可先使用邮箱登录",
      action: "微信开放平台就绪后再开启 AUTH_WECHAT_ENABLED=true。",
    }),
    check({
      id: "openai",
      group: "AI 能力",
      label: "OpenAI API Key",
      status: hasRealValue(env, "OPENAI_API_KEY") ? statuses.ready : statuses.warning,
      detail: hasRealValue(env, "OPENAI_API_KEY") ? "已填写" : "未填写或仍是占位值",
      action: "真实收费前建议完成模型读取诊断，避免 AI 能力降级。",
    }),
    check({
      id: "openai-models",
      group: "AI 能力",
      label: "模型配置",
      status:
        hasRealValue(env, "OPENAI_DEFAULT_MODEL") && hasRealValue(env, "OPENAI_VISION_MODEL")
          ? statuses.ready
          : statuses.warning,
      detail: `default=${value(env, "OPENAI_DEFAULT_MODEL") || "未配置"}, vision=${
        value(env, "OPENAI_VISION_MODEL") || "未配置"
      }`,
      action: "为对话、深度报告和手相视觉配置明确模型。",
    }),
    check({
      id: "qiniu",
      group: "图片存储",
      label: "七牛云",
      status: allReal(env, qiniuFields) ? statuses.ready : statuses.warning,
      detail: allReal(env, qiniuFields)
        ? "核心字段已填写"
        : `缺少 ${qiniuFields.filter((key) => !hasRealValue(env, key)).join(", ")}`,
      action: "补齐 AK/SK、bucket、公开域名和跨域规则后跑第三方诊断。",
    }),
    check({
      id: "payment-mode",
      group: "支付",
      label: "支付模式",
      status: paymentProvider === "live" ? statuses.ready : statuses.blocking,
      detail: `PAYMENT_PROVIDER=${paymentProvider}`,
      action: "正式收费必须切换 PAYMENT_PROVIDER=live。",
    }),
    check({
      id: "payment-smoke-allowlist",
      group: "支付",
      label: "真实支付灰度白名单",
      status: livePaymentSmokeAllowlistReady ? statuses.ready : statuses.warning,
      detail: livePaymentSmokeAllowlistReady
        ? "已配置内部小额订单测试账号"
        : "未配置 LIVE_PAYMENT_SMOKE_TEST_USER_IDS 或 LIVE_PAYMENT_SMOKE_TEST_EMAILS",
      action: "进入 paid_smoke 前配置内部测试账号，release_ready 前保留小额订单验证证据。",
    }),
    check({
      id: "payment-channel",
      group: "支付",
      label: "真实支付渠道",
      status: livePaymentReady ? statuses.ready : statuses.blocking,
      detail: livePaymentReady
        ? [alipayReady ? "支付宝已就绪" : undefined, wechatPayReady ? "微信支付已就绪" : undefined]
            .filter(Boolean)
            .join("，")
        : "支付宝和微信支付都未完整就绪",
      action: "至少完成一个渠道的商户参数、签名诊断和小额订单验收。",
    }),
    check({
      id: "alipay",
      group: "支付",
      label: "支付宝",
      status:
        value(env, "ALIPAY_ENABLED") === "true"
          ? alipayReady
            ? statuses.ready
            : statuses.blocking
          : statuses.warning,
      detail:
        value(env, "ALIPAY_ENABLED") === "true"
          ? alipayReady
            ? "已开启并填写核心参数"
            : `缺少 ${alipayFields.filter((key) => !hasRealValue(env, key)).join(", ")}`
          : "未开启",
      action: "主体应用通过后填写支付宝 APP_ID、公私钥。",
    }),
    check({
      id: "wechat-pay",
      group: "支付",
      label: "微信支付",
      status:
        value(env, "WECHAT_PAY_ENABLED") === "true"
          ? wechatPayReady
            ? statuses.ready
            : statuses.blocking
          : statuses.warning,
      detail:
        value(env, "WECHAT_PAY_ENABLED") === "true"
          ? wechatPayReady
            ? "已开启并填写核心参数"
            : `缺少 ${wechatPayFields.filter((key) => !hasRealValue(env, key)).join(", ")}`
          : "未开启",
      action: "主体商户号通过后填写 mch_id、API v3 key、私钥、序列号和平台公钥。",
    }),
    check({
      id: "compliance",
      group: "合规",
      label: "主体与 ICP",
      status:
        hasRealValue(env, "COMPANY_NAME") && hasRealValue(env, "ICP_RECORD_NO")
          ? statuses.ready
          : statuses.warning,
      detail:
        hasRealValue(env, "COMPANY_NAME") && hasRealValue(env, "ICP_RECORD_NO")
          ? "主体和备案号已填写"
          : "主体或 ICP 仍未填写",
      action: "国内正式上线前完成主体、域名备案，并让协议页主体保持一致。",
    }),
  ];
}

function summarize(checks) {
  return {
    ready: checks.filter((item) => item.status === statuses.ready).length,
    warning: checks.filter((item) => item.status === statuses.warning).length,
    blocking: checks.filter((item) => item.status === statuses.blocking).length,
    total: checks.length,
  };
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

function printTextReport(input) {
  console.log(`上线预检 env=${input.envFile || "process.env"}`);
  console.log(
    `summary ready=${input.summary.ready} warning=${input.summary.warning} blocking=${input.summary.blocking} total=${input.summary.total}`,
  );
  console.log("");

  for (const item of input.checks) {
    console.log(`[${statusIcon(item.status)}] ${item.group} / ${item.label}`);
    console.log(`  ${item.detail}`);
    console.log(`  ${item.action}`);
  }
}

const args = parseArgs(process.argv.slice(2));
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
const checks = buildChecks(env);
const summary = summarize(checks);
const result = {
  ok: summary.blocking === 0,
  envFile,
  summary,
  checks,
};

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printTextReport(result);
}

if (summary.blocking > 0 && !args.noFail) {
  process.exit(1);
}
