#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const statuses = {
  ready: "ready",
  warning: "warning",
  blocking: "blocking",
};

const defaultTimeoutMs = 45000;
const requiredFillIns = [
  {
    id: "fill_current_goal",
    sectionId: "launch-goal-plan",
    method: "PATCH",
    apiPath: "/api/admin/launch/goal-plan",
    payloadFields: ["milestoneId", "status", "targetDate", "owner", "evidenceNote", "note"],
    persistence: {
      feature: "launch_goal_progress",
      event: "launch_goal_progress_updated",
      model: "launch-goal-progress",
    },
  },
  {
    id: "fill_today_actions",
    sectionId: "launch-daily-brief",
    method: "PATCH",
    apiPath: "/api/admin/launch/daily-brief",
    payloadFields: ["actionId", "status", "owner", "evidenceNote", "note"],
    persistence: {
      feature: "launch_daily_action_progress",
      event: "launch_daily_action_progress_updated",
      model: "launch-daily-action-progress",
    },
  },
  {
    id: "fill_offline_action",
    sectionId: "launch-daily-brief",
    method: "PATCH",
    apiPath: "/api/admin/launch/daily-brief",
    payloadFields: ["actionId", "status", "owner", "evidenceNote", "note"],
    persistence: {
      feature: "launch_daily_action_progress",
      event: "launch_daily_action_progress_updated",
      model: "launch-daily-action-progress",
    },
  },
  {
    id: "fill_weekly_commitments",
    sectionId: "launch-weekly-focus",
    method: "PATCH",
    apiPath: "/api/admin/launch/weekly-focus",
    payloadFields: ["taskId", "status", "targetDate", "owner", "evidenceNote", "note"],
    persistence: {
      feature: "launch_weekly_commitments",
      event: "launch_weekly_commitments_updated",
      model: "launch-weekly-commitments",
    },
  },
  {
    id: "fill_evidence_action_center",
    sectionId: "launch-evidence-action-center",
    method: "POST",
    apiPath: "/api/admin/launch/evidence",
    payloadFields: ["note"],
    persistence: {
      feature: "launch_evidence",
      event: "launch_evidence",
      model: "launch-evidence",
    },
  },
  {
    id: "fill_evidence_archive",
    sectionId: "launch-evidence-archive",
    method: "POST",
    apiPath: "/api/admin/launch/evidence",
    payloadFields: ["note"],
    persistence: {
      feature: "launch_evidence",
      event: "launch_evidence",
      model: "launch-evidence",
    },
  },
  {
    id: "fill_next_milestone",
    sectionId: "launch-goal-plan",
    method: "PATCH",
    apiPath: "/api/admin/launch/goal-plan",
    payloadFields: ["milestoneId", "status", "targetDate", "owner", "evidenceNote", "note"],
    persistence: {
      feature: "launch_goal_progress",
      event: "launch_goal_progress_updated",
      model: "launch-goal-progress",
    },
  },
];
const requiredAnchors = [
  { id: "launch-daily-brief", label: "今日目标推进日报" },
  { id: "launch-offline-action-pack", label: "线下办理行动包" },
  { id: "launch-goal-plan", label: "开工目标" },
  { id: "launch-weekly-focus", label: "本周推进" },
  { id: "launch-evidence-action-center", label: "证据行动中心" },
  { id: "launch-evidence-archive", label: "上线证据归档" },
];
const docsWithGoalFollowupAcceptance = [
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

function createResult(input) {
  return {
    ok: false,
    generatedAt: new Date().toISOString(),
    baseUrl: input.baseUrl,
    mode: input.baseUrl ? "static+runtime" : "static",
    summary: {
      ready: 0,
      warning: 0,
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
    return undefined;
  }

  return readFileSync(absolutePath, "utf8");
}

function countOccurrences(content, pattern) {
  return content.split(pattern).length - 1;
}

function extractObjectBlockAroundId(content, id) {
  const idToken = `id: "${id}"`;
  const idIndex = content.indexOf(idToken);

  if (idIndex < 0) {
    return "";
  }

  const startIndex = content.lastIndexOf("{", idIndex);

  if (startIndex < 0) {
    return "";
  }

  let depth = 0;

  for (let index = startIndex; index < content.length; index += 1) {
    const char = content[index];

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;
    }

    if (depth === 0) {
      return content.slice(startIndex, index + 1);
    }
  }

  return "";
}

function checkFileExists(result, root, filename) {
  const exists = existsSync(path.resolve(root, filename));

  addCheck(result, {
    id: `file:${filename}`,
    group: "静态文件",
    label: filename,
    status: exists ? statuses.ready : statuses.blocking,
    detail: exists ? "文件存在。" : "文件不存在。",
    action: exists ? "保留该文件。" : "恢复目标推进链路所需文件。",
  });

  return exists;
}

function checkSourceFillIns(result, root) {
  const filename = "src/lib/launch-goal-followup.ts";
  const content = readProjectFile(root, filename);

  if (!content) {
    return;
  }

  for (const item of requiredFillIns) {
    const block = extractObjectBlockAroundId(content, item.id);
    const hasId = block.includes(`id: "${item.id}"`);
    const hasSection = block.includes(`sectionId: "${item.sectionId}"`);
    const hasMethod = block.includes(`method: "${item.method}"`);
    const hasApiPath = block.includes(`path: "${item.apiPath}"`);
    const hasPayloadTemplate = block.includes("payloadTemplate:");
    const hasPayloadFields = item.payloadFields.every((field) => block.includes(`${field}:`));
    const hasPersistence =
      block.includes("persistence:") &&
      block.includes('store: "UsageLog"') &&
      block.includes("feature:") &&
      block.includes("event:") &&
      block.includes(`model: "${item.persistence.model}"`) &&
      block.includes("purpose:");
    const ready =
      hasId &&
      hasSection &&
      hasMethod &&
      hasApiPath &&
      hasPayloadTemplate &&
      hasPayloadFields &&
      hasPersistence;

    addCheck(result, {
      id: `source-fill-in:${item.id}`,
      group: "目标补齐入口",
      label: item.id,
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? `${item.sectionId} -> ${item.method} ${item.apiPath}`
        : `缺少 id=${hasId} section=${hasSection} method=${hasMethod} api=${hasApiPath} payloadTemplate=${hasPayloadTemplate} payloadFields=${hasPayloadFields} persistence=${hasPersistence}`,
      action: ready
        ? "保留该入口映射。"
        : "在 launch-goal-followup.ts 的对应入口中补齐 sectionId、method、api.path、入口 id、payloadTemplate 和持久化证据映射。",
    });
  }

  const copyReady =
    content.includes("补齐入口：") &&
    content.includes("payloadHint") &&
    content.includes("payloadTemplate") &&
    content.includes("curlCommand") &&
    content.includes("persistence.store");
  const commandReady =
    content.includes("curlCommand: buildCurlCommand(item)") &&
    content.includes("function buildCurlCommand") &&
    content.includes("https://<your-domain") &&
    content.includes("?token=<admin-token>");

  addCheck(result, {
    id: "goal-followup-copy-text",
    group: "目标补齐入口",
    label: "可复制复盘口径",
    status: copyReady ? statuses.ready : statuses.blocking,
    detail: copyReady
      ? "copyText 包含补齐入口、payloadHint、payloadTemplate、curlCommand 和持久化证据。"
      : "copyText 缺少补齐入口、payloadHint、payloadTemplate、curlCommand 或持久化证据。",
    action: copyReady
      ? "保留可复制复盘口径。"
      : "让 copyText 输出补齐入口、接口、填写提示、请求体模板、执行命令和持久化证据。",
  });
  addCheck(result, {
    id: "goal-followup-curl-command",
    group: "目标补齐入口",
    label: "执行命令生成器",
    status: commandReady ? statuses.ready : statuses.blocking,
    detail: commandReady ? "补齐入口会统一生成 curl 执行命令。" : "缺少 curlCommand 生成器或安全占位符。",
    action: commandReady ? "保留命令生成器。" : "在 fillIn 统一生成 curlCommand，并使用域名和 token 占位符。",
  });
}

function checkHandoffFillIns(result, root) {
  const filename = "src/lib/launch-handoff.ts";
  const content = readProjectFile(root, filename);
  const healthContent = readProjectFile(root, "src/app/admin/health/page.tsx") ?? "";

  if (!content) {
    return;
  }

  const typeReady =
    content.includes("LaunchGoalFollowupFillIn") &&
    content.includes("LaunchHandoffGoalFollowupFillIn") &&
    content.includes("fillIns: LaunchHandoffGoalFollowupFillIn[]") &&
    content.includes("transitionGate: LaunchGoalFollowup") &&
    content.includes('"payloadTemplate"') &&
    content.includes('"curlCommand"') &&
    content.includes('"persistence"');
  const dataReady =
    content.includes("fillIns: goalFollowup.fillIns.slice") &&
    content.includes("目标补齐入口：") &&
    content.includes("payloadTemplate") &&
    content.includes("curlCommand") &&
    content.includes("persistence.store");
  const transitionGateReady =
    content.includes("transitionGate: goalFollowup.transitionGate") &&
    content.includes("input.goalFollowup.transitionGate.canAdvance") &&
    content.includes("阶段推进门槛：") &&
    content.includes("canAdvance=") &&
    content.includes("blocking=") &&
    content.includes("warning=");
  const productionGateReady =
    content.includes("getLaunchProductionGate") &&
    content.includes("productionGate: {") &&
    content.includes("releaseReady") &&
    content.includes("生产总门禁：") &&
    content.includes("LaunchHandoffProductionGateItem");
  const offlineActionReady =
    content.includes("getLaunchOfflineActionPack") &&
    content.includes("offlineActionPack?: LaunchOfflineActionPack") &&
    content.includes("LaunchHandoffOfflineAction") &&
    content.includes("offlineAction: LaunchHandoffOfflineAction") &&
    content.includes("const offlineAction = {") &&
    content.includes("线下办理当前动作：") &&
    content.includes("推进线下办理当前动作");
  const offlineActionHealthReady =
    healthContent.includes("launchHandoff.offlineAction") &&
    healthContent.includes("交接线下办理") &&
    healthContent.includes("线下办理当前动作") &&
    healthContent.includes("launchHandoff.offlineAction.current.action") &&
    healthContent.includes("launchHandoff.offlineAction.todayActions");

  addCheck(result, {
    id: "handoff-fill-ins-type",
    group: "上线交接",
    label: "交接结构化入口类型",
    status: typeReady ? statuses.ready : statuses.blocking,
    detail: typeReady ? "handoff 类型包含目标补齐入口。" : "handoff 类型缺少目标补齐入口字段。",
    action: typeReady ? "保留交接结构。" : "把 goalFollowup.fillIns 暴露到 LaunchHandoff.goalFollowup。",
  });
  addCheck(result, {
    id: "handoff-fill-ins-copy",
    group: "上线交接",
    label: "交接复制口径",
    status: dataReady ? statuses.ready : statuses.blocking,
    detail: dataReady ? "copyText 包含目标补齐入口。" : "copyText 未输出目标补齐入口。",
    action: dataReady ? "保留交接复制口径。" : "在 handoff copyText 中加入目标补齐入口。",
  });
  addCheck(result, {
    id: "handoff-transition-gate",
    group: "上线交接",
    label: "交接阶段推进门槛",
    status: transitionGateReady ? statuses.ready : statuses.blocking,
    detail: transitionGateReady
      ? "handoff 包含 transitionGate、canAdvance 和阶段推进门槛复制口径。"
      : "handoff 缺少 transitionGate 阶段推进门槛或 canAdvance 复制口径。",
    action: transitionGateReady
      ? "保留交接中的阶段推进门槛。"
      : "把 goalFollowup.transitionGate 暴露到 LaunchHandoff，并在 copyText 中输出阶段推进门槛。",
  });
  addCheck(result, {
    id: "handoff-production-gate",
    group: "上线交接",
    label: "交接生产总门禁",
    status: productionGateReady ? statuses.ready : statuses.blocking,
    detail: productionGateReady
      ? "handoff 包含生产总门禁结构和可复制口径。"
      : "handoff 缺少生产总门禁结构或复制口径。",
    action: productionGateReady
      ? "保留交接中的生产总门禁。"
      : "把 productionGate 暴露到 LaunchHandoff，并在 copyText 中输出生产总门禁。",
  });
  addCheck(result, {
    id: "handoff-offline-action",
    group: "上线交接",
    label: "交接线下办理当前动作",
    status: offlineActionReady ? statuses.ready : statuses.blocking,
    detail: offlineActionReady
      ? "handoff 包含线下办理当前动作结构、下一步动作和复制口径。"
      : "handoff 缺少线下办理当前动作结构或复制口径。",
    action: offlineActionReady
      ? "保留交接中的线下办理当前动作。"
      : "把 offlineActionPack.currentAction 暴露到 LaunchHandoff，并在 copyText 与 nextActions 中输出线下办理当前动作。",
  });
  addCheck(result, {
    id: "handoff-offline-action-health",
    group: "上线交接",
    label: "后台交接线下办理",
    status: offlineActionHealthReady ? statuses.ready : statuses.blocking,
    detail: offlineActionHealthReady
      ? "后台上线交接区展示线下办理当前动作、状态、证据和优先队列。"
      : "后台上线交接区未展示线下办理当前动作或优先队列。",
    action: offlineActionHealthReady
      ? "保留后台交接线下办理卡片。"
      : "在 /admin/health 上线交接摘要中渲染 launchHandoff.offlineAction。",
  });
}

function checkDailyBriefProductionGate(result, root) {
  const briefFilename = "src/lib/launch-daily-brief.ts";
  const briefContent = readProjectFile(root, briefFilename);

  if (!briefContent) {
    return;
  }

  const briefReady =
    briefContent.includes("getLaunchProductionGate") &&
    briefContent.includes('"production_gate"') &&
    briefContent.includes("actionFromProductionGate") &&
    briefContent.includes("productionGate: {") &&
    briefContent.includes("releaseReady") &&
    briefContent.includes("生产总门禁：releaseReady=");
  const transitionReady =
    briefContent.includes('"goal_transition"') &&
    briefContent.includes("actionFromGoalTransitionGate") &&
    briefContent.includes("transitionGate: {") &&
    briefContent.includes("transitionCanAdvance") &&
    briefContent.includes("阶段推进门槛：canAdvance=");
  const healthFilename = "src/app/admin/health/page.tsx";
  const healthContent = readProjectFile(root, healthFilename) ?? "";
  const healthReady =
    healthContent.includes("productionGate: launchProductionGate") &&
    healthContent.includes("launchDailyBrief.productionGate") &&
    healthContent.includes("生产门禁") &&
    healthContent.includes("releaseReady=yes");
  const transitionHealthReady =
    healthContent.includes("launchDailyBrief.transitionGate") &&
    healthContent.includes("阶段门槛") &&
    healthContent.includes("canAdvance=yes") &&
    healthContent.includes("canAdvance=no");

  addCheck(result, {
    id: "daily-brief-production-gate-source",
    group: "今日目标推进",
    label: "日报生产总门禁来源",
    status: briefReady ? statuses.ready : statuses.blocking,
    detail: briefReady
      ? "今日目标推进日报聚合生产总门禁，并把门禁优先项纳入今日动作。"
      : "日报缺少生产总门禁聚合、production_gate 动作来源或复制口径。",
    action: briefReady
      ? "保留日报中的生产总门禁来源。"
      : "在 launch-daily-brief.ts 中接入 getLaunchProductionGate、production_gate 动作和 releaseReady 复制口径。",
  });
  addCheck(result, {
    id: "daily-brief-production-gate-health",
    group: "今日目标推进",
    label: "后台日报生产门禁卡片",
    status: healthReady ? statuses.ready : statuses.blocking,
    detail: healthReady
      ? "后台今日目标推进日报展示生产门禁指标，并复用页面已聚合的 launchProductionGate。"
      : "后台日报缺少生产门禁卡片或未注入 launchProductionGate。",
    action: healthReady
      ? "保留后台日报生产门禁卡片。"
      : "在 /admin/health 的 getLaunchDailyBrief 入参和日报指标区加入生产门禁。",
  });
  addCheck(result, {
    id: "daily-brief-transition-gate-source",
    group: "今日目标推进",
    label: "日报阶段推进门槛来源",
    status: transitionReady ? statuses.ready : statuses.blocking,
    detail: transitionReady
      ? "今日目标推进日报返回 transitionGate，并在未放行时生成 goal_transition 今日动作。"
      : "日报缺少 transitionGate 快照、goal_transition 动作来源或阶段推进复制口径。",
    action: transitionReady
      ? "保留日报中的阶段推进门槛来源。"
      : "在 launch-daily-brief.ts 中接入 goalPlan.transitionGate、goal_transition 动作和 canAdvance 复制口径。",
  });
  addCheck(result, {
    id: "daily-brief-transition-gate-health",
    group: "今日目标推进",
    label: "后台日报阶段门槛卡片",
    status: transitionHealthReady ? statuses.ready : statuses.blocking,
    detail: transitionHealthReady
      ? "后台今日目标推进日报展示阶段门槛和 canAdvance。"
      : "后台日报缺少阶段门槛卡片或 canAdvance 展示。",
    action: transitionHealthReady
      ? "保留后台日报阶段门槛卡片。"
      : "在 /admin/health 的日报指标区加入 launchDailyBrief.transitionGate。",
  });
}

function checkDecisionTransitionGate(result, root) {
  const decisionContent = readProjectFile(root, "src/lib/launch-decision.ts") ?? "";
  const decisionRouteContent =
    readProjectFile(root, "src/app/api/admin/launch/decision/route.ts") ?? "";
  const healthContent = readProjectFile(root, "src/app/admin/health/page.tsx") ?? "";

  const sourceReady =
    decisionContent.includes("LaunchGoalTransitionGateSnapshot") &&
    decisionContent.includes('"goal_transition"') &&
    decisionContent.includes("goalTransitionGate?:") &&
    decisionContent.includes("阶段推进门槛：") &&
    decisionContent.includes("canAdvance=");
  const routeReady =
    decisionRouteContent.includes("getLaunchGoalPlan") &&
    decisionRouteContent.includes("snapshotLaunchGoalTransitionGate") &&
    decisionRouteContent.includes("goalTransitionGate:");
  const healthReady =
    healthContent.includes("launchDecision.goalTransitionGate") &&
    healthContent.includes("最终决策阶段门槛") &&
    healthContent.includes("canAdvance=yes") &&
    healthContent.includes("canAdvance=no");

  addCheck(result, {
    id: "decision-transition-gate-source",
    group: "阶段推进门槛",
    label: "最终决策阶段门槛来源",
    status: sourceReady ? statuses.ready : statuses.blocking,
    detail: sourceReady
      ? "最终决策聚合 goalTransitionGate、goal_transition gate 和 canAdvance 复制口径。"
      : "最终决策缺少 goalTransitionGate、goal_transition gate 或 canAdvance 复制口径。",
    action: sourceReady
      ? "保留最终决策中的阶段推进门槛。"
      : "在 launch-decision.ts 中接入 goalTransitionGate、goal_transition gate、优先项和 copyText。",
  });
  addCheck(result, {
    id: "decision-transition-gate-route",
    group: "阶段推进门槛",
    label: "最终决策 API 阶段门槛",
    status: routeReady ? statuses.ready : statuses.blocking,
    detail: routeReady
      ? "最终决策 API 会从目标规划生成 transitionGate 快照并注入决策。"
      : "最终决策 API 未注入目标规划 transitionGate 快照。",
    action: routeReady
      ? "保留 /api/admin/launch/decision 的阶段门槛注入。"
      : "在决策 API 中读取 goalPlan.transitionGate，并通过 snapshotLaunchGoalTransitionGate 注入 getLaunchDecision。",
  });
  addCheck(result, {
    id: "decision-transition-gate-health",
    group: "阶段推进门槛",
    label: "后台最终决策阶段门槛",
    status: healthReady ? statuses.ready : statuses.blocking,
    detail: healthReady
      ? "后台最终决策展示阶段门槛和 canAdvance。"
      : "后台最终决策缺少阶段门槛卡片或 canAdvance 展示。",
    action: healthReady
      ? "保留后台最终决策阶段门槛卡片。"
      : "在 /admin/health 最终决策指标区加入 launchDecision.goalTransitionGate。",
  });
}

function checkEvidenceTransitionGate(result, root) {
  const evidenceContent = readProjectFile(root, "src/lib/launch-evidence.ts") ?? "";
  const evidenceRouteContent =
    readProjectFile(root, "src/app/api/admin/launch/evidence/route.ts") ?? "";
  const packageContent = readProjectFile(root, "src/lib/launch-package.ts") ?? "";
  const healthContent = readProjectFile(root, "src/app/admin/health/page.tsx") ?? "";

  const sourceReady =
    evidenceContent.includes("goalTransitionGate: EvidenceGoalTransitionGate") &&
    evidenceContent.includes("createMissingLaunchGoalTransitionGateSnapshot") &&
    evidenceContent.includes("readGoalTransitionGate") &&
    evidenceContent.includes("input.goalTransitionGate") &&
    evidenceContent.includes("log.metadata.goalTransitionGate");
  const routeReady =
    evidenceRouteContent.includes("getLaunchGoalPlan") &&
    evidenceRouteContent.includes("snapshotLaunchGoalTransitionGate") &&
    evidenceRouteContent.includes("goalTransitionGate:");
  const packageReady =
    packageContent.includes("evidenceIncludesGoalTransitionGate") &&
    packageContent.includes('"阶段推进门槛"');
  const healthReady =
    healthContent.includes("archive.metadata.goalTransitionGate") &&
    healthContent.includes("证据阶段门槛") &&
    healthContent.includes("阶段门槛优先项");

  addCheck(result, {
    id: "evidence-transition-gate-source",
    group: "上线证据归档",
    label: "证据阶段门槛 metadata",
    status: sourceReady ? statuses.ready : statuses.blocking,
    detail: sourceReady
      ? "上线证据 metadata 包含 goalTransitionGate，并兼容旧归档缺失状态。"
      : "上线证据 metadata 缺少 goalTransitionGate、旧归档兼容或读取逻辑。",
    action: sourceReady
      ? "保留证据归档阶段门槛 metadata。"
      : "在 launch-evidence.ts 中写入 goalTransitionGate，并为旧归档提供缺失快照。",
  });
  addCheck(result, {
    id: "evidence-transition-gate-route",
    group: "上线证据归档",
    label: "归档 API 阶段门槛",
    status: routeReady ? statuses.ready : statuses.blocking,
    detail: routeReady
      ? "归档 API 会把 goalPlan.transitionGate 快照写入上线证据。"
      : "归档 API 未把目标规划 transitionGate 注入 archiveLaunchEvidence。",
    action: routeReady
      ? "保留归档 API 的阶段门槛注入。"
      : "在 /api/admin/launch/evidence POST 中读取 goalPlan，并传入 snapshotLaunchGoalTransitionGate。",
  });
  addCheck(result, {
    id: "evidence-transition-gate-package",
    group: "上线证据归档",
    label: "上线包阶段门槛刷新原因",
    status: packageReady ? statuses.ready : statuses.blocking,
    detail: packageReady
      ? "上线包会在旧归档缺少阶段门槛时提示刷新证据。"
      : "上线包未检查阶段门槛归档缺失。",
    action: packageReady
      ? "保留上线包证据刷新原因。"
      : "在 launch-package.ts 中把阶段推进门槛纳入 evidence refreshReasons。",
  });
  addCheck(result, {
    id: "evidence-transition-gate-health",
    group: "上线证据归档",
    label: "后台证据阶段门槛",
    status: healthReady ? statuses.ready : statuses.blocking,
    detail: healthReady
      ? "后台证据归档列表展示阶段门槛和优先项。"
      : "后台证据归档列表未展示 goalTransitionGate。",
    action: healthReady
      ? "保留后台证据阶段门槛展示。"
      : "在上线证据归档列表中展示 archive.metadata.goalTransitionGate。",
  });
}

function checkOfflineActionIntegration(result, root) {
  const briefContent = readProjectFile(root, "src/lib/launch-daily-brief.ts") ?? "";
  const evidenceContent = readProjectFile(root, "src/lib/launch-evidence.ts") ?? "";
  const packageContent = readProjectFile(root, "src/lib/launch-package.ts") ?? "";
  const healthContent = readProjectFile(root, "src/app/admin/health/page.tsx") ?? "";

  const briefReady =
    briefContent.includes("getLaunchOfflineActionPack") &&
    briefContent.includes('"offline_action"') &&
    briefContent.includes("actionFromOfflineActionPack") &&
    briefContent.includes("offlineAction: {") &&
    briefContent.includes("线下办理当前动作：");
  const evidenceReady =
    evidenceContent.includes("EvidenceOfflineAction") &&
    evidenceContent.includes("getLaunchOfflineActionPack") &&
    evidenceContent.includes("offlineAction: evidenceOfflineAction") &&
    evidenceContent.includes("readOfflineAction");
  const packageReady =
    packageContent.includes("evidenceIncludesOfflineAction") &&
    packageContent.includes('"线下办理当前动作"');
  const healthReady =
    healthContent.includes('id="launch-offline-action-pack"') &&
    healthContent.includes("launchDailyBrief.offlineAction") &&
    healthContent.includes("归档线下办理") &&
    healthContent.includes("archive.metadata.offlineAction");

  addCheck(result, {
    id: "daily-brief-offline-action-source",
    group: "线下办理动作",
    label: "日报线下办理动作来源",
    status: briefReady ? statuses.ready : statuses.blocking,
    detail: briefReady
      ? "今日目标推进日报聚合线下办理行动包，并输出 offline_action 今日动作与复制口径。"
      : "日报缺少 offline_action 来源、offlineAction 快照或线下办理复制口径。",
    action: briefReady
      ? "保留日报中的线下办理动作来源。"
      : "在 launch-daily-brief.ts 中接入 getLaunchOfflineActionPack、offline_action 动作、offlineAction 快照和 copyText。",
  });
  addCheck(result, {
    id: "evidence-offline-action-source",
    group: "线下办理动作",
    label: "证据归档线下办理 metadata",
    status: evidenceReady ? statuses.ready : statuses.blocking,
    detail: evidenceReady
      ? "上线证据 metadata 包含 offlineAction，并兼容旧归档缺失状态。"
      : "上线证据 metadata 缺少 offlineAction 写入或读取兼容。",
    action: evidenceReady
      ? "保留证据归档线下办理 metadata。"
      : "在 launch-evidence.ts 中写入 offlineAction，并为旧归档提供缺失快照。",
  });
  addCheck(result, {
    id: "package-offline-action-refresh",
    group: "线下办理动作",
    label: "上线包线下办理刷新原因",
    status: packageReady ? statuses.ready : statuses.blocking,
    detail: packageReady
      ? "上线包会在旧归档缺少线下办理动作时提示刷新证据。"
      : "上线包未检查线下办理动作归档缺失。",
    action: packageReady
      ? "保留上线包证据刷新原因。"
      : "在 launch-package.ts 中把线下办理当前动作纳入 evidence refreshReasons。",
  });
  addCheck(result, {
    id: "health-offline-action-ui",
    group: "线下办理动作",
    label: "后台线下办理日报与证据",
    status: healthReady ? statuses.ready : statuses.blocking,
    detail: healthReady
      ? "后台提供线下办理锚点、日报卡片和归档卡片。"
      : "后台缺少线下办理锚点、日报卡片或归档卡片。",
    action: healthReady
      ? "保留后台线下办理动作展示。"
      : "在 /admin/health 中加入 launch-offline-action-pack 锚点、launchDailyBrief.offlineAction 和 archive.metadata.offlineAction。",
  });
}

function checkHealthPageAnchors(result, root) {
  const filename = "src/app/admin/health/page.tsx";
  const content = readProjectFile(root, filename);

  if (!content) {
    return;
  }

  for (const anchor of requiredAnchors) {
    const token = `id="${anchor.id}"`;
    const count = countOccurrences(content, token);
    const index = content.indexOf(token);
    const context = index >= 0 ? content.slice(index, index + 900) : "";
    const labelReady = context.includes(anchor.label);

    addCheck(result, {
      id: `health-anchor:${anchor.id}`,
      group: "后台锚点",
      label: anchor.id,
      status: count === 1 && labelReady ? statuses.ready : statuses.blocking,
      detail:
        count === 1 && labelReady
          ? `唯一锚点，并指向 ${anchor.label}。`
          : `count=${count}, labelInContext=${labelReady}`,
      action:
        count === 1 && labelReady
          ? "保留后台锚点。"
          : "确认锚点唯一，并放在对应后台填写区 section 上。",
    });
  }

  const uiReady = content.includes("补齐入口") && content.includes("目标补齐入口");
  const payloadTemplateReady =
    countOccurrences(content, "payloadTemplate") >= 2 &&
    content.includes("JSON.stringify(item.payloadTemplate");
  const commandReady =
    countOccurrences(content, "curlCommand") >= 2 &&
    content.includes("执行命令") &&
    content.includes("{item.curlCommand}");
  const persistenceReady =
    countOccurrences(content, "persistence") >= 2 &&
    content.includes("持久化证据") &&
    content.includes("item.persistence.feature") &&
    content.includes("item.persistence.event") &&
    content.includes("item.persistence.model");

  addCheck(result, {
    id: "health-fill-in-ui",
    group: "后台锚点",
    label: "目标补齐入口 UI",
    status: uiReady ? statuses.ready : statuses.blocking,
    detail: uiReady ? "目标复盘和交接摘要均渲染补齐入口。" : "后台页面缺少补齐入口 UI。",
    action: uiReady ? "保留后台入口展示。" : "在目标复盘或交接摘要中渲染 fillIns。",
  });
  addCheck(result, {
    id: "health-payload-template-ui",
    group: "后台锚点",
    label: "请求体模板 UI",
    status: payloadTemplateReady ? statuses.ready : statuses.blocking,
    detail: payloadTemplateReady ? "目标复盘和交接摘要均展示请求体模板。" : "后台页面缺少 payloadTemplate 展示。",
    action: payloadTemplateReady ? "保留请求体模板展示。" : "在目标补齐入口卡片中渲染 payloadTemplate。",
  });
  addCheck(result, {
    id: "health-curl-command-ui",
    group: "后台锚点",
    label: "执行命令 UI",
    status: commandReady ? statuses.ready : statuses.blocking,
    detail: commandReady ? "目标复盘和交接摘要均展示 curl 执行命令。" : "后台页面缺少 curlCommand 展示。",
    action: commandReady ? "保留执行命令展示。" : "在目标补齐入口卡片中渲染 curlCommand。",
  });
  addCheck(result, {
    id: "health-persistence-ui",
    group: "后台锚点",
    label: "持久化证据 UI",
    status: persistenceReady ? statuses.ready : statuses.blocking,
    detail: persistenceReady ? "目标复盘和交接摘要均展示 UsageLog 持久化证据映射。" : "后台页面缺少 persistence 展示。",
    action: persistenceReady ? "保留持久化证据展示。" : "在目标补齐入口卡片中渲染 persistence feature/event/model。",
  });
}

function checkDocs(result, root) {
  for (const filename of docsWithGoalFollowupAcceptance) {
    const content = readProjectFile(root, filename);

    if (!content) {
      addCheck(result, {
        id: `docs:${filename}`,
        group: "文档口径",
        label: filename,
        status: statuses.blocking,
        detail: "文档文件不存在。",
        action: "恢复文档并写入目标补齐入口验收口径。",
      });
      continue;
    }

    const hasFillInCopy =
      content.includes("目标补齐入口") ||
      content.includes("结构化补齐入口") ||
      content.includes("补齐入口");
    const hasPayloadTemplateCopy = content.includes("payloadTemplate") || content.includes("请求体模板");
    const hasCurlCommandCopy =
      content.includes("curlCommand") || content.includes("执行命令") || content.includes("curl");
    const hasPersistenceCopy =
      content.includes("persistence") || content.includes("持久化证据") || content.includes("UsageLog");
    const hasTransitionGateCopy =
      content.includes("阶段推进门槛") ||
      content.includes("transitionGate") ||
      content.includes("canAdvance");
    const hasOfflineActionCopy =
      content.includes("线下办理当前动作") ||
      content.includes("offline_action") ||
      content.includes("线下办理动作");
    const ready =
      hasFillInCopy &&
      hasPayloadTemplateCopy &&
      hasCurlCommandCopy &&
      hasPersistenceCopy &&
      hasTransitionGateCopy &&
      hasOfflineActionCopy;

    addCheck(result, {
      id: `docs:${filename}`,
      group: "文档口径",
      label: filename,
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? "已记录目标补齐入口、请求体模板、执行命令、持久化证据、阶段推进门槛和线下办理动作口径。"
        : "未记录目标补齐入口、请求体模板、执行命令、持久化证据、阶段推进门槛或线下办理动作口径。",
      action: ready
        ? "保留文档口径。"
        : "补充目标复盘的结构化补齐入口、请求体模板、执行命令、持久化证据、阶段推进门槛、线下办理当前动作和验收标准。",
    });
  }
}

function checkPackageCommand(result, root) {
  const filename = "package.json";
  const content = readProjectFile(root, filename);
  const ready =
    Boolean(content) &&
    content.includes('"launch:goal-followup-check"') &&
    content.includes("scripts/launch-goal-followup-check.mjs");

  addCheck(result, {
    id: "package-command",
    group: "脚本命令",
    label: "launch:goal-followup-check",
    status: ready ? statuses.ready : statuses.blocking,
    detail: ready ? "package.json 已注册目标推进验收脚本。" : "package.json 未注册脚本命令。",
    action: ready ? "可通过 npm run launch:goal-followup-check 运行。" : "在 package.json scripts 中注册该脚本。",
  });
}

function runStaticChecks(result, root) {
  const requiredFiles = [
    "src/lib/launch-goal-plan.ts",
    "src/lib/launch-goal-followup.ts",
    "src/lib/launch-daily-brief.ts",
    "src/lib/launch-handoff.ts",
    "src/app/admin/health/page.tsx",
    "src/app/api/admin/launch/daily-brief/route.ts",
    "src/app/api/admin/launch/goal-followup/route.ts",
    "src/app/api/admin/launch/handoff/route.ts",
  ];

  for (const filename of requiredFiles) {
    checkFileExists(result, root, filename);
  }

  checkSourceFillIns(result, root);
  checkGoalTransitionGate(result, root);
  checkHandoffFillIns(result, root);
  checkDailyBriefProductionGate(result, root);
  checkDecisionTransitionGate(result, root);
  checkEvidenceTransitionGate(result, root);
  checkOfflineActionIntegration(result, root);
  checkHealthPageAnchors(result, root);
  checkDocs(result, root);
  checkPackageCommand(result, root);
}

function checkGoalTransitionGate(result, root) {
  const goalPlanContent = readProjectFile(root, "src/lib/launch-goal-plan.ts") ?? "";
  const followupContent = readProjectFile(root, "src/lib/launch-goal-followup.ts") ?? "";
  const healthContent = readProjectFile(root, "src/app/admin/health/page.tsx") ?? "";
  const goalPlanReady =
    goalPlanContent.includes("LaunchGoalPlanTransitionGate") &&
    goalPlanContent.includes("buildTransitionGate") &&
    goalPlanContent.includes("canAdvance") &&
    goalPlanContent.includes("阶段推进门槛：") &&
    goalPlanContent.includes("transitionGate,");
  const followupReady =
    followupContent.includes("transitionGate:") &&
    followupContent.includes("transitionCanAdvance") &&
    followupContent.includes("后续阶段衔接") &&
    followupContent.includes("transitionGate.canAdvance") &&
    followupContent.includes("阶段推进门槛：") &&
    followupContent.includes("evidenceActionCenter:") &&
    followupContent.includes("fill_evidence_action_center") &&
    followupContent.includes("证据行动中心：");
  const healthReady =
    healthContent.includes("launchGoalPlan.transitionGate") &&
    healthContent.includes("launchGoalFollowup.transitionGate") &&
    healthContent.includes("本周阶段门槛") &&
    healthContent.includes("阶段推进门槛") &&
    healthContent.includes("阶段衔接") &&
    healthContent.includes("canAdvance=yes") &&
    healthContent.includes("canAdvance=no");

  addCheck(result, {
    id: "goal-plan-transition-gate",
    group: "阶段推进门槛",
    label: "30/60/90 阶段推进门槛",
    status: goalPlanReady ? statuses.ready : statuses.blocking,
    detail: goalPlanReady
      ? "goal-plan 输出 transitionGate、canAdvance、门槛检查项和可复制口径。"
      : "goal-plan 缺少 transitionGate、canAdvance 或阶段推进门槛复制口径。",
    action: goalPlanReady
      ? "保留目标规划中的阶段推进门槛。"
      : "在 launch-goal-plan.ts 中输出 transitionGate、checks、canAdvance 和 copyText。",
  });
  addCheck(result, {
    id: "goal-followup-transition-gate",
    group: "阶段推进门槛",
    label: "目标复盘阶段衔接",
    status: followupReady ? statuses.ready : statuses.blocking,
    detail: followupReady
      ? "目标复盘会读取 transitionGate 并把阶段衔接纳入复盘和补齐入口。"
      : "目标复盘缺少 transitionGate、transitionCanAdvance 或后续阶段衔接检查。",
    action: followupReady
      ? "保留目标复盘中的阶段衔接检查。"
      : "在 launch-goal-followup.ts 中接入 goalPlan.transitionGate。",
  });
  addCheck(result, {
    id: "health-transition-gate-ui",
    group: "阶段推进门槛",
    label: "后台阶段推进门槛 UI",
    status: healthReady ? statuses.ready : statuses.blocking,
    detail: healthReady
      ? "后台本周推进、目标规划和目标复盘均展示阶段推进门槛、阶段衔接和 canAdvance。"
      : "后台缺少阶段推进门槛、本周阶段门槛、阶段衔接或 canAdvance 展示。",
    action: healthReady
      ? "保留后台阶段推进门槛 UI。"
      : "在 /admin/health 的本周推进、目标规划和目标复盘区展示 transitionGate。",
  });
}

async function fetchWithTimeout(input) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await fetch(input.url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept: input.accept,
        "user-agent": "xuanji-launch-goal-followup-check/1.0",
      },
    });

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function validateRuntimeFillIns(fillIns) {
  if (!Array.isArray(fillIns)) {
    return {
      ok: false,
      detail: "fillIns 不是数组。",
    };
  }

  const invalid = fillIns.filter(
    (item) =>
      !item?.id ||
      !item?.sectionId ||
      !item?.route ||
      !item?.api?.method ||
      !item?.api?.path ||
      !item?.payloadHint ||
      !item?.payloadTemplate ||
      !item?.curlCommand ||
      !item?.persistence ||
      !item?.evidence,
  );
  const unknown = fillIns.filter(
    (item) =>
      !requiredFillIns.some(
        (required) =>
          required.sectionId === item.sectionId &&
          required.method === item.api?.method &&
          required.apiPath === item.api?.path,
      ),
  );
  const payloadTemplateInvalid = fillIns.filter((item) => {
    const required = requiredFillIns.find((entry) => entry.id === item?.id);

    if (!required) {
      return true;
    }

    if (
      typeof item.payloadTemplate !== "object" ||
      item.payloadTemplate === null ||
      Array.isArray(item.payloadTemplate)
    ) {
      return true;
    }

    return required.payloadFields.some((field) => typeof item.payloadTemplate[field] !== "string");
  });
  const curlCommandInvalid = fillIns.filter((item) => {
    const required = requiredFillIns.find((entry) => entry.id === item?.id);

    if (!required || typeof item?.curlCommand !== "string") {
      return true;
    }

    return (
      !item.curlCommand.includes(`curl -X ${required.method}`) ||
      !item.curlCommand.includes(required.apiPath) ||
      !item.curlCommand.includes("?token=<admin-token>") ||
      !item.curlCommand.includes("Content-Type: application/json")
    );
  });
  const persistenceInvalid = fillIns.filter((item) => {
    const required = requiredFillIns.find((entry) => entry.id === item?.id);

    if (!required || typeof item?.persistence !== "object" || item.persistence === null) {
      return true;
    }

    return (
      item.persistence.store !== "UsageLog" ||
      item.persistence.feature !== required.persistence.feature ||
      item.persistence.event !== required.persistence.event ||
      item.persistence.model !== required.persistence.model ||
      typeof item.persistence.purpose !== "string" ||
      item.persistence.purpose.length === 0
    );
  });

  if (
    invalid.length > 0 ||
    unknown.length > 0 ||
    payloadTemplateInvalid.length > 0 ||
    curlCommandInvalid.length > 0 ||
    persistenceInvalid.length > 0
  ) {
    return {
      ok: false,
      detail: `invalid=${invalid.map((item) => item?.id ?? "<missing-id>").join(", ") || "无"} unknown=${
        unknown.map((item) => item?.id ?? "<missing-id>").join(", ") || "无"
      } payloadTemplateInvalid=${
        payloadTemplateInvalid.map((item) => item?.id ?? "<missing-id>").join(", ") || "无"
      } curlCommandInvalid=${
        curlCommandInvalid.map((item) => item?.id ?? "<missing-id>").join(", ") || "无"
      } persistenceInvalid=${
        persistenceInvalid.map((item) => item?.id ?? "<missing-id>").join(", ") || "无"
      }`,
    };
  }

  return {
    ok: true,
    detail: fillIns.length > 0 ? `${fillIns.length} 个入口结构、命令和持久化证据有效。` : "当前无待补入口，结构有效。",
  };
}

