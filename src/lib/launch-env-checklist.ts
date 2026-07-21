import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import { getLaunchMaterialPack } from "@/lib/launch-materials";

type Env = Record<string, string | undefined>;

type EnvKind = "plain" | "secret" | "url" | "toggle" | "connection";
type EnvState =
  | "ready"
  | "missing"
  | "placeholder"
  | "local"
  | "weak"
  | "mismatch"
  | "waiting_toggle";

type EnvSpec = {
  key: string;
  group: string;
  label: string;
  kind: EnvKind;
  statusWhenInvalid: HealthStatus;
  action: string;
  expected?: string;
  defaultValue?: string;
  minLength?: number;
  invalidWhenLocal?: boolean;
  enabledBy?: string;
  enabledByAny?: string[];
  readyWhenAnyPresent?: string[];
};

export type LaunchEnvChecklistItem = {
  key: string;
  group: string;
  label: string;
  kind: EnvKind;
  status: HealthStatus;
  state: EnvState;
  stateLabel: string;
  displayValue: string;
  detail: string;
  action: string;
  sourceItems: string[];
};

export type LaunchEnvChecklist = {
  generatedAt: string;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
    missing: number;
    placeholder: number;
    secret: number;
  };
  items: LaunchEnvChecklistItem[];
  nextItems: LaunchEnvChecklistItem[];
  groups: Array<{
    name: string;
    ready: number;
    warning: number;
    blocking: number;
    total: number;
  }>;
};

