import "server-only";

import { buildBaguaReading, generateBagua } from "@/lib/bagua";
import { calculateBazi, buildBaziReading, type BaziInput } from "@/lib/bazi";
import {
  buildProfileMemory,
  getFortuneProfile,
  type FortuneProfileRecord,
} from "@/lib/fortune-profile-store";
import {
  getRecentChatSessions,
  type RecentChatSession,
} from "@/lib/ai-session-store";
import {
  buildAiCostMetadata,
  estimateOpenAiCostCents,
  type AiCostEstimate,
} from "@/lib/ai-cost";
import { getDefaultOpenAIModel, getOpenAIClient } from "@/lib/openai-client";
import { buildTarotReading, drawTarot } from "@/lib/tarot";
import { createUsageLog } from "@/lib/usage-log-store";

export type ChatIntent = "tarot" | "bazi" | "bagua" | "palm" | "general";

export type AiToolCall = {
  name: string;
  label: string;
  status: "completed" | "needs_input" | "preview";
  result: unknown;
};

export type AiChatStep = {
  label: string;
  detail: string;
};

export type AiChatResult = {
  provider: "openai" | "local";
  model: string;
  intent: ChatIntent;
  answer: string;
  steps: AiChatStep[];
  toolCalls: AiToolCall[];
  tokensIn?: number;
  tokensOut?: number;
  costCents?: number;
  costEstimate?: AiCostEstimate;
  usageLogId: string;
};

export type AiChatPalmImage = {
  id: string;
  qiniuKey: string;
  url: string;
  contentType: string;
  sizeBytes: number;
};

export type RunAiChatInput = {
  userId: string;
  question: string;
  palmImage?: AiChatPalmImage;
};

type LocalAiChatResult = {
  steps: AiChatStep[];
  toolCalls: AiToolCall[];
  draftAnswer: string;
};

export type PreparedAiChat = {
  input: RunAiChatInput;
  intent: ChatIntent;
  profileMemory: string;
  recentChatMemory: string;
  recentChatCount: number;
  local: LocalAiChatResult;
};

export type AiChatStreamHandlers = {
  onDelta?: (delta: string) => void;
  onReplace?: (answer: string) => void;
  signal?: AbortSignal;
};

type RunLocalToolsInput = RunAiChatInput & {
  profile: FortuneProfileRecord | null;
  profileMemory: string;
  recentChats: RecentChatSession[];
  recentChatMemory: string;
};

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 2));
}

const comparisonQuestionPattern = /对比|比较|两个|两种|哪个|选择|方案|优缺点|区别/;

function buildResponseFormatHint(question: string) {
  return comparisonQuestionPattern.test(question)
    ? "如果问题里有两个或以上明确对象，请用 Markdown 表格对比关键维度，再给结论。"
    : "根据内容自然分段；只有确实存在多维比较时才使用 Markdown 表格。";
}

function compactText(text: string, maxLength: number) {
  const normalized = text.trim().replace(/\s+/g, " ");

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

function buildRecentChatMemory(recentChats: RecentChatSession[]) {
  if (recentChats.length === 0) {
    return "暂无近期 AI 对话记忆。";
  }

  return recentChats
    .map((chat, index) => {
      const intent = chat.intent ?? "general";
      const answerPreview = chat.answer
        ? ` / 上次建议：${compactText(chat.answer, 96)}`
        : "";

      return `${index + 1}. ${intent}：${compactText(chat.question, 72)}${answerPreview}`;
    })
    .join("\n");
}

function buildRecentChatToolItems(recentChats: RecentChatSession[]) {
  return recentChats.map((chat) => ({
    id: chat.id,
    title: chat.title,
    question: compactText(chat.question, 120),
    answerPreview: compactText(chat.answer, 160),
    intent: chat.intent,
    toolNames: chat.toolNames,
    createdAt: chat.createdAt,
  }));
}

function detectIntent(question: string, palmImage?: AiChatPalmImage): ChatIntent {
  if (palmImage) {
    return "palm";
  }

  if (/塔罗|牌阵|抽牌|感情|关系|复合|对方/.test(question)) {
    return "tarot";
  }

  if (/八字|五行|四柱|生日|出生|命盘/.test(question)) {
    return "bazi";
  }

  if (/八卦|起卦|卦象|问事|选择|决策/.test(question)) {
    return "bagua";
  }

  if (/手相|掌纹|手掌|上传|照片|图片/.test(question)) {
    return "palm";
  }

  return "general";
}

function parseBirth(question: string): BaziInput | null {
  const dateMatch = question.match(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})/);
  const clockMatch = question.match(/(\d{1,2})[:：](\d{2})/) ?? question.match(/(\d{1,2})点/);

  if (!dateMatch) {
    return null;
  }

  const [, year, month, day] = dateMatch;
  const hour = clockMatch?.[1] ?? "12";
  const minute = clockMatch?.[2] ?? "00";
  const placeMatch = question.match(/出生地[:：是为在\s]*([\u4e00-\u9fa5A-Za-z\s]{2,20})/);

  return {
    birthDate: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
    birthTime: `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`,
    birthPlace: placeMatch?.[1]?.trim(),
  };
}

