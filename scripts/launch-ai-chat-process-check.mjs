#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const statuses = {
  ready: "ready",
  blocking: "blocking",
};

const defaultTimeoutMs = 45000;

const requiredFiles = [
  "src/lib/ai-cost.ts",
  "src/lib/ai-orchestrator.ts",
  "src/app/chat/page.tsx",
  "src/app/chat/chat-client.tsx",
  "src/app/chat/markdown-message.tsx",
  "src/app/api/chat/route.ts",
  "src/lib/ai-session-store.ts",
  "src/app/api/storage/qiniu/upload-token/route.ts",
  "src/app/api/images/palm/route.ts",
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
    action: exists ? "保留该文件。" : "恢复 AI 对话过程体验所需文件。",
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

  const aiCostContent = [
    readProjectFile(root, "src/lib/ai-cost.ts"),
    readProjectFile(root, "src/lib/ai-orchestrator.ts"),
    readProjectFile(root, "src/lib/deep-report.ts"),
    readProjectFile(root, "src/lib/palm.ts"),
    readProjectFile(root, "src/app/api/chat/route.ts"),
    readProjectFile(root, "src/app/api/fortune/palm/route.ts"),
    readProjectFile(root, ".env.example"),
    readProjectFile(root, ".env.production.example"),
  ].join("\n");

  checkContainsAll(result, {
    id: "ai-cost-estimate-usage-log",
    group: "AI 成本",
    label: "OpenAI 成本估算留痕",
    content: aiCostContent,
    tokens: [
      "estimateOpenAiCostCents",
      "buildAiCostMetadata",
      "OPENAI_DEFAULT_INPUT_CENTS_PER_1M_TOKENS",
      "OPENAI_DEFAULT_OUTPUT_CENTS_PER_1M_TOKENS",
      "startup_estimate_v1",
      "costCents: costEstimate?.costCents",
      "costCents: result.costCents",
      "feature: \"chat_basic\"",
      "feature: \"palm_reading\"",
      "costSource",
    ],
    readyDetail: "OpenAI 对话、深度报告和手相视觉会把估算 costCents 写入 UsageLog，并支持生产费率环境变量覆盖。",
    readyAction: "保留统一成本估算器，用账单费率替换默认估算后复盘毛利。",
    blockingAction: "补齐 ai-cost 估算器、OpenAI 成功调用 costCents 写入和环境变量模板。",
  });

  checkContainsAll(result, {
    id: "chat-client-progressive-process",
    group: "聊天体验",
    label: "等待态分阶段过程",
    content: readProjectFile(root, "src/app/chat/chat-client.tsx"),
    tokens: [
      "loadingStages",
      "activeStageIndex",
      "data-process-status",
      "aria-live",
      "识别问题类型",
      "读取会员档案",
      "调用命理工具",
      "生成专属回复",
    ],
    readyDetail: "聊天页在等待 AI 返回时会展示分阶段过程和当前执行状态。",
    readyAction: "保留分阶段等待态，减少用户干等感。",
    blockingAction: "恢复 ChatClient 的 loadingStages、activeStageIndex 和过程卡状态。",
  });

  checkContainsAll(result, {
    id: "chat-client-streaming-output",
    group: "聊天体验",
    label: "回答增量流式输出",
    content: [
      readProjectFile(root, "src/app/chat/chat-client.tsx"),
      readProjectFile(root, "src/app/chat/markdown-message.tsx"),
      readProjectFile(root, "src/app/api/chat/route.ts"),
      readProjectFile(root, "src/lib/ai-orchestrator.ts"),
    ].join("\n"),
    tokens: [
      "stream: true",
      "response.output_text.delta",
      "application/x-ndjson",
      "response.body.getReader()",
      "scheduleStreamedAnswerFlush",
      "window.requestAnimationFrame",
      "ReactMarkdown",
      "remarkGfm",
      "MarkdownMessage",
      'type: "delta"',
      'type: "complete"',
    ],
    readyDetail: "Chat 会读取 Responses API 增量事件，并按动画帧合并渲染回答。",
    readyAction: "保留 NDJSON 协议和动画帧批量更新，避免退化为整段 JSON 返回。",
    blockingAction: "恢复 Responses API stream、NDJSON Route Handler 和客户端 ReadableStream 解析。",
  });

  checkContainsAll(result, {
    id: "chat-client-mature-interactions",
    group: "聊天体验",
    label: "停止生成与智能滚动",
    content: readProjectFile(root, "src/app/chat/chat-client.tsx"),
    tokens: [
      "abortControllerRef",
      "stopGenerating",
      "停止生成",
      "shouldAutoScrollRef",
      "handleConversationScroll",
      "滚动到最新回答",
    ],
    readyDetail: "Chat 支持停止生成，并在用户上滑阅读时暂停自动跟随。",
    readyAction: "保留 AbortController、近底部判断和返回最新回答按钮。",
    blockingAction: "恢复停止生成和智能滚动，避免长回答强制抢夺用户滚动位置。",
  });

  checkContainsAll(result, {
    id: "chat-client-tool-evidence",
    group: "聊天体验",
    label: "工具调用证据卡",
    content: readProjectFile(root, "src/app/chat/chat-client.tsx"),
    tokens: [
      "toolSummary",
      "toolStatusLabel",
      "查看原始结果",
      "tarot_spread_generator",
      "bazi_calculator",
      "birth_info_checker",
      "bagua_generator",
      "palm_image_checker",
    ],
    readyDetail: "聊天结果会展示工具状态、概要和可展开的原始结果。",
    readyAction: "保留工具证据卡，强化用户对 AI 调用工具的信任。",
    blockingAction: "恢复工具结果卡、状态标签、概要和原始 JSON 展开区。",
  });

  checkContainsAll(result, {
    id: "chat-client-palm-attachment",
    group: "聊天体验",
    label: "对话手相图片附件",
    content: readProjectFile(root, "src/app/chat/chat-client.tsx"),
    tokens: [
      "uploadPalmAttachment",
      "deletePalmAttachment",
      "/api/storage/qiniu/upload-token",
      "/api/images/palm",
      "palmImageId",
      "图片上传授权",
      "手相图片",
      "上传附图",
    ],
    readyDetail: "聊天页支持选择、授权、上传、附加和移除手相图片。",
    readyAction: "保留对话入口里的图片附件体验。",
    blockingAction: "恢复 ChatClient 的手相图片上传、授权、删除和 palmImageId 提交。",
  });

  checkContainsAll(result, {
    id: "chat-client-recent-history",
    group: "聊天体验",
    label: "聊天页最近对话",
    content: readProjectFile(root, "src/app/chat/chat-client.tsx"),
    tokens: [
      "initialRecentChats",
      "recentChats",
      "createRecentChatFromResult",
      "最近对话",
      "会员记忆沉淀",
      "getIntentLabel",
      "个工具",
    ],
    readyDetail: "聊天页会展示最近 AI 对话，并在发送成功后即时更新列表。",
    readyAction: "保留聊天页最近对话列表，强化会员记忆资产。",
    blockingAction: "恢复 ChatClient 的 initialRecentChats、recentChats 和发送后插入逻辑。",
  });

  checkContainsAll(result, {
    id: "ai-orchestrator-tool-chain",
    group: "AI 编排",
    label: "命理工具链",
    content: readProjectFile(root, "src/lib/ai-orchestrator.ts"),
    tokens: [
      "type ChatIntent",
      "detectIntent",
      "intent_classifier",
      "profile_reader",
      "tarot_spread_generator",
      "bazi_calculator",
      "birth_info_checker",
      "bagua_generator",
      "palm_image_checker",
      "generateWithOpenAI",
    ],
    readyDetail: "AI 编排层包含意图识别、会员档案和塔罗/八字/八卦/手相工具。",
    readyAction: "保留后端工具链，前端等待态以该链路为准。",
    blockingAction: "恢复 runAiChat 的意图识别、本地工具和 OpenAI 包装逻辑。",
  });

  checkContainsAll(result, {
    id: "ai-orchestrator-palm-attachment",
    group: "AI 编排",
    label: "附图触发手相预检",
    content: readProjectFile(root, "src/lib/ai-orchestrator.ts"),
    tokens: [
      "AiChatPalmImage",
      "detectIntent(question: string, palmImage",
      "if (palmImage)",
      "status: \"completed\"",
      "imageId: input.palmImage.id",
      "正式手相报告会继续使用会员手相额度",
      "palmImageId: input.palmImage?.id",
    ],
    readyDetail: "AI 编排层会把附图对话识别为手相，并只做图片预检和付费链路引导。",
    readyAction: "保留附图手相预检，避免普通对话绕过手相报告权益。",
    blockingAction: "恢复 AiChatPalmImage、附图 intent 和 palm_image_checker completed 结果。",
  });

  checkContainsAll(result, {
    id: "ai-orchestrator-recent-memory",
    group: "AI 编排",
    label: "近期对话记忆入模",
    content: readProjectFile(root, "src/lib/ai-orchestrator.ts"),
    tokens: [
      "getRecentChatSessions",
      "type RecentChatSession",
      "buildRecentChatMemory",
      "recentChats",
      "recentChatCount",
      "recentChatMemory",
      "recentChatCount: recentChats.length",
    ],
    readyDetail: "AI 编排层会读取最近对话，并把会员记忆写入 profile_reader 和模型上下文。",
    readyAction: "保留近期对话记忆入模，确保会员资产不只停留在页面展示。",
    blockingAction: "恢复 runAiChat 对 getRecentChatSessions、recentChatMemory 和 profile_reader.recentChatCount 的使用。",
  });

  checkContainsAll(result, {
    id: "chat-api-cost-session",
    group: "AI 编排",
    label: "星力消耗与会话记录",
    content: readProjectFile(root, "src/app/api/chat/route.ts"),
    tokens: [
      "checkEntitlement",
      "prepareAiChat",
      "runPreparedAiChatStream",
      "spendStars",
      "saveChatTurn",
      "createSession",
      "ReadableStream",
      "application/x-ndjson",
      "balanceAfter",
      "chatSessionId",
      "getPalmImageUpload",
      "palmImageId",
      "手相图片不存在或不可用",
    ],
    readyDetail: "AI 对话接口会校验星力和图片归属、运行工具链、扣费、保存会话并刷新余额。",
    readyAction: "保留 /api/chat 的付费闭环。",
    blockingAction: "恢复 /api/chat 的权益校验、图片归属校验、扣费、保存和余额返回。",
  });

  checkContainsAll(result, {
    id: "ai-session-history-store",
    group: "AI 编排",
    label: "AI 会话历史读取",
    content: readProjectFile(root, "src/lib/ai-session-store.ts"),
    tokens: [
      "export type RecentChatSession",
      "getRecentChatSessions",
      "normalizeRecentChatSession",
      "toolNames",
      "SessionMode.CHAT",
      "messages",
      "orderBy",
      "updatedAt",
    ],
    readyDetail: "AI 会话存储层支持读取最近对话摘要、工具名、模型和 token 信息。",
    readyAction: "保留 getRecentChatSessions 作为会员历史资产入口。",
    blockingAction: "恢复 AI 会话历史读取和内存兜底列表逻辑。",
  });

  checkContainsAll(result, {
    id: "member-page-chat-history",
    group: "聊天体验",
    label: "会员中心最近 AI 对话",
    content: readProjectFile(root, "src/app/member/page.tsx"),
    tokens: [
      "getRecentChatSessions",
      "recentChats",
      "会员记忆沉淀",
      "最近 AI 对话",
      "getChatIntentLabel",
      "formatChatTime",
      "个工具",
    ],
    readyDetail: "会员中心会展示最近 AI 对话摘要，让历史记录成为会员资产。",
    readyAction: "保留会员中心最近 AI 对话模块。",
    blockingAction: "恢复 /member 的 recentChats 获取和会员记忆沉淀展示。",
  });

  checkContainsAll(result, {
    id: "package-command",
    group: "脚本命令",
    label: "launch:ai-chat-process-check",
    content: readProjectFile(root, "package.json"),
    tokens: [
      "\"launch:ai-chat-process-check\"",
      "scripts/launch-ai-chat-process-check.mjs",
    ],
    readyDetail: "package.json 已注册 AI 对话过程验收脚本。",
    readyAction: "可通过 npm run launch:ai-chat-process-check 运行。",
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
        accept: input.accept ?? "application/json",
        "content-type": input.contentType ?? "application/json",
        cookie: input.cookie ?? "",
        "user-agent": "xuanji-launch-ai-chat-process-check/1.0",
      },
      body: input.body,
    });
  } finally {
    clearTimeout(timeout);
  }
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

