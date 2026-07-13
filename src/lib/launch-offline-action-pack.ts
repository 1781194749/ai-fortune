import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  getLaunchApplicationPack,
  type LaunchApplicationPack,
  type LaunchApplicationPlatform,
} from "@/lib/launch-application-pack";
import {
  getLaunchEnvBatchPlan,
  type LaunchEnvBatchPlan,
} from "@/lib/launch-env-batch-plan";
import type { ExternalReadinessItemId } from "@/lib/launch-external-readiness";
import {
  getLaunchFounderDossier,
  type LaunchFounderDossier,
} from "@/lib/launch-founder-dossier";
import {
  getLaunchMaterialPack,
  type LaunchMaterialItem,
  type LaunchMaterialPack,
} from "@/lib/launch-materials";
import {
  getLaunchScheduleRisk,
  type LaunchScheduleItem,
  type LaunchScheduleRisk,
} from "@/lib/launch-schedule";

export type LaunchOfflineActionPackField = {
  label: string;
  value: string;
  status: HealthStatus;
  action: string;
};

export type LaunchOfflineActionPackItem = {
  id: ExternalReadinessItemId;
  order: number;
  phase: string;
  title: string;
  owner: string;
  status: HealthStatus;
  statusLabel: string;
  priority: number;
  dependencyLabel: string;
  blockedBy: string[];
  targetDate?: string;
  suggestedTargetDate?: string;
  scheduleLabel?: string;
  scheduleDetail?: string;
  receiptNo?: string;
  evidenceUrl?: string;
  evidenceNote?: string;
  note?: string;
  action: string;
  firstStep: string;
  materials: string[];
  outputs: string[];
  envKeys: string[];
  envBatches: string[];
  platformFields: LaunchOfflineActionPackField[];
  officialUrl?: string;
  evidenceNeeded: string;
  validation: string[];
};

export type LaunchOfflineActionPackGroup = {
  title: string;
  status: HealthStatus;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
  };
  items: LaunchOfflineActionPackItem[];
};

export type LaunchOfflineActionPackTodayAction = {
  id: string;
  status: HealthStatus;
  title: string;
  owner: string;
  phase: string;
  action: string;
  evidence: string;
  dueLabel: string;
  suggestedTargetDate?: string;
  scheduleLabel?: string;
  unlocks: string[];
  envKeys: string[];
};

export type LaunchOfflineActionPack = {
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
    groups: number;
    materials: number;
    envKeys: number;
    platformFields: number;
    receipts: number;
    evidenceLinks: number;
    unblockedActions: number;
  };
  currentAction: LaunchOfflineActionPackTodayAction;
  groups: LaunchOfflineActionPackGroup[];
  items: LaunchOfflineActionPackItem[];
  todayActions: LaunchOfflineActionPackTodayAction[];
  officialRefs: Array<{
    title: string;
    url: string;
    note: string;
  }>;
  copyText: string;
};

type LaunchOfflineActionPackInput = {
  materials?: LaunchMaterialPack;
  founderDossier?: LaunchFounderDossier;
  applicationPack?: LaunchApplicationPack;
  envBatchPlan?: LaunchEnvBatchPlan;
  schedule?: LaunchScheduleRisk;
};

const materialOrder: Record<ExternalReadinessItemId, number> = {
  entity: 10,
  domain: 20,
  icp: 30,
  postgres: 40,
  openai: 50,
  qiniu: 60,
  wechat_open: 70,
  alipay: 80,
  wechat_pay: 90,
  legal_review: 100,
};

function statusRank(status: HealthStatus) {
  if (status === "blocking") {
    return 0;
  }

  if (status === "warning") {
    return 1;
  }

  return 2;
}

function actionStatus(item: LaunchMaterialItem): HealthStatus {
  if (item.status === "ready") {
    return "ready";
  }

  if (item.status === "in_progress" || item.status === "submitted") {
    return "warning";
  }

  return "blocking";
}

function summaryFor(items: Array<{ status: HealthStatus }>) {
  return {
    ready: items.filter((item) => item.status === "ready").length,
    warning: items.filter((item) => item.status === "warning").length,
    blocking: items.filter((item) => item.status === "blocking").length,
    total: items.length,
  };
}

