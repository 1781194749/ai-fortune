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
  "src/lib/launch-daily-brief.ts",
  "src/lib/launch-daily-action-progress.ts",
  "src/app/api/admin/launch/daily-brief/route.ts",
  "src/app/admin/launch-daily-action-progress-form.tsx",
  "src/app/admin/health/page.tsx",
  "package.json",
  "README.md",
  "docs/TECH_ARCHITECTURE.md",
  "docs/PROJECT_PLAN.md",
  "docs/SPRINT_01.md",
  "docs/EXECUTION_ROADMAP.md",
];
const summaryKeys = [
  "goNoGoBlocking",
  "workstreamBlocking",
  "weeklyBlocking",
  "weeklyUncommitted",
  "commitmentCoveragePercent",
  "goalBlocking",
  "goalProgressSaved",
  "transitionCanAdvance",
  "transitionBlocking",
  "transitionWarning",
  "offlineBlocking",
  "offlineWarning",
  "evidenceState",
  "todayActionCount",
  "actionProgressSaved",
];
const expectedActionSources = [
  "production_gate",
  "offline_action",
  "blocker_dashboard",
  "weekly_focus",
  "goal_transition",
  "goal_plan",
  "evidence",
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

function checkFileExists(result, root, filename) {
  const exists = existsSync(path.resolve(root, filename));

  addCheck(result, {
    id: `file:${filename}`,
    group: "静态文件",
    label: filename,
    status: exists ? statuses.ready : statuses.blocking,
    detail: exists ? "文件存在。" : "文件不存在。",
    action: exists ? "保留该文件。" : "恢复今日目标推进日报验收所需文件。",
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

function checkStaticWiring(result, root) {
  for (const filename of requiredFiles) {
    checkFileExists(result, root, filename);
  }

  const dailyBrief = readProjectFile(root, "src/lib/launch-daily-brief.ts");
  const actionProgress = readProjectFile(root, "src/lib/launch-daily-action-progress.ts");
  const route = readProjectFile(root, "src/app/api/admin/launch/daily-brief/route.ts");
  const form = readProjectFile(root, "src/app/admin/launch-daily-action-progress-form.tsx");
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
    id: "daily-brief-aggregation",
    group: "日报聚合",
    label: "今日目标推进日报聚合",
    content: dailyBrief,
    tokens: [
      "getLaunchDailyBrief",
      "getLaunchPackage",
      "getLaunchProductionGate",
      "getLaunchBlockerDashboard",
      "getLaunchGoalPlan",
      "getLaunchWeeklyFocus",
      "getLaunchOfflineActionPack",
      "getLaunchDailyActionProgress",
      "productionGate",
      "transitionGate",
      "offlineAction",
      "goalSnapshot",
      "todayActions",
      "primaryAction",
      "copyText",
      "玄机 AI 今日目标推进日报",
    ],
    readyDetail: "今日目标推进日报会聚合上线包、生产总门禁、阻断总控、目标规划、本周承诺、线下办理和今日执行记录。",
    readyAction: "保留 getLaunchDailyBrief，作为每天开工第一入口。",
    blockingAction: "恢复 launch-daily-brief.ts 的聚合输入、summary、todayActions 和 copyText。",
  });

  checkContainsAll(result, {
    id: "daily-brief-action-sources",
    group: "日报聚合",
    label: "今日优先动作来源",
    content: dailyBrief,
    tokens: [
      ...expectedActionSources.map((source) => `"${source}"`),
      "actionFromProductionGate",
      "actionFromOfflineActionPack",
      "actionFromGoalTransitionGate",
      "actionFromPackageEvidence",
      "sortActions",
      "uniqueActions",
    ],
    readyDetail: "生产门禁、线下办理、阻断总控、目标阶段门槛、证据、本周承诺和目标规划都会进入今日动作候选。",
    readyAction: "保留动作来源排序，确保今天先办项稳定可解释。",
    blockingAction: "恢复 daily brief 的 production_gate、offline_action、goal_transition 等动作来源。",
  });

  checkContainsAll(result, {
    id: "daily-action-progress-persistence",
    group: "执行留痕",
    label: "今日动作执行持久化",
    content: actionProgress,
    tokens: [
      "launch_daily_action_progress",
      "launch_daily_action_progress_updated",
      "saveLaunchDailyActionProgress",
      "getLaunchDailyActionProgress",
      "createUsageLog",
      "actionId",
      "status",
      "owner",
      "evidenceNote",
      "note",
      "updatedBy",
    ],
    readyDetail: "今日动作执行状态、负责人、证据备注和推进备注会写入 UsageLog 并可回读。",
    readyAction: "保留 UsageLog 留痕；它只记录执行状态，不反向改变 Go/No-Go。",
    blockingAction: "恢复 launch-daily-action-progress.ts 的保存、读取和 metadata 结构。",
  });

  checkContainsAll(result, {
    id: "daily-brief-api",
    group: "后台 API",
    label: "日报 GET/PATCH API",
    content: route,
    tokens: [
      "canAccessAdminRequest",
      "getLaunchDailyBrief",
      "saveLaunchDailyActionProgress",
      "recordAdminAudit",
      "GET",
      "PATCH",
      "actionId",
      "evidenceNote",
      "cache-control",
      "no-store",
    ],
    readyDetail: "日报 API 支持只读获取和 PATCH 保存今日动作执行留痕，并写入后台审计。",
    readyAction: "保留 GET/PATCH API 作为后台快填和自动化验收入口。",
    blockingAction: "恢复 /api/admin/launch/daily-brief 的鉴权、GET、PATCH、审计和 no-store 响应。",
  });

  checkContainsAll(result, {
    id: "daily-action-form",
    group: "后台页面",
    label: "今日动作执行快填",
    content: form,
    tokens: [
      "AdminLaunchDailyActionProgressForm",
      "/api/admin/launch/daily-brief",
      "PATCH",
      "actionId",
      "status",
      "owner",
      "evidenceNote",
      "note",
      "保存全部动作",
      "这里只做执行留痕",
    ],
    readyDetail: "后台可逐项或批量保存今日动作状态、负责人、证据备注和推进备注。",
    readyAction: "保留快填组件，方便每天把执行进展沉淀进 UsageLog。",
    blockingAction: "恢复 AdminLaunchDailyActionProgressForm 的 PATCH、字段和批量保存能力。",
  });

  checkContainsAll(result, {
    id: "admin-health-daily-brief",
    group: "后台页面",
    label: "/admin/health 日报区块",
    content: healthPage,
    tokens: [
      "id=\"launch-daily-brief\"",
      "今日目标推进日报",
      "launchDailyBrief.productionGate",
      "releaseReady=yes",
      "launchDailyBrief.transitionGate",
      "canAdvance=yes",
      "launchDailyBrief.offlineAction",
      "今日优先动作",
      "AdminLaunchDailyActionProgressForm",
      "可复制推进日报",
    ],
    readyDetail: "后台健康页展示生产门禁、阶段门槛、线下办理、今日优先动作、快填和可复制日报。",
    readyAction: "保留 /admin/health 的今日目标推进日报区块。",
    blockingAction: "恢复 /admin/health 的 launch-daily-brief 区块、快填和复制日报。",
  });

  checkContainsAll(result, {
    id: "package-daily-brief-check",
    group: "脚本命令",
    label: "package 命令",
    content: packageJson,
    tokens: [
      "\"launch:daily-brief-check\"",
      "scripts/launch-daily-brief-check.mjs",
    ],
    readyDetail: "package.json 已注册今日目标推进日报验收脚本。",
    readyAction: "可通过 npm run launch:daily-brief-check 验收。",
    blockingAction: "在 package.json scripts 中注册 launch:daily-brief-check。",
  });

  checkContainsAll(result, {
    id: "docs-daily-brief-check",
    group: "文档口径",
    label: "日报验收文档",
    content: docs,
    tokens: [
      "launch:daily-brief-check",
      "/api/admin/launch/daily-brief",
      "今日目标推进日报",
      "今日优先动作",
      "今日动作执行快填",
      "可复制推进日报",
    ],
    readyDetail: "README 和项目文档已说明每日开工检查命令、API、后台区块和执行留痕口径。",
    readyAction: "保留文档口径，让每天开工流程可重复。",
    blockingAction: "补充 README 和项目文档中的 launch:daily-brief-check 与日报验收说明。",
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
        accept: input.accept ?? "application/json",
        ...(input.body ? { "content-type": "application/json" } : {}),
        "user-agent": "xuanji-launch-daily-brief-check/1.0",
      },
      body: input.body,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function hasObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function missingSummaryKeys(summary) {
  return summaryKeys.filter((key) => !(key in (summary ?? {})));
}

function actionSources(actions) {
  return new Set(actions.map((action) => action?.source).filter(Boolean));
}

function shouldHaveSource(brief, source) {
  if (source === "production_gate") {
    return brief?.productionGate?.status !== "ready";
  }

  if (source === "offline_action") {
    return brief?.offlineAction?.status !== "ready";
  }

  if (source === "goal_transition") {
    return brief?.transitionGate?.canAdvance === false;
  }

  return false;
}

function missingConditionalSources(brief) {
  const sources = actionSources(Array.isArray(brief?.todayActions) ? brief.todayActions : []);

  return ["production_gate", "offline_action", "goal_transition"].filter(
    (source) => shouldHaveSource(brief, source) && !sources.has(source),
  );
}

function hasDailyBriefShape(brief) {
  const missingSummary = missingSummaryKeys(brief?.summary);
  const actions = Array.isArray(brief?.todayActions) ? brief.todayActions : [];

  return (
    hasObject(brief) &&
    typeof brief.generatedAt === "string" &&
    typeof brief.today === "string" &&
    typeof brief.status === "string" &&
    typeof brief.label === "string" &&
    typeof brief.action === "string" &&
    missingSummary.length === 0 &&
    typeof brief.productionGate?.releaseReady === "boolean" &&
    typeof brief.transitionGate?.canAdvance === "boolean" &&
    typeof brief.offlineAction?.current?.title === "string" &&
    typeof brief.goalSnapshot?.title === "string" &&
    hasObject(brief.evidence) &&
    actions.every(
      (item) =>
        typeof item?.id === "string" &&
        typeof item?.source === "string" &&
        typeof item?.title === "string" &&
        typeof item?.action === "string" &&
        typeof item?.evidence === "string",
    ) &&
    typeof brief.copyText === "string" &&
    brief.copyText.includes("玄机 AI 今日目标推进日报")
  );
}

async function fetchDailyBrief(result, input) {
  const url = `${input.baseUrl}${appendToken("/api/admin/launch/daily-brief", input.adminToken)}`;

  try {
    const response = await fetchWithTimeout({
      url,
      timeoutMs: input.timeoutMs,
    });
    const payload = await response.json().catch(() => ({}));
    const brief = payload?.dailyBrief;
    const missingSummary = missingSummaryKeys(brief?.summary);
    const missingSources = missingConditionalSources(brief);
    const actions = Array.isArray(brief?.todayActions) ? brief.todayActions : [];
    const ready =
      response.ok &&
      payload?.ok === true &&
      hasDailyBriefShape(brief) &&
      missingSources.length === 0;

    addCheck(result, {
      id: "runtime:daily-brief-api",
      group: "运行时",
      label: "今日目标推进日报 API",
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? `/api/admin/launch/daily-brief 返回 ${actions.length} 个今日动作，生产门禁 releaseReady=${brief.productionGate.releaseReady ? "yes" : "no"}，阶段 canAdvance=${brief.transitionGate.canAdvance ? "yes" : "no"}。`
        : `HTTP ${response.status}；summary 缺少：${missingSummary.join(", ") || "无"}；条件动作缺少：${missingSources.join(", ") || "无"}；copyText=${typeof brief?.copyText === "string" ? "有" : "缺失"}`,
      action: ready
        ? "保留日报 API；每天开工先看今日动作和阶段门槛。"
        : "检查 getLaunchDailyBrief 的 summary、productionGate、transitionGate、offlineAction、todayActions 和 copyText。",
    });

    return ready ? brief : undefined;
  } catch (error) {
    addCheck(result, {
      id: "runtime:daily-brief-api",
      group: "运行时",
      label: "今日目标推进日报 API",
      status: statuses.blocking,
      detail: error instanceof Error ? error.message : String(error),
      action: "确认应用已启动、base-url 可访问，并带上 ADMIN_ACCESS_TOKEN。",
    });
  }

  return undefined;
}

async function checkDailyBriefPatch(result, input, brief) {
  const firstAction = Array.isArray(brief?.todayActions) ? brief.todayActions[0] : undefined;

  if (!firstAction?.id) {
    addCheck(result, {
      id: "runtime:daily-brief-patch",
      group: "运行时",
      label: "今日动作 PATCH 留痕",
      status: statuses.ready,
      detail: "当前没有今日动作可写入；PATCH 留痕在有动作时会自动验收。",
      action: "当今日动作出现后，用同一命令复核 PATCH 保存链路。",
    });
    return;
  }

  const url = `${input.baseUrl}${appendToken("/api/admin/launch/daily-brief", input.adminToken)}`;
  const note = `launch:daily-brief-check ${new Date().toISOString()}`;

  try {
    const response = await fetchWithTimeout({
      url,
      method: "PATCH",
      timeoutMs: input.timeoutMs,
      body: JSON.stringify({
        actionId: firstAction.id,
        status: "in_progress",
        owner: "Codex",
        evidenceNote: note,
        note,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    const nextBrief = payload?.dailyBrief;
    const updatedAction = Array.isArray(nextBrief?.todayActions)
      ? nextBrief.todayActions.find((item) => item?.id === firstAction.id)
      : undefined;
    const ready =
      response.ok &&
      payload?.ok === true &&
      hasDailyBriefShape(nextBrief) &&
      updatedAction?.progress?.status === "in_progress" &&
      updatedAction?.progress?.owner === "Codex" &&
      updatedAction?.progress?.evidenceNote === note;

    addCheck(result, {
      id: "runtime:daily-brief-patch",
      group: "运行时",
      label: "今日动作 PATCH 留痕",
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? `PATCH 保存 ${firstAction.id} 成功，并在返回日报中读回 in_progress、负责人和证据备注。`
        : `HTTP ${response.status}；ok=${payload?.ok === true ? "true" : "false"}；progress=${updatedAction?.progress ? "有" : "缺失"}`,
      action: ready
        ? "保留 PATCH 留痕；它只影响执行记录，不改变上线门禁。"
        : "检查 saveLaunchDailyActionProgress、route PATCH、UsageLog 持久化和返回日报刷新。",
    });
  } catch (error) {
    addCheck(result, {
      id: "runtime:daily-brief-patch",
      group: "运行时",
      label: "今日动作 PATCH 留痕",
      status: statuses.blocking,
      detail: error instanceof Error ? error.message : String(error),
      action: "确认应用已启动、base-url 可访问，并带上 ADMIN_ACCESS_TOKEN。",
    });
  }
}

async function checkAdminHealthRuntime(result, input) {
  const url = `${input.baseUrl}${appendToken("/admin/health", input.adminToken)}`;

  try {
    const response = await fetchWithTimeout({
      url,
      timeoutMs: input.timeoutMs,
      accept: "text/html",
    });

    if (response.status !== 200) {
      addCheck(result, {
        id: "runtime:admin-health-daily-brief",
        group: "运行时",
        label: "后台日报区块",
        status: statuses.blocking,
        detail: `HTTP ${response.status}`,
        action: "确认后台 token 正确，服务已启动，并检查 /admin/health。",
      });
      return;
    }

    const html = await response.text();
    const missing = [
      "id=\"launch-daily-brief\"",
      "今日目标推进日报",
      "今日优先动作",
      "今日动作执行快填",
      "可复制推进日报",
      "releaseReady=",
      "canAdvance=",
      "线下办理",
    ].filter((pattern) => !html.includes(pattern));

    addCheck(result, {
      id: "runtime:admin-health-daily-brief",
      group: "运行时",
      label: "后台日报区块",
      status: missing.length === 0 ? statuses.ready : statuses.blocking,
      detail: missing.length === 0 ? "后台页面包含今日目标推进日报、今日动作、快填和复制日报。" : `缺少 ${missing.join(", ")}`,
      action: missing.length === 0 ? "保留后台日报区块。" : "检查 /admin/health 的 launch-daily-brief 区块。",
    });
  } catch (error) {
    addCheck(result, {
      id: "runtime:admin-health-daily-brief",
      group: "运行时",
      label: "后台日报区块",
      status: statuses.blocking,
      detail: error instanceof Error ? error.message : String(error),
      action: "确认 base-url 可访问，必要时加大 --timeout-ms。",
    });
  }
}

async function runRuntimeChecks(result, input) {
  if (!input.baseUrl) {
    return;
  }

  try {
    new URL(input.baseUrl);
  } catch {
    addCheck(result, {
      id: "runtime:base-url",
      group: "运行时",
      label: "base-url",
      status: statuses.blocking,
      detail: "不是有效 URL。",
      action: "使用 --base-url=http://localhost:3000 或正式 HTTPS 域名。",
    });
    return;
  }

  const brief = await fetchDailyBrief(result, input);

  await checkDailyBriefPatch(result, input, brief);
  await checkAdminHealthRuntime(result, input);
}

function statusIcon(status) {
  return status === statuses.ready ? "OK" : "BLOCK";
}

function printTextReport(result) {
  console.log(`今日目标推进日报验收 mode=${result.mode}`);
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

const result = createResult({
  baseUrl: args.baseUrl ? normalizeBaseUrl(args.baseUrl) : undefined,
});

checkStaticWiring(result, process.cwd());
await runRuntimeChecks(result, {
  baseUrl: result.baseUrl,
  adminToken: args.adminToken,
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
