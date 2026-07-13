import "server-only";

import {
  auditChannelSource,
  channelSegmentLabels,
  type ChannelSourceAudit,
} from "@/lib/channel-source";
import type { GrowthRoiRow } from "@/lib/growth-roi";

export type ChannelSourceGovernanceIssue = ChannelSourceAudit & {
  landings: number;
  paidOrders: number;
  revenueCents: number;
};

export type ChannelSourceGovernance = {
  totalSources: number;
  standardSources: number;
  issueSources: number;
  unknownSources: number;
  normalizationSources: number;
  healthRate: number;
  issues: ChannelSourceGovernanceIssue[];
  standardLabel: string;
};

export function buildChannelSourceGovernance(rows: GrowthRoiRow[]) {
  const issues: ChannelSourceGovernanceIssue[] = [];
  let standardSources = 0;
  let unknownSources = 0;
  let normalizationSources = 0;

  for (const row of rows) {
    const audit = auditChannelSource(row.source);

    if (audit.status === "standard") {
      standardSources += 1;
      continue;
    }

    if (audit.status === "unknown") {
      unknownSources += 1;
    }

    if (audit.status === "needs_normalization") {
      normalizationSources += 1;
    }

    issues.push({
      ...audit,
      label: audit.label || channelSegmentLabels[audit.segment],
      landings: row.landings,
      paidOrders: row.paidOrders,
      revenueCents: row.revenueCents,
    });
  }

  const totalSources = rows.length;
  const issueSources = issues.length;
  const healthRate = totalSources > 0 ? standardSources / totalSources : 1;

  return {
    totalSources,
    standardSources,
    issueSources,
    unknownSources,
    normalizationSources,
    healthRate,
    issues: issues
      .sort(
        (a, b) =>
          b.revenueCents - a.revenueCents ||
          b.paidOrders - a.paidOrders ||
          b.landings - a.landings ||
          a.source.localeCompare(b.source),
      )
      .slice(0, 8),
    standardLabel: `${standardSources}/${totalSources || 0}`,
  } satisfies ChannelSourceGovernance;
}
