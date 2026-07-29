import "server-only";

import { AuthProvider, UserRole, WalletEventType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import {
  freeChatQuota,
  freeProfileLimit,
  freeStarterStarGrant,
  type MembershipTierCode,
} from "@/lib/commerce";
import {
  compareMembershipTiers,
  ensureMembershipStateCurrent,
} from "@/lib/membership-lifecycle";
import {
  assertDatabaseFallbackAllowed,
  tryPrisma,
  type PrismaClientInstance,
} from "@/lib/prisma";
import { emailToUserId } from "@/lib/email-auth";

export type PersistedAccountState = {
  tier: MembershipTierCode;
  starBalance: number;
  chatQuota: number;
  chatUsed: number;
  profileLimit: number;
  quotaPeriodStart: string;
};

export type LoginAccountState = PersistedAccountState & {
  userId: string;
  isNewUser: boolean;
};

export type AdminUserRecord = {
  id: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  role?: UserRole;
  authProviders?: string[];
  tier: MembershipTierCode;
  starBalance: number;
  createdAt: string;
  updatedAt: string;
};

declare global {
  var xuanjiAdminUsers: Map<string, AdminUserRecord> | undefined;
}

const adminUsers = globalThis.xuanjiAdminUsers ?? new Map<string, AdminUserRecord>();
type UserStoreDb = PrismaClientInstance | Prisma.TransactionClient;

if (!globalThis.xuanjiAdminUsers) {
  globalThis.xuanjiAdminUsers = adminUsers;
}

function requireUserDatabaseRead() {
  assertDatabaseFallbackAllowed("PostgreSQL 暂时不可用，无法读取用户状态。");
}

function requireUserDatabaseWrite() {
  assertDatabaseFallbackAllowed("PostgreSQL 暂时不可用，用户状态未保存。");
}

export function rememberAdminUser(input: {
  userId: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  tier?: MembershipTierCode;
  starBalance?: number;
  role?: UserRole;
}) {
  const now = new Date().toISOString();
  const current = adminUsers.get(input.userId);

  adminUsers.set(input.userId, {
    id: input.userId,
    email: input.email ?? current?.email,
    displayName: input.displayName ?? current?.displayName,
    avatarUrl: input.avatarUrl ?? current?.avatarUrl,
    role: input.role ?? current?.role ?? UserRole.USER,
    authProviders: current?.authProviders,
    tier: input.tier ?? current?.tier ?? "FREE",
    starBalance: input.starBalance ?? current?.starBalance ?? 0,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  });
}

export async function ensureDbUser(
  prisma: UserStoreDb,
  input: { userId: string; email?: string },
) {
  await prisma.user.upsert({
    where: { id: input.userId },
    update: {
      email: input.email,
    },
    create: {
      id: input.userId,
      email: input.email,
    },
  });

  if (input.email) {
    await prisma.authAccount.upsert({
      where: {
        provider_providerUserId: {
          provider: AuthProvider.EMAIL,
          providerUserId: input.email,
        },
      },
      update: {
        userId: input.userId,
      },
      create: {
        userId: input.userId,
        provider: AuthProvider.EMAIL,
        providerUserId: input.email,
      },
    });
  }
}

export async function getDbAccountState(
  prisma: UserStoreDb,
  userId: string,
  fallback: Partial<PersistedAccountState> = {},
) {
  await ensureMembershipStateCurrent(prisma, userId);
  let membership = await prisma.membership.findFirst({
    where: { userId, isActive: true },
    orderBy: { updatedAt: "desc" },
  });

  if (!membership) {
    membership = await prisma.membership.create({
      data: {
        userId,
        tier: "FREE",
        starBalance: fallback.starBalance ?? 0,
        chatQuota: freeChatQuota,
        chatUsed: 0,
        profileLimit: freeProfileLimit,
        quotaPeriodStart: new Date(),
        isActive: true,
      },
    });
  }

  const latestWalletEvent = await prisma.walletTransaction.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return {
    tier: (membership.tier ?? fallback.tier ?? "FREE") as MembershipTierCode,
    starBalance:
      latestWalletEvent?.balanceAfter ?? membership.starBalance ?? fallback.starBalance ?? 0,
    chatQuota: membership.chatQuota ?? fallback.chatQuota ?? freeChatQuota,
    chatUsed: membership.chatUsed ?? fallback.chatUsed ?? 0,
    profileLimit: membership.profileLimit ?? fallback.profileLimit ?? freeProfileLimit,
    quotaPeriodStart: (
      membership.quotaPeriodStart ??
      (fallback.quotaPeriodStart ? new Date(fallback.quotaPeriodStart) : new Date())
    ).toISOString(),
  };
}

export async function upsertDbMembership(
  prisma: UserStoreDb,
  input: {
    userId: string;
    tier: MembershipTierCode;
    starBalance: number;
    durationDays?: number;
    chatQuota?: number;
    chatUsed?: number;
    profileLimit?: number;
    quotaPeriodStart?: Date;
  },
) {
  const activeMembership = await ensureMembershipStateCurrent(prisma, input.userId);

  if (activeMembership) {
    const isMembershipPurchase = Boolean(input.durationDays);
    const now = new Date();
    const baseEndsAt = activeMembership.endsAt && activeMembership.endsAt.getTime() > now.getTime()
      ? activeMembership.endsAt
      : now;
    const endsAt = isMembershipPurchase
      ? new Date(baseEndsAt.getTime() + (input.durationDays ?? 0) * 24 * 60 * 60 * 1000)
      : activeMembership.endsAt;
    const currentTier = activeMembership.tier as MembershipTierCode;
    const tier = isMembershipPurchase && compareMembershipTiers(input.tier, currentTier) > 0
      ? input.tier
      : currentTier;

    await prisma.membership.update({
      where: { id: activeMembership.id },
      data: {
        tier,
        starBalance: input.starBalance,
        endsAt,
        ...(input.chatQuota === undefined ? {} : { chatQuota: input.chatQuota }),
        ...(input.chatUsed === undefined ? {} : { chatUsed: input.chatUsed }),
        ...(input.profileLimit === undefined ? {} : { profileLimit: input.profileLimit }),
        ...(input.quotaPeriodStart === undefined ? {} : { quotaPeriodStart: input.quotaPeriodStart }),
        isActive: true,
      },
    });
    return;
  }

  await prisma.membership.create({
    data: {
      userId: input.userId,
      tier: input.tier,
      starBalance: input.starBalance,
      chatQuota: input.chatQuota ?? freeChatQuota,
      chatUsed: input.chatUsed ?? 0,
      profileLimit: input.profileLimit ?? freeProfileLimit,
      quotaPeriodStart: input.quotaPeriodStart ?? new Date(),
      endsAt: input.durationDays
        ? new Date(Date.now() + input.durationDays * 24 * 60 * 60 * 1000)
        : undefined,
      isActive: true,
    },
  });
}

async function grantFreeStarterBenefits(
  prisma: PrismaClientInstance,
  userId: string,
) {
  const transactionId = `free_starter_${userId}`;
  await prisma.$transaction(async (tx) => {
    const accountState = await getDbAccountState(tx, userId);
    const balanceAfter = accountState.starBalance + freeStarterStarGrant;
    const created = await tx.walletTransaction.createMany({
      data: [{
        id: transactionId,
        userId,
        type: WalletEventType.GRANT,
        amount: freeStarterStarGrant,
        balanceAfter,
        reason: `免费版新手体验赠送 ${freeStarterStarGrant} 星力`,
        metadata: { source: "free_starter" },
      }],
      skipDuplicates: true,
    });

    if (created.count === 0) {
      return;
    }

    await upsertDbMembership(tx, {
      userId,
      tier: "FREE",
      starBalance: balanceAfter,
      chatQuota: freeChatQuota,
      profileLimit: freeProfileLimit,
      chatUsed: 0,
    });
  });

  return getDbAccountState(prisma, userId);
}

export async function ensureEmailUserAndGetState(input: {
  userId: string;
  email: string;
}) {
  const result = await tryPrisma(async (prisma) => {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { id: input.userId },
          { email: input.email },
        ],
      },
      select: { id: true },
    });
    const userId = existingUser?.id ?? input.userId;
    const isNewUser = !existingUser;

    await ensureDbUser(prisma, { userId, email: input.email });
    const existingState = await getDbAccountState(prisma, userId);
    const accountState = existingState.tier === "FREE"
      ? await grantFreeStarterBenefits(prisma, userId)
      : existingState;

    return {
      userId,
      ...accountState,
      isNewUser,
    } satisfies LoginAccountState;
  });

  if (result.ok) {
    rememberAdminUser({
      userId: result.value.userId,
      email: input.email,
      tier: result.value.tier,
      starBalance: result.value.starBalance,
    });
    return result.value;
  }

  requireUserDatabaseWrite();

  const remembered = adminUsers.get(input.userId);
  const isNewUser = !remembered;
  const fallbackState = remembered
    ? {
        tier: remembered.tier,
        starBalance: remembered.starBalance,
        chatQuota: freeChatQuota,
        chatUsed: 0,
        profileLimit: freeProfileLimit,
        quotaPeriodStart: new Date().toISOString(),
      }
    : {
        tier: "FREE" as const,
        starBalance: freeStarterStarGrant,
        chatQuota: freeChatQuota,
        chatUsed: 0,
        profileLimit: freeProfileLimit,
        quotaPeriodStart: new Date().toISOString(),
      };

  rememberAdminUser({
    userId: input.userId,
    email: input.email,
    ...fallbackState,
  });

  return {
    userId: input.userId,
    ...fallbackState,
    isNewUser,
  } satisfies LoginAccountState;
}

