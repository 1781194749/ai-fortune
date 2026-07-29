"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isXuanjiDataStreamChunk,
  parseXuanjiChatEventStream,
  type XuanjiDataStreamChunk,
} from "@/app/chat/xuanji-chat-stream";
import type { XuanjiChatMessage } from "@/lib/chat-ui-message";

export type XuanjiChatStatus = "ready" | "submitted" | "streaming" | "error";

type ChatSetter = (
  value:
    | XuanjiChatMessage[]
    | ((current: XuanjiChatMessage[]) => XuanjiChatMessage[]),
) => void;

type UseXuanjiChatOptions = {
  api?: string;
  throttleMs?: number;
  onData?: (part: XuanjiDataStreamChunk) => void;
  onError?: (error: Error) => void;
  onFinish?: (event: {
    message: XuanjiChatMessage;
    isAbort: boolean;
    isError: boolean;
  }) => void;
};

type SendMessageOptions = {
  body?: Record<string, unknown>;
};

type TextPart = Extract<XuanjiChatMessage["parts"][number], { type: "text" }>;

function createTextMessage(
  id: string,
  role: "user" | "assistant",
  text = "",
): XuanjiChatMessage {
  return {
    id,
    role,
    parts: [{ type: "text", text }],
  };
}

function cloneMessage(message: XuanjiChatMessage): XuanjiChatMessage {
  return {
    ...message,
    parts: message.parts.map((part) =>
      part.type === "text" ? { ...part } : part
    ),
  };
}

function toError(value: unknown) {
  return value instanceof Error
    ? value
    : new Error("网络连接失败，请稍后再试。");
}

