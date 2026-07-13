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
  "src/lib/launch-weekly-focus.ts",
  "src/lib/launch-weekly-commitments.ts",
  "src/app/api/admin/launch/weekly-focus/route.ts",
  "src/app/admin/launch-weekly-focus-form.tsx",
  "src/app/admin/health/page.tsx",
  "package.json",
  "README.md",
  "docs/TECH_ARCHITECTURE.md",
  "docs/PROJECT_PLAN.md",
  "docs/SPRINT_01.md",
  "docs/EXECUTION_ROADMAP.md",
];
const summaryKeys = [
  "ready",
  "warning",
  "blocking",
  "total",
  "overdue",
  "today",
  "thisWeek",
  "unscheduled",
  "committed",
  "uncommitted",
  "commitmentCoveragePercent",
  "commitmentTodo",
  "commitmentInProgress",
  "commitmentBlocked",
  "commitmentDone",
];
const requiredSources = [
  "getLaunchWorkplan",
  "getLaunchScheduleRisk",
  "getLaunchFounderDossier",
  "getLaunchApplicationPack",
  "getLaunchRolloutPlan",
  "getLaunchWeeklyCommitments",
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
    action: exists ? "保留该文件。" : "恢复本周推进验收所需文件。",
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

  const weeklyFocus = readProjectFile(root, "src/lib/launch-weekly-focus.ts");
  const commitments = readProjectFile(root, "src/lib/launch-weekly-commitments.ts");
  const route = readProjectFile(root, "src/app/api/admin/launch/weekly-focus/route.ts");
  const form = readProjectFile(root, "src/app/admin/launch-weekly-focus-form.tsx");
  const healthPage = readProjectFile(root, "src/app/admin/health/page.tsx");
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
    id: "weekly-focus-aggregation",
    group: "本周推进",
    label: "本周推进看板聚合",
    content: weeklyFocus,
    tokens: [
      "getLaunchWeeklyFocus",
      ...requiredSources,
      "focusItems",
      "commitmentGaps",
      "ownerGroups",
      "commitmentCoveragePercent",
      "currentPhase",
      "copyText",
      "玄机 AI 本周推进看板",
    ],
    readyDetail: "本周推进看板会聚合执行计划、排期风险、创始人办理包、平台申请、灰度阶段和已保存承诺。",
    readyAction: "保留 getLaunchWeeklyFocus，作为周计划和每日动作的承诺来源。",
    blockingAction: "恢复 launch-weekly-focus.ts 的聚合输入、focusItems、commitmentGaps、ownerGroups 和 copyText。",
  });

  checkContainsAll(result, {
    id: "weekly-focus-summary",
    group: "本周推进",
    label: "承诺覆盖与分组统计",
    content: weeklyFocus,
    tokens: [
      ...summaryKeys,
      "buildOwnerGroups",
      "buildLaneFocus",
      "statusFromSummary",
      "suggestedTargetDate",
      "commitmentGapReason",
    ],
    readyDetail: "看板会输出本周阻断、到期、未排期、承诺覆盖率、承诺状态、负责人和工作线分组。",
    readyAction: "保留承诺覆盖率和负责人分组，用于周计划复盘。",
    blockingAction: "恢复 weekly focus 的 summary、负责人分组、工作线分组和建议承诺日。",
  });

  checkContainsAll(result, {
    id: "weekly-commitment-persistence",
    group: "承诺留痕",
    label: "本周承诺持久化",
    content: commitments,
    tokens: [
      "launch_weekly_commitments",
      "launch_weekly_commitments_updated",
      "saveLaunchWeeklyCommitment",
      "getLaunchWeeklyCommitments",
      "createUsageLog",
      "taskId",
      "targetDate",
      "status",
      "owner",
      "evidenceNote",
      "note",
      "updatedBy",
    ],
    readyDetail: "本周任务目标日期、负责人、承诺状态、证据备注和推进备注会写入 UsageLog 并可回读。",
    readyAction: "保留 UsageLog 承诺留痕；它只记录项目推进，不反向改变 Go/No-Go。",
    blockingAction: "恢复 launch-weekly-commitments.ts 的保存、读取和 metadata 结构。",
  });

  checkContainsAll(result, {
    id: "weekly-focus-api",
    group: "后台 API",
    label: "本周推进 GET/PATCH API",
    content: route,
    tokens: [
      "canAccessAdminRequest",
      "getLaunchWeeklyFocus",
      "saveLaunchWeeklyCommitment",
      "recordAdminAudit",
      "GET",
      "PATCH",
      "taskId",
      "targetDate",
      "evidenceNote",
      "cache-control",
      "no-store",
    ],
    readyDetail: "本周推进 API 支持只读获取和 PATCH 保存任务承诺，并写入后台审计。",
    readyAction: "保留 GET/PATCH API 作为后台快填和自动化验收入口。",
    blockingAction: "恢复 /api/admin/launch/weekly-focus 的鉴权、GET、PATCH、审计和 no-store 响应。",
  });

  checkContainsAll(result, {
    id: "weekly-focus-form",
    group: "后台页面",
    label: "本周承诺表单",
    content: form,
    tokens: [
      "AdminLaunchWeeklyFocusForm",
      "/api/admin/launch/weekly-focus",
      "PATCH",
      "taskId",
      "targetDate",
      "status",
      "owner",
      "evidenceNote",
      "note",
      "保存全部建议",
      "保存承诺",
    ],
    readyDetail: "后台可单项或批量保存本周任务目标日期、负责人、状态和证据备注。",
    readyAction: "保留本周承诺表单，方便把 no_go 阻断拆成本周任务。",
    blockingAction: "恢复 AdminLaunchWeeklyFocusForm 的 PATCH、字段和批量保存能力。",
  });

  checkContainsAll(result, {
    id: "admin-health-weekly-focus",
    group: "后台页面",
    label: "/admin/health 本周推进区块",
    content: healthPage,
    tokens: [
      "id=\"launch-weekly-focus\"",
      "本周推进",
      "launchWeeklyFocus.summary.commitmentCoveragePercent",
      "launchWeeklyFocus.currentPhase",
      "本周阶段门槛",
      "canAdvance=yes",
      "本周重点任务",
      "负责人视图",
      "本周承诺",
      "AdminLaunchWeeklyFocusForm",
      "可复制本周看板",
    ],
    readyDetail: "后台健康页展示本周阻断、承诺覆盖、阶段门槛、重点任务、负责人视图、承诺表单和复制看板。",
    readyAction: "保留 /admin/health 的本周推进区块。",
    blockingAction: "恢复 /admin/health 的 launch-weekly-focus 区块、承诺表单和复制看板。",
  });

  checkContainsAll(result, {
    id: "package-weekly-focus-check",
    group: "脚本命令",
    label: "package 命令",
    content: packageJson,
    tokens: [
      "\"launch:weekly-focus-check\"",
      "scripts/launch-weekly-focus-check.mjs",
    ],
    readyDetail: "package.json 已注册本周推进验收脚本。",
    readyAction: "可通过 npm run launch:weekly-focus-check 验收。",
    blockingAction: "在 package.json scripts 中注册 launch:weekly-focus-check。",
  });

  checkContainsAll(result, {
    id: "docs-weekly-focus-check",
    group: "文档口径",
    label: "本周推进验收文档",
    content: docs,
    tokens: [
      "launch:weekly-focus-check",
      "/api/admin/launch/weekly-focus",
      "本周推进",
      "本周承诺",
      "承诺覆盖",
      "可复制本周看板",
    ],
    readyDetail: "README 和项目文档已说明本周推进检查命令、API、后台区块和承诺留痕口径。",
    readyAction: "保留文档口径，让每周推进流程可重复。",
    blockingAction: "补充 README 和项目文档中的 launch:weekly-focus-check 与本周推进验收说明。",
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
        "user-agent": "xuanji-launch-weekly-focus-check/1.0",
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

function hasWeeklyFocusShape(weeklyFocus) {
  const missingSummary = missingSummaryKeys(weeklyFocus?.summary);
  const focusItems = Array.isArray(weeklyFocus?.focusItems) ? weeklyFocus.focusItems : [];

  return (
    hasObject(weeklyFocus) &&
    typeof weeklyFocus.generatedAt === "string" &&
    typeof weeklyFocus.status === "string" &&
    typeof weeklyFocus.label === "string" &&
    typeof weeklyFocus.action === "string" &&
    typeof weeklyFocus.week?.today === "string" &&
    typeof weeklyFocus.week?.start === "string" &&
    typeof weeklyFocus.week?.end === "string" &&
    typeof weeklyFocus.currentPhase?.title === "string" &&
    missingSummary.length === 0 &&
    Array.isArray(weeklyFocus.lanes) &&
    Array.isArray(weeklyFocus.focusItems) &&
    Array.isArray(weeklyFocus.commitmentGaps) &&
    Array.isArray(weeklyFocus.ownerGroups) &&
    focusItems.every(
      (item) =>
        typeof item?.id === "string" &&
        typeof item?.title === "string" &&
        typeof item?.owner === "string" &&
        typeof item?.action === "string" &&
        typeof item?.evidence === "string",
    ) &&
    typeof weeklyFocus.copyText === "string" &&
    weeklyFocus.copyText.includes("玄机 AI 本周推进看板")
  );
}

async function fetchWeeklyFocus(result, input) {
  const url = `${input.baseUrl}${appendToken("/api/admin/launch/weekly-focus", input.adminToken)}`;

  try {
    const response = await fetchWithTimeout({
      url,
      timeoutMs: input.timeoutMs,
    });
    const payload = await response.json().catch(() => ({}));
    const weeklyFocus = payload?.weeklyFocus;
    const missingSummary = missingSummaryKeys(weeklyFocus?.summary);
    const focusItems = Array.isArray(weeklyFocus?.focusItems) ? weeklyFocus.focusItems : [];
    const ready = response.ok && payload?.ok === true && hasWeeklyFocusShape(weeklyFocus);

    addCheck(result, {
      id: "runtime:weekly-focus-api",
      group: "运行时",
      label: "本周推进 API",
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? `/api/admin/launch/weekly-focus 返回 ${focusItems.length} 个本周重点，承诺覆盖 ${weeklyFocus.summary.commitmentCoveragePercent}%，未承诺 ${weeklyFocus.summary.uncommitted} 项。`
        : `HTTP ${response.status}；summary 缺少：${missingSummary.join(", ") || "无"}；focusItems=${focusItems.length}；copyText=${typeof weeklyFocus?.copyText === "string" ? "有" : "缺失"}`,
      action: ready
        ? "保留本周推进 API；每周先补承诺覆盖，再进入每日动作。"
        : "检查 getLaunchWeeklyFocus 的 summary、focusItems、commitmentGaps、ownerGroups 和 copyText。",
    });

    return ready ? weeklyFocus : undefined;
  } catch (error) {
    addCheck(result, {
      id: "runtime:weekly-focus-api",
      group: "运行时",
      label: "本周推进 API",
      status: statuses.blocking,
      detail: error instanceof Error ? error.message : String(error),
      action: "确认应用已启动、base-url 可访问，并带上 ADMIN_ACCESS_TOKEN。",
    });
  }

  return undefined;
}

function targetDateFor(weeklyFocus, item) {
  return item?.suggestedTargetDate ?? item?.dueDate ?? weeklyFocus?.week?.end;
}

async function checkWeeklyFocusPatch(result, input, weeklyFocus) {
  const firstItem = Array.isArray(weeklyFocus?.focusItems) ? weeklyFocus.focusItems[0] : undefined;
  const targetDate = targetDateFor(weeklyFocus, firstItem);

  if (!firstItem?.id || !targetDate) {
    addCheck(result, {
      id: "runtime:weekly-focus-patch",
      group: "运行时",
      label: "本周承诺 PATCH 留痕",
      status: statuses.ready,
      detail: "当前没有本周重点任务或可用目标日期；PATCH 留痕在有任务时会自动验收。",
      action: "当本周重点任务出现后，用同一命令复核 PATCH 保存链路。",
    });
    return;
  }

  const url = `${input.baseUrl}${appendToken("/api/admin/launch/weekly-focus", input.adminToken)}`;
  const note = `launch:weekly-focus-check ${new Date().toISOString()}`;

  try {
    const response = await fetchWithTimeout({
      url,
      method: "PATCH",
      timeoutMs: input.timeoutMs,
      body: JSON.stringify({
        taskId: firstItem.id,
        status: "in_progress",
        targetDate,
        owner: "Codex",
        evidenceNote: note,
        note,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    const nextWeeklyFocus = payload?.weeklyFocus;
    const updatedItem = Array.isArray(nextWeeklyFocus?.focusItems)
      ? nextWeeklyFocus.focusItems.find((item) => item?.id === firstItem.id)
      : undefined;
    const ready =
      response.ok &&
      payload?.ok === true &&
      hasWeeklyFocusShape(nextWeeklyFocus) &&
      updatedItem?.commitment?.status === "in_progress" &&
      updatedItem?.commitment?.targetDate === targetDate &&
      updatedItem?.commitment?.owner === "Codex" &&
      updatedItem?.commitment?.evidenceNote === note;

    addCheck(result, {
      id: "runtime:weekly-focus-patch",
      group: "运行时",
      label: "本周承诺 PATCH 留痕",
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? `PATCH 保存 ${firstItem.id} 成功，并在返回看板中读回 in_progress、目标日、负责人和证据备注。`
        : `HTTP ${response.status}；ok=${payload?.ok === true ? "true" : "false"}；commitment=${updatedItem?.commitment ? "有" : "缺失"}`,
      action: ready
        ? "保留 PATCH 承诺留痕；它只影响项目承诺记录，不改变上线门禁。"
        : "检查 saveLaunchWeeklyCommitment、route PATCH、UsageLog 持久化和返回看板刷新。",
    });
  } catch (error) {
    addCheck(result, {
      id: "runtime:weekly-focus-patch",
      group: "运行时",
      label: "本周承诺 PATCH 留痕",
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
        id: "runtime:admin-health-weekly-focus",
        group: "运行时",
        label: "后台本周推进区块",
        status: statuses.blocking,
        detail: `HTTP ${response.status}`,
        action: "确认后台 token 正确，服务已启动，并检查 /admin/health。",
      });
      return;
    }

    const html = await response.text();
    const missing = [
      "id=\"launch-weekly-focus\"",
      "本周推进",
      "本周重点任务",
      "负责人视图",
      "本周承诺",
      "保存全部建议",
      "可复制本周看板",
      "canAdvance=",
      "承诺覆盖",
    ].filter((pattern) => !html.includes(pattern));

    addCheck(result, {
      id: "runtime:admin-health-weekly-focus",
      group: "运行时",
      label: "后台本周推进区块",
      status: missing.length === 0 ? statuses.ready : statuses.blocking,
      detail: missing.length === 0 ? "后台页面包含本周推进、承诺表单、阶段门槛和复制看板。" : `缺少 ${missing.join(", ")}`,
      action: missing.length === 0 ? "保留后台本周推进区块。" : "检查 /admin/health 的 launch-weekly-focus 区块。",
    });
  } catch (error) {
    addCheck(result, {
      id: "runtime:admin-health-weekly-focus",
      group: "运行时",
      label: "后台本周推进区块",
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

  const weeklyFocus = await fetchWeeklyFocus(result, input);

  await checkWeeklyFocusPatch(result, input, weeklyFocus);
  await checkAdminHealthRuntime(result, input);
}

function statusIcon(status) {
  return status === statuses.ready ? "OK" : "BLOCK";
}

function printTextReport(result) {
  console.log(`本周推进看板验收 mode=${result.mode}`);
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
