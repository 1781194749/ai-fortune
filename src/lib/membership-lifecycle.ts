import "server-only";

import {
  EntitlementEventType,
  MembershipTier,
  OrderStatus,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import {
  getProduct,
  membershipProducts,
  membershipTierByProduct,
  type MembershipTierCode,
  type ProductCode,
} from "@/lib/commerce";
import { tryPrisma, type PrismaClientInstance } from "@/lib/prisma";

const lifecycleFeature = "membership_lifecycle";
const dayMs = 24 * 60 * 60 * 1000;
const membershipProductCodes = membershipProducts.map((product) => product.code);

type MembershipDb = PrismaClientInstance | Prisma.TransactionClient;

const tierRank: Record<MembershipTierCode, number> = {
  FREE: 0,
  TRIAL: 1,
  MONTHLY: 2,
  PRO: 3,
  YEARLY: 4,
};

export class MembershipDowngradeError extends Error {
  code = "MEMBERSHIP_DOWNGRADE_BLOCKED" as const;
  availableAt?: string;

  constructor(message: string, availableAt?: Date | null) {
    super(message);
    this.name = "MembershipDowngradeError";
    this.availableAt = availableAt?.toISOString();
  }
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * dayMs);
}

function laterDate(a: Date, b: Date) {
  return a.getTime() >= b.getTime() ? a : b;
}

function toDbTier(tier: MembershipTierCode) {
  return tier as MembershipTier;
}

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as never;
}

export function compareMembershipTiers(a: MembershipTierCode, b: MembershipTierCode) {
  return tierRank[a] - tierRank[b];
}

function getMembershipTerms(productCode: string) {
  const code = productCode as ProductCode;
  const tier = membershipTierByProduct[code];
  const product = getProduct(code);

  if (!tier || !product?.durationDays) {
    return null;
  }

  return {
    productCode: code,
    productName: product.name,
    tier,
    durationDays: product.durationDays,
  };
}

async function recordLifecycleEvent(
  db: MembershipDb,
  input: {
    userId: string;
    action: string;
    membershipId?: string;
    orderId?: string;
    tierBefore: MembershipTierCode;
    tierAfter: MembershipTierCode;
    startsAt?: Date | null;
    endsAt?: Date | null;
    metadata?: Record<string, unknown>;
  },
) {
  await db.usageLog.create({
    data: {
      userId: input.userId,
      provider: "system",
      model: "membership-lifecycle-v1",
      feature: lifecycleFeature,
      metadata: toJsonValue({
        event: "membership_lifecycle_changed",
        action: input.action,
        membershipId: input.membershipId,
        orderId: input.orderId,
        tierBefore: input.tierBefore,
        tierAfter: input.tierAfter,
        startsAt: input.startsAt?.toISOString(),
        endsAt: input.endsAt?.toISOString(),
        ...input.metadata,
      }),
    },
  });
}

async function expireEntitlementBalances(
  db: MembershipDb,
  input: { userId: string; membershipId: string; expiredAt: Date },
) {
  const accounts = await db.entitlementAccount.findMany({
    where: { userId: input.userId, balance: { gt: 0 } },
  });

  for (const account of accounts) {
    const idempotencyKey = `membership:${input.membershipId}:${account.kind}:expiry`;
    const existing = await db.entitlementTransaction.findUnique({
      where: { idempotencyKey },
    });

    if (existing) {
      continue;
    }

    await db.entitlementTransaction.create({
      data: {
        accountId: account.id,
        userId: input.userId,
        kind: account.kind,
        type: EntitlementEventType.EXPIRE,
        amount: -account.balance,
        balanceAfter: 0,
        reason: "会员到期，未使用的会员额度已失效",
        idempotencyKey,
        metadata: {
          source: "membership_expiration",
          membershipId: input.membershipId,
          expiredAt: input.expiredAt.toISOString(),
        },
      },
    });
    await db.entitlementAccount.update({
      where: { id: account.id },
      data: { balance: 0 },
    });
  }
}

async function getActiveMembership(db: MembershipDb, userId: string) {
  return db.membership.findFirst({
    where: { userId, isActive: true },
    orderBy: { updatedAt: "desc" },
  });
}

async function expireMembershipIfNeededInDb(
  db: MembershipDb,
  userId: string,
  now = new Date(),
) {
  const active = await getActiveMembership(db, userId);

  if (
    !active ||
    active.tier === MembershipTier.FREE ||
    !active.endsAt ||
    active.endsAt.getTime() > now.getTime()
  ) {
    return active;
  }

  const claim = await db.membership.updateMany({
    where: {
      id: active.id,
      isActive: true,
      endsAt: { lte: now },
    },
    data: { isActive: false },
  });

  if (claim.count === 0) {
    return getActiveMembership(db, userId);
  }

  await expireEntitlementBalances(db, {
    userId,
    membershipId: active.id,
    expiredAt: active.endsAt,
  });
  await recordLifecycleEvent(db, {
    userId,
    action: "EXPIRED",
    membershipId: active.id,
    tierBefore: active.tier as MembershipTierCode,
    tierAfter: "FREE",
    startsAt: active.startsAt,
    endsAt: active.endsAt,
  });

  return null;
}

