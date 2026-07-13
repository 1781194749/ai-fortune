#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const statuses = {
  ready: "ready",
  blocking: "blocking",
};

const defaultTimeoutMs = 45000;
const evidenceKinds = [
  "screenshot",
  "receipt",
  "small_order",
  "cost_sample",
  "archive",
  "admin_record",
];
const evidenceSources = [
  "snapshot",
  "acceptance",
  "readiness",
  "runbook",
  "external",
  "payment",
  "compliance",
  "application_pack",
  "unit_economics",
];
const archiveMetadataKeys = [
  "readiness",
  "runbook",
  "environment",
  "databaseAcceptance",
  "deploymentAcceptance",
  "aiStorageAcceptance",
  "paymentAcceptance",
  "productionGate",
  "acceptanceEvidence",
  "unitEconomics",
  "goalProgress",
  "goalTransitionGate",
  "offlineAction",
  "dailyActionProgress",
];
const requiredFiles = [
  "src/lib/launch-evidence.ts",
  "src/lib/launch-evidence-action-center.ts",
  "src/lib/launch-evidence-gap.ts",
  "src/app/api/admin/launch/evidence/route.ts",
  "src/app/api/admin/launch/evidence-action-center/route.ts",
  "src/app/api/admin/launch/evidence-gap/route.ts",
  "src/app/admin/launch-evidence-actions.tsx",
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

function checkFileExists(result, root, filename) {
  const exists = existsSync(path.resolve(root, filename));

  addCheck(result, {
    id: `file:${filename}`,
    group: "静态文件",
    label: filename,
    status: exists ? statuses.ready : statuses.blocking,
    detail: exists ? "文件存在。" : "文件不存在。",
    action: exists ? "保留该文件。" : "恢复上线证据链验收所需文件。",
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

  const evidenceArchive = readProjectFile(root, "src/lib/launch-evidence.ts");
  const evidenceActionCenter = readProjectFile(root, "src/lib/launch-evidence-action-center.ts");
  const evidenceGap = readProjectFile(root, "src/lib/launch-evidence-gap.ts");
  const evidenceRoute = readProjectFile(root, "src/app/api/admin/launch/evidence/route.ts");
  const actionCenterRoute = readProjectFile(
    root,
    "src/app/api/admin/launch/evidence-action-center/route.ts",
  );
  const gapRoute = readProjectFile(root, "src/app/api/admin/launch/evidence-gap/route.ts");
  const evidenceActions = readProjectFile(root, "src/app/admin/launch-evidence-actions.tsx");
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
    id: "evidence-gap-taxonomy",
    group: "证据缺口",
    label: "缺口来源与证据类型",
    content: evidenceGap,
    tokens: [
      ...evidenceSources.map((source) => `"${source}"`),
      ...evidenceKinds.map((kind) => `"${kind}"`),
      "evidenceKindSummary",
      "nextGaps",
      "coverage",
      "copyText",
      "玄机 AI 上线证据闭环清单",
    ],
    readyDetail: "证据缺口聚合上线包、验收、支付、合规、平台申请和单位经济，并按六类证据输出优先补证清单。",
    readyAction: "保留 getLaunchEvidenceGap，作为证据行动中心和上线前复核的底层口径。",
    blockingAction: "恢复 launch-evidence-gap.ts 的来源、证据类型、coverage、nextGaps 和 copyText 输出。",
  });

  checkContainsAll(result, {
    id: "evidence-action-center-buckets",
    group: "证据行动中心",
    label: "六类补证行动中心",
    content: evidenceActionCenter,
    tokens: [
      "getLaunchEvidenceActionCenter",
      ...evidenceKinds.map((kind) => `${kind}:`),
      "bucketMeta",
      "evidenceKindOrder",
      "nextBuckets",
      "nextItems",
      "copyText",
      "玄机 AI 上线证据行动中心",
    ],
    readyDetail: "证据行动中心会把截图/录屏、平台回执、小额订单、成本样本、后台归档和后台记录拆成负责人、目标和可复制行动口径。",
    readyAction: "保留 action center，后续每天按证据类型推进补证。",
    blockingAction: "恢复 launch-evidence-action-center.ts 的六类 bucket、优先项和 copyText。",
  });

  checkContainsAll(result, {
    id: "evidence-archive-metadata",
    group: "证据归档",
    label: "归档 metadata 覆盖面",
    content: evidenceArchive,
    tokens: [
      "archiveLaunchEvidence",
      "getLaunchEvidenceArchives",
      "createUsageLog",
      "launch_evidence",
      ...archiveMetadataKeys,
      "readProductionGateSteps",
      "readOfflineAction",
      "readGoalTransitionGate",
      "旧归档",
    ],
    readyDetail: "上线证据归档保存 Go/No-Go、生产门禁、线下办理、阶段推进、验收证据、支付、AI/图片、单位经济和执行记录等快照。",
    readyAction: "保留 launch_evidence UsageLog 归档，作为上线前后可追溯证据包。",
    blockingAction: "恢复 launch-evidence.ts 的 archiveLaunchEvidence、getLaunchEvidenceArchives 和核心 metadata 字段。",
  });

  checkContainsAll(result, {
    id: "evidence-apis",
    group: "后台 API",
    label: "证据链 API 鉴权与 no-store",
    content: `${evidenceRoute}\n${actionCenterRoute}\n${gapRoute}`,
    tokens: [
      "canAccessAdminRequest",
      "getLaunchEvidenceActionCenter",
      "getLaunchEvidenceGap",
      "archiveLaunchEvidence",
      "getLaunchEvidenceArchives",
      "cache-control",
      "no-store",
      "evidenceActionCenter",
      "evidenceGap",
      "archives",
    ],
    readyDetail: "证据行动中心、证据缺口和证据归档 API 均接入后台鉴权并禁用缓存。",
    readyAction: "保留只读 API 和归档 POST，供后台与自动化验收复用。",
    blockingAction: "恢复 evidence、evidence-action-center、evidence-gap API 的鉴权、聚合和 no-store 响应。",
  });

  checkContainsAll(result, {
    id: "admin-health-evidence-panels",
    group: "后台页面",
    label: "/admin/health 证据链区块",
    content: healthPage,
    tokens: [
      "getLaunchEvidenceActionCenter",
      "getLaunchEvidenceGap",
      "getLaunchEvidenceArchives",
      "AdminLaunchEvidenceActions",
      "id=\"launch-evidence-action-center\"",
      "上线证据缺口",
      "id=\"launch-evidence-archive\"",
      "可复制行动中心",
      "可复制补证清单",
    ],
    readyDetail: "后台健康页展示证据行动中心、证据缺口、归档列表和手动归档入口。",
    readyAction: "保留 /admin/health 证据链区块，作为开工后的每日补证入口。",
    blockingAction: "恢复 /admin/health 的证据行动中心、证据缺口和证据归档区块。",
  });

  checkContainsAll(result, {
    id: "admin-evidence-actions-form",
    group: "后台页面",
    label: "证据归档操作表单",
    content: evidenceActions,
    tokens: [
      "AdminLaunchEvidenceActions",
      "/api/admin/launch/evidence",
      "POST",
      "note",
      "router.refresh",
      "归档当前证据",
    ],
    readyDetail: "后台可以带备注 POST 归档当前上线证据，并刷新页面展示最新快照。",
    readyAction: "保留归档操作表单，真实上线前用它沉淀证据包。",
    blockingAction: "恢复 launch-evidence-actions.tsx 的 POST、备注和刷新逻辑。",
  });

  checkContainsAll(result, {
    id: "package-evidence-check",
    group: "脚本命令",
    label: "package 命令",
    content: packageJson,
    tokens: [
      "\"launch:evidence-check\"",
      "scripts/launch-evidence-check.mjs",
    ],
    readyDetail: "package.json 已注册上线证据链验收脚本。",
    readyAction: "可通过 npm run launch:evidence-check 验收。",
    blockingAction: "在 package.json scripts 中注册 launch:evidence-check。",
  });

  checkContainsAll(result, {
    id: "docs-evidence-check",
    group: "文档口径",
    label: "证据链验收文档",
    content: docs,
    tokens: [
      "launch:evidence-check",
      "/api/admin/launch/evidence-action-center",
      "/api/admin/launch/evidence-gap",
      "/api/admin/launch/evidence",
      "上线证据行动中心",
      "上线证据缺口",
      "上线证据归档",
    ],
    readyDetail: "README 和项目文档已说明证据链命令、API、后台区块与验收口径。",
    readyAction: "保留文档口径，后续按真实补证流程更新细节。",
    blockingAction: "补充 README 和项目文档中的 launch:evidence-check 与证据链验收说明。",
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
        "user-agent": "xuanji-launch-evidence-check/1.0",
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

function hasAllEvidenceKinds(items) {
  const kinds = new Set(items.map((item) => item?.kind).filter(Boolean));

  return evidenceKinds.every((kind) => kinds.has(kind));
}

async function checkEvidenceActionCenterApi(result, input) {
  const url = `${input.baseUrl}${appendToken(
    "/api/admin/launch/evidence-action-center",
    input.adminToken,
  )}`;

  try {
    const response = await fetchWithTimeout({
      url,
      timeoutMs: input.timeoutMs,
    });
    const payload = await response.json().catch(() => ({}));
    const center = payload?.evidenceActionCenter;
    const buckets = Array.isArray(center?.buckets) ? center.buckets : [];
    const nextItems = Array.isArray(center?.nextItems) ? center.nextItems : [];
    const hasSummary =
      typeof center?.summary?.evidenceCoverageScore === "number" &&
      typeof center?.summary?.buckets === "number";
    const hasBuckets =
      buckets.length === 0 ||
      buckets.every(
        (bucket) =>
          evidenceKinds.includes(bucket?.kind) &&
          hasObject(bucket?.summary) &&
          Array.isArray(bucket?.items) &&
          Array.isArray(bucket?.nextItems) &&
          typeof bucket?.copyText === "string",
      );
    const hasCopyText =
      typeof center?.copyText === "string" &&
      center.copyText.includes("玄机 AI 上线证据行动中心");
    const ready =
      response.ok &&
      payload?.ok === true &&
      hasObject(center) &&
      hasSummary &&
      hasBuckets &&
      Array.isArray(center?.nextBuckets) &&
      nextItems.every((item) => typeof item?.id === "string") &&
      hasCopyText;

    addCheck(result, {
      id: "runtime:evidence-action-center-api",
      group: "运行时",
      label: "证据行动中心 API",
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? `/api/admin/launch/evidence-action-center 返回 ${buckets.length} 个证据分组、${nextItems.length} 个优先补证项，当前状态 ${center.status}。`
        : `HTTP ${response.status}；summary=${hasSummary ? "有" : "缺失"}；buckets=${hasBuckets ? "可用" : "异常"}；copyText=${hasCopyText ? "有" : "缺失"}`,
      action: ready
        ? "保留运行时证据行动中心；每天可按该 API 拆分补证工作。"
        : "检查 getLaunchEvidenceActionCenter 输出、bucket summary、nextItems 和 copyText。",
    });
  } catch (error) {
    addCheck(result, {
      id: "runtime:evidence-action-center-api",
      group: "运行时",
      label: "证据行动中心 API",
      status: statuses.blocking,
      detail: error instanceof Error ? error.message : String(error),
      action: "确认应用已启动、base-url 可访问，并带上 ADMIN_ACCESS_TOKEN。",
    });
  }
}

async function checkEvidenceGapApi(result, input) {
  const url = `${input.baseUrl}${appendToken("/api/admin/launch/evidence-gap", input.adminToken)}`;

  try {
    const response = await fetchWithTimeout({
      url,
      timeoutMs: input.timeoutMs,
    });
    const payload = await response.json().catch(() => ({}));
    const gap = payload?.evidenceGap;
    const evidenceKindSummary = Array.isArray(gap?.evidenceKindSummary)
      ? gap.evidenceKindSummary
      : [];
    const gaps = Array.isArray(gap?.gaps) ? gap.gaps : [];
    const nextGaps = Array.isArray(gap?.nextGaps) ? gap.nextGaps : [];
    const hasCoverage = typeof gap?.coverage?.score === "number";
    const hasSummary = typeof gap?.summary?.blocking === "number";
    const hasSnapshot =
      typeof gap?.snapshot?.state === "string" && typeof gap?.snapshot?.label === "string";
    const hasCopyText =
      typeof gap?.copyText === "string" && gap.copyText.includes("玄机 AI 上线证据闭环清单");
    const ready =
      response.ok &&
      payload?.ok === true &&
      hasObject(gap) &&
      hasAllEvidenceKinds(evidenceKindSummary) &&
      hasCoverage &&
      hasSummary &&
      hasSnapshot &&
      Array.isArray(gaps) &&
      nextGaps.every((item) => typeof item?.id === "string" && Array.isArray(item?.evidenceKinds)) &&
      hasCopyText;

    addCheck(result, {
      id: "runtime:evidence-gap-api",
      group: "运行时",
      label: "证据缺口 API",
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? `/api/admin/launch/evidence-gap 返回 ${evidenceKindSummary.length} 类证据统计、${gaps.length} 个缺口、${nextGaps.length} 个优先项，可执行率 ${gap.coverage.score}%。`
        : `HTTP ${response.status}；evidenceKindSummary=${evidenceKindSummary.length}；coverage=${hasCoverage ? "有" : "缺失"}；snapshot=${hasSnapshot ? "有" : "缺失"}；copyText=${hasCopyText ? "有" : "缺失"}`,
      action: ready
        ? "保留运行时证据缺口 API；上线前用它检查截图、回执、订单和成本样本是否闭合。"
        : "检查 getLaunchEvidenceGap 的 evidenceKindSummary、coverage、snapshot、nextGaps 和 copyText。",
    });
  } catch (error) {
    addCheck(result, {
      id: "runtime:evidence-gap-api",
      group: "运行时",
      label: "证据缺口 API",
      status: statuses.blocking,
      detail: error instanceof Error ? error.message : String(error),
      action: "确认应用已启动、base-url 可访问，并带上 ADMIN_ACCESS_TOKEN。",
    });
  }
}

async function checkEvidenceArchiveGetApi(result, input) {
  const url = `${input.baseUrl}${appendToken("/api/admin/launch/evidence", input.adminToken)}`;

  try {
    const response = await fetchWithTimeout({
      url,
      timeoutMs: input.timeoutMs,
    });
    const payload = await response.json().catch(() => ({}));
    const archives = Array.isArray(payload?.archives) ? payload.archives : [];
    const hasArchiveShape = archives.every(
      (archive) =>
        typeof archive?.id === "string" &&
        typeof archive?.createdAt === "string" &&
        hasObject(archive?.metadata),
    );
    const ready = response.ok && payload?.ok === true && Array.isArray(payload?.archives) && hasArchiveShape;

    addCheck(result, {
      id: "runtime:evidence-archive-get-api",
      group: "运行时",
      label: "证据归档列表 API",
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? `/api/admin/launch/evidence GET 返回 ${archives.length} 条上线证据归档。`
        : `HTTP ${response.status}；archives=${Array.isArray(payload?.archives) ? "数组" : "缺失"}；shape=${hasArchiveShape ? "可用" : "异常"}`,
      action: ready
        ? "保留归档列表 API；正式上线前确认最新归档能覆盖当前 Go/No-Go。"
        : "检查 getLaunchEvidenceArchives 返回结构和 evidence route GET 响应。",
    });
  } catch (error) {
    addCheck(result, {
      id: "runtime:evidence-archive-get-api",
      group: "运行时",
      label: "证据归档列表 API",
      status: statuses.blocking,
      detail: error instanceof Error ? error.message : String(error),
      action: "确认应用已启动、base-url 可访问，并带上 ADMIN_ACCESS_TOKEN。",
    });
  }
}

async function checkEvidenceArchivePostApi(result, input) {
  const url = `${input.baseUrl}${appendToken("/api/admin/launch/evidence", input.adminToken)}`;

  try {
    const response = await fetchWithTimeout({
      url,
      method: "POST",
      timeoutMs: input.timeoutMs,
      body: JSON.stringify({
        note: `launch:evidence-check ${new Date().toISOString()}`,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    const metadata = payload?.archive?.metadata;
    const missingMetadata = archiveMetadataKeys.filter((key) => !hasObject(metadata?.[key]));
    const ready =
      response.ok &&
      payload?.ok === true &&
      typeof payload?.archive?.id === "string" &&
      hasObject(metadata) &&
      metadata?.event === "launch_evidence" &&
      missingMetadata.length === 0;

    addCheck(result, {
      id: "runtime:evidence-archive-post-api",
      group: "运行时",
      label: "证据归档写入 API",
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? `/api/admin/launch/evidence POST 写入归档 ${payload.archive.id}，metadata 覆盖 ${archiveMetadataKeys.length} 类上线证据。`
        : `HTTP ${response.status}；archive=${typeof payload?.archive?.id === "string" ? "有" : "缺失"}；缺少 metadata：${missingMetadata.join(", ") || "无"}`,
      action: ready
        ? "保留归档写入 API；正式上线前用后台按钮写入最终证据包。"
        : "检查 archiveLaunchEvidence 的 metadata 覆盖面、UsageLog 写入和 route POST 响应。",
    });
  } catch (error) {
    addCheck(result, {
      id: "runtime:evidence-archive-post-api",
      group: "运行时",
      label: "证据归档写入 API",
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
        id: "runtime:admin-health-evidence",
        group: "运行时",
        label: "后台证据链区块",
        status: statuses.blocking,
        detail: `HTTP ${response.status}`,
        action: "确认后台 token 正确，服务已启动，并检查 /admin/health。",
      });
      return;
    }

    const html = await response.text();
    const missing = [
      "id=\"launch-evidence-action-center\"",
      "证据行动中心",
      "上线证据缺口",
      "可复制补证清单",
      "id=\"launch-evidence-archive\"",
      "上线证据归档",
      "归档当前证据",
    ].filter((pattern) => !html.includes(pattern));

    addCheck(result, {
      id: "runtime:admin-health-evidence",
      group: "运行时",
      label: "后台证据链区块",
      status: missing.length === 0 ? statuses.ready : statuses.blocking,
      detail: missing.length === 0 ? "后台页面包含证据行动中心、证据缺口和证据归档区块。" : `缺少 ${missing.join(", ")}`,
      action: missing.length === 0 ? "保留后台证据链区块。" : "检查 /admin/health 的上线证据相关区块。",
    });
  } catch (error) {
    addCheck(result, {
      id: "runtime:admin-health-evidence",
      group: "运行时",
      label: "后台证据链区块",
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

  await checkEvidenceActionCenterApi(result, input);
  await checkEvidenceGapApi(result, input);
  await checkEvidenceArchiveGetApi(result, input);
  await checkEvidenceArchivePostApi(result, input);
  await checkAdminHealthRuntime(result, input);
}

function statusIcon(status) {
  return status === statuses.ready ? "OK" : "BLOCK";
}

function printTextReport(result) {
  console.log(`上线证据链验收 mode=${result.mode}`);
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
