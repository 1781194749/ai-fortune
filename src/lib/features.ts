type Env = Record<string, string | undefined>;

export type RuntimeFeatures = {
  authEmail: boolean;
  authGoogle: boolean;
  authWechat: boolean;
  paymentProvider: "mock" | "live";
  alipay: boolean;
  wechatPay: boolean;
  qiniuConfigured: boolean;
  openaiConfigured: boolean;
};

function enabled(value: string | undefined, fallback = false) {
  if (value == null) {
    return fallback;
  }

  return value === "true" || value === "1";
}

export function getRuntimeFeatures(env: Env = process.env): RuntimeFeatures {
  return {
    authEmail: enabled(env.AUTH_EMAIL_ENABLED, true),
    authGoogle: enabled(env.AUTH_GOOGLE_ENABLED),
    authWechat: enabled(env.AUTH_WECHAT_ENABLED),
    paymentProvider: env.PAYMENT_PROVIDER === "live" ? "live" : "mock",
    alipay: enabled(env.ALIPAY_ENABLED),
    wechatPay: enabled(env.WECHAT_PAY_ENABLED),
    qiniuConfigured: Boolean(
      env.QINIU_ACCESS_KEY &&
        env.QINIU_SECRET_KEY &&
        env.QINIU_BUCKET &&
        env.QINIU_PUBLIC_DOMAIN,
    ),
    openaiConfigured: Boolean(env.OPENAI_API_KEY),
  };
}

export function canUseLivePayment(features = getRuntimeFeatures()) {
  return features.paymentProvider === "live" && (features.alipay || features.wechatPay);
}
