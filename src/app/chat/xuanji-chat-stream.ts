import type { ChatDataParts } from "@/lib/chat-ui-message";

export type XuanjiDataStreamChunk = {
  [Key in keyof ChatDataParts & string]: {
    type: `data-${Key}`;
    data: ChatDataParts[Key];
  };
}[keyof ChatDataParts & string];

export type XuanjiChatStreamChunk =
  | { type: "start"; messageId?: string }
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  | { type: "finish"; finishReason?: string }
  | { type: "error"; errorText?: string }
  | XuanjiDataStreamChunk;

const dataChunkTypes = new Set<XuanjiDataStreamChunk["type"]>([
  "data-chatReserved",
  "data-chatProgress",
  "data-chatStart",
  "data-chatComplete",
  "data-chatError",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasStrings(value: Record<string, unknown>, keys: string[]) {
  return keys.every((key) => typeof value[key] === "string");
}

function hasNumbers(value: Record<string, unknown>, keys: string[]) {
  return keys.every((key) =>
    typeof value[key] === "number" && Number.isFinite(value[key])
  );
}

function hasPublicTrace(value: Record<string, unknown>) {
  return (
    typeof value.method === "string" &&
    typeof value.showRitual === "boolean" &&
    Array.isArray(value.steps) &&
    value.steps.every((step) => isRecord(step) && hasStrings(step, ["label", "detail"])) &&
    Array.isArray(value.evidence) &&
    value.evidence.every((item) =>
      isRecord(item) && hasStrings(item, ["label", "status", "summary"])
    )
  );
}

function hasQuotaState(value: Record<string, unknown>) {
  return hasNumbers(value, [
    "balanceAfter",
    "quotaTotal",
    "quotaUsed",
    "quotaRemaining",
  ]);
}

function isValidDataChunk(type: string, data: unknown) {
  if (!isRecord(data)) {
    return false;
  }

  if (type === "data-chatReserved") {
    return (
      hasStrings(data, ["serviceMode", "chatSessionId", "turnId"]) &&
      hasNumbers(data, ["cost", "turnSequence"]) &&
      typeof data.createdSession === "boolean" &&
      hasQuotaState(data)
    );
  }

  if (type === "data-chatProgress") {
    return (
      hasStrings(data, ["step", "status", "label", "detail", "serviceMode"]) &&
      hasNumbers(data, ["sequence"])
    );
  }

  if (type === "data-chatStart") {
    return (
      hasStrings(data, ["serviceMode", "chatSessionId", "turnId"]) &&
      hasNumbers(data, ["cost", "turnSequence"]) &&
      typeof data.createdSession === "boolean" &&
      typeof data.replayed === "boolean" &&
      hasQuotaState(data) &&
      hasPublicTrace(data)
    );
  }

  if (type === "data-chatComplete") {
    return (
      hasStrings(data, [
        "answer",
        "question",
        "serviceMode",
        "chatSessionId",
        "turnId",
        "turnStatus",
      ]) &&
      hasNumbers(data, ["cost", "turnSequence"]) &&
      typeof data.counted === "boolean" &&
      typeof data.replayed === "boolean" &&
      hasQuotaState(data) &&
      hasPublicTrace(data)
    );
  }

  if (type === "data-chatError") {
    return (
      hasStrings(data, ["message", "settlementStatus"]) &&
      typeof data.refunded === "boolean" &&
      hasQuotaState(data)
    );
  }

  return false;
}

function parseChunk(payload: string): XuanjiChatStreamChunk {
  let value: unknown;

  try {
    value = JSON.parse(payload);
  } catch {
    throw new Error("回答流格式不正确，请稍后重试。");
  }

  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("回答流缺少事件类型，请稍后重试。");
  }

  if (value.type === "start") {
    if (value.messageId !== undefined && typeof value.messageId !== "string") {
      throw new Error("回答流起始事件不正确，请稍后重试。");
    }
    return value as XuanjiChatStreamChunk;
  }

  if (value.type === "text-start" || value.type === "text-end") {
    if (typeof value.id !== "string") {
      throw new Error("回答流文本事件不正确，请稍后重试。");
    }
    return value as XuanjiChatStreamChunk;
  }

  if (value.type === "text-delta") {
    if (typeof value.id !== "string" || typeof value.delta !== "string") {
      throw new Error("回答流增量事件不正确，请稍后重试。");
    }
    return value as XuanjiChatStreamChunk;
  }

  if (value.type === "finish") {
    if (value.finishReason !== undefined && typeof value.finishReason !== "string") {
      throw new Error("回答流结束事件不正确，请稍后重试。");
    }
    return value as XuanjiChatStreamChunk;
  }

  if (value.type === "error") {
    if (value.errorText !== undefined && typeof value.errorText !== "string") {
      throw new Error("回答流错误事件不正确，请稍后重试。");
    }
    return value as XuanjiChatStreamChunk;
  }

  if (dataChunkTypes.has(value.type as XuanjiDataStreamChunk["type"])) {
    if (!isValidDataChunk(value.type, value.data)) {
      throw new Error("回答流数据事件不正确，请稍后重试。");
    }
    return value as XuanjiChatStreamChunk;
  }

  throw new Error("回答流包含未知事件，请稍后重试。");
}

function findEventBoundary(buffer: string) {
  const match = /(?:\r\n|\r|\n){2}/.exec(buffer);

  return match?.index === undefined
    ? null
    : { index: match.index, length: match[0].length };
}

function getEventPayload(event: string) {
  return event
    .split(/\r\n|\r|\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
}

export function isXuanjiDataStreamChunk(
  chunk: XuanjiChatStreamChunk,
): chunk is XuanjiDataStreamChunk {
  return dataChunkTypes.has(chunk.type as XuanjiDataStreamChunk["type"]);
}

export async function* parseXuanjiChatEventStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<XuanjiChatStreamChunk> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reachedEnd = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      while (true) {
        const boundary = findEventBoundary(buffer);

        if (!boundary) {
          break;
        }

        const event = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.length);
        const payload = getEventPayload(event);

        if (payload && payload !== "[DONE]") {
          yield parseChunk(payload);
        }
      }

      if (done) {
        reachedEnd = true;
        break;
      }
    }

    const payload = getEventPayload(buffer.trim());

    if (payload && payload !== "[DONE]") {
      yield parseChunk(payload);
    }
  } finally {
    if (!reachedEnd) {
      try {
        await reader.cancel();
      } catch {
        // The request may already have been cancelled by the caller.
      }
    }
    reader.releaseLock();
  }
}
