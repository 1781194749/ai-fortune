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
const qualificationExternalIds = ["entity", "domain", "icp", "alipay", "wechat_pay"];
const qualificationPlatformIds = ["icp", "alipay", "wechat_pay"];
const paymentChannelIds = ["alipay", "wechat_pay"];
const requiredFiles = [
  "src/lib/launch-external-readiness.ts",
  "src/lib/launch-application-pack.ts",
  "src/lib/launch-compliance-plan.ts",
  "src/lib/launch-payment-plan.ts",
  "src/lib/live-payment-launch-gate.ts",
  "src/app/api/admin/launch/external-readiness/route.ts",
  "src/app/api/admin/launch/application-pack/route.ts",
  "src/app/api/admin/launch/compliance-plan/route.ts",
  "src/app/api/admin/launch/payment-plan/route.ts",
  "src/app/api/admin/launch/decision/route.ts",
  "src/app/admin/health/page.tsx",
  "package.json",
  "README.md",
  "docs/MVP_TASKS.md",
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
        "user-agent": "xuanji-launch-qualification-check/1.0",
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
    action: exists ? "保留该文件。" : "恢复资质接入验收所需文件。",
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

  const externalReadiness = readProjectFile(root, "src/lib/launch-external-readiness.ts");
  const externalRoute = readProjectFile(root, "src/app/api/admin/launch/external-readiness/route.ts");
  const applicationPack = readProjectFile(root, "src/lib/launch-application-pack.ts");
  const compliancePlan = readProjectFile(root, "src/lib/launch-compliance-plan.ts");
  const paymentPlan = readProjectFile(root, "src/lib/launch-payment-plan.ts");
  const livePaymentGate = readProjectFile(root, "src/lib/live-payment-launch-gate.ts");
  const healthPage = readAdminHealthContent(root);
  const packageJson = readProjectFile(root, "package.json");
  const docs = [
    "README.md",
    "docs/MVP_TASKS.md",
    "docs/TECH_ARCHITECTURE.md",
    "docs/PROJECT_PLAN.md",
    "docs/SPRINT_01.md",
    "docs/EXECUTION_ROADMAP.md",
  ]
    .map((filename) => readProjectFile(root, filename))
    .join("\n");

  checkContainsAll(result, {
    id: "qualification-external-readiness",
    group: "资质接入",
    label: "外部资质事项跟踪",
    content: externalReadiness,
    tokens: [
      ...qualificationExternalIds.map((id) => `id: "${id}"`),
      "receiptNo",
      "evidenceUrl",
      "evidenceNote",
      "saveLaunchExternalReadinessItems",
      "launchExternalReadinessFeature",
    ],
    readyDetail: "主体、域名、ICP备案、支付宝和微信支付资质均能记录状态、目标日、回执和证据。",
    readyAction: "保留外部事项作为 ICP/支付资质接入的事实来源。",
    blockingAction: "恢复 launch-external-readiness.ts 中的关键资质事项、证据字段和批量保存能力。",
  });

  checkContainsAll(result, {
    id: "qualification-external-api",
    group: "资质接入",
    label: "外部资质 GET/PATCH API",
    content: externalRoute,
    tokens: [
      "GET",
      "PATCH",
      "saveLaunchExternalReadinessItems",
      "recordAdminAudit",
      "cache-control",
      "no-store",
    ],
    readyDetail: "外部资质状态支持后台读取、批量保存、审计和 no-store 响应。",
    readyAction: "保留该 API 作为后台快填、自动验收和办理证据沉淀入口。",
    blockingAction: "恢复 /api/admin/launch/external-readiness 的 GET/PATCH、批量保存、审计和 no-store。",
  });

  checkContainsAll(result, {
    id: "qualification-application-pack",
    group: "平台申请",
    label: "平台申请材料包",
    content: applicationPack,
    tokens: [
      ...qualificationPlatformIds.map((id) => `id: "${id}"`),
      "officialUrl",
      "fields",
      "submission",
      "receiptNo",
      "evidenceUrl",
      "nextAction",
    ],
    readyDetail: "ICP备案、支付宝和微信支付申请材料能输出官方入口、字段、回执和下一步。",
    readyAction: "保留平台申请材料包，办理资质时直接复制字段并回填回执。",
    blockingAction: "恢复 launch-application-pack.ts 中的 ICP/支付平台模板、官方入口和提交证据字段。",
  });

  checkContainsAll(result, {
    id: "qualification-compliance-plan",
    group: "合规主体",
    label: "ICP备案与支付主体一致性",
    content: compliancePlan,
    tokens: [
      "domain_icp",
      "payment_subjects",
      "legal_review_archive",
      "entityReady",
      "icpReady",
      "paymentSubjectsReady",
      "externalIds",
      "ICP_RECORD_NO",
    ],
    readyDetail: "合规落地计划会把主体、ICP、支付主体一致性和法务归档串成门禁步骤。",
    readyAction: "保留合规主体计划，资质完成后用它确认主体一致。",
    blockingAction: "恢复 launch-compliance-plan.ts 中的主体/ICP/支付主体步骤和摘要字段。",
  });

  checkContainsAll(result, {
    id: "qualification-payment-plan",
    group: "支付资质",
    label: "真实支付接入路径",
    content: paymentPlan,
    tokens: [
      ...paymentChannelIds,
      "application",
      "credentials",
      "diagnostics",
      "callback_guard",
      "paid_callback",
      "reconciliation",
      "ALIPAY_APP_ID",
      "WECHAT_PAY_MCH_ID",
    ],
    readyDetail: "支付宝和微信支付均按申请、密钥、诊断、回调、小额订单、权益和对账拆分。",
    readyAction: "保留支付落地计划；先闭合任一渠道即可进入 paid_smoke。",
    blockingAction: "恢复 launch-payment-plan.ts 的双渠道步骤、回调守门和关键支付变量。",
  });

  checkContainsAll(result, {
    id: "qualification-live-payment-gate",
    group: "真实支付守门",
    label: "真实支付入口保护",
    content: livePaymentGate,
    tokens: [
      "LIVE_PAYMENT_NOT_RELEASED",
      "LIVE_PAYMENT_SMOKE_TEST_USER_IDS",
      "LIVE_PAYMENT_SMOKE_TEST_EMAILS",
      "paid_smoke",
      "release_ready",
      "public_release",
      "smoke_allowlist",
    ],
    readyDetail: "真实支付在 no_go/internal_gray 关闭，在 paid_smoke 只对内部白名单开放。",
    readyAction: "保留真实支付硬守门，防止资质未闭合时误收款。",
    blockingAction: "恢复 live-payment-launch-gate.ts 的 no_go、paid_smoke、release_ready 和白名单逻辑。",
  });

  checkContainsAll(result, {
    id: "qualification-admin-health",
    group: "后台页面",
    label: "/admin/health 资质入口",
    content: healthPage,
    tokens: [
      "资质、域名、云服务与支付跟踪",
      "平台申请材料",
      "合规与主体落地",
      "支付落地",
      "真实支付",
    ],
    readyDetail: "后台健康页集中展示外部资质、平台申请、合规主体、支付落地和真实支付验收。",
    readyAction: "保留后台资质接入入口，方便每天同步办理状态。",
    blockingAction: "恢复 /admin/health 中的外部事项、平台申请、合规、支付落地和真实支付区块。",
  });

  checkContainsAll(result, {
    id: "qualification-package-command",
    group: "脚本命令",
    label: "package 命令",
    content: packageJson,
    tokens: ["\"launch:qualification-check\"", "scripts/launch-qualification-check.mjs"],
    readyDetail: "package.json 已注册资质接入验收脚本。",
    readyAction: "可通过 npm run launch:qualification-check 验收资质接入承接能力。",
    blockingAction: "在 package.json scripts 中注册 launch:qualification-check。",
  });

  checkContainsAll(result, {
    id: "qualification-docs",
    group: "文档口径",
    label: "资质接入验收文档",
    content: docs,
    tokens: [
      "launch:qualification-check",
      "ICP/支付资质接入前置验收",
      "/api/admin/launch/external-readiness",
      "/api/admin/launch/application-pack",
      "/api/admin/launch/payment-plan",
      "真实支付入口保护",
    ],
    readyDetail: "README 和项目文档已说明 ICP/支付资质接入前置验收、API 和真实支付保护口径。",
    readyAction: "保留文档口径，资质办理时按该命令留存验收输出。",
    blockingAction: "补充 README、MVP_TASKS、PROJECT_PLAN、SPRINT_01、TECH_ARCHITECTURE 和 EXECUTION_ROADMAP 中的资质接入验收说明。",
  });
}

