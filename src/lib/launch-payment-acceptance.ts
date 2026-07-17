import "server-only";

import {
  formatPrice,
  getProduct,
  type ProductCode,
} from "@/lib/commerce";
import type { HealthStatus } from "@/lib/health-checks";
import {
  getAdminOrders,
  getAdminWalletTransactions,
  type MockOrder,
  type MockWalletTransaction,
  type PaymentProviderCode,
} from "@/lib/mock-payment-store";
import {
  getLivePaymentStatus,
  isLivePaymentChannel,
  type LivePaymentChannel,
} from "@/lib/payment-adapters";
import {
  createUsageLog,
  getUsageLogsByFeature,
  type UsageLogRecord,
} from "@/lib/usage-log-store";

export const launchPaymentAcceptanceEvidenceFeature = "launch_payment_acceptance_evidence";

export type LaunchPaymentAcceptanceItem = {
  id: string;
  group: string;
  title: string;
  status: HealthStatus;
  detail: string;
  action: string;
  evidence: string;
};

export type LaunchPaymentAcceptanceChannel = {
  id: LivePaymentChannel;
  label: string;
  provider: Exclude<PaymentProviderCode, "MOCK">;
  status: HealthStatus;
  enabled: boolean;
  missingFields: string[];
  orderCount: number;
  paidOrderCount: number;
  evidenceRecordCount: number;
  latestOrder?: LaunchPaymentAcceptanceOrder;
  latestPaidOrder?: LaunchPaymentAcceptanceOrder;
  entitlementTransaction?: LaunchPaymentAcceptanceWalletTransaction;
  latestEvidence?: LaunchPaymentAcceptanceEvidenceRecord;
  items: LaunchPaymentAcceptanceItem[];
};

export type LaunchPaymentAcceptanceOrder = {
  id: string;
  userId: string;
  productCode: ProductCode;
  productName: string;
  amountCents: number;
  currency: MockOrder["currency"];
  priceLabel: string;
  status: MockOrder["status"];
  providerOrderId?: string;
  createdAt: string;
  paidAt?: string;
};

export type LaunchPaymentAcceptanceWalletTransaction = {
  id: string;
  userId: string;
  orderId?: string;
  type: MockWalletTransaction["type"];
  amount: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
};

export type LaunchPaymentAcceptanceEvidenceMetadata = {
  event: "launch_payment_acceptance_evidence_saved";
  channel: LivePaymentChannel;
  channelLabel: string;
  status: HealthStatus;
  orderId?: string;
  providerOrderId?: string;
  amountCents?: number;
  priceLabel?: string;
  evidenceUrl?: string;
  reconciliationUrl?: string;
  note?: string;
  savedAt: string;
  savedBy: string;
  path?: string;
  userAgent?: string;
  ipHint?: string;
};

export type LaunchPaymentAcceptanceEvidenceRecord = {
  id: string;
  createdAt: string;
  metadata: LaunchPaymentAcceptanceEvidenceMetadata;
};

export type LaunchPaymentAcceptance = {
  generatedAt: string;
  status: HealthStatus;
  label: string;
  detail: string;
  action: string;
  paymentMode: string;
  devBypassEnabled: boolean;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
    completedChannels: number;
    totalChannels: number;
    liveOrders: number;
    paidLiveOrders: number;
    evidenceRecords: number;
    latestPaidAt?: string;
    latestEvidenceAt?: string;
  };
  channels: LaunchPaymentAcceptanceChannel[];
  evidenceRecords: LaunchPaymentAcceptanceEvidenceRecord[];
  nextItems: LaunchPaymentAcceptanceItem[];
  copyText: string;
};

const channelConfigs = [
  { id: "alipay", label: "支付宝", provider: "ALIPAY" },
  { id: "wechat_pay", label: "微信支付", provider: "WECHAT_PAY" },
] satisfies Array<{
  id: LivePaymentChannel;
  label: string;
  provider: Exclude<PaymentProviderCode, "MOCK">;
}>;