export async function expireMembershipIfNeeded(
  db: MembershipDb,
  userId: string,
  now = new Date(),
) {
  if ("$transaction" in db) {
    return db.$transaction((tx) => expireMembershipIfNeededInDb(tx, userId, now));
  }

  return expireMembershipIfNeededInDb(db, userId, now);
}

export async function validateMembershipPurchase(
  db: MembershipDb,
  input: { userId: string; productCode: ProductCode; now?: Date },
) {
  const terms = getMembershipTerms(input.productCode);

  if (!terms) {
    return { ok: true as const, kind: "one_time" as const };
  }

  const active = await expireMembershipIfNeeded(db, input.userId, input.now);
  const currentTier = active?.tier as MembershipTierCode | undefined;

  if (
    active?.endsAt &&
    currentTier &&
    currentTier !== "FREE" &&
    compareMembershipTiers(terms.tier, currentTier) < 0
  ) {
    throw new MembershipDowngradeError(
      `当前为更高等级会员，暂不能购买${terms.productName}。可在当前会员到期后选择该方案。`,
      active.endsAt,
    );
  }

  return {
    ok: true as const,
    kind: currentTier === terms.tier ? ("renewal" as const) : active ? ("upgrade" as const) : ("activation" as const),
    currentTier: currentTier ?? "FREE",
    nextTier: terms.tier,
    currentEndsAt: active?.endsAt ?? null,
  };
}

export async function activateMembershipForOrder(
  db: MembershipDb,
  input: {
    userId: string;
    orderId: string;
    productCode: ProductCode;
    paidAt: Date;
    starBalance: number;
  },
) {
  const terms = getMembershipTerms(input.productCode);

  if (!terms) {
    return null;
  }

  const decision = await validateMembershipPurchase(db, {
    userId: input.userId,
    productCode: input.productCode,
    now: input.paidAt,
  });
  const active = await getActiveMembership(db, input.userId);
  const paidActive = active && active.tier !== MembershipTier.FREE ? active : null;
  const baseEndsAt = paidActive?.endsAt
    ? laterDate(paidActive.endsAt, input.paidAt)
    : input.paidAt;
  const endsAt = addDays(baseEndsAt, terms.durationDays);
  const tierBefore = (paidActive?.tier ?? MembershipTier.FREE) as MembershipTierCode;
  const tierAfter = compareMembershipTiers(terms.tier, tierBefore) > 0
    ? terms.tier
    : tierBefore;
  const startsAt = paidActive?.startsAt ?? input.paidAt;
  const membership = active
    ? await db.membership.update({
        where: { id: active.id },
        data: {
          tier: toDbTier(tierAfter),
          startsAt,
          endsAt,
          starBalance: input.starBalance,
          isActive: true,
        },
      })
    : await db.membership.create({
        data: {
          userId: input.userId,
          tier: toDbTier(tierAfter),
          startsAt,
          endsAt,
          starBalance: input.starBalance,
          isActive: true,
        },
      });

  await recordLifecycleEvent(db, {
    userId: input.userId,
    action: decision.kind === "renewal" ? "RENEWED" : decision.kind === "upgrade" ? "UPGRADED" : "ACTIVATED",
    membershipId: membership.id,
    orderId: input.orderId,
    tierBefore,
    tierAfter,
    startsAt,
    endsAt,
    metadata: { productCode: input.productCode, durationDays: terms.durationDays },
  });

  return membership;
}

export async function updateMembershipStarBalance(
  db: MembershipDb,
  input: { userId: string; starBalance: number },
) {
  const active = await expireMembershipIfNeeded(db, input.userId);

  if (active) {
    return db.membership.update({
      where: { id: active.id },
      data: { starBalance: input.starBalance },
    });
  }

  return db.membership.create({
    data: {
      userId: input.userId,
      tier: MembershipTier.FREE,
      starBalance: input.starBalance,
      isActive: true,
    },
  });
}