function byId(items) {
  return new Map((items ?? []).map((item) => [item.id, item]));
}

function hasIds(items, expectedIds) {
  const ids = new Set((items ?? []).map((item) => item.id));

  return expectedIds.filter((id) => !ids.has(id));
}

async function checkExternalReadinessRuntime(result, input) {
  const { response, payload } = await fetchJson(
    input.baseUrl,
    "/api/admin/launch/external-readiness",
    input.adminToken,
    input.timeoutMs,
  );
  const readiness = payload?.readiness;
  const items = readiness?.items ?? [];
  const missing = hasIds(items, qualificationExternalIds);

  addCheck(result, {
    id: "runtime:external-readiness",
    group: "运行时",
    label: "外部资质事项 API",
    status: response.ok && payload?.ok === true && missing.length === 0 ? statuses.ready : statuses.blocking,
    detail:
      response.ok && payload?.ok === true
        ? `返回 ${items.length} 个外部事项，资质阻断 ${readiness?.summary?.blocking ?? "unknown"} 个。`
        : `HTTP ${response.status}`,
    action:
      response.ok && payload?.ok === true && missing.length === 0
        ? "保留外部资质事项 API；资质真实完成前 blocking 是预期状态。"
        : `检查 /api/admin/launch/external-readiness 是否返回 ${qualificationExternalIds.join("、")}。`,
  });

  if (!response.ok || payload?.ok !== true || missing.length > 0) {
    return undefined;
  }

  return readiness;
}

