#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const statuses = {
  ready: "ready",
  warning: "warning",
  blocking: "blocking",
};

const defaultEnvFiles = [".env.production.local", ".env.production"];
const defaultTimeoutMs = 15000;

const gateSteps = [
  {
    id: "preflight",
    label: "生产变量预检",
    command: "node",
    script: "scripts/launch-preflight.mjs",
    network: false,
    action: "补齐正式域名、生产库、安全密钥、登录、AI/七牛、支付和主体备案变量。",
  },
  {
    id: "database",
    label: "PostgreSQL 与 Prisma Schema",
    command: "node",
    script: "scripts/launch-db-check.mjs",
    network: true,
    timeout: true,
    extraArgs: ["--schema"],
    action: "确认生产 PostgreSQL 可连接，已执行迁移或 schema push，核心表存在。",
  },
  {
    id: "url",
    label: "公网域名与关键路由",
    command: "node",
    script: "scripts/launch-url-check.mjs",
    network: true,
    timeout: true,
    action: "确认 APP_URL 指向正式 HTTPS 域名，首页、协议、后台健康页和回调路径可访问。",
  },
  {
    id: "ai-storage",
    label: "OpenAI 与七牛云",
    command: "node",
    script: "scripts/launch-ai-storage-check.mjs",
    network: true,
    timeout: true,
    action: "确认 OpenAI 模型可读取，七牛上传 token、上传域名和公开域名可用。",
  },
  {
    id: "compliance",
    label: "合规与主体一致性",
    command: "node",
    script: "scripts/launch-compliance-check.mjs",
    network: false,
    timeout: true,
    action: "确认协议四件套、主体名称、ICP备案、退款边界、图片授权和合规落地计划均已闭合。",
  },
  {
    id: "payment",
    label: "真实支付签名门禁",
    command: "node",
    script: "scripts/launch-payment-check.mjs",
    network: false,
    action: "确认 PAYMENT_PROVIDER=live，至少一个渠道参数完整，密钥格式和本地签名能力通过。",
  },
];

function parseArgs(argv) {
  const args = {
    envFile: undefined,
    json: false,
    noFail: false,
    allowLocal: false,
    skipNetwork: false,
    timeoutMs: defaultTimeoutMs,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

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

    if (arg === "--skip-network") {
      args.skipNetwork = true;
    }
  }

  return args;
}

function validateTimeoutMs(value) {
  return Number.isInteger(value) && value >= 1000 && value <= 120000;
}

function pickDefaultEnvFile() {
  return defaultEnvFiles.find((filename) => existsSync(filename));
}

function shellQuote(value) {
  if (/^[\w./:=@-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
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

function readSummary(value) {
  const summary = value?.summary ?? {};

  return {
    ready: Number(summary.ready ?? 0),
    warning: Number(summary.warning ?? 0),
    blocking: Number(summary.blocking ?? 0),
    total: Number(summary.total ?? 0),
  };
}

function collectBlockingItems(payload) {
  const sources = [
    ...(Array.isArray(payload?.checks) ? payload.checks : []),
    ...(Array.isArray(payload?.targets) ? payload.targets : []),
  ];

  return sources
    .filter((item) => item?.status === statuses.blocking)
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      label: item.label,
      detail: item.detail,
      action: item.action,
    }));
}

function collectWarningItems(payload) {
  const sources = [
    ...(Array.isArray(payload?.checks) ? payload.checks : []),
    ...(Array.isArray(payload?.targets) ? payload.targets : []),
  ];

  return sources
    .filter((item) => item?.status === statuses.warning)
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      label: item.label,
      detail: item.detail,
      action: item.action,
    }));
}

function buildStepArgs(step, input) {
  const args = [step.script, "--json", "--no-fail"];

  if (input.envFile) {
    args.push("--env", input.envFile);
  }

  if (step.timeout) {
    args.push("--timeout-ms", String(input.timeoutMs));
  }

  if (input.allowLocal && (step.id === "database" || step.id === "url")) {
    args.push("--allow-local");
  }

  if (step.extraArgs) {
    args.push(...step.extraArgs);
  }

  return args;
}

