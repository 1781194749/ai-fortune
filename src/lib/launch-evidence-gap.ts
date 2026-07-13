import "server-only";

import {
  getLaunchAcceptanceMatrix,
  type LaunchAcceptanceCase,
  type LaunchAcceptanceMatrix,
} from "@/lib/launch-acceptance";
import {
  getLaunchComplianceChecklist,
  type LaunchComplianceChecklist,
  type LaunchComplianceItem,
} from "@/lib/launch-compliance";
import {
  getLaunchApplicationPack,
  type LaunchApplicationPack,
  type LaunchApplicationPlatform,
} from "@/lib/launch-application-pack";
import type { HealthStatus } from "@/lib/health-checks";
import {
  getLaunchPackage,
  type LaunchPackage,
  type LaunchPackageAction,
} from "@/lib/launch-package";
import {
  getLaunchPaymentAcceptance,
  type LaunchPaymentAcceptance,
  type LaunchPaymentAcceptanceItem,
} from "@/lib/launch-payment-acceptance";
import {
  getLaunchUnitEconomics,
  type LaunchUnitEconomics,
  type LaunchUnitEconomicsIssue,
} from "@/lib/launch-unit-economics";

export type LaunchEvidenceGapSource =
  | "snapshot"
  | "acceptance"
  | "readiness"
  | "runbook"
  | "external"
  | "payment"
  | "compliance"
  | "application_pack"
  | "unit_economics";

export type LaunchEvidenceGapKind =
  | "screenshot"
  | "receipt"
  | "small_order"
  | "cost_sample"
  | "archive"
  | "admin_record";

export type LaunchEvidenceGapItem = {
  id: string;
  source: LaunchEvidenceGapSource;
  evidenceKinds: LaunchEvidenceGapKind[];
  group: string;
  title: string;
  status: HealthStatus;
  owner?: string;
  detail: string;
  action: string;
  evidence: string;
  routes?: string[];
  relatedIssues?: string[];
};

export type LaunchEvidenceGap = {
  generatedAt: string;
  status: HealthStatus;
  label: string;
  detail: string;
  action: string;
  snapshot: {
    state: LaunchPackage["summary"]["evidence"]["state"];
    label: string;
    latestArchivedAt?: string;
    refreshReasons: string[];
  };
  coverage: {
    score: number;
    ready: number;
    warning: number;
    blocking: number;
    total: number;
  };
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
  };
  evidenceKindSummary: Array<{
    kind: LaunchEvidenceGapKind;
    label: string;
    count: number;
    blocking: number;
    warning: number;
  }>;
  gaps: LaunchEvidenceGapItem[];
  nextGaps: LaunchEvidenceGapItem[];
  copyText: string;
};

const evidenceKindLabels = {
  screenshot: "截图/录屏",
  receipt: "平台回执",
  small_order: "小额订单",
  cost_sample: "成本样本",
  archive: "后台归档",
  admin_record: "后台记录",
} satisfies Record<LaunchEvidenceGapKind, string>;

const evidenceKindOrder = [
  "screenshot",
  "receipt",
  "small_order",
  "cost_sample",
  "archive",
  "admin_record",
] satisfies LaunchEvidenceGapKind[];

function statusRank(status: HealthStatus) {
  if (status === "blocking") {
    return 0;
  }

  if (status === "warning") {
    return 1;
  }

  return 2;
}

function snapshotGap(launchPackage: LaunchPackage): LaunchEvidenceGapItem[] {
  const state = launchPackage.summary.evidence;

  if (state.state === "available") {
    return [];
  }

  return [
    {
      id: `snapshot:${state.state}`,
      source: "snapshot",
      evidenceKinds: ["archive"],
      group: "上线证据归档",
      title: state.state === "needs_refresh" ? "刷新当前上线证据快照" : "归档当前上线证据快照",
      status: "warning",
      detail:
        state.state === "needs_refresh"
          ? `最新证据归档与当前${state.refreshReasons.join("、")}不一致，后续复核会看到旧状态。`
          : "还没有可追溯的上线证据快照，后续无法证明当时的上线判断依据。",
      action:
        state.state === "needs_refresh"
          ? "处理本轮阻断或警告项后，在后台健康页重新归档一次上线证据。"
          : "先运行落库探针和第三方诊断，再在后台健康页归档当前上线证据。",
      evidence: "UsageLog(feature=launch_evidence) 中存在与当前 Go / No-Go 摘要一致的最新记录。",
    },
  ];
}