async function checkExternalReadinessPatchRuntime(result, input, readiness) {
  const itemMap = byId(readiness.items);
  const items = ["icp", "alipay", "wechat_pay"]
    .map((id) => itemMap.get(id))
    .filter(Boolean)
    .map((item) => ({
      id: item.id,
      status: item.status,
      targetDate: item.targetDate,
      receiptNo: item.receiptNo,
      evidenceUrl: item.evidenceUrl,
      evidenceNote: item.evidenceNote,
      note: item.note,
    }));

  if (items.length !== 3) {
    addCheck(result, {
      id: "runtime:external-readiness-patch",
      group: "运行时",
      label: "资质状态批量保存",
      status: statuses.blocking,
      detail: "缺少 icp、alipay 或 wechat_pay，无法验证批量保存。",
      action: "恢复外部事项中的 ICP、支付宝和微信支付记录。",
    });
    return;
  }

  const { response, payload } = await fetchJson(
    input.baseUrl,
    "/api/admin/launch/external-readiness",
    input.adminToken,
    input.timeoutMs,
    {
      method: "PATCH",
      body: JSON.stringify({ items }),
    },
  );
  const returnedItems = payload?.readiness?.items ?? [];
  const returnedMap = byId(returnedItems);
  const saved = items.every((item) => returnedMap.get(item.id)?.status === item.status);

  addCheck(result, {
    id: "runtime:external-readiness-patch",
    group: "运行时",
    label: "资质状态批量保存",
    status: response.ok && payload?.ok === true && saved ? statuses.ready : statuses.blocking,
    detail:
      response.ok && payload?.ok === true && saved
        ? "ICP、支付宝和微信支付当前状态可批量写回并读回。"
        : `HTTP ${response.status}`,
    action:
      response.ok && payload?.ok === true && saved
        ? "保留批量保存能力；该检查只原样写回当前状态，不改变办理结论。"
        : "检查 external-readiness PATCH、批量校验、UsageLog 持久化和后台审计。",
  });
}

