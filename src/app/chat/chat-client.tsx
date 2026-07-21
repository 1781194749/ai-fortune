"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type ChatStatus } from "ai";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  Camera,
  Check,
  ChevronRight,
  Coins,
  Copy,
  Database,
  History,
  LifeBuoy,
  Loader2,
  Menu,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  ScrollText,
  Square,
  Trash2,
  UserRound,
  WandSparkles,
  Workflow,
  X,
} from "lucide-react";
import { XuanjiMark } from "@/app/_components/xuanji-mark";
import { InviteCopyButton } from "@/app/_components/invite-copy-button";
import { ChatConclusionCard, ChatRitual } from "@/app/chat/chat-ritual";
import { ChatServiceSelector } from "@/app/chat/chat-service-selector";
import { MarkdownMessage } from "@/app/chat/markdown-message";
import { LogoutButton } from "@/app/member/logout-button";
import type { AiToolCall, ChatAnswerShape, ChatConclusion } from "@/lib/ai-orchestrator";
import type { RecentChatSession } from "@/lib/ai-session-store";
import {
  inferChatService,
  type ChatReadingMethod,
  type ChatServiceMode,
} from "@/lib/chat-service";
import type {
  ChatCompleteData,
  ChatErrorData,
  ChatProgressData,
  ChatStartData,
  ChatSuccessData,
  ChatTrace,
  XuanjiChatMessage,
} from "@/lib/chat-ui-message";
import type { FortuneAnswer } from "@/lib/prompts/contracts";

type SuccessChatResponse = ChatSuccessData;

type UploadToken = {
  mode: "qiniu" | "mock";
  key: string;
  token: string;
  uploadUrl: string | null;
  publicUrl: string;
  expiresAt: string;
};

type PalmImage = {
  id: string;
  qiniuKey: string;
  url: string;
  contentType: string;
  sizeBytes: number;
};

type ChatProfileSummary = {
  name: string | null;
  completeness: number;
  memorySummary: string | null;
  zodiac: string | null;
  wuxingSummary: string | null;
  topics: string[];
};

type ChatAccountSummary = {
  email: string;
  tier: string;
  canAccessAdmin: boolean;
};

type ChatTranscriptResponse = {
  ok: true;
  chat: {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messages: Array<{
      id: string;
      role: "user" | "assistant";
      content: string;
      createdAt: string;
      intent?: string | null;
      toolNames?: string[];
      serviceMode?: ChatServiceMode;
      answerShape?: ChatAnswerShape;
      answerStatus?: FortuneAnswer["status"];
      conclusion?: ChatConclusion;
    }>;
  };
};

type ChatTurn = {
  id: string;
  question: string;
  answer: string;
  state: "loading" | "streaming" | "complete" | "error";
  result: SuccessChatResponse | null;
  trace: ChatTrace | null;
  progress: ChatProgressData[];
  serviceMode: ChatServiceMode;
  errorData?: ChatErrorData;
  errorMessage?: string;
  historyMeta?: {
    intent: string | null;
    toolNames: string[];
    updatedAt: string;
    serviceMode?: ChatServiceMode;
    answerShape?: ChatAnswerShape;
    answerStatus?: FortuneAnswer["status"];
    conclusion?: ChatConclusion;
  };
};

