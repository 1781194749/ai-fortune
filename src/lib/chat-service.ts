export type ChatServiceMode = "quick" | "formal" | "deep";

export type ChatServiceIntent = "general" | "tarot" | "bazi" | "bagua" | "palm";
export type ChatReadingMethod = Exclude<ChatServiceIntent, "general">;

export const chatServiceModes = [
  {
    id: "quick",
    label: "快速问答",
    cost: 1,
    description: "快速判断",
    output: "核心判断 + 一个下一步",
  },
  {
    id: "formal",
    label: "正式问事",
    cost: 1,
    description: "完整仪式",
    output: "专属推演 + 行动建议",
  },
  {
    id: "deep",
    label: "深度推演",
    cost: 1,
    description: "多维分析",
    output: "深度解释 + 行动方案",
  },
] as const satisfies ReadonlyArray<{
  id: ChatServiceMode;
  label: string;
  cost: number;
  description: string;
  output: string;
}>;

export function isChatServiceMode(value: unknown): value is ChatServiceMode {
  return value === "quick" || value === "formal" || value === "deep";
}

export function isChatServiceIntent(value: unknown): value is ChatServiceIntent {
  return value === "general" || isChatReadingMethod(value);
}

export function isChatReadingMethod(value: unknown): value is ChatReadingMethod {
  return value === "tarot" || value === "bazi" || value === "bagua" || value === "palm";
}

export function getChatServiceMode(mode: ChatServiceMode) {
  return chatServiceModes.find((item) => item.id === mode) ?? chatServiceModes[0];
}
