import "server-only";

import { getRuntimeFeatures } from "@/lib/features";

export type HealthStatus = "ready" | "warning" | "blocking";

export type HealthCheck = {
  id: string;
  group: string;
  label: string;
  status: HealthStatus;
  detail: string;
  action: string;
};

type Env = Record<string, string | undefined>;

function present(env: Env, key: string) {
  return Boolean(env[key]?.trim());
}

function allPresent(env: Env, keys: string[]) {
  return keys.every((key) => present(env, key));
}

function isLocalUrl(value: string | undefined) {
  return !value || /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(value);
}

function check(
  input: Omit<HealthCheck, "status"> & {
    status: HealthStatus;
  },
) {
  return input;
}

export function getProductionHealthChecks(env: Env = process.env) {
  const features = getRuntimeFeatures(env);
  const livePaymentEnabled = features.paymentProvider === "live";
  const visionModel = env.OPENAI_VISION_MODEL?.trim() || env.OPENAI_DEFAULT_MODEL?.trim();
  const alipayFields = ["ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY", "ALIPAY_PUBLIC_KEY"];
  const wechatPayFields = [
    "WECHAT_PAY_MCH_ID",
    "WECHAT_PAY_API_V3_KEY",
    "WECHAT_PAY_PRIVATE_KEY",
    "WECHAT_PAY_SERIAL_NO",
    "WECHAT_PAY_PLATFORM_PUBLIC_KEY",
  ];
  const qiniuFields = [
    "QINIU_ACCESS_KEY",
    "QINIU_SECRET_KEY",
    "QINIU_BUCKET",
    "QINIU_PUBLIC_DOMAIN",
  ];
  const alipayReady = env.ALIPAY_ENABLED === "true" && allPresent(env, alipayFields);
  const wechatPayReady = env.WECHAT_PAY_ENABLED === "true" && allPresent(env, wechatPayFields);
  const anyLivePaymentReady = livePaymentEnabled && (alipayReady || wechatPayReady);
  const googleLoginReady =
    env.AUTH_GOOGLE_ENABLED === "true" &&
    present(env, "GOOGLE_CLIENT_ID") &&
    present(env, "GOOGLE_CLIENT_SECRET");
  const wechatLoginReady =
    env.AUTH_WECHAT_ENABLED === "true" &&
    present(env, "WECHAT_APP_ID") &&
    present(env, "WECHAT_APP_SECRET");
  const googleLoginMissingFields = [
    !present(env, "GOOGLE_CLIENT_ID") ? "GOOGLE_CLIENT_ID" : undefined,
    !present(env, "GOOGLE_CLIENT_SECRET") ? "GOOGLE_CLIENT_SECRET" : undefined,
  ].filter(Boolean);
  const readyLoginLabels = [
    googleLoginReady ? "Google" : undefined,
    wechatLoginReady ? "微信" : undefined,
  ].filter(Boolean);
  const anyLoginReady = readyLoginLabels.length > 0;
  const adminEmailConfigured = present(env, "ADMIN_EMAIL") || present(env, "ADMIN_EMAILS");
  const adminAccessReady =
    env.ADMIN_DASHBOARD_ENABLED === "true" && present(env, "ADMIN_ACCESS_TOKEN");

  return [
    check({
      id: "app-url",
      group: "基础配置",
      label: "正式域名 APP_URL",
      status: isLocalUrl(env.APP_URL) ? "blocking" : "ready",
      detail: env.APP_URL || "未配置",
      action: "域名审核通过后配置正式 HTTPS 域名；审核中可先用本地或内测环境验证核心流程。",
    }),
    check({
      id: "auth-secret",
      group: "基础配置",
      label: "会话密钥 AUTH_SESSION_SECRET",
      status: present(env, "AUTH_SESSION_SECRET") ? "ready" : "blocking",
      detail: present(env, "AUTH_SESSION_SECRET") ? "已配置" : "未配置",
      action: "生产环境必须配置高强度随机密钥，避免使用开发默认值。",
    }),
    check({
      id: "database",
      group: "基础配置",
      label: "PostgreSQL DATABASE_URL",
      status: present(env, "DATABASE_URL") ? "ready" : "blocking",
      detail: present(env, "DATABASE_URL") ? "已配置" : "未配置",
      action: "配置生产 PostgreSQL，并执行 npm run prisma:migrate:deploy。",
    }),
    check({
      id: "admin",
      group: "基础配置",
      label: "后台访问保护",
      status: adminAccessReady ? "ready" : "blocking",
      detail:
        env.ADMIN_DASHBOARD_ENABLED === "true"
          ? present(env, "ADMIN_ACCESS_TOKEN")
            ? adminEmailConfigured
              ? "已开启并配置 token / 管理员邮箱"
              : "已开启并配置 token，使用系统默认管理员邮箱"
            : "已开启但缺少访问 token"
          : "未开启",
      action: "生产环境启用后台时必须设置 ADMIN_ACCESS_TOKEN；如需替换默认管理员，请配置 ADMIN_EMAIL 或 ADMIN_EMAILS。",
    }),
    check({
      id: "login-any",
      group: "登录",
      label: "至少一个登录方式",
      status: anyLoginReady ? "ready" : "blocking",
      detail: anyLoginReady
        ? `${readyLoginLabels.join("、")}登录可用`
        : "Google 和微信登录都未就绪",
      action: "当前生产入口以 Google 邮箱登录为主；至少配置 Google OAuth，或在微信资质就绪后开启微信登录。",
    }),
    check({
      id: "google-login",
      group: "登录",
      label: "Google 登录",
      status:
        env.AUTH_GOOGLE_ENABLED === "true"
          ? googleLoginReady
            ? "ready"
            : "blocking"
          : "warning",
      detail:
        env.AUTH_GOOGLE_ENABLED === "true"
          ? googleLoginReady
            ? "已开启并完成 OAuth 配置"
            : `缺少 ${googleLoginMissingFields.join("、") || "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET"}`
          : "未开启，当前生产登录入口不可用",
      action: "开启 AUTH_GOOGLE_ENABLED=true，并配置 Client ID 和 Client Secret。",
    }),
    check({
      id: "openai",
      group: "AI 能力",
      label: "OpenAI API Key",
      status: features.openaiConfigured ? "ready" : "blocking",
      detail: features.openaiConfigured ? "已配置" : "未配置，核心 AI 能力不可上线",
      action: "配置 OPENAI_API_KEY、默认模型和视觉模型，才能获得真实 LLM 表达和图片分析能力。",
    }),
    check({
      id: "openai-vision",
      group: "AI 能力",
      label: "手相视觉模型",
      status: features.openaiConfigured && visionModel ? "ready" : "blocking",
      detail: features.openaiConfigured
        ? visionModel
          ? `使用 ${visionModel}`
          : "未配置 OPENAI_VISION_MODEL"
        : "未配置 OpenAI，手相视觉不可上线",
      action: "建议为手相图片分析单独配置 OPENAI_VISION_MODEL，并确保七牛图片 URL 可被模型访问。",
    }),
    check({
      id: "qiniu",
      group: "图片存储",
      label: "七牛云配置",
      status: allPresent(env, qiniuFields) ? "ready" : "warning",
      detail: allPresent(env, qiniuFields)
        ? "已配置"
        : `缺少 ${qiniuFields.filter((key) => !present(env, key)).join(", ")}`,
      action: "配置七牛 AK/SK、bucket、公开域名和跨域规则，手相上传才能走真实存储。",
    }),
    check({
      id: "payment-mode",
      group: "支付",
      label: "支付模式",
      status: livePaymentEnabled ? "ready" : "warning",
      detail: `当前 PAYMENT_PROVIDER=${features.paymentProvider}`,
      action: "真实支付资质完成前可保持 mock；资质完成后切换 PAYMENT_PROVIDER=live。",
    }),
    check({
      id: "payment-channel",
      group: "支付",
      label: "真实支付渠道",
      status: anyLivePaymentReady ? "ready" : "warning",
      detail: anyLivePaymentReady
        ? [alipayReady ? "支付宝已就绪" : undefined, wechatPayReady ? "微信支付已就绪" : undefined]
            .filter(Boolean)
            .join("，")
        : "尚无可用于真实收款的完整支付渠道",
      action: "支付资质完成后，至少完成支付宝或微信支付其中一个渠道的商户参数、签名诊断和小额订单验收。",
    }),
    check({
      id: "alipay",
      group: "支付",
      label: "支付宝",
      status:
        env.ALIPAY_ENABLED === "true"
          ? allPresent(env, alipayFields)
            ? "ready"
            : "warning"
          : "warning",
      detail:
        env.ALIPAY_ENABLED === "true"
          ? allPresent(env, alipayFields)
            ? "已开启并配置"
            : `缺少 ${alipayFields.filter((key) => !present(env, key)).join(", ")}`
          : "未开启",
      action: "主体和应用就绪后配置 APP_ID、公私钥，并完成异步通知验签联调。",
    }),
    check({
      id: "wechat-pay",
      group: "支付",
      label: "微信支付",
      status:
        env.WECHAT_PAY_ENABLED === "true"
          ? allPresent(env, wechatPayFields)
            ? "ready"
            : "warning"
          : "warning",
      detail:
        env.WECHAT_PAY_ENABLED === "true"
          ? allPresent(env, wechatPayFields)
            ? "已开启并配置"
            : `缺少 ${wechatPayFields.filter((key) => !present(env, key)).join(", ")}`
          : "未开启",
      action: "主体和商户号就绪后配置 mch_id、API v3 key、商户私钥、证书序列号和平台公钥。",
    }),
    check({
      id: "wechat-login",
      group: "登录",
      label: "微信扫码登录",
      status:
        env.AUTH_WECHAT_ENABLED === "true"
          ? present(env, "WECHAT_APP_ID") && present(env, "WECHAT_APP_SECRET")
            ? "ready"
            : "blocking"
          : "warning",
      detail:
        env.AUTH_WECHAT_ENABLED === "true"
          ? "已开启"
          : "未开启，当前可使用 Google 登录承接",
      action: "微信开放平台资质完成后配置 App ID 和 App Secret；未开启时保持其他登录方式可用。",
    }),
    check({
      id: "compliance",
      group: "合规",
      label: "域名、备案、协议",
      status:
        present(env, "ICP_RECORD_NO") && present(env, "COMPANY_NAME")
          ? "ready"
          : "blocking",
      detail:
        present(env, "ICP_RECORD_NO") && present(env, "COMPANY_NAME")
          ? "已配置主体与备案号"
          : "主体/ICP备案信息未配置",
      action: "确定主体、域名和备案号后，将 COMPANY_NAME、ICP_RECORD_NO 展示到页脚和协议中。",
    }),
  ] satisfies HealthCheck[];
}

export function summarizeHealth(checks: HealthCheck[]) {
  return {
    ready: checks.filter((item) => item.status === "ready").length,
    warning: checks.filter((item) => item.status === "warning").length,
    blocking: checks.filter((item) => item.status === "blocking").length,
    total: checks.length,
  };
}
