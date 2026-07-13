import "server-only";

import { starCosts, type FeatureCode } from "@/lib/commerce";
import type { SessionPayload } from "@/lib/session";

export function getResolvedStarCost(featureCode: FeatureCode) {
  const cost = starCosts[featureCode];
  return cost.min;
}

export function checkEntitlement(session: SessionPayload, featureCode: FeatureCode) {
  const requiredStars = getResolvedStarCost(featureCode);

  return {
    ok: session.starBalance >= requiredStars,
    featureCode,
    requiredStars,
    balance: session.starBalance,
  };
}