export async function ensureGoogleUserAndGetState(input: {
  providerUserId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}) {
  const fallbackUserId = emailToUserId(input.email);
  const result = await tryPrisma(async (prisma) => {
    const existingAccount = await prisma.authAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: AuthProvider.GOOGLE,
          providerUserId: input.providerUserId,
        },
      },
    });
    const existingUser = existingAccount
      ? await prisma.user.findUnique({ where: { id: existingAccount.userId } })
      : await prisma.user.findUnique({ where: { email: input.email } });
    const userId = existingUser?.id ?? fallbackUserId;

    await prisma.user.upsert({
      where: { id: userId },
      update: {
        email: input.email,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
      },
      create: {
        id: userId,
        email: input.email,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
      },
    });
    await prisma.authAccount.upsert({
      where: {
        provider_providerUserId: {
          provider: AuthProvider.GOOGLE,
          providerUserId: input.providerUserId,
        },
      },
      update: { userId },
      create: {
        userId,
        provider: AuthProvider.GOOGLE,
        providerUserId: input.providerUserId,
      },
    });
    const isNewUser = !existingUser;
    const existingState = await getDbAccountState(prisma, userId);
    const accountState = existingState.tier === "FREE"
      ? await grantFreeStarterBenefits(prisma, userId)
      : existingState;

    return {
      userId,
      accountState,
      isNewUser,
    };
  });
  const userId = result.ok ? result.value.userId : fallbackUserId;

  if (!result.ok) {
    requireUserDatabaseWrite();
  }

  const remembered = adminUsers.get(userId);
  const isNewUser = result.ok ? result.value.isNewUser : !remembered;
  const accountState = result.ok
      ? result.value.accountState
      : remembered
        ? ({
            tier: remembered.tier,
            starBalance: remembered.starBalance,
            chatQuota: freeChatQuota,
            chatUsed: 0,
            profileLimit: freeProfileLimit,
            quotaPeriodStart: new Date().toISOString(),
          } satisfies PersistedAccountState)
        : ({
            tier: "FREE",
            starBalance: freeStarterStarGrant,
            chatQuota: freeChatQuota,
            chatUsed: 0,
            profileLimit: freeProfileLimit,
            quotaPeriodStart: new Date().toISOString(),
          } satisfies PersistedAccountState);

  rememberAdminUser({
    userId,
    email: input.email,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl,
    ...accountState,
  });
  return { userId, ...accountState, isNewUser } satisfies LoginAccountState;
}

