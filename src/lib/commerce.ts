export type Currency = "CNY" | "USD";

export type ProductType = "membership" | "one_time";

export type ProductCode =
  | "trial_7d"
  | "monthly"
  | "pro_monthly"
  | "yearly"
  | "tarot_love"
  | "palm_brief"
  | "bazi_detail"
  | "composite_report"
  | "yearly_report";

export type FeatureCode =
  | "chat_basic"
  | "tarot_daily"
  | "tarot_three_card"
  | "tarot_love"
  | "bagua_question"
  | "bazi_brief"
  | "palm_reading"
  | "deep_report"
  | "yearly_report";

export type Product = {
  code: ProductCode;
  type: ProductType;
  name: string;
  priceCents: number;
  currency: Currency;
  starGrant?: number;
  durationDays?: number;
  reportQuota?: number;
  palmQuota?: number;
  highlighted?: boolean;
  description: string;
};

export type ProductRuntimeOverride = {
  enabled?: boolean;
  name?: string;
  priceCents?: number;
  starGrant?: number;
  durationDays?: number;
  reportQuota?: number;
  palmQuota?: number;
  highlighted?: boolean;
  description?: string;
};

export type MembershipTierCode = "FREE" | "TRIAL" | "MONTHLY" | "PRO" | "YEARLY";

export const freeStarterStarGrant = 10;

declare global {
  var xuanjiProductRuntimeConfigs: Map<string, ProductRuntimeOverride> | undefined;
}

export const membershipProducts = [
  {
    code: "trial_7d",
    type: "membership",
    name: "体验卡",
    priceCents: 990,
    currency: "CNY",
    starGrant: 80,
    durationDays: 7,
    reportQuota: 1,
    palmQuota: 1,
    description: "适合低门槛试用，验证塔罗、手相和简版报告体验。",
  },
  {
    code: "monthly",
    type: "membership",
    name: "月度会员",
    priceCents: 2900,
    currency: "CNY",
    starGrant: 350,
    durationDays: 30,
    reportQuota: 2,
    palmQuota: 3,
    highlighted: false,
    description: "主推档位，覆盖基础 AI 对话、手相和简版报告。",
  },
  {
    code: "pro_monthly",
    type: "membership",
    name: "进阶会员",
    priceCents: 6900,
    currency: "CNY",
    starGrant: 1200,
    durationDays: 30,
    reportQuota: 6,
    palmQuota: 10,
    description: "面向高频和高信任用户，包含长期记忆和深度报告。",
  },
  {
    code: "yearly",
    type: "membership",
    name: "关键阶段陪伴",
    priceCents: 9900,
    currency: "CNY",
    starGrant: 1800,
    durationDays: 30,
    reportQuota: 10,
    palmQuota: 16,
    highlighted: true,
    description: "围绕一个核心主题连续跟进 30 天，包含每周复盘与阶段总结。",
  },
] satisfies Product[];

export const oneTimeProducts = [
  {
    code: "tarot_love",
    type: "one_time",
    name: "塔罗爱情牌阵",
    priceCents: 990,
    currency: "CNY",
    description: "爱情关系、对方想法和关系走向的高转化入口。",
  },
  {
    code: "palm_brief",
    type: "one_time",
    name: "手相简析",
    priceCents: 690,
    currency: "CNY",
    description: "上传手掌图片后生成轻量手相解读。",
  },
  {
    code: "bazi_detail",
    type: "one_time",
    name: "八字五行详批",
    priceCents: 1990,
    currency: "CNY",
    description: "基于生日、时辰和出生地生成五行详批。",
  },
  {
    code: "composite_report",
    type: "one_time",
    name: "手相 + 八字综合报告",
    priceCents: 2990,
    currency: "CNY",
    description: "组合手相、八字和 AI 解读的综合命盘报告。",
  },
  {
    code: "yearly_report",
    type: "one_time",
    name: "年度大报告",
    priceCents: 4990,
    currency: "CNY",
    description: "年度事业、感情、财运和行动建议报告。",
  },
] satisfies Product[];

export const productCatalog: Product[] = [
  ...membershipProducts,
  ...oneTimeProducts,
];

export const starCosts: Record<FeatureCode, { min: number; max: number }> = {
  chat_basic: { min: 1, max: 2 },
  tarot_daily: { min: 0, max: 0 },
  tarot_three_card: { min: 15, max: 15 },
  tarot_love: { min: 30, max: 40 },
  bagua_question: { min: 15, max: 15 },
  bazi_brief: { min: 20, max: 20 },
  palm_reading: { min: 30, max: 30 },
  deep_report: { min: 80, max: 150 },
  yearly_report: { min: 180, max: 250 },
};

export const membershipTierByProduct: Partial<Record<ProductCode, MembershipTierCode>> = {
  trial_7d: "TRIAL",
  monthly: "MONTHLY",
  pro_monthly: "PRO",
  yearly: "YEARLY",
};

export function getProduct(code: ProductCode) {
  const product = productCatalog.find((item) => item.code === code);
  const override = globalThis.xuanjiProductRuntimeConfigs?.get(code);

  if (!product) {
    return undefined;
  }

  if (override?.enabled === false) {
    return undefined;
  }

  if (!override) {
    return product;
  }

  return {
    ...product,
    ...Object.fromEntries(
      Object.entries(override).filter(([, value]) => value !== undefined),
    ),
    code: product.code,
    type: product.type,
    currency: product.currency,
  } satisfies Product;
}

export function isProductCode(value: string): value is ProductCode {
  return productCatalog.some((product) => product.code === value);
}

export function formatPrice(cents: number, currency: Currency = "CNY") {
  const amount = cents / 100;

  if (currency === "CNY") {
    if (cents % 100 === 0) {
      return `¥${amount.toFixed(0)}`;
    }

    if (cents % 10 === 0) {
      return `¥${amount.toFixed(1)}`;
    }

    return `¥${amount.toFixed(2)}`;
  }

  return `$${amount.toFixed(2)}`;
}

export function getStarCostLabel(feature: FeatureCode) {
  const cost = starCosts[feature];

  if (cost.min === 0 && cost.max === 0) {
    return "免费";
  }

  if (cost.min === cost.max) {
    return `${cost.min} 星力`;
  }

  return `${cost.min}-${cost.max} 星力`;
}
