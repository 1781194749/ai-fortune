import "server-only";

import { randomUUID } from "crypto";
import {
  OrderStatus,
  PaymentProvider,
  WalletEventType,
} from "@/generated/prisma/enums";
import {
  type FeatureCode,
  formatPrice,
  getProduct,
  getStarCostLabel,
  membershipTierByProduct,
  type MembershipTierCode,
  type Product,
  type ProductCode,
} from "@/lib/commerce";
import {
  activateMembershipForOrder,
  MembershipDowngradeError,
  reconcileMembershipAfterOrderChange,
  updateMembershipStarBalance,
  validateMembershipPurchase,
} from "@/lib/membership-lifecycle";
import {
  checkMembershipEntitlementsCanBeRevokedForOrder,
  grantMembershipEntitlementsForOrder,
  revokeMembershipEntitlementsForOrder,
  type MockEntitlementTransaction,
} from "@/lib/entitlement-store";
import {
  assertDatabaseFallbackAllowed,
  tryPrisma,
  type PrismaClientInstance,
} from "@/lib/prisma";
import { getProductRuntimeConfigMap } from "@/lib/product-config";
import type { SessionPayload } from "@/lib/session";
import type { AppliedPromotion } from "@/lib/promo-code";
import {
  ensureDbUser,
  getDbAccountState,
  rememberAdminUser,
  upsertDbMembership,
} from "@/lib/user-store";

export type MockOrderStatus = "PENDING" | "PAID" | "CLOSED" | "REFUNDED" | "FAILED";
export type PaymentProviderCode = "MOCK" | "ALIPAY" | "WECHAT_PAY";

export type MockOrder = {
  id: string;
  userId: string;
  productCode: ProductCode;
  productName: string;
  amountCents: number;
  currency: Product["currency"];
  status: MockOrderStatus;
  provider: PaymentProviderCode;
  providerOrderId?: string;
  originalAmountCents?: number;
  discountCents?: number;
  promotionCode?: string;
  promotionName?: string;
  createdAt: string;
  paidAt?: string;
};

export type MockWalletTransaction = {
  id: string;
  userId: string;
  orderId?: string;
  reportId?: string;
  featureCode?: FeatureCode;
  type: "GRANT" | "SPEND" | "REFUND" | "ADJUST";
  amount: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
};

export type RefundPaidOrderResult =
  | {
      ok: true;
      order: MockOrder;
      transaction: MockWalletTransaction | null;
      entitlementTransactions: MockEntitlementTransaction[];
      balanceAfter: number;
      tierAfter: MembershipTierCode;
      alreadyRefunded?: boolean;
    }
  | {
      ok: false;
      reason:
        | "ORDER_NOT_FOUND"
        | "ORDER_NOT_PAID"
        | "PRODUCT_NOT_FOUND"
        | "INSUFFICIENT_STARS"
        | "INSUFFICIENT_ENTITLEMENT";
      order?: MockOrder;
      balanceAfter?: number;
      required?: number;
      entitlementKind?: string;
      message?: string;
    };

type MockPaymentState = {
  orders: Map<string, MockOrder>;
  walletTransactions: MockWalletTransaction[];
};

type DbOrderLike = {
  id: string;
  userId: string;
  productCode: string;
  productName: string;
  amountCents: number;
  currency: string;
  status: string;
  provider: string;
  providerOrderId: string | null;
  notifyPayload: unknown;
  createdAt: Date;
  paidAt: Date | null;
};

type DbWalletLike = {
  id: string;
  userId: string;
  orderId: string | null;
  reportId: string | null;
  type: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  metadata: unknown;
  createdAt: Date;
};

declare global {
  var xuanjiMockPaymentState: MockPaymentState | undefined;
}

const state =
  globalThis.xuanjiMockPaymentState ??
  ({
    orders: new Map<string, MockOrder>(),
    walletTransactions: [],
  } satisfies MockPaymentState);

if (!globalThis.xuanjiMockPaymentState) {
  globalThis.xuanjiMockPaymentState = state;
}

function nowIso() {
  return new Date().toISOString();
}

function requireCommerceDatabase() {
  assertDatabaseFallbackAllowed("PostgreSQL 暂时不可用，订单与会员状态未变更。");
}

function requireCommerceDatabaseRead() {
  assertDatabaseFallbackAllowed("PostgreSQL 暂时不可用，无法读取订单或钱包数据。");
}

function createOrderId() {
  return `mock_${randomUUID()}`;
}

function createWalletId() {
  return `wallet_${randomUUID()}`;
}