export async function reconcileMembershipAfterOrderChange(
  db: MembershipDb,
  input: {
    userId: string;
    starBalance: number;
    sourceOrderId?: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const orders = await db.order.findMany({
    where: {
      userId: input.userId,
      status: OrderStatus.PAID,
      productCode: { in: membershipProductCodes },
      paidAt: { not: null },
    },
    orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
  });
  let period: {
    startsAt: Date;
    endsAt: Date;
    tier: MembershipTierCode;
  } | null = null;

  for (const order of orders) {
    const terms = getMembershipTerms(order.productCode);
    const paidAt = order.paidAt ?? order.createdAt;

    if (!terms) {
      continue;
    }

    if (!period || paidAt.getTime() >= period.endsAt.getTime()) {
      period = {
        startsAt: paidAt,
        endsAt: addDays(paidAt, terms.durationDays),
        tier: terms.tier,
      };
      continue;
    }

    period.endsAt = addDays(period.endsAt, terms.durationDays);

    if (compareMembershipTiers(terms.tier, period.tier) > 0) {
      period.tier = terms.tier;
    }
  }

  const active = await getActiveMembership(db, input.userId);
  const tierBefore = (active?.tier ?? MembershipTier.FREE) as MembershipTierCode;

  if (!period || period.endsAt.getTime() <= now.getTime()) {
    if (active) {
      await db.membership.update({
        where: { id: active.id },
        data: { isActive: false, starBalance: input.starBalance },
      });
    }

    await recordLifecycleEvent(db, {
      userId: input.userId,
      action: "RECONCILED",
      membershipId: active?.id,
      orderId: input.sourceOrderId,
      tierBefore,
      tierAfter: "FREE",
      metadata: { paidMembershipOrders: orders.length },
    });

    return { tier: "FREE" as const, membership: null };
  }

  const membership = active
    ? await db.membership.update({
        where: { id: active.id },
        data: {
          tier: toDbTier(period.tier),
          startsAt: period.startsAt,
          endsAt: period.endsAt,
          starBalance: input.starBalance,
          isActive: true,
        },
      })
    : await db.membership.create({
        data: {
          userId: input.userId,
          tier: toDbTier(period.tier),
          startsAt: period.startsAt,
          endsAt: period.endsAt,
          starBalance: input.starBalance,
          isActive: true,
        },
      });

  await recordLifecycleEvent(db, {
    userId: input.userId,
    action: "RECONCILED",
    membershipId: membership.id,
    orderId: input.sourceOrderId,
    tierBefore,
    tierAfter: period.tier,
    startsAt: period.startsAt,
    endsAt: period.endsAt,
    metadata: { paidMembershipOrders: orders.length },
  });

  return { tier: period.tier, membership };
}

export async function ensureMembershipStateCurrent(
  db: MembershipDb,
  userId: string,
  now = new Date(),
) {
  const active = await getActiveMembership(db, userId);

  if (active && active.tier !== MembershipTier.FREE && !active.endsAt) {
    const latestWallet = await db.walletTransaction.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    const reconciled = await reconcileMembershipAfterOrderChange(db, {
      userId,
      starBalance: latestWallet?.balanceAfter ?? active?.starBalance ?? 0,
      now,
    });

    return reconciled.membership;
  }

  return expireMembershipIfNeeded(db, userId, now);
}

export async function getMembershipLifecycleSnapshot(userId: string) {
  const dbResult = await tryPrisma(async (prisma) => {
    const active = await ensureMembershipStateCurrent(prisma, userId);
    const latest = active ?? await prisma.membership.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
    const [paidOrderCount, logs] = await Promise.all([
      prisma.order.count({
        where: {
          userId,
          status: OrderStatus.PAID,
          productCode: { in: membershipProductCodes },
        },
      }),
      prisma.usageLog.findMany({
        where: { userId, feature: lifecycleFeature },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);
    const now = Date.now();
    const endsAt = active?.endsAt ?? null;
    const daysRemaining = endsAt
      ? Math.max(0, Math.ceil((endsAt.getTime() - now) / dayMs))
      : null;

    return {
      tier: (active?.tier ?? MembershipTier.FREE) as MembershipTierCode,
      status: active?.tier && active.tier !== MembershipTier.FREE
        ? daysRemaining !== null && daysRemaining <= 7
          ? ("EXPIRING_SOON" as const)
          : ("ACTIVE" as const)
        : latest?.endsAt
          ? ("EXPIRED" as const)
          : ("FREE" as const),
      startsAt: active?.startsAt.toISOString() ?? null,
      endsAt: endsAt?.toISOString() ?? null,
      daysRemaining,
      autoRenew: false,
      renewalCount: Math.max(0, paidOrderCount - 1),
      events: logs.map((log) => ({
        id: log.id,
        createdAt: log.createdAt.toISOString(),
        metadata: log.metadata,
      })),
    };
  });

  if (!dbResult.ok) {
    throw new Error("PostgreSQL 暂时不可用，无法读取会员生命周期。");
  }

  return dbResult.value;
}

export async function reconcileExpiredMemberships(input: { take?: number } = {}) {
  const dbResult = await tryPrisma(async (prisma) => {
    const now = new Date();
    const staleOrderCutoff = new Date(now.getTime() - 30 * 60 * 1000);
    const closedOrders = await prisma.order.updateMany({
      where: {
        status: OrderStatus.PENDING,
        productCode: { in: membershipProductCodes },
        createdAt: { lte: staleOrderCutoff },
      },
      data: { status: OrderStatus.CLOSED },
    });
    const memberships = await prisma.membership.findMany({
      where: {
        isActive: true,
        tier: { not: MembershipTier.FREE },
        endsAt: { lte: now },
      },
      orderBy: { endsAt: "asc" },
      take: Math.min(Math.max(input.take ?? 100, 1), 500),
      select: { userId: true },
    });
    let expired = 0;

    for (const membership of memberships) {
      const active = await expireMembershipIfNeeded(prisma, membership.userId);

      if (!active) {
        expired += 1;
      }
    }

    return { checked: memberships.length, expired, closedOrders: closedOrders.count };
  });

  if (!dbResult.ok) {
    throw new Error("PostgreSQL 暂时不可用，会员到期任务未执行。");
  }

  return dbResult.value;
}