export async function getPersistedAccountState(
  userId: string,
  fallback: Partial<PersistedAccountState>,
) {
  const dbResult = await tryPrisma(async (prisma) =>
    getDbAccountState(prisma, userId, fallback),
  );

  if (dbResult.ok) {
    rememberAdminUser({
      userId,
      tier: dbResult.value.tier,
      starBalance: dbResult.value.starBalance,
    });
    return dbResult.value;
  }

  requireUserDatabaseRead();

  const remembered = adminUsers.get(userId);

  if (!remembered) {
    return {
      tier: fallback.tier ?? "FREE",
      starBalance: fallback.starBalance ?? 0,
      chatQuota: fallback.chatQuota ?? freeChatQuota,
      chatUsed: fallback.chatUsed ?? 0,
      profileLimit: fallback.profileLimit ?? freeProfileLimit,
      quotaPeriodStart: fallback.quotaPeriodStart ?? new Date().toISOString(),
    } satisfies PersistedAccountState;
  }

  return {
    tier: remembered.tier,
    starBalance: remembered.starBalance,
    chatQuota: fallback.chatQuota ?? freeChatQuota,
    chatUsed: fallback.chatUsed ?? 0,
    profileLimit: fallback.profileLimit ?? freeProfileLimit,
    quotaPeriodStart: fallback.quotaPeriodStart ?? new Date().toISOString(),
  } satisfies PersistedAccountState;
}

