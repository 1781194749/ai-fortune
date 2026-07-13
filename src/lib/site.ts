export const brand = {
  cn: "玄机 AI",
  en: "Xuanji AI",
  tagline: "看得见推演过程的 AI 命理顾问",
  description:
    "塔罗、八字五行、八卦问事、手相解读与深度报告，一次生成你的专属命理档案。",
} as const;

export const navItems = [
  { label: "问 AI", href: "/chat" },
  { label: "塔罗", href: "/tarot" },
  { label: "八字", href: "/bazi" },
  { label: "八卦", href: "/bagua" },
  { label: "手相", href: "/palm" },
  { label: "深度报告", href: "/reports/deep" },
  { label: "功能", href: "#modules" },
  { label: "会员", href: "/pricing" },
  { label: "架构", href: "#system" },
] as const;

export const ritualSteps = [
  "识别问题类型",
  "读取命理档案",
  "调用命理工具",
  "生成专属解读",
] as const;

export const productModules = [
  {
    title: "塔罗占卜",
    eyebrow: "高频入口",
    detail: "今日单牌、三牌阵、爱情与事业牌阵，适合拉新和即时转化。",
    accent: "border-[#c8a15a]/45 bg-[#c8a15a]/10",
  },
  {
    title: "八字五行",
    eyebrow: "专业信任",
    detail: "生日、时辰、出生地进入排盘工具，AI 负责解释和追问。",
    accent: "border-[#3c8b72]/45 bg-[#3c8b72]/10",
  },
  {
    title: "八卦问事",
    eyebrow: "低成本复购",
    detail: "针对具体问题起卦、变卦、解卦，适合事业、关系和选择题。",
    accent: "border-[#f0d49a]/40 bg-[#f0d49a]/10",
  },
  {
    title: "手相上传",
    eyebrow: "强好奇心",
    detail: "七牛云存储图片，视觉模型分析掌纹，生成可沉淀报告。",
    accent: "border-[#b34c32]/45 bg-[#b34c32]/10",
  },
] as const;

export const pricingPlans = [
  {
    name: "体验卡",
    price: "9.9",
    unit: "7 天",
    highlight: false,
    features: ["80 星力", "30 次轻问答", "1 次手相浅析", "3 次塔罗"],
  },
  {
    name: "月度会员",
    price: "29",
    unit: "月",
    highlight: true,
    features: ["350 星力", "3 次手相", "2 份简版报告", "基础档案记忆"],
  },
  {
    name: "进阶会员",
    price: "69",
    unit: "月",
    highlight: false,
    features: ["1200 星力", "10 次手相", "6 份深度报告", "长期记忆"],
  },
  {
    name: "年度会员",
    price: "399",
    unit: "年",
    highlight: false,
    features: ["每月 450 星力", "年度运势", "每月主题报告", "全年档案"],
  },
] as const;

export const systemPillars = [
  "邮箱验证码优先，微信扫码登录预留",
  "支付宝与微信支付完整订单链路，开发期走 mock payment",
  "OpenAI Responses API 编排对话、图片与工具调用",
  "PostgreSQL + Prisma 保存会员档案、报告和星力流水",
] as const;
