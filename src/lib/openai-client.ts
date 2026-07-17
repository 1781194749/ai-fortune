import "server-only";

import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";
import OpenAI from "openai";

declare global {
  var xuanjiOpenAIClient: OpenAI | undefined;
  var xuanjiAiSdkOpenAIProvider: OpenAIProvider | undefined;
}

const defaultOpenAIBaseURL = "https://api.openai.com/v1";
const defaultOpenAIUserAgent = "Xuanji-AI/1.0";
type OpenAIEnvironment = Record<string, string | undefined>;

export function getOpenAIBaseURL(env: OpenAIEnvironment = process.env) {
  return env.OPENAI_BASE_URL?.trim().replace(/\/+$/, "") || defaultOpenAIBaseURL;
}

export function getOpenAIUserAgent(env: OpenAIEnvironment = process.env) {
  return env.OPENAI_USER_AGENT?.trim() || defaultOpenAIUserAgent;
}

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  if (!globalThis.xuanjiOpenAIClient) {
    globalThis.xuanjiOpenAIClient = new OpenAI({
      apiKey,
      baseURL: getOpenAIBaseURL(),
      defaultHeaders: {
        "User-Agent": getOpenAIUserAgent(),
      },
    });
  }

  return globalThis.xuanjiOpenAIClient;
}

export function getAiSdkOpenAIProvider() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  if (!globalThis.xuanjiAiSdkOpenAIProvider) {
    globalThis.xuanjiAiSdkOpenAIProvider = createOpenAI({
      apiKey,
      baseURL: getOpenAIBaseURL(),
      headers: {
        "User-Agent": getOpenAIUserAgent(),
      },
    });
  }

  return globalThis.xuanjiAiSdkOpenAIProvider;
}

export function getDefaultOpenAIModel(env: OpenAIEnvironment = process.env) {
  return env.OPENAI_DEFAULT_MODEL?.trim() || "gpt-5.4";
}

export function getPremiumOpenAIModel(env: OpenAIEnvironment = process.env) {
  return env.OPENAI_PREMIUM_MODEL?.trim() || getDefaultOpenAIModel(env);
}

export function getVisionOpenAIModel(env: OpenAIEnvironment = process.env) {
  return env.OPENAI_VISION_MODEL?.trim() || getDefaultOpenAIModel(env);
}
