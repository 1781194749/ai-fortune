import "server-only";

import { randomUUID } from "crypto";
import {
  EntitlementEventType,
  EntitlementKind,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import {
  getProduct,
  membershipProducts,
  type ProductCode,
} from "@/lib/commerce";
import { assertDatabaseFallbackAllowed, tryPrisma } from "@/lib/prisma";
import type { PrismaClientInstance } from "@/lib/prisma";
import { ensureDbUser } from "@/lib/user-store";

type EntitlementDb = Prisma.TransactionClient | PrismaClientInstance;

export type MemberEntitlementKind = "deep_report" | "palm_reading";

export type MemberEntitlementBalance = {
  kind: MemberEntitlementKind;
  label: string;
  granted: number;
  used: number;
  remaining: number;
  sourceOrders: number;
};

export type MemberEntitlementSummary = {
  balances: MemberEntitlementBalance[];
  reportQuota: MemberEntitlementBalance;
  palmQuota: MemberEntitlementBalance;
};

type MemberEntitlementEventType = "GRANT" | "SPEND" | "REFUND" | "EXPIRE" | "ADJUST";

type EntitlementLedgerOrder = {
  id: string;
  userId: string;
  status: string;
  productCode: ProductCode;
};

export type MockEntitlementTransaction = {
  id: string;
  userId: string;
  kind: MemberEntitlementKind;
  type: MemberEntitlementEventType;
  amount: number;
  balanceAfter: number;
  reason: string;
  orderId?: string;
  reportId?: string;
  idempotencyKey?: string;
  metadata?: unknown;
  createdAt: string;
};

export type AdminEntitlementAccount = {
  id: string;
  userId: string;
  kind: MemberEntitlementKind;
  label: string;
  balance: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminEntitlementTransaction = MockEntitlementTransaction & {
  label: string;
};

type DbEntitlementAccountLike = {
  id: string;
  userId: string;
  kind: string;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
};

type DbEntitlementTransactionLike = {
  id: string;
  userId: string;
  kind: string;
  type: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  orderId: string | null;
  reportId: string | null;
  idempotencyKey: string | null;
  metadata: unknown;
  createdAt: Date;
};

type CreateEntitlementTransactionResult =
  | { ok: true; transaction: MockEntitlementTransaction }
  | {
      ok: false;
      reason: "INSUFFICIENT_ENTITLEMENT";
      balanceAfter: number;
    };

type EntitlementState = {
  balances: Map<string, number>;
  transactions: MockEntitlementTransaction[];
};

declare global {
  var xuanjiEntitlementState: EntitlementState | undefined;
}

const state =
  globalThis.xuanjiEntitlementState ??
  ({
    balances: new Map<string, number>(),
    transactions: [],
  } satisfies EntitlementState);

if (!globalThis.xuanjiEntitlementState) {
  globalThis.xuanjiEntitlementState = state;
}

function requireEntitlementDatabaseWrite() {
  assertDatabaseFallbackAllowed("PostgreSQL 暂时不可用，会员权益账本未变更。");
}

function requireEntitlementDatabaseRead() {
  assertDatabaseFallbackAllowed("PostgreSQL 暂时不可用，无法读取会员权益账本。");
}

function createEntitlementAccountId() {
  return `entacct_${randomUUID()}`;
}

function createEntitlementTransactionId() {
  return `ent_${randomUUID()}`;
}

function getStateKey(userId: string, kind: MemberEntitlementKind) {
  return `${userId}:${kind}`;
}

function toJsonValue(value: unknown) {
  if (value === undefined) {
    return undefined as never;
  }

  return JSON.parse(JSON.stringify(value)) as never;
}

function toDbKind(kind: MemberEntitlementKind) {
  return kind === "deep_report"
    ? EntitlementKind.DEEP_REPORT
    : EntitlementKind.PALM_READING;
}

function fromDbKind(kind: string): MemberEntitlementKind {
  return kind === EntitlementKind.DEEP_REPORT ? "deep_report" : "palm_reading";
}

function toDbEventType(type: MemberEntitlementEventType) {
  if (type === "SPEND") {
    return EntitlementEventType.SPEND;
  }

  if (type === "REFUND") {
    return EntitlementEventType.REFUND;
  }

  if (type === "EXPIRE") {
    return EntitlementEventType.EXPIRE;
  }

  if (type === "ADJUST") {
    return EntitlementEventType.ADJUST;
  }

  return EntitlementEventType.GRANT;
}

function getKindLabel(kind: MemberEntitlementKind) {
  return kind === "deep_report" ? "深度报告额度" : "手相额度";
}

function mapDbEntitlementTransaction(
  transaction: DbEntitlementTransactionLike,
): MockEntitlementTransaction {
  return {
    id: transaction.id,
    userId: transaction.userId,
    kind: fromDbKind(transaction.kind),
    type: transaction.type as MemberEntitlementEventType,
    amount: transaction.amount,
    balanceAfter: transaction.balanceAfter,
    reason: transaction.reason,
    orderId: transaction.orderId ?? undefined,
    reportId: transaction.reportId ?? undefined,
    idempotencyKey: transaction.idempotencyKey ?? undefined,
    metadata: transaction.metadata,
    createdAt: transaction.createdAt.toISOString(),
  };
}

function mapAdminEntitlementTransaction(
  transaction: MockEntitlementTransaction,
): AdminEntitlementTransaction {
  return {
    ...transaction,
    label: getKindLabel(transaction.kind),
  };
}

function mapDbEntitlementAccount(account: DbEntitlementAccountLike) {
  const kind = fromDbKind(account.kind);

  return {
    id: account.id,
    userId: account.userId,
    kind,
    label: getKindLabel(kind),
    balance: account.balance,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  } satisfies AdminEntitlementAccount;
}

function getMemoryEntitlementAccounts() {
  return Array.from(state.balances.entries()).map(([key, balance]) => {
    const kind: MemberEntitlementKind = key.endsWith(":deep_report")
      ? "deep_report"
      : "palm_reading";
    const userId = key.slice(0, -(`:${kind}`).length);
    const transactions = state.transactions
      .filter((transaction) => transaction.userId === userId && transaction.kind === kind)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const createdAt = transactions[0]?.createdAt ?? new Date().toISOString();
    const updatedAt = transactions.at(-1)?.createdAt ?? createdAt;

    return {
      id: `memory:${key}`,
      userId,
      kind,
      label: getKindLabel(kind),
      balance,
      createdAt,
      updatedAt,
    } satisfies AdminEntitlementAccount;
  });
}

function createEmptyBalance(kind: MemberEntitlementKind) {
  return {
    kind,
    label: getKindLabel(kind),
    granted: 0,
    used: 0,
    remaining: 0,
    sourceOrders: 0,
  } satisfies MemberEntitlementBalance;
}

function summarizeKind(
  kind: MemberEntitlementKind,
  transactions: MockEntitlementTransaction[],
) {
  const sourceOrders = new Set<string>();
  const relevant = transactions
    .filter((transaction) => transaction.kind === kind)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const granted = relevant.reduce((total, transaction) => {
    if (transaction.type === "GRANT" && transaction.orderId) {
      sourceOrders.add(transaction.orderId);
    }

    if (
      transaction.amount > 0 &&
      (transaction.type === "GRANT" || transaction.type === "ADJUST")
    ) {
      return total + transaction.amount;
    }

    return total;
  }, 0);
  const spent = relevant.reduce((total, transaction) => {
    if (transaction.type === "SPEND") {
      return total + Math.abs(transaction.amount);
    }

    if (transaction.type === "REFUND") {
      return Math.max(0, total - transaction.amount);
    }

    return total;
  }, 0);
  const latest = relevant.at(-1);
  const remaining = Math.max(0, latest?.balanceAfter ?? 0);

  return {
    kind,
    label: getKindLabel(kind),
    granted,
    used: spent,
    remaining,
    sourceOrders: sourceOrders.size,
  } satisfies MemberEntitlementBalance;
}

function summarizeTransactions(transactions: MockEntitlementTransaction[]) {
  const reportQuota = summarizeKind("deep_report", transactions);
  const palmQuota = summarizeKind("palm_reading", transactions);

  return {
    balances: [reportQuota, palmQuota],
    reportQuota,
    palmQuota,
  } satisfies MemberEntitlementSummary;
}

function getMembershipQuotaGrants(productCode: ProductCode) {
  const product = getProduct(productCode);

  if (!product || !membershipProducts.some((item) => item.code === product.code)) {
    return [];
  }

  return [
    {
      kind: "deep_report" as const,
      amount: product.reportQuota ?? 0,
      reason: `${product.name} 发放 ${product.reportQuota ?? 0} 份深度报告额度`,
    },
    {
      kind: "palm_reading" as const,
      amount: product.palmQuota ?? 0,
      reason: `${product.name} 发放 ${product.palmQuota ?? 0} 次手相额度`,
    },
  ].filter((grant) => grant.amount > 0);
}

export async function checkMembershipEntitlementsCanBeRevokedForOrder(input: {
  userId: string;
  productCode: ProductCode;
}) {
  const grants = getMembershipQuotaGrants(input.productCode);

  if (grants.length === 0) {
    return {
      ok: true as const,
      grants,
    };
  }

  const summary = await getStoredMemberEntitlementSummary(input.userId);
  const insufficientGrant = grants.find((grant) => {
    const balance =
      summary?.balances.find((item) => item.kind === grant.kind) ??
      createEmptyBalance(grant.kind);

    return balance.remaining < grant.amount;
  });

  if (insufficientGrant) {
    const balance =
      summary?.balances.find((item) => item.kind === insufficientGrant.kind) ??
      createEmptyBalance(insufficientGrant.kind);

    return {
      ok: false as const,
      reason: "INSUFFICIENT_ENTITLEMENT" as const,
      kind: insufficientGrant.kind,
      required: insufficientGrant.amount,
      balance,
    };
  }

  return {
    ok: true as const,
    grants,
  };
}

async function createDbEntitlementTransaction(input: {
  userId: string;
  kind: MemberEntitlementKind;
  type: MemberEntitlementEventType;
  amount: number;
  reason: string;
  orderId?: string;
  reportId?: string;
  idempotencyKey?: string;
  metadata?: unknown;
}) {
  return tryPrisma(async (prisma) => {
    try {
      return await prisma.$transaction((tx) =>
        createDbEntitlementTransactionInTransaction(tx, input),
      );
    } catch (error) {
      if (input.idempotencyKey && typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        const existing = await prisma.entitlementTransaction.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });

        if (existing) {
          return {
            ok: true as const,
            transaction: mapDbEntitlementTransaction(existing),
          };
        }
      }

      throw error;
    }
  });
}

