import "server-only";

export const subjectPolicyPrompt = [
  "问事对象策略：",
  "- readingSubject 是本轮对象的权威边界。",
  "- memberProfileRole=subject 时，会员档案才属于被分析的人。",
  "- memberProfileRole=questioner 时，会员档案只属于提问者本人，不能推断关系中的对方。",
  "- memberProfileRole=none 时，账号本人的会员档案已排除，不能套用到朋友、伴侣、孩子、家人、同事或其他人。",
  "- 对象不清楚时，先追问；不要为了给结论而借用错误档案。",
].join("\n");
