import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  getLaunchEvidenceGap,
  type LaunchEvidenceGap,
  type LaunchEvidenceGapItem,
  type LaunchEvidenceGapKind,
} from "@/lib/launch-evidence-gap";

export type LaunchEvidenceActionBucket = {
  kind: LaunchEvidenceGapKind;
  label: string;
  order: number;
  status: HealthStatus;
  owner: string;
  goal: string;
  action: string;
  evidence: string;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
  };
  routes: string[];
  items: LaunchEvidenceGapItem[];
  nextItems: LaunchEvidenceGapItem[];
  copyText: string;
};

export type LaunchEvidenceActionCenter = {
  generatedAt: string;
  status: HealthStatus;
  label: string;
  detail: string;
  action: string;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
    buckets: number;
    evidenceCoverageScore: number;
  };
  snapshot: LaunchEvidenceGap["snapshot"];
  buckets: LaunchEvidenceActionBucket[];
  nextBuckets: LaunchEvidenceActionBucket[];
  nextItems: LaunchEvidenceGapItem[];
  copyText: string;
};

type LaunchEvidenceActionCenterInput = {
  evidenceGap?: LaunchEvidenceGap;
};

const bucketMeta = {
  screenshot: {
    label: "截图/录屏",
    order: 1,
    owner: "产品 / 运营 / 技术",
    goal: "证明用户主链路、协议页面、后台看板和第三方配置真实可见。",
    action: "按优先级补首页、登录、会员、工具、协议、后台健康页和第三方配置截图或录屏。",
    evidence: "截图、录屏或可复核的页面链接。",
  },
  receipt: {
    label: "平台回执",
    order: 2,
    owner: "创始人 / 财务 / 运营",
    goal: "证明主体、备案、支付、七牛、OpenAI 等平台申请不是口头状态。",
    action: "补齐平台申请提交回执、审核状态、商户主体和证据链接。",
    evidence: "平台后台截图、审核回执号、证据链接或提交邮件。",
  },
  small_order: {
    label: "小额订单",
    order: 3,
    owner: "财务 / 技术 / 产品",
    goal: "证明真实支付能完成下单、回调、交易号、权益到账和对账。",
    action: "至少先闭合一个真实渠道小额订单，再补齐第二渠道。",
    evidence: "支付平台交易号、订单 PAID 状态、钱包流水、会员权益和对账截图。",
  },
  cost_sample: {
    label: "成本样本",
    order: 4,
    owner: "产品 / 技术 / 增长",
    goal: "证明 AI 调用能记录 tokens、成本来源和毛利复盘口径。",
    action: "补真实对话、手相视觉、深度报告等 UsageLog 成本样本，并复核 OpenAI 费率变量。",
    evidence: "UsageLog 中 provider、model、tokens、costCents、estimatedCost、costSource 和关联功能记录。",
  },
  archive: {
    label: "后台归档",
    order: 5,
    owner: "技术 / 运营",
    goal: "证明上线判断、预检、Runbook、落库和第三方诊断已沉淀为可追溯记录。",
    action: "处理阻断后刷新上线证据归档，并确认最新归档与当前 Go/No-Go 一致。",
    evidence: "UsageLog(feature=launch_evidence) 最新归档记录。",
  },
  admin_record: {
    label: "后台记录",
    order: 6,
    owner: "技术 / 运营 / 增长",
    goal: "证明后台配置、外部事项、任务承诺和诊断不是临时口头状态。",
    action: "补后台外部事项、任务承诺、诊断、预算或配置记录。",
    evidence: "后台记录、审计日志、UsageLog 或管理页截图。",
  },
} satisfies Record<
  LaunchEvidenceGapKind,
  {
    label: string;
    order: number;
    owner: string;
    goal: string;
    action: string;
    evidence: string;
  }
>;

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

function worstStatus(items: LaunchEvidenceGapItem[]) {
  return items
    .map((item) => item.status)
    .sort((a, b) => statusRank(a) - statusRank(b))[0] ?? "ready";
}

function summarize(items: LaunchEvidenceGapItem[]) {
  return {
    ready: items.filter((item) => item.status === "ready").length,
    warning: items.filter((item) => item.status === "warning").length,
    blocking: items.filter((item) => item.status === "blocking").length,
    total: items.length,
  };
}

function uniqueRoutes(items: LaunchEvidenceGapItem[]) {
  return Array.from(
    new Set(
      items
        .flatMap((item) => item.routes ?? [])
        .filter((route) => route.length > 0),
    ),
  );
}

function sortItems(items: LaunchEvidenceGapItem[]) {
  return [...items].sort(
    (a, b) =>
      statusRank(a.status) - statusRank(b.status) ||
      a.group.localeCompare(b.group, "zh-CN") ||
      a.title.localeCompare(b.title, "zh-CN"),
  );
}

