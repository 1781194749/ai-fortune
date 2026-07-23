#!/usr/bin/env node

import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const statuses = {
  ready: "ready",
  warning: "warning",
  blocking: "blocking",
};

const defaultEnvFiles = [".env.production.local", ".env.production"];
const defaultTimeoutMs = 8000;
const qiniuRequiredFields = [
  "QINIU_ACCESS_KEY",
  "QINIU_SECRET_KEY",
  "QINIU_BUCKET",
  "QINIU_PUBLIC_DOMAIN",
];
const openaiModelFields = [
  "OPENAI_DEFAULT_MODEL",
  "OPENAI_FAST_MODEL",
  "OPENAI_PREMIUM_MODEL",
  "OPENAI_VISION_MODEL",
];
const openaiCostRateFields = [
  "OPENAI_DEFAULT_INPUT_CENTS_PER_1M_TOKENS",
  "OPENAI_DEFAULT_OUTPUT_CENTS_PER_1M_TOKENS",
];
const uploadHosts = {
  z0: "https://upload-z0.qiniup.com",
  z1: "https://upload-z1.qiniup.com",
  z2: "https://upload-z2.qiniup.com",
  na0: "https://upload-na0.qiniup.com",
  as0: "https://upload-as0.qiniup.com",
};

function parseArgs(argv) {
  const args = {
    baseUrl: undefined,
    envFile: undefined,
    json: false,
    noFail: false,
    timeoutMs: defaultTimeoutMs,
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

    if (arg === "--timeout-ms") {
      args.timeoutMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--timeout-ms=")) {
      args.timeoutMs = Number(arg.slice("--timeout-ms=".length));
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

function validateTimeoutMs(value) {
  return Number.isInteger(value) && value >= 1000 && value <= 60000;
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

function value(env, key) {
  return env[key]?.trim() ?? "";
}

function hasRealValue(env, key) {
  return Boolean(value(env, key)) && !isPlaceholder(value(env, key));
}

function hasPositiveNumber(env, key) {
  const number = Number(value(env, key));

  return Number.isFinite(number) && number > 0;
}

function missingFields(env, keys) {
  return keys.filter((key) => !hasRealValue(env, key));
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeBaseUrl(rawValue) {
  return rawValue.trim().replace(/\/$/, "");
}

function normalizeRuntimeBaseUrl(rawValue) {
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

function readError(error) {
  if (error instanceof Error) {
    return error.message.split("\n").find((line) => line.trim()) ?? error.name;
  }

  return String(error);
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent": "xuanji-launch-ai-storage-check/1.0",
        ...(init?.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function addCheck(result, check) {
  result.checks.push(check);
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


function safeBase64(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function sanitizeFilename(filename) {
  return filename.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_").slice(0, 80) || "palm.jpg";
}

function qiniuUploadHost(region) {
  return uploadHosts[region ?? ""] ?? "https://upload.qiniup.com";
}

function createQiniuUploadToken(env) {
  const key = `diagnostics/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${sanitizeFilename("palm-diagnostics.jpg")}`;
  const deadline = Math.floor(Date.now() / 1000) + 60 * 60;
  const policy = {
    scope: `${value(env, "QINIU_BUCKET")}:${key}`,
    deadline,
    mimeLimit: "image/*",
    fsizeLimit: 1024,
    returnBody:
      '{"key":"$(key)","hash":"$(etag)","fsize":$(fsize),"mimeType":"$(mimeType)"}',
  };
  const encodedPolicy = safeBase64(JSON.stringify(policy));
  const encodedSign = safeBase64(
    createHmac("sha1", value(env, "QINIU_SECRET_KEY"))
      .update(encodedPolicy)
      .digest(),
  );
  const publicDomain = normalizeBaseUrl(value(env, "QINIU_PUBLIC_DOMAIN"));

  return {
    key,
    tokenLength: `${value(env, "QINIU_ACCESS_KEY")}:${encodedSign}:${encodedPolicy}`.length,
    uploadUrl: qiniuUploadHost(value(env, "QINIU_REGION")),
    publicUrl: `${publicDomain}/${key}`,
    expiresAt: new Date(deadline * 1000).toISOString(),
  };
}

async function checkOpenAI(result, env, timeoutMs) {
  const apiKeyReady = hasRealValue(env, "OPENAI_API_KEY");
  const missingModels = missingFields(env, openaiModelFields);
  const missingCostRates = openaiCostRateFields.filter((key) => !hasPositiveNumber(env, key));
  const baseURL = (value(env, "OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/+$/, "");
  const userAgent = value(env, "OPENAI_USER_AGENT") || "Xuanji-AI/1.0";
  const defaultModel = value(env, "OPENAI_DEFAULT_MODEL") || "gpt-5.4";
  const visionModel = value(env, "OPENAI_VISION_MODEL") || defaultModel;
  const modelsToProbe = unique([defaultModel, visionModel, value(env, "OPENAI_PREMIUM_MODEL")]);

  addCheck(result, {
    id: "openai-base-url",
    group: "OpenAI",
    label: "OpenAI API 地址",
    status: statuses.ready,
    detail: baseURL,
    action: "确认生产环境使用相同的 OPENAI_BASE_URL。",
  });
  addCheck(result, {
    id: "openai-api-key",
    group: "OpenAI",
    label: "OpenAI API Key",
    status: apiKeyReady ? statuses.ready : statuses.blocking,
    detail: apiKeyReady ? "已配置，未输出密钥。" : "未配置或仍是占位值。",
    action: apiKeyReady ? "继续检查模型读取权限。" : "配置 OPENAI_API_KEY，并设置项目预算和用量告警。",
  });
  addCheck(result, {
    id: "openai-model-vars",
    group: "OpenAI",
    label: "OpenAI 模型变量",
    status: missingModels.length === 0 ? statuses.ready : statuses.blocking,
    detail: missingModels.length === 0 ? "默认、低成本、高质量和视觉模型均已配置。" : `缺少 ${missingModels.join(", ")}`,
    action:
      missingModels.length === 0
        ? "继续确认这些模型可被当前 API Key 读取。"
        : "补齐 OPENAI_DEFAULT_MODEL、OPENAI_FAST_MODEL、OPENAI_PREMIUM_MODEL 和 OPENAI_VISION_MODEL。",
  });
  addCheck(result, {
    id: "openai-cost-rate-vars",
    group: "OpenAI",
    label: "OpenAI 成本费率变量",
    status: missingCostRates.length === 0 ? statuses.ready : statuses.warning,
    detail:
      missingCostRates.length === 0
        ? "已配置每百万 token 输入/输出成本，UsageLog costCents 可按生产费率估算。"
        : `缺少或不是正数：${missingCostRates.join(", ")}；当前会使用启动估算表。`,
    action:
      missingCostRates.length === 0
        ? "保留费率来源截图或账单链接，并在价格调整后同步更新。"
        : "从 OpenAI 当前账单费率填入人民币分/百万 token，用于单位经济和毛利复盘。",
  });

  if (!apiKeyReady || missingModels.length > 0) {
    return;
  }

  for (const model of modelsToProbe) {
    try {
      const response = await fetchWithTimeout(
        `${baseURL}/models/${encodeURIComponent(model)}`,
        {
          headers: {
            Authorization: `Bearer ${value(env, "OPENAI_API_KEY")}`,
            "User-Agent": userAgent,
          },
        },
        timeoutMs,
      );
      const ready = response.ok;

      addCheck(result, {
        id: `openai-model-${model}`,
        group: "OpenAI",
        label: `模型读取 ${model}`,
        status: ready ? statuses.ready : response.status === 404 ? statuses.warning : statuses.blocking,
        detail: ready ? "模型读取通过。" : `OpenAI 返回 HTTP ${response.status}。`,
        action: ready
          ? "保留模型读取验收结果，并继续做真实 AI 对话、手相视觉和深度报告样本。"
          : "确认模型名称、API Key 权限、项目额度和账号状态。",
      });
    } catch (error) {
      addCheck(result, {
        id: `openai-model-${model}`,
        group: "OpenAI",
        label: `模型读取 ${model}`,
        status: statuses.blocking,
        detail: readError(error),
        action: "检查服务器出站网络、API Key、模型名称和 OpenAI 账号状态后重试。",
      });
    }
  }
}

async function checkQiniu(result, env, timeoutMs) {
  const missing = missingFields(env, qiniuRequiredFields);
  const publicDomain = value(env, "QINIU_PUBLIC_DOMAIN");
  const publicDomainReady =
    hasRealValue(env, "QINIU_PUBLIC_DOMAIN") && normalizeBaseUrl(publicDomain).startsWith("https://");
  const deferredAction =
    "七牛云等待线上域名/资质时不阻断非支付版本上线；资质完成后补齐变量、CORS 和公开域名再复跑。";

  addCheck(result, {
    id: "qiniu-core-vars",
    group: "七牛",
    label: "七牛核心变量",
    status: missing.length === 0 ? statuses.ready : statuses.warning,
    detail: missing.length === 0 ? "AK/SK、bucket 和公开域名均已配置。" : `缺少 ${missing.join(", ")}`,
    action:
      missing.length === 0
        ? "继续生成上传 token 并检查上传域名。"
        : deferredAction,
  });
  addCheck(result, {
    id: "qiniu-public-domain",
    group: "七牛",
    label: "七牛公开域名",
    status: publicDomainReady ? statuses.ready : statuses.warning,
    detail: publicDomainReady ? normalizeBaseUrl(publicDomain) : "未配置 HTTPS 公开域名或仍是占位值。",
    action: publicDomainReady ? "确认该域名已配置 HTTPS 和 CORS。" : deferredAction,
  });

  if (missing.length > 0 || !publicDomainReady) {
    return;
  }

  const token = createQiniuUploadToken(env);

  addCheck(result, {
    id: "qiniu-upload-token",
    group: "七牛",
    label: "七牛上传 token",
    status: token.tokenLength > 80 ? statuses.ready : statuses.warning,
    detail: `已生成 token，长度 ${token.tokenLength}，有效期 ${token.expiresAt}。`,
    action:
      token.tokenLength > 80
        ? "不要保存 token 原文；继续检查上传域名和公开域名可达性。"
        : deferredAction,
  });

  try {
    const response = await fetchWithTimeout(token.uploadUrl, { method: "HEAD" }, timeoutMs);
    const ready = response.status < 500;

    addCheck(result, {
      id: "qiniu-upload-host",
      group: "七牛",
      label: "七牛上传域名",
      status: ready ? statuses.ready : statuses.warning,
      detail: `${token.uploadUrl} 返回 HTTP ${response.status}。`,
      action: ready ? "继续浏览器真实上传手相样图。" : deferredAction,
    });
  } catch (error) {
    addCheck(result, {
      id: "qiniu-upload-host",
      group: "七牛",
      label: "七牛上传域名",
      status: statuses.warning,
      detail: readError(error),
      action: deferredAction,
    });
  }

  try {
    const response = await fetchWithTimeout(normalizeBaseUrl(publicDomain), { method: "HEAD" }, timeoutMs);
    const reachable = response.status < 500;

    addCheck(result, {
      id: "qiniu-public-domain-reachable",
      group: "七牛",
      label: "七牛公开域名可达",
      status: reachable ? statuses.ready : statuses.warning,
      detail: `公开域名返回 HTTP ${response.status}。`,
      action: reachable ? "继续验证真实图片 URL 能被视觉模型读取。" : deferredAction,
    });
  } catch (error) {
    addCheck(result, {
      id: "qiniu-public-domain-reachable",
      group: "七牛",
      label: "七牛公开域名可达",
      status: statuses.warning,
      detail: readError(error),
      action: deferredAction,
    });
  }
}

function aiStoragePlanApiUrl(baseUrl, env) {
  const url = new URL("/api/admin/launch/ai-storage-plan", baseUrl);
  const adminToken = value(env, "ADMIN_ACCESS_TOKEN");

  if (adminToken && !isPlaceholder(adminToken)) {
    url.searchParams.set("token", adminToken);
  }

  return url;
}

function validateAiStoragePlanWiring(result) {
  const root = process.cwd();
  const aiStoragePlan = readProjectFile(root, "src/lib/launch-ai-storage-plan.ts");
  const apiRoute = readProjectFile(root, "src/app/api/admin/launch/ai-storage-plan/route.ts");
  const healthPage = readAdminHealthContent(root);
  const evidenceForm = readProjectFile(
    root,
    "src/app/admin/launch-ai-storage-acceptance-evidence-form.tsx",
  );
  const requiredStepIds = [
    "openai_application",
    "openai_env",
    "openai_cost_rates",
    "openai_diagnostics",
    "qiniu_application",
    "qiniu_env",
    "qiniu_callbacks",
    "palm_vision",
    "deep_report",
    "cost_sample",
  ];
  const missingStepIds = requiredStepIds.filter(
    (stepId) => !aiStoragePlan.includes(`id: "${stepId}"`),
  );
  const ready =
    missingStepIds.length === 0 &&
    aiStoragePlan.includes("buildCommandGroups") &&
    aiStoragePlan.includes("npm run launch:ai-storage-check") &&
    aiStoragePlan.includes("POST /api/storage/qiniu/upload-token") &&
    aiStoragePlan.includes("GET /api/admin/launch/unit-economics") &&
    apiRoute.includes("getLaunchAiStoragePlan") &&
    apiRoute.includes("saveLaunchAiStorageAcceptanceEvidence") &&
    apiRoute.includes('cache-control": "no-store"') &&
    healthPage.includes("launchAiStoragePlan") &&
    healthPage.includes("AdminLaunchAiStorageAcceptanceEvidenceForm") &&
    evidenceForm.includes("openai_cost_rates") &&
    evidenceForm.includes("costSampleUrl");

  addCheck(result, {
    id: "ai-storage-plan-wiring",
    group: "后台计划",
    label: "AI/图片落地计划",
    status: ready ? statuses.ready : statuses.blocking,
    detail: ready
      ? "后台 AI/图片落地计划包含 OpenAI、七牛、手相视觉、深度报告和成本样本步骤，并支持证据快填。"
      : `AI/图片落地计划 wiring 不完整；缺失步骤：${missingStepIds.join(", ") || "未知"}`,
    action: ready
      ? "保留该计划；生产 OpenAI/七牛配置后按命令顺序逐项留证。"
      : "恢复 getLaunchAiStoragePlan、只读 API、后台展示和 AI/图片验收证据快填。",
  });
}

async function validateAiStoragePlanApi(result, input) {
  if (!input.baseUrl) {
    return;
  }

  try {
    const response = await fetchWithTimeout(
      aiStoragePlanApiUrl(input.baseUrl, input.env),
      { headers: { accept: "application/json" } },
      input.timeoutMs,
    );
    const payload = await response.json().catch(() => null);
    const steps = Array.isArray(payload?.aiStoragePlan?.steps) ? payload.aiStoragePlan.steps : [];
    const stepIds = steps.map((step) => step.id);
    const requiredStepIds = [
      "openai_application",
      "openai_env",
      "openai_cost_rates",
      "openai_diagnostics",
      "qiniu_application",
      "qiniu_env",
      "qiniu_callbacks",
      "palm_vision",
      "deep_report",
      "cost_sample",
    ];
    const missingStepIds = requiredStepIds.filter((stepId) => !stepIds.includes(stepId));
    const commandGroups = Array.isArray(payload?.aiStoragePlan?.commandGroups)
      ? payload.aiStoragePlan.commandGroups
      : [];
    const hasCheckCommand = commandGroups.some((group) =>
      Array.isArray(group.commands)
        ? group.commands.some((command) => command.command?.includes("launch:ai-storage-check"))
        : false,
    );
    const ready =
      response.ok &&
      payload?.ok === true &&
      missingStepIds.length === 0 &&
      commandGroups.length > 0 &&
      hasCheckCommand;

    addCheck(result, {
      id: "ai-storage-plan-api",
      group: "后台计划",
      label: "AI/图片落地计划 API",
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? `/api/admin/launch/ai-storage-plan 返回 ${steps.length} 个步骤和 ${commandGroups.length} 个命令组。`
        : `API 状态 ${response.status}；缺失步骤：${missingStepIds.join(", ") || "无"}；检查命令：${hasCheckCommand ? "有" : "无"}`,
      action: ready
        ? "保留运行时验收；上线前用正式后台 token 和正式 APP_URL 再跑一次。"
        : "检查后台访问 token、aiStoragePlan.steps 和 commandGroups 输出。",
    });
  } catch (error) {
    addCheck(result, {
      id: "ai-storage-plan-api",
      group: "后台计划",
      label: "AI/图片落地计划 API",
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

  await checkOpenAI(result, input.env, input.timeoutMs);
  await checkQiniu(result, input.env, input.timeoutMs);
  validateAiStoragePlanWiring(result);
  await validateAiStoragePlanApi(result, input);

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
  console.log(`AI 与七牛上线检查 env=${result.envFile || "process.env"}`);
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
  baseUrl = normalizeRuntimeBaseUrl(args.baseUrl);
} catch (error) {
  console.error(readError(error));
  process.exit(args.noFail ? 0 : 1);
}

if (!validateTimeoutMs(args.timeoutMs)) {
  console.error("--timeout-ms must be an integer between 1000 and 60000.");
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
