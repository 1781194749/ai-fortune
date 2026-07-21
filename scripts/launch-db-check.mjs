#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;

const statuses = {
  ready: "ready",
  warning: "warning",
  blocking: "blocking",
};

const defaultEnvFiles = [".env.production.local", ".env.production"];
const defaultTimeoutMs = 8000;
const coreTables = [
  "User",
  "AuthAccount",
  "FortuneProfile",
  "Membership",
  "WalletTransaction",
  "Order",
  "AiSession",
  "Message",
  "Report",
  "ImageUpload",
  "UsageLog",
];

function parseArgs(argv) {
  const args = {
    baseUrl: undefined,
    envFile: undefined,
    json: false,
    noFail: false,
    allowLocal: false,
    requireSchema: false,
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
      continue;
    }

    if (arg === "--allow-local") {
      args.allowLocal = true;
      continue;
    }

    if (arg === "--schema") {
      args.requireSchema = true;
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

function isLocalHost(hostname) {
  return /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)$/i.test(hostname);
}

function validateTimeoutMs(value) {
  return Number.isInteger(value) && value >= 1000 && value <= 60000;
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

function maskedPart(value) {
  if (!value) {
    return "";
  }

  if (value.length <= 2) {
    return "*".repeat(value.length);
  }

  return `${value.slice(0, 1)}***${value.slice(-1)}`;
}

function maskDatabaseUrl(rawValue) {
  try {
    const url = new URL(rawValue);

    if (url.username) {
      url.username = maskedPart(decodeURIComponent(url.username));
    }

    if (url.password) {
      url.password = "***";
    }

    return url.toString();
  } catch {
    return "<invalid-database-url>";
  }
}

function sslFromUrl(url) {
  const sslMode = url.searchParams.get("sslmode");

  if (!sslMode || sslMode === "disable") {
    return undefined;
  }

  if (sslMode === "no-verify") {
    return { rejectUnauthorized: false };
  }

  return { rejectUnauthorized: sslMode !== "require" };
}

function initialResult(input) {
  return {
    ok: false,
    generatedAt: new Date().toISOString(),
    envFile: input.envFile,
    baseUrl: input.baseUrl,
    databaseUrl: {
      configured: false,
      masked: "",
      protocol: "",
      host: "",
      database: "",
      local: false,
    },
    checks: [],
    connection: {
      attempted: false,
      ok: false,
      database: "",
      user: "",
      serverVersion: "",
      message: "尚未尝试连接。",
    },
    schema: {
      checked: false,
      ok: false,
      present: [],
      missing: [],
    },
  };
}

function addCheck(result, check) {
  result.checks.push(check);
}

function summarize(result) {
  const blocking = result.checks.filter((item) => item.status === statuses.blocking).length;
  const warning = result.checks.filter((item) => item.status === statuses.warning).length;

  result.ok = blocking === 0 && result.connection.ok && (!result.schema.checked || result.schema.ok);
  result.summary = {
    ready: result.checks.filter((item) => item.status === statuses.ready).length,
    warning,
    blocking,
    total: result.checks.length,
  };

  return result;
}

async function checkConnection(input) {
  const result = initialResult(input);
  const rawDatabaseUrl = input.env.DATABASE_URL?.trim() ?? "";

  if (!rawDatabaseUrl || isPlaceholder(rawDatabaseUrl)) {
    addCheck(result, {
      id: "database-url",
      label: "DATABASE_URL",
      status: statuses.blocking,
      detail: rawDatabaseUrl ? "仍是占位值" : "未配置",
      action: "填写生产 PostgreSQL 连接串，再重新运行 npm run launch:db-check。",
    });
    return summarize(result);
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(rawDatabaseUrl);
  } catch {
    addCheck(result, {
      id: "database-url-format",
      label: "连接串格式",
      status: statuses.blocking,
      detail: "DATABASE_URL 不是有效 URL。",
      action: "使用 postgresql://user:password@host:5432/database?schema=public 格式。",
    });
    return summarize(result);
  }

  const protocolOk = parsedUrl.protocol === "postgresql:" || parsedUrl.protocol === "postgres:";
  const local = isLocalHost(parsedUrl.hostname);

  result.databaseUrl = {
    configured: true,
    masked: maskDatabaseUrl(rawDatabaseUrl),
    protocol: parsedUrl.protocol.replace(":", ""),
    host: parsedUrl.host,
    database: parsedUrl.pathname.replace(/^\//, ""),
    local,
  };

  addCheck(result, {
    id: "database-url-protocol",
    label: "连接串协议",
    status: protocolOk ? statuses.ready : statuses.blocking,
    detail: parsedUrl.protocol,
    action: protocolOk ? "保留当前 PostgreSQL 连接协议。" : "DATABASE_URL 必须使用 postgresql:// 或 postgres://。",
  });

  addCheck(result, {
    id: "database-url-local",
    label: "生产数据库地址",
    status: local && !input.allowLocal ? statuses.blocking : local ? statuses.warning : statuses.ready,
    detail: local ? "当前指向本地数据库" : `当前指向 ${parsedUrl.hostname}`,
    action:
      local && !input.allowLocal
        ? "生产上线不能使用 localhost；如只是本地自测请加 --allow-local。"
        : "确认该地址属于正式 PostgreSQL 实例，并已配置访问白名单。",
  });

  if (!protocolOk || (local && !input.allowLocal)) {
    result.connection.message = "连接检查被阻断项跳过。";
    return summarize(result);
  }

  result.connection.attempted = true;

  const client = new Client({
    connectionString: rawDatabaseUrl,
    connectionTimeoutMillis: input.timeoutMs,
    ssl: sslFromUrl(parsedUrl),
  });

  try {
    await client.connect();
    const versionResult = await client.query(
      "select current_database() as database, current_user as user, version() as version",
    );
    const row = versionResult.rows[0] ?? {};

    result.connection = {
      attempted: true,
      ok: true,
      database: row.database ?? "",
      user: row.user ?? "",
      serverVersion: String(row.version ?? "").split(",")[0],
      message: "PostgreSQL 连接成功。",
    };
    addCheck(result, {
      id: "database-connect",
      label: "连接测试",
      status: statuses.ready,
      detail: `${result.connection.database} / ${result.connection.user}`,
      action: "保留该命令输出和云数据库连接配置脱敏截图。",
    });

    if (input.requireSchema) {
      const schemaResult = await client.query(
        "select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[])",
        [coreTables],
      );
      const present = schemaResult.rows.map((rowItem) => rowItem.table_name).sort();
      const missing = coreTables.filter((table) => !present.includes(table));

      result.schema = {
        checked: true,
        ok: missing.length === 0,
        present,
        missing,
      };
      addCheck(result, {
        id: "prisma-schema",
        label: "Prisma 核心表",
        status: missing.length === 0 ? statuses.ready : statuses.blocking,
        detail: missing.length === 0 ? "核心表已存在" : `缺少 ${missing.join(", ")}`,
        action:
          missing.length === 0
            ? "保留 schema 检查结果，继续运行后台落库探针。"
            : "先运行 npm run prisma:migrate:deploy，再重新运行 npm run launch:db-check -- --schema。",
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error";

    result.connection = {
      attempted: true,
      ok: false,
      database: "",
      user: "",
      serverVersion: "",
      message,
    };
    addCheck(result, {
      id: "database-connect",
      label: "连接测试",
      status: statuses.blocking,
      detail: message,
      action: "检查数据库地址、端口、用户名、密码、SSL、访问白名单和安全组后重试。",
    });
  } finally {
    await client.end().catch(() => undefined);
  }

  return summarize(result);
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


function databasePlanApiUrl(baseUrl, env) {
  const url = new URL("/api/admin/launch/database-plan", baseUrl);
  const adminToken = env.ADMIN_ACCESS_TOKEN?.trim() ?? "";

  if (adminToken && !isPlaceholder(adminToken)) {
    url.searchParams.set("token", adminToken);
  }

  return url;
}

function validateDatabasePlanWiring(result) {
  const root = process.cwd();
  const databasePlan = readProjectFile(root, "src/lib/launch-database-plan.ts");
  const apiRoute = readProjectFile(root, "src/app/api/admin/launch/database-plan/route.ts");
  const healthPage = readAdminHealthContent(root);
  const evidenceForm = readProjectFile(
    root,
    "src/app/admin/launch-database-acceptance-evidence-form.tsx",
  );
  const requiredStepIds = [
    '"provision"',
    '"connection"',
    '"schema"',
    '"probe"',
    '"coverage"',
    '"backup"',
  ];
  const missingStepIds = requiredStepIds.filter((stepId) => !databasePlan.includes(`id: ${stepId}`));
  const ready =
    missingStepIds.length === 0 &&
    databasePlan.includes("buildCommandGroups") &&
    databasePlan.includes("launch:db-check -- --schema") &&
    databasePlan.includes("POST /api/admin/persistence/probe") &&
    apiRoute.includes("getLaunchDatabasePlan") &&
    apiRoute.includes("saveLaunchDatabaseAcceptanceEvidence") &&
    apiRoute.includes('cache-control": "no-store"') &&
    healthPage.includes("launchDatabasePlan") &&
    healthPage.includes("AdminLaunchDatabaseAcceptanceEvidenceForm") &&
    evidenceForm.includes("migrationLogUrl") &&
    evidenceForm.includes("restoreDrillUrl");

  addCheck(result, {
    id: "database-plan-wiring",
    label: "后台数据库落地计划",
    status: ready ? statuses.ready : statuses.blocking,
    detail: ready
      ? "后台数据库落地计划包含实例、连接、Schema、探针、覆盖和备份步骤，并支持证据快填。"
      : `数据库落地计划 wiring 不完整；缺失步骤：${missingStepIds.join(", ") || "未知"}`,
    action: ready
      ? "保留该计划；生产库配置后按命令顺序逐项留证。"
      : "恢复 getLaunchDatabasePlan、只读 API、后台展示和数据库验收证据快填。",
  });
}

async function validateDatabasePlanApi(result, input) {
  if (!input.baseUrl) {
    return;
  }

  try {
    const response = await fetch(databasePlanApiUrl(input.baseUrl, input.env), {
      signal: AbortSignal.timeout(input.timeoutMs),
      headers: { accept: "application/json" },
    });
    const payload = await response.json().catch(() => null);
    const steps = Array.isArray(payload?.databasePlan?.steps) ? payload.databasePlan.steps : [];
    const stepIds = steps.map((step) => step.id);
    const requiredStepIds = ["provision", "connection", "schema", "probe", "coverage", "backup"];
    const missingStepIds = requiredStepIds.filter((stepId) => !stepIds.includes(stepId));
    const commandGroups = Array.isArray(payload?.databasePlan?.commandGroups)
      ? payload.databasePlan.commandGroups
      : [];
    const hasSchemaCommand = commandGroups.some((group) =>
      Array.isArray(group.commands)
        ? group.commands.some((command) => command.command?.includes("launch:db-check -- --schema"))
        : false,
    );
    const ready =
      response.ok &&
      payload?.ok === true &&
      missingStepIds.length === 0 &&
      commandGroups.length > 0 &&
      hasSchemaCommand;

    addCheck(result, {
      id: "database-plan-api",
      label: "数据库落地计划 API",
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready
        ? `/api/admin/launch/database-plan 返回 ${steps.length} 个步骤和 ${commandGroups.length} 个命令组。`
        : `API 状态 ${response.status}；缺失步骤：${missingStepIds.join(", ") || "无"}；schema 命令：${hasSchemaCommand ? "有" : "无"}`,
      action: ready
        ? "保留运行时验收；上线前用正式后台 token 和正式 APP_URL 再跑一次。"
        : "检查后台访问 token、databasePlan.steps 和 commandGroups 输出。",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown runtime check error";

    addCheck(result, {
      id: "database-plan-api",
      label: "数据库落地计划 API",
      status: statuses.blocking,
      detail: message,
      action: "确认应用已启动、base-url 可访问，并带上 ADMIN_ACCESS_TOKEN。",
    });
  }
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
  console.log(`数据库上线检查 env=${result.envFile || "process.env"}`);
  console.log(`baseUrl=${result.baseUrl || "未启用运行时检查"}`);
  console.log(
    `summary ready=${result.summary.ready} warning=${result.summary.warning} blocking=${result.summary.blocking} total=${result.summary.total}`,
  );
  console.log(`database=${result.databaseUrl.masked || "未配置"}`);
  console.log("");

  for (const item of result.checks) {
    console.log(`[${statusIcon(item.status)}] ${item.label}`);
    console.log(`  ${item.detail}`);
    console.log(`  ${item.action}`);
  }

  console.log("");
  console.log(`[${result.connection.ok ? "OK" : "BLOCK"}] PostgreSQL 连接`);
  console.log(`  ${result.connection.message}`);

  if (result.connection.ok) {
    console.log(`  database=${result.connection.database}`);
    console.log(`  user=${result.connection.user}`);
    console.log(`  server=${result.connection.serverVersion}`);
  }

  if (result.schema.checked) {
    console.log("");
    console.log(`[${result.schema.ok ? "OK" : "BLOCK"}] Prisma 核心表`);
    console.log(`  present=${result.schema.present.length}`);
    console.log(`  missing=${result.schema.missing.length ? result.schema.missing.join(", ") : "无"}`);
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
const result = await checkConnection({
  baseUrl,
  env,
  envFile,
  allowLocal: args.allowLocal,
  requireSchema: args.requireSchema,
  timeoutMs: args.timeoutMs,
});
validateDatabasePlanWiring(result);
await validateDatabasePlanApi(result, {
  baseUrl,
  env,
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