function buildBucket(input: {
  kind: LaunchEvidenceGapKind;
  items: LaunchEvidenceGapItem[];
}) {
  const meta = bucketMeta[input.kind];
  const sortedItems = sortItems(input.items);
  const summary = summarize(sortedItems);
  const status = worstStatus(sortedItems);
  const nextItems = sortedItems.filter((item) => item.status !== "ready").slice(0, 5);
  const lines =
    sortedItems.length > 0
      ? sortedItems.map(
          (item, index) =>
            `${index + 1}. [${item.status}] ${item.group} / ${item.title}：${item.action} 证据：${item.evidence}`,
        )
      : ["暂无缺口。"];

  return {
    kind: input.kind,
    label: meta.label,
    order: meta.order,
    status,
    owner: meta.owner,
    goal: meta.goal,
    action: meta.action,
    evidence: meta.evidence,
    summary,
    routes: uniqueRoutes(sortedItems),
    items: sortedItems,
    nextItems,
    copyText: [
      `玄机 AI ${meta.label}补证清单`,
      `状态：${status}`,
      `负责人：${meta.owner}`,
      `目标：${meta.goal}`,
      "",
      ...lines,
    ].join("\n"),
  } satisfies LaunchEvidenceActionBucket;
}

function actionCenterStatus(buckets: LaunchEvidenceActionBucket[]) {
  if (buckets.some((bucket) => bucket.status === "blocking")) {
    return "blocking" as const;
  }

  if (buckets.some((bucket) => bucket.status === "warning")) {
    return "warning" as const;
  }

  return "ready" as const;
}

function buildCopyText(input: {
  status: HealthStatus;
  label: string;
  evidenceGap: LaunchEvidenceGap;
  buckets: LaunchEvidenceActionBucket[];
}) {
  const bucketLines = input.buckets.map(
    (bucket) =>
      `- [${bucket.status}] ${bucket.label}：${bucket.summary.total} 项，${bucket.summary.blocking} 阻断 / ${bucket.summary.warning} 待复核。下一步：${bucket.nextItems[0]?.title ?? bucket.action}`,
  );
  const nextLines =
    input.evidenceGap.nextGaps.length > 0
      ? input.evidenceGap.nextGaps.map(
          (item, index) =>
            `${index + 1}. [${item.status}] ${item.group} / ${item.title}：${item.action} 证据：${item.evidence}`,
        )
      : ["暂无优先补证项。"];

  return [
    "玄机 AI 上线证据行动中心",
    `状态：${input.label} (${input.status})`,
    `验收可执行率：${input.evidenceGap.coverage.score}%`,
    `证据归档：${input.evidenceGap.snapshot.label}`,
    "",
    "按类型推进：",
    ...bucketLines,
    "",
    "优先补证：",
    ...nextLines,
  ].join("\n");
}

export async function getLaunchEvidenceActionCenter(input?: LaunchEvidenceActionCenterInput) {
  const evidenceGap = input?.evidenceGap ?? (await getLaunchEvidenceGap());
  const buckets = evidenceKindOrder
    .map((kind) =>
      buildBucket({
        kind,
        items: evidenceGap.gaps.filter((item) => item.evidenceKinds.includes(kind)),
      }),
    )
    .filter((bucket) => bucket.summary.total > 0);
  const status = actionCenterStatus(buckets);
  const bucketSummary = summarize(buckets.flatMap((bucket) => bucket.items));
  const label =
    status === "ready"
      ? "上线证据行动中心已闭合"
      : status === "warning"
        ? `上线证据行动中心有 ${bucketSummary.warning} 个待复核项`
        : `上线证据行动中心有 ${bucketSummary.blocking} 个阻断项`;

  return {
    generatedAt: new Date().toISOString(),
    status,
    label,
    detail:
      status === "ready"
        ? "截图/录屏、平台回执、小额订单、成本样本、后台归档和后台记录均已闭合。"
        : "把所有上线证据按类型拆成行动清单，方便你每天按截图、回执、小额订单、成本样本和后台记录推进。",
    action:
      status === "blocking"
        ? "先补阻断类型中的第一批证据，尤其是平台回执、公网截图、小额订单和后台归档。"
        : status === "warning"
          ? "复核警告项并刷新上线证据归档。"
          : "保留最终证据包，进入小额真实订单或放量复盘。",
    summary: {
      ...bucketSummary,
      buckets: buckets.length,
      evidenceCoverageScore: evidenceGap.coverage.score,
    },
    snapshot: evidenceGap.snapshot,
    buckets,
    nextBuckets: buckets.filter((bucket) => bucket.status !== "ready").slice(0, 4),
    nextItems: evidenceGap.nextGaps,
    copyText: buildCopyText({ status, label, evidenceGap, buckets }),
  } satisfies LaunchEvidenceActionCenter;
}