async function readJson(response) {
  return await response.json().catch(() => null);
}

async function readChatResponse(response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/x-ndjson")) {
    return {
      json: await readJson(response),
      stream: null,
    };
  }

  const events = (await response.text())
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const completed = events.findLast((event) => event?.type === "complete");
  const failed = events.findLast((event) => event?.type === "error");

  return {
    json:
      completed?.data ??
      (failed
        ? {
            ok: false,
            message: failed.message,
            balance: failed.balanceAfter,
          }
        : null),
    stream: {
      contentType,
      started: events.some((event) => event?.type === "start"),
      deltaCount: events.filter((event) => event?.type === "delta").length,
      replaceCount: events.filter((event) => event?.type === "replace").length,
      completed: Boolean(completed),
    },
  };
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

function normalizeHtmlText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasTool(data, toolName, status) {
  const tools = Array.isArray(data?.toolCalls) ? data.toolCalls : [];

  return tools.some(
    (tool) =>
      tool &&
      typeof tool === "object" &&
      tool.name === toolName &&
      (!status || tool.status === status),
  );
}

function findTool(data, toolName) {
  const tools = Array.isArray(data?.toolCalls) ? data.toolCalls : [];

  return tools.find(
    (tool) =>
      tool &&
      typeof tool === "object" &&
      tool.name === toolName,
  );
}

