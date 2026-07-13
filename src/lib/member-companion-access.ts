import type { MembershipTierCode } from "@/lib/commerce";

export const memberCompanionTier: MembershipTierCode = "YEARLY";

export function hasMemberCompanionAccess(tier: MembershipTierCode) {
  return tier === memberCompanionTier;
}
