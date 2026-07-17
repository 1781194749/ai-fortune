#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import process from "node:process";

const statuses = {
  ready: "ready",
  blocking: "blocking",
};

const defaultTimeoutMs = 45000;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const requiredFiles = [
  "src/lib/ai-cost.ts",
  "src/lib/ai-orchestrator.ts",
  "src/app/chat/page.tsx",
  "src/app/chat/chat-client.tsx",
  "src/app/chat/chat-service-selector.tsx",
  "src/app/chat/chat-ritual.tsx",
  "src/app/chat/markdown-message.tsx",
  "src/app/api/chat/route.ts",
  "src/app/api/chat/sessions/[sessionId]/route.ts",
  "src/lib/chat-ui-message.ts",
  "src/lib/chat-service.ts",
  "src/lib/chat-turn-service.ts",
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

function checkExcludesAll(result, input) {
  const present = input.tokens.filter((token) => input.content?.includes(token));

  addCheck(result, {
    id: input.id,
    group: input.group,
    label: input.label,
    status: present.length === 0 ? statuses.ready : statuses.blocking,
    detail: present.length === 0 ? input.readyDetail : `仍包含：${present.join(", ")}`,
    action: present.length === 0 ? input.readyAction : input.blockingAction,
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
    content: [
      readProjectFile(root, "src/app/chat/chat-client.tsx"),
      readProjectFile(root, "src/app/chat/chat-ritual.tsx"),
      readProjectFile(root, "src/app/api/chat/route.ts"),
      readProjectFile(root, "src/lib/ai-orchestrator.ts"),
    ].join("\n"),
    tokens: [
      "data-chatProgress",
      "emitRitualProgress",
      "ChatRitual",
      "tarot_card",
      "bagua_stage",
      "bazi_pillars",
      "bazi_wuxing",
      "aria-live",
      "辨识问意",
      "档案已合参",
      "启用推演",
      "生成顾问结论",
    ],
    readyDetail: "Chat 由后端真实进度事件驱动，并按塔罗、八卦、八字展示专属仪式数据。",
    readyAction: "保留 data-chatProgress 协议和三类真实仪式组件。",
    blockingAction: "恢复后端进度事件、仪式数据和 ChatRitual 展示。",
  });

  checkExcludesAll(result, {
    id: "chat-client-no-fake-progress",
    group: "聊天体验",
    label: "禁止定时伪进度",
    content: readProjectFile(root, "src/app/chat/chat-client.tsx"),
    tokens: ["loadingStages", "activeStageIndex", "setInterval(() =>"],
    readyDetail: "Chat 不再使用前端计时器伪造后端步骤。",
    readyAction: "继续只消费服务端真实进度事件。",
    blockingAction: "移除 loadingStages、activeStageIndex 和定时轮播。",
  });

  checkContainsAll(result, {
    id: "chat-client-service-flow",
    group: "聊天体验",
    label: "发送前服务确认与回答后结论",
    content: [
      readProjectFile(root, "src/lib/chat-service.ts"),
      readProjectFile(root, "src/app/chat/chat-service-selector.tsx"),
      readProjectFile(root, "src/app/chat/chat-ritual.tsx"),
      readProjectFile(root, "src/app/chat/chat-client.tsx"),
    ].join("\n"),
    tokens: [
      "快速问答",
      "正式问事",
      "深度推演",
      "预计",
      "ChatConclusionCard",
      "最大风险",
      "继续追问",
      "生成深度报告",
      "用轻量模式回答",
      "反馈问题",
    ],
    readyDetail: "Chat 已覆盖发送前服务选择、结论卡、追问、深度报告和失败操作。",
    readyAction: "保留模式计费与完整问事闭环。",
    blockingAction: "补齐服务选择、结论卡和失败三路操作。",
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
      "useChat",
      "DefaultChatTransport",
      "throttle: 45",
      "Intl.Segmenter",
      "createUIMessageStream",
      "generatePreparedAiChat",
      "streamLocalAnswer",
      "buildPreparedAiChatResult",
      "ReactMarkdown",
      "remarkGfm",
      "MarkdownMessage",
      'type: "text-delta"',
      'type: "data-chatComplete"',
    ],
    readyDetail: "Chat 使用 AI SDK UI Stream，但只把已通过结构化校验的正文用中文分词流式渲染。",
    readyAction: "保留校验后流式渲染、useChat throttle 和 data-chatComplete 事件。",
    blockingAction: "恢复 generatePreparedAiChat、结构化校验后 streamLocalAnswer 和 UI Message Stream。",
  });

  checkContainsAll(result, {
    id: "chat-client-mature-interactions",
    group: "聊天体验",
    label: "停止生成与智能滚动",
    content: readProjectFile(root, "src/app/chat/chat-client.tsx"),
    tokens: [
      "stop",
      "stopGenerating",
      "停止生成",
      "shouldAutoScrollRef",
      "handleConversationScroll",
      "滚动到最新回答",
    ],
    readyDetail: "Chat 支持停止生成，并在用户上滑阅读时暂停自动跟随。",
    readyAction: "保留 useChat stop、近底部判断和返回最新回答按钮。",
    blockingAction: "恢复停止生成和智能滚动，避免长回答强制抢夺用户滚动位置。",
  });

  checkContainsAll(result, {
    id: "chat-client-tool-evidence",
    group: "聊天体验",
    label: "工具调用证据卡",
    content: readProjectFile(root, "src/app/chat/chat-client.tsx"),
    tokens: [
      "toolSummary",
      "tool.status",
      "tarot_spread_generator",
      "bazi_calculator",
      "birth_info_checker",
      "bagua_generator",
      "palm_image_checker",
    ],
    readyDetail: "聊天结果会展示工具状态和用户可读的工具概要。",
    readyAction: "保留工具证据卡，强化用户对 AI 调用工具的信任。",
    blockingAction: "恢复工具结果卡、状态标签和用户可读概要。",
  });

  checkExcludesAll(result, {
    id: "chat-client-no-raw-json",
    group: "聊天体验",
    label: "不展示原始 JSON",
    content: readProjectFile(root, "src/app/chat/chat-client.tsx"),
    tokens: ["原始结果", "JSON.stringify(tool.result"],
    readyDetail: "Chat 不会向用户展示工具原始 JSON。",
    readyAction: "继续只展示用户可读摘要。",
    blockingAction: "移除原始 JSON 展开区。",
  });

  checkContainsAll(result, {
    id: "chat-client-palm-attachment",
    group: "聊天体验",
    label: "对话手相图片附件",
    content: readProjectFile(root, "src/app/chat/chat-client.tsx"),
    tokens: [
      "uploadPalmAttachment",
      "removePalmAttachment",
      "/api/storage/qiniu/upload-token",
      "/api/images/palm",
      "palmImageId",
      "图片上传授权",
      "手相图片",
      "添加手相图片",
    ],
    readyDetail: "聊天页支持选择、授权、上传、附加和移除手相图片。",
    readyAction: "保留对话入口里的图片附件体验。",
    blockingAction: "恢复 ChatClient 的手相图片上传、授权、删除和 palmImageId 提交。",
  });

  checkContainsAll(result, {
    id: "chat-client-conversation-history",
    group: "聊天体验",
    label: "聊天页完整会话",
    content: readProjectFile(root, "src/app/chat/chat-client.tsx"),
    tokens: [
      "initialRecentChats",
      "recentChats",
      "createRecentChatFromResult",
      "最近对话",
      "getIntentLabel",
      "个工具",
      "activeChatId",
      "sessionId: activeChatId",
      "正在加载完整对话",
      "setMessages(restoredMessages)",
    ],
    readyDetail: "聊天页会展示最近会话、加载完整 Transcript，并携带 activeChatId 继续追问。",
    readyAction: "保留完整会话恢复和同 Session 续问。",
    blockingAction: "恢复 activeChatId 提交、会话详情 GET 和 restoredMessages。",
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
      "generateText",
      "compilePreparedAiChatPrompt",
      "FortuneAnswer",
    ],
    readyDetail: "AI 编排层包含意图识别、会员档案、命理工具和结构化 Prompt 编译。",
    readyAction: "保留后端工具链、证据包和结构化 FortuneAnswer 输出。",
    blockingAction: "恢复 prepareAiChat、工具链、compilePreparedAiChatPrompt 和结构化生成逻辑。",
  });

  checkContainsAll(result, {
    id: "ai-orchestrator-product-identity",
    group: "AI 编排",
    label: "产品身份与内部信息保护",
    content: [
      readProjectFile(root, "src/lib/ai-orchestrator.ts"),
      readProjectFile(root, "src/app/api/chat/route.ts"),
      readProjectFile(root, "src/app/chat/chat-client.tsx"),
    ].join("\n"),
    tokens: [
      "getProtectedProductAnswer",
      "productIdentityAnswer",
      "prepared.local.fixedAnswer",
      "identity_boundary",
      "hasProcessTrace",
    ],
    readyDetail: "模型身份和内部实现问题会使用固定的玄机 AI 产品口径，不进入模型生成，也不展示工具推演卡。",
    readyAction: "保留固定身份答复、模型调用短路和零工具过程卡隐藏逻辑。",
    blockingAction: "补回产品身份识别、fixedAnswer 短路和前端过程卡隐藏逻辑。",
  });

  checkContainsAll(result, {
    id: "ai-orchestrator-palm-attachment",
    group: "AI 编排",
    label: "附图触发手相预检",
    content: readProjectFile(root, "src/lib/ai-orchestrator.ts"),
    tokens: [
      "AiChatPalmImage",
      "function detectIntent(",
      "if (palmImage)",
      "status: \"completed\"",
      "imageId: input.palmImage.id",
      "正式手相报告会继续使用会员手相额度",
      "palmImageAttached",
    ],
    readyDetail: "AI 编排层会把附图对话识别为手相，并只做图片预检和付费链路引导。",
    readyAction: "保留附图手相预检，避免普通对话绕过手相报告权益。",
    blockingAction: "恢复 AiChatPalmImage、附图 intent 和 palm_image_checker completed 结果。",
  });

  checkContainsAll(result, {
    id: "ai-orchestrator-conversation-history",
    group: "AI 编排",
    label: "当前会话历史入模",
    content: readProjectFile(root, "src/lib/ai-orchestrator.ts"),
    tokens: [
      "ChatConversationMessage",
      "normalizeConversationHistory",
      "buildPreparedAiChatMessages",
      "conversationHistory",
      "conversationMessageCount",
      "readPreviousIntent",
      "findReusableTool",
    ],
    readyDetail: "AI 编排层会把当前 Session 的角色化历史写入模型上下文，并延续意图和工具结果。",
    readyAction: "保留服务端会话历史、连续意图和工具复用。",
    blockingAction: "恢复 ChatConversationMessage、buildPreparedAiChatMessages 和 findReusableTool。",
  });

  checkContainsAll(result, {
    id: "chat-api-cost-session",
    group: "AI 编排",
    label: "星力消耗、幂等与会话记录",
    content: [
      readProjectFile(root, "src/app/api/chat/route.ts"),
      readProjectFile(root, "src/lib/chat-turn-service.ts"),
    ].join("\n"),
    tokens: [
      "prepareAiChat",
      "generatePreparedAiChat",
      "buildPreparedAiChatResult",
      "validation",
      "clientRequestId",
      "reserveChatTurn",
      "completeChatTurn",
      "failChatTurn",
      "Serializable",
      "SESSION_BUSY",
      "IDEMPOTENCY_MISMATCH",
      "AiTurnStatus.PARTIAL",
      "AiTurnStatus.CANCELLED",
      "createSession",
      "createUIMessageStream",
      "createUIMessageStreamResponse",
      "balanceAfter",
      "chatSessionId",
      "sessionId",
      "getPalmImageUpload",
      "palmImageId",
      "手相图片不存在或不可用",
    ],
    readyDetail: "AI 对话接口会在串行化事务中预扣费、锁定会话、保存轮次，并支持幂等重放、部分结果和失败退款。",
    readyAction: "保留 /api/chat 与 chat-turn-service 的原子付费闭环。",
    blockingAction: "恢复请求幂等、会话锁、原子扣费、完成落库和失败退款。",
  });

  checkContainsAll(result, {
    id: "ai-session-history-store",
    group: "AI 编排",
    label: "AI 会话历史读取",
    content: readProjectFile(root, "src/lib/ai-session-store.ts"),
    tokens: [
      "export type RecentChatSession",
      "export type ChatSessionDetail",
      "getChatSessionDetail",
      "getRecentChatSessions",
      "normalizeRecentChatSession",
      "if (input.sessionId)",
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
      "最近对话",
      "完整对话到 Chat 里继续",
      "getChatIntentLabel",
      "formatTime",
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

  if (!contentType.includes("text/event-stream")) {
    return {
      json: await readJson(response),
      stream: null,
    };
  }

  const startedAt = Date.now();
  const events = [];
  let firstDeltaMs = null;
  let buffer = "";
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (reader) {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let lineBreakIndex = buffer.indexOf("\n");

      while (lineBreakIndex >= 0) {
        const line = buffer.slice(0, lineBreakIndex).trim();
        buffer = buffer.slice(lineBreakIndex + 1);

        if (line.startsWith("data: ")) {
          const payload = line.slice("data: ".length);

          if (payload && payload !== "[DONE]") {
            try {
              const event = JSON.parse(payload);
              events.push(event);

              if (event?.type === "text-delta" && firstDeltaMs === null) {
                firstDeltaMs = Date.now() - startedAt;
              }
            } catch {
              // Ignore malformed diagnostic chunks; the completion check will fail below.
            }
          }
        }

        lineBreakIndex = buffer.indexOf("\n");
      }
    }
  }

  const completed = events.findLast((event) => event?.type === "data-chatComplete");
  const failed = events.findLast(
    (event) => event?.type === "data-chatError" || event?.type === "error",
  );
  const progressEvents = events
    .filter((event) => event?.type === "data-chatProgress")
    .map((event) => event.data)
    .filter(Boolean);
  const firstTextIndex = events.findIndex((event) => event?.type === "text-delta");
  const lastRitualIndex = events.findLastIndex(
    (event) => event?.type === "data-chatProgress" && event.data?.step === "ritual",
  );

  return {
    json:
      completed?.data ??
      (failed
        ? {
            ok: false,
            message: failed.data?.message ?? failed.errorText,
            balance: failed.data?.balanceAfter,
          }
        : null),
    stream: {
      contentType,
      started: events.some((event) => event?.type === "start"),
      deltaCount: events.filter((event) => event?.type === "text-delta").length,
      firstDeltaMs,
      durationMs: Date.now() - startedAt,
      completed:
        Boolean(completed) && events.some((event) => event?.type === "finish"),
      progressSteps: [...new Set(progressEvents.map((event) => event.step))],
      ritualKinds: progressEvents
        .map((event) => event.ritualItem?.kind)
        .filter(Boolean),
      ritualItems: progressEvents
        .map((event) => event.ritualItem)
        .filter(Boolean),
      ritualItemCount: progressEvents.filter((event) => event.ritualItem).length,
      ritualBeforeText: lastRitualIndex >= 0 && firstTextIndex > lastRitualIndex,
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
  const clientRequestId = extraBody.clientRequestId ?? randomUUID();
  const response = await fetchWithTimeout({
    url: `${input.baseUrl}/api/chat`,
    method: "POST",
    timeoutMs: input.timeoutMs,
    cookie,
    body: JSON.stringify({ question, ...extraBody, clientRequestId }),
  });

  const payload = await readChatResponse(response);

  return {
    response,
    ...payload,
    cookie: getCookieHeader(response) || cookie,
    clientRequestId,
  };
}

async function cancelChatStream(input, question, cookie, cancelAfter) {
  const clientRequestId = randomUUID();
  const response = await fetchWithTimeout({
    url: `${input.baseUrl}/api/chat`,
    method: "POST",
    timeoutMs: input.timeoutMs,
    cookie,
    body: JSON.stringify({ question, clientRequestId }),
  });
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let start = null;
  let firstDelta = "";

  if (reader) {
    readLoop: while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let lineBreakIndex = buffer.indexOf("\n");

      while (lineBreakIndex >= 0) {
        const line = buffer.slice(0, lineBreakIndex).trim();
        buffer = buffer.slice(lineBreakIndex + 1);

        if (line.startsWith("data: ")) {
          const payload = line.slice("data: ".length);

          if (payload && payload !== "[DONE]") {
            try {
              const event = JSON.parse(payload);

              if (event?.type === "data-chatStart") {
                start = event.data;

                if (cancelAfter === "start") {
                  await reader.cancel("runtime no-output cancellation check");
                  break readLoop;
                }
              }

              if (event?.type === "text-delta" && event.delta) {
                firstDelta = event.delta;

                if (cancelAfter === "text") {
                  await reader.cancel("runtime partial cancellation check");
                  break readLoop;
                }
              }
            } catch {
              // The runtime assertion below will report missing structured events.
            }
          }
        }

        lineBreakIndex = buffer.indexOf("\n");
      }
    }
  }

  return {
    response,
    clientRequestId,
    cookie: getCookieHeader(response) || cookie,
    start,
    firstDelta,
  };
}

async function waitForTurnSettlement(input, question, cookie, clientRequestId) {
  let settled = null;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await delay(200);
    const result = await postChat(input, question, cookie, { clientRequestId });

    if (result.response.status === 409 && result.json?.code === "TURN_IN_PROGRESS") {
      continue;
    }

    settled = result;
    break;
  }

  return settled;
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
    const paidBalance = payJson?.transaction?.balanceAfter;
    const payReady =
      payResponse.status === 200 &&
      payJson?.ok === true &&
      typeof payJson?.transaction?.amount === "number" &&
      payJson.transaction.amount > 0 &&
      typeof paidBalance === "number" &&
      paidBalance >= payJson.transaction.amount;

    addRuntimeCheck(result, {
      id: "runtime-pay-membership-order",
      label: "支付后发放星力",
      ready: payReady,
      readyDetail: `月度会员支付后发放 ${payJson?.transaction?.amount ?? 0} 星力，可用于 AI 对话。`,
      blockingDetail: `status=${payResponse.status}, amount=${payJson?.transaction?.amount}, balance=${payJson?.transaction?.balanceAfter}`,
      readyAction: "继续调用 /api/chat。",
      blockingAction: "检查 mock 支付成功后的星力发放和会话刷新。",
    });

    if (!payReady) {
      return;
    }

    const tarotQuestion = "我想问和前任还有机会复合吗？用塔罗三牌阵看看。";
    const tarot = await postChat(input, tarotQuestion, cookie, { serviceMode: "formal" });
    cookie = tarot.cookie;
    const tarotToolCards = findTool(tarot.json, "tarot_spread_generator")?.result?.cards ?? [];
    const tarotRitualItems = tarot.stream?.ritualItems?.filter((item) => item.kind === "tarot_card") ?? [];
    const tarotRitualAligned =
      tarotToolCards.length === 3 &&
      tarotRitualItems.length === 3 &&
      tarotRitualItems.every((item, index) =>
        item.title === tarotToolCards[index]?.card &&
        item.position === tarotToolCards[index]?.position &&
        item.orientation === tarotToolCards[index]?.orientation &&
        item.meaning === tarotToolCards[index]?.meaning,
      );
    const tarotReady =
      tarot.response.status === 200 &&
      tarot.json?.ok === true &&
      tarot.json?.intent === "tarot" &&
      tarot.json?.cost === 12 &&
      typeof tarot.json?.costCents === "number" &&
      tarot.json?.balanceAfter === paidBalance - 12 &&
      hasStep(tarot.json, "调用命理工具") &&
      hasTool(tarot.json, "intent_classifier", "completed") &&
      hasTool(tarot.json, "profile_reader") &&
      hasTool(tarot.json, "tarot_spread_generator", "completed") &&
      tarotRitualAligned;

    addRuntimeCheck(result, {
      id: "runtime-chat-tarot",
      label: "塔罗对话工具链",
      ready: tarotReady,
      readyDetail: "正式塔罗问事会识别 intent、读取档案、逐张翻牌，且动画牌面与工具结果逐项一致。",
      blockingDetail: `status=${tarot.response.status}, intent=${tarot.json?.intent}, balance=${tarot.json?.balanceAfter}, costCents=${tarot.json?.costCents}, hasTarot=${hasTool(tarot.json, "tarot_spread_generator")}, aligned=${tarotRitualAligned}`,
      readyAction: "保留塔罗工具链和前端过程展示。",
      blockingAction: "检查 detectIntent、tarot_spread_generator 和 /api/chat 扣费返回。",
    });

    const tarotStreamReady =
      tarot.response.status === 200 &&
      tarot.stream?.started === true &&
      tarot.stream?.completed === true &&
      tarot.stream?.deltaCount > 0 &&
      ["classify", "profile", "tool", "ritual", "answer"].every((step) =>
        tarot.stream?.progressSteps?.includes(step),
      ) &&
      tarot.stream?.ritualKinds?.filter((kind) => kind === "tarot_card").length === 3 &&
      tarot.stream?.ritualBeforeText === true;

    addRuntimeCheck(result, {
      id: "runtime-chat-streaming-output",
      label: "Chat 回答流式传输",
      ready: tarotStreamReady,
      readyDetail: `Chat 返回 AI SDK SSE、五段真实进度和 3 张塔罗牌，共 ${tarot.stream?.deltaCount ?? 0} 个平滑文本片段。`,
      blockingDetail: `started=${tarot.stream?.started}, deltas=${tarot.stream?.deltaCount}, progress=${tarot.stream?.progressSteps?.join("/")}, ritual=${tarot.stream?.ritualKinds?.join("/")}`,
      readyAction: "保留 AI SDK start/text-delta/data-chatComplete/finish 事件协议。",
      blockingAction: "检查 /api/chat 是否返回 AI SDK text/event-stream，以及结构化校验后是否产生 text-delta。",
    });

    const tarotReplay = await postChat(input, tarotQuestion, cookie, {
      clientRequestId: tarot.clientRequestId,
      serviceMode: "formal",
    });
    cookie = tarotReplay.cookie;
    const replayReady =
      tarotReplay.response.status === 200 &&
      tarotReplay.json?.ok === true &&
      tarotReplay.json?.replayed === true &&
      tarotReplay.json?.turnId === tarot.json?.turnId &&
      tarotReplay.json?.chatSessionId === tarot.json?.chatSessionId &&
      tarotReplay.json?.balanceAfter === tarot.json?.balanceAfter;

    addRuntimeCheck(result, {
      id: "runtime-chat-idempotent-replay",
      label: "重复请求幂等重放",
      ready: replayReady,
      readyDetail: "相同 clientRequestId 会直接重放已保存回答，轮次、会话和余额均保持不变。",
      blockingDetail: `status=${tarotReplay.response.status}, replayed=${tarotReplay.json?.replayed}, sameTurn=${tarotReplay.json?.turnId === tarot.json?.turnId}, balance=${tarotReplay.json?.balanceAfter}`,
      readyAction: "保留 AiTurn 幂等键和 result 快照重放。",
      blockingAction: "检查 reserveChatTurn 是否在模型调用前识别并重放已完成轮次。",
    });

    const mismatch = await postChat(input, "换一个不同的问题", cookie, {
      clientRequestId: tarot.clientRequestId,
    });
    const mismatchReady =
      mismatch.response.status === 409 &&
      mismatch.json?.ok === false &&
      mismatch.json?.code === "IDEMPOTENCY_MISMATCH";

    addRuntimeCheck(result, {
      id: "runtime-chat-idempotency-mismatch",
      label: "幂等键内容冲突拒绝",
      ready: mismatchReady,
      readyDetail: "同一 clientRequestId 携带不同问题会返回 409，不会复用旧结果或再次扣费。",
      blockingDetail: `status=${mismatch.response.status}, code=${mismatch.json?.code}`,
      readyAction: "保留 requestHash 一致性校验。",
      blockingAction: "检查 requestHash 与 IDEMPOTENCY_MISMATCH 分支。",
    });

    const tarotSessionId = tarot.json?.chatSessionId;
    const tarotFollowUp = await postChat(
      input,
      "第二张牌具体代表什么？继续结合刚才的牌阵说。",
      cookie,
      { sessionId: tarotSessionId },
    );
    cookie = tarotFollowUp.cookie;
    const reusedTarotTool = findTool(tarotFollowUp.json, "tarot_spread_generator");
    const transcriptResponse = typeof tarotSessionId === "string"
      ? await fetchWithTimeout({
          url: `${input.baseUrl}/api/chat/sessions/${encodeURIComponent(tarotSessionId)}`,
          timeoutMs: input.timeoutMs,
          cookie,
        })
      : null;
    const transcriptJson = transcriptResponse ? await readJson(transcriptResponse) : null;
    const transcriptMessages = Array.isArray(transcriptJson?.chat?.messages)
      ? transcriptJson.chat.messages
      : [];
    const multiTurnReady =
      tarotFollowUp.response.status === 200 &&
      tarotFollowUp.json?.ok === true &&
      tarotFollowUp.json?.chatSessionId === tarotSessionId &&
      tarotFollowUp.json?.intent === "tarot" &&
      tarotFollowUp.json?.balanceAfter === paidBalance - 13 &&
      String(reusedTarotTool?.label ?? "").includes("沿用本会话结果") &&
      transcriptResponse?.status === 200 &&
      transcriptMessages.length === 4 &&
      transcriptMessages[0]?.content?.includes("前任") &&
      transcriptMessages[2]?.content?.includes("第二张牌");

    addRuntimeCheck(result, {
      id: "runtime-chat-true-multi-turn",
      label: "同一会话连续追问",
      ready: multiTurnReady,
      readyDetail: "第二轮保持同一 Session，沿用首轮牌阵，完整 Transcript 已增长为 4 条消息。",
      blockingDetail: `status=${tarotFollowUp.response.status}, sameSession=${tarotFollowUp.json?.chatSessionId === tarotSessionId}, intent=${tarotFollowUp.json?.intent}, reused=${String(reusedTarotTool?.label ?? "").includes("沿用")}, transcript=${transcriptMessages.length}`,
      readyAction: "保留 sessionId、角色化历史、工具复用和完整会话 GET。",
      blockingAction: "检查 /api/chat sessionId、saveChatTurn 追加逻辑和会话详情 GET。",
    });

    const bazi = await postChat(input, "帮我看八字五行事业方向。", cookie);
    cookie = bazi.cookie;
    const baziReady =
      bazi.response.status === 200 &&
      bazi.json?.ok === true &&
      bazi.json?.intent === "bazi" &&
      bazi.json?.balanceAfter === paidBalance - 14 &&
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

    const baziSessionId = bazi.json?.chatSessionId;
    const completedBazi = await postChat(
      input,
      "1995-08-18 09:30，出生地上海。",
      cookie,
      { sessionId: baziSessionId },
    );
    cookie = completedBazi.cookie;
    const baziChart = findTool(completedBazi.json, "bazi_calculator")?.result?.chart;
    const baziPillars = completedBazi.stream?.ritualItems?.find((item) => item.kind === "bazi_pillars");
    const baziWuxing = completedBazi.stream?.ritualItems?.find((item) => item.kind === "bazi_wuxing");
    const baziRitualAligned =
      Array.isArray(baziChart?.bazi) &&
      JSON.stringify(baziPillars?.pillars) === JSON.stringify(baziChart.bazi.slice(0, 4)) &&
      JSON.stringify(baziWuxing?.counts) === JSON.stringify(baziChart.counts);
    const completedBaziReady =
      completedBazi.response.status === 200 &&
      completedBazi.json?.ok === true &&
      completedBazi.json?.intent === "bazi" &&
      completedBazi.json?.chatSessionId === baziSessionId &&
      completedBazi.json?.balanceAfter === paidBalance - 15 &&
      hasTool(completedBazi.json, "bazi_calculator", "completed") &&
      completedBazi.stream?.ritualKinds?.includes("bazi_pillars") &&
      completedBazi.stream?.ritualKinds?.includes("bazi_wuxing") &&
      baziRitualAligned;

    addRuntimeCheck(result, {
      id: "runtime-chat-bazi-ritual-alignment",
      label: "八字命盘数据一致",
      ready: completedBaziReady,
      readyDetail: "补齐出生信息后，动画四柱与五行计数和排盘工具结果逐项一致。",
      blockingDetail: `status=${completedBazi.response.status}, intent=${completedBazi.json?.intent}, balance=${completedBazi.json?.balanceAfter}, hasBazi=${hasTool(completedBazi.json, "bazi_calculator")}, ritual=${completedBazi.stream?.ritualKinds?.join("/")}, aligned=${baziRitualAligned}`,
      readyAction: "保留同一份 ritualItems 同时供八字动画和模型解释使用。",
      blockingAction: "检查 bazi_calculator、buildChatRitualItems 与模型输入是否共享同一排盘快照。",
    });

    const changedBazi = await postChat(
      input,
      "请根据我的八字分析事业方向。我的出生信息是：2000-07-07 09:30，出生地太原。",
      cookie,
      { sessionId: baziSessionId },
    );
    cookie = changedBazi.cookie;
    const changedBaziTool = findTool(changedBazi.json, "bazi_calculator");
    const changedBaziChart = changedBaziTool?.result?.chart;
    const changedBaziReady =
      changedBazi.response.status === 200 &&
      changedBazi.json?.ok === true &&
      changedBazi.json?.intent === "bazi" &&
      changedBazi.json?.balanceAfter === paidBalance - 16 &&
      changedBaziChart?.input?.birthDate === "2000-07-07" &&
      JSON.stringify(changedBaziChart?.bazi) !== JSON.stringify(baziChart?.bazi) &&
      String(changedBaziTool?.label ?? "").includes("沿用") === false;

    addRuntimeCheck(result, {
      id: "runtime-chat-bazi-new-birth-recalculates",
      label: "新出生信息重新排盘",
      ready: changedBaziReady,
      readyDetail: "同一会话更换出生日期后会重新排盘，当前输入优先于历史生日，四柱不再沿用旧结果。",
      blockingDetail: `status=${changedBazi.response.status}, intent=${changedBazi.json?.intent}, balance=${changedBazi.json?.balanceAfter}, birth=${changedBaziChart?.input?.birthDate}, old=${JSON.stringify(baziChart?.bazi)}, next=${JSON.stringify(changedBaziChart?.bazi)}, label=${changedBaziTool?.label}`,
      readyAction: "保留当前出生信息优先和仅上下文追问复用排盘的规则。",
      blockingAction: "检查 parseBirth 当前问题优先级与 findReusableTool 的上下文追问条件。",
    });

    const otherPersonBazi = await postChat(
      input,
      "请分析我朋友小林的八字。她的出生信息是：1988-03-12 14:20，出生地杭州。",
      cookie,
      { sessionId: baziSessionId },
    );
    cookie = otherPersonBazi.cookie;
    const otherPersonBaziTool = findTool(otherPersonBazi.json, "bazi_calculator");
    const otherPersonProfileResult = findTool(otherPersonBazi.json, "profile_reader")?.result;
    const otherPersonContext = otherPersonBazi.json?.contextSummary;
    const otherPersonAnswer = String(otherPersonBazi.json?.answer ?? "");
    const otherPersonBaziReady =
      otherPersonBazi.response.status === 200 &&
      otherPersonBazi.json?.ok === true &&
      otherPersonBazi.json?.intent === "bazi" &&
      otherPersonBazi.json?.balanceAfter === paidBalance - 17 &&
      otherPersonContext?.readingSubject?.kind === "other" &&
      otherPersonContext?.readingSubject?.memberProfileRole === "none" &&
      otherPersonContext?.userProfile?.memberProfileRole === "none" &&
      otherPersonContext?.userProfile?.appliesToReadingSubject === false &&
      otherPersonProfileResult?.completeness === 0 &&
      otherPersonBaziTool?.result?.chart?.input?.birthDate === "1988-03-12" &&
      String(otherPersonBaziTool?.label ?? "").includes("沿用") === false &&
      otherPersonAnswer.includes("你的四柱") === false;

    addRuntimeCheck(result, {
      id: "runtime-chat-other-person-profile-boundary",
      label: "替他人问事时隔离本人档案",
      ready: otherPersonBaziReady,
      readyDetail: "替朋友排八字时会识别朋友为问事对象，排除账号本人档案，并只使用朋友本轮提供的出生信息。",
      blockingDetail: `status=${otherPersonBazi.response.status}, intent=${otherPersonBazi.json?.intent}, balance=${otherPersonBazi.json?.balanceAfter}, subject=${JSON.stringify(otherPersonContext?.readingSubject)}, role=${otherPersonContext?.userProfile?.memberProfileRole}, birth=${otherPersonBaziTool?.result?.chart?.input?.birthDate}, label=${otherPersonBaziTool?.label}`,
      readyAction: "保留 readingSubject、memberProfileRole 和跨对象工具结果隔离。",
      blockingAction: "检查问事对象识别、本人档案排除和同会话切换对象时的上下文清理。",
    });

    const baziProfileResult = findTool(bazi.json, "profile_reader")?.result;
    const baziSessionIsolationReady =
      bazi.response.status === 200 &&
      bazi.json?.ok === true &&
      typeof baziProfileResult === "object" &&
      baziProfileResult !== null &&
      baziProfileResult.conversationMessageCount === 0 &&
      JSON.stringify(baziProfileResult).includes("前任") === false;

    addRuntimeCheck(result, {
      id: "runtime-chat-new-session-isolation",
      label: "新会话上下文隔离",
      ready: baziSessionIsolationReady,
      readyDetail: "未携带 sessionId 的八字问题不会混入上一段塔罗会话。",
      blockingDetail: `status=${bazi.response.status}, count=${baziProfileResult?.conversationMessageCount}, leaked=${JSON.stringify(baziProfileResult ?? {}).includes("前任")}`,
      readyAction: "保留当前 Session 历史与跨会话记忆的边界。",
      blockingAction: "检查 prepareAiChat 是否只接收服务端加载的当前 Session history。",
    });

    const bagua = await postChat(
      input,
      "请为“我是否应该接受 A 公司的 offer”起一卦，重点看未来三个月。",
      cookie,
    );
    cookie = bagua.cookie;
    const baguaChart = findTool(bagua.json, "bagua_generator")?.result?.chart;
    const baguaRitualItems = bagua.stream?.ritualItems?.filter((item) => item.kind === "bagua_stage") ?? [];
    const baguaRitualAligned =
      baguaRitualItems.length === 3 &&
      baguaRitualItems[0]?.title === `本卦 · ${baguaChart?.mainHexagram?.name}` &&
      baguaRitualItems[1]?.title === `动爻 · ${baguaChart?.moving?.position}` &&
      baguaRitualItems[2]?.title === `变卦 · ${baguaChart?.changedHexagram?.name}`;
    const baguaReady =
      bagua.response.status === 200 &&
      bagua.json?.ok === true &&
      bagua.json?.intent === "bagua" &&
      bagua.json?.answerShape === "decision_ab" &&
      bagua.json?.balanceAfter === paidBalance - 18 &&
      hasStep(bagua.json, "生成专属回复") &&
      hasTool(bagua.json, "bagua_generator", "completed") &&
      bagua.stream?.ritualKinds?.filter((kind) => kind === "bagua_stage").length === 3 &&
      baguaRitualAligned;

    addRuntimeCheck(result, {
      id: "runtime-chat-bagua",
      label: "八卦问事工具链",
      ready: baguaReady,
      readyDetail: "用户自然说“起一卦/是否应该”会进入八卦链路，动画的本卦、动爻、变卦与模型工具结果逐项一致。",
      blockingDetail: `status=${bagua.response.status}, intent=${bagua.json?.intent}, shape=${bagua.json?.answerShape}, balance=${bagua.json?.balanceAfter}, hasBagua=${hasTool(bagua.json, "bagua_generator")}, ritual=${bagua.stream?.ritualKinds?.join("/")}, aligned=${baguaRitualAligned}`,
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
    cookie = palm.cookie;
    const palmReady =
      palm.response.status === 200 &&
      palm.json?.ok === true &&
      palm.json?.intent === "palm" &&
      palm.json?.balanceAfter === paidBalance - 19 &&
      hasTool(palm.json, "palm_image_checker", "completed") &&
      findTool(palm.json, "palm_image_checker")?.result?.nextAction === "/palm" &&
      String(palm.json?.answer ?? "").trim().length > 0;

    addRuntimeCheck(result, {
      id: "runtime-chat-palm-attachment",
      label: "手相附图对话预检",
      ready: palmReady,
      readyDetail: "聊天携带 palmImageId 会进入手相预检工具链，只扣普通对话星力并引导到正式手相报告。",
      blockingDetail: `status=${palm.response.status}, intent=${palm.json?.intent}, balance=${palm.json?.balanceAfter}, hasPalmTool=${hasTool(palm.json, "palm_image_checker")}`,
      readyAction: "保留聊天图片附件和手相付费链路边界。",
      blockingAction: "检查 /api/chat 图片归属校验、runAiChat palmImage 入参和 palm_image_checker 返回。",
    });

    const identity = await postChat(input, "你是什么模型", cookie);
    cookie = identity.cookie;
    const identityAnswer = String(identity.json?.answer ?? "");
    const forbiddenIdentityTerms = [
      "OpenAI",
      "ChatGPT",
      "GPT-",
      "general",
      "工具结果",
      "意图分类",
      "命理推演",
    ];
    const identityReady =
      identity.response.status === 200 &&
      identity.json?.ok === true &&
      identity.json?.balanceAfter === paidBalance - 20 &&
      identityAnswer.startsWith("我是玄机 AI") &&
      identity.json?.toolCalls?.length === 0 &&
      forbiddenIdentityTerms.every((term) => !identityAnswer.includes(term));

    addRuntimeCheck(result, {
      id: "runtime-chat-product-identity",
      label: "产品身份答复保护",
      ready: identityReady,
      readyDetail: "模型身份问题只返回玄机 AI 产品口径，没有供应商、内部意图或工具机制泄露。",
      blockingDetail: `status=${identity.response.status}, balance=${identity.json?.balanceAfter}, tools=${identity.json?.toolCalls?.length}, answer=${identityAnswer.slice(0, 120)}`,
      readyAction: "保留身份问题的固定答复和模型调用短路。",
      blockingAction: "检查 getProtectedProductAnswer、fixedAnswer 和 /api/chat 本地流式分支。",
    });

    const concurrentFirstPromise = postChat(
      input,
      "你是什么模型",
      cookie,
      { sessionId: tarotSessionId },
    );
    await delay(40);
    const concurrentSecond = await postChat(
      input,
      "同一个会话里同时再问一个问题",
      cookie,
      { sessionId: tarotSessionId },
    );
    const concurrentFirst = await concurrentFirstPromise;
    cookie = concurrentFirst.cookie;
    const concurrentReady =
      concurrentFirst.response.status === 200 &&
      concurrentFirst.json?.ok === true &&
      concurrentSecond.response.status === 409 &&
      concurrentSecond.json?.code === "SESSION_BUSY" &&
      concurrentFirst.json?.balanceAfter === paidBalance - 21;

    addRuntimeCheck(result, {
      id: "runtime-chat-session-lock",
      label: "同一会话并发锁",
      ready: concurrentReady,
      readyDetail: "同一 Session 的第二个并发请求返回 SESSION_BUSY，首个请求正常完成且只扣一轮。",
      blockingDetail: `first=${concurrentFirst.response.status}/${concurrentFirst.json?.balanceAfter}, second=${concurrentSecond.response.status}/${concurrentSecond.json?.code}`,
      readyAction: "保留 AiSession.activeTurnId 条件锁。",
      blockingAction: "检查 reserveChatTurn 的 activeTurnId 锁定与释放。",
    });

    const noOutputQuestion = "测试首段输出前取消，请简短回答。";
    const noOutputAbort = await cancelChatStream(
      input,
      noOutputQuestion,
      cookie,
      "start",
    );
    cookie = noOutputAbort.cookie;
    const noOutputSettled = await waitForTurnSettlement(
      input,
      noOutputQuestion,
      cookie,
      noOutputAbort.clientRequestId,
    );
    const noOutputTranscriptResponse = noOutputAbort.start?.chatSessionId
      ? await fetchWithTimeout({
          url: `${input.baseUrl}/api/chat/sessions/${encodeURIComponent(noOutputAbort.start.chatSessionId)}`,
          timeoutMs: input.timeoutMs,
          cookie,
        })
      : null;
    const noOutputTranscript = noOutputTranscriptResponse
      ? await readJson(noOutputTranscriptResponse)
      : null;
    const noOutputMessages = Array.isArray(noOutputTranscript?.chat?.messages)
      ? noOutputTranscript.chat.messages
      : [];
    const noOutputReady =
      noOutputAbort.response.status === 200 &&
      noOutputAbort.start?.balanceAfter === paidBalance - 22 &&
      noOutputSettled?.response.status === 409 &&
      noOutputSettled?.json?.code === "TURN_ALREADY_FAILED" &&
      noOutputSettled?.json?.balance === paidBalance - 21 &&
      noOutputTranscriptResponse?.status === 200 &&
      noOutputMessages.length === 0;

    addRuntimeCheck(result, {
      id: "runtime-chat-no-output-refund",
      label: "无输出取消自动退款",
      ready: noOutputReady,
      readyDetail: "首段文本前取消会进入 CANCELLED/FAILED 终态、退回本轮星力，失败消息不进入 Transcript。",
      blockingDetail: `startBalance=${noOutputAbort.start?.balanceAfter}, status=${noOutputSettled?.response.status}, code=${noOutputSettled?.json?.code}, refundBalance=${noOutputSettled?.json?.balance}, transcript=${noOutputMessages.length}`,
      readyAction: "保留无输出 failChatTurn 退款和历史过滤。",
      blockingAction: "检查 onAbort 无文本分支、退款账本和 failed/cancelled 消息过滤。",
    });

    const partialQuestion = "请分点说明未来三个月提升工作效率的方法。";
    const partialAbort = await cancelChatStream(
      input,
      partialQuestion,
      cookie,
      "text",
    );
    cookie = partialAbort.cookie;
    const partialReplay = await waitForTurnSettlement(
      input,
      partialQuestion,
      cookie,
      partialAbort.clientRequestId,
    );
    const partialTranscriptResponse = partialAbort.start?.chatSessionId
      ? await fetchWithTimeout({
          url: `${input.baseUrl}/api/chat/sessions/${encodeURIComponent(partialAbort.start.chatSessionId)}`,
          timeoutMs: input.timeoutMs,
          cookie,
        })
      : null;
    const partialTranscript = partialTranscriptResponse
      ? await readJson(partialTranscriptResponse)
      : null;
    const partialMessages = Array.isArray(partialTranscript?.chat?.messages)
      ? partialTranscript.chat.messages
      : [];
    const partialReady =
      partialAbort.response.status === 200 &&
      partialAbort.firstDelta.length > 0 &&
      partialReplay?.response.status === 200 &&
      partialReplay?.json?.ok === true &&
      partialReplay?.json?.replayed === true &&
      partialReplay?.json?.turnStatus === "PARTIAL" &&
      partialReplay?.json?.balanceAfter === paidBalance - 22 &&
      partialMessages.length === 2 &&
      String(partialMessages[1]?.content ?? "").trim().length > 0;

    addRuntimeCheck(result, {
      id: "runtime-chat-partial-settlement",
      label: "部分回答保存并结算",
      ready: partialReady,
      readyDetail: "收到文本后取消会保存 PARTIAL 回答并保持单轮扣费，相同请求可直接重放部分结果。",
      blockingDetail: `delta=${partialAbort.firstDelta.length}, status=${partialReplay?.response.status}, turnStatus=${partialReplay?.json?.turnStatus}, balance=${partialReplay?.json?.balanceAfter}, transcript=${partialMessages.length}`,
      readyAction: "保留 PARTIAL 完成事务和结果快照重放。",
      blockingAction: "检查 onAbort 有文本分支、PARTIAL 消息落库与 replay。",
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
      chatPageText.includes("我上传了手掌照片");

    addRuntimeCheck(result, {
      id: "runtime-chat-history-visible",
      label: "聊天页最近对话可见",
      ready: chatHistoryReady,
      readyDetail: "聊天页能看到刚完成的 AI 对话历史和工具数量。",
      blockingDetail: `status=${chatPageResponse.status}, hasRecent=${chatPageText.includes("最近对话")}, hasQuestion=${chatPageText.includes("我上传了手掌照片")}`,
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
      memberPageText.includes("最近对话") &&
      memberPageText.includes("完整对话到 Chat 里继续") &&
      memberPageText.includes("我上传了手掌照片");

    addRuntimeCheck(result, {
      id: "runtime-member-chat-history-visible",
      label: "会员中心最近 AI 对话可见",
      ready: memberHistoryReady,
      readyDetail: "会员中心能看到刚完成的 AI 对话摘要，形成可见会员资产。",
      blockingDetail: `status=${memberPageResponse.status}, hasRecent=${memberPageText.includes("最近对话")}, hasQuestion=${memberPageText.includes("我上传了手掌照片")}`,
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