async function createDbEntitlementTransactionInTransaction(
  tx: EntitlementDb,
  input: {
    userId: string;
    kind: MemberEntitlementKind;
    type: MemberEntitlementEventType;
    amount: number;
    reason: string;
    orderId?: string;
    reportId?: string;
    idempotencyKey?: string;
    metadata?: unknown;
  },
): Promise<CreateEntitlementTransactionResult> {
  await ensureDbUser(tx, { userId: input.userId });

  if (input.idempotencyKey) {
    const existing = await tx.entitlementTransaction.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });

    if (existing) {
      return {
        ok: true,
        transaction: mapDbEntitlementTransaction(existing),
      };
    }
  }

  const dbKind = toDbKind(input.kind);
  const account = await tx.entitlementAccount.upsert({
    where: {
      userId_kind: {
        userId: input.userId,
        kind: dbKind,
      },
    },
    update: {},
    create: {
      id: createEntitlementAccountId(),
      userId: input.userId,
      kind: dbKind,
      balance: 0,
    },
  });
  const updated = input.amount < 0
    ? await tx.entitlementAccount.updateMany({
        where: { id: account.id, balance: { gte: Math.abs(input.amount) } },
        data: { balance: { increment: input.amount } },
      })
    : await tx.entitlementAccount.updateMany({
        where: { id: account.id },
        data: { balance: { increment: input.amount } },
      });

  if (updated.count === 0) {
    const current = await tx.entitlementAccount.findUnique({ where: { id: account.id } });
    return {
      ok: false,
      reason: "INSUFFICIENT_ENTITLEMENT",
      balanceAfter: current?.balance ?? 0,
    };
  }

  const updatedAccount = await tx.entitlementAccount.findUniqueOrThrow({
    where: { id: account.id },
  });
  const transaction = await tx.entitlementTransaction.create({
    data: {
      id: createEntitlementTransactionId(),
      accountId: account.id,
      userId: input.userId,
      kind: dbKind,
      type: toDbEventType(input.type),
      amount: input.amount,
      balanceAfter: updatedAccount.balance,
      reason: input.reason,
      orderId: input.orderId,
      reportId: input.reportId,
      idempotencyKey: input.idempotencyKey,
      metadata: toJsonValue(input.metadata),
    },
  });

  return {
    ok: true,
    transaction: mapDbEntitlementTransaction(transaction),
  };
}