function acceptanceGap(item: LaunchAcceptanceCase): LaunchEvidenceGapItem {
  const relatedIssues = item.relatedIssues.map((issue) => `${issue.group} / ${issue.label}`);

  return {
    id: `acceptance:${item.id}`,
    source: "acceptance",
    evidenceKinds: ["screenshot"],
    group: item.group,
    title: item.title,
    status: item.status,
    owner: item.owner,
    detail: item.goal,
    action:
      relatedIssues.length > 0
        ? `先处理关联阻断或警告项：${relatedIssues.slice(0, 3).join("、")}，再执行该用例并留证。`
        : "执行该端到端用例，并把截图、录屏或后台记录补到上线材料中。",
    evidence: item.evidence,
    routes: item.routes,
    relatedIssues,
  };
}

function packageActionSource(action: LaunchPackageAction): LaunchEvidenceGapSource {
  if (action.type === "runbook") {
    return "runbook";
  }

  if (action.type === "external") {
    return "external";
  }

  return "readiness";
}

function packageGap(action: LaunchPackageAction): LaunchEvidenceGapItem {
  return {
    id: `package:${action.id}`,
    source: packageActionSource(action),
    evidenceKinds: action.type === "external" ? ["receipt", "screenshot"] : ["admin_record"],
    group: action.group ?? action.owner ?? "上线包",
    title: action.title,
    status: action.status,
    owner: action.owner,
    detail: action.detail,
    action: action.action,
    evidence: action.evidence ?? "在后台健康页或对应第三方平台保留可追溯截图、记录或交易凭证。",
  };
}

function paymentGap(item: LaunchPaymentAcceptanceItem): LaunchEvidenceGapItem {
  return {
    id: `payment:${item.id}`,
    source: "payment",
    evidenceKinds: ["small_order"],
    group: `真实支付 / ${item.group}`,
    title: item.title,
    status: item.status,
    detail: item.detail,
    action: item.action,
    evidence: item.evidence,
  };
}

function complianceGap(item: LaunchComplianceItem): LaunchEvidenceGapItem {
  return {
    id: `compliance:${item.id}`,
    source: "compliance",
    evidenceKinds: ["screenshot"],
    group: `合规核对 / ${item.group}`,
    title: item.title,
    status: item.status,
    detail: item.detail,
    action: item.action,
    evidence: item.evidence,
    routes: item.routes,
  };
}

function applicationGap(platform: LaunchApplicationPlatform): LaunchEvidenceGapItem {
  const evidenceKinds = [
    platform.submission.receiptNo ? undefined : "receipt",
    platform.submission.evidenceUrl ? undefined : "screenshot",
  ].filter((kind): kind is LaunchEvidenceGapKind => Boolean(kind));

  return {
    id: `application:${platform.id}`,
    source: "application_pack",
    evidenceKinds: evidenceKinds.length > 0 ? evidenceKinds : ["receipt"],
    group: `平台申请 / ${platform.owner}`,
    title: platform.title,
    status: platform.status,
    owner: platform.owner,
    detail: platform.purpose,
    action: platform.nextAction,
    evidence: platform.evidence.join("；") || "平台申请材料已准备并留存截图或回执。",
  };
}

function unitEconomicsGap(item: LaunchUnitEconomicsIssue): LaunchEvidenceGapItem {
  return {
    id: `unit-economics:${item.id}`,
    source: "unit_economics",
    evidenceKinds: ["cost_sample"],
    group: `单位经济 / ${item.group}`,
    title: item.title,
    status: item.status,
    detail: item.detail,
    action: item.action,
    evidence: item.evidence,
  };
}

function uniqueGaps(gaps: LaunchEvidenceGapItem[]) {
  const seen = new Set<string>();

  return gaps.filter((gap) => {
    if (seen.has(gap.id)) {
      return false;
    }

    seen.add(gap.id);
    return true;
  });
}