function hasStep(data, label) {
  const steps = Array.isArray(data?.steps) ? data.steps : [];

  return steps.some((step) => step && typeof step === "object" && step.label === label);
}

async function postChat(input, question, cookie, extraBody = {}) {
  const response = await fetchWithTimeout({
    url: `${input.baseUrl}/api/chat`,
    method: "POST",
    timeoutMs: input.timeoutMs,
    cookie,
    body: JSON.stringify({ question, ...extraBody }),
  });

  const payload = await readChatResponse(response);

  return {
    response,
    ...payload,
    cookie: getCookieHeader(response) || cookie,
  };
}

async function createPalmImage(input, cookie) {
  const tokenResponse = await fetchWithTimeout({
    url: `${input.baseUrl}/api/storage/qiniu/upload-token`,
    method: "POST",
    timeoutMs: input.timeoutMs,
    cookie,
    body: JSON.stringify({
      filename: "chat-palm-test.jpg",
      contentType: "image/jpeg",
      sizeBytes: 2048,
    }),
  });
  const tokenJson = await readJson(tokenResponse);
  const imageResponse = await fetchWithTimeout({
    url: `${input.baseUrl}/api/images/palm`,
    method: "POST",
    timeoutMs: input.timeoutMs,
    cookie,
    body: JSON.stringify({
      key: tokenJson?.key ?? `mock/chat-palm-test-${Date.now()}.jpg`,
      url: tokenJson?.publicUrl ?? "mock://chat-palm-test.jpg",
      contentType: "image/jpeg",
      sizeBytes: 2048,
      originalName: "chat-palm-test.jpg",
      provider: tokenJson?.mode ?? "mock",
    }),
  });

  return {
    tokenResponse,
    tokenJson,
    imageResponse,
    imageJson: await readJson(imageResponse),
  };
}

