#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import process from "node:process";

const defaultByteLength = 48;
const minByteLength = 32;
const maxByteLength = 96;

function parseArgs(argv) {
  const args = {
    byteLength: defaultByteLength,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--bytes") {
      args.byteLength = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--bytes=")) {
      args.byteLength = Number(arg.slice("--bytes=".length));
      continue;
    }

    if (arg === "--json") {
      args.json = true;
    }
  }

  return args;
}

function validateByteLength(value) {
  if (!Number.isInteger(value) || value < minByteLength || value > maxByteLength) {
    throw new Error(`--bytes must be an integer between ${minByteLength} and ${maxByteLength}.`);
  }
}

function quoteEnvValue(value) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
}

function generateSecret(byteLength) {
  return randomBytes(byteLength).toString("base64url");
}

function buildEnv(byteLength) {
  return {
    APP_LOCALE: "zh-CN",
    AUTH_EMAIL_ENABLED: "false",
    AUTH_SESSION_SECRET: generateSecret(byteLength),
    ADMIN_DASHBOARD_ENABLED: "true",
    ADMIN_ACCESS_TOKEN: generateSecret(byteLength),
    PAYMENT_CALLBACK_DEV_BYPASS: "false",
  };
}

function printTextReport(input) {
  console.log("# 玄机 AI 基础安全变量");
  console.log("# 只复制到部署平台或本地 .env.production.local；不要提交到代码仓库。");
  console.log(`# generatedAt=${input.generatedAt}`);
  console.log(`# secretBytes=${input.byteLength}`);
  console.log("");

  for (const [key, value] of Object.entries(input.env)) {
    console.log(`${key}=${quoteEnvValue(value)}`);
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  validateByteLength(args.byteLength);

  const result = {
    ok: true,
    generatedAt: new Date().toISOString(),
    byteLength: args.byteLength,
    env: buildEnv(args.byteLength),
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printTextReport(result);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`launch-secrets failed: ${message}`);
  process.exit(1);
}
