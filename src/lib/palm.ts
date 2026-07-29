import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { ImageUploadRecord } from "@/lib/image-upload-store";
import { buildAiCostMetadata, estimateOpenAiCostCents } from "@/lib/ai-cost";
import { getOpenAIClient, getVisionOpenAIModel } from "@/lib/openai-client";
import { toCustomerPalmImageIssue } from "@/lib/palm-image-public";
import { createUsageLog } from "@/lib/usage-log-store";

const palmVisionResultSchema = z.object({
  imageKind: z.enum(["palm", "not_palm", "unclear"]),
  imageAssessment: z.string().trim().min(1).max(500),
  summary: z.string().trim().min(1).max(500),
  signals: z.array(z.object({
    line: z.string().trim().min(1).max(40),
    reading: z.string().trim().min(1).max(500),
  }).strict()).max(6),
  actions: z.array(z.string().trim().min(1).max(300)).max(4),
  disclaimer: z.string().trim().min(1).max(300),
}).strict();

type PalmAnalyzer = "openai_vision_v1" | "local_palm_fallback_v1";
export type PalmImageStatus = "valid_palm" | "invalid_image" | "unverified";
export type PalmSignal = { line: string; reading: string };

export type PalmReading = {
  title: string;
  summary: string;
  content: string;
  signals: PalmSignal[];
  analyzer: PalmAnalyzer;
  imageStatus: PalmImageStatus;
  usable: boolean;
  imageAssessment: string;
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

export function buildPalmReading(input: {
  image: ImageUploadRecord;
  focus?: string;
  fallbackReason?: string;
}): PalmReading {
  const focus = input.focus?.trim() || "当前整体状态";
  const customerIssue = toCustomerPalmImageIssue("unverified");
  const summary = customerIssue.message;
  const content = [
    summary,
    `用户关注主题：${focus}。`,
    customerIssue.imageAssessment,
    "请稍后重试；不要把这次未验证结果当作正式手相报告，也不会据此解读生命线、智慧线或感情线。",
  ].join("\n\n");

  return {
    title: "手相图片待验证",
    summary,
    content,
    signals: [],
    analyzer: "local_palm_fallback_v1",
    imageStatus: "unverified",
    usable: false,
    imageAssessment: customerIssue.imageAssessment,
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
    "先判断图片是否真的是清晰、完整、可分析的手掌照片；只有确认 imageKind=palm 后才生成中文手相简析。",
    `用户关注主题：${focus}`,
    `图片文件：${metadata.originalName ?? input.image.qiniuKey}`,
    "要求：",
    "1. 产品图、风景图、人物照、手背、局部过小、严重模糊或掌纹不可见时，必须标记 not_palm 或 unclear，不得编造掌纹。",
    "2. imageKind 不是 palm 时，signals 必须为空，只说明如何重新拍摄。",
    "3. imageKind=palm 时，围绕图片中真实可见的生命线、智慧线、感情线等给出克制观察，不做医学诊断或确定预测。",
    "4. 给出 2-3 条可执行建议，并明确娱乐、文化参考和自我探索边界。",
  ].join("\n");
}

export async function analyzePalmImage(input: {
  image: ImageUploadRecord;
  focus?: string;
  userId: string;
  abortSignal?: AbortSignal;
}): Promise<PalmReading> {
  input.abortSignal?.throwIfAborted();
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
    const response = await client.responses.parse({
      model,
      instructions:
        "你是玄机 AI 的手掌图片验证与分析顾问。第一职责是识别非手掌、手背、模糊或不可分析图片并拒绝编造；只有真实可见的掌纹才能进入解读。中文输出，语气温和、克制、专业。",
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
      text: {
        format: zodTextFormat(palmVisionResultSchema, "xuanji_palm_vision_result"),
      },
      max_output_tokens: 1200,
      prompt_cache_key: `xuanji:palm:${input.userId}`,
    }, { signal: input.abortSignal });
    input.abortSignal?.throwIfAborted();
    const parsed = response.output_parsed;

    if (!parsed) {
      throw new Error("OpenAI vision response did not contain a structured result.");
    }

    const usable = parsed.imageKind === "palm" && parsed.signals.length > 0;
    const imageStatus: PalmImageStatus = usable ? "valid_palm" : "invalid_image";
    const customerIssue = toCustomerPalmImageIssue("invalid_image");
    const summary = usable ? parsed.summary : customerIssue.message;
    const content = usable
      ? [
          parsed.imageAssessment,
          parsed.summary,
          ...parsed.signals.map((signal) => `${signal.line}：${signal.reading}`),
          parsed.actions.length > 0 ? `行动建议：\n${parsed.actions.map((item) => `- ${item}`).join("\n")}` : "",
          parsed.disclaimer,
        ].filter(Boolean).join("\n\n")
      : [
          summary,
          customerIssue.imageAssessment,
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
        imageStatus,
        imageKind: parsed.imageKind,
        fallback: false,
        ...buildAiCostMetadata(costEstimate),
      },
    });

    return {
      title: usable ? "手相视觉简析" : "手相图片不可用",
      summary,
      content,
      signals: usable ? parsed.signals : [],
      analyzer: "openai_vision_v1",
      imageStatus,
      usable,
      imageAssessment: usable ? parsed.imageAssessment : customerIssue.imageAssessment,
      provider: "openai",
      model,
      tokensIn,
      tokensOut,
      costCents: costEstimate?.costCents,
      usageLogId: usageLog.id,
    };
  } catch (error) {
    if (input.abortSignal?.aborted) throw error;
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
