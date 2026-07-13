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
const defaultTimeoutMs = 8000;

function parseArgs(argv) {
  const args = {
    baseUrl: undefined,
    envFile: undefined,
    json: false,
    noFail: false,
    allowLocal: false,
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
      continue;
    }

    if (arg === "--allow-local") {
      args.allowLocal = true;
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

function normalizeBaseUrl(value) {
  return value.trim().replace(/\/$/, "");
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

function isLocalHost(hostname) {
  return /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)$/i.test(hostname);
}

function isSuccessStatus(status, acceptedStatuses) {
  return acceptedStatuses.some((expected) =>
    typeof expected === "number"
      ? status === expected
      : status >= expected[0] && status <= expected[1],
  );
}

function validateTimeoutMs(value) {
  return Number.isInteger(value) && value >= 1000 && value <= 60000;
}

function appendToken(route, token) {
  if (!token || isPlaceholder(token)) {
    return route;
  }

  const separator = route.includes("?") ? "&" : "?";
  return `${route}${separator}token=${encodeURIComponent(token)}`;
}

function readProjectFile(root, filename) {
  const absolutePath = path.resolve(root, filename);

  if (!existsSync(absolutePath)) {
    return "";
  }

  return readFileSync(absolutePath, "utf8");
}

function buildTargets(env) {
  const adminToken = env.ADMIN_ACCESS_TOKEN?.trim() ?? "";

  return [
    {
      id: "home",
      label: "首页",
      method: "GET",
      route: "/",
      required: true,
      acceptedStatuses: [200],
    },
    {
      id: "login",
      label: "登录页",
      method: "GET",
      route: "/login",
      required: true,
      acceptedStatuses: [200],
    },
    {
      id: "legal-terms",
      label: "用户协议",
      method: "GET",
      route: "/legal/terms",
      required: true,
      acceptedStatuses: [200],
    },
    {
      id: "legal-privacy",
      label: "隐私政策",
      method: "GET",
      route: "/legal/privacy",
      required: true,
      acceptedStatuses: [200],
    },
    {
      id: "legal-disclaimer",
      label: "免责声明",
      method: "GET",
      route: "/legal/disclaimer",
      required: true,
      acceptedStatuses: [200],
    },
    {
      id: "legal-upload-consent",
      label: "图片上传授权",
      method: "GET",
      route: "/legal/upload-consent",
      required: true,
      acceptedStatuses: [200],
    },
    {
      id: "member",
      label: "会员页登录保护",
      method: "GET",
      route: "/member",
      required: true,
      acceptedStatuses: [200, 307, 308],
    },
    {
      id: "admin-health",
      label: "后台健康页",
      method: "GET",
      route: appendToken("/admin/health", adminToken),
      required: Boolean(adminToken && !isPlaceholder(adminToken)),
      acceptedStatuses: [200],
    },
    {
      id: "alipay-notify",
      label: "支付宝异步通知地址",
      method: "OPTIONS",
      route: "/api/payments/alipay/notify",
      required: true,
      acceptedStatuses: [[200, 299], 405],
    },
    {
      id: "wechat-notify",
      label: "微信支付通知地址",
      method: "OPTIONS",
      route: "/api/payments/wechat/notify",
      required: true,
      acceptedStatuses: [[200, 299], 405],
    },
    {
      id: "qiniu-upload-token",
      label: "七牛上传凭证接口",
      method: "OPTIONS",
      route: "/api/storage/qiniu/upload-token",
      required: true,
      acceptedStatuses: [[200, 299], 405],
    },
  ];
}

function createResult(input) {
  return {
    ok: false,
    generatedAt: new Date().toISOString(),
    envFile: input.envFile,
    appUrl: input.appUrl,
    baseUrl: input.baseUrl,
    checks: [],
    targets: [],
  };
}

function addCheck(result, check) {
  result.checks.push(check);
}

function summarize(result) {
  const blockingChecks = result.checks.filter((item) => item.status === statuses.blocking).length;
  const blockingTargets = result.targets.filter((item) => item.status === statuses.blocking).length;
  const warningChecks = result.checks.filter((item) => item.status === statuses.warning).length;
  const warningTargets = result.targets.filter((item) => item.status === statuses.warning).length;
  const readyChecks = result.checks.filter((item) => item.status === statuses.ready).length;
  const readyTargets = result.targets.filter((item) => item.status === statuses.ready).length;

  result.summary = {
    ready: readyChecks + readyTargets,
    warning: warningChecks + warningTargets,
    blocking: blockingChecks + blockingTargets,
    total: result.checks.length + result.targets.length,
  };
  result.ok = result.summary.blocking === 0;

  return result;
}

async function fetchTarget(input) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await fetch(input.url, {
      method: input.target.method,
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "user-agent": "xuanji-launch-url-check/1.0",
      },
    });
    const ok = isSuccessStatus(response.status, input.target.acceptedStatuses);

    return {
      id: input.target.id,
      label: input.target.label,
      method: input.target.method,
      route: input.target.route,
      url: input.url,
      required: input.target.required,
      status: ok ? statuses.ready : input.target.required ? statuses.blocking : statuses.warning,
      httpStatus: response.status,
      detail: ok ? "访问符合预期。" : `返回 HTTP ${response.status}，不符合预期。`,
      action: ok
        ? "保留该路径验收结果。"
        : "检查部署域名、路由、鉴权 token、回调路径或反向代理配置后重试。",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fetch error";

    return {
      id: input.target.id,
      label: input.target.label,
      method: input.target.method,
      route: input.target.route,
      url: input.url,
      required: input.target.required,
      status: input.target.required ? statuses.blocking : statuses.warning,
      httpStatus: 0,
      detail: message,
      action: "检查 DNS、HTTPS 证书、部署服务、防火墙和公网访问后重试。",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runUrlCheck(input) {
  const rawAppUrl = input.env.APP_URL?.trim() ?? "";
  const appUrl = rawAppUrl ? normalizeBaseUrl(rawAppUrl) : "";
  const result = createResult({ envFile: input.envFile, appUrl, baseUrl: input.baseUrl });

  if (!appUrl || isPlaceholder(appUrl)) {
    addCheck(result, {
      id: "app-url",
      label: "APP_URL",
      status: statuses.blocking,
      detail: appUrl ? "仍是占位值" : "未配置",
      action: "配置正式 HTTPS 域名，再运行 npm run launch:url-check。",
    });
    return summarize(result);
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(appUrl);
  } catch {
    addCheck(result, {
      id: "app-url-format",
      label: "APP_URL 格式",
      status: statuses.blocking,
      detail: "APP_URL 不是有效 URL。",
      action: "使用 https://your-domain.com 格式。",
    });
    return summarize(result);
  }

  const httpsReady = parsedUrl.protocol === "https:" || (input.allowLocal && parsedUrl.protocol === "http:");
  const local = isLocalHost(parsedUrl.hostname);

  addCheck(result, {
    id: "app-url-https",
    label: "HTTPS 域名",
    status: httpsReady ? statuses.ready : statuses.blocking,
    detail: parsedUrl.protocol,
    action: httpsReady ? "保留 HTTPS 配置。" : "正式收费站点必须使用 HTTPS APP_URL。",
  });
  addCheck(result, {
    id: "app-url-local",
    label: "公网域名",
    status: local && !input.allowLocal ? statuses.blocking : local ? statuses.warning : statuses.ready,
    detail: local ? "当前是本地地址" : parsedUrl.hostname,
    action:
      local && !input.allowLocal
        ? "生产上线不能使用 localhost；如只是本地自测请加 --allow-local。"
        : "确认该域名已经完成 DNS、HTTPS 和部署平台绑定。",
  });

  if (!httpsReady || (local && !input.allowLocal)) {
    return summarize(result);
  }

  const targets = buildTargets(input.env);
  result.targets = await Promise.all(
    targets.map((target) =>
      fetchTarget({
        target,
        url: `${appUrl}${target.route}`,
        timeoutMs: input.timeoutMs,
      }),
    ),
  );

  return summarize(result);
}

function deploymentPlanApiUrl(baseUrl, env) {
  const url = new URL("/api/admin/launch/deployment-plan", baseUrl);
  const adminToken = env.ADMIN_ACCESS_TOKEN?.trim() ?? "";

  if (adminToken && !isPlaceholder(adminToken)) {
    url.searchParams.set("token", adminToken);
  }

  return url;
}

function validateDeploymentPlanWiring(result) {
  const root = process.cwd();
  const deploymentPlan = readProjectFile(root, "src/lib/launch-deployment-plan.ts");
  const apiRoute = readProjectFile(root, "src/app/api/admin/launch/deployment-plan/route.ts");
  const healthPage = readProjectFile(root, "src/app/admin/health/page.tsx");
  const evidenceForm = readProjectFile(
    root,
    "src/app/admin/launch-deployment-acceptance-evidence-form.tsx",
  );
  const requiredStepIds = [
    "domain_dns",
    "https_app_url",
    "deploy_env",
    "admin_security",
    "session_secret",
    "public_callbacks",
    "preflight",
    "page_smoke",
    "restart_rollback",
  ];
  const missingStepIds = requiredStepIds.filter(
    (stepId) => !deploymentPlan.includes(`id: "${stepId}"`),
  );
  const ready =
    missingStepIds.length === 0 &&
    deploymentPlan.includes("commandGroups") &&
    deploymentPlan.includes("npm run launch:url-check") &&
    deploymentPlan.includes("npm run launch:preflight") &&
    deploymentPlan.includes("ADMIN_ACCESS_TOKEN") &&
    deploymentPlan.includes("public_callbacks") &&
    apiRoute.includes("getLaunchDeploymentPlan") &&
    apiRoute.includes("saveLaunchDeploymentAcceptanceEvidence") &&
    apiRoute.includes('cache-control": "no-store"') &&
    healthPage.includes("launchDeploymentPlan") &&
    healthPage.includes("AdminLaunchDeploymentAcceptanceEvidenceForm") &&
    evidenceForm.includes("urlCheckUrl") &&
    evidenceForm.includes("rollbackUrl");

  addCheck(result, {
    id: "deployment-plan-wiring",
    label: "后台域名与部署落地计划",
    status: ready ? statuses.ready : statuses.blocking,
    detail: ready
      ? "后台部署计划包含域名、APP_URL、变量、后台保护、回调、预检、页面烟测和回滚步骤，并支持证据快填。"
      : `域名与部署计划 wiring 不完整；缺失步骤：${missingStepIds.join(", ") || "未知"}`,
    action: ready
      ? "保留该计划；正式域名部署后按命令顺序逐项留证。"
      : "恢复 getLaunchDeploymentPlan、只读 API、后台展示和部署验收证据快填。",
  });
}

async function validateDeploymentPlanApi(result, input) {
  if (!input.baseUrl) {
    return;
  }

  try {
    const target = {
      id: "deployment-plan-api",
      label: "域名与部署计划 API",
      method: "GET",
      route: "/api/admin/launch/deployment-plan",
      required: true,
      acceptedStatuses: [200],
    };
    const response = await fetchTarget({
      target,
      url: deploymentPlanApiUrl(input.baseUrl, input.env).toString(),
      timeoutMs: input.timeoutMs,
    });

    if (response.status !== statuses.ready) {
      addCheck(result, {
        id: "deployment-plan-api",
        label: "域名与部署计划 API",
        status: response.status,
        detail: response.detail,
        action: response.action,
      });
      return;
    }

    const payloadResponse = await fetch(deploymentPlanApiUrl(input.baseUrl, input.env), {
      headers: {
        accept: "application/json",
        "user-agent": "xuanji-launch-url-check/1.0",
      },
      signal: AbortSignal.timeout(input.timeoutMs),
    });
    const payload = await payloadResponse.json().catch(() => null);
    const steps = Array.isArray(payload?.deploymentPlan?.steps)
      ? payload.deploymentPlan.steps
      : [];
    const stepIds = steps.map((step) => step.id);
    const requiredStepIds = [
      "domain_dns",
      "https_app_url",
      "deploy_env",
      "admin_security",
      "session_secret",
      "public_callbacks",
      "preflight",
      "page_smoke",
      "restart_rollback",
    ];
    const missingStepIds = requiredStepIds.filter((stepId) => !stepIds.includes(stepId));
    const commandGroups = Array.isArray(payload?.deploymentPlan?.commandGroups)
      ? payload.deploymentPlan.commandGroups
      : [];
    const hasUrlCheckCommand = commandGroups.some((group) =>
      Array.isArray(group.commands)
        ? group.commands.some((command) => command.command?.includes("launch:url-check"))
        : false,
    );
    const ready =
      payloadResponse.ok &&
      payload?.ok === true &&
      missingStepIds.length === 0 &&
      commandGroups.length > 0 &&
      hasUrlCheckCommand;

    addCheck(result, {
      id: "deployment-plan-api",
      label: "域名与部署计划 API",
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? `/api/admin/launch/deployment-plan 返回 ${steps.length} 个步骤和 ${commandGroups.length} 个命令组。`
        : `API 状态 ${payloadResponse.status}；缺失步骤：${missingStepIds.join(", ") || "无"}；URL 检查命令：${hasUrlCheckCommand ? "有" : "无"}`,
      action: ready
        ? "保留运行时验收；上线前用正式后台 token 和正式 APP_URL 再跑一次。"
        : "检查后台访问 token、deploymentPlan.steps 和 commandGroups 输出。",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown runtime check error";

    addCheck(result, {
      id: "deployment-plan-api",
      label: "域名与部署计划 API",
      status: statuses.blocking,
      detail: message,
      action: "确认应用已启动、base-url 可访问，并带上 ADMIN_ACCESS_TOKEN。",
    });
  }
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
  console.log(`公网 URL 验收 env=${result.envFile || "process.env"}`);
  console.log(`baseUrl=${result.baseUrl || "未启用运行时部署计划检查"}`);
  console.log(
    `summary ready=${result.summary.ready} warning=${result.summary.warning} blocking=${result.summary.blocking} total=${result.summary.total}`,
  );
  console.log(`APP_URL=${result.appUrl || "未配置"}`);
  console.log("");

  for (const item of result.checks) {
    console.log(`[${statusIcon(item.status)}] ${item.label}`);
    console.log(`  ${item.detail}`);
    console.log(`  ${item.action}`);
  }

  if (result.targets.length > 0) {
    console.log("");
  }

  for (const item of result.targets) {
    console.log(`[${statusIcon(item.status)}] ${item.method} ${item.label}`);
    console.log(`  ${item.url}`);
    console.log(`  ${item.detail}`);
    console.log(`  ${item.action}`);
  }
}

const args = parseArgs(process.argv.slice(2));
let baseUrl;

try {
  baseUrl = normalizeRuntimeBaseUrl(args.baseUrl);
} catch (error) {
  const message = error instanceof Error ? error.message : "Invalid base-url.";

  console.error(message);
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
const result = await runUrlCheck({
  baseUrl,
  env,
  envFile,
  allowLocal: args.allowLocal,
  timeoutMs: args.timeoutMs,
});
validateDeploymentPlanWiring(result);
await validateDeploymentPlanApi(result, {
  baseUrl,
  env,
  timeoutMs: args.timeoutMs,
});
summarize(result);

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printTextReport(result);
}

if (!result.ok && !args.noFail) {
  process.exit(1);
}