function toJsonValue(value: unknown) {
  if (value === undefined) {
    return undefined as never;
  }

  return JSON.parse(JSON.stringify(value)) as never;
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

function readPromotionMetadata(value: unknown): AppliedPromotion | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const metadata = isRecord(value.promotion) ? value.promotion : value;
  const code = readString(metadata.code);
  const name = readString(metadata.name);
  const currency = readString(metadata.currency);
  const originalAmountCents = readNumber(metadata.originalAmountCents);
  const discountCents = readNumber(metadata.discountCents);
  const finalAmountCents = readNumber(metadata.finalAmountCents);

  if (
    !code ||
    !name ||
    (currency !== "CNY" && currency !== "USD") ||
    originalAmountCents === undefined ||
    discountCents === undefined ||
    finalAmountCents === undefined
  ) {
    return undefined;
  }

  return {
    code,
    name,
    originalAmountCents,
    discountCents,
    finalAmountCents,
    currency,
  };
}

function buildOrderMetadata(input: {
  promotion?: AppliedPromotion;
  paymentNotify?: unknown;
}) {
  if (!input.promotion && input.paymentNotify === undefined) {
    return undefined;
  }

  return {
    promotion: input.promotion,
    paymentNotify: input.paymentNotify,
  };
}

function toDbPaymentProvider(provider: PaymentProviderCode) {
  if (provider === "ALIPAY") {
    return PaymentProvider.ALIPAY;
  }

  if (provider === "WECHAT_PAY") {
    return PaymentProvider.WECHAT_PAY;
  }

  return PaymentProvider.MOCK;
}

function mapDbOrder(order: DbOrderLike): MockOrder {
  const promotion = readPromotionMetadata(order.notifyPayload);

  return {
    id: order.id,
    userId: order.userId,
    productCode: order.productCode as ProductCode,
    productName: order.productName,
    amountCents: order.amountCents,
    currency: order.currency as Product["currency"],
    status: order.status as MockOrderStatus,
    provider: order.provider as PaymentProviderCode,
    providerOrderId: order.providerOrderId ?? undefined,
    originalAmountCents: promotion?.originalAmountCents,
    discountCents: promotion?.discountCents,
    promotionCode: promotion?.code,
    promotionName: promotion?.name,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString(),
  };
}

function mapDbWalletTransaction(transaction: DbWalletLike): MockWalletTransaction {
  const metadata =
    transaction.metadata && typeof transaction.metadata === "object"
      ? (transaction.metadata as { featureCode?: FeatureCode })
      : {};

  return {
    id: transaction.id,
    userId: transaction.userId,
    orderId: transaction.orderId ?? undefined,
    reportId: transaction.reportId ?? undefined,
    featureCode: metadata.featureCode,
    type: transaction.type as "GRANT" | "SPEND" | "REFUND" | "ADJUST",
    amount: transaction.amount,
    balanceAfter: transaction.balanceAfter,
    reason: transaction.reason,
    createdAt: transaction.createdAt.toISOString(),
  };
}

type MembershipOrderForTier = {
  id: string;
  productCode: string;
  status: string;
  paidAt?: string | Date | null;
  createdAt: string | Date;
};

