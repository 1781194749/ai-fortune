#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const statuses = {
  ready: "ready",
  warning: "warning",
  blocking: "blocking",
};

const defaultTimeoutMs = 60000;
const workplanLaneIds = [
  "external",
  "application",
  "environment",
  "verification",
  "economics",
  "evidence",
];
const requiredFiles = [
  "src/lib/launch-handoff.ts",
  "src/lib/launch-workplan.ts",
  "src/app/api/admin/launch/handoff/route.ts",
  "src/app/api/admin/launch/workplan/route.ts",
  "src/app/admin/health/page.tsx",
  "package.json",
  "README.md",
  "docs/TECH_ARCHITECTURE.md",
  "docs/PROJECT_PLAN.md",
  "docs/SPRINT_01.md",
  "docs/EXECUTION_ROADMAP.md",
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
function readAdminHealthContent(root) {
  return [
    readProjectFile(root, "src/app/admin/health/page.tsx"),
    readProjectFile(root, "src/app/admin/health/full/page.tsx"),
  ]
    .filter(Boolean)
    .join("\n");
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
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(baseUrl, route, adminToken, timeoutMs, init) {
  const url = `${baseUrl}${appendToken(route, adminToken)}`;
  const response = await fetchWithTimeout(
    url,
    {
      ...init,
      headers: {
        "content-type": "application/json",
        "user-agent": "xuanji-launch-handoff-check/1.0",
        ...(init?.headers ?? {}),
      },
    },
    timeoutMs,
  );
  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text.slice(0, 400) };
  }

  return {
    response,
    payload,
    text,
  };
}

