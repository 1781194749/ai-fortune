#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const statuses = {
  ready: "ready",
  blocking: "blocking",
};

const defaultTimeoutMs = 45000;

const requiredFiles = [
  "prisma/schema.prisma",
  "src/lib/entitlement-store.ts",
  "src/lib/member-entitlements.ts",
  "src/lib/mock-payment-store.ts",
  "src/app/member/page.tsx",
  "src/app/palm/page.tsx",
  "src/app/palm/palm-client.tsx",
  "src/app/api/fortune/palm/route.ts",
  "src/app/reports/deep/page.tsx",
  "src/app/reports/deep/deep-report-client.tsx",
  "src/app/api/reports/deep/member-quota/route.ts",
  "src/lib/deep-report-job.ts",
  "src/app/admin/page.tsx",
  "src/app/admin/entitlement-adjust-form.tsx",
  "src/app/api/admin/entitlements/adjust/route.ts",
  "src/app/admin/order-actions.tsx",
  "src/app/api/admin/orders/[orderId]/refund/route.ts",
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

function emailToUserId(email) {
  return `email_${createHash("sha256").update(email).digest("hex").slice(0, 24)}`;
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
    action: exists ? "保留该文件。" : "恢复会员权益闭环所需文件。",
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

function runStaticChecks(result, root) {
  for (const filename of requiredFiles) {
    checkFileExists(result, root, filename);
  }

  checkContainsAll(result, {
    id: "commerce-membership-quotas",
    group: "会员商品",
    label: "四档会员权益字段",
    content: readProjectFile(root, "src/lib/commerce.ts"),
    tokens: [
      "starGrant: 350",
      "reportQuota: 2",
      "palmQuota: 3",
      "reportQuota: 6",
      "palmQuota: 10",
      "reportQuota: 12",
      "palmQuota: 36",
    ],
    readyDetail: "会员商品包含星力、深度报告额度和手相额度。",
    readyAction: "保留商品权益配置。",
    blockingAction: "补齐会员商品的 starGrant/reportQuota/palmQuota。",
  });

  checkContainsAll(result, {
    id: "entitlement-ledger-schema",
    group: "权益账本",
    label: "Prisma 权益账本模型",
    content: readProjectFile(root, "prisma/schema.prisma"),
    tokens: [
      "enum EntitlementKind",
      "enum EntitlementEventType",
      "model EntitlementAccount",
      "model EntitlementTransaction",
      "@@unique([userId, kind])",
      "idempotencyKey String?",
      "entitlementEvents EntitlementTransaction[]",
    ],
    readyDetail: "Prisma schema 已包含权益账户、权益流水和幂等键。",
    readyAction: "保留权益账本模型，用于真实支付、退款和审计。",
    blockingAction: "补齐 EntitlementAccount/EntitlementTransaction 模型和关联关系。",
  });

  checkContainsAll(result, {
    id: "entitlement-ledger-store",
    group: "权益账本",
    label: "权益账本服务层",
    content: readProjectFile(root, "src/lib/entitlement-store.ts"),
    tokens: [
      "grantMembershipEntitlementsForOrder",
      "syncMembershipEntitlementsFromPaidOrders",
      "getStoredMemberEntitlementSummary",
      "spendMemberEntitlement",
      "refundMemberEntitlement",
      "adjustMemberEntitlement",
      "getAdminEntitlementAccounts",
      "getAdminEntitlementTransactions",
      "idempotencyKey: `membership:${input.orderId}:${grant.kind}:grant`",
      "paymentSource",
      "member_entitlement_usage",
      "member_entitlement_refund",
    ],
    readyDetail: "权益账本服务层支持付款发放、幂等、消费、退款和内存兜底。",
    readyAction: "保留 entitlement-store 作为会员权益唯一扣减层。",
    blockingAction: "补齐权益账本的发放、消费、退款和幂等逻辑。",
  });

  checkContainsAll(result, {
    id: "entitlement-admin-observability",
    group: "权益账本",
    label: "后台权益账本可观测",
    content: readProjectFile(root, "src/app/admin/page.tsx"),
    tokens: [
      "getAdminEntitlementAccounts",
      "getAdminEntitlementTransactions",
      "会员权益账本",
      "额度余额与发放流水",
      "entitlementEventLabel",
      "entitlementEventClass",
      "报告额度",
      "手相额度",
      "幂等键",
    ],
    readyDetail: "后台已展示会员权益账户、额度余额、权益流水和幂等键。",
    readyAction: "保留后台权益账本视图，便于客服和支付回调排查。",
    blockingAction: "补齐 /admin 的会员权益账本账户余额与流水展示。",
  });

  checkContainsAll(result, {
    id: "entitlement-admin-adjustment",
    group: "权益账本",
    label: "后台权益额度调整",
    content: [
      readProjectFile(root, "src/app/admin/page.tsx"),
      readProjectFile(root, "src/app/admin/entitlement-adjust-form.tsx"),
      readProjectFile(root, "src/app/api/admin/entitlements/adjust/route.ts"),
      readProjectFile(root, "src/lib/admin-audit.ts"),
    ].join("\n"),
    tokens: [
      "AdminEntitlementAdjustForm",
      "人工调整额度",
      "/api/admin/entitlements/adjust",
      "adjustMemberEntitlement",
      "entitlement_adjust",
      "当前余额不足，不能扣成负数",
      "提交调整",
    ],
    readyDetail: "后台支持人工补发或扣回会员报告/手相额度，并写入审计。",
    readyAction: "保留后台权益调整表单和审计接口。",
    blockingAction: "补齐后台权益调整表单、接口、余额校验和审计日志。",
  });

  checkContainsAll(result, {
    id: "admin-order-refund",
    group: "订单售后",
    label: "后台订单退款闭环",
    content: [
      readProjectFile(root, "src/lib/mock-payment-store.ts"),
      readProjectFile(root, "src/lib/entitlement-store.ts"),
      readProjectFile(root, "src/app/admin/page.tsx"),
      readProjectFile(root, "src/app/admin/order-actions.tsx"),
      readProjectFile(root, "src/app/api/admin/orders/[orderId]/refund/route.ts"),
      readProjectFile(root, "src/lib/admin-audit.ts"),
    ].join("\n"),
    tokens: [
      "refundPaidOrder",
      "OrderStatus.REFUNDED",
      "WalletEventType.REFUND",
      "checkMembershipEntitlementsCanBeRevokedForOrder",
      "revokeMembershipEntitlementsForOrder",
      "AdminOrderActions",
      "标记退款",
      "/api/admin/orders/${orderId}/refund",
      "order_refund",
      "订单退款",
      "已标记退款并回滚内部权益",
    ],
    readyDetail: "后台订单退款会校验余额、标记 REFUNDED、写入钱包退款流水、扣回会员权益并记录审计。",
    readyAction: "保留退款服务、后台按钮和审计记录，后续接真实支付原路退款。",
    blockingAction: "补齐后台退款接口、服务层回滚、订单按钮和 order_refund 审计。",
  });

  checkContainsAll(result, {
    id: "entitlement-summary",
    group: "权益计算",
    label: "权益汇总",
    content: readProjectFile(root, "src/lib/member-entitlements.ts"),
    tokens: [
      "buildMemberEntitlementSummary",
      "getMemberEntitlementSummary",
      "getStoredMemberEntitlementSummary",
      "syncMembershipEntitlementsFromPaidOrders",
      "isMemberEntitlementUsage",
      "createEntitlementUsageSnapshot",
      "paymentSource: \"membership_quota\"",
      "entitlementKind",
      "reportQuota",
      "palmQuota",
      "remaining",
    ],
    readyDetail: "会员权益优先读取账本余额，并保留旧报告标记兼容。",
    readyAction: "保留权益汇总层。",
    blockingAction: "恢复账本优先的会员权益汇总、使用标记和余额计算。",
  });

  checkContainsAll(result, {
    id: "member-page-entitlements",
    group: "会员中心",
    label: "权益可见",
    content: readProjectFile(root, "src/app/member/page.tsx"),
    tokens: [
      "getMemberEntitlementSummary",
      "深度报告额度",
      "手相额度",
      "getEntitlementUsageLabel",
      "份深度报告额度",
      "次手相额度",
    ],
    readyDetail: "会员中心展示星力、档位、深度报告额度和手相额度。",
    readyAction: "保留会员中心权益展示。",
    blockingAction: "补齐会员中心权益展示和套餐权益说明。",
  });

  checkContainsAll(result, {
    id: "palm-quota-consumption",
    group: "手相权益",
    label: "手相额度优先抵扣",
    content: readProjectFile(root, "src/app/api/fortune/palm/route.ts"),
    tokens: [
      "getMemberEntitlementSummary",
      "spendMemberEntitlement",
      "useMembershipQuota",
      "createEntitlementUsageSnapshot(\"palm_reading\")",
      "paymentSource: \"membership_quota\"",
      "remainingAfter",
      "cost: 0",
      "spendStars",
    ],
    readyDetail: "手相分析会先用会员手相额度，没额度再扣星力。",
    readyAction: "保留手相额度抵扣。",
    blockingAction: "恢复手相会员额度优先抵扣和报告使用标记。",
  });

  checkContainsAll(result, {
    id: "palm-page-quota-display",
    group: "手相权益",
    label: "手相页额度展示",
    content: readProjectFile(root, "src/app/palm/palm-client.tsx"),
    tokens: [
      "initialPalmQuota",
      "手相额度",
      "本次优先抵扣会员额度",
      "setPalmQuota(data.entitlement.remainingAfter)",
      "本次使用 1 次会员手相额度",
    ],
    readyDetail: "手相页展示并即时更新会员手相额度。",
    readyAction: "保留手相页额度反馈。",
    blockingAction: "补齐手相页 initialPalmQuota、余额展示和消费后更新。",
  });

  checkContainsAll(result, {
    id: "deep-report-quota-api",
    group: "深度报告权益",
    label: "会员额度生成接口",
    content: readProjectFile(root, "src/app/api/reports/deep/member-quota/route.ts"),
    tokens: [
      "getMemberEntitlementSummary",
      "entitlements.reportQuota.remaining <= 0",
      "createQueuedDeepReport",
      "createEntitlementUsageSnapshot(\"deep_report\")",
      "startJob: false",
      "spendMemberEntitlement",
      "startDeepReportJob",
      "spendEntitlement.balance",
    ],
    readyDetail: "深度报告会员额度先排队、再扣账本、扣成功后启动生成。",
    readyAction: "保留会员额度生成接口。",
    blockingAction: "补齐会员报告额度账本校验、扣减和消费后余额返回。",
  });

  checkContainsAll(result, {
    id: "deep-report-quota-refund",
    group: "深度报告权益",
    label: "生成失败退回额度",
    content: readProjectFile(root, "src/lib/deep-report-job.ts"),
    tokens: [
      "refundMemberEntitlement",
      "深度报告生成失败，退回 1 份会员报告额度",
      "entitlementRefundTransactionId",
      "startJob?: boolean",
    ],
    readyDetail: "会员额度深度报告生成失败时会幂等退回额度。",
    readyAction: "保留失败退款逻辑。",
    blockingAction: "补齐深度报告生成失败后的会员额度退款逻辑。",
  });

  checkContainsAll(result, {
    id: "deep-report-quota-ui",
    group: "深度报告权益",
    label: "深度报告页额度入口",
    content: readProjectFile(root, "src/app/reports/deep/deep-report-client.tsx"),
    tokens: [
      "会员报告额度",
      "createMemberQuotaReport",
      "/api/reports/deep/member-quota",
      "用会员额度生成",
      "会员额度",
      "setReportQuota(data.entitlement)",
    ],
    readyDetail: "深度报告页展示会员报告额度，并提供消费入口。",
    readyAction: "保留深度报告会员额度入口。",
    blockingAction: "补齐深度报告页会员额度展示和生成按钮。",
  });

  checkContainsAll(result, {
    id: "package-command",
    group: "脚本命令",
    label: "launch:member-entitlements-check",
    content: readProjectFile(root, "package.json"),
    tokens: [
      "\"launch:member-entitlements-check\"",
      "scripts/launch-member-entitlements-check.mjs",
    ],
    readyDetail: "package.json 已注册会员权益验收脚本。",
    readyAction: "可通过 npm run launch:member-entitlements-check 运行。",
    blockingAction: "在 package.json scripts 中注册该脚本。",
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
        accept: input.accept ?? "text/html",
        "content-type": input.contentType ?? "application/json",
        cookie: input.cookie ?? "",
        "user-agent": "xuanji-launch-member-entitlements-check/1.0",
      },
      body: input.body,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeHtmlText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getCookieHeader(response) {
  const rawSetCookie =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);

  return rawSetCookie
    .map((cookie) => cookie.split(";")[0])
    .filter(Boolean)
    .join("; ");
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

async function readJson(response) {
  return await response.json().catch(() => null);
}

async function runRuntimeChecks(result, input) {
  try {
    const email = `member-entitlements-${Date.now()}@example.com`;
    const userId = emailToUserId(email);
    const loginResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/api/auth/email/verify`,
      method: "POST",
      timeoutMs: input.timeoutMs,
      body: JSON.stringify({ email, code: "000000", returnTo: "/member" }),
    });
    const loginJson = await readJson(loginResponse);
    const cookie = getCookieHeader(loginResponse);
    const loginReady = loginResponse.status === 200 && loginJson?.ok === true && cookie.includes("xuanji_session=");

    addRuntimeCheck(result, {
      id: "runtime-login",
      label: "开发验证码登录",
      ready: loginReady,
      readyDetail: "已登录并拿到会话 cookie。",
      blockingDetail: `status=${loginResponse.status}, ok=${loginJson?.ok}, cookie=${Boolean(cookie)}`,
      readyAction: "继续运行购买和权益验收。",
      blockingAction: "确认 dev 环境允许 000000 验证码登录。",
    });

    if (!loginReady) {
      return;
    }

    const createOrderResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/api/payments/mock/orders`,
      method: "POST",
      timeoutMs: input.timeoutMs,
      cookie,
      body: JSON.stringify({ productCode: "monthly" }),
    });
    const createOrderJson = await readJson(createOrderResponse);
    const orderId = createOrderJson?.order?.id;
    const createOrderReady =
      createOrderResponse.status === 200 &&
      createOrderJson?.ok === true &&
      typeof orderId === "string";

    addRuntimeCheck(result, {
      id: "runtime-create-monthly-order",
      label: "创建月度会员订单",
      ready: createOrderReady,
      readyDetail: "已创建月度会员 mock 订单。",
      blockingDetail: `status=${createOrderResponse.status}, orderId=${orderId ?? "<none>"}`,
      readyAction: "继续模拟支付。",
      blockingAction: "检查 /api/payments/mock/orders 和会员商品 code。",
    });

    if (!createOrderReady) {
      return;
    }

    const payResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/api/payments/mock/orders/${orderId}/pay`,
      method: "POST",
      timeoutMs: input.timeoutMs,
      cookie,
    });
    const payJson = await readJson(payResponse);
    const updatedCookie = getCookieHeader(payResponse) || cookie;
    const payReady =
      payResponse.status === 200 &&
      payJson?.ok === true &&
      payJson?.transaction?.amount === 350 &&
      payJson?.transaction?.balanceAfter === 350;

    addRuntimeCheck(result, {
      id: "runtime-pay-monthly-order",
      label: "支付后发放星力",
      ready: payReady,
      readyDetail: "月度会员支付后发放 350 星力，并刷新会话。",
      blockingDetail: `status=${payResponse.status}, amount=${payJson?.transaction?.amount}, balance=${payJson?.transaction?.balanceAfter}`,
      readyAction: "继续核对会员中心。",
      blockingAction: "检查 completeMockOrder、WalletTransaction 和 createSession。",
    });

    const repeatPayResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/api/payments/mock/orders/${orderId}/pay`,
      method: "POST",
      timeoutMs: input.timeoutMs,
      cookie: updatedCookie,
    });
    const repeatPayJson = await readJson(repeatPayResponse);
    const repeatPayReady =
      repeatPayResponse.status === 200 &&
      repeatPayJson?.ok === true &&
      repeatPayJson?.order?.status === "PAID" &&
      repeatPayJson?.transaction === null;

    addRuntimeCheck(result, {
      id: "runtime-repeat-pay-idempotent",
      label: "重复支付幂等",
      ready: repeatPayReady,
      readyDetail: "重复支付同一会员订单不会再次生成星力流水。",
      blockingDetail: `status=${repeatPayResponse.status}, ok=${repeatPayJson?.ok}, orderStatus=${repeatPayJson?.order?.status}, transaction=${JSON.stringify(repeatPayJson?.transaction)}`,
      readyAction: "保留支付成功后的订单状态判断和权益幂等发放。",
      blockingAction: "检查 completeMockOrder 和 grantMembershipEntitlementsForOrder 的重复支付处理。",
    });

    const memberResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/member`,
      timeoutMs: input.timeoutMs,
      cookie: updatedCookie,
    });
    const memberText = normalizeHtmlText(await memberResponse.text());
    const memberReady =
      memberResponse.status === 200 &&
      memberText.includes("星力余额") &&
      memberText.includes("350") &&
      memberText.includes("深度报告额度") &&
      memberText.includes("手相额度") &&
      memberText.includes("2") &&
      memberText.includes("3");

    addRuntimeCheck(result, {
      id: "runtime-member-entitlements-visible",
      label: "会员中心权益到账",
      ready: memberReady,
      readyDetail: "会员中心能看到星力、深度报告额度和手相额度。",
      blockingDetail: `status=${memberResponse.status}, hasStars=${memberText.includes("350")}, hasReportQuota=${memberText.includes("深度报告额度")}, hasPalmQuota=${memberText.includes("手相额度")}`,
      readyAction: "保留会员中心权益展示。",
      blockingAction: "检查 member/page.tsx 的权益汇总展示。",
    });

    const deepPageResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/reports/deep`,
      timeoutMs: input.timeoutMs,
      cookie: updatedCookie,
    });
    const deepPageText = normalizeHtmlText(await deepPageResponse.text());
    const deepPageReady =
      deepPageResponse.status === 200 &&
      deepPageText.includes("会员报告额度") &&
      deepPageText.includes("剩余 2 份") &&
      deepPageText.includes("用会员额度生成");

    addRuntimeCheck(result, {
      id: "runtime-deep-page-quota-entry",
      label: "深度报告额度入口",
      ready: deepPageReady,
      readyDetail: "深度报告页能看到会员报告额度和消费按钮。",
      blockingDetail: `status=${deepPageResponse.status}, hasQuota=${deepPageText.includes("会员报告额度")}, hasButton=${deepPageText.includes("用会员额度生成")}`,
      readyAction: "保留深度报告额度入口。",
      blockingAction: "检查 /reports/deep 页面传入 initialReportQuota 和按钮渲染。",
    });

    const deepQuotaResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/api/reports/deep/member-quota`,
      method: "POST",
      timeoutMs: input.timeoutMs,
      cookie: updatedCookie,
      body: JSON.stringify({ productCode: "bazi_detail" }),
    });
    const deepQuotaJson = await readJson(deepQuotaResponse);
    const deepQuotaReady =
      deepQuotaResponse.status === 200 &&
      deepQuotaJson?.ok === true &&
      deepQuotaJson?.report?.status === "GENERATING" &&
      deepQuotaJson?.entitlement?.used === 1 &&
      deepQuotaJson?.entitlement?.remaining === 1;

    addRuntimeCheck(result, {
      id: "runtime-deep-quota-consumption",
      label: "消费深度报告额度",
      ready: deepQuotaReady,
      readyDetail: "深度报告额度可创建生成任务，并返回消费后余额。",
      blockingDetail: `status=${deepQuotaResponse.status}, report=${deepQuotaJson?.report?.status}, used=${deepQuotaJson?.entitlement?.used}, remaining=${deepQuotaJson?.entitlement?.remaining}`,
      readyAction: "保留会员额度生成接口。",
      blockingAction: "检查 /api/reports/deep/member-quota 的额度校验和报告创建。",
    });

    const tokenResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/api/storage/qiniu/upload-token`,
      method: "POST",
      timeoutMs: input.timeoutMs,
      cookie: updatedCookie,
      body: JSON.stringify({
        filename: "palm-test.jpg",
        contentType: "image/jpeg",
        sizeBytes: 1024,
      }),
    });
    const tokenJson = await readJson(tokenResponse);
    const imageResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/api/images/palm`,
      method: "POST",
      timeoutMs: input.timeoutMs,
      cookie: updatedCookie,
      body: JSON.stringify({
        key: tokenJson?.key ?? `mock/palm-test-${Date.now()}.jpg`,
        url: tokenJson?.publicUrl ?? "mock://palm-test.jpg",
        contentType: "image/jpeg",
        sizeBytes: 1024,
        originalName: "palm-test.jpg",
        provider: tokenJson?.mode ?? "mock",
      }),
    });
    const imageJson = await readJson(imageResponse);
    const imageId = imageJson?.image?.id;
    const imageReady =
      tokenResponse.status === 200 &&
      imageResponse.status === 200 &&
      imageJson?.ok === true &&
      typeof imageId === "string";

    addRuntimeCheck(result, {
      id: "runtime-create-palm-image",
      label: "创建手相图片档案",
      ready: imageReady,
      readyDetail: "已创建可用于手相分析的图片档案。",
      blockingDetail: `tokenStatus=${tokenResponse.status}, imageStatus=${imageResponse.status}, imageId=${imageId ?? "<none>"}`,
      readyAction: "继续消费手相额度。",
      blockingAction: "检查七牛 mock token 和图片档案接口。",
    });

    if (!imageReady) {
      return;
    }

    const palmResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/api/fortune/palm`,
      method: "POST",
      timeoutMs: input.timeoutMs,
      cookie: updatedCookie,
      body: JSON.stringify({
        imageId,
        focus: "会员权益验收",
      }),
    });
    const palmJson = await readJson(palmResponse);
    const palmReady =
      palmResponse.status === 200 &&
      palmJson?.ok === true &&
      palmJson?.paymentSource === "membership_quota" &&
      palmJson?.cost === 0 &&
      palmJson?.balanceAfter === 350 &&
      palmJson?.entitlement?.remainingAfter === 2;

    addRuntimeCheck(result, {
      id: "runtime-palm-quota-consumption",
      label: "消费手相额度",
      ready: palmReady,
      readyDetail: "手相分析优先使用会员手相额度，不扣星力。",
      blockingDetail: `status=${palmResponse.status}, source=${palmJson?.paymentSource}, cost=${palmJson?.cost}, balance=${palmJson?.balanceAfter}, remaining=${palmJson?.entitlement?.remainingAfter}`,
      readyAction: "保留手相额度优先抵扣。",
      blockingAction: "检查 /api/fortune/palm 的会员手相额度判断和返回。",
    });

    const palmPageResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/palm`,
      timeoutMs: input.timeoutMs,
      cookie: updatedCookie,
    });
    const palmPageText = normalizeHtmlText(await palmPageResponse.text());
    const palmPageReady =
      palmPageResponse.status === 200 &&
      palmPageText.includes("手相额度") &&
      palmPageText.includes("本次优先抵扣会员额度");

    addRuntimeCheck(result, {
      id: "runtime-palm-page-quota-visible",
      label: "手相页额度展示",
      ready: palmPageReady,
      readyDetail: "手相页能展示会员手相额度和优先抵扣提示。",
      blockingDetail: `status=${palmPageResponse.status}, hasQuota=${palmPageText.includes("手相额度")}, hasHint=${palmPageText.includes("本次优先抵扣会员额度")}`,
      readyAction: "保留手相页额度显示。",
      blockingAction: "检查 palm/page.tsx 和 PalmClient initialPalmQuota。",
    });

    const grantAdjustResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/api/admin/entitlements/adjust`,
      method: "POST",
      timeoutMs: input.timeoutMs,
      cookie: updatedCookie,
      body: JSON.stringify({
        userId,
        kind: "deep_report",
        amount: 1,
        reason: "会员权益验收补发 1 份深度报告额度",
      }),
    });
    const grantAdjustJson = await readJson(grantAdjustResponse);
    const grantAdjustReady =
      grantAdjustResponse.status === 200 &&
      grantAdjustJson?.ok === true &&
      grantAdjustJson?.transaction?.type === "ADJUST" &&
      grantAdjustJson?.transaction?.amount === 1 &&
      grantAdjustJson?.balance?.remaining === 2;

    addRuntimeCheck(result, {
      id: "runtime-admin-entitlement-grant-adjust",
      label: "后台补发报告额度",
      ready: grantAdjustReady,
      readyDetail: "后台接口可人工补发 1 份深度报告额度并写入权益流水。",
      blockingDetail: `status=${grantAdjustResponse.status}, type=${grantAdjustJson?.transaction?.type}, amount=${grantAdjustJson?.transaction?.amount}, remaining=${grantAdjustJson?.balance?.remaining}`,
      readyAction: "保留后台权益补发能力。",
      blockingAction: "检查 /api/admin/entitlements/adjust 的正数调整逻辑。",
    });

    const spendAdjustResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/api/admin/entitlements/adjust`,
      method: "POST",
      timeoutMs: input.timeoutMs,
      cookie: updatedCookie,
      body: JSON.stringify({
        userId,
        kind: "palm_reading",
        amount: -1,
        reason: "会员权益验收扣回 1 次手相额度",
      }),
    });
    const spendAdjustJson = await readJson(spendAdjustResponse);
    const spendAdjustReady =
      spendAdjustResponse.status === 200 &&
      spendAdjustJson?.ok === true &&
      spendAdjustJson?.transaction?.type === "ADJUST" &&
      spendAdjustJson?.transaction?.amount === -1 &&
      spendAdjustJson?.balance?.remaining === 1;

    addRuntimeCheck(result, {
      id: "runtime-admin-entitlement-spend-adjust",
      label: "后台扣回手相额度",
      ready: spendAdjustReady,
      readyDetail: "后台接口可人工扣回 1 次手相额度，且不会扣成负数。",
      blockingDetail: `status=${spendAdjustResponse.status}, type=${spendAdjustJson?.transaction?.type}, amount=${spendAdjustJson?.transaction?.amount}, remaining=${spendAdjustJson?.balance?.remaining}`,
      readyAction: "保留后台权益扣回能力。",
      blockingAction: "检查 /api/admin/entitlements/adjust 的负数调整和余额校验。",
    });

    const adminResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/admin`,
      timeoutMs: input.timeoutMs,
      cookie: updatedCookie,
    });
    const adminText = normalizeHtmlText(await adminResponse.text());
    const adminReady =
      adminResponse.status === 200 &&
      adminText.includes("会员权益账本") &&
      adminText.includes("额度余额与发放流水") &&
      adminText.includes("深度报告额度") &&
      adminText.includes("手相额度") &&
      adminText.includes("发放") &&
      adminText.includes("消费") &&
      adminText.includes("调整") &&
      adminText.includes("权益调整") &&
      adminText.includes("幂等键");

    addRuntimeCheck(result, {
      id: "runtime-admin-entitlement-ledger",
      label: "后台权益账本可观测",
      ready: adminReady,
      readyDetail: "后台能看到会员权益账户、余额、发放/消费/调整流水和操作审计。",
      blockingDetail: `status=${adminResponse.status}, hasLedger=${adminText.includes("会员权益账本")}, hasReportQuota=${adminText.includes("深度报告额度")}, hasPalmQuota=${adminText.includes("手相额度")}, hasGrant=${adminText.includes("发放")}, hasSpend=${adminText.includes("消费")}, hasAdjust=${adminText.includes("调整")}, hasAudit=${adminText.includes("权益调整")}`,
      readyAction: "保留 /admin 的权益账本运营视图。",
      blockingAction: "检查 /admin 是否读取 getAdminEntitlementAccounts/getAdminEntitlementTransactions 并展示流水。",
    });

    const refundOrderResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/api/payments/mock/orders`,
      method: "POST",
      timeoutMs: input.timeoutMs,
      cookie: updatedCookie,
      body: JSON.stringify({ productCode: "monthly" }),
    });
    const refundOrderJson = await readJson(refundOrderResponse);
    const refundOrderId = refundOrderJson?.order?.id;
    const refundOrderReady =
      refundOrderResponse.status === 200 &&
      refundOrderJson?.ok === true &&
      typeof refundOrderId === "string";

    addRuntimeCheck(result, {
      id: "runtime-create-refund-test-order",
      label: "创建退款验收订单",
      ready: refundOrderReady,
      readyDetail: "已创建用于退款验收的第二笔月度会员订单。",
      blockingDetail: `status=${refundOrderResponse.status}, orderId=${refundOrderId ?? "<none>"}`,
      readyAction: "继续支付并退款该订单。",
      blockingAction: "检查 mock 订单创建接口是否仍可创建会员订单。",
    });

    if (!refundOrderReady) {
      return;
    }

    const refundPayResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/api/payments/mock/orders/${refundOrderId}/pay`,
      method: "POST",
      timeoutMs: input.timeoutMs,
      cookie: updatedCookie,
    });
    const refundPayJson = await readJson(refundPayResponse);
    const refundCookie = getCookieHeader(refundPayResponse) || updatedCookie;
    const refundPayReady =
      refundPayResponse.status === 200 &&
      refundPayJson?.ok === true &&
      refundPayJson?.transaction?.amount === 350 &&
      refundPayJson?.transaction?.balanceAfter === 700;

    addRuntimeCheck(result, {
      id: "runtime-pay-refund-test-order",
      label: "支付退款验收订单",
      ready: refundPayReady,
      readyDetail: "第二笔月度会员订单支付后再次发放 350 星力。",
      blockingDetail: `status=${refundPayResponse.status}, amount=${refundPayJson?.transaction?.amount}, balance=${refundPayJson?.transaction?.balanceAfter}`,
      readyAction: "继续调用后台退款接口。",
      blockingAction: "检查 mock 支付是否能对第二笔会员订单继续发放星力和权益。",
    });

    if (!refundPayReady) {
      return;
    }

    const refundResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/api/admin/orders/${refundOrderId}/refund`,
      method: "POST",
      timeoutMs: input.timeoutMs,
      cookie: refundCookie,
      body: JSON.stringify({
        reason: "会员权益验收后台订单退款",
      }),
    });
    const refundJson = await readJson(refundResponse);
    const refundReady =
      refundResponse.status === 200 &&
      refundJson?.ok === true &&
      refundJson?.order?.status === "REFUNDED" &&
      refundJson?.transaction?.type === "REFUND" &&
      refundJson?.transaction?.amount === -350 &&
      refundJson?.balanceAfter === 350 &&
      Array.isArray(refundJson?.entitlementTransactions) &&
      refundJson.entitlementTransactions.length === 2;

    addRuntimeCheck(result, {
      id: "runtime-admin-order-refund",
      label: "后台订单退款",
      ready: refundReady,
      readyDetail: "后台退款接口会标记 REFUNDED、写入钱包退款流水，并扣回会员报告/手相额度。",
      blockingDetail: `status=${refundResponse.status}, ok=${refundJson?.ok}, orderStatus=${refundJson?.order?.status}, transactionType=${refundJson?.transaction?.type}, amount=${refundJson?.transaction?.amount}, balance=${refundJson?.balanceAfter}, entitlementTx=${refundJson?.entitlementTransactions?.length}`,
      readyAction: "保留后台退款接口和服务层回滚逻辑。",
      blockingAction: "检查 /api/admin/orders/[orderId]/refund、refundPaidOrder 和 revokeMembershipEntitlementsForOrder。",
    });

    const repeatRefundResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/api/admin/orders/${refundOrderId}/refund`,
      method: "POST",
      timeoutMs: input.timeoutMs,
      cookie: refundCookie,
      body: JSON.stringify({
        reason: "会员权益验收重复退款幂等",
      }),
    });
    const repeatRefundJson = await readJson(repeatRefundResponse);
    const repeatRefundReady =
      repeatRefundResponse.status === 200 &&
      repeatRefundJson?.ok === true &&
      repeatRefundJson?.order?.status === "REFUNDED" &&
      repeatRefundJson?.alreadyRefunded === true;

    addRuntimeCheck(result, {
      id: "runtime-admin-order-refund-idempotent",
      label: "后台重复退款幂等",
      ready: repeatRefundReady,
      readyDetail: "重复调用退款接口不会再次扣回星力或会员额度。",
      blockingDetail: `status=${repeatRefundResponse.status}, ok=${repeatRefundJson?.ok}, orderStatus=${repeatRefundJson?.order?.status}, alreadyRefunded=${repeatRefundJson?.alreadyRefunded}`,
      readyAction: "保留退款接口的 REFUNDED 状态幂等处理。",
      blockingAction: "检查 refundPaidOrder 对已退款订单的返回逻辑。",
    });

    const refundAdminResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/admin`,
      timeoutMs: input.timeoutMs,
      cookie: refundCookie,
    });
    const refundAdminText = normalizeHtmlText(await refundAdminResponse.text());
    const refundAdminReady =
      refundAdminResponse.status === 200 &&
      refundAdminText.includes("REFUNDED") &&
      refundAdminText.includes("订单退款") &&
      refundAdminText.includes("订单退款扣回") &&
      refundAdminText.includes("membership_order_refund");

    addRuntimeCheck(result, {
      id: "runtime-admin-order-refund-observable",
      label: "后台退款可观测",
      ready: refundAdminReady,
      readyDetail: "后台能看到已退款订单、钱包退款流水、权益扣回流水和订单退款审计。",
      blockingDetail: `status=${refundAdminResponse.status}, hasRefunded=${refundAdminText.includes("REFUNDED")}, hasAudit=${refundAdminText.includes("订单退款")}, hasWallet=${refundAdminText.includes("订单退款扣回")}, hasEntitlement=${refundAdminText.includes("membership_order_refund")}`,
      readyAction: "保留 /admin 的订单退款运营视图。",
      blockingAction: "检查 /admin 是否展示退款订单、钱包流水、权益流水和 order_refund 审计。",
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
  console.log(`会员权益闭环验收：${result.ok ? "通过" : "未通过"}`);
  console.log(
    `模式：${result.mode}，ready=${result.summary.ready} blocking=${result.summary.blocking} total=${result.summary.total}`,
  );

  for (const check of result.checks) {
    const marker = check.status === statuses.ready ? "✓" : "×";
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