function groupStatus(items: Array<{ status: HealthStatus }>) {
  if (items.some((item) => item.status === "blocking")) {
    return "blocking" as const;
  }

  if (items.some((item) => item.status === "warning")) {
    return "warning" as const;
  }

  return "ready" as const;
}

function uniqueText(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function applicationPlatformByMaterial(applicationPack: LaunchApplicationPack) {
  return new Map<string, LaunchApplicationPlatform>(
    applicationPack.platforms.map((platform) => [platform.id, platform]),
  );
}

function batchesForMaterial(item: LaunchMaterialItem, envBatchPlan: LaunchEnvBatchPlan) {
  return envBatchPlan.batches.filter((batch) =>
    batch.entries.some((entry) => item.envKeys.includes(entry.key)),
  );
}

function officialUrlFor(input: {
  item: LaunchMaterialItem;
  platform?: LaunchApplicationPlatform;
  founderDossier: LaunchFounderDossier;
}) {
  if (input.platform?.officialUrl) {
    return input.platform.officialUrl;
  }

  const keywordById: Partial<Record<ExternalReadinessItemId, string>> = {
    icp: "ICP",
    qiniu: "七牛",
    wechat_open: "微信开放平台",
    wechat_pay: "微信支付",
    alipay: "支付宝",
  };
  const keyword = keywordById[input.item.id];

  return keyword
    ? input.founderDossier.officialRefs.find((ref) => ref.title.includes(keyword))?.url
    : undefined;
}

function fieldsForPlatform(platform: LaunchApplicationPlatform | undefined) {
  return (
    platform?.fields.map((field) => ({
      label: field.label,
      value: field.value,
      status: field.status,
      action: field.action,
    })) ?? []
  ) satisfies LaunchOfflineActionPackField[];
}

function dependencyLabel(item: LaunchMaterialItem) {
  if (item.blockedBy.length > 0) {
    return `等待 ${item.blockedBy.join("、")} 后提交`;
  }

  if (item.status === "ready") {
    return "已闭合";
  }

  return "可立即推进";
}

function evidenceNeeded(item: LaunchMaterialItem) {
  return item.currentEvidence || item.verification[0] || "平台提交截图、审核回执或控制台配置截图。";
}

function buildItem(input: {
  material: LaunchMaterialItem;
  platform?: LaunchApplicationPlatform;
  founderDossier: LaunchFounderDossier;
  envBatchPlan: LaunchEnvBatchPlan;
  schedule?: LaunchScheduleItem;
}) {
  const batches = batchesForMaterial(input.material, input.envBatchPlan);

  return {
    id: input.material.id,
    order: materialOrder[input.material.id],
    phase: input.material.phase,
    title: input.material.title,
    owner: input.material.owner,
    status: actionStatus(input.material),
    statusLabel: input.material.statusLabel,
    priority: input.material.priority,
    dependencyLabel: dependencyLabel(input.material),
    blockedBy: input.material.blockedBy,
    targetDate: input.material.targetDate,
    suggestedTargetDate: input.schedule?.suggestedDate,
    scheduleLabel: input.schedule?.statusLabel,
    scheduleDetail: input.schedule?.detail,
    receiptNo: input.material.receiptNo,
    evidenceUrl: input.material.evidenceUrl,
    evidenceNote: input.material.evidenceNote,
    note: input.material.note,
    action: input.material.currentAction,
    firstStep: input.material.steps[0] ?? input.material.currentAction,
    materials: input.material.materials,
    outputs: input.material.outputs,
    envKeys: input.material.envKeys,
    envBatches: batches.map((batch) => batch.title),
    platformFields: fieldsForPlatform(input.platform),
    officialUrl: officialUrlFor({
      item: input.material,
      platform: input.platform,
      founderDossier: input.founderDossier,
    }),
    evidenceNeeded: evidenceNeeded(input.material),
    validation: uniqueText([
      ...input.material.verification,
      ...batches.flatMap((batch) => batch.validation.slice(0, 2)),
    ]).slice(0, 6),
  } satisfies LaunchOfflineActionPackItem;
}

function sortItems<T extends { status: HealthStatus; priority: number; title: string }>(items: T[]) {
  return [...items].sort(
    (a, b) =>
      statusRank(a.status) - statusRank(b.status) ||
      a.priority - b.priority ||
      a.title.localeCompare(b.title, "zh-CN"),
  );
}

function buildGroups(items: LaunchOfflineActionPackItem[]) {
  const phases = Array.from(new Set(items.map((item) => item.phase)));

  return phases.map((phase) => {
    const phaseItems = sortItems(items.filter((item) => item.phase === phase));

    return {
      title: phase,
      status: groupStatus(phaseItems),
      summary: summaryFor(phaseItems),
      items: phaseItems,
    } satisfies LaunchOfflineActionPackGroup;
  });
}

function todayAction(item: LaunchOfflineActionPackItem) {
  return {
    id: item.id,
    status: item.status,
    title: item.title,
    owner: item.owner,
    phase: item.phase,
    action: item.action,
    evidence: item.evidenceNeeded,
    dueLabel: item.targetDate ?? item.suggestedTargetDate ?? "未排期",
    suggestedTargetDate: item.suggestedTargetDate,
    scheduleLabel: item.scheduleLabel,
    unlocks: item.outputs,
    envKeys: item.envKeys,
  } satisfies LaunchOfflineActionPackTodayAction;
}

function doneAction() {
  return {
    id: "all-ready",
    status: "ready",
    title: "线下办理事项已闭合",
    owner: "创始人 / 技术 / 运营",
    phase: "上线复核",
    action: "进入真实支付小额订单验收，并把最终截图、回执和配置证据归档。",
    evidence: "后台 Go / No-Go、平台回执、小额订单和生产变量检查均为 ready。",
    dueLabel: "已完成",
    unlocks: ["真实支付灰度", "会员权益发放", "深度报告收费"],
    envKeys: [],
  } satisfies LaunchOfflineActionPackTodayAction;
}

function statusText(input: {
  summary: LaunchOfflineActionPack["summary"];
  currentAction: LaunchOfflineActionPackTodayAction;
}) {
  if (input.summary.blocking > 0) {
    return {
      status: "blocking" as const,
      label: `线下办理行动包有 ${input.summary.blocking} 个阻断事项`,
      detail: "当前主体、域名、备案、生产库、OpenAI/七牛或支付资质仍未闭合，真实收费上线需要继续守门。",
      action: `今天先处理：${input.currentAction.title}。${input.currentAction.action}`,
    };
  }

  if (input.summary.warning > 0) {
    return {
      status: "warning" as const,
      label: `线下办理行动包有 ${input.summary.warning} 个待复核事项`,
      detail: "核心事项已经进入办理或提交状态，需要补齐回执、截图、证据链接和生产变量验收。",
      action: `优先复核：${input.currentAction.title}。${input.currentAction.action}`,
    };
  }

  return {
    status: "ready" as const,
    label: "线下办理行动包已闭合",
    detail: "主体、域名、备案、数据库、AI/图片、支付和法务事项均已形成上线证据。",
    action: input.currentAction.action,
  };
}

function officialRefs(input: {
  founderDossier: LaunchFounderDossier;
  applicationPack: LaunchApplicationPack;
}) {
  const refs = [
    ...input.founderDossier.officialRefs,
    ...input.applicationPack.platforms.map((platform) => ({
      title: platform.title,
      url: platform.officialUrl,
      note: platform.purpose,
    })),
  ];
  const seen = new Set<string>();

  return refs.filter((ref) => {
    if (seen.has(ref.url)) {
      return false;
    }

    seen.add(ref.url);
    return true;
  });
}

function buildCopyText(input: {
  status: HealthStatus;
  label: string;
  summary: LaunchOfflineActionPack["summary"];
  currentAction: LaunchOfflineActionPackTodayAction;
  groups: LaunchOfflineActionPackGroup[];
  todayActions: LaunchOfflineActionPackTodayAction[];
  founderDossier: LaunchFounderDossier;
}) {
  const actionLines =
    input.todayActions.length > 0
      ? input.todayActions.map(
          (item, index) =>
            `${index + 1}. [${item.status}] ${item.phase} / ${item.title} / ${item.owner} / 目标日：${item.dueLabel}${item.scheduleLabel ? ` (${item.scheduleLabel})` : ""}\n   动作：${item.action}\n   证据：${item.evidence}\n   变量：${item.envKeys.join("、") || "无"}`,
        )
      : ["1. 当前没有待办理事项，进入小额真实订单和最终证据归档。"];
  const groupLines = input.groups.map(
    (group) =>
      `- ${group.title}: ${group.summary.ready}/${group.summary.total} ready, ${group.summary.blocking} blocking, ${group.summary.warning} warning`,
  );

  return [
    "玄机 AI 线下办理行动包",
    `状态：${input.label} (${input.status})`,
    `推荐主体路径：${input.founderDossier.pathDecision.recommendedPath.title}`,
    `总览：${input.summary.ready}/${input.summary.total} ready；材料 ${input.summary.materials} 项；变量 ${input.summary.envKeys} 个；平台字段 ${input.summary.platformFields} 个`,
    "",
    `今天先办：${input.currentAction.title}`,
    `负责人：${input.currentAction.owner}`,
    `动作：${input.currentAction.action}`,
    `验收证据：${input.currentAction.evidence}`,
    "",
    "办理分组：",
    ...groupLines,
    "",
    "优先动作：",
    ...actionLines,
  ].join("\n");
}

export async function getLaunchOfflineActionPack(input?: LaunchOfflineActionPackInput) {
  const materials = input?.materials ?? (await getLaunchMaterialPack());
  const founderDossier =
    input?.founderDossier ??
    (await getLaunchFounderDossier({
      materials,
    }));
  const applicationPack =
    input?.applicationPack ??
    (await getLaunchApplicationPack({
      materials,
      founderDossier,
    }));
  const envBatchPlan =
    input?.envBatchPlan ??
    (await getLaunchEnvBatchPlan({
      materials,
    }));
  const schedule = input?.schedule ?? (await getLaunchScheduleRisk());
  const platforms = applicationPlatformByMaterial(applicationPack);
  const scheduleById = new Map(schedule.items.map((item) => [item.id, item]));
  const items = materials.items
    .map((material) =>
      buildItem({
        material,
        platform: platforms.get(material.id),
        founderDossier,
        envBatchPlan,
        schedule: scheduleById.get(material.id),
      }),
    )
    .sort((a, b) => a.order - b.order);
  const groups = buildGroups(items);
  const actionItems = sortItems(items.filter((item) => item.status !== "ready"));
  const todayActions = actionItems.slice(0, 8).map(todayAction);
  const currentAction = todayActions[0] ?? doneAction();
  const envKeys = uniqueText(items.flatMap((item) => item.envKeys));
  const summary = {
    ...summaryFor(items),
    groups: groups.length,
    materials: items.reduce((sum, item) => sum + item.materials.length, 0),
    envKeys: envKeys.length,
    platformFields: items.reduce((sum, item) => sum + item.platformFields.length, 0),
    receipts: items.filter((item) => Boolean(item.receiptNo)).length,
    evidenceLinks: items.filter((item) => Boolean(item.evidenceUrl)).length,
    unblockedActions: items.filter((item) => item.status !== "ready" && item.blockedBy.length === 0)
      .length,
  } satisfies LaunchOfflineActionPack["summary"];
  const status = statusText({
    summary,
    currentAction,
  });

  return {
    generatedAt: new Date().toISOString(),
    ...status,
    summary,
    currentAction,
    groups,
    items,
    todayActions,
    officialRefs: officialRefs({
      founderDossier,
      applicationPack,
    }),
    copyText: buildCopyText({
      status: status.status,
      label: status.label,
      summary,
      currentAction,
      groups,
      todayActions,
      founderDossier,
    }),
  } satisfies LaunchOfflineActionPack;
}
