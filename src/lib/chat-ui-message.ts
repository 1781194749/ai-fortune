import type { UIMessage } from "ai";
import type {
  AiChatResult,
  AiChatStep,
} from "@/lib/ai-orchestrator";
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
  method?: ChatServiceIntent;
  serviceMode: ChatServiceMode;
  ritualItem?: ChatRitualItem;
};

export type ChatPublicEvidence = {
  label: string;
  status: "completed" | "needs_input" | "preview";
  summary: string;
};

export type ChatTrace = {
  method: ChatServiceIntent;
  steps: AiChatStep[];
  evidence: ChatPublicEvidence[];
  showRitual: boolean;
};

export type ChatSuccessData = {
  ok: true;
  answer: string;
  serviceMode: ChatServiceMode;
  cost: number;
  balanceAfter: number;
  quotaTotal: number;
  quotaUsed: number;
  quotaRemaining: number;
  chatSessionId: string;
  turnId: string;
  turnSequence: number;
  turnStatus: "COMPLETED" | "PARTIAL";
  counted: boolean;
  replayed: boolean;
} & ChatTrace;

export type ChatStartData = ChatTrace & {
  serviceMode: ChatServiceMode;
  cost: number;
  balanceAfter: number;
  quotaTotal: number;
  quotaUsed: number;
  quotaRemaining: number;
  chatSessionId: string;
  turnId: string;
  turnSequence: number;
  createdSession: boolean;
  replayed: boolean;
};

export type ChatReservationData = {
  serviceMode: ChatServiceMode;
  cost: number;
  balanceAfter: number;
  quotaTotal: number;
  quotaUsed: number;
  quotaRemaining: number;
  chatSessionId: string;
  turnId: string;
  turnSequence: number;
  createdSession: boolean;
};

export type ChatCompleteData = ChatSuccessData & {
  question: string;
};

export type ChatInternalCompleteData = {
  ok: true;
  cost: number;
  balanceAfter: number;
  quotaTotal: number;
  quotaUsed: number;
  quotaRemaining: number;
  chatSessionId: string;
  turnId: string;
  turnSequence: number;
  turnStatus: "COMPLETED" | "PARTIAL";
  counted: boolean;
  replayed: boolean;
  question: string;
  deliveryState?: "CHECKPOINT" | "RECOVERABLE" | "FINALIZED";
  intendedTurnStatus?: "COMPLETED" | "PARTIAL";
} & AiChatResult;

export type ChatErrorData = {
  message: string;
  balanceAfter: number;
  quotaTotal: number;
  quotaUsed: number;
  quotaRemaining: number;
  turnId?: string;
  refunded: boolean;
  settlementStatus: "refunded" | "not_charged" | "pending" | "charged";
};

export type ChatMessageMetadata = {
  history?: {
    method: ChatServiceIntent;
    updatedAt: string;
    serviceMode?: ChatServiceMode;
    showRitual: boolean;
  };
};

export type ChatDataParts = {
  chatReserved: ChatReservationData;
  chatProgress: ChatProgressData;
  chatStart: ChatStartData;
  chatComplete: ChatCompleteData;
  chatError: ChatErrorData;
};

export type XuanjiChatMessage = UIMessage<ChatMessageMetadata, ChatDataParts>;
