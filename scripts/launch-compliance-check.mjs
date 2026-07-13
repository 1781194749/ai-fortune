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
const requiredFiles = [
  "src/lib/legal.ts",
  "src/app/legal/[slug]/page.tsx",
  "src/lib/launch-compliance.ts",
  "src/lib/launch-compliance-plan.ts",
  "src/app/api/admin/launch/compliance/route.ts",
  "src/app/api/admin/launch/compliance-plan/route.ts",
  "src/app/admin/health/page.tsx",
];
const requiredLegalSlugs = ["terms", "privacy", "disclaimer", "upload-consent"];
const requiredLegalKeywords = [
  "支付宝",
  "微信支付",
  "七牛",
  "OpenAI",
  "退款",
  "客服",
  "异常订单",
  "娱乐",
  "医疗",
  "投资",
  "法律",
  "合法授权",
  "删除",
];
const complianceItemIds = [
  "legal:documents",
  "legal:entity",
  "legal:icp",
  "legal:links",
  "legal:content-boundary",
  "legal:privacy-suppliers",
  "legal:upload-consent",
  "legal:external-review",
];
const compliancePlanStepIds = [
  "entity_path",
  "domain_icp",
  "agreement_subject",
  "payment_subjects",
  "legal_documents",
  "privacy_suppliers",
  "image_consent",
  "refund_boundary",
  "legal_review_archive",
];

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

