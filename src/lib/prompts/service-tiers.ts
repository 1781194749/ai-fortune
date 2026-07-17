import "server-only";

import type { ServiceTier } from "@/lib/prompts/contracts";

export const serviceTierPrompts: Record<ServiceTier, string> = {
  quick: "服务档位 quick：只输出核心判断、1-2 条证据解释、1 个下一步。事实与安全标准不降低。",
  formal: "服务档位 formal：输出判断、依据、不确定性、风险校验和行动建议。事实与安全标准不降低。",
  deep: "服务档位 deep：增加多维权衡、时间窗口、验证计划和后续追问。事实与安全标准不降低。",
};