function getOrderTime(value: string | Date | null | undefined) {
  if (!value) {
    return 0;
  }

  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function getMembershipTierAfterRefund(
  orders: MembershipOrderForTier[],
  refundingOrderId: string,
): MembershipTierCode {
  const latestPaidMembershipOrder = orders
    .filter((order) => {
      const tier = membershipTierByProduct[order.productCode as ProductCode];

      return order.id !== refundingOrderId && order.status === "PAID" && Boolean(tier);
    })
    .sort((a, b) => {
      const bTime = getOrderTime(b.paidAt) || getOrderTime(b.createdAt);
      const aTime = getOrderTime(a.paidAt) || getOrderTime(a.createdAt);

      return bTime - aTime;
    })[0];

  return latestPaidMembershipOrder
    ? (membershipTierByProduct[latestPaidMembershipOrder.productCode as ProductCode] ?? "FREE")
    : "FREE";
}

function getLatestMemoryWalletBalance(userId: string) {
  const latestTransaction = state.walletTransactions
    .filter((transaction) => transaction.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  return latestTransaction?.balanceAfter ?? 0;
}

async function settleDbPaymentOrder(
  prisma: PrismaClientInstance,
  input: {
    orderId: string;
    userId?: string;
    provider?: PaymentProviderCode;
    providerOrderId?: string;
    notifyPayload?: unknown;
  },
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: input.orderId } });

    if (!order) {
      return { ok: false as const, reason: "ORDER_NOT_FOUND" as const };
    }

    if (input.userId && order.userId !== input.userId) {
      return { ok: false as const, reason: "ORDER_FORBIDDEN" as const };
    }

    if (input.provider && order.provider !== toDbPaymentProvider(input.provider)) {
      return { ok: false as const, reason: "PROVIDER_MISMATCH" as const };
    }

    const product = getProduct(order.productCode as ProductCode);

    if (!product) {
      return { ok: false as const, reason: "PRODUCT_NOT_FOUND" as const };
    }

    const accountState = await getDbAccountState(tx, order.userId, {
      tier: "FREE",
      starBalance: 0,
    });

    if (order.status === OrderStatus.PAID) {
      return {
        ok: true as const,
        order: mapDbOrder(order),
        transaction: null,
        balanceAfter: accountState.starBalance,
        tierAfter: accountState.tier,
        alreadyPaid: true as const,
      };
    }

    if (order.status !== OrderStatus.PENDING) {
      return { ok: false as const, reason: "ORDER_NOT_PAYABLE" as const };
    }

    try {
      await validateMembershipPurchase(tx, {
        userId: order.userId,
        productCode: product.code,
      });
    } catch (error) {
      if (error instanceof MembershipDowngradeError) {
        return {
          ok: false as const,
          reason: error.code,
          message: error.message,
          availableAt: error.availableAt,
        };
      }

      throw error;
    }

    const claim = await tx.order.updateMany({
      where: { id: order.id, status: OrderStatus.PENDING },
      data: { status: OrderStatus.PAID },
    });

    if (claim.count === 0) {
      const currentOrder = await tx.order.findUnique({ where: { id: order.id } });

      if (currentOrder?.status === OrderStatus.PAID) {
        const currentState = await getDbAccountState(tx, order.userId, accountState);
        return {
          ok: true as const,
          order: mapDbOrder(currentOrder),
          transaction: null,
          balanceAfter: currentState.starBalance,
          tierAfter: currentState.tier,
          alreadyPaid: true as const,
        };
      }

      return { ok: false as const, reason: "ORDER_NOT_PAYABLE" as const };
    }

    const paidAt = new Date();
    const promotion = readPromotionMetadata(order.notifyPayload);
    const paidOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        paidAt,
        providerOrderId: input.providerOrderId,
        notifyPayload: input.notifyPayload === undefined
          ? order.notifyPayload as never
          : toJsonValue(
              buildOrderMetadata({
                promotion,
                paymentNotify: input.notifyPayload,
              }),
            ),
      },
    });
    const amount = product.starGrant ?? 0;
    const balanceAfter = accountState.starBalance + amount;
    const transaction = amount > 0
      ? await tx.walletTransaction.create({
          data: {
            id: `membership_grant_${paidOrder.id}`,
            userId: order.userId,
            orderId: paidOrder.id,
            type: WalletEventType.GRANT,
            amount,
            balanceAfter,
            reason: `${product.name} 发放 ${amount} 星力`,
            metadata: {
              source: "membership_payment",
              productCode: product.code,
            },
          },
        })
      : null;
    const membership = await activateMembershipForOrder(tx, {
      userId: order.userId,
      orderId: paidOrder.id,
      productCode: product.code,
      paidAt,
      starBalance: balanceAfter,
    });

    if (!membership) {
      await updateMembershipStarBalance(tx, {
        userId: order.userId,
        starBalance: balanceAfter,
      });
    }

    return {
      ok: true as const,
      order: mapDbOrder(paidOrder),
      transaction: transaction ? mapDbWalletTransaction(transaction) : null,
      balanceAfter,
      tierAfter: (membership?.tier as MembershipTierCode | undefined) ?? accountState.tier,
      alreadyPaid: false as const,
    };
  });
}

export async function createMockOrder(
  userId: string,
  productCode: ProductCode,
  input: { promotion?: AppliedPromotion; product?: Product } = {},
) {
  return createPaymentOrder(userId, productCode, "MOCK", input);
}

export async function createPaymentOrder(
  userId: string,
  productCode: ProductCode,
  provider: PaymentProviderCode,
  input: { promotion?: AppliedPromotion; product?: Product } = {},
) {
  const product = input.product ?? getProduct(productCode);

  if (!product) {
    throw new Error(`Unknown product: ${productCode}`);
  }

  const amountCents = input.promotion?.finalAmountCents ?? product.priceCents;
  const orderMetadata = buildOrderMetadata({ promotion: input.promotion });

  const dbResult = await tryPrisma(async (prisma) => {
    await ensureDbUser(prisma, { userId });

    try {
      await validateMembershipPurchase(prisma, { userId, productCode });
    } catch (error) {
      if (error instanceof MembershipDowngradeError) {
        return {
          ok: false as const,
          reason: error.code,
          message: error.message,
          availableAt: error.availableAt,
        };
      }

      throw error;
    }

    const order = await prisma.order.create({
      data: {
        id: createOrderId(),
        userId,
        provider: toDbPaymentProvider(provider),
        status: OrderStatus.PENDING,
        productCode,
        productName: product.name,
        amountCents,
        currency: product.currency,
        notifyPayload: toJsonValue(orderMetadata),
      },
    });

    return { ok: true as const, order: mapDbOrder(order) };
  });

  if (dbResult.ok) {
    if (!dbResult.value.ok) {
      throw new MembershipDowngradeError(
        dbResult.value.message,
        dbResult.value.availableAt ? new Date(dbResult.value.availableAt) : undefined,
      );
    }

    return dbResult.value.order;
  }

  requireCommerceDatabase();

  const order: MockOrder = {
    id: createOrderId(),
    userId,
    productCode,
    productName: product.name,
    amountCents,
    currency: product.currency,
    status: "PENDING",
    provider,
    originalAmountCents: input.promotion?.originalAmountCents,
    discountCents: input.promotion?.discountCents,
    promotionCode: input.promotion?.code,
    promotionName: input.promotion?.name,
    createdAt: nowIso(),
  };

  rememberAdminUser({ userId });
  state.orders.set(order.id, order);
  return order;
}

