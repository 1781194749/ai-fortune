import "server-only";

import { createDecipheriv, createSign, createVerify } from "crypto";
import {
  type ProductCode,
  type Product,
  formatPrice,
  getProduct,
  isProductCode,
} from "@/lib/commerce";
import {
  createPaymentOrder,
  getMockOrder,
  getOrderDisplay,
  markExternalPaymentOrderPaid,
  type MockOrder,
  type PaymentProviderCode,
} from "@/lib/mock-payment-store";
import type { AppliedPromotion } from "@/lib/promo-code";
import type { SessionPayload } from "@/lib/session";

export type LivePaymentChannel = "alipay" | "wechat_pay";

type PaymentStatus = {
  enabled: boolean;
  missingFields: string[];
};

const alipayRequiredFields = [
  "ALIPAY_APP_ID",
  "ALIPAY_PRIVATE_KEY",
  "ALIPAY_PUBLIC_KEY",
] as const;

const wechatRequiredFields = [
  "WECHAT_APP_ID",
  "WECHAT_PAY_MCH_ID",
  "WECHAT_PAY_API_V3_KEY",
  "WECHAT_PAY_PRIVATE_KEY",
  "WECHAT_PAY_SERIAL_NO",
  "WECHAT_PAY_PLATFORM_PUBLIC_KEY",
] as const;

function getAppUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

function normalizePem(value: string, type: "PRIVATE KEY" | "PUBLIC KEY") {
  if (value.includes("-----BEGIN")) {
    return value;
  }

  const body = value.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n") ?? value;
  return `-----BEGIN ${type}-----\n${body}\n-----END ${type}-----`;
}

function pickFields(fields: readonly string[]) {
  return fields.filter((field) => !process.env[field]);
}

export function getLivePaymentStatus(channel: LivePaymentChannel): PaymentStatus {
  if (channel === "alipay") {
    return {
      enabled: process.env.ALIPAY_ENABLED === "true",
      missingFields: pickFields(alipayRequiredFields),
    };
  }

  return {
    enabled: process.env.WECHAT_PAY_ENABLED === "true",
    missingFields: pickFields(wechatRequiredFields),
  };
}

function channelToProvider(channel: LivePaymentChannel): Exclude<PaymentProviderCode, "MOCK"> {
  return channel === "alipay" ? "ALIPAY" : "WECHAT_PAY";
}

function getChannelLabel(channel: LivePaymentChannel) {
  return channel === "alipay" ? "支付宝" : "微信支付";
}

function getAlipayGateway() {
  return process.env.ALIPAY_GATEWAY || "https://openapi.alipay.com/gateway.do";
}