function profileToBirth(profile: FortuneProfileRecord | null): BaziInput | null {
  if (!profile?.birthDate || !profile.birthTime) {
    return null;
  }

  return {
    name: profile.name ?? undefined,
    gender: profile.gender ?? undefined,
    birthDate: profile.birthDate,
    birthTime: profile.birthTime,
    birthPlace: profile.birthPlace ?? undefined,
  };
}

function runLocalTools(input: RunLocalToolsInput, intent: ChatIntent): LocalAiChatResult {
  const profileDetail = input.profile
    ? `已读取会员档案，完整度 ${input.profile.completeness}%。`
    : "尚未填写会员档案。";
  const recentChatDetail =
    input.recentChats.length > 0
      ? `已读取 ${input.recentChats.length} 条近期对话。`
      : "暂无近期对话。";
  const steps: AiChatStep[] = [
    {
      label: "识别问题类型",
      detail: intent === "general" ? "命理咨询 / 泛问题" : `${intent} 工具链`,
    },
    {
      label: "读取会员档案",
      detail: `${profileDetail}${recentChatDetail}`,
    },
  ];
  const toolCalls: AiToolCall[] = [
    {
      name: "intent_classifier",
      label: "意图分类",
      status: "completed",
      result: { intent },
    },
    {
      name: "profile_reader",
      label: "会员档案读取",
      status: input.profile || input.recentChats.length > 0 ? "completed" : "needs_input",
      result: {
        completeness: input.profile?.completeness ?? 0,
        memory: input.profileMemory,
        recentChatCount: input.recentChats.length,
        recentChatMemory: input.recentChatMemory,
        recentChats: buildRecentChatToolItems(input.recentChats),
        recurringTopics: input.profile?.recurringTopics ?? [],
      },
    },
  ];

  if (intent === "tarot") {
    const cards = drawTarot("three_card", input.question, input.userId);
    const reading = buildTarotReading({
      spread: "three_card",
      question: input.question,
      cards,
    });

    toolCalls.push({
      name: "tarot_spread_generator",
      label: "塔罗三牌阵",
      status: "completed",
      result: { cards, reading },
    });
    steps.push(
      { label: "调用命理工具", detail: "已抽取塔罗三牌阵并生成牌面解释。" },
      { label: "生成专属回复", detail: "结合问题、牌面和行动建议组织回答。" },
    );

    return {
      steps,
      toolCalls,
      draftAnswer: [
        reading.summary,
        reading.content,
        "如果你愿意继续追问，可以把问题收窄到一个具体场景，例如“我要不要主动联系对方”。",
      ].join("\n\n"),
    };
  }

  if (intent === "bazi") {
    const birth = parseBirth(input.question) ?? profileToBirth(input.profile);

    if (!birth) {
      toolCalls.push({
        name: "birth_info_checker",
        label: "出生信息校验",
        status: "needs_input",
        result: {
          required: ["出生日期", "出生时间", "出生地"],
        },
      });
      steps.push(
        { label: "调用命理工具", detail: "八字五行需要完整出生信息后才能排盘。" },
        { label: "生成追问", detail: "引导用户补齐公历生日、时间和出生地。" },
      );

      return {
        steps,
        toolCalls,
        draftAnswer:
          "我可以帮你做八字五行方向的初步分析。请补充公历出生日期、出生时间和出生地，例如：1995-08-18 09:30，出生地上海。拿到这些信息后，我会先排四柱，再看五行偏旺偏弱，最后给你行动建议。",
      };
    }

    const chart = calculateBazi(birth);
    const reading = buildBaziReading(chart);

    toolCalls.push({
      name: "bazi_calculator",
      label: "八字五行排盘",
      status: "completed",
      result: { chart, reading },
    });
    steps.push(
      { label: "调用命理工具", detail: "已计算四柱八字并统计五行分布。" },
      { label: "生成专属回复", detail: "结合五行强弱和问题给出行动建议。" },
    );

    return {
      steps,
      toolCalls,
      draftAnswer: reading.content,
    };
  }

  if (intent === "bagua") {
    const chart = generateBagua({
      userId: input.userId,
      question: input.question,
      timeframe: "AI 对话即时问事",
    });
    const reading = buildBaguaReading(chart);

    toolCalls.push({
      name: "bagua_generator",
      label: "八卦问事",
      status: "completed",
      result: { chart, reading },
    });
    steps.push(
      { label: "调用命理工具", detail: "已生成本卦、动爻和变卦。" },
      { label: "生成专属回复", detail: "结合卦象关系和问题类型组织建议。" },
    );

    return {
      steps,
      toolCalls,
      draftAnswer: reading.content,
    };
  }

  if (intent === "palm") {
    if (input.palmImage) {
      toolCalls.push({
        name: "palm_image_checker",
        label: "手相图片校验",
        status: "completed",
        result: {
          state: "已接收手相附图，可进入正式手相分析链路",
          imageId: input.palmImage.id,
          qiniuKey: input.palmImage.qiniuKey,
          contentType: input.palmImage.contentType,
          sizeBytes: input.palmImage.sizeBytes,
          nextAction: "/palm",
        },
      });
      steps.push(
        { label: "调用命理工具", detail: "已校验对话附带的手相图片档案。" },
        { label: "生成专属回复", detail: "给出图片质量提示，并引导进入付费手相报告链路。" },
      );

      return {
        steps,
        toolCalls,
        draftAnswer: [
          "我已经收到你附加的手相图片，并完成了图片档案校验。",
          "在 AI 对话里，我可以先帮你确认这类问题适合走手相分析：正式手相报告会继续使用会员手相额度，若没有额度再消耗星力，不会在普通对话里绕开付费权益。",
          "下一步请进入 /palm 生成手相简析；那里会基于这类图片链路继续做清晰度、掌纹可见度和三条主线解读。",
        ].join("\n\n"),
      };
    }

    toolCalls.push({
      name: "palm_image_checker",
      label: "手相图片校验",
      status: "preview",
      result: {
        state: "请前往手相上传入口提交清晰手掌图片",
      },
    });
    steps.push(
      { label: "调用命理工具", detail: "手相上传会进入七牛云和视觉模型链路。" },
      { label: "生成追问", detail: "引导用户上传清晰手掌图。" },
    );

    return {
      steps,
      toolCalls,
      draftAnswer:
        "这个问题适合走手相上传。正式入口会要求上传左右手清晰照片，并会先校验清晰度、角度和掌纹可见度，再生成生命线、智慧线、感情线等方向的解读。",
    };
  }

  steps.push(
    { label: "调用命理工具", detail: "未触发专用排盘工具，进入通用命理顾问模式。" },
    { label: "生成专属回复", detail: "用追问和行动建议帮助你把问题变清楚。" },
  );

  return {
    steps,
    toolCalls,
    draftAnswer:
      input.profile || input.recentChats.length > 0
        ? `我会先结合你沉淀下来的信息来看：\n${input.profileMemory}\n${input.recentChatMemory}\n\n你现在需要的不是一个绝对结论，而是把关心的主题、时间范围和可行动选项讲清楚。你可以继续补充：这是感情、事业、财务还是家庭问题？你希望看未来多久？你现在手里有哪些选择？`
        : "我先帮你把问题拆开看：你现在需要的不是一个绝对结论，而是把关心的主题、时间范围和可行动选项讲清楚。你可以继续补充：这是感情、事业、财务还是家庭问题？你希望看未来多久？你现在手里有哪些选择？",
  };
}

