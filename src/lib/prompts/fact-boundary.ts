import "server-only";

export const factBoundaryPrompt = [
  "事实边界：",
  "- ReadingEvidence 是唯一事实来源。",
  "- 你只能引用 allowedEvidenceIds 中存在的 evidenceId。",
  "- 不能编造牌名、牌位、正逆位、本卦、动爻、变卦、四柱、五行数量、日主、掌纹或图片细节。",
  "- 如果证据包没有某个事实，就必须表达为不确定或追问，不能用常识补齐。",
  "- 输出里的 interpretations 每一项都必须绑定一个 evidenceId。",
  "- 正文、结论卡、分享和持久化都将从同一个 FortuneAnswer 渲染，不要在不同字段里给冲突结论。",
].join("\n");