export function useXuanjiChat({
  api = "/api/chat",
  throttleMs = 45,
  onData,
  onError,
  onFinish,
}: UseXuanjiChatOptions) {
  const [messages, setMessagesState] = useState<XuanjiChatMessage[]>([]);
  const [status, setStatus] = useState<XuanjiChatStatus>("ready");
  const [error, setError] = useState<Error>();
  const messagesRef = useRef<XuanjiChatMessage[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const callbacksRef = useRef({ onData, onError, onFinish });

  useEffect(() => {
    callbacksRef.current = { onData, onError, onFinish };
  }, [onData, onError, onFinish]);

  const setMessages = useCallback<ChatSetter>((value) => {
    const next = typeof value === "function"
      ? value(messagesRef.current)
      : value;
    messagesRef.current = next;
    setMessagesState(next);
  }, []);

  const clearError = useCallback(() => {
    setError(undefined);
    setStatus((current) => current === "error" ? "ready" : current);
  }, []);

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const sendMessage = useCallback(async (
    input: { text: string },
    options: SendMessageOptions = {},
  ) => {
    if (abortControllerRef.current) {
      throw new Error("上一条回答仍在生成，请稍候。");
    }

    const userMessage = createTextMessage(crypto.randomUUID(), "user", input.text);
    const requestMessages = [...messagesRef.current, userMessage];
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setMessages(requestMessages);
    setError(undefined);
    setStatus("submitted");

    let assistantMessage: XuanjiChatMessage | null = null;
    const activeTextParts = new Map<string, TextPart>();
    let lastFlushAt = 0;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let streamFinishedWithError = false;
    let sawStart = false;
    let sawFinish = false;
    let terminalOutcome: "complete" | "error" | null = null;

    const ensureAssistantMessage = (messageId?: string) => {
      if (!assistantMessage) {
        assistantMessage = createTextMessage(
          messageId || crypto.randomUUID(),
          "assistant",
        );
        assistantMessage.parts = [];
      }

      return assistantMessage;
    };

    const flush = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }

      if (!assistantMessage) {
        return;
      }

      lastFlushAt = performance.now();
      setMessages([...requestMessages, cloneMessage(assistantMessage)]);
    };

    const scheduleFlush = (immediate = false) => {
      const remaining = throttleMs - (performance.now() - lastFlushAt);

      if (immediate || remaining <= 0) {
        flush();
        return;
      }

      if (!flushTimer) {
        flushTimer = setTimeout(flush, remaining);
      }
    };

    try {
      const response = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...options.body,
          messages: requestMessages,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "请求没有完成，请稍后重试。");
      }

      if (!response.body) {
        throw new Error("回答流暂时不可用，请稍后重试。");
      }

      const contentType = response.headers.get("content-type") ?? "";
      const streamVersion = response.headers.get("x-vercel-ai-ui-message-stream");

      if (!contentType.includes("text/event-stream") || streamVersion !== "v1") {
        throw new Error("回答服务返回了不正确的流格式，请稍后重试。");
      }

      for await (const chunk of parseXuanjiChatEventStream(response.body)) {
        if (chunk.type === "start") {
          sawStart = true;
          ensureAssistantMessage(chunk.messageId);
          setStatus("streaming");
          scheduleFlush(true);
          continue;
        }

        if (chunk.type === "text-start") {
          const message = ensureAssistantMessage();
          const textPart: TextPart = {
            type: "text",
            text: "",
            state: "streaming",
          };
          activeTextParts.set(chunk.id, textPart);
          message.parts.push(textPart);
          setStatus("streaming");
          scheduleFlush(true);
          continue;
        }

        if (chunk.type === "text-delta") {
          const textPart = activeTextParts.get(chunk.id);

          if (!textPart) {
            throw new Error("回答流顺序不正确，请稍后重试。");
          }

          textPart.text += chunk.delta;
          scheduleFlush();
          continue;
        }

        if (chunk.type === "text-end") {
          const textPart = activeTextParts.get(chunk.id);

          if (textPart) {
            textPart.state = "done";
            activeTextParts.delete(chunk.id);
          }

          scheduleFlush(true);
          continue;
        }

        if (isXuanjiDataStreamChunk(chunk)) {
          const message = ensureAssistantMessage();
          message.parts.push(chunk as XuanjiChatMessage["parts"][number]);
          if (chunk.type === "data-chatComplete") {
            terminalOutcome = "complete";
          } else if (chunk.type === "data-chatError") {
            terminalOutcome = "error";
          }
          callbacksRef.current.onData?.(chunk);
          scheduleFlush(true);
          continue;
        }

        if (chunk.type === "finish") {
          sawFinish = true;
          streamFinishedWithError = chunk.finishReason === "error";
          continue;
        }

        if (chunk.type === "error") {
          throw new Error(chunk.errorText || "回答生成中断，请稍后重试。");
        }
      }

      if (!sawStart || !sawFinish || !terminalOutcome || activeTextParts.size > 0) {
        throw new Error("回答传输中断，服务器保存状态需要重新确认。");
      }

      streamFinishedWithError ||= terminalOutcome === "error";
      flush();
      setStatus("ready");
      callbacksRef.current.onFinish?.({
        message: assistantMessage ?? createTextMessage(crypto.randomUUID(), "assistant"),
        isAbort: false,
        isError: streamFinishedWithError,
      });
    } catch (caught) {
      const userAborted = abortController.signal.aborted;
      if (!userAborted) {
        abortController.abort(caught);
      }
      for (const textPart of activeTextParts.values()) {
        textPart.state = "done";
      }
      activeTextParts.clear();
      flush();

      if (userAborted) {
        setStatus("ready");
        callbacksRef.current.onFinish?.({
          message: assistantMessage ?? createTextMessage(crypto.randomUUID(), "assistant"),
          isAbort: true,
          isError: false,
        });
        return;
      }

      const nextError = toError(caught);
      setError(nextError);
      setStatus("error");
      callbacksRef.current.onError?.(nextError);
      throw nextError;
    } finally {
      if (flushTimer) {
        clearTimeout(flushTimer);
      }
      abortControllerRef.current = null;
    }
  }, [api, setMessages, throttleMs]);

  return {
    messages,
    setMessages,
    sendMessage,
    status,
    error,
    stop,
    clearError,
  };
}