const specs = [
  {
    key: "APP_URL",
    group: "基础配置",
    label: "正式域名",
    kind: "url",
    statusWhenInvalid: "blocking",
    invalidWhenLocal: true,
    action: "域名审核通过后配置正式 HTTPS 域名；审核中可先完成本地和内测环境验收。",
  },
  {
    key: "APP_LOCALE",
    group: "基础配置",
    label: "默认语言",
    kind: "plain",
    statusWhenInvalid: "warning",
    defaultValue: "zh-CN",
    action: "第一版建议保持 zh-CN，英文结构后续预留。",
  },
  {
    key: "COMPANY_NAME",
    group: "主体合规",
    label: "协议主体",
    kind: "plain",
    statusWhenInvalid: "warning",
    action: "主体确定后写入公司或个体工商户名称，并同步协议页。",
  },
  {
    key: "ICP_RECORD_NO",
    group: "主体合规",
    label: "ICP备案号",
    kind: "plain",
    statusWhenInvalid: "warning",
    action: "ICP备案通过后写入备案号，并展示到页脚和协议页面。",
  },
  {
    key: "AUTH_SESSION_SECRET",
    group: "后台与安全",
    label: "会话密钥",
    kind: "secret",
    statusWhenInvalid: "blocking",
    minLength: 32,
    action: "生成至少 32 字符高强度随机密钥。",
  },
  {
    key: "ADMIN_DASHBOARD_ENABLED",
    group: "后台与安全",
    label: "后台开关",
    kind: "toggle",
    statusWhenInvalid: "blocking",
    expected: "true",
    action: "生产环境需要开启后台并配合强 token 访问。",
  },
  {
    key: "ADMIN_ACCESS_TOKEN",
    group: "后台与安全",
    label: "后台访问 token",
    kind: "secret",
    statusWhenInvalid: "blocking",
    minLength: 32,
    action: "生成至少 32 字符后台访问 token，避免使用容易猜测的字符串。",
  },
  {
    key: "ADMIN_EMAIL",
    group: "后台与安全",
    label: "管理员邮箱",
    kind: "plain",
    statusWhenInvalid: "blocking",
    action: "填写可登录后台的 Google 邮箱，并通过 npm run db:seed 写入数据库管理员角色。",
  },
  {
    key: "DATABASE_URL",
    group: "生产数据",
    label: "PostgreSQL 连接串",
    kind: "connection",
    statusWhenInvalid: "blocking",
    invalidWhenLocal: true,
    action: "填写生产 PostgreSQL 连接串，随后执行迁移和落库探针。",
  },
  {
    key: "AUTH_EMAIL_ENABLED",
    group: "登录",
    label: "邮箱验证码登录",
    kind: "toggle",
    statusWhenInvalid: "warning",
    expected: "false",
    action: "当前生产入口改为 Google 邮箱登录，邮箱验证码暂不作为上线登录方式。",
  },
  {
    key: "AUTH_GOOGLE_ENABLED",
    group: "登录",
    label: "Google 登录",
    kind: "toggle",
    statusWhenInvalid: "warning",
    expected: "true",
    action: "Google OAuth 就绪后开启，并补齐 Client ID 与 Client Secret。",
  },
  {
    key: "GOOGLE_CLIENT_ID",
    group: "登录",
    label: "Google OAuth Client ID",
    kind: "plain",
    statusWhenInvalid: "blocking",
    enabledBy: "AUTH_GOOGLE_ENABLED",
    action: "Google 登录开启后填写 OAuth Client ID。",
  },
  {
    key: "GOOGLE_CLIENT_SECRET",
    group: "登录",
    label: "Google OAuth Client Secret",
    kind: "secret",
    statusWhenInvalid: "blocking",
    enabledBy: "AUTH_GOOGLE_ENABLED",
    action: "Google 登录开启后填写 OAuth Client Secret，并只放在服务端环境。",
  },
  {
    key: "AUTH_WECHAT_ENABLED",
    group: "登录",
    label: "微信扫码登录",
    kind: "toggle",
    statusWhenInvalid: "warning",
    expected: "true",
    action: "微信开放平台网站应用通过后再开启扫码登录。",
  },
  {
    key: "WECHAT_APP_ID",
    group: "登录",
    label: "微信开放平台 App ID",
    kind: "plain",
    statusWhenInvalid: "blocking",
    enabledByAny: ["AUTH_WECHAT_ENABLED", "WECHAT_PAY_ENABLED"],
    action: "微信开放平台应用或微信支付 Native 支付通过后填写 App ID。",
  },
  {
    key: "WECHAT_APP_SECRET",
    group: "登录",
    label: "微信开放平台 Secret",
    kind: "secret",
    statusWhenInvalid: "blocking",
    enabledBy: "AUTH_WECHAT_ENABLED",
    action: "微信开放平台应用通过后填写 App Secret。",
  },
  {
    key: "OPENAI_BASE_URL",
    group: "AI 能力",
    label: "OpenAI API 地址",
    kind: "plain",
    statusWhenInvalid: "warning",
    action: "官方接口可留空；使用兼容中转时填写包含 /v1 的基础地址。",
  },
  {
    key: "OPENAI_API_KEY",
    group: "AI 能力",
    label: "OpenAI API Key",
    kind: "secret",
    statusWhenInvalid: "blocking",
    action: "配置生产 API Key，运行模型读取诊断并设置预算上限。",
  },
  {
    key: "OPENAI_USER_AGENT",
    group: "AI 能力",
    label: "OpenAI 请求标识",
    kind: "plain",
    statusWhenInvalid: "warning",
    action: "兼容中转站如有 WAF，请配置稳定的服务端 User-Agent。",
  },
  {
    key: "OPENAI_DEFAULT_MODEL",
    group: "AI 能力",
    label: "默认对话模型",
    kind: "plain",
    statusWhenInvalid: "blocking",
    action: "配置日常对话和命理解读的默认模型。",
  },
  {
    key: "OPENAI_FAST_MODEL",
    group: "AI 能力",
    label: "低成本模型",
    kind: "plain",
    statusWhenInvalid: "blocking",
    action: "配置分类、标题、轻量引导等低成本模型。",
  },
  {
    key: "OPENAI_PREMIUM_MODEL",
    group: "AI 能力",
    label: "深度报告模型",
    kind: "plain",
    statusWhenInvalid: "blocking",
    action: "配置深度报告使用的高质量模型。",
  },
  {
    key: "OPENAI_VISION_MODEL",
    group: "AI 能力",
    label: "手相视觉模型",
    kind: "plain",
    statusWhenInvalid: "blocking",
    action: "配置支持图片输入的视觉模型，并验证七牛公开 URL 可被读取。",
  },
  {
    key: "OPENAI_DEFAULT_INPUT_CENTS_PER_1M_TOKENS",
    group: "AI 能力",
    label: "OpenAI 输入成本费率",
    kind: "plain",
    statusWhenInvalid: "warning",
    action: "填入当前 OpenAI 输入 token 费率，单位为人民币分/百万 token，用于自动估算 costCents。",
  },
  {
    key: "OPENAI_DEFAULT_OUTPUT_CENTS_PER_1M_TOKENS",
    group: "AI 能力",
    label: "OpenAI 输出成本费率",
    kind: "plain",
    statusWhenInvalid: "warning",
    action: "填入当前 OpenAI 输出 token 费率，单位为人民币分/百万 token，用于自动估算 costCents。",
  },
  {
    key: "PAYMENT_PROVIDER",
    group: "支付",
    label: "支付模式",
    kind: "plain",
    statusWhenInvalid: "warning",
    expected: "live",
    action: "真实支付资质完成前可保持 mock；资质完成后再切换为 live。",
  },
  {
    key: "LIVE_PAYMENT_SMOKE_TEST_USER_IDS",
    group: "支付",
    label: "真实支付灰度白名单",
    kind: "plain",
    statusWhenInvalid: "warning",
    readyWhenAnyPresent: [
      "LIVE_PAYMENT_SMOKE_TEST_USER_IDS",
      "LIVE_PAYMENT_SMOKE_TEST_EMAILS",
    ],
    action:
      "paid_smoke 阶段配置内部测试账号 userId，或用 LIVE_PAYMENT_SMOKE_TEST_EMAILS 配置测试邮箱；完成小额订单留证后再放量。",
  },
  {
    key: "PAYMENT_CALLBACK_DEV_BYPASS",
    group: "支付",
    label: "支付回调开发旁路",
    kind: "toggle",
    statusWhenInvalid: "blocking",
    expected: "false",
    defaultValue: "false",
    action: "生产环境必须保持 false，避免绕过真实回调验签。",
  },
  {
    key: "ALIPAY_ENABLED",
    group: "支付宝",
    label: "支付宝开关",
    kind: "toggle",
    statusWhenInvalid: "warning",
    expected: "true",
    action: "支付宝应用通过并完成参数配置后开启。",
  },
  {
    key: "ALIPAY_GATEWAY",
    group: "支付宝",
    label: "支付宝网关",
    kind: "url",
    statusWhenInvalid: "warning",
    action: "生产环境使用支付宝正式网关。",
  },
  {
    key: "ALIPAY_APP_ID",
    group: "支付宝",
    label: "支付宝 App ID",
    kind: "plain",
    statusWhenInvalid: "warning",
    enabledBy: "ALIPAY_ENABLED",
    action: "支付宝开放平台应用通过后填写 APP_ID。",
  },
  {
    key: "ALIPAY_PRIVATE_KEY",
    group: "支付宝",
    label: "支付宝应用私钥",
    kind: "secret",
    statusWhenInvalid: "warning",
    enabledBy: "ALIPAY_ENABLED",
    action: "填写应用私钥，注意不要提交到代码仓库。",
  },
  {
    key: "ALIPAY_PUBLIC_KEY",
    group: "支付宝",
    label: "支付宝公钥",
    kind: "secret",
    statusWhenInvalid: "warning",
    enabledBy: "ALIPAY_ENABLED",
    action: "填写支付宝公钥并运行支付宝签名诊断。",
  },
  {
    key: "WECHAT_PAY_ENABLED",
    group: "微信支付",
    label: "微信支付开关",
    kind: "toggle",
    statusWhenInvalid: "warning",
    expected: "true",
    action: "微信支付商户号通过并完成参数配置后开启。",
  },
  {
    key: "WECHAT_PAY_MCH_ID",
    group: "微信支付",
    label: "微信支付商户号",
    kind: "plain",
    statusWhenInvalid: "warning",
    enabledBy: "WECHAT_PAY_ENABLED",
    action: "填写微信支付商户号 mch_id。",
  },
  {
    key: "WECHAT_PAY_API_V3_KEY",
    group: "微信支付",
    label: "微信支付 API v3 key",
    kind: "secret",
    statusWhenInvalid: "warning",
    enabledBy: "WECHAT_PAY_ENABLED",
    action: "填写 API v3 key，注意妥善保管。",
  },
  {
    key: "WECHAT_PAY_PRIVATE_KEY",
    group: "微信支付",
    label: "微信支付商户私钥",
    kind: "secret",
    statusWhenInvalid: "warning",
    enabledBy: "WECHAT_PAY_ENABLED",
    action: "填写商户私钥并运行微信支付签名诊断。",
  },
  {
    key: "WECHAT_PAY_SERIAL_NO",
    group: "微信支付",
    label: "微信支付证书序列号",
    kind: "plain",
    statusWhenInvalid: "warning",
    enabledBy: "WECHAT_PAY_ENABLED",
    action: "填写商户证书序列号。",
  },
  {
    key: "WECHAT_PAY_PLATFORM_PUBLIC_KEY",
    group: "微信支付",
    label: "微信支付平台公钥",
    kind: "secret",
    statusWhenInvalid: "warning",
    enabledBy: "WECHAT_PAY_ENABLED",
    action: "填写平台公钥并验证回调验签链路。",
  },
  {
    key: "QINIU_ACCESS_KEY",
    group: "七牛云",
    label: "七牛 Access Key",
    kind: "secret",
    statusWhenInvalid: "warning",
    action: "填写七牛 Access Key，用于生成上传凭证。",
  },
  {
    key: "QINIU_SECRET_KEY",
    group: "七牛云",
    label: "七牛 Secret Key",
    kind: "secret",
    statusWhenInvalid: "warning",
    action: "填写七牛 Secret Key，并确保只存在服务端环境。",
  },
  {
    key: "QINIU_BUCKET",
    group: "七牛云",
    label: "七牛 bucket",
    kind: "plain",
    statusWhenInvalid: "warning",
    action: "填写存放手相图片的 bucket 名称。",
  },
  {
    key: "QINIU_REGION",
    group: "七牛云",
    label: "七牛区域",
    kind: "plain",
    statusWhenInvalid: "warning",
    action: "填写 bucket 所在区域。",
  },
  {
    key: "QINIU_PUBLIC_DOMAIN",
    group: "七牛云",
    label: "七牛公开域名",
    kind: "url",
    statusWhenInvalid: "warning",
    action: "绑定并填写可公开访问的 HTTPS 图片域名。",
  },
] satisfies EnvSpec[];