function createMemoryEntitlementTransaction(input: {
  userId: string;
  kind: MemberEntitlementKind;
  type: MemberEntitlementEventType;
  amount: number;
  reason: string;
  orderId?: string;
  reportId?: string;
  idempotencyKey?: string;
  metadata?: unknown;
}): CreateEntitlementTransactionResult {
  if (input.idempotencyKey) {
    const existing = state.transactions.find(
      (transaction) => transaction.idempotencyKey === input.idempotencyKey,
    );

    if (existing) {
      return {
        ok: true,
        transaction: existing,
      };
    }
  }

  const key = getStateKey(input.userId, input.kind);
  const balanceAfter = (state.balances.get(key) ?? 0) + input.amount;

  if (balanceAfter < 0) {
    return {
      ok: false,
      reason: "INSUFFICIENT_ENTITLEMENT",
      balanceAfter: state.balances.get(key) ?? 0,
    };
  }

  const transaction = {
    id: createEntitlementTransactionId(),
    userId: input.userId,
    kind: input.kind,
    type: input.type,
    amount: input.amount,
    balanceAfter,
    reason: input.reason,
    orderId: input.orderId,
    reportId: input.reportId,
    idempotencyKey: input.idempotencyKey,
    metadata: input.metadata,
    createdAt: new Date().toISOString(),
  } satisfies MockEntitlementTransaction;

  state.transactions.push(transaction);
  state.balances.set(key, balanceAfter);

  return {
    ok: true,
    transaction,
  };
}