function sortGaps(gaps: LaunchEvidenceGapItem[]) {
  return [...gaps].sort(
    (a, b) =>
      statusRank(a.status) - statusRank(b.status) ||
      a.group.localeCompare(b.group, "zh-CN") ||
      a.title.localeCompare(b.title, "zh-CN"),
  );
}

function summarize(gaps: LaunchEvidenceGapItem[]) {
  return {
    ready: gaps.filter((item) => item.status === "ready").length,
    warning: gaps.filter((item) => item.status === "warning").length,
    blocking: gaps.filter((item) => item.status === "blocking").length,
    total: gaps.length,
  };
}

function summarizeEvidenceKinds(gaps: LaunchEvidenceGapItem[]) {
  return evidenceKindOrder.map((kind) => {
    const items = gaps.filter((item) => item.evidenceKinds.includes(kind));

    return {
      kind,
      label: evidenceKindLabels[kind],
      count: items.length,
      blocking: items.filter((item) => item.status === "blocking").length,
      warning: items.filter((item) => item.status === "warning").length,
    };
  });
}

function buildCoverage(input: {
  acceptance: LaunchAcceptanceMatrix;
  launchPackage: LaunchPackage;
  paymentAcceptance: LaunchPaymentAcceptance;
  compliance: LaunchComplianceChecklist;
  applicationPack: LaunchApplicationPack;
  unitEconomics: LaunchUnitEconomics;
}) {
  const snapshotStatus = input.launchPackage.summary.evidence.state;
  const snapshotReady = snapshotStatus === "available" ? 1 : 0;
  const snapshotWarning = snapshotStatus === "available" ? 0 : 1;
  const total =
    input.acceptance.summary.total +
    input.paymentAcceptance.summary.total +
    input.compliance.summary.total +
    input.applicationPack.summary.total +
    input.unitEconomics.summary.total +
    1;
  const ready =
    input.acceptance.summary.ready +
    input.paymentAcceptance.summary.ready +
    input.compliance.summary.ready +
    input.applicationPack.summary.ready +
    input.unitEconomics.summary.ready +
    snapshotReady;
  const warning =
    input.acceptance.summary.warning +
    input.paymentAcceptance.summary.warning +
    input.compliance.summary.warning +
    input.applicationPack.summary.warning +
    input.unitEconomics.summary.warning +
    snapshotWarning;
  const blocking =
    input.acceptance.summary.blocking +
    input.paymentAcceptance.summary.blocking +
    input.compliance.summary.blocking +
    input.applicationPack.summary.blocking +
    input.unitEconomics.summary.blocking;

  return {
    score: total > 0 ? Math.round((ready / total) * 100) : 100,
    ready,
    warning,
    blocking,
    total,
  };
}

function evidenceGapStatus(input: {
  launchPackage: LaunchPackage;
  acceptance: LaunchAcceptanceMatrix;
  applicationPack: LaunchApplicationPack;
  unitEconomics: LaunchUnitEconomics;
  summary: ReturnType<typeof summarize>;
}): HealthStatus {
  if (
    input.launchPackage.status === "blocking" ||
    input.acceptance.status === "blocking" ||
    input.applicationPack.status === "blocking" ||
    input.unitEconomics.status === "blocking" ||
    input.summary.blocking > 0
  ) {
    return "blocking";
  }

  if (
    input.launchPackage.status === "warning" ||
    input.acceptance.status === "warning" ||
    input.applicationPack.status === "warning" ||
    input.unitEconomics.status === "warning" ||
    input.summary.warning > 0
  ) {
    return "warning";
  }

  return "ready";
}

function evidenceGapCopy(input: {
  status: HealthStatus;
  coverage: LaunchEvidenceGap["coverage"];
  snapshot: LaunchEvidenceGap["snapshot"];
  evidenceKindSummary: LaunchEvidenceGap["evidenceKindSummary"];
  gaps: LaunchEvidenceGapItem[];
}) {
  const lines = input.gaps.length
    ? input.gaps.map(
        (item, index) =>
          `${index + 1}. [${item.status}] ${item.group} / ${item.title} / ${item.evidenceKinds.map((kind) => evidenceKindLabels[kind]).join("+")}：${item.action} 证据：${item.evidence}`,
      )
    : ["暂无证据缺口。"];
  const kindLines = input.evidenceKindSummary
    .filter((item) => item.count > 0)
    .map((item) => `- ${item.label}：${item.count} 项 (${item.blocking} 阻断 / ${item.warning} 待复核)`);

  return [
    "玄机 AI 上线证据闭环清单",
    `状态：${input.status}`,
    `验收可执行率：${input.coverage.score}% (${input.coverage.ready}/${input.coverage.total})`,
    `证据归档：${input.snapshot.label}`,
    "",
    "补证类型：",
    ...(kindLines.length > 0 ? kindLines : ["- 暂无补证类型缺口。"]),
    "",
    ...lines,
  ].join("\n");
}