export async function getMockOrder(orderId: string) {
  const dbResult = await tryPrisma(async (prisma) => {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    return order ? mapDbOrder(order) : null;
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireCommerceDatabaseRead();

  return state.orders.get(orderId) ?? null;
}

export async function getUserMockOrders(userId: string) {
  const dbResult = await tryPrisma(async (prisma) => {
    const orders = await prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return orders.map(mapDbOrder);
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireCommerceDatabaseRead();

  return Array.from(state.orders.values())
    .filter((order) => order.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function markExternalPaymentOrderPaid(input: {
  orderId: string;
  provider: Exclude<PaymentProviderCode, "MOCK">;
  providerOrderId?: string;
  notifyPayload?: unknown;
}) {
  const dbResult = await tryPrisma((prisma) => settleDbPaymentOrder(prisma, input));

  if (dbResult.ok) {
    if (dbResult.value.ok) {
      await grantMembershipEntitlementsForOrder({
        userId: dbResult.value.order.userId,
        orderId: dbResult.value.order.id,
        productCode: dbResult.value.order.productCode,
      });
    }

    return dbResult.value;
  }

  requireCommerceDatabase();

  const order = state.orders.get(input.orderId) ?? null;

  if (!order) {
    return { ok: false as const, reason: "ORDER_NOT_FOUND" };
  }

  if (order.provider !== input.provider) {
    return { ok: false as const, reason: "PROVIDER_MISMATCH" };
  }

  const product = getProduct(order.productCode);

  if (!product) {
    return { ok: false as const, reason: "PRODUCT_NOT_FOUND" };
  }

  const latestTransaction = state.walletTransactions
    .filter((transaction) => transaction.userId === order.userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const currentBalance = latestTransaction?.balanceAfter ?? 0;

  if (order.status === "PAID") {
    await grantMembershipEntitlementsForOrder({
      userId: order.userId,
      orderId: order.id,
      productCode: order.productCode,
    });

    return {
      ok: true as const,
      order,
      transaction: null,
      balanceAfter: currentBalance,
    };
  }

  order.status = "PAID";
  order.paidAt = nowIso();
  order.providerOrderId = input.providerOrderId;
  state.orders.set(order.id, order);

  const amount = product.starGrant ?? 0;
  const balanceAfter = currentBalance + amount;
  const transaction =
    amount > 0
      ? {
          id: createWalletId(),
          userId: order.userId,
          orderId: order.id,
          type: "GRANT" as const,
          amount,
          balanceAfter,
          reason: `${product.name} 发放 ${amount} 星力`,
          createdAt: nowIso(),
        }
      : null;

  if (transaction) {
    state.walletTransactions.push(transaction);
  }

  await grantMembershipEntitlementsForOrder({
    userId: order.userId,
    orderId: order.id,
    productCode: order.productCode,
  });

  rememberAdminUser({
    userId: order.userId,
    tier: membershipTierByProduct[product.code] ?? "FREE",
    starBalance: balanceAfter,
  });

  return {
    ok: true as const,
    order,
    transaction,
    balanceAfter,
  };
}

export async function getUserWalletTransactions(userId: string) {
  const dbResult = await tryPrisma(async (prisma) => {
    const transactions = await prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return transactions.map(mapDbWalletTransaction);
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireCommerceDatabaseRead();

  return state.walletTransactions
    .filter((transaction) => transaction.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function refundPaidOrder(input: {
  orderId: string;
  reason: string;
  operator?: string;
}): Promise<RefundPaidOrderResult> {
  const order = await getMockOrder(input.orderId);

  if (!order) {
    return { ok: false, reason: "ORDER_NOT_FOUND" };
  }

  const product = getProduct(order.productCode);

  if (!product) {
    return {
      ok: false,
      reason: "PRODUCT_NOT_FOUND",
      order,
      message: "订单商品不存在，不能自动退款。",
    };
  }

  if (order.status === "REFUNDED") {
    const transactions = await getUserWalletTransactions(order.userId);
    const transaction =
      transactions.find(
        (item) => item.orderId === order.id && item.type === "REFUND",
      ) ?? null;
    const balanceAfter = transaction?.balanceAfter ?? getLatestMemoryWalletBalance(order.userId);
    const accountState = await tryPrisma(async (prisma) =>
      getDbAccountState(prisma, order.userId, { tier: "FREE", starBalance: balanceAfter }),
    );

    if (!accountState.ok) {
      requireCommerceDatabaseRead();
    }

    const entitlementReversal = await revokeMembershipEntitlementsForOrder({
      userId: order.userId,
      orderId: order.id,
      productCode: order.productCode,
      reason: input.reason,
      operator: input.operator,
    });

    if (!entitlementReversal.ok) {
      return {
        ok: false,
        reason: "INSUFFICIENT_ENTITLEMENT",
        order,
        entitlementKind: entitlementReversal.kind,
        required: entitlementReversal.required,
        message: "退款订单的会员权益尚未完全回滚，请稍后重试。",
      };
    }

    return {
      ok: true,
      order,
      transaction,
      entitlementTransactions: entitlementReversal.transactions,
      balanceAfter,
      tierAfter: accountState.ok ? accountState.value.tier : "FREE",
      alreadyRefunded: true,
    };
  }

  if (order.status !== "PAID") {
    return {
      ok: false,
      reason: "ORDER_NOT_PAID",
      order,
      message: "只有已支付订单可以退款。",
    };
  }

  const starGrant = product.starGrant ?? 0;
  const accountStateResult = await tryPrisma(async (prisma) =>
    getDbAccountState(prisma, order.userId, { tier: "FREE", starBalance: 0 }),
  );

  if (!accountStateResult.ok) {
    requireCommerceDatabaseRead();
  }

  const currentBalance = accountStateResult.ok
    ? accountStateResult.value.starBalance
    : getLatestMemoryWalletBalance(order.userId);

  if (currentBalance < starGrant) {
    return {
      ok: false,
      reason: "INSUFFICIENT_STARS",
      order,
      balanceAfter: currentBalance,
      required: starGrant,
      message: "用户星力余额不足，不能自动扣回退款订单发放的星力。",
    };
  }

  const entitlementPlan = await checkMembershipEntitlementsCanBeRevokedForOrder({
    userId: order.userId,
    productCode: order.productCode,
  });

  if (!entitlementPlan.ok) {
    return {
      ok: false,
      reason: "INSUFFICIENT_ENTITLEMENT",
      order,
      entitlementKind: entitlementPlan.kind,
      required: entitlementPlan.required,
      message: `${entitlementPlan.balance.label}剩余 ${entitlementPlan.balance.remaining}，不足以扣回本订单发放的 ${entitlementPlan.required}。`,
    };
  }

  const dbResult = await tryPrisma(async (prisma) => {
    const dbOrder = await prisma.order.findUnique({ where: { id: input.orderId } });

    if (!dbOrder) {
      return { ok: false as const, reason: "ORDER_NOT_FOUND" as const };
    }

    const dbProduct = getProduct(dbOrder.productCode as ProductCode);

    if (!dbProduct) {
      return {
        ok: false as const,
        reason: "PRODUCT_NOT_FOUND" as const,
        order: mapDbOrder(dbOrder),
      };
    }

    const accountState = await getDbAccountState(prisma, dbOrder.userId, {
      tier: "FREE",
      starBalance: 0,
    });
    const dbStarGrant = dbProduct.starGrant ?? 0;

    if (dbOrder.status === OrderStatus.REFUNDED) {
      const transaction = await prisma.walletTransaction.findFirst({
        where: {
          orderId: dbOrder.id,
          type: WalletEventType.REFUND,
        },
        orderBy: { createdAt: "desc" },
      });

      return {
        ok: true as const,
        order: mapDbOrder(dbOrder),
        transaction: transaction ? mapDbWalletTransaction(transaction) : null,
        entitlementTransactions: [],
        balanceAfter: transaction?.balanceAfter ?? accountState.starBalance,
        tierAfter: accountState.tier,
        alreadyRefunded: true as const,
      };
    }

    if (dbOrder.status !== OrderStatus.PAID) {
      return {
        ok: false as const,
        reason: "ORDER_NOT_PAID" as const,
        order: mapDbOrder(dbOrder),
      };
    }

    if (accountState.starBalance < dbStarGrant) {
      return {
        ok: false as const,
        reason: "INSUFFICIENT_STARS" as const,
        order: mapDbOrder(dbOrder),
        balanceAfter: accountState.starBalance,
        required: dbStarGrant,
      };
    }

    const balanceAfter = accountState.starBalance - dbStarGrant;
    const refundedOrder = await prisma.order.update({
      where: { id: dbOrder.id },
      data: { status: OrderStatus.REFUNDED },
    });
    const transaction =
      dbStarGrant > 0
        ? await prisma.walletTransaction.create({
            data: {
              id: `membership_refund_${dbOrder.id}`,
              userId: dbOrder.userId,
              orderId: dbOrder.id,
              type: WalletEventType.REFUND,
              amount: -dbStarGrant,
              balanceAfter,
              reason: `订单退款扣回 ${dbStarGrant} 星力：${input.reason}`,
              metadata: {
                source: "admin_order_refund",
                operator: input.operator,
              },
            },
          })
        : null;

    const lifecycle = await reconcileMembershipAfterOrderChange(prisma, {
      userId: dbOrder.userId,
      starBalance: balanceAfter,
      sourceOrderId: dbOrder.id,
    });
    const tierAfter = lifecycle.tier;

    return {
      ok: true as const,
      order: mapDbOrder(refundedOrder),
      transaction: transaction ? mapDbWalletTransaction(transaction) : null,
      entitlementTransactions: [],
      balanceAfter,
      tierAfter,
    };
  });

  if (dbResult.ok) {
    if (!dbResult.value.ok || dbResult.value.alreadyRefunded) {
      return dbResult.value;
    }

    const entitlementReversal = await revokeMembershipEntitlementsForOrder({
      userId: dbResult.value.order.userId,
      orderId: dbResult.value.order.id,
      productCode: dbResult.value.order.productCode,
      reason: input.reason,
      operator: input.operator,
    });

    if (!entitlementReversal.ok) {
      return {
        ok: false,
        reason: "INSUFFICIENT_ENTITLEMENT",
        order: dbResult.value.order,
        entitlementKind: entitlementReversal.kind,
        required: entitlementReversal.required,
        message: "订单已标记退款，但会员权益扣回失败，请在后台权益账本人工核对。",
      };
    }

    return {
      ...dbResult.value,
      entitlementTransactions: entitlementReversal.transactions,
    };
  }

  requireCommerceDatabase();

  const memoryOrder = state.orders.get(input.orderId) ?? null;

  if (!memoryOrder) {
    return { ok: false, reason: "ORDER_NOT_FOUND" };
  }

  if (memoryOrder.status === "REFUNDED") {
    const transaction =
      state.walletTransactions.find(
        (item) => item.orderId === memoryOrder.id && item.type === "REFUND",
      ) ?? null;

    return {
      ok: true,
      order: memoryOrder,
      transaction,
      entitlementTransactions: [],
      balanceAfter: transaction?.balanceAfter ?? getLatestMemoryWalletBalance(memoryOrder.userId),
      tierAfter: membershipTierByProduct[memoryOrder.productCode] ?? "FREE",
      alreadyRefunded: true,
    };
  }

  if (memoryOrder.status !== "PAID") {
    return {
      ok: false,
      reason: "ORDER_NOT_PAID",
      order: memoryOrder,
      message: "只有已支付订单可以退款。",
    };
  }

  const memoryProduct = getProduct(memoryOrder.productCode);

  if (!memoryProduct) {
    return {
      ok: false,
      reason: "PRODUCT_NOT_FOUND",
      order: memoryOrder,
      message: "订单商品不存在，不能自动退款。",
    };
  }

  const memoryStarGrant = memoryProduct.starGrant ?? 0;
  const memoryBalance = getLatestMemoryWalletBalance(memoryOrder.userId);

  if (memoryBalance < memoryStarGrant) {
    return {
      ok: false,
      reason: "INSUFFICIENT_STARS",
      order: memoryOrder,
      balanceAfter: memoryBalance,
      required: memoryStarGrant,
      message: "用户星力余额不足，不能自动扣回退款订单发放的星力。",
    };
  }

  const tierAfter = getMembershipTierAfterRefund(
    Array.from(state.orders.values()).filter((item) => item.userId === memoryOrder.userId),
    memoryOrder.id,
  );
  const balanceAfter = memoryBalance - memoryStarGrant;
  const transaction =
    memoryStarGrant > 0
      ? {
          id: createWalletId(),
          userId: memoryOrder.userId,
          orderId: memoryOrder.id,
          type: "REFUND" as const,
          amount: -memoryStarGrant,
          balanceAfter,
          reason: `订单退款扣回 ${memoryStarGrant} 星力：${input.reason}`,
          createdAt: nowIso(),
        }
      : null;

  memoryOrder.status = "REFUNDED";
  state.orders.set(memoryOrder.id, memoryOrder);

  if (transaction) {
    state.walletTransactions.push(transaction);
  }

  const entitlementReversal = await revokeMembershipEntitlementsForOrder({
    userId: memoryOrder.userId,
    orderId: memoryOrder.id,
    productCode: memoryOrder.productCode,
    reason: input.reason,
    operator: input.operator,
  });

  if (!entitlementReversal.ok) {
    return {
      ok: false,
      reason: "INSUFFICIENT_ENTITLEMENT",
      order: memoryOrder,
      entitlementKind: entitlementReversal.kind,
      required: entitlementReversal.required,
      message: "订单已标记退款，但会员权益扣回失败，请在后台权益账本人工核对。",
    };
  }

  rememberAdminUser({
    userId: memoryOrder.userId,
    tier: tierAfter,
    starBalance: balanceAfter,
  });

  return {
    ok: true,
    order: memoryOrder,
    transaction,
    entitlementTransactions: entitlementReversal.transactions,
    balanceAfter,
    tierAfter,
  };
}

export async function completeMockOrder(orderId: string, session: SessionPayload) {
  await getProductRuntimeConfigMap();

  const dbResult = await tryPrisma((prisma) =>
    settleDbPaymentOrder(prisma, { orderId, userId: session.userId, provider: "MOCK" }),
  );

  if (dbResult.ok) {
    if (dbResult.value.ok) {
      await grantMembershipEntitlementsForOrder({
        userId: dbResult.value.order.userId,
        orderId: dbResult.value.order.id,
        productCode: dbResult.value.order.productCode,
      });

      return {
        ok: true as const,
        order: dbResult.value.order,
        transaction: dbResult.value.transaction,
        nextSession: {
          ...session,
          tier: dbResult.value.tierAfter,
          starBalance: dbResult.value.balanceAfter,
        },
      };
    }

    return dbResult.value;
  }

  requireCommerceDatabase();

  const order = state.orders.get(orderId) ?? null;

  if (!order) {
    return { ok: false as const, reason: "ORDER_NOT_FOUND" };
  }

  if (order.userId !== session.userId) {
    return { ok: false as const, reason: "ORDER_FORBIDDEN" };
  }

  const product = getProduct(order.productCode);

  if (!product) {
    return { ok: false as const, reason: "PRODUCT_NOT_FOUND" };
  }

  if (order.status === "PAID") {
    await grantMembershipEntitlementsForOrder({
      userId: order.userId,
      orderId: order.id,
      productCode: order.productCode,
    });

    return {
      ok: true as const,
      order,
      nextSession: session,
      transaction: null,
    };
  }

  order.status = "PAID";
  order.paidAt = nowIso();
  state.orders.set(order.id, order);

  const amount = product.starGrant ?? 0;
  const balanceAfter = session.starBalance + amount;
  const transaction =
    amount > 0
      ? {
          id: createWalletId(),
          userId: session.userId,
          orderId: order.id,
          type: "GRANT" as const,
          amount,
          balanceAfter,
          reason: `${product.name} 发放 ${amount} 星力`,
          createdAt: nowIso(),
        }
      : null;

  if (transaction) {
    state.walletTransactions.push(transaction);
  }

  await grantMembershipEntitlementsForOrder({
    userId: session.userId,
    orderId: order.id,
    productCode: order.productCode,
  });

  rememberAdminUser({
    userId: session.userId,
    tier: membershipTierByProduct[product.code] ?? session.tier,
    starBalance: balanceAfter,
  });

  return {
    ok: true as const,
    order,
    transaction,
    nextSession: {
      ...session,
      tier: membershipTierByProduct[product.code] ?? session.tier,
      starBalance: balanceAfter,
    },
  };
}

export async function spendStars(
  session: SessionPayload,
  input: {
    featureCode: FeatureCode;
    amount: number;
    reason?: string;
    reportId?: string;
  },
) {
  if (input.amount < 0) {
    throw new Error("Spend amount cannot be negative.");
  }

  const dbResult = await tryPrisma(async (prisma) => {
    await ensureDbUser(prisma, { userId: session.userId });

    const accountState = await getDbAccountState(prisma, session.userId, {
      tier: session.tier,
      starBalance: session.starBalance,
    });

    if (accountState.starBalance < input.amount) {
      return { ok: false as const, reason: "INSUFFICIENT_STARS" };
    }

    const balanceAfter = accountState.starBalance - input.amount;
    const transaction =
      input.amount > 0
        ? await prisma.walletTransaction.create({
            data: {
              id: createWalletId(),
              userId: session.userId,
              reportId: input.reportId,
              type: WalletEventType.SPEND,
              amount: -input.amount,
              balanceAfter,
              reason:
                input.reason ??
                `${input.featureCode} 消耗 ${getStarCostLabel(input.featureCode)}`,
              metadata: {
                featureCode: input.featureCode,
              },
            },
          })
        : null;

    await upsertDbMembership(prisma, {
      userId: session.userId,
      tier: accountState.tier,
      starBalance: balanceAfter,
    });

    return {
      ok: true as const,
      transaction: transaction ? mapDbWalletTransaction(transaction) : null,
      nextSession: {
        ...session,
        tier: accountState.tier,
        starBalance: balanceAfter,
      },
    };
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireCommerceDatabase();

  if (session.starBalance < input.amount) {
    return { ok: false as const, reason: "INSUFFICIENT_STARS" };
  }

  const balanceAfter = session.starBalance - input.amount;
  const transaction =
    input.amount > 0
      ? {
          id: createWalletId(),
          userId: session.userId,
          reportId: input.reportId,
          featureCode: input.featureCode,
          type: "SPEND" as const,
          amount: -input.amount,
          balanceAfter,
          reason:
            input.reason ??
            `${input.featureCode} 消耗 ${getStarCostLabel(input.featureCode)}`,
          createdAt: nowIso(),
        }
      : null;

  if (transaction) {
    state.walletTransactions.push(transaction);
  }

  rememberAdminUser({
    userId: session.userId,
    tier: session.tier,
    starBalance: balanceAfter,
  });

  return {
    ok: true as const,
    transaction,
    nextSession: {
      ...session,
      starBalance: balanceAfter,
    },
  };
}

export async function grantOperationalStars(input: {
  userId: string;
  amount: number;
  reason: string;
  reportId?: string;
  operator?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("Operational grant amount must be a positive integer.");
  }

  const dbResult = await tryPrisma(async (prisma) => {
    await ensureDbUser(prisma, { userId: input.userId });

    const accountState = await getDbAccountState(prisma, input.userId, {
      tier: "FREE",
      starBalance: 0,
    });
    const balanceAfter = accountState.starBalance + input.amount;
    const transaction = await prisma.walletTransaction.create({
      data: {
        id: createWalletId(),
        userId: input.userId,
        reportId: input.reportId,
        type: WalletEventType.ADJUST,
        amount: input.amount,
        balanceAfter,
        reason: input.reason,
        metadata: {
          source: input.source ?? "admin_compensation",
          operator: input.operator,
          ...input.metadata,
        },
      },
    });

    await upsertDbMembership(prisma, {
      userId: input.userId,
      tier: accountState.tier,
      starBalance: balanceAfter,
    });

    return mapDbWalletTransaction(transaction);
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireCommerceDatabase();

  const latestTransaction = state.walletTransactions
    .filter((transaction) => transaction.userId === input.userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const balanceAfter = (latestTransaction?.balanceAfter ?? 0) + input.amount;
  const transaction: MockWalletTransaction = {
    id: createWalletId(),
    userId: input.userId,
    reportId: input.reportId,
    type: "ADJUST",
    amount: input.amount,
    balanceAfter,
    reason: input.reason,
    createdAt: nowIso(),
  };

  state.walletTransactions.push(transaction);
  rememberAdminUser({
    userId: input.userId,
    starBalance: balanceAfter,
  });

  return transaction;
}

export function getOrderDisplay(order: MockOrder) {
  return {
    ...order,
    priceLabel: formatPrice(order.amountCents, order.currency),
    originalPriceLabel:
      order.originalAmountCents && order.discountCents
        ? formatPrice(order.originalAmountCents, order.currency)
        : undefined,
    discountLabel:
      order.discountCents && order.discountCents > 0
        ? `-${formatPrice(order.discountCents, order.currency)}`
        : undefined,
    promotionLabel: order.promotionCode
      ? `${order.promotionName ?? "优惠码"} ${order.promotionCode}`
      : undefined,
  };
}

export async function getAdminOrders(input: { take?: number } = {}) {
  const take = Math.min(Math.max(input.take ?? 50, 1), 500);
  const dbResult = await tryPrisma(async (prisma) => {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take,
    });

    return orders.map(mapDbOrder);
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireCommerceDatabaseRead();

  return Array.from(state.orders.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, take);
}

export async function getAdminWalletTransactions(input: { take?: number } = {}) {
  const take = Math.min(Math.max(input.take ?? 50, 1), 500);
  const dbResult = await tryPrisma(async (prisma) => {
    const transactions = await prisma.walletTransaction.findMany({
      orderBy: { createdAt: "desc" },
      take,
    });

    return transactions.map(mapDbWalletTransaction);
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireCommerceDatabaseRead();

  return [...state.walletTransactions]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, take);
}