function rawValue(env: Env, key: string, fallback?: string) {
  return env[key]?.trim() || fallback || "";
}

function isPlaceholder(value: string) {
  const normalized = value.trim().toLowerCase();

  return (
    !normalized ||
    normalized.startsWith("<") ||
    normalized.includes("<") ||
    normalized.includes(">") ||
    normalized.includes("your-") ||
    normalized.includes("example.") ||
    normalized.includes("replace") ||
    normalized.includes("changeme") ||
    normalized.includes("todo")
  );
}

function isLocalUrl(value: string) {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(value);
}

function hasConfiguredValue(env: Env, key: string) {
  const value = rawValue(env, key);

  return Boolean(value) && !isPlaceholder(value);
}

function configuredAlternative(env: Env, spec: EnvSpec) {
  return spec.readyWhenAnyPresent?.find((key) => hasConfiguredValue(env, key));
}

function enabledByAnySatisfied(env: Env, spec: EnvSpec) {
  return spec.enabledByAny?.some((key) => rawValue(env, key) === "true") ?? false;
}

function enabledDependencyLabel(spec: EnvSpec) {
  return spec.enabledBy ?? spec.enabledByAny?.join(" 或 ") ?? "相关开关";
}

function stateLabel(state: EnvState) {
  if (state === "ready") {
    return "已配置";
  }

  if (state === "placeholder") {
    return "占位值";
  }

  if (state === "local") {
    return "本地值";
  }

  if (state === "weak") {
    return "强度不足";
  }

  if (state === "mismatch") {
    return "不符合预期";
  }

  if (state === "waiting_toggle") {
    return "等待开关";
  }

  return "未配置";
}