export async function getUserMembershipSnapshot(userId: string) {
  const dbResult = await tryPrisma(async (prisma) => {
    const membership = await prisma.membership.findFirst({
      where: { userId, isActive: true },
      orderBy: { updatedAt: "desc" },
    });

    if (!membership) {
      return null;
    }

    return {
      tier: membership.tier as MembershipTierCode,
      starBalance: membership.starBalance,
      startsAt: membership.startsAt.toISOString(),
      endsAt: membership.endsAt?.toISOString(),
      updatedAt: membership.updatedAt.toISOString(),
    };
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireUserDatabaseRead();

  const remembered = adminUsers.get(userId);

  if (!remembered || remembered.tier === "FREE") {
    return null;
  }

  return {
    tier: remembered.tier,
    starBalance: remembered.starBalance,
    startsAt: remembered.createdAt,
    endsAt: undefined,
    updatedAt: remembered.updatedAt,
  };
}

export async function getPersistedUserEmail(userId: string) {
  const dbResult = await tryPrisma(async (prisma) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    return user?.email ?? undefined;
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireUserDatabaseRead();

  return adminUsers.get(userId)?.email;
}

export async function getPersistedUserRole(userId: string) {
  const dbResult = await tryPrisma(async (prisma) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    return user?.role;
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireUserDatabaseRead();

  return adminUsers.get(userId)?.role;
}

export async function getAdminUser(userId: string) {
  const dbResult = await tryPrisma(async (prisma) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        accounts: {
          select: { provider: true },
        },
      },
    });

    if (!user) {
      return null;
    }

    const accountState = await getDbAccountState(prisma, user.id);

    return {
      id: user.id,
      email: user.email ?? undefined,
      displayName: user.displayName ?? undefined,
      avatarUrl: user.avatarUrl ?? undefined,
      role: user.role,
      authProviders: user.accounts.map((account) => account.provider),
      tier: accountState.tier,
      starBalance: accountState.starBalance,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    } satisfies AdminUserRecord;
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireUserDatabaseRead();

  return adminUsers.get(userId) ?? null;
}

export async function getAdminUsers(input: { take?: number } = {}) {
  const take = Math.min(Math.max(input.take ?? 50, 1), 500);
  const dbResult = await tryPrisma(async (prisma) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take,
      include: {
        accounts: {
          select: { provider: true },
        },
      },
    });

    return Promise.all(
      users.map(async (user) => {
        const accountState = await getDbAccountState(prisma, user.id);

        return {
          id: user.id,
            email: user.email ?? undefined,
            displayName: user.displayName ?? undefined,
            avatarUrl: user.avatarUrl ?? undefined,
            role: user.role,
            authProviders: user.accounts.map((account) => account.provider),
          tier: accountState.tier,
          starBalance: accountState.starBalance,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        } satisfies AdminUserRecord;
      }),
    );
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireUserDatabaseRead();

  return Array.from(adminUsers.values())
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, take);
}
