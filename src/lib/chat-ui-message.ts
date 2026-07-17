import type { UIMessage } from "ai";
import type { AiChatResult } from "@/lib/ai-orchestrator";
import type { ChatServiceIntent, ChatServiceMode } from "@/lib/chat-service";

export type ChatRitualItem =
  | {
      kind: "tarot_card";
      index: number;
      total: number;
      title: string;
      position: string;
      orientation: string;
      meaning: string;
    }
  | {
      kind: "bagua_stage";
      stage: "main" | "moving" | "changed";
      title: string;
      detail: string;
    }
  | {
      kind: "bazi_pillars";
      pillars: string[];
    }
  | {
      kind: "bazi_wuxing";
      counts: Record<string, number>;
      strongest: string;
      weakest: string[];
    }
  | {
      kind: "general_signal";
      title: string;
      detail: string;
    };

export type ChatProgressData = {
  step: "classify" | "profile" | "tool" | "ritual" | "answer";
  status: "running" | "completed";
  label: string;
  detail: string;
  sequence: number;
  intent?: ChatServiceIntent;
  serviceMode: ChatServiceMode;
  ritualItem?: ChatRitualItem;
};

export type ChatTrace = Pick<
  AiChatResult,
  "intent" | "steps" | "toolCalls" | "contextSummary" | "answerShape" | "qualityTrace"
>;

export type ChatSuccessData = {
  ok: true;
  cost: number;
  balanceAfter: number;
  chatSessionId: string;
  turnId: string;
  turnSequence: number;
  turnStatus: "COMPLETED" | "PARTIAL";
  replayed: boolean;
} & AiChatResult;

export type ChatStartData = ChatTrace & {
  serviceMode: ChatServiceMode;
  cost: number;
  balanceAfter: number;
  chatSessionId: string;
  turnId: string;
  turnSequence: number;
  createdSession: boolean;
  replayed: boolean;
};

export type ChatCompleteData = ChatSuccessData & {
  question: string;
};

export type ChatErrorData = {
  message: string;
  balanceAfter: number;
  code: string;
  turnId?: string;
  refunded: boolean;
};

export type ChatMessageMetadata = {
  history?: {
    intent: string | null;
    toolNames: string[];
    updatedAt: string;
    serviceMode?: ChatServiceMode;
    conclusion?: AiChatResult["conclusion"];
  };
};

export type ChatDataParts = {
  chatProgress: ChatProgressData;
  chatStart: ChatStartData;
  chatComplete: ChatCompleteData;
  chatError: ChatErrorData;
};

export type XuanjiChatMessage = UIMessage<ChatMessageMetadata, ChatDataParts>;
