export type ChannelSegmentCode =
  | "organic"
  | "poster"
  | "private"
  | "paid_or_kol"
  | "unknown";

export type ChannelSourceStatus = "standard" | "needs_normalization" | "unknown";

export type ChannelSourceDefinition = {
  code: string;
  label: string;
  segment: ChannelSegmentCode;
  example: string;
};

export type ChannelSourceAudit = {
  source: string;
  normalizedSource: string;
  baseSource: string;
  segment: ChannelSegmentCode;
  status: ChannelSourceStatus;
  label: string;
  reason: string;
  suggestion: string;
};

export type TrackingSourceInput = {
  source?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
};

export const channelSegmentLabels: Record<ChannelSegmentCode, string> = {
  organic: "自然传播",
  poster: "海报回流",
  private: "私域社群",
  paid_or_kol: "达人/投放",
  unknown: "未标记来源",
};

export const channelSourceRegistry = [
  {
    code: "direct",
    label: "直接访问",
    segment: "organic",
    example: "direct",
  },
  {
    code: "copy_link",
    label: "复制链接",
    segment: "organic",
    example: "copy_link",
  },
  {
    code: "native_share",
    label: "系统分享",
    segment: "organic",
    example: "native_share",
  },
  {
    code: "share_page",
    label: "公开报告页",
    segment: "organic",
    example: "share_page",
  },
  {
    code: "share_cta",
    label: "分享页转化按钮",
    segment: "organic",
    example: "share_cta",
  },
  {
    code: "poster_qr",
    label: "海报二维码",
    segment: "poster",
    example: "poster_qr",
  },
  {
    code: "poster_page",
    label: "海报页",
    segment: "poster",
    example: "poster_page",
  },
  {
    code: "poster_link",
    label: "海报链接",
    segment: "poster",
    example: "poster_link",
  },
  {
    code: "wechat_group",
    label: "微信群",
    segment: "private",
    example: "wechat_group__fortune_01",
  },
  {
    code: "wechat_friend",
    label: "微信好友",
    segment: "private",
    example: "wechat_friend",
  },
  {
    code: "private_group",
    label: "私域社群",
    segment: "private",
    example: "private_group__launch",
  },
  {
    code: "douyin_kol",
    label: "抖音达人",
    segment: "paid_or_kol",
    example: "douyin_kol__daily_tarot",
  },
  {
    code: "xiaohongshu_kol",
    label: "小红书达人",
    segment: "paid_or_kol",
    example: "xiaohongshu_kol__palm",
  },
  {
    code: "paid_ad",
    label: "付费广告",
    segment: "paid_or_kol",
    example: "paid_ad__cpc__new_user",
  },
  {
    code: "organic",
    label: "自然来源",
    segment: "organic",
    example: "organic",
  },
] as const satisfies ChannelSourceDefinition[];

const registryByCode: Map<string, ChannelSourceDefinition> = new Map(
  channelSourceRegistry.map((source) => [source.code, source]),
);

const sourceAliases: Record<string, string> = {
  ad: "paid_ad",
  ads: "paid_ad",
  cpc: "paid_ad",
  campaign: "paid_ad",
  creator: "douyin_kol",
  douyin: "douyin_kol",
  influencer: "douyin_kol",
  kol: "douyin_kol",
  native: "native_share",
  poster: "poster_page",
  qr: "poster_qr",
  share: "share_page",
  wechat: "wechat_group",
  weixin: "wechat_group",
  xhs: "xiaohongshu_kol",
  "小红书": "xiaohongshu_kol",
  "微信": "wechat_group",
  "微信群": "wechat_group",
  "抖音": "douyin_kol",
};

const sourceHints: Record<Exclude<ChannelSegmentCode, "unknown">, string[]> = {
  organic: ["direct", "copy", "native_share", "share", "organic"],
  poster: ["poster", "qr", "poster_qr", "download"],
  private: ["wechat", "weixin", "friend", "group", "private", "community"],
  paid_or_kol: ["kol", "creator", "influencer", "douyin", "xiaohongshu", "ad", "paid", "campaign"],
};

function readText(value: string | undefined) {
  return value?.trim().slice(0, 120);
}

function cleanSourceToken(value: string | undefined) {
  const raw = readText(value);

  if (!raw) {
    return "";
  }

  return raw
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function normalizeBaseSource(base: string) {
  return sourceAliases[base] ?? base;
}

function normalizeSourceParts(value: string | undefined) {
  const raw = readText(value);

  if (!raw) {
    return [];
  }

  const rawAlias = sourceAliases[raw.toLowerCase()];

  if (rawAlias) {
    return [rawAlias];
  }

  const tokens = cleanSourceToken(raw)
    .split("__")
    .map((token) => token.replace(/^_+|_+$/g, ""))
    .filter(Boolean);

  if (tokens.length === 0) {
    return [];
  }

  return [normalizeBaseSource(tokens[0]), ...tokens.slice(1, 3)];
}

export function normalizeChannelSource(value: string | undefined) {
  const parts = normalizeSourceParts(value);

  if (parts.length === 0) {
    return "direct";
  }

  return parts.join("__");
}

export function resolveTrackingSource(input: TrackingSourceInput) {
  if (readText(input.source)) {
    return normalizeChannelSource(input.source);
  }

  const utmParts = [
    cleanSourceToken(input.utm_source),
    cleanSourceToken(input.utm_medium),
    cleanSourceToken(input.utm_campaign),
  ].filter(Boolean);

  return normalizeChannelSource(utmParts.join("__"));
}

export function getChannelSourceBase(source: string) {
  return normalizeChannelSource(source).split("__")[0] || "direct";
}

export function classifyChannelSource(source: string): ChannelSegmentCode {
  const normalized = normalizeChannelSource(source);
  const baseSource = getChannelSourceBase(normalized);
  const definition = registryByCode.get(baseSource);

  if (definition) {
    return definition.segment;
  }

  for (const segment of ["paid_or_kol", "poster", "private", "organic"] as const) {
    if (sourceHints[segment].some((hint) => normalized.includes(hint))) {
      return segment;
    }
  }

  return "unknown";
}

export function auditChannelSource(source: string): ChannelSourceAudit {
  const normalizedSource = normalizeChannelSource(source);
  const baseSource = getChannelSourceBase(normalizedSource);
  const definition = registryByCode.get(baseSource);
  const segment = classifyChannelSource(normalizedSource);

  if (!definition) {
    return {
      source,
      normalizedSource,
      baseSource,
      segment,
      status: "unknown",
      label: channelSegmentLabels[segment],
      reason: "来源没有匹配到渠道命名注册表，ROI 会进入未标记或模糊分层。",
      suggestion: "用已注册前缀，例如 paid_ad__cpc__new_user、douyin_kol__daily_tarot 或 wechat_group__launch。",
    };
  }

  if (source !== normalizedSource) {
    return {
      source,
      normalizedSource,
      baseSource,
      segment,
      status: "needs_normalization",
      label: definition.label,
      reason: "来源可以识别，但大小写、空格或别名不符合统一命名。",
      suggestion: `改为 ${normalizedSource}。`,
    };
  }

  return {
    source,
    normalizedSource,
    baseSource,
    segment,
    status: "standard",
    label: definition.label,
    reason: "来源命名符合注册表。",
    suggestion: definition.example,
  };
}