function validateTimeoutMs(valueToValidate) {
  return Number.isInteger(valueToValidate) && valueToValidate >= 1000 && valueToValidate <= 60000;
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

function readProjectFile(root, filename) {
  const absolutePath = path.resolve(root, filename);

  if (!existsSync(absolutePath)) {
    return "";
  }

  return readFileSync(absolutePath, "utf8");
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
        "user-agent": "xuanji-launch-compliance-check/1.0",
        ...(init?.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function adminUrl(baseUrl, route, env) {
  const url = new URL(route, baseUrl);
  const adminToken = value(env, "ADMIN_ACCESS_TOKEN");

  if (adminToken && !isPlaceholder(adminToken)) {
    url.searchParams.set("token", adminToken);
  }

  return url;
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

function checkFileInventory(result) {
  const root = process.cwd();
  const missing = requiredFiles.filter((filename) => !existsSync(path.resolve(root, filename)));

  addCheck(result, {
    id: "compliance-files",
    group: "本地文件",
    label: "合规文件清单",
    status: missing.length === 0 ? statuses.ready : statuses.blocking,
    detail: missing.length === 0 ? "协议、合规核对、合规计划、API 和后台页面文件均存在。" : `缺少 ${missing.join(", ")}`,
    action:
      missing.length === 0
        ? "保留这些文件；后续只更新真实主体、备案和供应商口径。"
        : "恢复合规文件、协议页、后台 API 和后台展示。",
  });
}

function checkSubjectEnv(result, env) {
  const companyNameReady = hasRealValue(env, "COMPANY_NAME");
  const icpReady = hasRealValue(env, "ICP_RECORD_NO");
  const appUrl = value(env, "APP_URL");
  let appUrlStatus = statuses.warning;
  let appUrlDetail = appUrl ? "APP_URL 仍未确认是正式 HTTPS 域名。" : "APP_URL 未配置，正式协议链接暂不可生成。";

  if (appUrl && !isPlaceholder(appUrl)) {
    try {
      const parsed = new URL(appUrl);
      appUrlStatus = parsed.protocol === "https:" ? statuses.ready : statuses.warning;
      appUrlDetail =
        parsed.protocol === "https:"
          ? `正式协议链接域名：${parsed.origin}`
          : `当前协议链接不是 HTTPS：${parsed.origin}`;
    } catch {
      appUrlStatus = statuses.blocking;
      appUrlDetail = "APP_URL 不是有效 URL。";
    }
  }

  addCheck(result, {
    id: "company-name",
    group: "主体备案",
    label: "协议主体 COMPANY_NAME",
    status: companyNameReady ? statuses.ready : statuses.blocking,
    detail: companyNameReady ? "已配置真实主体名称。" : "未配置或仍是占位值。",
    action: companyNameReady
      ? "确认该主体与备案主体、支付宝应用主体和微信支付商户主体一致。"
      : "确定公司或个体工商户路径后配置 COMPANY_NAME。",
  });
  addCheck(result, {
    id: "icp-record-no",
    group: "主体备案",
    label: "ICP备案号 ICP_RECORD_NO",
    status: icpReady ? statuses.ready : statuses.blocking,
    detail: icpReady ? "已配置备案号。" : "未配置或仍是占位值。",
    action: icpReady
      ? "确认首页 footer、协议页和备案系统展示同一备案号。"
      : "ICP备案通过后配置 ICP_RECORD_NO；没有备案前不要公开收费放量。",
  });
  addCheck(result, {
    id: "legal-app-url",
    group: "主体备案",
    label: "正式协议链接 APP_URL",
    status: appUrlStatus,
    detail: appUrlDetail,
    action:
      appUrlStatus === statuses.ready
        ? "上线材料使用该域名下的用户协议和隐私政策链接。"
        : "正式域名和 HTTPS 就绪后运行 npm run launch:url-check 与 npm run launch:compliance-check。",
  });
}

function checkLegalDocuments(result) {
  const root = process.cwd();
  const legalSource = readProjectFile(root, "src/lib/legal.ts");
  const legalPage = readProjectFile(root, "src/app/legal/[slug]/page.tsx");
  const missingSlugs = requiredLegalSlugs.filter(
    (slug) => !legalSource.includes(`slug: "${slug}"`),
  );
  const missingKeywords = requiredLegalKeywords.filter((keyword) => !legalSource.includes(keyword));
  const pageReady =
    legalPage.includes("generateStaticParams") &&
    legalPage.includes("getLegalDocument") &&
    legalPage.includes("getLegalEntity") &&
    legalPage.includes("legalVersion");

  addCheck(result, {
    id: "legal-document-slugs",
    group: "协议四件套",
    label: "协议文档 slug",
    status: missingSlugs.length === 0 ? statuses.ready : statuses.blocking,
    detail: missingSlugs.length === 0 ? "用户协议、隐私政策、免责声明和上传授权均已登记。" : `缺少 ${missingSlugs.join(", ")}`,
    action:
      missingSlugs.length === 0
        ? "上线前仅需结合真实主体和律师意见复核版本。"
        : "补齐 legalDocuments 中的四个协议文档。",
  });
  addCheck(result, {
    id: "legal-document-keywords",
    group: "协议四件套",
    label: "协议关键边界",
    status: missingKeywords.length === 0 ? statuses.ready : statuses.blocking,
    detail:
      missingKeywords.length === 0
        ? "协议已覆盖支付、存储、模型、退款、娱乐边界、专业建议限制、上传授权和删除口径。"
        : `缺少关键词：${missingKeywords.join(", ")}`,
    action:
      missingKeywords.length === 0
        ? "上线前按真实供应商、客服入口和退款规则做法务复核。"
        : "补齐隐私供应商、退款客服、免责声明和图片授权关键口径。",
  });
  addCheck(result, {
    id: "legal-page-rendering",
    group: "协议四件套",
    label: "协议页渲染",
    status: pageReady ? statuses.ready : statuses.blocking,
    detail: pageReady ? "动态协议页可根据 slug 渲染版本、主体和备案信息。" : "协议页没有完整连接文档、主体或版本信息。",
    action: pageReady
      ? "正式主体和备案变量配置后，在浏览器核对四个协议页。"
      : "恢复 /legal/[slug] 页面与 legalDocuments/getLegalEntity 的连接。",
  });
}

function checkCompliancePlanWiring(result) {
  const root = process.cwd();
  const compliance = readProjectFile(root, "src/lib/launch-compliance.ts");
  const compliancePlan = readProjectFile(root, "src/lib/launch-compliance-plan.ts");
  const complianceRoute = readProjectFile(
    root,
    "src/app/api/admin/launch/compliance/route.ts",
  );
  const compliancePlanRoute = readProjectFile(
    root,
    "src/app/api/admin/launch/compliance-plan/route.ts",
  );
  const healthPage = readProjectFile(root, "src/app/admin/health/page.tsx");
  const missingItemIds = complianceItemIds.filter((itemId) => !compliance.includes(`id: "${itemId}"`));
  const missingStepIds = compliancePlanStepIds.filter(
    (stepId) => !compliancePlan.includes(`id: "${stepId}"`),
  );
  const ready =
    missingItemIds.length === 0 &&
    missingStepIds.length === 0 &&
    compliance.includes("getLaunchComplianceChecklist") &&
    compliance.includes("legalDocuments") &&
    compliance.includes("getLegalEntity") &&
    compliancePlan.includes("getLaunchCompliancePlan") &&
    compliancePlan.includes("commandGroups") &&
    compliancePlan.includes("COMPANY_NAME") &&
    compliancePlan.includes("ICP_RECORD_NO") &&
    complianceRoute.includes("getLaunchComplianceChecklist") &&
    complianceRoute.includes('cache-control": "no-store"') &&
    compliancePlanRoute.includes("getLaunchCompliancePlan") &&
    compliancePlanRoute.includes('cache-control": "no-store"') &&
    healthPage.includes("launchCompliance") &&
    healthPage.includes("launchCompliancePlan");

  addCheck(result, {
    id: "compliance-plan-wiring",
    group: "后台计划",
    label: "合规核对与落地计划",
    status: ready ? statuses.ready : statuses.blocking,
    detail: ready
      ? "后台合规核对和主体落地计划包含主体、备案、协议、支付主体、隐私、图片授权、退款和法务归档步骤。"
      : `wiring 不完整；缺失核对项：${missingItemIds.join(", ") || "无"}；缺失步骤：${missingStepIds.join(", ") || "无"}`,
    action: ready
      ? "保留后台计划；真实资质推进时按步骤留证。"
      : "恢复 getLaunchComplianceChecklist、getLaunchCompliancePlan、只读 API 和后台健康页展示。",
  });
}

async function checkLegalPageRuntime(result, input) {
  if (!input.baseUrl) {
    return;
  }

  const pages = [
    { route: "/legal/terms", label: "用户协议" },
    { route: "/legal/privacy", label: "隐私政策" },
    { route: "/legal/disclaimer", label: "免责声明" },
    { route: "/legal/upload-consent", label: "图片上传授权" },
  ];

  await Promise.all(
    pages.map(async (page) => {
      const url = new URL(page.route, input.baseUrl);

      try {
        const response = await fetchWithTimeout(url, { method: "GET" }, input.timeoutMs);
        const ready = response.status === 200;

        addCheck(result, {
          id: `runtime${page.route.replaceAll("/", "-")}`,
          group: "运行时",
          label: page.label,
          status: ready ? statuses.ready : statuses.blocking,
          detail: ready ? `${page.route} 返回 200。` : `${page.route} 返回 HTTP ${response.status}。`,
          action: ready ? "保留协议页访问结果。" : "确认应用已启动、路由可访问，并检查部署反向代理。",
        });
      } catch (error) {
        addCheck(result, {
          id: `runtime${page.route.replaceAll("/", "-")}`,
          group: "运行时",
          label: page.label,
          status: statuses.blocking,
          detail: readError(error),
          action: "确认 base-url 可访问，应用已启动，协议页路由可渲染。",
        });
      }
    }),
  );
}

async function checkComplianceApiRuntime(result, input) {
  if (!input.baseUrl) {
    return;
  }

  try {
    const url = adminUrl(input.baseUrl, "/api/admin/launch/compliance", input.env);
    const response = await fetchWithTimeout(
      url,
      { headers: { accept: "application/json" } },
      input.timeoutMs,
    );
    const payload = await response.json().catch(() => null);
    const items = Array.isArray(payload?.compliance?.items) ? payload.compliance.items : [];
    const itemIds = items.map((item) => item.id);
    const missingItemIds = complianceItemIds.filter((itemId) => !itemIds.includes(itemId));
    const ready = response.ok && payload?.ok === true && missingItemIds.length === 0;

    addCheck(result, {
      id: "runtime-compliance-api",
      group: "运行时",
      label: "合规核对 API",
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? `/api/admin/launch/compliance 返回 ${items.length} 个核对项，当前业务状态 ${payload.compliance.status}。`
        : `API 状态 ${response.status}；缺失核对项：${missingItemIds.join(", ") || "无"}。`,
      action: ready
        ? "保留运行时验收；正式上线前用生产 token 和正式域名再跑一次。"
        : "检查后台访问 token、合规核对输出和 API 访问控制。",
    });
  } catch (error) {
    addCheck(result, {
      id: "runtime-compliance-api",
      group: "运行时",
      label: "合规核对 API",
      status: statuses.blocking,
      detail: readError(error),
      action: "确认应用已启动、base-url 可访问，并带上 ADMIN_ACCESS_TOKEN。",
    });
  }
}

async function checkCompliancePlanApiRuntime(result, input) {
  if (!input.baseUrl) {
    return;
  }

  try {
    const url = adminUrl(input.baseUrl, "/api/admin/launch/compliance-plan", input.env);
    const response = await fetchWithTimeout(
      url,
      { headers: { accept: "application/json" } },
      input.timeoutMs,
    );
    const payload = await response.json().catch(() => null);
    const steps = Array.isArray(payload?.compliancePlan?.steps)
      ? payload.compliancePlan.steps
      : [];
    const stepIds = steps.map((step) => step.id);
    const missingStepIds = compliancePlanStepIds.filter((stepId) => !stepIds.includes(stepId));
    const commandGroups = Array.isArray(payload?.compliancePlan?.commandGroups)
      ? payload.compliancePlan.commandGroups
      : [];
    const hasSubjectCommand = commandGroups.some((group) =>
      Array.isArray(group.commands)
        ? group.commands.some((command) => command.command?.includes("COMPANY_NAME"))
        : false,
    );
    const ready =
      response.ok &&
      payload?.ok === true &&
      missingStepIds.length === 0 &&
      commandGroups.length > 0 &&
      hasSubjectCommand;

    addCheck(result, {
      id: "runtime-compliance-plan-api",
      group: "运行时",
      label: "合规与主体落地计划 API",
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? `/api/admin/launch/compliance-plan 返回 ${steps.length} 个步骤和 ${commandGroups.length} 个命令组，当前业务状态 ${payload.compliancePlan.status}。`
        : `API 状态 ${response.status}；缺失步骤：${missingStepIds.join(", ") || "无"}；主体命令：${hasSubjectCommand ? "有" : "无"}。`,
      action: ready
        ? "保留运行时验收；主体、备案和支付资质完成后再跑一次确认无 blocking。"
        : "检查后台访问 token、compliancePlan.steps 和 commandGroups 输出。",
    });
  } catch (error) {
    addCheck(result, {
      id: "runtime-compliance-plan-api",
      group: "运行时",
      label: "合规与主体落地计划 API",
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

  checkFileInventory(result);
  checkLegalDocuments(result);
  checkSubjectEnv(result, input.env);
  checkCompliancePlanWiring(result);
  await checkLegalPageRuntime(result, input);
  await checkComplianceApiRuntime(result, input);
  await checkCompliancePlanApiRuntime(result, input);

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
  console.log(`合规与主体上线检查 env=${result.envFile || "process.env"}`);
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
