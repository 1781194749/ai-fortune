import "server-only";

import {
  getProduct,
  membershipProducts,
  type Product,
  type ProductCode,
} from "@/lib/commerce";
import {
  getStoredMemberEntitlementSummary,
  syncMembershipEntitlementsFromPaidOrders,
  type MemberEntitlementBalance,
  type MemberEntitlementKind,
  type MemberEntitlementSummary,
} from "@/lib/entitlement-store";
import { getProductRuntimeConfigMap } from "@/lib/product-config";
import type { MockOrder } from "@/lib/mock-payment-store";
import type { MockReport } from "@/lib/report-store";

export type {
  MemberEntitlementBalance,
  MemberEntitlementKind,
  MemberEntitlementSummary,
} from "@/lib/entitlement-store";

type PaidMembershipOrder = MockOrder & {
  productCode: Extract<ProductCode, (typeof membershipProducts)[number]["code"]>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isMemberEntitlementUsage(
  report: MockReport,
  kind: MemberEntitlementKind,
) {
  const snapshot = isRecord(report.inputSnapshot) ? report.inputSnapshot : {};

  return snapshot.paymentSource === "membership_quota" && snapshot.entitlementKind === kind;
}

function isPaidMembershipOrder(order: MockOrder): order is PaidMembershipOrder {
  return (
    order.status === "PAID" &&
    membershipProducts.some((product) => product.code === order.productCode)
  );
}

function sumQuota(
  orders: MockOrder[],
  quotaKey: "reportQuota" | "palmQuota",
) {
  return orders.reduce(
    (total, order) => total + (getProduct(order.productCode)?.[quotaKey] ?? 0),
    0,
  );
}

function countUsedReports(reports: MockReport[]) {
  return reports.filter(
    (report) =>
      report.status !== "FAILED" &&
      isMemberEntitlementUsage(report, "deep_report"),
  ).length;
}

function countUsedPalmReadings(reports: MockReport[]) {
  return reports.filter(
    (report) =>
      report.status !== "FAILED" &&
      report.type === "PALM" &&
      isMemberEntitlementUsage(report, "palm_reading"),
  ).length;
}

function createBalance(input: {
  kind: MemberEntitlementKind;
  label: string;
  granted: number;
  used: number;
  sourceOrders: number;
}) {
  return {
    ...input,
    remaining: Math.max(0, input.granted - input.used),
  } satisfies MemberEntitlementBalance;
}

export function getProductQuotaSummary(product: Product) {
  return {
    reportQuota: product.reportQuota ?? 0,
    palmQuota: product.palmQuota ?? 0,
  };
}

export function buildMemberEntitlementSummary(input: {
  orders: MockOrder[];
  reports: MockReport[];
}) {
  const paidMembershipOrders = input.orders.filter(isPaidMembershipOrder);
  const reportQuota = createBalance({
    kind: "deep_report",
    label: "深度报告额度",
    granted: sumQuota(paidMembershipOrders, "reportQuota"),
    used: countUsedReports(input.reports),
    sourceOrders: paidMembershipOrders.length,
  });
  const palmQuota = createBalance({
    kind: "palm_reading",
    label: "手相额度",
    granted: sumQuota(paidMembershipOrders, "palmQuota"),
    used: countUsedPalmReadings(input.reports),
    sourceOrders: paidMembershipOrders.length,
  });

  return {
    balances: [reportQuota, palmQuota],
    reportQuota,
    palmQuota,
  } satisfies MemberEntitlementSummary;
}

export async function getMemberEntitlementSummary(input: {
  userId: string;
  orders: MockOrder[];
  reports: MockReport[];
}) {
  await getProductRuntimeConfigMap();

  const fallbackSummary = buildMemberEntitlementSummary(input);

  await syncMembershipEntitlementsFromPaidOrders({
    userId: input.userId,
    orders: input.orders,
  });

  return (await getStoredMemberEntitlementSummary(input.userId)) ?? fallbackSummary;
}

export function getEntitlementUsageLabel(balance: MemberEntitlementBalance) {
  return `${balance.used}/${balance.granted}`;
}

export function createEntitlementUsageSnapshot<Kind extends MemberEntitlementKind>(
  kind: Kind,
) {
  return {
    paymentSource: "membership_quota",
    entitlementKind: kind,
  } as const;
}