function statusRank(status: HealthStatus) {
  if (status === "blocking") {
    return 0;
  }

  if (status === "warning") {
    return 1;
  }

  return 2;
}

function summarize(items: LaunchPaymentAcceptanceItem[]) {
  return {
    ready: items.filter((item) => item.status === "ready").length,
    warning: items.filter((item) => item.status === "warning").length,
    blocking: items.filter((item) => item.status === "blocking").length,
    total: items.length,
  };
}

function channelStatus(items: LaunchPaymentAcceptanceItem[]): HealthStatus {
  const summary = summarize(items);

  if (summary.blocking > 0) {
    return "blocking";
  }

  if (summary.warning > 0) {
    return "warning";
  }

  return "ready";
}

function toAcceptanceOrder(order: MockOrder): LaunchPaymentAcceptanceOrder {
  return {
    id: order.id,
    userId: order.userId,
    productCode: order.productCode,
    productName: order.productName,
    amountCents: order.amountCents,
    currency: order.currency,
    priceLabel: formatPrice(order.amountCents, order.currency),
    status: order.status,
    providerOrderId: order.providerOrderId,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
  };
}

function toAcceptanceTransaction(
  transaction: MockWalletTransaction,
): LaunchPaymentAcceptanceWalletTransaction {
  return {
    id: transaction.id,
    userId: transaction.userId,
    orderId: transaction.orderId,
    type: transaction.type,
    amount: transaction.amount,
    balanceAfter: transaction.balanceAfter,
    reason: transaction.reason,
    createdAt: transaction.createdAt,
  };
}

function requestPath(request: Request | undefined) {
  return request ? new URL(request.url).pathname : undefined;
}

function readHeader(request: Request | undefined, name: string) {
  return request?.headers.get(name) ?? undefined;
}

function maskClientIp(value: string | undefined) {
  const firstIp = value?.split(",")[0]?.trim();

  if (!firstIp) {
    return undefined;
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(firstIp)) {
    const parts = firstIp.split(".");

    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }

  const ipv6Parts = firstIp.split(":");

  if (ipv6Parts.length > 2) {
    return `${ipv6Parts.slice(0, 3).join(":")}::`;
  }

  return undefined;
}

function channelLabel(channel: LivePaymentChannel) {
  return channel === "alipay" ? "支付宝" : "微信支付";
}

function normalizeStatus(value: unknown) {
  if (value === "ready" || value === "warning" || value === "blocking") {
    return value satisfies HealthStatus;
  }

  throw new Error("STATUS_INVALID");
}

function normalizeOptionalText(value: unknown, maxLength = 180) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim().replace(/\s+/g, " ");

  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function normalizeOptionalUrl(value: unknown) {
  const text = normalizeOptionalText(value, 500);

  if (!text) {
    return undefined;
  }

  if (!/^https?:\/\/[^\s]+$/i.test(text)) {
    throw new Error("EVIDENCE_URL_INVALID");
  }

  return text;
}

function normalizeAmountCents(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100_000_000) {
    throw new Error("AMOUNT_INVALID");
  }

  return value;
}