async function runRuntimeChecks(result, input) {
  try {
    const email = `ai-chat-process-${Date.now()}@example.com`;
    const loginResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/api/auth/email/verify`,
      method: "POST",
      timeoutMs: input.timeoutMs,
      body: JSON.stringify({ email, code: "000000", returnTo: "/chat" }),
    });
    const loginJson = await readJson(loginResponse);
    const loginCookie = getCookieHeader(loginResponse);
    const loginReady =
      loginResponse.status === 200 && loginJson?.ok === true && loginCookie.includes("xuanji_session=");

    addRuntimeCheck(result, {
      id: "runtime-login",
      label: "开发验证码登录",
      ready: loginReady,
      readyDetail: "已登录并拿到会话 cookie。",
      blockingDetail: `status=${loginResponse.status}, ok=${loginJson?.ok}, cookie=${Boolean(loginCookie)}`,
      readyAction: "继续运行购买和 AI 对话验收。",
      blockingAction: "确认 dev 环境允许 000000 验证码登录。",
    });

    if (!loginReady) {
      return;
    }

    const createOrderResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/api/payments/mock/orders`,
      method: "POST",
      timeoutMs: input.timeoutMs,
      cookie: loginCookie,
      body: JSON.stringify({ productCode: "monthly" }),
    });
    const createOrderJson = await readJson(createOrderResponse);
    const orderId = createOrderJson?.order?.id;
    const createOrderReady =
      createOrderResponse.status === 200 &&
      createOrderJson?.ok === true &&
      typeof orderId === "string";

    addRuntimeCheck(result, {
      id: "runtime-create-membership-order",
      label: "创建会员订单",
      ready: createOrderReady,
      readyDetail: "已创建月度会员 mock 订单，用于获得对话星力。",
      blockingDetail: `status=${createOrderResponse.status}, orderId=${orderId ?? "<none>"}`,
      readyAction: "继续模拟支付。",
      blockingAction: "检查 /api/payments/mock/orders 和 monthly 商品。",
    });

    if (!createOrderReady) {
      return;
    }

    const payResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/api/payments/mock/orders/${orderId}/pay`,
      method: "POST",
      timeoutMs: input.timeoutMs,
      cookie: loginCookie,
    });
    const payJson = await readJson(payResponse);
    let cookie = getCookieHeader(payResponse) || loginCookie;
    const payReady =
      payResponse.status === 200 &&
      payJson?.ok === true &&
      payJson?.transaction?.amount === 350 &&
      payJson?.transaction?.balanceAfter === 350;

    addRuntimeCheck(result, {
      id: "runtime-pay-membership-order",
      label: "支付后发放星力",
      ready: payReady,
      readyDetail: "月度会员支付后发放 350 星力，可用于 AI 对话。",
      blockingDetail: `status=${payResponse.status}, amount=${payJson?.transaction?.amount}, balance=${payJson?.transaction?.balanceAfter}`,
      readyAction: "继续调用 /api/chat。",
      blockingAction: "检查 mock 支付成功后的星力发放和会话刷新。",
    });

    if (!payReady) {
      return;
    }

    const tarot = await postChat(
      input,
      "我想问和前任还有机会复合吗？用塔罗三牌阵看看。",
      cookie,
    );
    cookie = tarot.cookie;
    const tarotReady =
      tarot.response.status === 200 &&
      tarot.json?.ok === true &&
      tarot.json?.intent === "tarot" &&
      tarot.json?.cost === 1 &&
      typeof tarot.json?.costCents === "number" &&
      tarot.json?.balanceAfter === 349 &&
      hasStep(tarot.json, "调用命理工具") &&
      hasTool(tarot.json, "intent_classifier", "completed") &&
      hasTool(tarot.json, "profile_reader") &&
      hasTool(tarot.json, "tarot_spread_generator", "completed");

    addRuntimeCheck(result, {
      id: "runtime-chat-tarot",
      label: "塔罗对话工具链",
      ready: tarotReady,
      readyDetail: "塔罗问题会识别 intent、读取档案、抽牌并扣 1 星力。",
      blockingDetail: `status=${tarot.response.status}, intent=${tarot.json?.intent}, balance=${tarot.json?.balanceAfter}, costCents=${tarot.json?.costCents}, hasTarot=${hasTool(tarot.json, "tarot_spread_generator")}`,
      readyAction: "保留塔罗工具链和前端过程展示。",
      blockingAction: "检查 detectIntent、tarot_spread_generator 和 /api/chat 扣费返回。",
    });

    const tarotStreamReady =
      tarot.response.status === 200 &&
      tarot.stream?.started === true &&
      tarot.stream?.completed === true &&
      (tarot.stream?.deltaCount > 0 || tarot.stream?.replaceCount > 0);

    addRuntimeCheck(result, {
      id: "runtime-chat-streaming-output",
      label: "Chat 回答流式传输",
      ready: tarotStreamReady,
      readyDetail: `Chat 返回 NDJSON 事件流，共 ${tarot.stream?.deltaCount ?? 0} 个增量片段。`,
      blockingDetail: `contentType=${tarot.stream?.contentType ?? "<none>"}, started=${tarot.stream?.started}, deltas=${tarot.stream?.deltaCount}, replaces=${tarot.stream?.replaceCount}, completed=${tarot.stream?.completed}`,
      readyAction: "保留 start/delta/complete 事件协议和客户端增量渲染。",
      blockingAction: "检查 /api/chat 是否返回 application/x-ndjson，以及模型流是否产生 delta 或本地 replace 事件。",
    });

    const bazi = await postChat(input, "帮我看八字五行事业方向。", cookie);
    cookie = bazi.cookie;
    const baziReady =
      bazi.response.status === 200 &&
      bazi.json?.ok === true &&
      bazi.json?.intent === "bazi" &&
      bazi.json?.balanceAfter === 348 &&
      hasTool(bazi.json, "bazi_calculator") === false &&
      hasTool(bazi.json, "birth_info_checker", "needs_input") &&
      String(bazi.json?.answer ?? "").includes("出生");

    addRuntimeCheck(result, {
      id: "runtime-chat-bazi-needs-input",
      label: "八字缺资料追问",
      ready: baziReady,
      readyDetail: "八字问题缺出生信息时会进入补资料追问，不会编造排盘。",
      blockingDetail: `status=${bazi.response.status}, intent=${bazi.json?.intent}, balance=${bazi.json?.balanceAfter}, hasBirthCheck=${hasTool(bazi.json, "birth_info_checker")}`,
      readyAction: "保留 birth_info_checker 和缺资料追问。",
      blockingAction: "检查八字工具链在缺出生日期/时间/地点时是否返回 needs_input。",
    });

    const baziProfileReader = findTool(bazi.json, "profile_reader");
    const baziProfileResult = baziProfileReader?.result;
    const baziProfileText = JSON.stringify(baziProfileResult ?? {});
    const baziRecentMemoryReady =
      bazi.response.status === 200 &&
      bazi.json?.ok === true &&
      typeof baziProfileResult === "object" &&
      baziProfileResult !== null &&
      baziProfileResult.recentChatCount >= 1 &&
      baziProfileText.includes("我想问和前任还有机会复合吗") &&
      baziProfileText.includes("tarot_spread_generator");

    addRuntimeCheck(result, {
      id: "runtime-chat-recent-memory-used",
      label: "AI 读取近期对话记忆",
      ready: baziRecentMemoryReady,
      readyDetail: "第二轮对话的 profile_reader 已读取上一轮塔罗问题和工具记录。",
      blockingDetail: `status=${bazi.response.status}, count=${baziProfileResult?.recentChatCount}, hasPreviousQuestion=${baziProfileText.includes("我想问和前任还有机会复合吗")}`,
      readyAction: "保留 runAiChat 的近期对话读取，形成可复用会员记忆。",
      blockingAction: "检查 runAiChat 是否在调用工具前读取 getRecentChatSessions，并写入 profile_reader.result。",
    });

    const bagua = await postChat(
      input,
      "我是否应该接下这个新项目？请起卦问事。",
      cookie,
    );
    cookie = bagua.cookie;
    const baguaReady =
      bagua.response.status === 200 &&
      bagua.json?.ok === true &&
      bagua.json?.intent === "bagua" &&
      bagua.json?.balanceAfter === 347 &&
      hasStep(bagua.json, "生成专属回复") &&
      hasTool(bagua.json, "bagua_generator", "completed");

    addRuntimeCheck(result, {
      id: "runtime-chat-bagua",
      label: "八卦问事工具链",
      ready: baguaReady,
      readyDetail: "八卦问事会生成本卦、动爻和变卦，并返回专属回复。",
      blockingDetail: `status=${bagua.response.status}, intent=${bagua.json?.intent}, balance=${bagua.json?.balanceAfter}, hasBagua=${hasTool(bagua.json, "bagua_generator")}`,
      readyAction: "保留八卦工具链和过程步骤。",
      blockingAction: "检查 bagua_generator 和对应 intent 判断。",
    });

    const palmImage = await createPalmImage(input, cookie);
    const palmImageId = palmImage.imageJson?.image?.id;
    const imageReady =
      palmImage.tokenResponse.status === 200 &&
      palmImage.imageResponse.status === 200 &&
      palmImage.imageJson?.ok === true &&
      typeof palmImageId === "string";

    addRuntimeCheck(result, {
      id: "runtime-chat-create-palm-image",
      label: "创建聊天手相附图",
      ready: imageReady,
      readyDetail: "已通过现有七牛/mock 链路创建聊天可用的手相图片档案。",
      blockingDetail: `tokenStatus=${palmImage.tokenResponse.status}, imageStatus=${palmImage.imageResponse.status}, imageId=${palmImageId ?? "<none>"}`,
      readyAction: "继续携带 palmImageId 调用 /api/chat。",
      blockingAction: "检查上传凭证和图片档案接口。",
    });

    if (!imageReady) {
      return;
    }

    const palm = await postChat(
      input,
      "我上传了手掌照片，先帮我看看适合做手相分析吗？",
      cookie,
      { palmImageId },
    );
    const palmReady =
      palm.response.status === 200 &&
      palm.json?.ok === true &&
      palm.json?.intent === "palm" &&
      palm.json?.balanceAfter === 346 &&
      hasTool(palm.json, "palm_image_checker", "completed") &&
      String(palm.json?.answer ?? "").includes("会员手相额度") &&
      String(palm.json?.answer ?? "").includes("/palm");

    addRuntimeCheck(result, {
      id: "runtime-chat-palm-attachment",
      label: "手相附图对话预检",
      ready: palmReady,
      readyDetail: "聊天携带 palmImageId 会进入手相预检工具链，只扣普通对话星力并引导到正式手相报告。",
      blockingDetail: `status=${palm.response.status}, intent=${palm.json?.intent}, balance=${palm.json?.balanceAfter}, hasPalmTool=${hasTool(palm.json, "palm_image_checker")}`,
      readyAction: "保留聊天图片附件和手相付费链路边界。",
      blockingAction: "检查 /api/chat 图片归属校验、runAiChat palmImage 入参和 palm_image_checker 返回。",
    });

    const chatPageResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/chat`,
      timeoutMs: input.timeoutMs,
      cookie,
    });
    const chatPageText = normalizeHtmlText(await chatPageResponse.text());
    const chatHistoryReady =
      chatPageResponse.status === 200 &&
      chatPageText.includes("最近对话") &&
      chatPageText.includes("会员记忆沉淀") &&
      chatPageText.includes("我上传了手掌照片") &&
      chatPageText.includes("个工具");

    addRuntimeCheck(result, {
      id: "runtime-chat-history-visible",
      label: "聊天页最近对话可见",
      ready: chatHistoryReady,
      readyDetail: "聊天页能看到刚完成的 AI 对话历史和工具数量。",
      blockingDetail: `status=${chatPageResponse.status}, hasRecent=${chatPageText.includes("最近对话")}, hasMemory=${chatPageText.includes("会员记忆沉淀")}, hasQuestion=${chatPageText.includes("我上传了手掌照片")}`,
      readyAction: "保留 /chat 的最近对话展示。",
      blockingAction: "检查 ChatPage 是否传入 initialRecentChats，ChatClient 是否渲染最近对话。",
    });

    const memberPageResponse = await fetchWithTimeout({
      url: `${input.baseUrl}/member`,
      timeoutMs: input.timeoutMs,
      cookie,
    });
    const memberPageText = normalizeHtmlText(await memberPageResponse.text());
    const memberHistoryReady =
      memberPageResponse.status === 200 &&
      memberPageText.includes("会员记忆沉淀") &&
      memberPageText.includes("最近 AI 对话") &&
      memberPageText.includes("我上传了手掌照片") &&
      memberPageText.includes("个工具");

    addRuntimeCheck(result, {
      id: "runtime-member-chat-history-visible",
      label: "会员中心最近 AI 对话可见",
      ready: memberHistoryReady,
      readyDetail: "会员中心能看到刚完成的 AI 对话摘要，形成可见会员资产。",
      blockingDetail: `status=${memberPageResponse.status}, hasMemory=${memberPageText.includes("会员记忆沉淀")}, hasRecent=${memberPageText.includes("最近 AI 对话")}, hasQuestion=${memberPageText.includes("我上传了手掌照片")}`,
      readyAction: "保留 /member 的 AI 对话历史模块。",
      blockingAction: "检查 MemberPage 是否读取 getRecentChatSessions 并渲染会员记忆沉淀。",
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
  console.log(`AI 对话过程验收：${result.ok ? "通过" : "未通过"}`);
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
  const result = createResult(input);
  const root = process.cwd();

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