async function checkJsonEndpoint(input) {
  const url = `${input.baseUrl}${appendToken(input.route, input.adminToken)}`;

  try {
    const response = await fetchWithTimeout({
      url,
      timeoutMs: input.timeoutMs,
      accept: "application/json",
    });
    const httpReady = response.status === 200;

    if (!httpReady) {
      addCheck(input.result, {
        id: `runtime:${input.id}:http`,
        group: "运行时检查",
        label: input.label,
        status: statuses.blocking,
        detail: `HTTP ${response.status}`,
        action: "确认本地服务已启动、后台 token 正确，并重试运行时检查。",
      });
      return;
    }

    const json = await response.json();
    const payload = input.pickPayload(json);
    const fillIns = input.pickFillIns(payload);
    const validation = validateRuntimeFillIns(fillIns);
    const summary = input.pickSummary(payload);
    const hasOpenIssues =
      summary && typeof summary.warning === "number" && typeof summary.blocking === "number"
        ? summary.warning + summary.blocking > 0
        : false;
    const issueReady = !hasOpenIssues || fillIns.length > 0;
    const copyReady = input.copyTextIncludes(payload);
    const extraReady = input.validatePayload ? input.validatePayload(payload).ok : true;
    const extraDetail = input.validatePayload ? input.validatePayload(payload).detail : "";
    const ready = Boolean(
      json.ok && payload && validation.ok && issueReady && copyReady && extraReady,
    );

    addCheck(input.result, {
      id: `runtime:${input.id}:payload`,
      group: "运行时检查",
      label: input.label,
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? [validation.detail, extraDetail].filter(Boolean).join(" ")
        : `ok=${Boolean(json.ok)} payload=${Boolean(payload)} ${validation.detail} issueReady=${issueReady} copyReady=${copyReady} extraReady=${extraReady} ${extraDetail}`,
      action: ready
        ? "运行时目标补齐入口结构正常。"
        : "检查 API 返回结构、fillIns、summary 和 copyText。",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fetch error";

    addCheck(input.result, {
      id: `runtime:${input.id}:fetch`,
      group: "运行时检查",
      label: input.label,
      status: statuses.blocking,
      detail: message,
      action: "确认 base-url 可访问，必要时加大 --timeout-ms。",
    });
  }
}

async function checkHealthPageRuntime(input) {
  const url = `${input.baseUrl}${appendToken("/admin/health", input.adminToken)}`;

  try {
    const response = await fetchWithTimeout({
      url,
      timeoutMs: input.timeoutMs,
      accept: "text/html",
    });

    if (response.status !== 200) {
      addCheck(input.result, {
        id: "runtime:health:http",
        group: "运行时检查",
        label: "后台健康页",
        status: statuses.blocking,
        detail: `HTTP ${response.status}`,
        action: "确认后台访问 token、服务状态和页面渲染。",
      });
      return;
    }

    const html = await response.text();
    const missing = [
      "目标后续推进复盘",
      "补齐入口",
      "目标补齐入口",
      "执行命令",
      "curl -X",
      "持久化证据",
      "feature=",
      "线下办理",
      "线下办理当前动作",
      "交接线下办理",
      "证据行动中心",
      "补证覆盖",
      "归档线下办理",
      "生产门禁",
      "生产总门禁交接",
      "releaseReady=",
      "本周阶段门槛",
      "最终决策阶段门槛",
      "阶段推进门槛",
      "阶段衔接",
      "canAdvance=",
      ...requiredAnchors.map((anchor) => `id="${anchor.id}"`),
      "上线证据归档",
    ].filter((pattern) => !html.includes(pattern));

    addCheck(input.result, {
      id: "runtime:health:html",
      group: "运行时检查",
      label: "后台目标补齐入口渲染",
      status: missing.length === 0 ? statuses.ready : statuses.blocking,
      detail: missing.length === 0 ? "页面包含目标复盘、补齐入口和所有锚点。" : `缺少 ${missing.join(", ")}`,
      action: missing.length === 0 ? "保留后台运行时渲染。" : "检查后台页面渲染和锚点输出。",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fetch error";

    addCheck(input.result, {
      id: "runtime:health:fetch",
      group: "运行时检查",
      label: "后台健康页",
      status: statuses.blocking,
      detail: message,
      action: "确认 base-url 可访问，必要时加大 --timeout-ms。",
    });
  }
}

async function checkDailyBriefRuntime(input) {
  const url = `${input.baseUrl}${appendToken("/api/admin/launch/daily-brief", input.adminToken)}`;

  try {
    const response = await fetchWithTimeout({
      url,
      timeoutMs: input.timeoutMs,
      accept: "application/json",
    });

    if (response.status !== 200) {
      addCheck(input.result, {
        id: "runtime:daily-brief:http",
        group: "运行时检查",
        label: "/api/admin/launch/daily-brief",
        status: statuses.blocking,
        detail: `HTTP ${response.status}`,
        action: "确认本地服务已启动、后台 token 正确，并重试日报运行时检查。",
      });
      return;
    }

    const json = await response.json();
    const dailyBrief = json?.dailyBrief;
    const productionGate = dailyBrief?.productionGate;
    const transitionGate = dailyBrief?.transitionGate;
    const offlineAction = dailyBrief?.offlineAction;
    const gateIssueCount =
      typeof productionGate?.stepBlocking === "number" &&
      typeof productionGate?.stepWarning === "number"
        ? productionGate.stepBlocking + productionGate.stepWarning
        : undefined;
    const transitionIssueCount =
      typeof transitionGate?.blocking === "number" &&
      typeof transitionGate?.warning === "number"
        ? transitionGate.blocking + transitionGate.warning
        : undefined;
    const actions = Array.isArray(dailyBrief?.todayActions) ? dailyBrief.todayActions : [];
    const actionReady =
      gateIssueCount === 0 || actions.some((item) => item?.source === "production_gate");
    const transitionActionReady =
      transitionGate?.canAdvance === true ||
      transitionIssueCount === 0 ||
      actions.some((item) => item?.source === "goal_transition");
    const offlineActionReady =
      offlineAction?.current?.status === "ready" ||
      actions.some((item) => item?.source === "offline_action");
    const ready =
      Boolean(json?.ok) &&
      typeof productionGate?.releaseReady === "boolean" &&
      typeof productionGate?.stepBlocking === "number" &&
      typeof productionGate?.checkBlocking === "number" &&
      typeof productionGate?.action === "string" &&
      typeof transitionGate?.canAdvance === "boolean" &&
      typeof transitionGate?.blocking === "number" &&
      typeof transitionGate?.warning === "number" &&
      typeof offlineAction?.blocking === "number" &&
      typeof offlineAction?.warning === "number" &&
      typeof offlineAction?.current?.title === "string" &&
      Boolean(dailyBrief?.copyText?.includes("生产总门禁：releaseReady=")) &&
      Boolean(dailyBrief?.copyText?.includes("阶段推进门槛：canAdvance=")) &&
      Boolean(dailyBrief?.copyText?.includes("线下办理当前动作：")) &&
      actionReady &&
      transitionActionReady &&
      offlineActionReady;

    addCheck(input.result, {
      id: "runtime:daily-brief:production-gate",
      group: "运行时检查",
      label: "日报生产总门禁与阶段门槛 JSON",
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? "日报 API 返回 productionGate、transitionGate、offlineAction、releaseReady、canAdvance、动作来源和复制口径。"
        : `ok=${Boolean(json?.ok)} productionGate=${Boolean(productionGate)} transitionGate=${Boolean(transitionGate)} offlineAction=${Boolean(offlineAction)} actionReady=${actionReady} transitionActionReady=${transitionActionReady} offlineActionReady=${offlineActionReady} copyReady=${Boolean(dailyBrief?.copyText?.includes("生产总门禁：releaseReady="))} transitionCopyReady=${Boolean(dailyBrief?.copyText?.includes("阶段推进门槛：canAdvance="))} offlineCopyReady=${Boolean(dailyBrief?.copyText?.includes("线下办理当前动作："))}`,
      action: ready
        ? "保留日报生产总门禁、阶段门槛和线下办理运行时结构。"
        : "检查 /api/admin/launch/daily-brief 是否返回 dailyBrief.productionGate、transitionGate、offlineAction，并把 production_gate / goal_transition / offline_action 动作写入 todayActions。",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fetch error";

    addCheck(input.result, {
      id: "runtime:daily-brief:fetch",
      group: "运行时检查",
      label: "/api/admin/launch/daily-brief",
      status: statuses.blocking,
      detail: message,
      action: "确认 base-url 可访问，必要时加大 --timeout-ms。",
    });
  }
}

async function checkGoalPlanTransitionRuntime(input) {
  const url = `${input.baseUrl}${appendToken("/api/admin/launch/goal-plan", input.adminToken)}`;

  try {
    const response = await fetchWithTimeout({
      url,
      timeoutMs: input.timeoutMs,
      accept: "application/json",
    });

    if (response.status !== 200) {
      addCheck(input.result, {
        id: "runtime:goal-plan:http",
        group: "运行时检查",
        label: "/api/admin/launch/goal-plan",
        status: statuses.blocking,
        detail: `HTTP ${response.status}`,
        action: "确认本地服务已启动、后台 token 正确，并重试目标规划运行时检查。",
      });
      return;
    }

    const json = await response.json();
    const goalPlan = json?.goalPlan;
    const transitionGate = goalPlan?.transitionGate;
    const checks = Array.isArray(transitionGate?.checks) ? transitionGate.checks : [];
    const ready =
      Boolean(json?.ok) &&
      typeof transitionGate?.canAdvance === "boolean" &&
      typeof transitionGate?.label === "string" &&
      typeof transitionGate?.summary?.blocking === "number" &&
      typeof transitionGate?.summary?.warning === "number" &&
      checks.length >= 4 &&
      checks.every(
        (item) =>
          typeof item?.id === "string" &&
          typeof item?.title === "string" &&
          typeof item?.status === "string" &&
          typeof item?.action === "string" &&
          typeof item?.evidence === "string",
      ) &&
      Boolean(goalPlan?.copyText?.includes("阶段推进门槛：")) &&
      Boolean(goalPlan?.copyText?.includes("canAdvance="));

    addCheck(input.result, {
      id: "runtime:goal-plan:transition-gate",
      group: "运行时检查",
      label: "目标规划阶段推进门槛 JSON",
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? "目标规划 API 返回 transitionGate、canAdvance、门槛检查项和阶段推进复制口径。"
        : `ok=${Boolean(json?.ok)} transitionGate=${Boolean(transitionGate)} checks=${checks.length} copyReady=${Boolean(goalPlan?.copyText?.includes("阶段推进门槛："))}`,
      action: ready
        ? "保留目标规划阶段推进门槛运行时结构。"
        : "检查 /api/admin/launch/goal-plan 是否返回 transitionGate、checks、canAdvance 和 copyText。",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fetch error";

    addCheck(input.result, {
      id: "runtime:goal-plan:fetch",
      group: "运行时检查",
      label: "/api/admin/launch/goal-plan",
      status: statuses.blocking,
      detail: message,
      action: "确认 base-url 可访问，必要时加大 --timeout-ms。",
    });
  }
}

async function checkDecisionTransitionRuntime(input) {
  const url = `${input.baseUrl}${appendToken("/api/admin/launch/decision", input.adminToken)}`;

  try {
    const response = await fetchWithTimeout({
      url,
      timeoutMs: input.timeoutMs,
      accept: "application/json",
    });

    if (response.status !== 200) {
      addCheck(input.result, {
        id: "runtime:decision:http",
        group: "运行时检查",
        label: "/api/admin/launch/decision",
        status: statuses.blocking,
        detail: `HTTP ${response.status}`,
        action: "确认本地服务已启动、后台 token 正确，并重试最终决策运行时检查。",
      });
      return;
    }

    const json = await response.json();
    const decision = json?.decision;
    const transitionGate = decision?.goalTransitionGate;
    const gates = Array.isArray(decision?.gates) ? decision.gates : [];
    const nextActions = Array.isArray(decision?.nextActions) ? decision.nextActions : [];
    const transitionIssueCount =
      typeof transitionGate?.summary?.blocking === "number" &&
      typeof transitionGate?.summary?.warning === "number"
        ? transitionGate.summary.blocking + transitionGate.summary.warning
        : undefined;
    const gateReady = gates.some((item) => item?.id === "goal_transition");
    const actionReady =
      transitionGate?.canAdvance === true ||
      transitionIssueCount === 0 ||
      nextActions.some((item) => item?.gateId === "goal_transition");
    const ready =
      Boolean(json?.ok) &&
      typeof transitionGate?.canAdvance === "boolean" &&
      typeof transitionGate?.label === "string" &&
      typeof transitionGate?.summary?.blocking === "number" &&
      typeof transitionGate?.summary?.warning === "number" &&
      gateReady &&
      actionReady &&
      Boolean(decision?.copyText?.includes("阶段推进门槛：")) &&
      Boolean(decision?.copyText?.includes("canAdvance="));

    addCheck(input.result, {
      id: "runtime:decision:transition-gate",
      group: "运行时检查",
      label: "最终决策阶段门槛 JSON",
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? "最终决策 API 返回 goalTransitionGate、goal_transition gate、优先项和复制口径。"
        : `ok=${Boolean(json?.ok)} transitionGate=${Boolean(transitionGate)} gateReady=${gateReady} actionReady=${actionReady} copyReady=${Boolean(decision?.copyText?.includes("阶段推进门槛："))}`,
      action: ready
        ? "保留最终决策阶段门槛运行时结构。"
        : "检查 /api/admin/launch/decision 是否返回 goalTransitionGate、goal_transition gate、nextActions 和 copyText。",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fetch error";

    addCheck(input.result, {
      id: "runtime:decision:fetch",
      group: "运行时检查",
      label: "/api/admin/launch/decision",
      status: statuses.blocking,
      detail: message,
      action: "确认 base-url 可访问，必要时加大 --timeout-ms。",
    });
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

  await checkJsonEndpoint({
    result,
    baseUrl,
    adminToken: args.adminToken,
    timeoutMs: args.timeoutMs,
    id: "goal-followup",
    label: "/api/admin/launch/goal-followup",
    route: "/api/admin/launch/goal-followup",
    pickPayload: (json) => json.goalFollowup,
    pickFillIns: (payload) => payload?.fillIns,
    pickSummary: (payload) => payload?.summary,
    copyTextIncludes: (payload) => Boolean(payload?.copyText?.includes("补齐入口")),
    validatePayload: (payload) => {
      const transitionGate = payload?.transitionGate;
      const evidenceActionCenter = payload?.evidenceActionCenter;
      const offlineActionFillIn = Array.isArray(payload?.fillIns)
        ? payload.fillIns.find((item) => item?.id === "fill_offline_action")
        : undefined;
      const evidenceActionFillIn = Array.isArray(payload?.fillIns)
        ? payload.fillIns.find((item) => item?.id === "fill_evidence_action_center")
        : undefined;
      const ok =
        typeof transitionGate?.canAdvance === "boolean" &&
        typeof transitionGate?.blocking === "number" &&
        typeof transitionGate?.warning === "number" &&
        typeof payload?.summary?.offlineActionBlocking === "number" &&
        typeof payload?.summary?.offlineActionWarning === "number" &&
        typeof payload?.summary?.evidenceActionBlocking === "number" &&
        typeof payload?.summary?.evidenceActionWarning === "number" &&
        typeof payload?.summary?.evidenceActionCoverageScore === "number" &&
        typeof evidenceActionCenter?.coverageScore === "number" &&
        typeof evidenceActionCenter?.blocking === "number" &&
        typeof evidenceActionCenter?.warning === "number" &&
        Boolean(payload?.items?.some((item) => item?.id === "offline_action")) &&
        Boolean(payload?.items?.some((item) => item?.id === "evidence_action_center")) &&
        Boolean(offlineActionFillIn?.payloadTemplate?.actionId?.startsWith("offline_action:")) &&
        (evidenceActionCenter?.status === "ready" ||
          Boolean(evidenceActionFillIn?.payloadTemplate?.note)) &&
        Boolean(payload?.copyText?.includes("阶段推进门槛：")) &&
        Boolean(payload?.copyText?.includes("线下办理当前动作")) &&
        Boolean(payload?.copyText?.includes("证据行动中心："));

      return {
        ok,
        detail: ok
          ? "goalFollowup 返回 transitionGate 阶段衔接快照、线下办理当前动作和证据行动中心补齐入口。"
          : "goalFollowup 缺少 transitionGate、线下办理、证据行动中心摘要、补齐入口或复制口径。",
      };
    },
  });
  await checkJsonEndpoint({
    result,
    baseUrl,
    adminToken: args.adminToken,
    timeoutMs: args.timeoutMs,
    id: "handoff",
    label: "/api/admin/launch/handoff",
    route: "/api/admin/launch/handoff",
    pickPayload: (json) => json.handoff,
    pickFillIns: (payload) => payload?.goalFollowup?.fillIns,
    pickSummary: (payload) => payload?.goalFollowup?.summary,
    copyTextIncludes: (payload) =>
      Boolean(
        payload?.copyText?.includes("目标补齐入口") &&
          payload?.copyText?.includes("生产总门禁") &&
          payload?.copyText?.includes("阶段推进门槛") &&
          payload?.copyText?.includes("canAdvance="),
      ),
    validatePayload: (payload) => {
      const productionGate = payload?.productionGate;
      const transitionGate = payload?.goalFollowup?.transitionGate;
      const offlineAction = payload?.offlineAction;
      const productionReady =
        typeof productionGate?.releaseReady === "boolean" &&
        productionGate?.summary &&
        productionGate?.checkSummary &&
        Array.isArray(productionGate?.nextActions);
      const transitionReady =
        typeof transitionGate?.canAdvance === "boolean" &&
        typeof transitionGate?.blocking === "number" &&
        typeof transitionGate?.warning === "number";
      const offlineReady =
        typeof offlineAction?.blocking === "number" &&
        typeof offlineAction?.warning === "number" &&
        typeof offlineAction?.current?.title === "string" &&
        Array.isArray(offlineAction?.todayActions);
      const ok =
        productionReady &&
        transitionReady &&
        offlineReady &&
        Boolean(payload?.copyText?.includes("阶段推进门槛")) &&
        Boolean(payload?.copyText?.includes("线下办理当前动作"));

      return {
        ok,
        detail: ok
          ? "handoff 返回 productionGate、transitionGate 与线下办理当前动作交接快照。"
          : `productionReady=${Boolean(productionReady)} transitionReady=${Boolean(transitionReady)} offlineReady=${Boolean(offlineReady)} copyStageGate=${Boolean(payload?.copyText?.includes("阶段推进门槛"))} copyOfflineAction=${Boolean(payload?.copyText?.includes("线下办理当前动作"))}`,
      };
    },
  });
  await checkDailyBriefRuntime({
    result,
    baseUrl,
    adminToken: args.adminToken,
    timeoutMs: args.timeoutMs,
  });
  await checkGoalPlanTransitionRuntime({
    result,
    baseUrl,
    adminToken: args.adminToken,
    timeoutMs: args.timeoutMs,
  });
  await checkDecisionTransitionRuntime({
    result,
    baseUrl,
    adminToken: args.adminToken,
    timeoutMs: args.timeoutMs,
  });
  await checkHealthPageRuntime({
    result,
    baseUrl,
    adminToken: args.adminToken,
    timeoutMs: args.timeoutMs,
  });
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
  console.log(`目标后续推进验收 mode=${result.mode}`);
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
