import "server-only";

import type { ImageUploadRecord } from "@/lib/image-upload-store";
import { buildAiCostMetadata, estimateOpenAiCostCents } from "@/lib/ai-cost";
import { getOpenAIClient, getVisionOpenAIModel } from "@/lib/openai-client";
import { createUsageLog } from "@/lib/usage-log-store";

const palmSignals = [
  {
    line: "生命线",
    reading: "整体线条更强调恢复力和节奏感，适合把精力管理放在第一位。",
  },
  {
    line: "智慧线",
    reading: "思考方式偏向先观察再判断，适合复杂问题拆成小步骤推进。",
  },
  {
    line: "感情线",
    reading: "关系里更需要稳定回应和清晰边界，不适合长期停留在猜测状态。",
  },
] as const;

type PalmAnalyzer = "openai_vision_v1" | "local_palm_fallback_v1";

export type PalmReading = {
  title: string;
  summary: string;
  content: string;
  signals: typeof palmSignals;
  analyzer: PalmAnalyzer;
  provider: "openai" | "local";
  model: string;
  tokensIn?: number;
  tokensOut?: number;
  costCents?: number;
  usageLogId?: string;
  fallbackReason?: string;
};

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 2));
}

function getImageMetadata(image: ImageUploadRecord) {
  return image.metadata && typeof image.metadata === "object"
    ? (image.metadata as { originalName?: string; provider?: string })
    : {};
}

function isPublicImageUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function firstLine(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
}

export function buildPalmReading(input: {
  image: ImageUploadRecord;
  focus?: string;
  fallbackReason?: string;
}): PalmReading {
  const focus = input.focus?.trim() || "当前整体状态";
  const metadata = getImageMetadata(input.image);
  const summary = `围绕「${focus}」，本次手相简析记录了图片 ${metadata.originalName ?? input.image.qiniuKey}，并生成三条主线方向。`;
  const content = [
    summary,
    ...palmSignals.map((signal) => `${signal.line}：${signal.reading}`),
    "行动建议：先把最近最耗能的一件事写下来，再给它设置一个明确的边界或下一步动作。",
    input.fallbackReason
      ? `本次使用本地降级分析：${input.fallbackReason}。配置 OpenAI Key 且图片 URL 可公开访问后，会自动启用视觉模型分析。`
      : "本次使用本地降级分析。配置 OpenAI Key 且图片 URL 可公开访问后，会自动启用视觉模型分析。",
    "本报告仅供娱乐、文化参考和自我探索，不构成医疗、投资、法律或重大人生决策建议。",
  ].join("\n\n");

  return {
    title: "手相简析",
    summary,
    content,
    signals: palmSignals,
    analyzer: "local_palm_fallback_v1",
    provider: "local",
    model: "local-palm-reader",
    tokensIn: estimateTokens(`${focus}\n${input.image.qiniuKey}`),
    tokensOut: estimateTokens(content),
    costCents: 0,
    fallbackReason: input.fallbackReason,
  };
}

function buildPalmVisionPrompt(input: { image: ImageUploadRecord; focus?: string }) {
  const focus = input.focus?.trim() || "当前整体状态";
  const metadata = getImageMetadata(input.image);

  return [
    "请分析这张手掌图片，生成中文手相简析报告。",
    `用户关注主题：${focus}`,
    `图片文件：${metadata.originalName ?? input.image.qiniuKey}`,
    "要求：",
    "1. 先判断图片清晰度、角度、掌纹可见度，如果不足，要明确说明置信度限制。",
    "2. 围绕生命线、智慧线、感情线给出观察，不要声称能做医学诊断或确定预测。",
    "3. 给出 2-3 条可执行建议，语气温和、克制、专业。",
    "4. 输出纯文本，不要 JSON，不要 Markdown 表格。",
    "5. 结尾必须包含娱乐和自我探索用途免责声明。",
  ].join("\n");
}