function statusForState(state: EnvState, spec: EnvSpec): HealthStatus {
  if (state === "ready") {
    return "ready";
  }

  if (state === "waiting_toggle") {
    return "warning";
  }

  return spec.statusWhenInvalid;
}

function classifyState(env: Env, spec: EnvSpec): EnvState {
  const enabledBy = spec.enabledBy ? rawValue(env, spec.enabledBy) : undefined;

  if (spec.enabledBy && enabledBy !== "true") {
    return "waiting_toggle";
  }

  if (spec.enabledByAny && !enabledByAnySatisfied(env, spec)) {
    return "waiting_toggle";
  }

  if (configuredAlternative(env, spec)) {
    return "ready";
  }

  const value = rawValue(env, spec.key, spec.defaultValue);

  if (!value) {
    return "missing";
  }

  if (isPlaceholder(value)) {
    return "placeholder";
  }

  if (spec.invalidWhenLocal && isLocalUrl(value)) {
    return "local";
  }

  if (spec.kind === "url" && value && !value.startsWith("https://")) {
    return "mismatch";
  }

  if (spec.expected !== undefined && value !== spec.expected) {
    return "mismatch";
  }

  if (spec.minLength && value.length < spec.minLength) {
    return "weak";
  }

  return "ready";
}

function displayValue(env: Env, spec: EnvSpec, state: EnvState) {
  const value = rawValue(env, spec.key, spec.defaultValue);
  const alternative = configuredAlternative(env, spec);

  if (state === "ready" && alternative && alternative !== spec.key) {
    return `已通过 ${alternative} 配置`;
  }

  if (state === "missing") {
    return "未配置";
  }

  if (state === "placeholder") {
    return "仍是占位值";
  }

  if (state === "waiting_toggle") {
    return `等待 ${enabledDependencyLabel(spec)} 开启`;
  }

  if (spec.kind === "secret" || spec.kind === "connection") {
    return value ? `已隐藏，${value.length} 字符` : "未配置";
  }

  return value;
}

