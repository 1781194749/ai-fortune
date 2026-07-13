#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const statuses = {
  ready: "ready",
  blocking: "blocking",
};

const defaultTimeoutMs = 45000;
const milestoneIds = ["start", "paid_smoke", "retention", "international"];
const summaryKeys = ["ready", "warning", "blocking", "total"];
const requiredFiles = [
  "src/lib/launch-goal-plan.ts",
  "src/lib/launch-goal-progress.ts",
  "src/app/api/admin/launch/goal-plan/route.ts",
  "src/app/admin/launch-goal-progress-form.tsx",
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
    action: exists ? "保留该文件。" : "恢复 30/60/90 目标规划验收所需文件。",
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

  const goalPlan = readProjectFile(root, "src/lib/launch-goal-plan.ts");
  const goalProgress = readProjectFile(root, "src/lib/launch-goal-progress.ts");
  const route = readProjectFile(root, "src/app/api/admin/launch/goal-plan/route.ts");
  const form = readProjectFile(root, "src/app/admin/launch-goal-progress-form.tsx");
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
    id: "goal-plan-aggregation",
    group: "目标规划",
    label: "30/60/90 目标规划聚合",
    content: goalPlan,
    tokens: [
      "getLaunchGoalPlan",
      "getLaunchDecision",
      "getLaunchWeeklyFocus",
      "getLaunchScheduleRisk",
      "getLaunchRolloutPlan",
      "getLaunchEvidenceGap",
      "getLaunchUnitEconomics",
      "getLaunchGoalProgress",
      "currentMilestone",
      "transitionGate",
      "milestones",
      "copyText",
      "玄机 AI 30/60/90 天目标规划",
    ],
    readyDetail: "目标规划会聚合最终决策、本周推进、排期风险、灰度阶段、证据缺口、单位经济和目标推进记录。",
    readyAction: "保留 getLaunchGoalPlan，作为阶段推进和复盘的主口径。",
    blockingAction: "恢复 launch-goal-plan.ts 的聚合输入、milestones、currentMilestone、transitionGate 和 copyText。",
  });

  checkContainsAll(result, {
    id: "goal-plan-milestones",
    group: "目标规划",
    label: "四阶段目标结构",
    content: goalPlan,
    tokens: [
      ...milestoneIds.map((id) => `"${id}"`),
      "buildStartMilestone",
      "buildPaidSmokeMilestone",
      "buildRetentionMilestone",
      "buildInternationalMilestone",
      "0-14 天：开工闭环",
      "15-30 天：小额真实订单",
      "31-60 天：复购与会员档案",
      "61-90 天：海外结构预留",
      "metrics",
      "exitCriteria",
      "nextActions",
      "evidence",
    ],
    readyDetail: "目标规划包含 0-14、15-30、31-60、61-90 天四个阶段、指标、退出标准、下一步和证据。",
    readyAction: "保留四阶段结构，避免目标规划退化成纯文档。",
    blockingAction: "恢复 launch-goal-plan.ts 的四阶段 milestone 构建和关键字段。",
  });

  checkContainsAll(result, {
    id: "goal-transition-gate",
    group: "阶段门槛",
    label: "阶段推进门槛",
    content: goalPlan,
    tokens: [
      "buildTransitionGate",
      "canAdvance",
      "current_stage_system",
      "current_stage_progress",
      "current_stage_evidence",
      "next_stage_entry",
      "summary",
      "blockers",
      "warnings",
      "阶段推进门槛",
    ],
    readyDetail: "阶段推进门槛会核对系统状态、人工推进、证据备注和下一阶段入口。",
    readyAction: "保留 transitionGate，防止未闭合当前阶段就进入下一阶段。",
    blockingAction: "恢复 buildTransitionGate、canAdvance、四个检查项和阻断/警告输出。",
  });

  checkContainsAll(result, {
    id: "goal-progress-persistence",
    group: "目标推进",
    label: "目标推进持久化",
    content: goalProgress,
    tokens: [
      "launch_goal_progress",
      "launch_goal_progress_updated",
      "saveLaunchGoalProgress",
      "getLaunchGoalProgress",
      "createUsageLog",
      "milestoneId",
      "targetDate",
      "status",
      "owner",
      "evidenceNote",
      "note",
      "updatedBy",
    ],
    readyDetail: "阶段目标日、负责人、推进状态、证据备注和推进备注会写入 UsageLog 并可回读。",
    readyAction: "保留 UsageLog 目标推进留痕；它只记录项目推进，不反向改变 Go/No-Go。",
    blockingAction: "恢复 launch-goal-progress.ts 的保存、读取和 metadata 结构。",
  });

  checkContainsAll(result, {
    id: "goal-plan-api",
    group: "后台 API",
    label: "目标规划 GET/PATCH API",
    content: route,
    tokens: [
      "canAccessAdminRequest",
      "getLaunchGoalPlan",
      "saveLaunchGoalProgress",
      "recordAdminAudit",
      "GET",
      "PATCH",
      "milestoneId",
      "targetDate",
      "evidenceNote",
      "cache-control",
      "no-store",
    ],
    readyDetail: "目标规划 API 支持只读获取和 PATCH 保存阶段推进，并写入后台审计。",
    readyAction: "保留 GET/PATCH API 作为后台快填和自动化验收入口。",
    blockingAction: "恢复 /api/admin/launch/goal-plan 的鉴权、GET、PATCH、审计和 no-store 响应。",
  });

  checkContainsAll(result, {
    id: "goal-progress-form",
    group: "后台页面",
    label: "目标推进快填",
    content: form,
    tokens: [
      "AdminLaunchGoalProgressForm",
      "/api/admin/launch/goal-plan",
      "PATCH",
      "milestoneId",
      "targetDate",
      "status",
      "owner",
      "evidenceNote",
      "note",
      "保存全部阶段",
      "真实上线闸门仍由系统检查决定",
    ],
    readyDetail: "后台可单项或批量保存阶段目标日、负责人、推进状态和证据备注。",
    readyAction: "保留目标推进快填，方便把阶段规划沉淀进 UsageLog。",
    blockingAction: "恢复 AdminLaunchGoalProgressForm 的 PATCH、字段和批量保存能力。",
  });

  checkContainsAll(result, {
    id: "admin-health-goal-plan",
    group: "后台页面",
    label: "/admin/health 目标规划区块",
    content: healthPage,
    tokens: [
      "id=\"launch-goal-plan\"",
      "开工目标",
      "30 / 60 / 90",
      "launchGoalPlan.currentMilestone",
      "launchGoalPlan.transitionGate",
      "canAdvance=yes",
      "AdminLaunchGoalProgressForm",
      "阶段推进门槛",
      "当前阶段指标",
      "当前阶段下一步",
      "可复制目标规划",
    ],
    readyDetail: "后台健康页展示 30/60/90 目标、阶段门槛、快填、当前指标、下一步和复制规划。",
    readyAction: "保留 /admin/health 的目标规划区块。",
    blockingAction: "恢复 /admin/health 的 launch-goal-plan 区块、快填、阶段门槛和复制规划。",
  });

  checkContainsAll(result, {
    id: "package-goal-plan-check",
    group: "脚本命令",
    label: "package 命令",
    content: packageJson,
    tokens: [
      "\"launch:goal-plan-check\"",
      "scripts/launch-goal-plan-check.mjs",
    ],
    readyDetail: "package.json 已注册目标规划验收脚本。",
    readyAction: "可通过 npm run launch:goal-plan-check 验收。",
    blockingAction: "在 package.json scripts 中注册 launch:goal-plan-check。",
  });

  checkContainsAll(result, {
    id: "docs-goal-plan-check",
    group: "文档口径",
    label: "目标规划验收文档",
    content: docs,
    tokens: [
      "launch:goal-plan-check",
      "/api/admin/launch/goal-plan",
      "30/60/90",
      "目标推进快填",
      "阶段推进门槛",
      "可复制目标规划",
    ],
    readyDetail: "README 和项目文档已说明目标规划检查命令、API、后台区块和推进留痕口径。",
    readyAction: "保留文档口径，让阶段规划可重复验收。",
    blockingAction: "补充 README 和项目文档中的 launch:goal-plan-check 与目标规划验收说明。",
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
        "user-agent": "xuanji-launch-goal-plan-check/1.0",
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

function hasAllMilestones(milestones) {
  const ids = new Set(Array.isArray(milestones) ? milestones.map((item) => item?.id) : []);

  return milestoneIds.every((id) => ids.has(id));
}

function hasGoalPlanShape(goalPlan) {
  const missingSummary = missingSummaryKeys(goalPlan?.summary);
  const milestones = Array.isArray(goalPlan?.milestones) ? goalPlan.milestones : [];
  const transitionChecks = Array.isArray(goalPlan?.transitionGate?.checks)
    ? goalPlan.transitionGate.checks
    : [];

  return (
    hasObject(goalPlan) &&
    typeof goalPlan.generatedAt === "string" &&
    typeof goalPlan.today === "string" &&
    typeof goalPlan.status === "string" &&
    typeof goalPlan.label === "string" &&
    typeof goalPlan.action === "string" &&
    missingSummary.length === 0 &&
    hasAllMilestones(milestones) &&
    milestones.length === milestoneIds.length &&
    milestones.every(
      (item) =>
        typeof item?.id === "string" &&
        typeof item?.title === "string" &&
        typeof item?.targetDate === "string" &&
        typeof item?.owner === "string" &&
        Array.isArray(item?.metrics) &&
        Array.isArray(item?.exitCriteria) &&
        Array.isArray(item?.nextActions) &&
        Array.isArray(item?.evidence),
    ) &&
    typeof goalPlan.currentMilestone?.id === "string" &&
    typeof goalPlan.transitionGate?.canAdvance === "boolean" &&
    typeof goalPlan.transitionGate?.label === "string" &&
    typeof goalPlan.transitionGate?.summary?.blocking === "number" &&
    transitionChecks.length >= 4 &&
    typeof goalPlan.copyText === "string" &&
    goalPlan.copyText.includes("玄机 AI 30/60/90 天目标规划")
  );
}

async function fetchGoalPlan(result, input) {
  const url = `${input.baseUrl}${appendToken("/api/admin/launch/goal-plan", input.adminToken)}`;

  try {
    const response = await fetchWithTimeout({
      url,
      timeoutMs: input.timeoutMs,
    });
    const payload = await response.json().catch(() => ({}));
    const goalPlan = payload?.goalPlan;
    const missingSummary = missingSummaryKeys(goalPlan?.summary);
    const milestones = Array.isArray(goalPlan?.milestones) ? goalPlan.milestones : [];
    const ready = response.ok && payload?.ok === true && hasGoalPlanShape(goalPlan);

    addCheck(result, {
      id: "runtime:goal-plan-api",
      group: "运行时",
      label: "目标规划 API",
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? `/api/admin/launch/goal-plan 返回 ${milestones.length} 个阶段，当前阶段 ${goalPlan.currentMilestone.id}，canAdvance=${goalPlan.transitionGate.canAdvance ? "yes" : "no"}。`
        : `HTTP ${response.status}；summary 缺少：${missingSummary.join(", ") || "无"}；milestones=${milestones.length}；copyText=${typeof goalPlan?.copyText === "string" ? "有" : "缺失"}`,
      action: ready
        ? "保留目标规划 API；每次阶段推进前先看 canAdvance 和当前阶段证据。"
        : "检查 getLaunchGoalPlan 的 milestones、currentMilestone、transitionGate、summary 和 copyText。",
    });

    return ready ? goalPlan : undefined;
  } catch (error) {
    addCheck(result, {
      id: "runtime:goal-plan-api",
      group: "运行时",
      label: "目标规划 API",
      status: statuses.blocking,
      detail: error instanceof Error ? error.message : String(error),
      action: "确认应用已启动、base-url 可访问，并带上 ADMIN_ACCESS_TOKEN。",
    });
  }

  return undefined;
}

async function checkGoalPlanPatch(result, input, goalPlan) {
  const milestone = goalPlan?.currentMilestone;

  if (!milestone?.id || !milestone?.targetDate) {
    addCheck(result, {
      id: "runtime:goal-plan-patch",
      group: "运行时",
      label: "目标推进 PATCH 留痕",
      status: statuses.ready,
      detail: "当前没有可写入的目标阶段；PATCH 留痕在有目标阶段时会自动验收。",
      action: "当目标阶段出现后，用同一命令复核 PATCH 保存链路。",
    });
    return;
  }

  const url = `${input.baseUrl}${appendToken("/api/admin/launch/goal-plan", input.adminToken)}`;
  const note = `launch:goal-plan-check ${new Date().toISOString()}`;

  try {
    const response = await fetchWithTimeout({
      url,
      method: "PATCH",
      timeoutMs: input.timeoutMs,
      body: JSON.stringify({
        milestoneId: milestone.id,
        status: "in_progress",
        targetDate: milestone.targetDate,
        owner: "Codex",
        evidenceNote: note,
        note,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    const nextGoalPlan = payload?.goalPlan;
    const updatedMilestone = Array.isArray(nextGoalPlan?.milestones)
      ? nextGoalPlan.milestones.find((item) => item?.id === milestone.id)
      : undefined;
    const ready =
      response.ok &&
      payload?.ok === true &&
      hasGoalPlanShape(nextGoalPlan) &&
      updatedMilestone?.progress?.status === "in_progress" &&
      updatedMilestone?.progress?.targetDate === milestone.targetDate &&
      updatedMilestone?.progress?.owner === "Codex" &&
      updatedMilestone?.progress?.evidenceNote === note;

    addCheck(result, {
      id: "runtime:goal-plan-patch",
      group: "运行时",
      label: "目标推进 PATCH 留痕",
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? `PATCH 保存 ${milestone.id} 成功，并在返回规划中读回 in_progress、目标日、负责人和证据备注。`
        : `HTTP ${response.status}；ok=${payload?.ok === true ? "true" : "false"}；progress=${updatedMilestone?.progress ? "有" : "缺失"}`,
      action: ready
        ? "保留 PATCH 目标推进留痕；它只影响项目推进记录，不改变上线门禁。"
        : "检查 saveLaunchGoalProgress、route PATCH、UsageLog 持久化和返回目标规划刷新。",
    });
  } catch (error) {
    addCheck(result, {
      id: "runtime:goal-plan-patch",
      group: "运行时",
      label: "目标推进 PATCH 留痕",
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
        id: "runtime:admin-health-goal-plan",
        group: "运行时",
        label: "后台目标规划区块",
        status: statuses.blocking,
        detail: `HTTP ${response.status}`,
        action: "确认后台 token 正确，服务已启动，并检查 /admin/health。",
      });
      return;
    }

    const html = await response.text();
    const missing = [
      "id=\"launch-goal-plan\"",
      "开工目标",
      "30 / 60 / 90",
      "目标推进快填",
      "阶段推进门槛",
      "canAdvance=",
      "当前阶段指标",
      "当前阶段下一步",
      "可复制目标规划",
    ].filter((pattern) => !html.includes(pattern));

    addCheck(result, {
      id: "runtime:admin-health-goal-plan",
      group: "运行时",
      label: "后台目标规划区块",
      status: missing.length === 0 ? statuses.ready : statuses.blocking,
      detail: missing.length === 0 ? "后台页面包含 30/60/90 目标规划、阶段门槛、快填和复制规划。" : `缺少 ${missing.join(", ")}`,
      action: missing.length === 0 ? "保留后台目标规划区块。" : "检查 /admin/health 的 launch-goal-plan 区块。",
    });
  } catch (error) {
    addCheck(result, {
      id: "runtime:admin-health-goal-plan",
      group: "运行时",
      label: "后台目标规划区块",
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

  const goalPlan = await fetchGoalPlan(result, input);

  await checkGoalPlanPatch(result, input, goalPlan);
  await checkAdminHealthRuntime(result, input);
}

function statusIcon(status) {
  return status === statuses.ready ? "OK" : "BLOCK";
}

function printTextReport(result) {
  console.log(`30/60/90 目标规划验收 mode=${result.mode}`);
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
