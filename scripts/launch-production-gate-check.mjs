#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const statuses = {
  ready: "ready",
  blocking: "blocking",
};

const defaultTimeoutMs = 45000;
const requiredFiles = [
  "scripts/launch-production-gate.mjs",
  "scripts/launch-compliance-check.mjs",
  "src/lib/launch-production-gate.ts",
  "src/lib/launch-compliance-plan.ts",
  "src/lib/launch-evidence.ts",
  "src/lib/launch-package.ts",
  "src/lib/launch-blocker-dashboard.ts",
  "src/lib/launch-decision.ts",
  "src/app/api/admin/launch/production-gate/route.ts",
  "src/app/api/admin/launch/blocker-dashboard/route.ts",
  "src/app/api/admin/launch/decision/route.ts",
  "src/app/admin/health/page.tsx",
  "package.json",
  "README.md",
];

function parseArgs(argv) {
  const args = {
    baseUrl: undefined,
    adminToken: process.env.ADMIN_ACCESS_TOKEN ?? "",
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

    if (arg === "--admin-token") {
      args.adminToken = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--admin-token=")) {
      args.adminToken = arg.slice("--admin-token=".length);
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

function validateTimeoutMs(value) {
  return Number.isInteger(value) && value >= 1000 && value <= 120000;
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

function normalizeBaseUrl(value) {
  return value.trim().replace(/\/$/, "");
}

function appendToken(route, token) {
  if (!token || isPlaceholder(token)) {
    return route;
  }

  const separator = route.includes("?") ? "&" : "?";
  return `${route}${separator}token=${encodeURIComponent(token)}`;
}

function createResult(input) {
  return {
    ok: false,
    generatedAt: new Date().toISOString(),
    baseUrl: input.baseUrl,
    mode: input.baseUrl ? "static+runtime" : "static",
    summary: {
      ready: 0,
      blocking: 0,
      total: 0,
    },
    checks: [],
  };
}

function addCheck(result, check) {
  result.checks.push(check);
}

function summarize(result) {
  result.summary = {
    ready: result.checks.filter((item) => item.status === statuses.ready).length,
    blocking: result.checks.filter((item) => item.status === statuses.blocking).length,
    total: result.checks.length,
  };
  result.ok = result.summary.blocking === 0;

  return result;
}

function readProjectFile(root, filename) {
  const absolutePath = path.resolve(root, filename);

  if (!existsSync(absolutePath)) {
    return undefined;
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


function checkFileExists(result, root, filename) {
  const exists = existsSync(path.resolve(root, filename));

  addCheck(result, {
    id: `file:${filename}`,
    group: "静态文件",
    label: filename,
    status: exists ? statuses.ready : statuses.blocking,
    detail: exists ? "文件存在。" : "文件不存在。",
    action: exists ? "保留该文件。" : "恢复生产上线总门禁所需文件。",
  });
}

function checkContainsAll(result, input) {
  const missing = input.tokens.filter((token) => !input.content?.includes(token));

  addCheck(result, {
    id: input.id,
    group: input.group,
    label: input.label,
    status: missing.length === 0 ? statuses.ready : statuses.blocking,
    detail: missing.length === 0 ? input.readyDetail : `缺少：${missing.join(", ")}`,
    action: missing.length === 0 ? input.readyAction : input.blockingAction,
  });
}

function runStaticChecks(result, root) {
  for (const filename of requiredFiles) {
    checkFileExists(result, root, filename);
  }

  checkContainsAll(result, {
    id: "cli-production-gate",
    group: "命令行门禁",
    label: "生产上线总门禁脚本",
    content: readProjectFile(root, "scripts/launch-production-gate.mjs"),
    tokens: [
      "gateSteps",
      "launch-preflight.mjs",
      "launch-db-check.mjs",
      "launch-url-check.mjs",
      "launch-ai-storage-check.mjs",
      "launch-compliance-check.mjs",
      "launch-payment-check.mjs",
      "releaseReady",
      "blockingItems",
      "warningItems",
    ],
    readyDetail: "命令行总门禁会聚合预检、数据库、URL、AI/七牛、合规主体和真实支付检查。",
    readyAction: "保留 CLI 总门禁作为上线前最终命令。",
    blockingAction: "恢复 launch-production-gate.mjs 对六个子检查的聚合和 Go/No-Go 输出。",
  });

  checkContainsAll(result, {
    id: "server-production-gate",
    group: "后台门禁",
    label: "服务端生产总门禁聚合",
    content: readProjectFile(root, "src/lib/launch-production-gate.ts"),
    tokens: [
      "export async function getLaunchProductionGate",
      "preflightStep",
      "databaseStep",
      "urlStep",
      "aiStorageStep",
      "complianceStep",
      "paymentStep",
      "releaseReady",
      "copyText",
      "npm run launch:production-gate",
    ],
    readyDetail: "服务端聚合层复用生产变量、数据库、部署、AI/七牛、合规与支付计划，输出后台总门禁。",
    readyAction: "保留 getLaunchProductionGate，供后台和后续归档复用。",
    blockingAction: "恢复 src/lib/launch-production-gate.ts 的六段聚合、releaseReady 和 copyText。",
  });

  checkContainsAll(result, {
    id: "admin-health-production-gate",
    group: "后台门禁",
    label: "/admin/health 总门禁可见",
    content: readAdminHealthContent(root),
    tokens: [
      "getLaunchProductionGate",
      "launchProductionGate",
      "id=\"launch-production-gate\"",
      "生产上线总门禁",
      "releaseReady=yes",
      "releaseReady=no",
      "npm run launch:production-gate",
      "总门禁优先处理",
      "可复制总门禁",
    ],
    readyDetail: "后台健康页会展示生产总门禁、命令入口、优先处理项和可复制口径。",
    readyAction: "保留 /admin/health 的生产总门禁区块。",
    blockingAction: "恢复 AdminHealthPage 中的 launchProductionGate 获取和渲染区块。",
  });

  checkContainsAll(result, {
    id: "api-production-gate",
    group: "后台门禁",
    label: "生产总门禁只读 API",
    content: readProjectFile(root, "src/app/api/admin/launch/production-gate/route.ts"),
    tokens: [
      "canAccessAdminRequest",
      "getLaunchProductionGate",
      "productionGate",
      "cache-control",
      "no-store",
    ],
    readyDetail: "后台提供 /api/admin/launch/production-gate，只读返回结构化生产总门禁。",
    readyAction: "保留生产总门禁 API，供上线脚本、监控或交接自动化读取。",
    blockingAction: "恢复 /api/admin/launch/production-gate 的鉴权、聚合和 no-store 响应。",
  });

  checkContainsAll(result, {
    id: "evidence-production-gate-archive",
    group: "证据归档",
    label: "生产总门禁归档快照",
    content: readProjectFile(root, "src/lib/launch-evidence.ts"),
    tokens: [
      "getLaunchProductionGate",
      "productionGate",
      "releaseReady",
      "evidenceProductionGate",
      "readProductionGateSteps",
      "readProductionGateCommands",
      "旧归档未包含生产总门禁",
    ],
    readyDetail: "上线证据归档会保存生产总门禁状态、六个步骤、命令和旧归档兼容口径。",
    readyAction: "保留 productionGate 归档，作为正式上线前可追溯快照。",
    blockingAction: "恢复 launch-evidence.ts 中的 productionGate 写入、读取和旧记录兼容。",
  });

  checkContainsAll(result, {
    id: "package-production-gate-refresh",
    group: "证据归档",
    label: "上线包总门禁刷新判断",
    content: readProjectFile(root, "src/lib/launch-package.ts"),
    tokens: [
      "getLaunchProductionGate",
      "evidenceMatchesCurrentProductionGate",
      "summariesMatch",
      "productionGate",
      "生产上线总门禁",
    ],
    readyDetail: "收费上线包会比对最新归档与当前生产总门禁，状态变化后提示刷新证据。",
    readyAction: "保留生产总门禁刷新判断，避免旧归档覆盖新门禁状态。",
    blockingAction: "恢复 launch-package.ts 对 productionGate 的比对和刷新原因。",
  });

  checkContainsAll(result, {
    id: "admin-archive-production-gate",
    group: "后台门禁",
    label: "归档卡片展示总门禁",
    content: readAdminHealthContent(root),
    tokens: [
      "archive.metadata.productionGate",
      "生产总门禁",
      "总门禁优先项",
      "releaseReady=yes",
      "releaseReady=no",
    ],
    readyDetail: "后台上线证据归档卡片会展示生产总门禁 releaseReady 和优先项。",
    readyAction: "保留归档卡片中的生产总门禁快照。",
    blockingAction: "恢复 /admin/health 归档卡片对 archive.metadata.productionGate 的展示。",
  });

  checkContainsAll(result, {
    id: "blocker-dashboard-production-gate",
    group: "后台门禁",
    label: "阻断总控台生产门禁工作线",
    content: readProjectFile(root, "src/lib/launch-blocker-dashboard.ts"),
    tokens: [
      "getLaunchProductionGate",
      '"production_gate"',
      "productionGateItem",
      "releaseReady",
      "生产总门禁：releaseReady=",
      "productionGate:",
    ],
    readyDetail: "上线阻断总控台会把生产总门禁作为第 0 条工作线，并输出 releaseReady 和细分阻断数字。",
    readyAction: "保留阻断总控台中的生产门禁工作线。",
    blockingAction: "在 launch-blocker-dashboard.ts 中接入 getLaunchProductionGate、production_gate 工作线和 releaseReady 复制口径。",
  });

  checkContainsAll(result, {
    id: "admin-health-blocker-production-gate",
    group: "后台门禁",
    label: "阻断总控台生产门禁卡片",
    content: readAdminHealthContent(root),
    tokens: [
      "productionGate: launchProductionGate",
      "launchBlockerDashboard.productionGate",
      "生产总门禁",
      "releaseReady=yes",
      "门禁",
      "细分",
    ],
    readyDetail: "后台上线阻断总控台展示生产总门禁卡片，并复用页面已聚合的 launchProductionGate。",
    readyAction: "保留阻断总控台生产门禁卡片。",
    blockingAction: "在 /admin/health 的 getLaunchBlockerDashboard 入参和总控台指标区加入生产总门禁。",
  });

  checkContainsAll(result, {
    id: "decision-production-gate",
    group: "最终决策",
    label: "最终上线决策受总门禁约束",
    content: readProjectFile(root, "src/lib/launch-decision.ts"),
    tokens: [
      "getLaunchProductionGate",
      '"production_gate"',
      "productionGateItem",
      'input.productionGate.status === "ready"',
      "productionGateSnapshot",
      "生产总门禁：releaseReady=",
      "productionGate: productionGateSnapshot",
    ],
    readyDetail: "最终上线决策会聚合生产总门禁，把 production_gate 纳入阻断、下一步动作和复制口径。",
    readyAction: "保留最终决策中的生产总门禁硬约束。",
    blockingAction: "在 launch-decision.ts 中接入 getLaunchProductionGate、production_gate gate、releaseReady 复制口径和返回快照。",
  });

  checkContainsAll(result, {
    id: "admin-health-decision-production-gate",
    group: "最终决策",
    label: "后台最终决策展示总门禁",
    content: readAdminHealthContent(root),
    tokens: [
      "productionGate: launchProductionGate",
      "launchDecision.productionGate",
      "生产总门禁",
      "releaseReady=yes",
      "releaseReady=no",
      "门禁",
      "细分",
    ],
    readyDetail: "后台最终决策卡片展示生产总门禁 releaseReady 和阻断数字，并复用页面已聚合的总门禁。",
    readyAction: "保留最终决策卡片中的生产总门禁指标。",
    blockingAction: "在 /admin/health 的 getLaunchDecision 入参和最终决策指标区加入 launchDecision.productionGate。",
  });

  checkContainsAll(result, {
    id: "api-decision-production-gate",
    group: "最终决策",
    label: "最终决策只读 API",
    content: readProjectFile(root, "src/app/api/admin/launch/decision/route.ts"),
    tokens: [
      "canAccessAdminRequest",
      "getLaunchDecision",
      "decision",
      "cache-control",
      "no-store",
    ],
    readyDetail: "最终决策 API 会返回包含 productionGate 的决策快照。",
    readyAction: "保留 /api/admin/launch/decision 作为上线会前复核入口。",
    blockingAction: "恢复 /api/admin/launch/decision 的鉴权、聚合和 no-store 响应。",
  });

  checkContainsAll(result, {
    id: "package-production-gate-check",
    group: "脚本命令",
    label: "package 命令",
    content: readProjectFile(root, "package.json"),
    tokens: [
      "\"launch:production-gate\"",
      "scripts/launch-production-gate.mjs",
      "\"launch:production-gate:example\"",
      "\"launch:production-gate-check\"",
      "scripts/launch-production-gate-check.mjs",
    ],
    readyDetail: "package.json 注册了生产总门禁和总门禁验收脚本。",
    readyAction: "可通过 npm run launch:production-gate-check 验收。",
    blockingAction: "在 package.json scripts 中注册 production gate 相关命令。",
  });

  checkContainsAll(result, {
    id: "readme-production-gate",
    group: "文档口径",
    label: "README 总门禁说明",
    content: readProjectFile(root, "README.md"),
    tokens: [
      "npm run launch:production-gate",
      "npm run launch:production-gate:example",
      "launch:production-gate",
      "final paid-launch gate",
      "Blocking items fail",
    ],
    readyDetail: "README 说明了总门禁定位、运行顺序和阻断/警告口径。",
    readyAction: "保留 README 中的上线总门禁说明。",
    blockingAction: "补充 README 的 production gate 使用说明。",
  });
}

async function fetchWithTimeout(input) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    return await fetch(input.url, {
      method: input.method ?? "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept: input.accept,
        ...(input.body ? { "content-type": "application/json" } : {}),
        "user-agent": "xuanji-launch-production-gate-check/1.0",
      },
      body: input.body,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function runRuntimeChecks(result, args) {
  const baseUrl = normalizeBaseUrl(args.baseUrl);

  try {
    new URL(baseUrl);
  } catch {
    addCheck(result, {
      id: "runtime:base-url",
      group: "运行时检查",
      label: "base-url",
      status: statuses.blocking,
      detail: "不是有效 URL。",
      action: "使用 --base-url=http://localhost:3000 或正式 HTTPS 域名。",
    });
    return;
  }

  const url = `${baseUrl}${appendToken("/admin/health", args.adminToken)}`;

  try {
    const response = await fetchWithTimeout({
      url,
      timeoutMs: args.timeoutMs,
      accept: "text/html",
    });

    if (response.status !== 200) {
      addCheck(result, {
        id: "runtime:admin-health:http",
        group: "运行时检查",
        label: "/admin/health",
        status: statuses.blocking,
        detail: `HTTP ${response.status}`,
        action: "确认服务已启动、后台 token 正确，并重试运行时检查。",
      });
      return;
    }

    const html = await response.text();
    const missing = [
      "生产上线总门禁",
      "releaseReady=",
      "门禁步骤",
      "细分检查",
      "npm run launch:production-gate",
      "生产变量预检",
      "PostgreSQL 与 Prisma Schema",
      "公网域名与关键路由",
      "OpenAI 与七牛云",
      "合规与主体一致性",
      "真实支付签名门禁",
      "总门禁优先处理",
      "可复制总门禁",
      "id=\"launch-production-gate\"",
    ].filter((pattern) => !html.includes(pattern));

    addCheck(result, {
      id: "runtime:admin-health:production-gate",
      group: "运行时检查",
      label: "后台生产总门禁渲染",
      status: missing.length === 0 ? statuses.ready : statuses.blocking,
      detail: missing.length === 0 ? "后台页面包含生产总门禁完整区块。" : `缺少 ${missing.join(", ")}`,
      action: missing.length === 0 ? "保留后台生产总门禁。" : "检查 /admin/health 总门禁区块和服务端聚合数据。",
    });
  } catch (error) {
    addCheck(result, {
      id: "runtime:admin-health:fetch",
      group: "运行时检查",
      label: "/admin/health",
      status: statuses.blocking,
      detail: error instanceof Error ? error.message : String(error),
      action: "确认 base-url 可访问，必要时加大 --timeout-ms。",
    });
  }

  const gateApiUrl = `${baseUrl}${appendToken(
    "/api/admin/launch/production-gate",
    args.adminToken,
  )}`;

  try {
    const response = await fetchWithTimeout({
      url: gateApiUrl,
      timeoutMs: args.timeoutMs,
      accept: "application/json",
    });

    if (response.status !== 200) {
      addCheck(result, {
        id: "runtime:production-gate-api:http",
        group: "运行时检查",
        label: "生产总门禁 API",
        status: statuses.blocking,
        detail: `HTTP ${response.status}`,
        action: "确认服务已启动、后台 token 正确，并检查 /api/admin/launch/production-gate。",
      });
      return;
    }

    const payload = await response.json().catch(() => ({}));
    const productionGate = payload?.productionGate;
    const hasGate =
      payload?.ok === true &&
      typeof productionGate?.releaseReady === "boolean" &&
      Array.isArray(productionGate?.steps) &&
      productionGate.steps.length === 6 &&
      productionGate.steps.every((step) => typeof step?.id === "string" && step?.summary);

    addCheck(result, {
      id: "runtime:production-gate-api:json",
      group: "运行时检查",
      label: "生产总门禁 API JSON",
      status: hasGate ? statuses.ready : statuses.blocking,
      detail: hasGate
        ? "生产总门禁 API 返回 releaseReady 和 6 个门禁步骤。"
        : "生产总门禁 API 响应缺少 releaseReady 或 6 个门禁步骤。",
      action: hasGate
        ? "保留 /api/admin/launch/production-gate 作为自动化读取入口。"
        : "检查 route 是否调用 getLaunchProductionGate 并返回 productionGate。",
    });
  } catch (error) {
    addCheck(result, {
      id: "runtime:production-gate-api:fetch",
      group: "运行时检查",
      label: "生产总门禁 API",
      status: statuses.blocking,
      detail: error instanceof Error ? error.message : String(error),
      action: "确认 base-url 可访问，必要时加大 --timeout-ms。",
    });
  }

  const decisionUrl = `${baseUrl}${appendToken(
    "/api/admin/launch/decision",
    args.adminToken,
  )}`;

  try {
    const response = await fetchWithTimeout({
      url: decisionUrl,
      timeoutMs: args.timeoutMs,
      accept: "application/json",
    });

    if (response.status !== 200) {
      addCheck(result, {
        id: "runtime:launch-decision:http",
        group: "运行时检查",
        label: "最终决策 API",
        status: statuses.blocking,
        detail: `HTTP ${response.status}`,
        action: "确认服务已启动、后台 token 正确，并检查 /api/admin/launch/decision。",
      });
      return;
    }

    const payload = await response.json().catch(() => ({}));
    const decision = payload?.decision;
    const productionGate = decision?.productionGate;
    const gates = Array.isArray(decision?.gates) ? decision.gates : [];
    const hasDecisionGate =
      payload?.ok === true &&
      typeof productionGate?.releaseReady === "boolean" &&
      typeof productionGate?.stepBlocking === "number" &&
      typeof productionGate?.checkBlocking === "number" &&
      gates.some((item) => item?.id === "production_gate") &&
      typeof decision?.copyText === "string" &&
      decision.copyText.includes("生产总门禁：releaseReady=");

    addCheck(result, {
      id: "runtime:launch-decision:production-gate",
      group: "运行时检查",
      label: "最终决策生产门禁 JSON",
      status: hasDecisionGate ? statuses.ready : statuses.blocking,
      detail: hasDecisionGate
        ? "最终决策 API 返回 productionGate 快照、production_gate gate 和 releaseReady 复制口径。"
        : "最终决策 API 缺少 productionGate、production_gate gate 或 releaseReady 复制口径。",
      action: hasDecisionGate
        ? "保留最终决策中的生产总门禁硬约束。"
        : "检查 getLaunchDecision 是否聚合 getLaunchProductionGate 并返回 productionGate/gates/copyText。",
    });
  } catch (error) {
    addCheck(result, {
      id: "runtime:launch-decision:fetch",
      group: "运行时检查",
      label: "最终决策 API",
      status: statuses.blocking,
      detail: error instanceof Error ? error.message : String(error),
      action: "确认 base-url 可访问，必要时加大 --timeout-ms。",
    });
  }

  const blockerDashboardUrl = `${baseUrl}${appendToken(
    "/api/admin/launch/blocker-dashboard",
    args.adminToken,
  )}`;

  try {
    const response = await fetchWithTimeout({
      url: blockerDashboardUrl,
      timeoutMs: args.timeoutMs,
      accept: "application/json",
    });

    if (response.status !== 200) {
      addCheck(result, {
        id: "runtime:blocker-dashboard:http",
        group: "运行时检查",
        label: "阻断总控台 API",
        status: statuses.blocking,
        detail: `HTTP ${response.status}`,
        action: "确认服务已启动、后台 token 正确，并检查 /api/admin/launch/blocker-dashboard。",
      });
      return;
    }

    const payload = await response.json().catch(() => ({}));
    const blockerDashboard = payload?.blockerDashboard;
    const productionGate = blockerDashboard?.productionGate;
    const workstreams = Array.isArray(blockerDashboard?.workstreams)
      ? blockerDashboard.workstreams
      : [];
    const productionGateWorkstream = workstreams.find((item) => item?.id === "production_gate");
    const hasDashboardGate =
      payload?.ok === true &&
      typeof productionGate?.releaseReady === "boolean" &&
      typeof productionGate?.stepBlocking === "number" &&
      typeof productionGate?.checkBlocking === "number" &&
      productionGateWorkstream?.title === "生产总门禁" &&
      Array.isArray(productionGateWorkstream?.nextItems) &&
      typeof blockerDashboard?.copyText === "string" &&
      blockerDashboard.copyText.includes("生产总门禁：releaseReady=");

    addCheck(result, {
      id: "runtime:blocker-dashboard:production-gate",
      group: "运行时检查",
      label: "阻断总控台生产门禁 JSON",
      status: hasDashboardGate ? statuses.ready : statuses.blocking,
      detail: hasDashboardGate
        ? "阻断总控台 API 返回 productionGate 快照、production_gate 工作线和 releaseReady 复制口径。"
        : "阻断总控台 API 缺少 productionGate、production_gate 工作线或 releaseReady 复制口径。",
      action: hasDashboardGate
        ? "保留阻断总控台中的生产门禁工作线。"
        : "检查 getLaunchBlockerDashboard 是否聚合 getLaunchProductionGate 并返回 productionGate/workstreams/copyText。",
    });
  } catch (error) {
    addCheck(result, {
      id: "runtime:blocker-dashboard:fetch",
      group: "运行时检查",
      label: "阻断总控台 API",
      status: statuses.blocking,
      detail: error instanceof Error ? error.message : String(error),
      action: "确认 base-url 可访问，必要时加大 --timeout-ms。",
    });
  }

  const evidenceUrl = `${baseUrl}${appendToken("/api/admin/launch/evidence", args.adminToken)}`;

  try {
    const response = await fetchWithTimeout({
      url: evidenceUrl,
      timeoutMs: args.timeoutMs,
      accept: "application/json",
      method: "POST",
      body: JSON.stringify({ note: "production gate archive check" }),
    });

    if (response.status !== 200) {
      addCheck(result, {
        id: "runtime:launch-evidence:http",
        group: "运行时检查",
        label: "生产总门禁归档接口",
        status: statuses.blocking,
        detail: `HTTP ${response.status}`,
        action: "确认后台 token 正确，并检查 /api/admin/launch/evidence POST。",
      });
      return;
    }

    const payload = await response.json().catch(() => ({}));
    const productionGate = payload?.archive?.metadata?.productionGate;
    const hasSnapshot =
      typeof productionGate?.releaseReady === "boolean" &&
      Array.isArray(productionGate?.steps) &&
      productionGate.steps.length === 6 &&
      productionGate.steps.every((step) => typeof step?.id === "string" && step?.summary);

    addCheck(result, {
      id: "runtime:launch-evidence:production-gate",
      group: "运行时检查",
      label: "归档写入生产总门禁快照",
      status: hasSnapshot ? statuses.ready : statuses.blocking,
      detail: hasSnapshot
        ? "上线证据归档返回 productionGate releaseReady 和 6 个门禁步骤。"
        : "归档响应缺少 productionGate releaseReady 或 6 个门禁步骤。",
      action: hasSnapshot
        ? "保留生产总门禁归档快照。"
        : "检查 archiveLaunchEvidence 是否调用 getLaunchProductionGate 并写入 metadata.productionGate。",
    });
  } catch (error) {
    addCheck(result, {
      id: "runtime:launch-evidence:fetch",
      group: "运行时检查",
      label: "生产总门禁归档接口",
      status: statuses.blocking,
      detail: error instanceof Error ? error.message : String(error),
      action: "确认 base-url 可访问，必要时加大 --timeout-ms。",
    });
  }
}

function statusIcon(status) {
  return status === statuses.ready ? "OK" : "BLOCK";
}

function printTextReport(result) {
  console.log(`生产上线总门禁验收 mode=${result.mode}`);
  console.log(`baseUrl=${result.baseUrl || "未启用运行时检查"}`);
  console.log(
    `summary ready=${result.summary.ready} blocking=${result.summary.blocking} total=${result.summary.total}`,
  );
  console.log("");

  for (const item of result.checks) {
    console.log(`[${statusIcon(item.status)}] ${item.group} / ${item.label}`);
    console.log(`  ${item.detail}`);
    console.log(`  ${item.action}`);
  }
}

const args = parseArgs(process.argv.slice(2));

if (!validateTimeoutMs(args.timeoutMs)) {
  console.error("--timeout-ms must be an integer between 1000 and 120000.");
  process.exit(args.noFail ? 0 : 1);
}

const root = process.cwd();
const result = createResult({
  baseUrl: args.baseUrl ? normalizeBaseUrl(args.baseUrl) : undefined,
});

runStaticChecks(result, root);

if (args.baseUrl) {
  await runRuntimeChecks(result, args);
}

summarize(result);

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printTextReport(result);
}

if (!result.ok && !args.noFail) {
  process.exit(1);
}