function canonicalizeAlipayParams(params: Record<string, string>) {
  return Object.keys(params)
    .filter((key) => key !== "sign" && key !== "sign_type" && params[key] !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

function signAlipayParams(params: Record<string, string>) {
  const privateKey = process.env.ALIPAY_PRIVATE_KEY;

  if (!privateKey) {
    return null;
  }

  const signer = createSign("RSA-SHA256");
  signer.update(canonicalizeAlipayParams(params), "utf8");
  signer.end();

  return signer.sign(normalizePem(privateKey, "PRIVATE KEY"), "base64");
}

export function verifyAlipayNotify(params: Record<string, string>) {
  const publicKey = process.env.ALIPAY_PUBLIC_KEY;
  const signature = params.sign;

  if (!publicKey || !signature) {
    return false;
  }

  const verifier = createVerify("RSA-SHA256");
  verifier.update(canonicalizeAlipayParams(params), "utf8");
  verifier.end();

  return verifier.verify(normalizePem(publicKey, "PUBLIC KEY"), signature, "base64");
}

export function verifyWechatPayNotify(input: {
  body: string;
  timestamp: string | null;
  nonce: string | null;
  signature: string | null;
}) {
  const publicKey = process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY;

  if (!publicKey || !input.timestamp || !input.nonce || !input.signature) {
    return false;
  }

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${input.timestamp}\n${input.nonce}\n${input.body}\n`, "utf8");
  verifier.end();

  return verifier.verify(normalizePem(publicKey, "PUBLIC KEY"), input.signature, "base64");
}

export function decryptWechatPayResource(resource: unknown) {
  const apiV3Key = process.env.WECHAT_PAY_API_V3_KEY;

  if (
    typeof apiV3Key !== "string" ||
    Buffer.byteLength(apiV3Key, "utf8") !== 32 ||
    typeof resource !== "object" ||
    resource === null
  ) {
    return null;
  }

  const payload = resource as {
    ciphertext?: unknown;
    nonce?: unknown;
    associated_data?: unknown;
  };

  if (typeof payload.ciphertext !== "string" || typeof payload.nonce !== "string") {
    return null;
  }

  try {
    const encrypted = Buffer.from(payload.ciphertext, "base64");
    const authTag = encrypted.subarray(encrypted.length - 16);
    const data = encrypted.subarray(0, encrypted.length - 16);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(apiV3Key, "utf8"),
      Buffer.from(payload.nonce, "utf8"),
    );

    if (typeof payload.associated_data === "string") {
      decipher.setAAD(Buffer.from(payload.associated_data, "utf8"));
    }

    decipher.setAuthTag(authTag);

    const plainText = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    return JSON.parse(plainText) as {
      out_trade_no?: string;
      transaction_id?: string;
      trade_state?: string;
      appid?: string;
      mchid?: string;
      amount?: { total?: number };
    };
  } catch {
    return null;
  }
}

function parseCnyAmountCents(value: string | undefined) {
  if (!value || !/^\d+(\.\d{1,2})?$/.test(value)) {
    return undefined;
  }

  const [yuan = "0", cents = ""] = value.split(".");
  return Number(yuan) * 100 + Number(cents.padEnd(2, "0"));
}

function amountMatches(input: { expectedCents: number; actualCents: number | undefined }) {
  return input.actualCents !== undefined && input.actualCents === input.expectedCents;
}

export type LivePaymentNotifyValidation =
  | { ok: true; order: MockOrder }
  | {
      ok: false;
      reason:
        | "ORDER_ID_MISSING"
        | "ORDER_NOT_FOUND"
        | "PROVIDER_MISMATCH"
        | "APP_ID_MISMATCH"
        | "MCH_ID_MISMATCH"
        | "AMOUNT_MISMATCH";
      message: string;
    };

function validationFailure(
  reason: Exclude<LivePaymentNotifyValidation, { ok: true }>["reason"],
  message: string,
): LivePaymentNotifyValidation {
  return { ok: false, reason, message };
}

export async function validateAlipayNotifyBusiness(params: Record<string, string>) {
  const orderId = params.out_trade_no;

  if (!orderId) {
    return validationFailure("ORDER_ID_MISSING", "支付宝通知缺少 out_trade_no。");
  }

  const order = await getMockOrder(orderId);

  if (!order) {
    return validationFailure("ORDER_NOT_FOUND", "支付宝通知对应订单不存在。");
  }

  if (order.provider !== "ALIPAY") {
    return validationFailure("PROVIDER_MISMATCH", "支付宝通知对应订单渠道不匹配。");
  }

  if (process.env.ALIPAY_APP_ID && params.app_id && params.app_id !== process.env.ALIPAY_APP_ID) {
    return validationFailure("APP_ID_MISMATCH", "支付宝通知 app_id 与当前应用不匹配。");
  }

  if (!amountMatches({
    expectedCents: order.amountCents,
    actualCents: parseCnyAmountCents(params.total_amount),
  })) {
    return validationFailure("AMOUNT_MISMATCH", "支付宝通知金额与本地订单金额不一致。");
  }

  return { ok: true as const, order };
}

function readWechatAmountCents(payload: unknown) {
  if (typeof payload !== "object" || payload === null || !("amount" in payload)) {
    return undefined;
  }

  const amount = (payload as { amount?: unknown }).amount;

  if (typeof amount !== "object" || amount === null || !("total" in amount)) {
    return undefined;
  }

  const total = (amount as { total?: unknown }).total;
  return typeof total === "number" && Number.isInteger(total) ? total : undefined;
}

export async function validateWechatPayNotifyBusiness(payload: {
  out_trade_no?: string;
  appid?: string;
  mchid?: string;
  amount?: { total?: number };
}) {
  const orderId = payload.out_trade_no;

  if (!orderId) {
    return validationFailure("ORDER_ID_MISSING", "微信支付通知缺少 out_trade_no。");
  }

  const order = await getMockOrder(orderId);

  if (!order) {
    return validationFailure("ORDER_NOT_FOUND", "微信支付通知对应订单不存在。");
  }

  if (order.provider !== "WECHAT_PAY") {
    return validationFailure("PROVIDER_MISMATCH", "微信支付通知对应订单渠道不匹配。");
  }

  if (process.env.WECHAT_APP_ID && payload.appid && payload.appid !== process.env.WECHAT_APP_ID) {
    return validationFailure("APP_ID_MISMATCH", "微信支付通知 appid 与当前应用不匹配。");
  }

  if (
    process.env.WECHAT_PAY_MCH_ID &&
    payload.mchid &&
    payload.mchid !== process.env.WECHAT_PAY_MCH_ID
  ) {
    return validationFailure("MCH_ID_MISMATCH", "微信支付通知 mchid 与当前商户不匹配。");
  }

  if (!amountMatches({
    expectedCents: order.amountCents,
    actualCents: readWechatAmountCents(payload),
  })) {
    return validationFailure("AMOUNT_MISMATCH", "微信支付通知金额与本地订单金额不一致。");
  }

  return { ok: true as const, order };
}

export function isLivePaymentChannel(value: string): value is LivePaymentChannel {
  return value === "alipay" || value === "wechat_pay";
}

export async function createLivePaymentCheckout(input: {
  session: SessionPayload;
  productCode: ProductCode;
  product?: Product;
  channel: LivePaymentChannel;
  promotion?: AppliedPromotion;
}) {
  const product = input.product ?? getProduct(input.productCode);

  if (!product || !isProductCode(input.productCode)) {
    return { ok: false as const, message: "商品不存在或暂不可购买。" };
  }

  const status = getLivePaymentStatus(input.channel);
  const channelLabel = getChannelLabel(input.channel);

  if (!status.enabled) {
    return {
      ok: false as const,
      message: `${channelLabel}尚未开启。当前可继续使用 mock payment 验证收费闭环。`,
      missingFields: status.missingFields,
    };
  }

  if (status.missingFields.length > 0) {
    return {
      ok: false as const,
      message: `${channelLabel}参数未配置完整：${status.missingFields.join(", ")}。`,
      missingFields: status.missingFields,
    };
  }

  const provider = channelToProvider(input.channel);
  const order = await createPaymentOrder(input.session.userId, input.productCode, provider, {
    promotion: input.promotion,
    product,
  });
  const displayOrder = getOrderDisplay(order);
  const appUrl = getAppUrl();

  if (input.channel === "alipay") {
    const params: Record<string, string> = {
      app_id: process.env.ALIPAY_APP_ID ?? "",
      method: "alipay.trade.page.pay",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
      version: "1.0",
      notify_url: `${appUrl}/api/payments/alipay/notify`,
      return_url: `${appUrl}/member`,
      biz_content: JSON.stringify({
        out_trade_no: order.id,
        product_code: "FAST_INSTANT_TRADE_PAY",
        total_amount: (order.amountCents / 100).toFixed(2),
        subject: product.name,
      }),
    };
    const sign = signAlipayParams(params);

    return {
      ok: true as const,
      channel: input.channel,
      order: displayOrder,
      checkout: {
        type: "alipay_page_pay",
        gateway: getAlipayGateway(),
        params: sign ? { ...params, sign } : params,
        priceLabel: formatPrice(order.amountCents, order.currency),
      },
    };
  }

  return {
    ok: true as const,
    channel: input.channel,
    order: displayOrder,
    checkout: {
      type: "wechat_native_prepare",
      endpoint: "https://api.mch.weixin.qq.com/v3/pay/transactions/native",
      request: {
        appid: process.env.WECHAT_APP_ID,
        mchid: process.env.WECHAT_PAY_MCH_ID,
        description: product.name,
        out_trade_no: order.id,
        notify_url: `${appUrl}/api/payments/wechat/notify`,
        amount: {
          total: order.amountCents,
          currency: order.currency,
        },
      },
      priceLabel: formatPrice(order.amountCents, order.currency),
    },
  };
}

export async function markPaidFromLiveNotify(input: {
  orderId: string;
  channel: LivePaymentChannel;
  providerOrderId?: string;
  notifyPayload?: unknown;
}) {
  return markExternalPaymentOrderPaid({
    orderId: input.orderId,
    provider: channelToProvider(input.channel),
    providerOrderId: input.providerOrderId,
    notifyPayload: input.notifyPayload,
  });
}