async function generateWithOpenAIStream(
  prepared: PreparedAiChat,
  handlers: AiChatStreamHandlers,
) {
  const client = getOpenAIClient();
  const model = getDefaultOpenAIModel();

  if (!client) {
    return null;
  }

  const { input, intent, local, profileMemory, recentChatMemory } = prepared;
  let streamedAnswer = "";

  try {
    const stream = await client.responses.create({
      model,
      instructions: `你是玄机 AI 的命理顾问。请用中文回答，语气温和、克制、专业。

内容要求：
- 必须基于后端工具结果回答，不得编造工具没有提供的数据。
- 先给直接判断，再说明关键依据与不确定性，随后给出可执行建议，最后自然地引导下一步追问。
- 可以展示简洁的“推演摘要、判断依据、方案权衡”，但不要输出内部思维链或冗长自言自语。
- 不要给医疗、投资、法律或重大人生决策的确定性建议。

排版要求：
- 使用适合聊天界面的标准 Markdown，不要用代码块包裹整篇回答。
- 短回答直接分段，不要为了形式强行添加标题；较长回答最多使用二级或三级标题。
- 比较两个以上选项、阶段、牌面或五行维度时，优先使用简洁的 Markdown 表格；不适合比较时不要硬凑表格。
- 控制段落长度，列表保持精炼，避免连续堆叠大量标题和符号。`,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                question: input.question,
                intent,
                profileMemory,
                recentChatMemory,
                toolCalls: local.toolCalls,
                draftAnswer: local.draftAnswer,
                responseFormatHint: buildResponseFormatHint(input.question),
              }),
            },
          ],
        },
      ],
      max_output_tokens: 700,
      prompt_cache_key: `xuanji:${input.userId}`,
      stream: true,
    }, {
      signal: handlers.signal,
    });
    let completedAnswer = "";
    let tokensIn: number | undefined;
    let tokensOut: number | undefined;

    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        if (event.delta) {
          streamedAnswer += event.delta;
          handlers.onDelta?.(event.delta);
        }

        continue;
      }

      if (event.type === "response.completed" || event.type === "response.incomplete") {
        completedAnswer = event.response.output_text;
        tokensIn = event.response.usage?.input_tokens;
        tokensOut = event.response.usage?.output_tokens;
        continue;
      }

      if (event.type === "response.failed") {
        throw new Error(event.response.error?.message ?? "OpenAI response failed.");
      }

      if (event.type === "error") {
        throw new Error(event.message || "OpenAI stream failed.");
      }
    }

    const answer = completedAnswer || streamedAnswer;

    if (!answer.trim()) {
      return null;
    }

    if (answer !== streamedAnswer) {
      handlers.onReplace?.(answer);
    }

    const costEstimate = estimateOpenAiCostCents({ model, tokensIn, tokensOut });

    return {
      provider: "openai" as const,
      model,
      answer,
      tokensIn,
      tokensOut,
      costEstimate,
    };
  } catch (error) {
    const aborted =
      handlers.signal?.aborted ||
      (error instanceof Error && error.name === "AbortError");

    if (aborted) {
      if (!streamedAnswer.trim()) {
        throw error;
      }

      const tokensOut = estimateTokens(streamedAnswer);

      return {
        provider: "openai" as const,
        model,
        answer: streamedAnswer,
        tokensOut,
        costEstimate: estimateOpenAiCostCents({ model, tokensOut }),
      };
    }

    if (process.env.NODE_ENV !== "production") {
      const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
      console.warn(`OpenAI response failed; using local AI fallback. ${message}`);
    }

    return null;
  }
}