async function checkApplicationPackRuntime(result, input) {
  const { response, payload } = await fetchJson(
    input.baseUrl,
    "/api/admin/launch/application-pack",
    input.adminToken,
    input.timeoutMs,
  );
  const platforms = payload?.applicationPack?.platforms ?? [];
  const missing = hasIds(platforms, qualificationPlatformIds);
  const platformMap = byId(platforms);
  const hasFields = qualificationPlatformIds.every((id) => {
    const platform = platformMap.get(id);

    return platform?.officialUrl && Array.isArray(platform.fields) && platform.fields.length > 0;
  });

  addCheck(result, {
    id: "runtime:application-pack",
    group: "运行时",
    label: "平台申请材料 API",
    status: response.ok && payload?.ok === true && missing.length === 0 && hasFields ? statuses.ready : statuses.blocking,
    detail:
      response.ok && payload?.ok === true
        ? `返回 ${platforms.length} 个平台材料，申请阻断 ${payload.applicationPack?.summary?.blocking ?? "unknown"} 个。`
        : `HTTP ${response.status}`,
    action:
      response.ok && payload?.ok === true && missing.length === 0 && hasFields
        ? "保留平台材料 API；正式域名和主体完成后按字段提交并回填回执。"
        : "检查 /api/admin/launch/application-pack 是否返回 ICP、支付宝、微信支付材料和字段。",
  });
}

async function checkCompliancePlanRuntime(result, input) {
  const { response, payload } = await fetchJson(
    input.baseUrl,
    "/api/admin/launch/compliance-plan",
    input.adminToken,
    input.timeoutMs,
  );
  const steps = payload?.compliancePlan?.steps ?? [];
  const missing = hasIds(steps, ["domain_icp", "payment_subjects", "legal_review_archive"]);
  const summary = payload?.compliancePlan?.summary;
  const hasSummary =
    typeof summary?.entityReady === "boolean" &&
    typeof summary?.icpReady === "boolean" &&
    typeof summary?.paymentSubjectsReady === "boolean";

  addCheck(result, {
    id: "runtime:compliance-plan",
    group: "运行时",
    label: "合规主体计划 API",
    status: response.ok && payload?.ok === true && missing.length === 0 && hasSummary ? statuses.ready : statuses.blocking,
    detail:
      response.ok && payload?.ok === true
        ? `返回 ${steps.length} 个合规步骤，主体=${summary?.entityReady ? "ready" : "not_ready"}，ICP=${summary?.icpReady ? "ready" : "not_ready"}。`
        : `HTTP ${response.status}`,
    action:
      response.ok && payload?.ok === true && missing.length === 0 && hasSummary
        ? "保留合规主体计划；资质完成后用它复核主体、备案和支付主体一致。"
        : "检查 /api/admin/launch/compliance-plan 是否返回主体、ICP、支付主体和法务归档步骤。",
  });
}

