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

const requiredFiles = [
  "src/lib/return-to.ts",
  "src/lib/commerce.ts",
  "src/app/pricing/page.tsx",
  "src/app/login/page.tsx",
  "src/app/login/login-form.tsx",
  "src/app/api/auth/email/verify/route.ts",
  "src/lib/post-login-redirect.ts",
  "src/app/member/purchase-button.tsx",
];

const expectedPlans = [
  { code: "trial_7d", name: "体验卡", priceCents: 990 },
  { code: "monthly", name: "月度会员", priceCents: 2900 },
  { code: "pro_monthly", name: "进阶会员", priceCents: 6900 },
  { code: "yearly", name: "年度会员", priceCents: 39900 },
];

function parseArgs(argv) {
  const args = {
    baseUrl: undefined,
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

function normalizeBaseUrl(value) {
  return value.trim().replace(/\/$/, "");
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

function checkFileExists(result, root, filename) {
  const exists = existsSync(path.resolve(root, filename));

  addCheck(result, {
    id: `file:${filename}`,
    group: "静态文件",
    label: filename,
    status: exists ? statuses.ready : statuses.blocking,
    detail: exists ? "文件存在。" : "文件不存在。",
    action: exists ? "保留该文件。" : "恢复购买意图链路所需文件。",
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

function checkReturnTo(result, root) {
  const filename = "src/lib/return-to.ts";
  const content = readProjectFile(root, filename);

  checkContainsAll(result, {
    id: "return-to-safety-rules",
    group: "returnTo 安全",
    label: "内部跳转白名单",
    content,
    tokens: [
      "export function sanitizeReturnTo",
      "export function createLoginHref",
      "!rawValue.startsWith(\"/\")",
      "rawValue.startsWith(\"//\")",
      "parsed.origin !== localOrigin",
      "parsed.pathname.startsWith(\"/api/\")",
      "parsed.pathname === \"/login\"",
      "encodeURIComponent(sanitizeReturnTo",
    ],
    readyDetail: "returnTo 只允许站内路径，并阻断外链、协议相对 URL、API 路径和登录页循环。",
    readyAction: "继续用 createLoginHref 生成登录链接。",
    blockingAction: "补齐 sanitizeReturnTo 的外链、API、登录页循环和编码保护。",
  });
}

function checkCommerceCatalog(result, root) {
  const filename = "src/lib/commerce.ts";
  const content = readProjectFile(root, filename);

  if (!content) {
    return;
  }

  for (const plan of expectedPlans) {
    const ready =
      content.includes(`code: "${plan.code}"`) &&
      content.includes(`name: "${plan.name}"`) &&
      content.includes(`priceCents: ${plan.priceCents}`);

    addCheck(result, {
      id: `membership-plan:${plan.code}`,
      group: "会员商品",
      label: plan.name,
      status: ready ? statuses.ready : statuses.blocking,
      detail: ready ? `${plan.name} 已按预定价格进入会员商品目录。` : `缺少 ${plan.code}/${plan.name}/${plan.priceCents}。`,
      action: ready ? "保留商品目录。" : "恢复四档会员商品价格和 code，避免支付链路无法识别套餐。",
    });
  }

  checkContainsAll(result, {
    id: "membership-tier-map",
    group: "会员商品",
    label: "套餐到会员档位映射",
    content,
    tokens: [
      "membershipTierByProduct",
      "trial_7d: \"TRIAL\"",
      "monthly: \"MONTHLY\"",
      "pro_monthly: \"PRO\"",
      "yearly: \"YEARLY\"",
    ],
    readyDetail: "四档会员都能映射到用户权益档位。",
    readyAction: "保留映射，用于支付成功后的权益发放。",
    blockingAction: "补齐 membershipTierByProduct，确保订单付款后能发会员权益。",
  });
}

function checkPricingPage(result, root) {
  const filename = "src/app/pricing/page.tsx";
  const content = readProjectFile(root, filename);

  checkContainsAll(result, {
    id: "pricing-intent-selection",
    group: "价格页",
    label: "套餐意图识别",
    content,
    tokens: [
      "function getMembershipIntent",
      "membershipProducts.find((product) => product.code === intent)",
      "const selectedPlan = getMembershipIntent(intent)",
      "已选择套餐",
      "已带回你的购买意图",
      "查看套餐卡",
      "已选择",
    ],
    readyDetail: "价格页能从 intent 识别会员套餐，并展示确认区与高亮状态。",
    readyAction: "保留 /pricing?intent=<code>#plans 链路。",
    blockingAction: "恢复 intent 解析、selectedPlan 确认区和套餐卡高亮。",
  });

  checkContainsAll(result, {
    id: "pricing-login-and-purchase-cta",
    group: "价格页",
    label: "登录与购买 CTA",
    content,
    tokens: [
      "createLoginHref(`/pricing?intent=${selectedPlan.code}#plans`)",
      "createLoginHref(`/pricing?intent=${product.code}#plans`)",
      "productCode={selectedPlan.code}",
      "productCode={product.code}",
      "登录后继续购买",
    ],
    readyDetail: "未登录会保留套餐意图去登录，已登录可直接创建订单。",
    readyAction: "保留 CTA 逻辑。",
    blockingAction: "补齐未登录 createLoginHref 和已登录 PurchaseButton 两条路径。",
  });
}

function checkLoginPage(result, root) {
  const filename = "src/app/login/page.tsx";
  const content = readProjectFile(root, filename);

  checkContainsAll(result, {
    id: "login-purchase-intent-parser",
    group: "登录页",
    label: "购买意图解析",
    content,
    tokens: [
      "function getPurchaseIntent",
      "sanitizeReturnTo",
      "new URL(returnTo",
      "parsed.pathname !== \"/pricing\"",
      "parsed.searchParams.get(\"intent\")",
      "membershipProducts.find((item) => item.code === intent)",
      "purchaseIntent",
      "initialReturnTo={returnTo}",
      "purchaseIntent={purchaseIntent}",
    ],
    readyDetail: "登录页只从安全 returnTo 中解析价格页会员购买意图。",
    readyAction: "保留购买前登录文案和传参。",
    blockingAction: "恢复 sanitizeReturnTo、/pricing intent 解析和 LoginForm 传参。",
  });

  checkContainsAll(result, {
    id: "login-purchase-intent-copy",
    group: "登录页",
    label: "购买前登录文案",
    content,
    tokens: [
      "购买前登录",
      "登录后继续购买",
      "你的套餐选择会被保留",
      "priceLabel",
      "starGrant",
      "reportQuota",
      "palmQuota",
    ],
    readyDetail: "登录页会明确告诉用户套餐已保留，并展示套餐权益。",
    readyAction: "保留该文案，降低登录中断流失。",
    blockingAction: "恢复购买前登录、套餐保留和权益展示字段。",
  });
}

function checkLoginForm(result, root) {
  const filename = "src/app/login/login-form.tsx";
  const content = readProjectFile(root, filename);

  checkContainsAll(result, {
    id: "login-form-retained-plan",
    group: "登录表单",
    label: "保留套餐卡片",
    content,
    tokens: [
      "type PurchaseIntent",
      "已保留套餐：{purchaseIntent.name}",
      "{purchaseIntent.priceLabel} / {purchaseIntent.durationDays} 天",
      "{purchaseIntent.starGrant} 星力",
      "{purchaseIntent.reportQuota} 份报告额度",
      "{purchaseIntent.palmQuota} 次手相额度",
      "returnToLabel(returnTo, purchaseIntent)",
    ],
    readyDetail: "登录表单会展示已保留套餐和登录后继续购买按钮。",
    readyAction: "保留表单承接。",
    blockingAction: "恢复 purchaseIntent 类型、保留套餐 UI 和按钮文案。",
  });

  checkContainsAll(result, {
    id: "login-form-safe-redirect",
    group: "登录表单",
    label: "安全登录跳转",
    content,
    tokens: [
      "sanitizeReturnTo(initialReturnTo)",
      "body: JSON.stringify({ email, code, returnTo })",
      "window.location.assign(sanitizeReturnTo(data.redirectTo, returnTo))",
    ],
    readyDetail: "登录提交携带 returnTo，接口响应后仍做前端二次清洗。",
    readyAction: "保留双层清洗。",
    blockingAction: "恢复 verify 请求 returnTo 和响应跳转清洗。",
  });
}

function checkVerifyRoute(result, root) {
  const filename = "src/app/api/auth/email/verify/route.ts";
  const content = readProjectFile(root, filename);
  const redirectContent = readProjectFile(root, "src/lib/post-login-redirect.ts");

  checkContainsAll(result, {
    id: "verify-route-return-to",
    group: "登录接口",
    label: "登录后回跳",
    content: `${content}\n${redirectContent}`,
    tokens: [
      "{ email?: string; code?: string; returnTo?: string }",
      "resolvePostLoginRedirect",
      "sanitizeReturnTo(input.returnTo)",
      "redirectTo,",
    ],
    readyDetail: "验证码接口会返回经过清洗和老用户分流后的 redirectTo。",
    readyAction: "保留接口回跳逻辑。",
    blockingAction: "补齐 returnTo 入参、resolvePostLoginRedirect 和 redirectTo 返回值。",
  });
}

function checkPackageCommand(result, root) {
  const filename = "package.json";
  const content = readProjectFile(root, filename);
  const ready =
    Boolean(content) &&
    content.includes("\"launch:purchase-intent-check\"") &&
    content.includes("scripts/launch-purchase-intent-check.mjs");

  addCheck(result, {
    id: "package-command",
    group: "脚本命令",
    label: "launch:purchase-intent-check",
    status: ready ? statuses.ready : statuses.blocking,
    detail: ready ? "package.json 已注册购买意图验收脚本。" : "package.json 未注册脚本命令。",
    action: ready ? "可通过 npm run launch:purchase-intent-check 运行。" : "在 package.json scripts 中注册该脚本。",
  });
}

function runStaticChecks(result, root) {
  for (const filename of requiredFiles) {
    checkFileExists(result, root, filename);
  }

  checkReturnTo(result, root);
  checkCommerceCatalog(result, root);
  checkPricingPage(result, root);
  checkLoginPage(result, root);
  checkLoginForm(result, root);
  checkVerifyRoute(result, root);
  checkPackageCommand(result, root);
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
        accept: input.accept ?? "text/html",
        "content-type": input.contentType ?? "application/json",
        "user-agent": "xuanji-launch-purchase-intent-check/1.0",
      },
      body: input.body,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readTextResponse(response) {
  return await response.text();
}

function normalizeHtmlText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function addRuntimeCheck(result, input) {
  addCheck(result, {
    id: input.id,
    group: "运行时验收",
    label: input.label,
    status: input.ready ? statuses.ready : statuses.blocking,
    detail: input.ready ? input.readyDetail : input.blockingDetail,
    action: input.ready ? input.readyAction : input.blockingAction,
  });
}

async function runRuntimeChecks(result, input) {
  const monthlyReturnTo = "/pricing?intent=monthly#plans";
  const encodedMonthlyReturnTo = encodeURIComponent(monthlyReturnTo);

  try {
    const pricingResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/pricing?intent=monthly`,
      timeoutMs: input.timeoutMs,
    });
    const pricingHtml = await readTextResponse(pricingResponse);
    const pricingText = normalizeHtmlText(pricingHtml);
    const pricingReady =
      pricingResponse.status === 200 &&
      pricingText.includes("已选择套餐") &&
      pricingText.includes("月度会员") &&
      pricingText.includes("¥29") &&
      pricingText.includes("350 星力") &&
      pricingText.includes("2 份报告额度") &&
      pricingText.includes("3 次手相额度") &&
      pricingText.includes("已选择") &&
      pricingText.includes("登录后继续购买");

    addRuntimeCheck(result, {
      id: "runtime-pricing-monthly-intent",
      label: "/pricing?intent=monthly",
      ready: pricingReady,
      readyDetail: "价格页能渲染月度会员购买意图、权益和登录购买入口。",
      blockingDetail: `status=${pricingResponse.status}, selected=${pricingText.includes("已选择套餐")}, plan=${pricingText.includes("月度会员")}, price=${pricingText.includes("¥29")}, stars=${pricingText.includes("350 星力")}`,
      readyAction: "保留价格页意图入口。",
      blockingAction: "检查 pricing 页面 selectedPlan 渲染和月度会员权益文案。",
    });

    const plainPricingResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/pricing?intent=unknown`,
      timeoutMs: input.timeoutMs,
    });
    const plainPricingHtml = await readTextResponse(plainPricingResponse);
    const plainPricingText = normalizeHtmlText(plainPricingHtml);
    const invalidIntentReady =
      plainPricingResponse.status === 200 &&
      !plainPricingText.includes("已选择套餐") &&
      !plainPricingText.includes("已带回你的购买意图");

    addRuntimeCheck(result, {
      id: "runtime-pricing-invalid-intent",
      label: "/pricing?intent=unknown",
      ready: invalidIntentReady,
      readyDetail: "未知 intent 不会误选套餐。",
      blockingDetail: `status=${plainPricingResponse.status}, selected=${plainPricingText.includes("已选择套餐")}`,
      readyAction: "保留商品目录白名单。",
      blockingAction: "确认 getMembershipIntent 只允许 membershipProducts 里的 code。",
    });

    const loginResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/login?returnTo=${encodedMonthlyReturnTo}`,
      timeoutMs: input.timeoutMs,
    });
    const loginHtml = await readTextResponse(loginResponse);
    const loginText = normalizeHtmlText(loginHtml);
    const loginReady =
      loginResponse.status === 200 &&
      loginText.includes("购买前登录") &&
      loginText.includes("登录后继续购买月度会员") &&
      loginText.includes("已保留套餐") &&
      loginText.includes("月度会员") &&
      loginText.includes("¥29") &&
      loginText.includes("350 星力") &&
      loginText.includes("2 份报告额度") &&
      loginText.includes("3 次手相额度");

    addRuntimeCheck(result, {
      id: "runtime-login-retained-monthly-plan",
      label: "/login?returnTo=/pricing?intent=monthly#plans",
      ready: loginReady,
      readyDetail: "登录页能展示已保留的月度会员套餐和权益。",
      blockingDetail: `status=${loginResponse.status}, hero=${loginText.includes("购买前登录")}, retained=${loginText.includes("已保留套餐")}, plan=${loginText.includes("月度会员")}, stars=${loginText.includes("350 星力")}`,
      readyAction: "保留登录承接。",
      blockingAction: "检查 LoginPage getPurchaseIntent 和 LoginForm purchaseIntent 渲染。",
    });

    const plainLoginResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/login`,
      timeoutMs: input.timeoutMs,
    });
    const plainLoginHtml = await readTextResponse(plainLoginResponse);
    const plainLoginText = normalizeHtmlText(plainLoginHtml);
    const plainLoginReady =
      plainLoginResponse.status === 200 &&
      !plainLoginText.includes("已保留套餐") &&
      plainLoginText.includes("账号与会员底座");

    addRuntimeCheck(result, {
      id: "runtime-login-without-intent",
      label: "/login",
      ready: plainLoginReady,
      readyDetail: "普通登录不会误展示套餐保留卡片。",
      blockingDetail: `status=${plainLoginResponse.status}, retained=${plainLoginText.includes("已保留套餐")}`,
      readyAction: "保留普通登录文案。",
      blockingAction: "确认 purchaseIntent 为空时不渲染保留套餐。",
    });

    const maliciousLoginResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/login?returnTo=${encodeURIComponent("https://evil.example/pricing?intent=monthly")}`,
      timeoutMs: input.timeoutMs,
    });
    const maliciousLoginHtml = await readTextResponse(maliciousLoginResponse);
    const maliciousLoginText = normalizeHtmlText(maliciousLoginHtml);
    const maliciousLoginReady =
      maliciousLoginResponse.status === 200 &&
      !maliciousLoginText.includes("已保留套餐") &&
      !maliciousLoginText.includes("购买前登录");

    addRuntimeCheck(result, {
      id: "runtime-login-malicious-return-to",
      label: "恶意外链 returnTo",
      ready: maliciousLoginReady,
      readyDetail: "外链 returnTo 被降级，不会伪造购买意图。",
      blockingDetail: `status=${maliciousLoginResponse.status}, retained=${maliciousLoginText.includes("已保留套餐")}, hero=${maliciousLoginText.includes("购买前登录")}`,
      readyAction: "保留 returnTo 安全清洗。",
      blockingAction: "检查 sanitizeReturnTo 对外链 returnTo 的降级逻辑。",
    });

    const verifyResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/api/auth/email/verify`,
      method: "POST",
      timeoutMs: input.timeoutMs,
      body: JSON.stringify({
        email: "purchase-intent-check@example.com",
        code: "000000",
        returnTo: monthlyReturnTo,
      }),
    });
    const verifyJson = await verifyResponse.json().catch(() => null);
    const verifyReady =
      verifyResponse.status === 200 &&
      verifyJson?.ok === true &&
      verifyJson?.redirectTo === monthlyReturnTo;

    addRuntimeCheck(result, {
      id: "runtime-verify-preserves-safe-return-to",
      label: "验证码接口保留安全 returnTo",
      ready: verifyReady,
      readyDetail: "登录接口会把安全购买意图原样返回给前端。",
      blockingDetail: `status=${verifyResponse.status}, redirectTo=${verifyJson?.redirectTo ?? "<none>"}`,
      readyAction: "保留接口回跳。",
      blockingAction: "检查 /api/auth/email/verify 的 returnTo 清洗和返回值。",
    });

    const maliciousVerifyResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/api/auth/email/verify`,
      method: "POST",
      timeoutMs: input.timeoutMs,
      body: JSON.stringify({
        email: "purchase-intent-check@example.com",
        code: "000000",
        returnTo: "https://evil.example/pricing?intent=monthly",
      }),
    });
    const maliciousVerifyJson = await maliciousVerifyResponse.json().catch(() => null);
    const maliciousVerifyReady =
      maliciousVerifyResponse.status === 200 &&
      maliciousVerifyJson?.ok === true &&
      maliciousVerifyJson?.redirectTo === "/member";

    addRuntimeCheck(result, {
      id: "runtime-verify-rejects-external-return-to",
      label: "验证码接口拒绝外链 returnTo",
      ready: maliciousVerifyReady,
      readyDetail: "登录接口会把外链 returnTo 降级到会员中心。",
      blockingDetail: `status=${maliciousVerifyResponse.status}, redirectTo=${maliciousVerifyJson?.redirectTo ?? "<none>"}`,
      readyAction: "保留接口安全兜底。",
      blockingAction: "检查 sanitizeReturnTo 对外链和协议 URL 的处理。",
    });
  } catch (error) {
    addCheck(result, {
      id: "runtime-request-error",
      group: "运行时验收",
      label: "运行时请求",
      status: statuses.blocking,
      detail: error instanceof Error ? error.message : String(error),
      action: "确认本地服务已启动，并用 --base-url 指向正确地址。",
    });
  }
}

function printText(result) {
  console.log(`购买意图链路验收：${result.ok ? "通过" : "未通过"}`);
  console.log(
    `模式：${result.mode}，ready=${result.summary.ready} warning=${result.summary.warning} blocking=${result.summary.blocking} total=${result.summary.total}`,
  );

  for (const check of result.checks) {
    const marker =
      check.status === statuses.ready ? "✓" : check.status === statuses.warning ? "!" : "×";
    console.log(`${marker} [${check.status}] ${check.group} / ${check.label}`);
    console.log(`  ${check.detail}`);
    console.log(`  ${check.action}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!validateTimeoutMs(args.timeoutMs)) {
    throw new Error("--timeout-ms 必须是 1000 到 120000 之间的整数。");
  }

  const input = {
    baseUrl: args.baseUrl ? normalizeBaseUrl(args.baseUrl) : undefined,
    timeoutMs: args.timeoutMs,
  };
  const root = process.cwd();
  const result = createResult(input);

  runStaticChecks(result, root);

  if (input.baseUrl) {
    await runRuntimeChecks(result, input);
  }

  summarize(result);

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printText(result);
  }

  if (!result.ok && !args.noFail) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