async function createEntitlementTransaction(input: {
  userId: string;
  kind: MemberEntitlementKind;
  type: MemberEntitlementEventType;
  amount: number;
  reason: string;
  orderId?: string;
  reportId?: string;
  idempotencyKey?: string;
  metadata?: unknown;
}): Promise<CreateEntitlementTransactionResult> {
  const dbResult = await createDbEntitlementTransaction(input);

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireEntitlementDatabaseWrite();

  return createMemoryEntitlementTransaction(input);
}

export async function grantMembershipEntitlementsForOrder(input: {
  userId: string;
  orderId: string;
  productCode: ProductCode;
}) {
  const grants = getMembershipQuotaGrants(input.productCode);

  return Promise.all(
    grants.map((grant) =>
      createEntitlementTransaction({
        userId: input.userId,
        kind: grant.kind,
        type: "GRANT",
        amount: grant.amount,
        reason: grant.reason,
        orderId: input.orderId,
        idempotencyKey: `membership:${input.orderId}:${grant.kind}:grant`,
        metadata: {
          source: "membership_payment",
          productCode: input.productCode,
        },
      }),
    ),
  );
}

export async function revokeMembershipEntitlementsForOrder(input: {
  userId: string;
  orderId: string;
  productCode: ProductCode;
  reason: string;
  operator?: string;
}) {
  const grants = getMembershipQuotaGrants(input.productCode);
  const idempotencyKeys = grants.map(
    (grant) => `membership:${input.orderId}:${grant.kind}:refund_reversal`,
  );
  const existingResult = await tryPrisma(async (prisma) =>
    prisma.entitlementTransaction.findMany({
      where: { idempotencyKey: { in: idempotencyKeys } },
    }),
  );

  if (existingResult.ok && existingResult.value.length === grants.length) {
    return {
      ok: true as const,
      transactions: existingResult.value.map(mapDbEntitlementTransaction),
    };
  }

  if (!existingResult.ok) {
    requireEntitlementDatabaseWrite();
  }

  const plan = await checkMembershipEntitlementsCanBeRevokedForOrder({
    userId: input.userId,
    productCode: input.productCode,
  });

  if (!plan.ok) {
    return plan;
  }

  if (plan.grants.length === 0) {
    return {
      ok: true as const,
      transactions: [],
    };
  }

  const transactions: MockEntitlementTransaction[] = [];

  for (const grant of plan.grants) {
    const result = await createEntitlementTransaction({
      userId: input.userId,
      kind: grant.kind,
      type: "ADJUST",
      amount: -grant.amount,
      reason: `${input.reason}，扣回 ${grant.amount} ${getKindLabel(grant.kind)}`,
      orderId: input.orderId,
      idempotencyKey: `membership:${input.orderId}:${grant.kind}:refund_reversal`,
      metadata: {
        source: "membership_order_refund",
        productCode: input.productCode,
        operator: input.operator,
      },
    });

    if (!result.ok) {
      const summary = await getStoredMemberEntitlementSummary(input.userId);
      const balance =
        summary?.balances.find((item) => item.kind === grant.kind) ??
        createEmptyBalance(grant.kind);

      return {
        ok: false as const,
        reason: result.reason,
        kind: grant.kind,
        required: grant.amount,
        balance,
        transactions,
      };
    }

    transactions.push(result.transaction);
  }

  return {
    ok: true as const,
    transactions,
  };
}