async function checkPaymentPlanRuntime(result, input) {
  const { response, payload } = await fetchJson(
    input.baseUrl,
    "/api/admin/launch/payment-plan",
    input.adminToken,
    input.timeoutMs,
  );
  const channels = payload?.paymentPlan?.channels ?? [];
  const missing = hasIds(channels, paymentChannelIds);
  const channelMap = byId(channels);
  const hasSteps = paymentChannelIds.every((id) => {
    const steps = channelMap.get(id)?.steps ?? [];
    const stepIds = new Set(steps.map((step) => step.stepId));

    return ["application", "credentials", "callback_guard", "paid_callback", "reconciliation"].every((stepId) =>
      stepIds.has(stepId),
    );
  });

  addCheck(result, {
    id: "runtime:payment-plan",
    group: "运行时",
    label: "支付落地计划 API",
    status: response.ok && payload?.ok === true && missing.length === 0 && hasSteps ? statuses.ready : statuses.blocking,
    detail:
      response.ok && payload?.ok === true
        ? `返回 ${channels.length} 个支付渠道，readyChannels=${payload.paymentPlan?.summary?.readyChannels ?? "unknown"}。`
        : `HTTP ${response.status}`,
    action:
      response.ok && payload?.ok === true && missing.length === 0 && hasSteps
        ? "保留支付落地计划；先闭合一个渠道再进入小额真实订单。"
        : "检查 /api/admin/launch/payment-plan 是否返回双渠道和完整支付步骤。",
  });
}

async function checkDecisionRuntime(result, input) {
  const { response, payload } = await fetchJson(
    input.baseUrl,
    "/api/admin/launch/decision",
    input.adminToken,
    input.timeoutMs,
  );
  const decision = payload?.decision;
  const validDecision =
    decision?.decision === "no_go" ||
    decision?.decision === "internal_gray" ||
    decision?.decision === "paid_smoke" ||
    decision?.decision === "release_ready";
  const hasPaymentGate =
    typeof decision?.paymentEntryReady === "boolean" &&
    typeof decision?.productionGate?.releaseReady === "boolean";

  addCheck(result, {
    id: "runtime:decision-payment-gate",
    group: "运行时",
    label: "真实支付决策守门",
    status: response.ok && payload?.ok === true && validDecision && hasPaymentGate ? statuses.ready : statuses.blocking,
    detail:
      response.ok && payload?.ok === true
        ? `decision=${decision?.decision ?? "unknown"}，paymentEntryReady=${decision?.paymentEntryReady ? "yes" : "no"}，productionRelease=${decision?.productionGate?.releaseReady ? "yes" : "no"}。`
        : `HTTP ${response.status}`,
    action:
      response.ok && payload?.ok === true && validDecision && hasPaymentGate
        ? "保留最终上线决策；真实支付只按 paid_smoke/release_ready 放行。"
        : "检查 /api/admin/launch/decision 是否返回真实支付入口决策字段。",
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
    "资质、域名、云服务与支付跟踪",
    "平台申请材料",
    "合规与主体落地",
    "支付落地",
    "真实支付",
  ];
  const missing = response.ok ? tokens.filter((token) => !text.includes(token)) : tokens;

  addCheck(result, {
    id: "runtime:admin-health-qualification",
    group: "运行时",
    label: "后台资质接入区块",
    status: response.ok && missing.length === 0 ? statuses.ready : statuses.blocking,
    detail: response.ok ? (missing.length === 0 ? "后台页面包含资质接入相关区块。" : `缺少 ${missing.join(", ")}`) : `HTTP ${response.status}`,
    action: response.ok && missing.length === 0 ? "保留后台资质接入区块。" : "检查 /admin/health 中的资质、平台申请、合规和支付区块。",
  });
}

async function checkRuntime(result, input) {
  if (!input.baseUrl) {
    return;
  }

  const readiness = await checkExternalReadinessRuntime(result, input);

  if (readiness) {
    await checkExternalReadinessPatchRuntime(result, input, readiness);
  }

  await checkApplicationPackRuntime(result, input);
  await checkCompliancePlanRuntime(result, input);
  await checkPaymentPlanRuntime(result, input);
  await checkDecisionRuntime(result, input);
  await checkAdminHealthRuntime(result, input);
}

function printText(result) {
  console.log(`ICP/支付资质接入前置验收 mode=${result.mode}`);
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
      action: "确认本地服务已启动、后台 token 正确，并重试资质接入运行时检查。",
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
