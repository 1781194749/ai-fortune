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
const externalItemIds = [
  "entity",
  "domain",
  "icp",
  "postgres",
  "openai",
  "qiniu",
  "wechat_open",
  "alipay",
  "wechat_pay",
  "legal_review",
];
const expectedEnvKeys = [
  "COMPANY_NAME",
  "APP_URL",
  "ICP_RECORD_NO",
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "QINIU_ACCESS_KEY",
  "AUTH_WECHAT_ENABLED",
  "ALIPAY_APP_ID",
  "WECHAT_PAY_MCH_ID",
];
const requiredFiles = [
  "src/lib/launch-offline-action-pack.ts",
  "src/lib/launch-founder-dossier.ts",
  "src/lib/launch-materials.ts",
  "src/lib/launch-external-readiness.ts",
  "src/lib/launch-application-pack.ts",
  "src/lib/launch-env-batch-plan.ts",
  "src/lib/launch-schedule.ts",
  "src/app/api/admin/launch/offline-action-pack/route.ts",
  "src/app/api/admin/launch/founder-dossier/route.ts",
  "src/app/api/admin/launch/external-readiness/route.ts",
  "src/app/admin/launch-offline-action-quick-form.tsx",
  "src/app/admin/health/page.tsx",
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
    return "";
  }

  return readFileSync(absolutePath, "utf8");
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
    action: exists ? "保留该文件。" : "恢复线下办理行动包所需文件。",
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

  const materials = readProjectFile(root, "src/lib/launch-materials.ts");
  const offlinePack = readProjectFile(root, "src/lib/launch-offline-action-pack.ts");
  const founderDossier = readProjectFile(root, "src/lib/launch-founder-dossier.ts");
  const quickForm = readProjectFile(root, "src/app/admin/launch-offline-action-quick-form.tsx");
  const healthPage = readProjectFile(root, "src/app/admin/health/page.tsx");
  const offlineRoute = readProjectFile(root, "src/app/api/admin/launch/offline-action-pack/route.ts");
  const founderRoute = readProjectFile(root, "src/app/api/admin/launch/founder-dossier/route.ts");
  const externalRoute = readProjectFile(root, "src/app/api/admin/launch/external-readiness/route.ts");
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
    id: "materials-external-items",
    group: "线下材料",
    label: "外部事项材料模板",
    content: materials,
    tokens: [...externalItemIds.map((id) => `id: "${id}"`), ...expectedEnvKeys],
    readyDetail: "主体、域名、备案、生产库、OpenAI、七牛、微信、支付宝和法务材料模板均已登记。",
    readyAction: "保留材料模板，并随真实平台要求补充字段。",
    blockingAction: "恢复 launch-materials.ts 中的外部事项模板和关键生产变量。",
  });
  checkContainsAll(result, {
    id: "offline-action-pack-wiring",
    group: "行动包",
    label: "线下办理行动包聚合",
    content: offlinePack,
    tokens: [
      "getLaunchOfflineActionPack",
      "currentAction",
      "todayActions",
      "officialRefs",
      "platformFields",
      "envBatches",
      "copyText",
      "玄机 AI 线下办理行动包",
    ],
    readyDetail: "行动包会输出今天先办、优先队列、官方入口、平台字段、变量批次和可复制一页纸。",
    readyAction: "保留行动包聚合，作为线下资质办理主入口。",
    blockingAction: "恢复 getLaunchOfflineActionPack 的 currentAction、todayActions、officialRefs、platformFields、envBatches 和 copyText。",
  });
  checkContainsAll(result, {
    id: "founder-dossier-wiring",
    group: "创始人办理包",
    label: "主体路径决策助手",
    content: founderDossier,
    tokens: [
      "individual_business",
      "limited_company",
      "overseas_later",
      "pathDecision",
      "recommendedPath",
      "criticalPath",
      "officialRefs",
      "主体路径决策",
    ],
    readyDetail: "创始人办理包包含个体工商户、有限公司和海外预留路径，以及主体路径决策与关键路径。",
    readyAction: "保留主体路径决策助手，辅助线下主体选择。",
    blockingAction: "恢复 launch-founder-dossier.ts 中的主体路径、pathDecision、criticalPath 和 officialRefs。",
  });
  checkContainsAll(result, {
    id: "offline-action-api",
    group: "后台 API",
    label: "线下办理 API",
    content: `${offlineRoute}\n${founderRoute}\n${externalRoute}`,
    tokens: [
      "getLaunchOfflineActionPack",
      "getLaunchFounderDossier",
      "getLaunchExternalReadiness",
      "saveLaunchExternalReadinessItems",
      "canAccessAdminRequest",
      "cache-control",
      "no-store",
    ],
    readyDetail: "线下办理、创始人办理包和外部事项 API 均已接入后台鉴权和 no-store。",
    readyAction: "保留只读行动包 API 和外部事项更新 API。",
    blockingAction: "恢复 offline-action-pack、founder-dossier、external-readiness API 的鉴权、聚合和 no-store。",
  });
  checkContainsAll(result, {
    id: "admin-health-offline-action",
    group: "后台页面",
    label: "/admin/health 线下办理区块",
    content: healthPage,
    tokens: [
      "id=\"launch-offline-action-pack\"",
      "线下办理行动包",
      "launchOfflineActionPack.currentAction",
      "AdminLaunchOfflineActionQuickForm",
      "AdminLaunchOfflineActionQueueForm",
      "可复制办理一页纸",
      "officialRefs",
    ],
    readyDetail: "后台页面展示线下办理行动包、当前事项快填、优先队列和官方入口。",
    readyAction: "保留 /admin/health 线下办理行动区。",
    blockingAction: "恢复 /admin/health 的 launch-offline-action-pack 区块和快填/队列表单。",
  });
  checkContainsAll(result, {
    id: "offline-action-form",
    group: "后台表单",
    label: "线下办理快填表单",
    content: quickForm,
    tokens: [
      "AdminLaunchOfflineActionQuickForm",
      "AdminLaunchOfflineActionQueueForm",
      "/api/admin/launch/external-readiness",
      "targetDate",
      "receiptNo",
      "evidenceUrl",
      "evidenceNote",
    ],
    readyDetail: "当前事项和优先队列都能写入目标日期、回执、证据链接和证据备注。",
    readyAction: "保留线下办理快填和批量更新入口。",
    blockingAction: "恢复 launch-offline-action-quick-form.tsx 的单项/队列保存能力。",
  });
  checkContainsAll(result, {
    id: "offline-action-docs",
    group: "文档口径",
    label: "线下办理命令说明",
    content: docs,
    tokens: [
      "launch:offline-action-check",
      "/api/admin/launch/offline-action-pack",
      "线下办理行动包",
      "主体路径",
      "目标日期",
      "证据",
    ],
    readyDetail: "文档已说明线下办理行动包、API、命令和证据口径。",
    readyAction: "保留文档说明，后续按真实办理流程补充。",
    blockingAction: "补充 README 和项目文档中的 launch:offline-action-check 与线下办理验收说明。",
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
        "user-agent": "xuanji-launch-offline-action-check/1.0",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function sortedIds(items) {
  return items.map((item) => item?.id).filter(Boolean).sort();
}

function missingIds(items) {
  const ids = new Set(sortedIds(items));

  return externalItemIds.filter((id) => !ids.has(id));
}

async function checkOfflineActionApi(result, input) {
  const url = `${input.baseUrl}${appendToken("/api/admin/launch/offline-action-pack", input.adminToken)}`;

  try {
    const response = await fetchWithTimeout({
      url,
      timeoutMs: input.timeoutMs,
    });
    const payload = await response.json().catch(() => ({}));
    const pack = payload?.offlineActionPack;
    const items = Array.isArray(pack?.items) ? pack.items : [];
    const groups = Array.isArray(pack?.groups) ? pack.groups : [];
    const todayActions = Array.isArray(pack?.todayActions) ? pack.todayActions : [];
    const refs = Array.isArray(pack?.officialRefs) ? pack.officialRefs : [];
    const missing = missingIds(items);
    const hasCurrentAction = typeof pack?.currentAction?.id === "string";
    const hasCopyText =
      typeof pack?.copyText === "string" && pack.copyText.includes("玄机 AI 线下办理行动包");
    const hasOperationalDetails = items.every(
      (item) =>
        Array.isArray(item.materials) &&
        Array.isArray(item.outputs) &&
        Array.isArray(item.envKeys) &&
        Array.isArray(item.validation),
    );
    const ready =
      response.ok &&
      payload?.ok === true &&
      missing.length === 0 &&
      items.length >= externalItemIds.length &&
      groups.length > 0 &&
      hasCurrentAction &&
      todayActions.length > 0 &&
      refs.length > 0 &&
      hasCopyText &&
      hasOperationalDetails;

    addCheck(result, {
      id: "runtime-offline-action-api",
      group: "运行时",
      label: "线下办理行动包 API",
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? `/api/admin/launch/offline-action-pack 返回 ${items.length} 个事项、${groups.length} 个分组、${todayActions.length} 个优先动作，当前业务状态 ${pack.status}。`
        : `HTTP ${response.status}；缺失事项：${missing.join(", ") || "无"}；currentAction=${hasCurrentAction ? "有" : "无"}；copyText=${hasCopyText ? "有" : "无"}`,
      action: ready
        ? "保留运行时验收；线下办理变化后用该 API 复核今天先办事项。"
        : "检查 offlineActionPack.items、currentAction、todayActions、officialRefs 和 copyText 输出。",
    });
  } catch (error) {
    addCheck(result, {
      id: "runtime-offline-action-api",
      group: "运行时",
      label: "线下办理行动包 API",
      status: statuses.blocking,
      detail: error instanceof Error ? error.message : String(error),
      action: "确认应用已启动、base-url 可访问，并带上 ADMIN_ACCESS_TOKEN。",
    });
  }
}

async function checkFounderDossierApi(result, input) {
  const url = `${input.baseUrl}${appendToken("/api/admin/launch/founder-dossier", input.adminToken)}`;

  try {
    const response = await fetchWithTimeout({
      url,
      timeoutMs: input.timeoutMs,
    });
    const payload = await response.json().catch(() => ({}));
    const dossier = payload?.founderDossier;
    const criticalPath = Array.isArray(dossier?.criticalPath) ? dossier.criticalPath : [];
    const entityPaths = Array.isArray(dossier?.entityPaths) ? dossier.entityPaths : [];
    const refs = Array.isArray(dossier?.officialRefs) ? dossier.officialRefs : [];
    const hasDecision =
      typeof dossier?.pathDecision?.recommendedPath?.title === "string" &&
      typeof dossier?.pathDecision?.copyText === "string";
    const hasPaths =
      entityPaths.some((pathItem) => pathItem.id === "individual_business") &&
      entityPaths.some((pathItem) => pathItem.id === "limited_company") &&
      entityPaths.some((pathItem) => pathItem.id === "overseas_later");
    const ready =
      response.ok &&
      payload?.ok === true &&
      hasDecision &&
      hasPaths &&
      criticalPath.length > 0 &&
      refs.length > 0;

    addCheck(result, {
      id: "runtime-founder-dossier-api",
      group: "运行时",
      label: "创始人办理包 API",
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? `/api/admin/launch/founder-dossier 返回主体路径决策、${criticalPath.length} 个关键路径事项和 ${refs.length} 个官方入口。`
        : `HTTP ${response.status}；pathDecision=${hasDecision ? "有" : "无"}；entityPaths=${hasPaths ? "完整" : "不完整"}；criticalPath=${criticalPath.length}`,
      action: ready
        ? "保留创始人办理包；用于线下选择主体路径和办理顺序。"
        : "检查 founderDossier.pathDecision、entityPaths、criticalPath 和 officialRefs 输出。",
    });
  } catch (error) {
    addCheck(result, {
      id: "runtime-founder-dossier-api",
      group: "运行时",
      label: "创始人办理包 API",
      status: statuses.blocking,
      detail: error instanceof Error ? error.message : String(error),
      action: "确认应用已启动、base-url 可访问，并带上 ADMIN_ACCESS_TOKEN。",
    });
  }
}

async function checkExternalReadinessApi(result, input) {
  const url = `${input.baseUrl}${appendToken("/api/admin/launch/external-readiness", input.adminToken)}`;

  try {
    const response = await fetchWithTimeout({
      url,
      timeoutMs: input.timeoutMs,
    });
    const payload = await response.json().catch(() => ({}));
    const readiness = payload?.readiness;
    const items = Array.isArray(readiness?.items) ? readiness.items : [];
    const missing = missingIds(items);
    const hasEvidenceFields = items.every(
      (item) =>
        typeof item.action === "string" &&
        typeof item.evidence === "string" &&
        typeof item.owner === "string",
    );
    const ready =
      response.ok &&
      payload?.ok === true &&
      missing.length === 0 &&
      typeof readiness?.summary?.blocking === "number" &&
      hasEvidenceFields;

    addCheck(result, {
      id: "runtime-external-readiness-api",
      group: "运行时",
      label: "外部事项 API",
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? `/api/admin/launch/external-readiness 返回 ${items.length} 个外部事项，当前 ${readiness.summary.blocking} 个阻断。`
        : `HTTP ${response.status}；缺失事项：${missing.join(", ") || "无"}；证据字段=${hasEvidenceFields ? "完整" : "缺失"}`,
      action: ready
        ? "保留外部事项 API；线下办理状态变化后通过后台快填更新。"
        : "检查 readiness.items、summary、action/evidence/owner 字段输出。",
    });
  } catch (error) {
    addCheck(result, {
      id: "runtime-external-readiness-api",
      group: "运行时",
      label: "外部事项 API",
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
        id: "runtime-admin-health-offline-action",
        group: "运行时",
        label: "后台线下办理区块",
        status: statuses.blocking,
        detail: `HTTP ${response.status}`,
        action: "确认后台 token 正确，服务已启动，并检查 /admin/health。",
      });
      return;
    }

    const html = await response.text();
    const missing = [
      "id=\"launch-offline-action-pack\"",
      "线下办理行动包",
      "今天先办",
      "可复制办理一页纸",
      "官方入口",
    ].filter((pattern) => !html.includes(pattern));

    addCheck(result, {
      id: "runtime-admin-health-offline-action",
      group: "运行时",
      label: "后台线下办理区块",
      status: missing.length === 0 ? statuses.ready : statuses.blocking,
      detail: missing.length === 0 ? "后台页面包含线下办理行动包完整区块。" : `缺少 ${missing.join(", ")}`,
      action: missing.length === 0 ? "保留后台线下办理区块。" : "检查 /admin/health 的 launch-offline-action-pack 区块。",
    });
  } catch (error) {
    addCheck(result, {
      id: "runtime-admin-health-offline-action",
      group: "运行时",
      label: "后台线下办理区块",
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
      id: "runtime-base-url",
      group: "运行时",
      label: "base-url",
      status: statuses.blocking,
      detail: "不是有效 URL。",
      action: "使用 --base-url=http://localhost:3000 或正式 HTTPS 域名。",
    });
    return;
  }

  await checkOfflineActionApi(result, input);
  await checkFounderDossierApi(result, input);
  await checkExternalReadinessApi(result, input);
  await checkAdminHealthRuntime(result, input);
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
  console.log(`线下办理行动包验收 mode=${result.mode}`);
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