const suggestedQuestions = [
  "我最近事业有点迷茫，适合换方向吗？",
  "这段关系接下来三个月会怎么发展？",
  "我手里的两个选择，哪一个更适合现在的我？",
  "结合我的档案，看看今年下半年的重点节奏。",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNestedRecord(value: unknown, key: string) {
  if (!isRecord(value)) {
    return null;
  }

  const next = value[key];
  return isRecord(next) ? next : null;
}

function getNestedArray(value: unknown, key: string) {
  if (!isRecord(value)) {
    return [];
  }

  const next = value[key];
  return Array.isArray(next) ? next : [];
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function readJson<T>(response: Response) {
  const data = (await response.json()) as T & { ok: boolean; message?: string };

  if (!response.ok || data.ok === false) {
    throw new Error(data.message ?? "请求失败。");
  }

  return data;
}

function getChatErrorDetails(error: Error) {
  const rawMessage = error.message.trim();
  const jsonStart = rawMessage.indexOf("{");
  const jsonMessage = jsonStart >= 0 ? rawMessage.slice(jsonStart) : rawMessage;

  try {
    const data = JSON.parse(jsonMessage) as {
      message?: unknown;
      balance?: unknown;
    };

    return {
      message: typeof data.message === "string" ? data.message : "请求没有完成，请稍后重试。",
      balance: typeof data.balance === "number" ? data.balance : undefined,
    };
  } catch {
    return {
      message: rawMessage.startsWith("{") ? "请求没有完成，请稍后重试。" : rawMessage,
      balance: undefined,
    };
  }
}

function looksLikeBackendErrorText(text: string) {
  const trimmed = text.trim();

  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return false;
  }

  try {
    const data = JSON.parse(trimmed) as { ok?: unknown; code?: unknown; message?: unknown };
    return data.ok === false || typeof data.code === "string" || typeof data.message === "string";
  } catch {
    return false;
  }
}

function toolSummary(tool: AiToolCall) {
  if (tool.name === "intent_classifier") {
    const intent = textValue(isRecord(tool.result) ? tool.result.intent : "");
    return intent ? `已识别为 ${getIntentLabel(intent)}咨询。` : "已完成问题类型识别。";
  }

  if (tool.name === "profile_reader") {
    const completeness = isRecord(tool.result) ? tool.result.completeness : undefined;
    return typeof completeness === "number" ? `已读取档案，完整度 ${completeness}%。` : "已尝试读取会员档案。";
  }

  if (tool.name === "tarot_spread_generator") {
    const cards = getNestedArray(tool.result, "cards");
    const spreadTitle = textValue(isRecord(tool.result) ? tool.result.spreadTitle : "") || "塔罗牌阵";
    const cardNames = cards
      .map((card) => (isRecord(card) ? textValue(card.card) : ""))
      .filter(Boolean);
    return cardNames.length > 0 ? `${spreadTitle}：${cardNames.join("、")}。` : `已完成${spreadTitle}。`;
  }

  if (tool.name === "bazi_calculator") {
    const chart = getNestedRecord(tool.result, "chart");
    const dayMaster = getNestedRecord(chart, "dayMaster");
    const bazi = getNestedArray(chart, "bazi").map(String);
    const strength = textValue(dayMaster?.strengthLabel);
    const useful = getNestedArray(dayMaster, "usefulElements").map(String).join("、");
    return bazi.length > 0
      ? `四柱：${bazi.join("、")}。${strength ? `日主${strength}` : ""}${useful ? `，喜用 ${useful}` : ""}。`
      : "已完成八字命盘详析。";
  }

  if (tool.name === "birth_info_checker") {
    const required = getNestedArray(tool.result, "required").map(String);
    return required.length > 0 ? `还需要补充：${required.join("、")}。` : "出生信息还不完整。";
  }

  if (tool.name === "bagua_generator") {
    const chart = getNestedRecord(tool.result, "chart");
    const mainHexagram = getNestedRecord(chart, "mainHexagram");
    const changedHexagram = getNestedRecord(chart, "changedHexagram");
    const mainName = textValue(mainHexagram?.name);
    const changedName = textValue(changedHexagram?.name);
    const mainNumber = typeof mainHexagram?.number === "number" ? String(mainHexagram.number) : textValue(mainHexagram?.number);
    const changedNumber = typeof changedHexagram?.number === "number" ? String(changedHexagram.number) : textValue(changedHexagram?.number);
    return mainName && changedName
      ? `本卦${mainNumber ? `第 ${mainNumber} 卦 ` : " "}${mainName}，变卦${changedNumber ? `第 ${changedNumber} 卦 ` : " "}${changedName}。`
      : "已完成六十四卦问事。";
  }

  if (tool.name === "palm_image_checker") {
    const imageId = textValue(isRecord(tool.result) ? tool.result.imageId : "");
    return imageId ? "手相图片已完成校验。" : "已进入手相图片校验链路。";
  }

  return "工具已返回结果。";
}

function hasProcessTrace(trace: ChatTrace | null) {
  return Boolean(trace && (trace.steps.length > 0 || trace.toolCalls.length > 0));
}

function formatChatTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getIntentLabel(intent: string | null) {
  if (intent === "tarot") {
    return "塔罗";
  }

  if (intent === "bazi") {
    return "八字";
  }

  if (intent === "bagua") {
    return "八卦";
  }

  if (intent === "palm") {
    return "手相";
  }

  return "通用";
}

function createRecentChatFromResult(question: string, data: SuccessChatResponse): RecentChatSession {
  const now = new Date().toISOString();
  const title = question.length > 28 ? `${question.slice(0, 28)}...` : question;

  return {
    id: data.chatSessionId,
    title,
    question,
    answer: data.answer,
    intent: data.intent,
    provider: data.provider,
    model: data.model,
    toolNames: data.toolCalls.map((tool) => tool.name),
    tokensIn: data.tokensIn ?? null,
    tokensOut: data.tokensOut ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

type ChatMessagePart = XuanjiChatMessage["parts"][number];
type ChatProgressPart = Extract<ChatMessagePart, { type: "data-chatProgress" }>;
type ChatStartPart = Extract<ChatMessagePart, { type: "data-chatStart" }>;
type ChatCompletePart = Extract<ChatMessagePart, { type: "data-chatComplete" }>;
type ChatErrorPart = Extract<ChatMessagePart, { type: "data-chatError" }>;

function getMessageText(message: XuanjiChatMessage | undefined) {
  return message?.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("") ?? "";
}

function getMessagePart<T extends ChatMessagePart["type"]>(
  message: XuanjiChatMessage | undefined,
  type: T,
) {
  return message?.parts.find((part) => part.type === type) as
    | Extract<ChatMessagePart, { type: T }>
    | undefined;
}

function getMessageParts<T extends ChatMessagePart["type"]>(
  message: XuanjiChatMessage | undefined,
  type: T,
) {
  return (message?.parts.filter((part) => part.type === type) ?? []) as Array<
    Extract<ChatMessagePart, { type: T }>
  >;
}

function createTrace(
  start: ChatStartData | undefined,
  complete: ChatCompleteData | undefined,
): ChatTrace | null {
  const source = complete ?? start;

  if (!source) {
    return null;
  }

  return {
    intent: source.intent,
    steps: source.steps,
    toolCalls: source.toolCalls,
    contextSummary: source.contextSummary,
    answerShape: source.answerShape,
    qualityTrace: source.qualityTrace,
  };
}

function buildChatTurns(
  messages: XuanjiChatMessage[],
  status: ChatStatus,
  error: Error | undefined,
) {
  const turns: ChatTurn[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const userMessage = messages[index];

    if (userMessage.role !== "user") {
      continue;
    }

    const nextMessage = messages[index + 1];
    const assistantMessage = nextMessage?.role === "assistant" ? nextMessage : undefined;
    const isLatest = assistantMessage
      ? index + 1 === messages.length - 1
      : index === messages.length - 1;
    const startPart = getMessagePart(assistantMessage, "data-chatStart") as ChatStartPart | undefined;
    const completePart = getMessagePart(assistantMessage, "data-chatComplete") as ChatCompletePart | undefined;
    const errorPart = getMessagePart(assistantMessage, "data-chatError") as ChatErrorPart | undefined;
    const progressParts = getMessageParts(assistantMessage, "data-chatProgress") as ChatProgressPart[];
    const progress = progressParts.map((part) => part.data).toSorted((a, b) => a.sequence - b.sequence);
    const rawAnswer = getMessageText(assistantMessage);
    const safeAnswer = looksLikeBackendErrorText(rawAnswer) ? "" : rawAnswer;
    let state: ChatTurn["state"] = "complete";

    if (completePart) {
      state = "complete";
    } else if (errorPart) {
      state = "error";
    } else if (!assistantMessage && isLatest && status === "submitted") {
      state = "loading";
    } else if (isLatest && status === "streaming") {
      state = "streaming";
    } else if (isLatest && status === "error") {
      state = "error";
    }

    turns.push({
      id: userMessage.id,
      question: getMessageText(userMessage),
      answer: safeAnswer,
      state,
      result: completePart?.data ?? null,
      trace: createTrace(startPart?.data, completePart?.data),
      progress,
      serviceMode:
        completePart?.data.serviceMode ??
        startPart?.data.serviceMode ??
        progress.at(-1)?.serviceMode ??
        assistantMessage?.metadata?.history?.serviceMode ??
        "quick",
      errorData: errorPart?.data,
      errorMessage:
        errorPart?.data.message ??
        (state === "error" && error
          ? getChatErrorDetails(error).message
          : state === "error"
            ? "回答生成中断，请稍后再试。"
            : undefined),
      historyMeta: assistantMessage?.metadata?.history,
    });

    if (assistantMessage) {
      index += 1;
    }
  }

  return turns;
}

function ToolTrace({
  trace,
  result,
}: {
  trace: ChatTrace | null;
  result: SuccessChatResponse | null;
}) {
  const processSource = result ?? trace;

  if (!processSource) {
    return null;
  }

  return (
    <details
      className="group mb-5 overflow-hidden rounded-xl border border-transparent transition-colors open:border-[#2a2b25] open:bg-[#10110e]"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-1 py-2 text-sm text-[#aaa294] marker:content-none group-open:px-3">
        <span className="flex size-6 items-center justify-center text-[#79b8b1]">
          <BadgeCheck size={14} aria-hidden="true" />
        </span>
        <span className="font-medium text-[#cfc6b8]">推演依据</span>
        <span className="rounded-full border border-[#323128] px-2 py-0.5 text-[10px] text-[#80796e]">
          {getIntentLabel(processSource.intent)} · {processSource.toolCalls.length} 项
        </span>
        <ChevronRight size={15} className="ml-auto transition group-open:rotate-90" aria-hidden="true" />
      </summary>

      <div className="border-t border-[#24251f] px-4 py-4">
        <div className="space-y-3">
          {processSource.steps.map((step, index) => (
            <div key={`${step.label}-${index}`} className="flex items-start gap-3">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#79b8b1]" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#c8c0b2]">{step.label}</p>
                <p className="mt-1 text-xs leading-5 text-[#6f6a60]">{step.detail}</p>
              </div>
            </div>
          ))}
        </div>

        {processSource.toolCalls.length > 0 ? (
          <div className="mt-5 space-y-2 border-t border-[#24251f] pt-4">
            {processSource.toolCalls.map((tool) => (
              <details key={`${tool.name}-${tool.label}`} className="rounded-xl border border-[#292a24] bg-[#0d0e0c]">
                <summary className="flex list-none items-center gap-3 px-3 py-2.5 marker:content-none">
                  <WandSparkles size={14} className="text-[#c9a35f]" aria-hidden="true" />
                  <span className="text-xs font-medium text-[#c8c0b2]">{tool.label}</span>
                  <span className="ml-auto text-[10px] text-[#6f6a60]">{tool.status === "completed" ? "已完成" : "待补充"}</span>
                </summary>
                <div className="border-t border-[#24251f] px-3 py-3">
                  <p className="text-xs leading-6 text-[#8f887b]">{toolSummary(tool)}</p>
                </div>
              </details>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function ConversationTurn({
  turn,
  copiedId,
  retrying,
  reportingFeedback,
  onCopy,
  onRetry,
  onLightweight,
  onFeedback,
  onFollowUp,
}: {
  turn: ChatTurn;
  copiedId: string | null;
  retrying: boolean;
  reportingFeedback: boolean;
  onCopy: (turn: ChatTurn) => void;
  onRetry: (turn: ChatTurn) => void;
  onLightweight: (turn: ChatTurn) => void;
  onFeedback: (turn: ChatTurn) => void;
  onFollowUp: (question: string) => void;
}) {
  const answerShape = turn.result?.answerShape ?? turn.trace?.answerShape ?? turn.historyMeta?.answerShape;
  const showRitual = answerShape !== "identity_boundary" && answerShape !== "missing_info";

  return (
    <article className="xuanji-chat-turn py-7 sm:py-9">
      <div className="ml-auto max-w-[88%] rounded-[22px] rounded-br-md bg-[#292a24] px-4 py-3 text-[15px] leading-7 text-[#eee6d8] sm:max-w-[78%] sm:px-5">
        {turn.question}
      </div>

      <div className="mt-7 flex gap-3 sm:gap-4">
        <XuanjiMark className="size-8" />
        <div className="min-w-0 flex-1 pt-0.5">
          {turn.state === "loading" || turn.state === "streaming" ? (
            <>
              {showRitual ? (
                <ChatRitual progress={turn.progress} intent={turn.trace?.intent ?? null} loading />
              ) : null}
              {turn.answer ? (
                <div
                  aria-label="正在流式生成回答"
                  aria-busy="true"
                >
                  <MarkdownMessage content={turn.answer} />
                  <span className="mt-1 inline-block h-[1.05em] w-0.5 animate-pulse bg-[#c9a35f] align-middle" />
                </div>
              ) : (
                <div className="space-y-2.5" aria-label="正在生成回答">
                  <span className="block h-3 w-[78%] animate-pulse rounded-full bg-[#292a24]" />
                  <span className="block h-3 w-[62%] animate-pulse rounded-full bg-[#292a24]" />
                  <span className="block h-3 w-[45%] animate-pulse rounded-full bg-[#292a24]" />
                </div>
              )}
            </>
          ) : null}

          {turn.state === "error" ? (
            <div className="space-y-4">
              {showRitual && turn.progress.length > 0 ? (
                <ChatRitual progress={turn.progress} intent={turn.trace?.intent ?? null} loading={false} />
              ) : null}
              {turn.answer ? (
                <MarkdownMessage content={turn.answer} />
              ) : null}
              <div className="rounded-lg border border-[#b84b37]/30 bg-[#1b100d] px-4 py-4 text-sm leading-7 text-[#d99787]">
                <p className="font-medium text-[#efb0a1]">
                  {turn.errorData?.refunded
                    ? "本轮没有生成成功，已退回本次星力。"
                    : "本轮没有生成成功，也没有产生可用回答。"}
                </p>
                <p className="mt-1 text-xs leading-6 text-[#a9796d]">{turn.errorMessage ?? "服务临时中断，可以保留当前问题重新发起。"}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onRetry(turn)}
                    disabled={retrying}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-[#b84b37]/35 px-3 text-xs font-medium text-[#f1b1a2] transition hover:border-[#e2907d]/55 hover:bg-[#b84b37]/10 disabled:opacity-45"
                  >
                    <RefreshCw size={13} className={retrying ? "animate-spin" : ""} aria-hidden="true" />
                    重新生成
                  </button>
                  {turn.serviceMode !== "quick" ? (
                    <button
                      type="button"
                      onClick={() => onLightweight(turn)}
                      disabled={retrying}
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-[#c9a35f]/35 px-3 text-xs font-medium text-[#e4c98e] transition hover:border-[#c9a35f]/60 hover:bg-[#c9a35f]/8 disabled:opacity-45"
                    >
                      <WandSparkles size={13} aria-hidden="true" />
                      用轻量模式回答
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onFeedback(turn)}
                    disabled={reportingFeedback}
                    className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-medium text-[#9a9387] transition hover:bg-[#24201d] hover:text-[#d7cfc2] disabled:opacity-45"
                  >
                    <LifeBuoy size={13} aria-hidden="true" />
                    {reportingFeedback ? "提交中" : "反馈问题"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {turn.state === "complete" ? (
            <>
              {showRitual && turn.progress.length > 0 ? (
                <ChatRitual progress={turn.progress} intent={turn.result?.intent ?? turn.trace?.intent ?? null} loading={false} />
              ) : null}
              {hasProcessTrace(turn.result ?? turn.trace) ? (
                <ToolTrace
                  trace={turn.trace}
                  result={turn.result}
                />
              ) : null}
              {turn.historyMeta ? (
                <div className="mb-4 flex flex-wrap items-center gap-2 text-[10px] text-[#777168]">
                  <span className="rounded-full border border-[#323128] px-2.5 py-1">历史对话</span>
                  <span>{getIntentLabel(turn.historyMeta.intent)}</span>
                  <span>·</span>
                  <span>{turn.historyMeta.toolNames.length} 个工具</span>
                  <span>·</span>
                  <span>{formatChatTime(turn.historyMeta.updatedAt)}</span>
                </div>
              ) : null}
              {turn.result?.turnStatus === "PARTIAL" ? (
                <div className="mb-4 border-l-2 border-[#c9a35f] pl-3 text-xs leading-6 text-[#aaa294]">
                  本轮生成中途停止，当前可见内容已保存并按一轮结算。
                </div>
              ) : null}
              <MarkdownMessage content={turn.answer} />
              {(turn.result?.conclusion ?? turn.historyMeta?.conclusion) &&
              (turn.result?.answerShape ?? turn.historyMeta?.answerShape) !== "identity_boundary" ? (
                <ChatConclusionCard
                  conclusion={(turn.result?.conclusion ?? turn.historyMeta?.conclusion)!}
                  serviceMode={turn.serviceMode}
                  answerShape={turn.result?.answerShape ?? turn.historyMeta?.answerShape}
                  answerStatus={turn.result?.structuredAnswer.status ?? turn.historyMeta?.answerStatus}
                  onFollowUp={onFollowUp}
                />
              ) : null}
              <div className="mt-5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onCopy(turn)}
                  className="flex size-8 items-center justify-center rounded-full text-[#777168] transition hover:bg-[#1a1b17] hover:text-[#d5cdbf]"
                  aria-label="复制回答"
                >
                  {copiedId === turn.id ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ChatSidebar({
  recentChats,
  activeChatId,
  balance,
  account,
  className,
  onNewChat,
  onSelectChat,
  onRenameChat,
  onDeleteChat,
  onOpenProfile,
}: {
  recentChats: RecentChatSession[];
  activeChatId: string | null;
  balance: number;
  account: ChatAccountSummary;
  className?: string;
  onNewChat: () => void;
  onSelectChat: (chat: RecentChatSession) => void;
  onRenameChat: (chat: RecentChatSession, title: string) => Promise<boolean>;
  onDeleteChat: (chat: RecentChatSession) => Promise<boolean>;
  onOpenProfile: () => void;
}) {
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [pendingChatId, setPendingChatId] = useState<string | null>(null);

  function startEditing(chat: RecentChatSession) {
    setEditingChatId(chat.id);
    setDraftTitle(chat.title);
  }

  async function submitRename(chat: RecentChatSession) {
    setPendingChatId(chat.id);
    const ok = await onRenameChat(chat, draftTitle);
    setPendingChatId(null);

    if (ok) {
      setEditingChatId(null);
      setDraftTitle("");
    }
  }

  async function submitDelete(chat: RecentChatSession) {
    setPendingChatId(chat.id);
    await onDeleteChat(chat);
    setPendingChatId(null);
  }

  return (
    <aside className={`h-full w-[282px] shrink-0 flex-col border-r border-[#24251f] bg-[#0d0e0c] ${className ?? ""}`}>
      <div className="flex h-[62px] items-center justify-between px-3">
        <Link href="/" className="flex items-center gap-2.5 px-2" aria-label="返回玄机 AI 首页">
          <XuanjiMark className="size-8" />
          <span className="font-ritual text-base tracking-[0.06em] text-[#eee6d8]">玄机 AI</span>
        </Link>
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onNewChat}
          className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-[#d5cdbf] transition hover:bg-[#191a16]"
        >
          <Plus size={17} aria-hidden="true" />
          新的问事
        </button>
      </div>

      <div className="xuanji-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <div className="mb-2 flex items-center gap-2 px-3 text-[11px] tracking-[0.14em] text-[#67635b]">
          <History size={12} aria-hidden="true" />
          最近对话
        </div>
        <div className="space-y-1">
          {recentChats.length > 0 ? (
            recentChats.map((chat) => {
              const editing = editingChatId === chat.id;
              const pending = pendingChatId === chat.id;

              return (
                <div
                  key={chat.id}
                  className={`group rounded-xl transition ${
                    activeChatId === chat.id ? "bg-[#1d1e1a] text-[#eee6d8]" : "text-[#9a9387] hover:bg-[#171814] hover:text-[#d5cdbf]"
                  }`}
                >
                  {editing ? (
                    <form
                      className="grid grid-cols-[1fr_auto_auto] items-center gap-1 px-2 py-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void submitRename(chat);
                      }}
                    >
                      <input
                        value={draftTitle}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        maxLength={40}
                        autoFocus
                        className="h-8 min-w-0 rounded-lg border border-[#34352e] bg-[#0d0e0c] px-2 text-xs text-[#eee6d8] outline-none focus:border-[#c9a35f]/55"
                      />
                      <button
                        type="submit"
                        disabled={pending || draftTitle.trim().length === 0}
                        className="flex size-8 items-center justify-center rounded-lg text-[#79b8b1] transition hover:bg-[#20211c] disabled:opacity-40"
                        aria-label="保存对话标题"
                      >
                        <Check size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setEditingChatId(null);
                          setDraftTitle("");
                        }}
                        className="flex size-8 items-center justify-center rounded-lg text-[#777168] transition hover:bg-[#20211c] hover:text-[#d5cdbf] disabled:opacity-40"
                        aria-label="取消重命名"
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </form>
                  ) : (
                    <div className="grid grid-cols-[1fr_auto] items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onSelectChat(chat)}
                        className="min-w-0 px-3 py-2.5 text-left"
                      >
                        <span className="block truncate text-sm">{chat.title}</span>
                        <span className="mt-1 block text-[10px] text-[#5f5b53]">
                          {getIntentLabel(chat.intent)} · {formatChatTime(chat.updatedAt)}
                        </span>
                      </button>
                      <div className="flex items-center gap-0.5 pr-1 opacity-100 md:opacity-0 md:transition md:group-hover:opacity-100">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => startEditing(chat)}
                          className="flex size-8 items-center justify-center rounded-lg text-[#67635b] transition hover:bg-[#20211c] hover:text-[#efd9a6] disabled:opacity-40"
                          aria-label="重命名对话"
                        >
                          <Pencil size={13} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => void submitDelete(chat)}
                          className="flex size-8 items-center justify-center rounded-lg text-[#67635b] transition hover:bg-[#20211c] hover:text-[#d98572] disabled:opacity-40"
                          aria-label="删除对话"
                        >
                          <Trash2 size={13} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <p className="px-3 py-4 text-xs leading-6 text-[#67635b]">完成第一次问事后，对话会沉淀在这里。</p>
          )}
        </div>
      </div>

      <div className="border-t border-[#24251f] p-3">
        <Link
          href="/reports/deep"
          className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm text-[#8f887b] transition hover:bg-[#191a16] hover:text-[#d5cdbf]"
        >
          <ScrollText size={16} aria-hidden="true" />
          历史报告
        </Link>
        <button
          type="button"
          onClick={onOpenProfile}
          className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[#191a16]"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-[#c9a35f]/10 text-[#efd9a6]">
            <UserRound size={15} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs text-[#c8c0b2]">{account.email}</span>
            <span className="mt-0.5 block text-[10px] text-[#67635b]">{account.tier} · {balance} 星力</span>
          </span>
          <ChevronRight size={14} className="text-[#5f5b53]" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

function ProfileDrawer({
  open,
  balance,
  profile,
  account,
  inviteUrl,
  onClose,
}: {
  open: boolean;
  balance: number;
  profile: ChatProfileSummary;
  account: ChatAccountSummary;
  inviteUrl: string;
  onClose: () => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="关闭档案抽屉"
            className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="用户档案"
            className="fixed bottom-0 right-0 top-0 z-[60] w-full max-w-[390px] border-l border-[#323128] bg-[#0d0e0c] p-5 shadow-2xl"
            initial={{ x: reduceMotion ? 0 : "100%" }}
            animate={{ x: 0 }}
            exit={{ x: reduceMotion ? 0 : "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
          >
            <div className="flex items-center justify-between border-b border-[#24251f] pb-5">
              <div>
                <p className="text-xs tracking-[0.2em] text-[#80796e]">个人档案</p>
                <h2 className="mt-2 font-ritual text-2xl text-[#eee6d8]">{profile.name || "你的命盘"}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex size-9 items-center justify-center rounded-full text-[#8f887b] transition hover:bg-[#1a1b17] hover:text-[#eee6d8]"
                aria-label="关闭"
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>

            <div className="xuanji-scrollbar h-[calc(100%-68px)] overflow-y-auto py-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[#2a2b25] bg-[#11120f] p-4">
                  <Coins size={17} className="text-[#c9a35f]" aria-hidden="true" />
                  <p className="mt-3 text-xs text-[#777168]">星力余额</p>
                  <p className="mt-1 text-2xl text-[#eee6d8]">{balance}</p>
                </div>
                <div className="rounded-2xl border border-[#2a2b25] bg-[#11120f] p-4">
                  <Database size={17} className="text-[#79b8b1]" aria-hidden="true" />
                  <p className="mt-3 text-xs text-[#777168]">档案完整度</p>
                  <p className="mt-1 text-2xl text-[#eee6d8]">{profile.completeness}%</p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-[#2a2b25] bg-[#11120f] p-4">
                <p className="text-xs text-[#777168]">命盘摘要</p>
                <div className="mt-3 space-y-2 text-sm text-[#c8c0b2]">
                  <p>{profile.zodiac ? `生肖：${profile.zodiac}` : "生肖：待生成"}</p>
                  <p>{profile.wuxingSummary ?? "五行摘要：补充准确时辰后生成"}</p>
                </div>
              </div>

              {profile.memorySummary ? (
                <div className="mt-4 rounded-2xl border border-[#2a2b25] bg-[#11120f] p-4">
                  <p className="text-xs text-[#777168]">AI 记忆</p>
                  <p className="mt-3 text-sm leading-7 text-[#aaa294]">{profile.memorySummary}</p>
                </div>
              ) : null}

              {profile.topics.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {profile.topics.map((topic) => (
                    <span key={topic} className="rounded-full border border-[#2c7b78]/30 bg-[#2c7b78]/8 px-3 py-1.5 text-xs text-[#79b8b1]">
                      {topic}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-6 space-y-2 border-t border-[#24251f] pt-5">
                <Link href="/onboarding?edit=1" className="flex h-11 items-center justify-between rounded-xl px-3 text-sm text-[#c8c0b2] transition hover:bg-[#191a16]">
                  完善命理档案
                  <ChevronRight size={15} aria-hidden="true" />
                </Link>
                <InviteCopyButton
                  inviteUrl={inviteUrl}
                  label="邀请好友得星力"
                  className="flex h-11 w-full items-center gap-3 rounded-xl border border-[#3c8b72]/25 bg-[#3c8b72]/8 px-3 text-sm text-[#8ad5bd] transition hover:border-[#8ad5bd]/45 hover:bg-[#3c8b72]/12"
                />
                <Link href="/reports/deep" className="flex h-11 items-center justify-between rounded-xl px-3 text-sm text-[#c8c0b2] transition hover:bg-[#191a16]">
                  深度报告
                  <ChevronRight size={15} aria-hidden="true" />
                </Link>
                <Link href="/member" className="flex h-11 items-center justify-between rounded-xl px-3 text-sm text-[#c8c0b2] transition hover:bg-[#191a16]">
                  个人中心
                  <span className="text-xs text-[#67635b]">{account.tier}</span>
                </Link>
                {account.canAccessAdmin ? (
                  <Link
                    href="/admin"
                    className="flex h-11 items-center justify-between rounded-xl border border-[#c9a35f]/25 bg-[#c9a35f]/8 px-3 text-sm text-[#efd9a6] transition hover:border-[#c9a35f]/45 hover:bg-[#c9a35f]/12"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Workflow size={15} aria-hidden="true" />
                      平台后台
                    </span>
                    <ChevronRight size={15} aria-hidden="true" />
                  </Link>
                ) : null}
                <LogoutButton variant="menu" />
              </div>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function EmptyState({
  profile,
  inviteUrl,
  onSuggestion,
}: {
  profile: ChatProfileSummary;
  inviteUrl: string;
  onSuggestion: (question: string) => void;
}) {
  const hasProfile = Boolean(profile.name) || profile.completeness > 0;

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-1 py-12 text-center">
      <XuanjiMark className="size-12" />
      <h1 className="mt-5 font-ritual text-3xl text-[#eee6d8] sm:text-4xl">
        {profile.name ? `${profile.name}，想从哪里开始？` : "今天想问什么？"}
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-7 text-[#8f887b]">
        {hasProfile
          ? "我已经记下你的基础信息了。你可以直接问一个具体问题，比如事业选择、感情关系、财运节奏，或者近期某个决定。"
          : "可以先直接问一个具体问题，比如事业选择、感情关系、财运节奏，或者近期某个决定。档案不必现在填写，后面也能补。"}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {!hasProfile ? (
          <Link
            href="/onboarding?edit=1"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#c9a35f]/35 bg-[#c9a35f]/10 px-5 text-sm font-medium text-[#efd9a6] transition hover:border-[#c9a35f]/55 hover:bg-[#c9a35f]/15"
          >
            <UserRound size={15} aria-hidden="true" />
            补充命理档案
          </Link>
        ) : null}
        <InviteCopyButton
          inviteUrl={inviteUrl}
          label="邀请好友得 50 星力"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#3c8b72]/45 bg-[#3c8b72]/10 px-5 text-sm font-medium text-[#8ad5bd] transition hover:border-[#8ad5bd]/65 hover:bg-[#3c8b72]/16 hover:text-[#d7fff1]"
        />
      </div>
      <div className="mt-7 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
        {suggestedQuestions.map((question) => (
          <button
            key={question}
            type="button"
            onClick={() => onSuggestion(question)}
            className="rounded-2xl border border-[#2a2b25] bg-[#11120f] px-4 py-3 text-left text-sm leading-6 text-[#aaa294] transition hover:border-[#c9a35f]/30 hover:bg-[#151611] hover:text-[#ded6c8]"
          >
            {question}
          </button>
        ))}
      </div>
      <div className="mt-7 inline-flex items-center gap-2 text-xs text-[#67635b]">
        <Workflow size={13} aria-hidden="true" />
        直接提问，系统会自动选择推演方式
      </div>
    </div>
  );
}

function AttachmentPreview({
  palmFile,
  palmImage,
  previewUrl,
  uploadConsent,
  busy,
  onConsentChange,
  onRemove,
}: {
  palmFile: File | null;
  palmImage: PalmImage | null;
  previewUrl: string;
  uploadConsent: boolean;
  busy: boolean;
  onConsentChange: (value: boolean) => void;
  onRemove: () => void;
}) {
  const imageUrl = previewUrl || palmImage?.url || "";

  if (!imageUrl) {
    return null;
  }

  return (
    <div className="mb-3 flex items-center gap-3 rounded-2xl border border-[#323128] bg-[#11120f] p-3">
      <div className="size-14 overflow-hidden rounded-xl border border-[#2a2b25] bg-[#090a08]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="待发送的手相图片" className="h-full w-full object-cover" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-[#c8c0b2]">{palmFile?.name ?? "手相图片已附加"}</p>
        {!palmImage ? (
          <label className="mt-2 flex items-start gap-2 text-[10px] leading-5 text-[#777168]">
            <input
              type="checkbox"
              checked={uploadConsent}
              onChange={(event) => onConsentChange(event.target.checked)}
              className="mt-1 accent-[#c9a35f]"
            />
            <span>
              同意图片上传授权，图片仅用于本次手相分析。
              <Link href="/legal/upload-consent" className="ml-1 text-[#c9a35f]">查看说明</Link>
            </span>
          </label>
        ) : (
          <p className="mt-1 text-[10px] text-[#79b8b1]">上传完成，将随本次问题一起分析</p>
        )}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={onRemove}
        className="flex size-8 items-center justify-center rounded-full text-[#777168] transition hover:bg-[#1b1c18] hover:text-[#d99787] disabled:opacity-40"
        aria-label="移除图片"
      >
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

export function ChatClient({
  initialBalance,
  initialRecentChats,
  initialReadingMethod,
  initialQuestion,
  profile,
  account,
  inviteUrl,
}: {
  initialBalance: number;
  initialRecentChats: RecentChatSession[];
  initialReadingMethod?: ChatReadingMethod;
  initialQuestion?: string;
  profile: ChatProfileSummary;
  account: ChatAccountSummary;
  inviteUrl: string;
}) {
  const [question, setQuestion] = useState(initialQuestion ?? "");
  const [balance, setBalance] = useState(initialBalance);
  const [uploading, setUploading] = useState(false);
  const [deletingImage, setDeletingImage] = useState(false);
  const [statusMessage, setStatusMessage] = useState("输入问题后可确认本次服务与预计消耗。");
  const [palmFile, setPalmFile] = useState<File | null>(null);
  const [palmPreviewUrl, setPalmPreviewUrl] = useState("");
  const [palmImage, setPalmImage] = useState<PalmImage | null>(null);
  const [uploadConsent, setUploadConsent] = useState(false);
  const [recentChats, setRecentChats] = useState(initialRecentChats);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [loadingChatId, setLoadingChatId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState("新的问事");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [retryingTurnId, setRetryingTurnId] = useState<string | null>(null);
  const [reportingTurnId, setReportingTurnId] = useState<string | null>(null);
  const [modeOverride, setModeOverride] = useState<ChatServiceMode | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const palmPreviewUrlRef = useRef("");
  const lastStreamOutcomeRef = useRef<"generating" | "complete" | "partial" | "replay" | "error" | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const transport = useMemo(
    () => new DefaultChatTransport<XuanjiChatMessage>({ api: "/api/chat" }),
    [],
  );
  const {
    messages,
    setMessages,
    sendMessage,
    status: chatStatus,
    error: chatError,
    stop,
    clearError,
  } = useChat<XuanjiChatMessage>({
    transport,
    throttle: 45,
    onData(part) {
      if (part.type === "data-chatProgress") {
        setStatusMessage(part.data.detail);
        return;
      }

      if (part.type === "data-chatStart") {
        setBalance(part.data.balanceAfter);
        setActiveChatId(part.data.chatSessionId);
        lastStreamOutcomeRef.current = part.data.replayed ? "replay" : "generating";
        setStatusMessage(part.data.replayed ? "正在恢复已完成的回答..." : "推演准备完成，正在生成回答...");
        return;
      }

      if (part.type === "data-chatComplete") {
        setBalance(part.data.balanceAfter);
        setActiveChatId(part.data.chatSessionId);
        setRecentChats((current) => {
          const existing = current.find((chat) => chat.id === part.data.chatSessionId);
          const next = createRecentChatFromResult(part.data.question, part.data);

          return [
            {
              ...next,
              title: existing?.title ?? next.title,
              question: existing?.question ?? next.question,
              createdAt: existing?.createdAt ?? next.createdAt,
            },
            ...current.filter((chat) => chat.id !== part.data.chatSessionId),
          ].slice(0, 12);
        });
        lastStreamOutcomeRef.current = part.data.replayed
          ? "replay"
          : part.data.turnStatus === "PARTIAL"
            ? "partial"
            : "complete";
        setStatusMessage(
          part.data.replayed
            ? `已恢复原回答，未重复扣费。当前剩余 ${part.data.balanceAfter} 星力。`
            : part.data.turnStatus === "PARTIAL"
              ? `回答已部分保存，本轮消耗 ${part.data.cost} 星力，剩余 ${part.data.balanceAfter} 星力。`
              : `本次消耗 ${part.data.cost} 星力，剩余 ${part.data.balanceAfter} 星力。`,
        );
        resetAttachmentLocally();
        return;
      }

      if (part.type === "data-chatError") {
        setBalance(part.data.balanceAfter);
        lastStreamOutcomeRef.current = "error";
        setStatusMessage(part.data.message);
      }
    },
    onError(error) {
      const details = getChatErrorDetails(error);
      setStatusMessage(details.message || "网络连接异常，请稍后重试。");

      if (details.balance !== undefined) {
        setBalance(details.balance);
      }
    },
    onFinish({ message, isAbort, isError }) {
      if (isAbort) {
        const hasAnswer = getMessageText(message).trim().length > 0;
        setStatusMessage(
          hasAnswer
            ? "已停止生成，当前回答已保存并按本轮结算。"
            : "已停止生成；尚未输出内容时，本次星力会自动退回。",
        );
      } else if (isError && lastStreamOutcomeRef.current !== "error" && lastStreamOutcomeRef.current !== "partial") {
        setStatusMessage("回答生成中断，请稍后再试。");
      }
    },
  });
  const loading = chatStatus === "submitted" || chatStatus === "streaming";
  const turns = useMemo(
    () => buildChatTurns(messages, chatStatus, chatError),
    [messages, chatStatus, chatError],
  );
  const reduceMotion = useReducedMotion();
  const sendingBusy = loading || uploading || deletingImage || loadingChatId !== null;
  const busy = sendingBusy || retryingTurnId !== null;
  const serviceBrief = useMemo(
    () => inferChatService(question, Boolean(palmFile || palmImage)),
    [question, palmFile, palmImage],
  );
  const selectedServiceMode = modeOverride ?? serviceBrief.recommendedMode;

  useEffect(() => {
    palmPreviewUrlRef.current = palmPreviewUrl;
  }, [palmPreviewUrl]);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) {
      return;
    }

    scrollAnchorRef.current?.scrollIntoView({
      behavior: reduceMotion || loading ? "auto" : "smooth",
      block: "end",
    });
  }, [turns, loading, reduceMotion]);

  useEffect(() => {
    return () => {
      if (palmPreviewUrl) {
        URL.revokeObjectURL(palmPreviewUrl);
      }
    };
  }, [palmPreviewUrl]);

  function resetAttachmentLocally() {
    if (palmPreviewUrlRef.current) {
      URL.revokeObjectURL(palmPreviewUrlRef.current);
    }

    palmPreviewUrlRef.current = "";
    setPalmFile(null);
    setPalmPreviewUrl("");
    setPalmImage(null);
    setUploadConsent(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleConversationScroll() {
    const container = scrollContainerRef.current;

    if (!container) {
      return;
    }

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const shouldFollow = distanceFromBottom < 120;

    if (shouldAutoScrollRef.current !== shouldFollow) {
      shouldAutoScrollRef.current = shouldFollow;
      setShowScrollButton(!shouldFollow);
    }
  }

  function scrollToLatest() {
    shouldAutoScrollRef.current = true;
    setShowScrollButton(false);
    scrollAnchorRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "end",
    });
  }

  function removeTurnMessages(
    currentMessages: XuanjiChatMessage[],
    turnId: string,
  ) {
    const index = currentMessages.findIndex(
      (message) => message.id === turnId && message.role === "user",
    );

    if (index < 0) {
      return currentMessages;
    }

    const nextMessages = [...currentMessages];
    const deleteCount = nextMessages[index + 1]?.role === "assistant" ? 2 : 1;
    nextMessages.splice(index, deleteCount);
    return nextMessages;
  }

  function stopGenerating() {
    if (!loading) {
      return;
    }

    setStatusMessage("正在停止生成...");
    stop();
  }

  async function uploadPalmAttachment() {
    if (!palmFile) {
      return palmImage;
    }

    if (!uploadConsent) {
      setStatusMessage("请先确认图片上传授权。");
      return null;
    }

    setUploading(true);
    setStatusMessage("正在安全上传手相图片...");

    try {
      const tokenResponse = await fetch("/api/storage/qiniu/upload-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: palmFile.name,
          contentType: palmFile.type,
          sizeBytes: palmFile.size,
        }),
      });
      const tokenData = await readJson<{ ok: true } & UploadToken>(tokenResponse);
      let hash: string | undefined;

      if (tokenData.mode === "qiniu") {
        if (!tokenData.uploadUrl) {
          throw new Error("图片上传服务暂不可用，请稍后再试。");
        }

        const formData = new FormData();
        formData.set("token", tokenData.token);
        formData.set("key", tokenData.key);
        formData.set("file", palmFile);

        const uploadResponse = await fetch(tokenData.uploadUrl, { method: "POST", body: formData });
        const uploadResult = (await uploadResponse.json().catch(() => null)) as { hash?: string } | null;

        if (!uploadResponse.ok) {
          throw new Error("图片上传失败，请稍后重试。");
        }

        hash = uploadResult?.hash;
      }

      const imageResponse = await fetch("/api/images/palm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: tokenData.key,
          url: tokenData.publicUrl,
          contentType: palmFile.type,
          sizeBytes: palmFile.size,
          originalName: palmFile.name,
          provider: tokenData.mode,
          hash,
        }),
      });
      const imageData = await readJson<{ ok: true; image: PalmImage }>(imageResponse);

      setPalmImage(imageData.image);
      setStatusMessage("手相图片已附加。发送问题后会自动进入校验链路。");
      return imageData.image;
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "图片上传失败。");
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function removePalmAttachment() {
    if (!palmImage) {
      resetAttachmentLocally();
      setStatusMessage("输入问题后可确认本次服务与预计消耗。");
      return;
    }

    setDeletingImage(true);
    setStatusMessage("正在移除图片...");

    try {
      const response = await fetch(`/api/images/palm/${palmImage.id}`, { method: "DELETE" });
      await readJson<{ ok: true }>(response);
      resetAttachmentLocally();
      setStatusMessage("图片已移除。");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "图片移除失败。");
    } finally {
      setDeletingImage(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;

    if (palmPreviewUrl) {
      URL.revokeObjectURL(palmPreviewUrl);
    }

    setPalmFile(nextFile);
    setPalmPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : "");
    setPalmImage(null);
    setUploadConsent(false);
    setStatusMessage(nextFile ? "确认图片授权后，发送问题即可自动上传。" : "输入问题后可确认本次服务与预计消耗。");
  }

  function startNewChat() {
    if (busy) {
      return;
    }

    setMessages([]);
    clearError();
    setActiveChatId(null);
    setConversationTitle("新的问事");
    setQuestion("");
    setModeOverride(null);
    setMobileSidebarOpen(false);
    shouldAutoScrollRef.current = true;
    setShowScrollButton(false);
    setStatusMessage("输入问题后可确认本次服务与预计消耗。");
    lastStreamOutcomeRef.current = null;
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function selectRecentChat(chat: RecentChatSession) {
    if (busy) {
      return;
    }

    setLoadingChatId(chat.id);
    setStatusMessage("正在加载完整对话...");

    try {
      const response = await fetch(`/api/chat/sessions/${encodeURIComponent(chat.id)}`, {
        cache: "no-store",
      });
      const data = await readJson<ChatTranscriptResponse>(response);
      const restoredMessages: XuanjiChatMessage[] = data.chat.messages.map((message) => ({
        id: message.id,
        role: message.role,
        ...(message.role === "assistant"
          ? {
              metadata: {
                  history: {
                    intent: message.intent ?? null,
                    toolNames: message.toolNames ?? [],
                    updatedAt: message.createdAt,
                    serviceMode: message.serviceMode,
                    answerShape: message.answerShape,
                    answerStatus: message.answerStatus,
                    conclusion: message.conclusion,
                },
              },
            }
          : {}),
        parts: [{ type: "text", text: message.content }],
      }));

      setMessages(restoredMessages);
      clearError();
      setActiveChatId(data.chat.id);
      setConversationTitle(data.chat.title);
      shouldAutoScrollRef.current = true;
      setShowScrollButton(false);
      setMobileSidebarOpen(false);
      setStatusMessage(`已恢复 ${Math.ceil(restoredMessages.length / 2)} 轮对话。`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "完整对话加载失败。");
    } finally {
      setLoadingChatId(null);
    }
  }

  async function renameRecentChat(chat: RecentChatSession, title: string) {
    const nextTitle = title.trim().replace(/\s+/g, " ");

    if (!nextTitle || nextTitle === chat.title) {
      return false;
    }

    try {
      const response = await fetch(`/api/chat/sessions/${encodeURIComponent(chat.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      });
      const data = (await response.json()) as
        | { ok: true; chat: RecentChatSession }
        | { ok: false; message?: string };

      if (!response.ok || data.ok !== true) {
        setStatusMessage(("message" in data ? data.message : undefined) ?? "暂时无法重命名对话。");
        return false;
      }

      setRecentChats((current) =>
        current.map((item) => (item.id === data.chat.id ? data.chat : item)),
      );

      if (activeChatId === data.chat.id) {
        setConversationTitle(data.chat.title);
      }

      setStatusMessage("对话标题已更新。");
      return true;
    } catch {
      setStatusMessage("网络连接异常，暂时无法重命名对话。");
      return false;
    }
  }

  async function deleteRecentChat(chat: RecentChatSession) {
    if (!window.confirm(`删除「${chat.title}」？删除后无法在历史列表中恢复。`)) {
      return false;
    }

    try {
      const response = await fetch(`/api/chat/sessions/${encodeURIComponent(chat.id)}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; message?: string }
        | null;

      if (!response.ok || data?.ok !== true) {
        setStatusMessage((data && "message" in data ? data.message : undefined) ?? "暂时无法删除对话。");
        return false;
      }

      setRecentChats((current) => current.filter((item) => item.id !== chat.id));

      if (activeChatId === chat.id) {
        setMessages([]);
        setActiveChatId(null);
        setConversationTitle("新的问事");
      }

      setStatusMessage("对话已删除。");
      return true;
    } catch {
      setStatusMessage("网络连接异常，暂时无法删除对话。");
      return false;
    }
  }

  function chooseSuggestion(value: string) {
    setQuestion(value);
    setModeOverride(null);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function copyTurn(turn: ChatTurn) {
    try {
      await navigator.clipboard.writeText(turn.answer);
      setCopiedId(turn.id);
      window.setTimeout(() => setCopiedId(null), 1400);
    } catch {
      setStatusMessage("复制失败，请手动选择文本。");
    }
  }

  async function submitQuestion(
    rawQuestion: string,
    options: {
      removeTurnId?: string;
      clearComposer?: boolean;
      serviceMode?: ChatServiceMode;
    } = {},
  ) {
    const trimmedQuestion = rawQuestion.trim();
    const requestedMode = options.serviceMode ?? selectedServiceMode;

    if (trimmedQuestion.length < 2) {
      setStatusMessage("请先输入你想咨询的问题。");
      return;
    }

    const attachedPalmImage = palmImage ?? (palmFile ? await uploadPalmAttachment() : null);

    if (palmFile && !attachedPalmImage) {
      return;
    }

    const title = trimmedQuestion.length > 28 ? `${trimmedQuestion.slice(0, 28)}...` : trimmedQuestion;
    const nextTurnCount = options.removeTurnId
      ? turns.filter((turn) => turn.id !== options.removeTurnId).length
      : turns.length;

    if (options.removeTurnId) {
      setMessages((current) => removeTurnMessages(current, options.removeTurnId!));
    }

    shouldAutoScrollRef.current = true;
    setShowScrollButton(false);
    if (options.clearComposer ?? true) {
      setQuestion("");
      setModeOverride(null);
    }
    setConversationTitle(nextTurnCount === 0 ? title : conversationTitle);
    setStatusMessage("正在理解你的问题...");
    lastStreamOutcomeRef.current = null;
    clearError();

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      await sendMessage(
        { text: trimmedQuestion },
        {
          body: {
            sessionId: activeChatId ?? undefined,
            clientRequestId: crypto.randomUUID(),
            question: trimmedQuestion,
            palmImageId: attachedPalmImage?.id,
            serviceMode: requestedMode,
            readingMethod: nextTurnCount === 0 ? initialReadingMethod : undefined,
          },
        },
      );
    } catch (error) {
      const details = error instanceof Error
        ? getChatErrorDetails(error)
        : { message: "网络连接失败，请稍后再试。", balance: undefined };
      setStatusMessage(details.message);

      if (details.balance !== undefined) {
        setBalance(details.balance);
      }
    }
  }

  async function ask() {
    await submitQuestion(question, { clearComposer: true });
  }

  async function retryTurn(turn: ChatTurn) {
    if (sendingBusy || retryingTurnId) {
      return;
    }

    setRetryingTurnId(turn.id);

    try {
      await submitQuestion(turn.question, {
        removeTurnId: turn.id,
        clearComposer: false,
        serviceMode: turn.serviceMode,
      });
    } finally {
      setRetryingTurnId(null);
    }
  }

  async function answerLightweight(turn: ChatTurn) {
    if (sendingBusy || retryingTurnId) {
      return;
    }

    setRetryingTurnId(turn.id);

    try {
      await submitQuestion(turn.question, {
        removeTurnId: turn.id,
        clearComposer: false,
        serviceMode: "quick",
      });
    } finally {
      setRetryingTurnId(null);
    }
  }

  async function reportFailure(turn: ChatTurn) {
    if (reportingTurnId) {
      return;
    }

    setReportingTurnId(turn.id);

    try {
      const response = await fetch("/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turnId: turn.errorData?.turnId,
          code: turn.errorData?.code ?? "CHAT_CLIENT_ERROR",
          question: turn.question,
        }),
      });

      if (!response.ok) {
        throw new Error("反馈提交失败");
      }

      setStatusMessage("反馈已提交，我们会结合本轮错误记录排查。");
    } catch {
      setStatusMessage("反馈暂时没有提交成功，请稍后再试。");
    } finally {
      setReportingTurnId(null);
    }
  }

  function prepareFollowUp(nextQuestion: string) {
    setQuestion(nextQuestion);
    setModeOverride(null);
    shouldAutoScrollRef.current = true;
    setShowScrollButton(false);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();

      if (!busy) {
        void ask();
      }
    }
  }

  const showTopUpAction = /星力不足|额度不足/.test(statusMessage);

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[#080907] text-[#f4efe5]">
      <ChatSidebar
        className="hidden md:flex"
        recentChats={recentChats}
        activeChatId={activeChatId}
        balance={balance}
        account={account}
        onNewChat={startNewChat}
        onSelectChat={selectRecentChat}
        onRenameChat={renameRecentChat}
        onDeleteChat={deleteRecentChat}
        onOpenProfile={() => setProfileOpen(true)}
      />

      <AnimatePresence>
        {mobileSidebarOpen ? (
          <>
            <motion.button
              type="button"
              aria-label="关闭侧边栏"
              className="fixed inset-0 z-40 bg-black/55 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileSidebarOpen(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 top-0 z-50 md:hidden"
              initial={{ x: reduceMotion ? 0 : "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: reduceMotion ? 0 : "-100%" }}
              transition={{ type: "spring", stiffness: 340, damping: 34 }}
            >
              <ChatSidebar
                className="flex w-[86vw] max-w-[310px]"
                recentChats={recentChats}
                activeChatId={activeChatId}
                balance={balance}
                account={account}
                onNewChat={startNewChat}
                onSelectChat={selectRecentChat}
                onRenameChat={renameRecentChat}
                onDeleteChat={deleteRecentChat}
                onOpenProfile={() => {
                  setMobileSidebarOpen(false);
                  setProfileOpen(true);
                }}
              />
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-[62px] shrink-0 items-center gap-3 border-b border-[#20211c] px-3 sm:px-5">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="flex size-9 items-center justify-center rounded-full text-[#8f887b] transition hover:bg-[#171814] hover:text-[#eee6d8] md:hidden"
            aria-label="打开侧边栏"
          >
            <Menu size={19} aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-[#d5cdbf]">{conversationTitle}</p>
            <p className="mt-0.5 text-[10px] text-[#67635b]">玄机 AI · 自动选择推演方式</p>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full border border-[#2a2b25] px-3 py-1.5 text-xs text-[#8f887b] sm:inline-flex">
            <Coins size={13} className="text-[#c9a35f]" aria-hidden="true" />
            {balance}
          </span>
          <InviteCopyButton
            inviteUrl={inviteUrl}
            label="邀请有礼"
            className="hidden h-9 items-center gap-2 rounded-full border border-[#3c8b72]/35 bg-[#3c8b72]/8 px-3 text-xs font-medium text-[#8ad5bd] transition hover:border-[#8ad5bd]/55 hover:bg-[#3c8b72]/12 lg:inline-flex"
          />
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="flex size-9 items-center justify-center rounded-full border border-[#2a2b25] bg-[#11120f] text-[#aaa294] transition hover:border-[#c9a35f]/35 hover:text-[#efd9a6]"
            aria-label="打开个人档案"
          >
            <UserRound size={16} aria-hidden="true" />
          </button>
        </header>

        <section
          ref={scrollContainerRef}
          onScroll={handleConversationScroll}
          className="xuanji-scrollbar min-h-0 flex-1 overflow-y-auto"
        >
          <div className="mx-auto min-h-full w-full max-w-[800px] px-4 sm:px-7">
            {turns.length === 0 ? (
              <EmptyState profile={profile} inviteUrl={inviteUrl} onSuggestion={chooseSuggestion} />
            ) : (
              <div className="divide-y divide-[#1c1d19]">
                {turns.map((turn) => (
                  <ConversationTurn
                    key={turn.id}
                    turn={turn}
                    copiedId={copiedId}
                    retrying={retryingTurnId === turn.id}
                    reportingFeedback={reportingTurnId === turn.id}
                    onCopy={(selectedTurn) => void copyTurn(selectedTurn)}
                    onRetry={(selectedTurn) => void retryTurn(selectedTurn)}
                    onLightweight={(selectedTurn) => void answerLightweight(selectedTurn)}
                    onFeedback={(selectedTurn) => void reportFailure(selectedTurn)}
                    onFollowUp={prepareFollowUp}
                  />
                ))}
              </div>
            )}
            <div ref={scrollAnchorRef} className="h-5" />
          </div>
        </section>

        <AnimatePresence>
          {showScrollButton ? (
            <motion.button
              type="button"
              onClick={scrollToLatest}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 8, scale: reduceMotion ? 1 : 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : 6, scale: reduceMotion ? 1 : 0.96 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="absolute bottom-[126px] left-1/2 z-20 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-[#37382f] bg-[#171814] text-[#d5cdbf] shadow-[0_10px_28px_rgba(0,0,0,0.38)] transition-colors hover:border-[#c9a35f]/45 hover:text-[#efd9a6] sm:bottom-[138px]"
              aria-label="滚动到最新回答"
            >
              <ArrowDown size={16} aria-hidden="true" />
            </motion.button>
          ) : null}
        </AnimatePresence>

        <div className="shrink-0 bg-gradient-to-t from-[#080907] via-[#080907] to-[#080907]/0 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-5">
          <form onSubmit={handleSubmit} className="mx-auto w-full max-w-[800px]">
            <AttachmentPreview
              palmFile={palmFile}
              palmImage={palmImage}
              previewUrl={palmPreviewUrl}
              uploadConsent={uploadConsent}
              busy={busy}
              onConsentChange={setUploadConsent}
              onRemove={() => void removePalmAttachment()}
            />

            <div className="rounded-[26px] border border-[#37382f] bg-[#11120f] p-2 shadow-[0_18px_55px_rgba(0,0,0,0.28)] transition focus-within:border-[#c9a35f]/45">
              <textarea
                ref={textareaRef}
                value={question}
                onChange={(event) => {
                  setQuestion(event.target.value);
                  event.currentTarget.style.height = "auto";
                  event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 176)}px`;
                }}
                onKeyDown={handleComposerKeyDown}
                rows={1}
                maxLength={800}
                placeholder="问一个具体问题..."
                className="xuanji-scrollbar min-h-11 max-h-44 w-full resize-none bg-transparent px-3 py-2.5 text-[15px] leading-6 text-[#eee6d8] outline-none placeholder:text-[#67635b]"
              />

              <div className="flex items-center justify-between gap-3 px-1 pb-1">
                <div className="flex items-center gap-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy}
                    className="flex size-9 items-center justify-center rounded-full text-[#8f887b] transition hover:bg-[#1c1d19] hover:text-[#d5cdbf] disabled:opacity-40"
                    aria-label="添加手相图片"
                  >
                    <Paperclip size={17} aria-hidden="true" />
                  </button>
                  <span className="hidden items-center gap-1.5 text-[10px] text-[#5f5b53] sm:inline-flex">
                    <Camera size={12} aria-hidden="true" />
                    支持手相图片
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <ChatServiceSelector
                    mode={selectedServiceMode}
                    onModeChange={setModeOverride}
                  />
                  <motion.button
                    type={loading ? "button" : "submit"}
                    onClick={loading ? stopGenerating : undefined}
                    disabled={!loading && (uploading || deletingImage || question.trim().length < 2)}
                    whileTap={reduceMotion ? undefined : { scale: 0.92 }}
                    transition={{ type: "spring", stiffness: 520, damping: 30 }}
                    className={`flex size-9 items-center justify-center rounded-full transition-colors ${
                      loading
                        ? "bg-[#eee6d8] text-[#17130d] hover:bg-white"
                        : "bg-[#c9a35f] text-[#17130d] hover:bg-[#efd9a6] disabled:bg-[#292a24] disabled:text-[#5f5b53]"
                    }`}
                    aria-label={loading ? "停止生成" : uploading || deletingImage ? "正在处理" : "发送"}
                  >
                    {loading ? (
                      <Square size={12} fill="currentColor" aria-hidden="true" />
                    ) : uploading || deletingImage ? (
                      <span className="animate-spin"><Loader2 size={16} aria-hidden="true" /></span>
                    ) : (
                      <ArrowUp size={17} aria-hidden="true" />
                    )}
                  </motion.button>
                </div>
              </div>
            </div>
            <p className="mt-2 min-h-4 px-2 text-center text-[10px] text-[#5f5b53]" aria-live="polite">
              {statusMessage} AI 推演仅作辅助参考。
            </p>
            {showTopUpAction ? (
              <div className="mt-2 flex justify-center">
                <Link
                  href="/pricing#plans"
                  className="inline-flex h-8 items-center justify-center rounded-full border border-[#c9a35f]/40 px-3 text-xs font-medium text-[#efd9a6] transition hover:border-[#c9a35f]/65 hover:bg-[#c9a35f]/10"
                >
                  查看会员套餐
                </Link>
              </div>
            ) : null}
          </form>
        </div>
      </div>

      <ProfileDrawer
        open={profileOpen}
        balance={balance}
        profile={profile}
        account={account}
        inviteUrl={inviteUrl}
        onClose={() => setProfileOpen(false)}
      />
    </div>
  );
}