function normalizeChannel(value: unknown) {
  if (typeof value !== "string" || !isLivePaymentChannel(value)) {
    throw new Error("CHANNEL_INVALID");
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStatus(value: unknown): HealthStatus {
  return value === "ready" || value === "warning" || value === "blocking" ? value : "warning";
}

function readPaymentAcceptanceEvidenceMetadata(
  log: UsageLogRecord,
): LaunchPaymentAcceptanceEvidenceMetadata | undefined {
  if (log.feature !== launchPaymentAcceptanceEvidenceFeature || !isRecord(log.metadata)) {
    return undefined;
  }

  if (log.metadata.event !== "launch_payment_acceptance_evidence_saved") {
    return undefined;
  }

  const channel = readString(log.metadata.channel);

  if (!channel || !isLivePaymentChannel(channel)) {
    return undefined;
  }

  return {
    event: "launch_payment_acceptance_evidence_saved",
    channel,
    channelLabel: readString(log.metadata.channelLabel) ?? channelLabel(channel),
    status: readStatus(log.metadata.status),
    orderId: readString(log.metadata.orderId),
    providerOrderId: readString(log.metadata.providerOrderId),
    amountCents: readNumber(log.metadata.amountCents),
    priceLabel: readString(log.metadata.priceLabel),
    evidenceUrl: readString(log.metadata.evidenceUrl),
    reconciliationUrl: readString(log.metadata.reconciliationUrl),
    note: readString(log.metadata.note),
    savedAt: readString(log.metadata.savedAt) ?? log.createdAt,
    savedBy: readString(log.metadata.savedBy) ?? "admin",
    path: readString(log.metadata.path),
    userAgent: readString(log.metadata.userAgent),
    ipHint: readString(log.metadata.ipHint),
  };
}

export async function getLaunchPaymentAcceptanceEvidenceRecords(input: { take?: number } = {}) {
  const logs = await getUsageLogsByFeature(launchPaymentAcceptanceEvidenceFeature, {
    take: input.take ?? 24,
  });

  return logs
    .map((log) => {
      const metadata = readPaymentAcceptanceEvidenceMetadata(log);

      if (!metadata) {
        return undefined;
      }

      return {
        id: log.id,
        createdAt: log.createdAt,
        metadata,
      } satisfies LaunchPaymentAcceptanceEvidenceRecord;
    })
    .filter((record): record is LaunchPaymentAcceptanceEvidenceRecord => Boolean(record));
}

export async function saveLaunchPaymentAcceptanceEvidence(input: {
  channel: unknown;
  status: unknown;
  orderId?: unknown;
  providerOrderId?: unknown;
  amountCents?: unknown;
  evidenceUrl?: unknown;
  reconciliationUrl?: unknown;
  note?: unknown;
  request?: Request;
  operator?: string;
}) {
  const savedAt = new Date().toISOString();
  const channel = normalizeChannel(input.channel);
  const amountCents = normalizeAmountCents(input.amountCents);
  const metadata = {
    event: "launch_payment_acceptance_evidence_saved",
    channel,
    channelLabel: channelLabel(channel),
    status: normalizeStatus(input.status),
    orderId: normalizeOptionalText(input.orderId, 120),
    providerOrderId: normalizeOptionalText(input.providerOrderId, 160),
    amountCents,
    priceLabel: amountCents === undefined ? undefined : formatPrice(amountCents, "CNY"),
    evidenceUrl: normalizeOptionalUrl(input.evidenceUrl),
    reconciliationUrl: normalizeOptionalUrl(input.reconciliationUrl),
    note: normalizeOptionalText(input.note, 260),
    savedAt,
    savedBy: input.operator ?? process.env.ADMIN_AUDIT_OPERATOR ?? "admin",
    path: requestPath(input.request),
    userAgent: readHeader(input.request, "user-agent"),
    ipHint: maskClientIp(
      readHeader(input.request, "x-forwarded-for") ??
        readHeader(input.request, "x-real-ip") ??
        readHeader(input.request, "cf-connecting-ip"),
    ),
  } satisfies LaunchPaymentAcceptanceEvidenceMetadata;

  const record = await createUsageLog({
    provider: "internal",
    model: "launch-payment-acceptance",
    feature: launchPaymentAcceptanceEvidenceFeature,
    costCents: 0,
    metadata,
  });

  return {
    id: record.id,
    createdAt: record.createdAt,
    metadata,
  } satisfies LaunchPaymentAcceptanceEvidenceRecord;
}

function newestOrder(orders: MockOrder[]) {
  return [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

function newestPaidOrder(orders: MockOrder[]) {
  return [...orders]
    .filter((order) => order.status === "PAID")
    .sort((a, b) => (b.paidAt ?? b.createdAt).localeCompare(a.paidAt ?? a.createdAt))[0];
}

function findEntitlementTransaction(input: {
  order: MockOrder | undefined;
  walletTransactions: MockWalletTransaction[];
}) {
  if (!input.order) {
    return undefined;
  }

  return input.walletTransactions.find(
    (transaction) =>
      transaction.orderId === input.order?.id &&
      transaction.type === "GRANT" &&
      transaction.amount > 0,
  );
}

function item(input: LaunchPaymentAcceptanceItem) {
  return input;
}

function buildChannel(input: {
  id: LivePaymentChannel;
  label: string;
  provider: Exclude<PaymentProviderCode, "MOCK">;
  orders: MockOrder[];
  walletTransactions: MockWalletTransaction[];
  evidenceRecords: LaunchPaymentAcceptanceEvidenceRecord[];
  paymentMode: string;
}) {
  const status = getLivePaymentStatus(input.id);
  const paymentModeDeferred = input.paymentMode !== "live";
  const statusForMode = (value: HealthStatus): HealthStatus =>
    paymentModeDeferred && value === "blocking" ? "warning" : value;
  const channelOrders = input.orders.filter((order) => order.provider === input.provider);
  const channelEvidenceRecords = input.evidenceRecords.filter(
    (record) => record.metadata.channel === input.id,
  );
  const latestEvidence = channelEvidenceRecords[0];
  const latestOrder = newestOrder(channelOrders);
  const latestPaidOrder = newestPaidOrder(channelOrders);
  const product = latestPaidOrder ? getProduct(latestPaidOrder.productCode) : undefined;
  const entitlementTransaction = findEntitlementTransaction({
    order: latestPaidOrder,
    walletTransactions: input.walletTransactions,
  });
  const configured = status.enabled && status.missingFields.length === 0;
  const paidWithProviderTradeNo = Boolean(latestPaidOrder?.providerOrderId);
  const entitlementExpected = Boolean(product?.starGrant && product.starGrant > 0);
  const entitlementReady = entitlementExpected
    ? Boolean(entitlementTransaction)
    : Boolean(latestPaidOrder);

  const items = [
    item({
      id: `${input.id}:config`,
      group: input.label,
      title: "商户参数与开关",
      status: statusForMode(configured ? "ready" : status.enabled ? "blocking" : "warning"),
      detail: configured
        ? `${input.label}已开启且核心商户参数完整。`
        : status.enabled
          ? `${input.label}已开启但缺少 ${status.missingFields.join("、")}。`
          : `${input.label}尚未开启。`,
      action: configured
        ? "保持生产密钥和商户参数不在前端暴露，进入小额订单验收。"
        : status.enabled
          ? "补齐缺失参数后，重新运行第三方诊断和生产预检。"
          : `主体资质通过后开启 ${input.label}，并填入商户参数。`,
      evidence: "生产环境变量、第三方诊断和支付平台应用/商户配置截图。",
    }),
    item({
      id: `${input.id}:order-created`,
      group: input.label,
      title: "小额真实订单创建",
      status: statusForMode(latestOrder ? "ready" : configured ? "blocking" : "warning"),
      detail: latestOrder
        ? `最近订单 ${latestOrder.id}，${latestOrder.productName}，${formatPrice(
            latestOrder.amountCents,
            latestOrder.currency,
          )}，状态 ${latestOrder.status}。`
        : "当前没有该渠道的真实支付订单记录。",
      action: latestOrder
        ? "保留订单号、商品、金额和支付渠道截图。"
        : "用正式域名登录会员页，选择体验卡或月度会员创建一笔小额真实订单。",
      evidence: "Order(provider=ALIPAY/WECHAT_PAY) 中出现 PENDING 或 PAID 订单。",
    }),
    item({
      id: `${input.id}:paid-callback`,
      group: input.label,
      title: "异步回调验签与支付成功",
      status: statusForMode(
        latestPaidOrder
          ? paidWithProviderTradeNo
            ? "ready"
            : "warning"
          : configured
            ? "blocking"
            : "warning",
      ),
      detail: latestPaidOrder
        ? paidWithProviderTradeNo
          ? `最近支付成功订单 ${latestPaidOrder.id}，平台交易号 ${latestPaidOrder.providerOrderId}。`
          : `最近支付成功订单 ${latestPaidOrder.id} 缺少平台交易号。`
        : "当前没有该渠道的 PAID 订单。",
      action: latestPaidOrder
        ? paidWithProviderTradeNo
          ? "用平台交易号到支付宝/微信商户后台核对金额和时间。"
          : "检查异步通知参数映射，确保 trade_no 或 transaction_id 写入 providerOrderId。"
        : "完成真实支付并等待异步通知，确认订单由 PENDING 变为 PAID。",
      evidence: "Order.status=PAID、paidAt、providerOrderId 和支付平台交易详情。",
    }),
    item({
      id: `${input.id}:entitlement`,
      group: input.label,
      title: "权益与星力到账",
      status: statusForMode(
        latestPaidOrder
          ? entitlementReady
            ? entitlementExpected
              ? "ready"
              : "warning"
            : "blocking"
          : configured
            ? "blocking"
            : "warning",
      ),
      detail: latestPaidOrder
        ? entitlementExpected
          ? entitlementTransaction
            ? `已发放 ${entitlementTransaction.amount} 星力，到账后余额 ${entitlementTransaction.balanceAfter}。`
            : `${latestPaidOrder.productName} 应发放 ${product?.starGrant ?? 0} 星力，但未找到钱包 GRANT 流水。`
          : `${latestPaidOrder.productName} 不是会员/星力发放商品，建议再用体验卡或月度会员验收权益到账。`
        : "当前没有可核对权益的支付成功订单。",
      action: latestPaidOrder
        ? entitlementExpected
          ? entitlementTransaction
            ? "截图保留会员中心余额、订单记录和钱包流水。"
            : "检查 markPaidFromLiveNotify 后的会员发放和钱包流水写入。"
          : "补充一笔带 starGrant 的会员商品小额订单，验证权益到账。"
        : "完成一笔会员商品真实支付后核对会员档位、星力和钱包流水。",
      evidence: "WalletTransaction(type=GRANT)、会员中心星力余额和订单权益到账截图。",
    }),
    item({
      id: `${input.id}:reconciliation`,
      group: input.label,
      title: "金额、交易号和对账留证",
      status: statusForMode(
        latestPaidOrder && paidWithProviderTradeNo && entitlementReady
          ? "ready"
          : latestPaidOrder
            ? "warning"
            : configured
              ? "blocking"
              : "warning",
      ),
      detail:
        latestPaidOrder && paidWithProviderTradeNo
          ? `${formatPrice(latestPaidOrder.amountCents, latestPaidOrder.currency)} 可用 ${latestPaidOrder.providerOrderId} 对账。`
          : "还不能形成完整对账证据。",
      action:
        latestPaidOrder && paidWithProviderTradeNo
          ? "把平台交易详情、订单详情、钱包流水和会员权益截图归入上线证据。"
          : "补齐 PAID 订单、平台交易号和权益到账记录后再归档上线证据。",
      evidence: "支付平台交易详情、Order、WalletTransaction 和上线证据归档记录。",
    }),
    item({
      id: `${input.id}:evidence-archive`,
      group: input.label,
      title: "小额验收证据快照",
      status: statusForMode(
        latestEvidence
          ? latestEvidence.metadata.status
          : latestPaidOrder && paidWithProviderTradeNo && entitlementReady
            ? "warning"
            : configured
              ? "blocking"
              : "warning",
      ),
      detail: latestEvidence
        ? `最近证据 ${latestEvidence.id}，${latestEvidence.metadata.status}，订单 ${latestEvidence.metadata.orderId ?? "未填"}，${latestEvidence.metadata.savedAt.slice(0, 16).replace("T", " ")}。`
        : "还没有保存该渠道的小额订单验收证据快照。",
      action: latestEvidence
        ? latestEvidence.metadata.status === "ready"
          ? "保持平台交易、站内订单、权益到账和对账截图可追溯。"
          : "复核证据备注，补齐缺失截图或对账链接后更新为 ready。"
        : "完成小额支付后，在后台保存订单号、平台交易号、截图链接、对账链接和验收备注。",
      evidence: "后台支付验收证据记录、平台交易详情、权益到账截图和对账凭证。",
    }),
  ];

  return {
    id: input.id,
    label: input.label,
    provider: input.provider,
    status: channelStatus(items),
    enabled: status.enabled,
    missingFields: status.missingFields,
    orderCount: channelOrders.length,
    paidOrderCount: channelOrders.filter((order) => order.status === "PAID").length,
    evidenceRecordCount: channelEvidenceRecords.length,
    latestOrder: latestOrder ? toAcceptanceOrder(latestOrder) : undefined,
    latestPaidOrder: latestPaidOrder ? toAcceptanceOrder(latestPaidOrder) : undefined,
    entitlementTransaction: entitlementTransaction
      ? toAcceptanceTransaction(entitlementTransaction)
      : undefined,
    latestEvidence,
    items,
  } satisfies LaunchPaymentAcceptanceChannel;
}

function buildCopyText(input: {
  status: HealthStatus;
  label: string;
  paymentMode: string;
  channels: LaunchPaymentAcceptanceChannel[];
  nextItems: LaunchPaymentAcceptanceItem[];
}) {
  const lines = input.channels.flatMap((channel) => [
    `${channel.label}：${channel.status}，订单 ${channel.orderCount}，支付成功 ${channel.paidOrderCount}，证据 ${channel.evidenceRecordCount}`,
    ...(channel.latestPaidOrder
      ? [
          `  最近成功：${channel.latestPaidOrder.id} / ${channel.latestPaidOrder.priceLabel} / ${
            channel.latestPaidOrder.providerOrderId ?? "缺平台交易号"
          }`,
        ]
      : []),
    ...(channel.latestEvidence
      ? [
          `  最近证据：${channel.latestEvidence.metadata.status} / ${
            channel.latestEvidence.metadata.orderId ?? "未填订单"
          } / ${channel.latestEvidence.metadata.savedAt.slice(0, 16).replace("T", " ")}`,
        ]
      : []),
  ]);
  const nextLines = input.nextItems.length
    ? input.nextItems.map(
        (item, index) =>
          `${index + 1}. [${item.status}] ${item.group} / ${item.title}：${item.action} 证据：${item.evidence}`,
      )
    : ["暂无支付验收缺口。"];

  return [
    "玄机 AI 真实支付小额订单验收",
    `状态：${input.label} (${input.status})`,
    `支付模式：${input.paymentMode}`,
    "",
    ...lines,
    "",
    "优先处理：",
    ...nextLines,
  ].join("\n");
}

function buildGlobalItems(input: {
  paymentMode: string;
  devBypassEnabled: boolean;
}): LaunchPaymentAcceptanceItem[] {
  return [
    item({
      id: "payment-mode",
      group: "支付总闸",
      title: "真实支付模式",
      status: input.paymentMode === "live" ? "ready" : "blocking",
      detail: `当前 PAYMENT_PROVIDER=${input.paymentMode}。`,
      action:
        input.paymentMode === "live"
          ? "保持真实支付模式，继续做渠道小额订单验收。"
          : "正式收费前切换 PAYMENT_PROVIDER=live，再创建支付宝或微信支付真实订单。",
      evidence: "生产环境变量 PAYMENT_PROVIDER=live，后台预检和健康页均显示真实支付模式。",
    }),
    item({
      id: "payment-callback-dev-bypass",
      group: "支付总闸",
      title: "支付回调开发旁路",
      status: input.devBypassEnabled ? "blocking" : "ready",
      detail: `PAYMENT_CALLBACK_DEV_BYPASS=${input.devBypassEnabled ? "true" : "false"}。`,
      action: input.devBypassEnabled
        ? "生产环境必须关闭开发旁路，确保支付宝/微信支付回调走真实验签。"
        : "保持开发旁路关闭，回调验收以真实签名为准。",
      evidence: "生产环境变量 PAYMENT_CALLBACK_DEV_BYPASS=false，支付回调验签日志无开发旁路。",
    }),
  ];
}

function launchStatus(input: {
  completedChannels: number;
  enabledChannels: number;
  summary: ReturnType<typeof summarize>;
  paymentMode: string;
  devBypassEnabled: boolean;
}) {
  if (
    input.paymentMode !== "live" ||
    input.devBypassEnabled ||
    input.completedChannels === 0 ||
    input.summary.blocking > 0
  ) {
    return {
      status: "blocking" as const,
      label: "真实支付小额验收未通过",
      detail:
        input.completedChannels === 0
          ? "当前还没有任何真实支付渠道完成小额订单、回调、交易号和权益到账闭环。"
          : "真实支付仍存在阻断项，暂不应放开收费流量。",
      action: "先切换 PAYMENT_PROVIDER=live，关闭开发回调旁路，至少完成一个渠道的小额真实订单验收。",
    };
  }

  if (input.completedChannels < input.enabledChannels || input.summary.warning > 0) {
    return {
      status: "warning" as const,
      label: "真实支付可小流量复核",
      detail: "至少一个真实支付渠道已完成小额订单闭环，但仍有渠道或证据项待复核。",
      action: "先按单渠道进入内部灰度，再补齐另一渠道和上线证据归档。",
    };
  }

  return {
    status: "ready" as const,
    label: "真实支付小额验收已闭合",
    detail: "已开启的真实支付渠道均完成订单、回调、交易号、权益到账和对账证据。",
    action: "可以进入小额真实订单灰度和每日对账观察。",
  };
}

export async function getLaunchPaymentAcceptance() {
  const [orders, walletTransactions, evidenceRecords] = await Promise.all([
    getAdminOrders(),
    getAdminWalletTransactions(),
    getLaunchPaymentAcceptanceEvidenceRecords({ take: 48 }),
  ]);
  const paymentMode = process.env.PAYMENT_PROVIDER || "mock";
  const devBypassEnabled = process.env.PAYMENT_CALLBACK_DEV_BYPASS === "true";
  const channels = channelConfigs.map((config) =>
    buildChannel({
      ...config,
      orders,
      walletTransactions,
      evidenceRecords,
      paymentMode,
    }),
  );
  const items = [
    ...buildGlobalItems({ paymentMode, devBypassEnabled }),
    ...channels.flatMap((channel) => channel.items),
  ];
  const summary = summarize(items);
  const completedChannels = channels.filter((channel) => channel.status === "ready").length;
  const enabledChannels = channels.filter((channel) => channel.enabled).length;
  const liveOrders = orders.filter(
    (order) => order.provider === "ALIPAY" || order.provider === "WECHAT_PAY",
  );
  const paidLiveOrders = liveOrders.filter((order) => order.status === "PAID");
  const latestPaidAt = paidLiveOrders
    .map((order) => order.paidAt ?? order.createdAt)
    .sort((a, b) => b.localeCompare(a))[0];
  const latestEvidenceAt = evidenceRecords
    .map((record) => record.metadata.savedAt)
    .sort((a, b) => b.localeCompare(a))[0];
  const status = launchStatus({
    completedChannels,
    enabledChannels,
    summary,
    paymentMode,
    devBypassEnabled,
  });
  const nextItems = items
    .filter((item) => item.status !== "ready")
    .sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        a.group.localeCompare(b.group, "zh-CN") ||
        a.title.localeCompare(b.title, "zh-CN"),
    )
    .slice(0, 8);

  return {
    generatedAt: new Date().toISOString(),
    ...status,
    paymentMode,
    devBypassEnabled,
    summary: {
      ...summary,
      completedChannels,
      totalChannels: channels.length,
      liveOrders: liveOrders.length,
      paidLiveOrders: paidLiveOrders.length,
      evidenceRecords: evidenceRecords.length,
      latestPaidAt,
      latestEvidenceAt,
    },
    channels,
    evidenceRecords,
    nextItems,
    copyText: buildCopyText({
      status: status.status,
      label: status.label,
      paymentMode,
      channels,
      nextItems,
    }),
  } satisfies LaunchPaymentAcceptance;
}