function runCommand(step, input) {
  const args = buildStepArgs(step, input);

  return new Promise((resolve) => {
    const child = spawn(step.command, args, {
      cwd: input.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({
        ok: false,
        exitCode: 1,
        stdout,
        stderr: error.message,
      });
    });
    child.on("close", (exitCode) => {
      resolve({
        ok: exitCode === 0,
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

function parseJsonOutput(output) {
  try {
    return JSON.parse(output);
  } catch {
    const firstBrace = output.indexOf("{");
    const lastBrace = output.lastIndexOf("}");

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(output.slice(firstBrace, lastBrace + 1));
    }

    throw new Error("子检查未输出有效 JSON。");
  }
}

async function runGate(input) {
  const steps = [];

  for (const step of gateSteps) {
    const commandArgs = buildStepArgs(step, input);

    if (input.skipNetwork && step.network) {
      steps.push({
        id: step.id,
        label: step.label,
        status: statuses.warning,
        ok: false,
        skipped: true,
        network: step.network,
        command: [step.command, ...commandArgs].map(shellQuote).join(" "),
        summary: {
          ready: 0,
          warning: 1,
          blocking: 0,
          total: 1,
        },
        blockingItems: [],
        warningItems: [
          {
            id: `${step.id}-skipped`,
            label: "已跳过网络诊断",
            detail: "本次使用 --skip-network，没有连接生产服务或第三方平台。",
            action: step.action,
          },
        ],
        action: step.action,
      });
      continue;
    }

    const run = await runCommand(step, input);

    if (!run.ok && !run.stdout.trim()) {
      steps.push({
        id: step.id,
        label: step.label,
        status: statuses.blocking,
        ok: false,
        skipped: false,
        network: step.network,
        command: [step.command, ...commandArgs].map(shellQuote).join(" "),
        summary: {
          ready: 0,
          warning: 0,
          blocking: 1,
          total: 1,
        },
        blockingItems: [
          {
            id: `${step.id}-command-error`,
            label: "命令执行失败",
            detail: run.stderr.trim() || `exitCode=${run.exitCode}`,
            action: "先修复该脚本运行错误，再重新执行上线总门禁。",
          },
        ],
        warningItems: [],
        action: step.action,
      });
      continue;
    }

    try {
      const payload = parseJsonOutput(run.stdout);
      const summary = readSummary(payload);
      const status =
        summary.blocking > 0 ? statuses.blocking : summary.warning > 0 ? statuses.warning : statuses.ready;

      steps.push({
        id: step.id,
        label: step.label,
        status,
        ok: Boolean(payload.ok),
        skipped: false,
        network: step.network,
        command: [step.command, ...commandArgs].map(shellQuote).join(" "),
        summary,
        blockingItems: collectBlockingItems(payload),
        warningItems: collectWarningItems(payload),
        action: step.action,
      });
    } catch (error) {
      steps.push({
        id: step.id,
        label: step.label,
        status: statuses.blocking,
        ok: false,
        skipped: false,
        network: step.network,
        command: [step.command, ...commandArgs].map(shellQuote).join(" "),
        summary: {
          ready: 0,
          warning: 0,
          blocking: 1,
          total: 1,
        },
        blockingItems: [
          {
            id: `${step.id}-json-error`,
            label: "JSON 解析失败",
            detail: error instanceof Error ? error.message : String(error),
            action: "确认子脚本 --json 输出保持纯 JSON。",
          },
        ],
        warningItems: [],
        action: step.action,
      });
    }
  }

  const summary = {
    ready: steps.filter((step) => step.status === statuses.ready).length,
    warning: steps.filter((step) => step.status === statuses.warning).length,
    blocking: steps.filter((step) => step.status === statuses.blocking).length,
    total: steps.length,
  };
  const detailSummary = steps.reduce(
    (accumulator, step) => ({
      ready: accumulator.ready + step.summary.ready,
      warning: accumulator.warning + step.summary.warning,
      blocking: accumulator.blocking + step.summary.blocking,
      total: accumulator.total + step.summary.total,
    }),
    { ready: 0, warning: 0, blocking: 0, total: 0 },
  );
  const ok = summary.blocking === 0 && steps.every((step) => step.ok || step.skipped);
  const releaseReady = ok && !input.skipNetwork;

  return {
    ok,
    releaseReady,
    generatedAt: new Date().toISOString(),
    envFile: input.envFile,
    skipNetwork: input.skipNetwork,
    allowLocal: input.allowLocal,
    timeoutMs: input.timeoutMs,
    summary,
    detailSummary,
    steps,
  };
}

function printTextReport(result) {
  console.log(`生产上线总门禁 env=${result.envFile || "process.env"}`);
  console.log(
    `steps ready=${result.summary.ready} warning=${result.summary.warning} blocking=${result.summary.blocking} total=${result.summary.total}`,
  );
  console.log(
    `checks ready=${result.detailSummary.ready} warning=${result.detailSummary.warning} blocking=${result.detailSummary.blocking} total=${result.detailSummary.total}`,
  );
  console.log(`releaseReady=${result.releaseReady ? "yes" : "no"}`);
  console.log("");

  for (const step of result.steps) {
    console.log(`[${statusIcon(step.status)}] ${step.label}`);
    console.log(`  ${step.command}`);
    console.log(
      `  summary ready=${step.summary.ready} warning=${step.summary.warning} blocking=${step.summary.blocking} total=${step.summary.total}`,
    );

    if (step.blockingItems.length > 0) {
      console.log("  blocking:");

      for (const item of step.blockingItems) {
        console.log(`  - ${item.label}: ${item.detail}`);
        console.log(`    ${item.action}`);
      }
    } else if (step.warningItems.length > 0) {
      console.log("  warnings:");

      for (const item of step.warningItems) {
        console.log(`  - ${item.label}: ${item.detail}`);
        console.log(`    ${item.action}`);
      }
    } else {
      console.log(`  ${step.action}`);
    }
  }

  console.log("");
  console.log(
    result.releaseReady
      ? result.summary.warning > 0
        ? "结论：无 BLOCK，可进入真实收费灰度复核；WARN 项需在上线证据里说明或补齐。"
        : "结论：生产门禁已全绿，可进入真实收费灰度或 release_ready 复核。"
      : "结论：暂不可宣布收费上线；先处理 BLOCK，随后复核 WARN 并重跑总门禁。",
  );
}

const args = parseArgs(process.argv.slice(2));

if (!validateTimeoutMs(args.timeoutMs)) {
  console.error("--timeout-ms must be an integer between 1000 and 120000.");
  process.exit(args.noFail ? 0 : 1);
}

const envFile = args.envFile ?? pickDefaultEnvFile();

if (envFile && !existsSync(path.resolve(process.cwd(), envFile))) {
  console.error(`Env file not found: ${envFile}`);
  process.exit(args.noFail ? 0 : 1);
}

const result = await runGate({
  cwd: process.cwd(),
  envFile,
  allowLocal: args.allowLocal,
  skipNetwork: args.skipNetwork,
  timeoutMs: args.timeoutMs,
});

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printTextReport(result);
}

if (!result.ok && !args.noFail) {
  process.exit(1);
}