export async function syncMembershipEntitlementsFromPaidOrders(input: {
  userId: string;
  orders: EntitlementLedgerOrder[];
}) {
  const paidMembershipOrders = input.orders.filter(
    (order) =>
      order.userId === input.userId &&
      order.status === "PAID" &&
      membershipProducts.some((product) => product.code === order.productCode),
  );

  for (const order of paidMembershipOrders) {
    await grantMembershipEntitlementsForOrder({
      userId: input.userId,
      orderId: order.id,
      productCode: order.productCode,
    });
  }
}

export async function getStoredMemberEntitlementSummary(userId: string) {
  const dbResult = await tryPrisma((prisma) =>
    getStoredMemberEntitlementSummaryInTransaction(prisma, userId),
  );

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireEntitlementDatabaseRead();

  const transactions = state.transactions
    .filter((transaction) => transaction.userId === userId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return transactions.length > 0 ? summarizeTransactions(transactions) : null;
}

export async function getStoredMemberEntitlementSummaryInTransaction(
  tx: EntitlementDb,
  userId: string,
) {
  const transactions = await tx.entitlementTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  const mapped = transactions.map(mapDbEntitlementTransaction);

  return mapped.length > 0 ? summarizeTransactions(mapped) : null;
}

export async function getAdminEntitlementAccounts(input: { take?: number } = {}) {
  const take = input.take ?? 50;
  const dbResult = await tryPrisma(async (prisma) => {
    const accounts = await prisma.entitlementAccount.findMany({
      orderBy: { updatedAt: "desc" },
      take,
    });

    return accounts.map(mapDbEntitlementAccount);
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireEntitlementDatabaseRead();

  return getMemoryEntitlementAccounts()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, take);
}

export async function getAdminEntitlementTransactions(input: { take?: number } = {}) {
  const take = input.take ?? 50;
  const dbResult = await tryPrisma(async (prisma) => {
    const transactions = await prisma.entitlementTransaction.findMany({
      orderBy: { createdAt: "desc" },
      take,
    });

    return transactions.map(mapDbEntitlementTransaction).map(mapAdminEntitlementTransaction);
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireEntitlementDatabaseRead();

  return state.transactions
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, take)
    .map(mapAdminEntitlementTransaction);
}

export async function getUserEntitlementTransactions(
  userId: string,
  input: { take?: number } = {},
) {
  const take = Math.min(Math.max(input.take ?? 50, 1), 500);
  const dbResult = await tryPrisma(async (prisma) => {
    const transactions = await prisma.entitlementTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
    });

    return transactions.map(mapDbEntitlementTransaction).map(mapAdminEntitlementTransaction);
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireEntitlementDatabaseRead();

  return state.transactions
    .filter((transaction) => transaction.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, take)
    .map(mapAdminEntitlementTransaction);
}

export async function spendMemberEntitlement(input: {
  userId: string;
  kind: MemberEntitlementKind;
  amount?: number;
  reportId?: string;
  reason: string;
  idempotencyKey?: string;
  metadata?: unknown;
}) {
  const amount = input.amount ?? 1;

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Entitlement spend amount must be a positive integer.");
  }

  const result = await createEntitlementTransaction({
    userId: input.userId,
    kind: input.kind,
    type: "SPEND",
    amount: -amount,
    reason: input.reason,
    reportId: input.reportId,
    idempotencyKey:
      input.idempotencyKey ??
      (input.reportId ? `spend:${input.kind}:${input.reportId}` : undefined),
    metadata: {
      paymentSource: "membership_quota",
      source: "member_entitlement_usage",
      ...((input.metadata && typeof input.metadata === "object") ? input.metadata : {}),
    },
  });

  if (!result.ok) {
    const summary = await getStoredMemberEntitlementSummary(input.userId);
    const balance = summary?.balances.find((item) => item.kind === input.kind) ??
      createEmptyBalance(input.kind);

    return {
      ok: false as const,
      reason: result.reason,
      balance,
    };
  }

  const summary = await getStoredMemberEntitlementSummary(input.userId);
  const balance = summary?.balances.find((item) => item.kind === input.kind) ??
    createEmptyBalance(input.kind);

  return {
    ok: true as const,
    transaction: result.transaction,
    balance,
  };
}

export async function spendMemberEntitlementInTransaction(
  tx: EntitlementDb,
  input: {
    userId: string;
    kind: MemberEntitlementKind;
    amount?: number;
    reportId?: string;
    reason: string;
    idempotencyKey?: string;
    metadata?: unknown;
  },
) {
  const amount = input.amount ?? 1;

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Entitlement spend amount must be a positive integer.");
  }

  const result = await createDbEntitlementTransactionInTransaction(tx, {
    userId: input.userId,
    kind: input.kind,
    type: "SPEND",
    amount: -amount,
    reason: input.reason,
    reportId: input.reportId,
    idempotencyKey:
      input.idempotencyKey ??
      (input.reportId ? `spend:${input.kind}:${input.reportId}` : undefined),
    metadata: {
      paymentSource: "membership_quota",
      source: "member_entitlement_usage",
      ...((input.metadata && typeof input.metadata === "object") ? input.metadata : {}),
    },
  });

  if (!result.ok) {
    const summary = await getStoredMemberEntitlementSummaryInTransaction(tx, input.userId);
    const balance =
      summary?.balances.find((item) => item.kind === input.kind) ??
      createEmptyBalance(input.kind);

    return {
      ok: false as const,
      reason: result.reason,
      balance,
    };
  }

  const summary = await getStoredMemberEntitlementSummaryInTransaction(tx, input.userId);
  const balance =
    summary?.balances.find((item) => item.kind === input.kind) ??
    createEmptyBalance(input.kind);

  return {
    ok: true as const,
    transaction: result.transaction,
    balance,
  };
}

export async function refundMemberEntitlement(input: {
  userId: string;
  kind: MemberEntitlementKind;
  amount?: number;
  reportId?: string;
  reason: string;
  idempotencyKey?: string;
  metadata?: unknown;
}) {
  const amount = input.amount ?? 1;

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Entitlement refund amount must be a positive integer.");
  }

  const result = await createEntitlementTransaction({
    userId: input.userId,
    kind: input.kind,
    type: "REFUND",
    amount,
    reason: input.reason,
    reportId: input.reportId,
    idempotencyKey:
      input.idempotencyKey ??
      (input.reportId ? `refund:${input.kind}:${input.reportId}` : undefined),
    metadata: {
      paymentSource: "membership_quota",
      source: "member_entitlement_refund",
      ...((input.metadata && typeof input.metadata === "object") ? input.metadata : {}),
    },
  });

  if (!result.ok) {
    throw new Error(result.reason);
  }

  return result.transaction;
}

export async function adjustMemberEntitlement(input: {
  userId: string;
  kind: MemberEntitlementKind;
  amount: number;
  reason: string;
  idempotencyKey?: string;
  metadata?: unknown;
}) {
  if (!Number.isInteger(input.amount) || input.amount === 0) {
    throw new Error("Entitlement adjustment amount must be a non-zero integer.");
  }

  const result = await createEntitlementTransaction({
    userId: input.userId,
    kind: input.kind,
    type: "ADJUST",
    amount: input.amount,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
    metadata: {
      source: "admin_entitlement_adjustment",
      ...((input.metadata && typeof input.metadata === "object") ? input.metadata : {}),
    },
  });

  const summary = await getStoredMemberEntitlementSummary(input.userId);
  const balance = summary?.balances.find((item) => item.kind === input.kind) ??
    createEmptyBalance(input.kind);

  if (!result.ok) {
    return {
      ok: false as const,
      reason: result.reason,
      balance,
    };
  }

  return {
    ok: true as const,
    transaction: result.transaction,
    balance,
  };
}