function detailForState(spec: EnvSpec, state: EnvState) {
  if (state === "ready") {
    return "当前变量已满足上线核对规则。";
  }

  if (state === "placeholder") {
    return "当前变量仍像模板占位值，需要替换为真实生产值。";
  }

  if (state === "local") {
    return "当前变量指向本地地址，正式收费上线不能使用。";
  }

  if (state === "weak") {
    return `当前变量长度不足，建议至少 ${spec.minLength} 字符。`;
  }

  if (state === "mismatch" && spec.expected !== undefined) {
    return `当前变量需要配置为 ${spec.expected}。`;
  }

  if (state === "mismatch" && spec.kind === "url") {
    return "当前变量应使用 HTTPS URL。";
  }

  if (state === "waiting_toggle") {
    return `当前依赖 ${enabledDependencyLabel(spec)} 开启后再核对。`;
  }

  return "当前变量未配置。";
}

function sourceItemsForKey(key: string, materialItems: Array<{ title: string; envKeys: string[] }>) {
  return materialItems
    .filter((item) => item.envKeys.includes(key))
    .map((item) => item.title);
}

function groupSummary(items: LaunchEnvChecklistItem[]) {
  const names = Array.from(new Set(items.map((item) => item.group)));

  return names.map((name) => {
    const groupItems = items.filter((item) => item.group === name);

    return {
      name,
      ready: groupItems.filter((item) => item.status === "ready").length,
      warning: groupItems.filter((item) => item.status === "warning").length,
      blocking: groupItems.filter((item) => item.status === "blocking").length,
      total: groupItems.length,
    };
  });
}

