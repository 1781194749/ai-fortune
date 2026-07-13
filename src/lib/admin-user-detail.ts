import "server-only";

import {
  getStoredMemberEntitlementSummary,
  getUserEntitlementTransactions,
} from "@/lib/entitlement-store";
import { getFortuneProfile } from "@/lib/fortune-profile-store";
import {
  getUserMockOrders,
  getUserWalletTransactions,
} from "@/lib/mock-payment-store";
import { getUserMockReports } from "@/lib/report-store";
import { getUserUsageLogs } from "@/lib/usage-log-store";
import { getAdminUser } from "@/lib/user-store";

function latestDate(values: Array<string | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a))[0];
}

export async function getAdminUserDetailData(userId: string) {
  const [
    user,
    profile,
    orders,
    walletTransactions,
    entitlementSummary,
    entitlementTransactions,
    reports,
    usageLogs,
  ] = await Promise.all([
    getAdminUser(userId),
    getFortuneProfile(userId),
    getUserMockOrders(userId),
    getUserWalletTransactions(userId),
    getStoredMemberEntitlementSummary(userId),
    getUserEntitlementTransactions(userId, { take: 50 }),
    getUserMockReports(userId),
    getUserUsageLogs(userId),
  ]);

  if (!user) {
    return null;
  }

  const paidOrders = orders.filter((order) => order.status === "PAID");
  const pendingOrders = orders.filter((order) => order.status === "PENDING");
  const refundedOrders = orders.filter((order) => order.status === "REFUNDED");
  const totalSpentCents = paidOrders.reduce((sum, order) => sum + order.amountCents, 0);
  const tokensIn = usageLogs.reduce((sum, log) => sum + (log.tokensIn ?? 0), 0);
  const tokensOut = usageLogs.reduce((sum, log) => sum + (log.tokensOut ?? 0), 0);
  const aiCostCents = usageLogs.reduce((sum, log) => sum + (log.costCents ?? 0), 0);
  const starsGranted = walletTransactions
    .filter((transaction) => transaction.amount > 0)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const starsSpent = Math.abs(
    walletTransactions
      .filter((transaction) => transaction.amount < 0)
      .reduce((sum, transaction) => sum + transaction.amount, 0),
  );
  const completedReports = reports.filter((report) => report.status === "COMPLETED");

  return {
    user,
    profile,
    orders,
    walletTransactions,
    entitlementSummary,
    entitlementTransactions,
    reports,
    usageLogs,
    paidOrders,
    pendingOrders,
    refundedOrders,
    metrics: {
      totalSpentCents,
      netAfterAiCents: totalSpentCents - aiCostCents,
      tokensIn,
      tokensOut,
      totalTokens: tokensIn + tokensOut,
      aiCostCents,
      starsGranted,
      starsSpent,
      completedReports: completedReports.length,
      lastActiveAt: latestDate([
        user.updatedAt,
        profile?.updatedAt,
        orders[0]?.createdAt,
        reports[0]?.updatedAt,
        usageLogs[0]?.createdAt,
      ]),
    },
  };
}

export type AdminUserDetailData = NonNullable<
  Awaited<ReturnType<typeof getAdminUserDetailData>>
>;