export async function prepareAiChat(input: RunAiChatInput): Promise<PreparedAiChat> {
  const intent = detectIntent(input.question, input.palmImage);
  const [profile, recentChats] = await Promise.all([
    getFortuneProfile(input.userId),
    getRecentChatSessions(input.userId, 3),
  ]);
  const profileMemory = buildProfileMemory(profile);
  const recentChatMemory = buildRecentChatMemory(recentChats);
  const local = runLocalTools(
    { ...input, profile, profileMemory, recentChats, recentChatMemory },
    intent,
  );

  return {
    input,
    intent,
    profileMemory,
    recentChatMemory,
    recentChatCount: recentChats.length,
    local,
  };
}

async function finalizeAiChatResult(
  prepared: PreparedAiChat,
  generation: {
    provider: "openai" | "local";
    model: string;
    answer: string;
    tokensIn?: number;
    tokensOut?: number;
    costEstimate?: AiCostEstimate;
  },
): Promise<AiChatResult> {
  const { input, intent, local, recentChatCount } = prepared;
  const { answer, provider, model, costEstimate } = generation;
  const tokensIn =
    generation.tokensIn ??
    estimateTokens(`${input.question}\n${JSON.stringify(local.toolCalls)}`);
  const tokensOut = generation.tokensOut ?? estimateTokens(answer);
  const costCents = provider === "local" ? 0 : costEstimate?.costCents;
  const usageLog = await createUsageLog({
    userId: input.userId,
    provider,
    model,
    feature: "chat_basic",
    tokensIn,
    tokensOut,
    costCents,
    metadata: {
      intent,
      palmImageId: input.palmImage?.id,
      recentChatCount,
      toolNames: local.toolCalls.map((tool) => tool.name),
      ...(provider === "local"
        ? {
            costCurrency: "CNY",
            estimatedCost: false,
            costSource: "local_no_model_cost",
          }
        : buildAiCostMetadata(costEstimate)),
    },
  });

  return {
    provider,
    model,
    intent,
    answer,
    steps: local.steps,
    toolCalls: local.toolCalls,
    tokensIn,
    tokensOut,
    costCents,
    costEstimate,
    usageLogId: usageLog.id,
  };
}

export async function runPreparedAiChatStream(
  prepared: PreparedAiChat,
  handlers: AiChatStreamHandlers = {},
): Promise<AiChatResult> {
  const openai = await generateWithOpenAIStream(prepared, handlers);
  const generation =
    openai ??
    ({
      provider: "local" as const,
      model: "local-fortune-tools",
      answer: prepared.local.draftAnswer,
    } satisfies Parameters<typeof finalizeAiChatResult>[1]);

  if (!openai) {
    handlers.onReplace?.(generation.answer);
  }

  return finalizeAiChatResult(prepared, generation);
}

export async function runAiChat(input: RunAiChatInput): Promise<AiChatResult> {
  const prepared = await prepareAiChat(input);
  return runPreparedAiChatStream(prepared);
}