function statusRank(status: HealthStatus) {
  if (status === "blocking") {
    return 0;
  }

  if (status === "warning") {
    return 1;
  }

  return 2;
}

function readyLoginLabels(env: Env) {
  return [
    rawValue(env, "AUTH_GOOGLE_ENABLED") === "true" &&
    hasConfiguredValue(env, "GOOGLE_CLIENT_ID") &&
    hasConfiguredValue(env, "GOOGLE_CLIENT_SECRET")
      ? "Google"
      : undefined,
    rawValue(env, "AUTH_WECHAT_ENABLED") === "true" &&
    hasConfiguredValue(env, "WECHAT_APP_ID") &&
    hasConfiguredValue(env, "WECHAT_APP_SECRET")
      ? "微信"
      : undefined,
  ].filter(Boolean);
}

function loginEntry(env: Env, sourceItems: string[]): LaunchEnvChecklistItem {
  const labels = readyLoginLabels(env);
  const ready = labels.length > 0;

  return {
    key: "LOGIN_ANY",
    group: "登录",
    label: "至少一个登录方式",
    kind: "toggle",
    status: ready ? "ready" : "blocking",
    state: ready ? "ready" : "missing",
    stateLabel: ready ? "已配置" : "未配置",
    displayValue: ready ? `${labels.join("、")}登录可用` : "Google 和微信都未就绪",
    detail: ready ? "当前至少一种登录方式满足上线核对规则。" : "当前没有可用登录入口。",
    action: "当前生产入口以 Google 邮箱登录为主；至少配置 Google OAuth，或在微信资质就绪后开启微信登录。",
    sourceItems,
  };
}

export async function getLaunchEnvChecklist(env: Env = process.env) {
  const materials = await getLaunchMaterialPack();
  const specItems = specs.map((spec) => {
    const state = classifyState(env, spec);
    const status = statusForState(state, spec);

    return {
      key: spec.key,
      group: spec.group,
      label: spec.label,
      kind: spec.kind,
      status,
      state,
      stateLabel: stateLabel(state),
      displayValue: displayValue(env, spec, state),
      detail: detailForState(spec, state),
      action: spec.action,
      sourceItems: sourceItemsForKey(spec.key, materials.items),
    } satisfies LaunchEnvChecklistItem;
  });
  const items = [
    ...specItems,
    loginEntry(
      env,
      Array.from(
        new Set([
          ...sourceItemsForKey("AUTH_EMAIL_ENABLED", materials.items),
          ...sourceItemsForKey("AUTH_GOOGLE_ENABLED", materials.items),
          ...sourceItemsForKey("AUTH_WECHAT_ENABLED", materials.items),
        ]),
      ),
    ),
  ];
  const nextItems = [...items]
    .filter((item) => item.status !== "ready")
    .sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        a.group.localeCompare(b.group, "zh-CN") ||
        a.key.localeCompare(b.key, "zh-CN"),
    )
    .slice(0, 10);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      ready: items.filter((item) => item.status === "ready").length,
      warning: items.filter((item) => item.status === "warning").length,
      blocking: items.filter((item) => item.status === "blocking").length,
      total: items.length,
      missing: items.filter((item) => item.state === "missing").length,
      placeholder: items.filter((item) => item.state === "placeholder").length,
      secret: items.filter((item) => item.kind === "secret" || item.kind === "connection").length,
    },
    items,
    nextItems,
    groups: groupSummary(items),
  } satisfies LaunchEnvChecklist;
}