export async function analyzePalmImage(input: {
  image: ImageUploadRecord;
  focus?: string;
  userId: string;
}): Promise<PalmReading> {
  const client = getOpenAIClient();
  const model = getVisionOpenAIModel();
  const focus = input.focus?.trim() || "当前整体状态";

  if (!client) {
    const fallback = buildPalmReading({
      image: input.image,
      focus,
      fallbackReason: "未配置 OPENAI_API_KEY",
    });
    const usageLog = await createUsageLog({
      userId: input.userId,
      provider: fallback.provider,
      model: fallback.model,
      feature: "palm_reading",
      tokensIn: fallback.tokensIn,
      tokensOut: fallback.tokensOut,
      imageCount: 1,
      costCents: 0,
      metadata: {
        analyzer: fallback.analyzer,
        imageId: input.image.id,
        fallback: true,
        fallbackReason: fallback.fallbackReason,
        costCurrency: "CNY",
        estimatedCost: false,
        costSource: "local_no_model_cost",
      },
    });

    return { ...fallback, usageLogId: usageLog.id };
  }

  if (!isPublicImageUrl(input.image.url)) {
    const fallback = buildPalmReading({
      image: input.image,
      focus,
      fallbackReason: "图片 URL 不是可公开访问的 HTTP(S) 地址",
    });
    const usageLog = await createUsageLog({
      userId: input.userId,
      provider: fallback.provider,
      model: fallback.model,
      feature: "palm_reading",
      tokensIn: fallback.tokensIn,
      tokensOut: fallback.tokensOut,
      imageCount: 1,
      costCents: 0,
      metadata: {
        analyzer: fallback.analyzer,
        imageId: input.image.id,
        fallback: true,
        fallbackReason: fallback.fallbackReason,
        costCurrency: "CNY",
        estimatedCost: false,
        costSource: "local_no_model_cost",
      },
    });

    return { ...fallback, usageLogId: usageLog.id };
  }

  try {
    const prompt = buildPalmVisionPrompt(input);
    const response = await client.responses.create({
      model,
      instructions:
        "你是玄机 AI 的手相图像分析顾问。必须基于用户上传图片可见内容作答，不能编造不可见掌纹细节。中文输出，语气温和、克制、专业。不得给医疗、投资、法律或重大人生决策的确定性建议。",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt,
            },
            {
              type: "input_image",
              image_url: input.image.url,
              detail: "high",
            },
          ],
        },
      ],
      max_output_tokens: 900,
      prompt_cache_key: `xuanji:palm:${input.userId}`,
    });
    const output = response.output_text?.trim();

    if (!output) {
      throw new Error("OpenAI vision response was empty.");
    }

    const summary = firstLine(output) ?? `围绕「${focus}」，已完成手相图片视觉分析。`;
    const content = [
      summary,
      output,
      "本报告仅供娱乐、文化参考和自我探索，不构成医疗、投资、法律或重大人生决策建议。",
    ].join("\n\n");
    const tokensIn = response.usage?.input_tokens;
    const tokensOut = response.usage?.output_tokens;
    const costEstimate = estimateOpenAiCostCents({ model, tokensIn, tokensOut });
    const usageLog = await createUsageLog({
      userId: input.userId,
      provider: "openai",
      model,
      feature: "palm_reading",
      tokensIn,
      tokensOut,
      imageCount: 1,
      costCents: costEstimate?.costCents,
      metadata: {
        analyzer: "openai_vision_v1",
        imageId: input.image.id,
        imageUrlKind: "public_http",
        fallback: false,
        ...buildAiCostMetadata(costEstimate),
      },
    });

    return {
      title: "手相视觉简析",
      summary,
      content,
      signals: palmSignals,
      analyzer: "openai_vision_v1",
      provider: "openai",
      model,
      tokensIn,
      tokensOut,
      costCents: costEstimate?.costCents,
      usageLogId: usageLog.id,
    };
  } catch (error) {
    const fallbackReason =
      error instanceof Error ? error.message.split("\n")[0] : "视觉模型调用失败";

    if (process.env.NODE_ENV !== "production") {
      console.warn(`OpenAI palm vision failed; using local fallback. ${fallbackReason}`);
    }

    const fallback = buildPalmReading({
      image: input.image,
      focus,
      fallbackReason,
    });
    const usageLog = await createUsageLog({
      userId: input.userId,
      provider: fallback.provider,
      model: fallback.model,
      feature: "palm_reading",
      tokensIn: fallback.tokensIn,
      tokensOut: fallback.tokensOut,
      imageCount: 1,
      costCents: 0,
      metadata: {
        analyzer: fallback.analyzer,
        attemptedProvider: "openai",
        attemptedModel: model,
        imageId: input.image.id,
        fallback: true,
        fallbackReason,
        costCurrency: "CNY",
        estimatedCost: false,
        costSource: "local_no_model_cost",
      },
    });

    return { ...fallback, usageLogId: usageLog.id };
  }
}