function createResult(input) {
  return {
    ok: false,
    generatedAt: new Date().toISOString(),
    baseUrl: input.baseUrl,
    mode: input.baseUrl ? "static+runtime" : "static",
    checks: [],
    summary: {
      ready: 0,
      warning: 0,
      blocking: 0,
      total: 0,
    },
  };
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

function checkFileExists(result, root, filename) {
  const exists = existsSync(path.resolve(root, filename));

  addCheck(result, {
    id: `file:${filename}`,
    group: "静态文件",
    label: filename,
    status: exists ? statuses.ready : statuses.blocking,
    detail: exists ? "文件存在。" : "文件不存在。",
    action: exists ? "保留该文件。" : "恢复上线交接与执行计划验收所需文件。",
  });
}

function checkContainsAll(result, input) {
  const missing = input.tokens.filter((token) => !input.content.includes(token));

  addCheck(result, {
    id: input.id,
    group: input.group,
    label: input.label,
    status: missing.length === 0 ? statuses.ready : statuses.blocking,
    detail: missing.length === 0 ? input.readyDetail : `缺少：${missing.join(", ")}`,
    action: missing.length === 0 ? input.readyAction : input.blockingAction,
  });
}

function checkStaticWiring(result, root) {
  for (const filename of requiredFiles) {
    checkFileExists(result, root, filename);
  }

  const handoff = readProjectFile(root, "src/lib/launch-handoff.ts");
  const workplan = readProjectFile(root, "src/lib/launch-workplan.ts");
  const handoffRoute = readProjectFile(root, "src/app/api/admin/launch/handoff/route.ts");
  const workplanRoute = readProjectFile(root, "src/app/api/admin/launch/workplan/route.ts");
  const healthPage = readAdminHealthContent(root);
  const packageJson = readProjectFile(root, "package.json");
  const docs = [
    "README.md",
    "docs/TECH_ARCHITECTURE.md",
    "docs/PROJECT_PLAN.md",
    "docs/SPRINT_01.md",
    "docs/EXECUTION_ROADMAP.md",
  ]
    .map((filename) => readProjectFile(root, filename))
    .join("\n");

  checkContainsAll(result, {
    id: "handoff-aggregation",
    group: "上线交接",
    label: "上线交接摘要聚合",
    content: handoff,
    tokens: [
      "getLaunchHandoff",
      "getLaunchPackage",
      "getLaunchEnvChecklist",
      "getLaunchMaterialPack",
      "getLaunchOfflineActionPack",
      "getLaunchGoalFollowup",
      "getLaunchProductionGate",
      "productionGate",
      "goalFollowup",
      "offlineAction",
      "environmentFocus",
      "externalFocus",
      "evidenceFocus",
      "copyText",
      "玄机 AI 上线交接摘要",
    ],
    readyDetail: "交接摘要聚合上线包、生产变量、外部办理、线下办理、目标复盘、生产总门禁和证据归档。",
    readyAction: "保留 getLaunchHandoff 作为上线会和每日同步的可复制口径。",
    blockingAction: "恢复 launch-handoff.ts 中的聚合输入、生产总门禁、目标复盘、线下办理、证据和 copyText。",
  });

  checkContainsAll(result, {
    id: "workplan-aggregation",
    group: "执行计划",
    label: "上线执行工作计划",
    content: workplan,
    tokens: [
      "getLaunchWorkplan",
      "getLaunchPackage",
      "getLaunchEnvChecklist",
      "getLaunchMaterialPack",
      "getLaunchApplicationPack",
      "getLaunchUnitEconomics",
      "laneMeta",
      ...workplanLaneIds,
      "activeLane",
      "workingSet",
      "copyText",
      "玄机 AI 上线执行工作计划",
    ],
    readyDetail: "执行工作计划按外部办理、平台申请、生产变量、联调验收、单位经济和证据放量六条工作线聚合任务。",
    readyAction: "保留 getLaunchWorkplan，作为上线任务拆分和本周推进的底座。",
    blockingAction: "恢复 launch-workplan.ts 的六条工作线、任务来源、activeLane、workingSet 和 copyText。",
  });

  checkContainsAll(result, {
    id: "handoff-api",
    group: "后台 API",
    label: "交接摘要 API",
    content: handoffRoute,
    tokens: ["canAccessAdminRequest", "getLaunchHandoff", "cache-control", "no-store"],
    readyDetail: "交接摘要 API 有后台鉴权和 no-store 响应。",
    readyAction: "保留 /api/admin/launch/handoff 作为交接验收入口。",
    blockingAction: "恢复 /api/admin/launch/handoff 的鉴权、GET 和 no-store。",
  });

  checkContainsAll(result, {
    id: "workplan-api",
    group: "后台 API",
    label: "执行计划 API",
    content: workplanRoute,
    tokens: ["canAccessAdminRequest", "getLaunchWorkplan", "cache-control", "no-store"],
    readyDetail: "执行计划 API 有后台鉴权和 no-store 响应。",
    readyAction: "保留 /api/admin/launch/workplan 作为执行计划验收入口。",
    blockingAction: "恢复 /api/admin/launch/workplan 的鉴权、GET 和 no-store。",
  });

  checkContainsAll(result, {
    id: "admin-health-handoff-workplan",
    group: "后台页面",
    label: "/admin/health 交接与执行区块",
    content: healthPage,
    tokens: [
      "上线执行工作计划",
      "上线交接摘要",
      "生产总门禁交接",
      "交接线下办理",
      "目标后续推进",
      "可复制交接口径",
    ],
    readyDetail: "后台健康页展示执行工作计划、上线交接摘要、生产门禁、线下办理和可复制交接口径。",
    readyAction: "保留后台交接和执行计划区块，方便每天开工后直接同步。",
    blockingAction: "恢复 /admin/health 中的上线执行工作计划和上线交接摘要区块。",
  });

  checkContainsAll(result, {
    id: "package-handoff-check",
    group: "脚本命令",
    label: "package 命令",
    content: packageJson,
    tokens: ["\"launch:handoff-check\"", "scripts/launch-handoff-check.mjs"],
    readyDetail: "package.json 已注册交接与执行计划验收脚本。",
    readyAction: "可通过 npm run launch:handoff-check 验收上线交接与执行计划。",
    blockingAction: "在 package.json scripts 中注册 launch:handoff-check。",
  });

  checkContainsAll(result, {
    id: "docs-handoff-check",
    group: "文档口径",
    label: "交接与执行计划验收文档",
    content: docs,
    tokens: [
      "launch:handoff-check",
      "上线交接与执行计划验收",
      "/api/admin/launch/handoff",
      "/api/admin/launch/workplan",
      "可复制交接口径",
    ],
    readyDetail: "README 和项目文档已说明交接与执行计划检查命令、API 和后台区块。",
    readyAction: "保留文档口径，阶段同步和上线交接前都可以复验。",
    blockingAction: "补充 README、项目计划、Sprint、技术架构和执行路线中的 launch:handoff-check 说明。",
  });
}

function hasIds(items, expectedIds) {
  const ids = new Set((items ?? []).map((item) => item.id));

  return expectedIds.filter((id) => !ids.has(id));
}

async function checkHandoffRuntime(result, input) {
  const { response, payload } = await fetchJson(
    input.baseUrl,
    "/api/admin/launch/handoff",
    input.adminToken,
    input.timeoutMs,
  );
  const handoff = payload?.handoff;
  const ready =
    response.ok &&
    payload?.ok === true &&
    Boolean(handoff?.copyText?.includes("玄机 AI 上线交接摘要")) &&
    typeof handoff?.productionGate?.releaseReady === "boolean" &&
    typeof handoff?.goalFollowup?.transitionGate?.canAdvance === "boolean" &&
    Boolean(handoff?.offlineAction?.current?.title) &&
    Boolean(handoff?.snapshot?.goNoGo) &&
    Boolean(handoff?.snapshot?.environment) &&
    Boolean(handoff?.evidenceFocus);

  addCheck(result, {
    id: "runtime:handoff-api",
    group: "运行时",
    label: "上线交接摘要 API",
    status: ready ? statuses.ready : statuses.blocking,
    detail:
      response.ok && payload?.ok === true
        ? `返回交接状态 ${handoff?.status ?? "unknown"}，releaseReady=${handoff?.productionGate?.releaseReady ? "yes" : "no"}，canAdvance=${handoff?.goalFollowup?.transitionGate?.canAdvance ? "yes" : "no"}。`
        : `HTTP ${response.status}`,
    action: ready
      ? "保留交接摘要 API；上线会前直接复制 copyText 同步阻断和下一步。"
      : "检查 /api/admin/launch/handoff 是否返回生产总门禁、目标复盘、线下办理、证据和 copyText。",
  });
}

async function checkWorkplanRuntime(result, input) {
  const { response, payload } = await fetchJson(
    input.baseUrl,
    "/api/admin/launch/workplan",
    input.adminToken,
    input.timeoutMs,
  );
  const workplan = payload?.workplan;
  const lanes = workplan?.lanes ?? [];
  const missing = hasIds(lanes, workplanLaneIds);
  const ready =
    response.ok &&
    payload?.ok === true &&
    missing.length === 0 &&
    Array.isArray(workplan?.workingSet) &&
    Boolean(workplan?.copyText?.includes("玄机 AI 上线执行工作计划"));

  addCheck(result, {
    id: "runtime:workplan-api",
    group: "运行时",
    label: "上线执行工作计划 API",
    status: ready ? statuses.ready : statuses.blocking,
    detail:
      response.ok && payload?.ok === true
        ? `返回 ${lanes.length} 条工作线、${workplan?.workingSet?.length ?? 0} 个本轮优先任务，blocking=${workplan?.summary?.blocking ?? "unknown"}。`
        : `HTTP ${response.status}`,
    action: ready
      ? "保留执行计划 API；每日推进从 activeLane 和 workingSet 开始。"
      : `检查 /api/admin/launch/workplan 是否返回 ${workplanLaneIds.join("、")} 六条工作线和 copyText。`,
  });
}

async function checkAdminHealthRuntime(result, input) {
  const { response, text } = await fetchJson(
    input.baseUrl,
    "/admin/health",
    input.adminToken,
    input.timeoutMs,
  );
  const tokens = [
    "上线执行工作计划",
    "上线交接摘要",
    "生产总门禁交接",
    "交接线下办理",
    "可复制交接口径",
  ];
  const missing = response.ok ? tokens.filter((token) => !text.includes(token)) : tokens;

  addCheck(result, {
    id: "runtime:admin-health-handoff",
    group: "运行时",
    label: "后台交接与执行区块",
    status: response.ok && missing.length === 0 ? statuses.ready : statuses.blocking,
    detail: response.ok
      ? missing.length === 0
        ? "后台页面包含上线执行工作计划、交接摘要和可复制交接口径。"
        : `缺少 ${missing.join(", ")}`
      : `HTTP ${response.status}`,
    action:
      response.ok && missing.length === 0
        ? "保留后台交接区块。"
        : "检查 /admin/health 中的上线执行工作计划和上线交接摘要区块。",
  });
}

async function checkRuntime(result, input) {
  if (!input.baseUrl) {
    return;
  }

  await checkHandoffRuntime(result, input);
  await checkWorkplanRuntime(result, input);
  await checkAdminHealthRuntime(result, input);
}

function printText(result) {
  console.log(`上线交接与执行计划验收 mode=${result.mode}`);
  console.log(`baseUrl=${result.baseUrl ?? "未启用运行时检查"}`);
  console.log(
    `summary ready=${result.summary.ready} warning=${result.summary.warning} blocking=${result.summary.blocking} total=${result.summary.total}`,
  );
  console.log("");

  for (const check of result.checks) {
    const prefix = check.status === statuses.ready ? "[OK]" : check.status === statuses.warning ? "[WARN]" : "[BLOCKING]";

    console.log(`${prefix} ${check.group} / ${check.label}`);
    console.log(`  ${check.detail}`);
    console.log(`  ${check.action}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  try {
    args.baseUrl = normalizeBaseUrl(args.baseUrl);
  } catch (error) {
    console.error(readError(error));
    process.exit(1);
  }

  if (!validateTimeoutMs(args.timeoutMs)) {
    console.error("--timeout-ms must be an integer between 1000 and 120000.");
    process.exit(1);
  }

  const root = process.cwd();
  const result = createResult(args);

  checkStaticWiring(result, root);

  try {
    await checkRuntime(result, args);
  } catch (error) {
    addCheck(result, {
      id: "runtime:error",
      group: "运行时",
      label: "运行时请求",
      status: statuses.blocking,
      detail: readError(error),
      action: "确认本地服务已启动、后台 token 正确，并重试交接与执行计划运行时检查。",
    });
  }

  summarize(result);

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printText(result);
  }

  if (!result.ok && !args.noFail) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(readError(error));
  process.exit(1);
});