export async function getLaunchEvidenceGap(input?: {
  launchPackage?: LaunchPackage;
  acceptance?: LaunchAcceptanceMatrix;
  paymentAcceptance?: LaunchPaymentAcceptance;
  compliance?: LaunchComplianceChecklist;
  applicationPack?: LaunchApplicationPack;
  unitEconomics?: LaunchUnitEconomics;
}) {
  const [
    launchPackage,
    acceptance,
    paymentAcceptance,
    compliance,
    applicationPack,
    unitEconomics,
  ] = await Promise.all([
    input?.launchPackage ?? getLaunchPackage(),
    input?.acceptance ?? getLaunchAcceptanceMatrix(),
    input?.paymentAcceptance ?? getLaunchPaymentAcceptance(),
    input?.compliance ?? getLaunchComplianceChecklist(),
    input?.applicationPack ?? getLaunchApplicationPack(),
    input?.unitEconomics ?? getLaunchUnitEconomics(),
  ]);
  const gaps = sortGaps(
    uniqueGaps([
      ...snapshotGap(launchPackage),
      ...acceptance.nextCases.map(acceptanceGap),
      ...paymentAcceptance.nextItems.map(paymentGap),
      ...compliance.nextItems.map(complianceGap),
      ...applicationPack.nextPlatforms.map(applicationGap),
      ...unitEconomics.nextIssues.map(unitEconomicsGap),
      ...launchPackage.requiredBeforeGo
        .filter((item) => item.type !== "evidence")
        .map(packageGap),
      ...launchPackage.nextActions.filter((item) => item.type !== "evidence").map(packageGap),
    ]),
  );
  const summary = summarize(gaps);
  const evidenceKindSummary = summarizeEvidenceKinds(gaps);
  const coverage = buildCoverage({
    acceptance,
    launchPackage,
    paymentAcceptance,
    compliance,
    applicationPack,
    unitEconomics,
  });
  const status = evidenceGapStatus({
    launchPackage,
    acceptance,
    applicationPack,
    unitEconomics,
    summary,
  });
  const label =
    status === "blocking"
      ? `证据闭环有 ${summary.blocking} 个阻断缺口`
      : status === "warning"
        ? `证据闭环有 ${summary.warning} 个待复核缺口`
        : "上线证据闭环可进入灰度";
  const detail =
    status === "ready"
      ? "端到端验收用例、上线包和证据归档均已闭合。"
      : `当前验收可执行率 ${coverage.score}%，需要优先处理阻断项，并把关键用例、支付小额订单和后台归档证据补齐。`;
  const action =
    status === "blocking"
      ? "先处理阻断缺口，再执行端到端验收用例并归档最新上线证据。"
      : status === "warning"
        ? "复核警告缺口，刷新上线证据后进入小额真实订单灰度。"
        : "保留最终证据包，按灰度放量计划推进真实收费流量。";
  const snapshot = {
    state: launchPackage.summary.evidence.state,
    label: launchPackage.summary.evidence.label,
    latestArchivedAt: launchPackage.summary.evidence.latestArchivedAt,
    refreshReasons: launchPackage.summary.evidence.refreshReasons,
  };

  return {
    generatedAt: new Date().toISOString(),
    status,
    label,
    detail,
    action,
    snapshot,
    coverage,
    summary,
    evidenceKindSummary,
    gaps,
    nextGaps: gaps.filter((item) => item.status !== "ready").slice(0, 8),
    copyText: evidenceGapCopy({ status, coverage, snapshot, evidenceKindSummary, gaps }),
  } satisfies LaunchEvidenceGap;
}
