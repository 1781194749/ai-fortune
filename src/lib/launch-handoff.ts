import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  getLaunchEnvChecklist,
  type LaunchEnvChecklist,
  type LaunchEnvChecklistItem,
} from "@/lib/launch-env-checklist";
import {
  getLaunchGoalFollowup,
  type LaunchGoalFollowup,
  type LaunchGoalFollowupFillIn,
  type LaunchGoalFollowupItem,
} from "@/lib/launch-goal-followup";
import {
  getLaunchMaterialPack,
  type LaunchMaterialItem,
  type LaunchMaterialPack,
} from "@/lib/launch-materials";
import {
  getLaunchOfflineActionPack,
  type LaunchOfflineActionPack,
  type LaunchOfflineActionPackTodayAction,
} from "@/lib/launch-offline-action-pack";
import { getLaunchPackage, type LaunchPackage, type LaunchPackageAction } from "@/lib/launch-package";
import {
  getLaunchProductionGate,
  type LaunchProductionGate,
  type LaunchProductionGateItem,
} from "@/lib/launch-production-gate";

export type LaunchHandoffAction = {
  id: string;
  title: string;
  status: HealthStatus;
  group?: string;
  owner?: string;
  detail: string;
  action: string;
  evidence?: string;
};

export type LaunchHandoffEnvItem = {
  key: string;
  title: string;
  status: HealthStatus;
  group: string;
  stateLabel: string;
  displayValue: string;
  detail: string;
  action: string;
  sourceItems: string[];
};

export type LaunchHandoffExternalItem = {
  id: string;
  title: string;
  status: HealthStatus;
  group: string;
  phase: string;
  owner: string;
  statusLabel: string;
  currentAction: string;
  currentEvidence: string;
  envKeys: string[];
  outputs: string[];
};

export type LaunchHandoffOfflineAction = {
  status: HealthStatus;
  label: string;
  detail: string;
  action: string;
  blocking: number;
  warning: number;
  current: LaunchOfflineActionPackTodayAction;
  todayActions: LaunchOfflineActionPackTodayAction[];
};

export type LaunchHandoffGoalFollowupItem = Pick<
  LaunchGoalFollowupItem,
  "id" | "title" | "status" | "detail" | "action" | "evidence"
>;

export type LaunchHandoffGoalFollowupFillIn = Pick<
  LaunchGoalFollowupFillIn,
  | "id"
  | "title"
  | "status"
  | "sectionLabel"
  | "sectionId"
  | "route"
  | "api"
  | "action"
  | "payloadHint"
  | "payloadTemplate"
  | "curlCommand"
  | "persistence"
  | "evidence"
  | "sourceItemIds"
>;

export type LaunchHandoffProductionGateItem = Pick<
  LaunchProductionGateItem,
  "id" | "label" | "status" | "detail" | "action" | "evidence"
>;

export type LaunchHandoff = {
  generatedAt: string;
  status: HealthStatus;
  label: string;
  summaryLines: string[];
  snapshot: {
    goNoGo: LaunchPackage["summary"]["goNoGo"];
    runbook: LaunchPackage["summary"]["runbook"];
    external: LaunchPackage["summary"]["external"];
    environment: LaunchEnvChecklist["summary"];
    materials: LaunchMaterialPack["summary"];
    offlineAction: LaunchOfflineActionPack["summary"];
    evidence: LaunchPackage["summary"]["evidence"];
  };
  productionGate: {
    status: HealthStatus;
    label: string;
    releaseReady: boolean;
    detail: string;
    action: string;
    summary: LaunchProductionGate["summary"];
    checkSummary: LaunchProductionGate["checkSummary"];
    nextActions: LaunchHandoffProductionGateItem[];
  };
  blockingFocus: LaunchHandoffAction[];
  environmentFocus: LaunchHandoffEnvItem[];
  externalFocus: LaunchHandoffExternalItem[];
  offlineAction: LaunchHandoffOfflineAction;
  goalFollowup: {
    status: HealthStatus;
    label: string;
    detail: string;
    action: string;
    currentMilestone: LaunchGoalFollowup["currentMilestone"];
    transitionGate: LaunchGoalFollowup["transitionGate"];
    summary: LaunchGoalFollowup["summary"];
    items: LaunchHandoffGoalFollowupItem[];
    fillIns: LaunchHandoffGoalFollowupFillIn[];
    nextActions: string[];
  };
  evidenceFocus: {
    state: LaunchPackage["summary"]["evidence"]["state"];
    label: string;
    latestArchivedAt?: string;
    refreshReasons: string[];
    detail: string;
    action: string;
  };
  nextActions: string[];
  copyText: string;
};

type LaunchHandoffInput = {
  launchPackage?: LaunchPackage;
  envChecklist?: LaunchEnvChecklist;
  materials?: LaunchMaterialPack;
  offlineActionPack?: LaunchOfflineActionPack;
  goalFollowup?: LaunchGoalFollowup;
  productionGate?: LaunchProductionGate;
};

function statusLabel(status: HealthStatus) {
  if (status === "ready") {
    return "已就绪";
  }

  if (status === "blocking") {
    return "阻断";
  }

  return "需复核";
}

function shortDate(value: string | undefined) {
  return value ? value.slice(0, 16).replace("T", " ") : "暂无";
}

function handoffAction(item: LaunchPackageAction): LaunchHandoffAction {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    group: item.group,
    owner: item.owner,
    detail: item.detail,
    action: item.action,
    evidence: item.evidence,
  };
}

function handoffEnvItem(item: LaunchEnvChecklistItem): LaunchHandoffEnvItem {
  return {
    key: item.key,
    title: `${item.label} (${item.key})`,
    status: item.status,
    group: item.group,
    stateLabel: item.stateLabel,
    displayValue: item.displayValue,
    detail: item.detail,
    action: item.action,
    sourceItems: item.sourceItems,
  };
}

function handoffExternalItem(item: LaunchMaterialItem): LaunchHandoffExternalItem {
  return {
    id: item.id,
    title: item.title,
    status: item.healthStatus,
    group: item.group,
    phase: item.phase,
    owner: item.owner,
    statusLabel: item.statusLabel,
    currentAction: item.currentAction,
    currentEvidence: item.currentEvidence,
    envKeys: item.envKeys,
    outputs: item.outputs,
  };
}

function handoffProductionGateItem(
  item: LaunchProductionGateItem,
): LaunchHandoffProductionGateItem {
  return {
    id: item.id,
    label: item.label,
    status: item.status,
    detail: item.detail,
    action: item.action,
    evidence: item.evidence,
  };
}

function uniqueActions(items: LaunchHandoffAction[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

function buildEvidenceFocus(launchPackage: LaunchPackage): LaunchHandoff["evidenceFocus"] {
  const evidence = launchPackage.summary.evidence;
  const missingEvidence = launchPackage.missingEvidence[0];

  if (evidence.state === "available") {
    return {
      state: evidence.state,
      label: evidence.label,
      latestArchivedAt: evidence.latestArchivedAt,
      refreshReasons: evidence.refreshReasons,
      detail: `最近归档时间：${shortDate(evidence.latestArchivedAt)}。`,
      action: "保留最终上线证据；生产变量、外部事项、第三方诊断或支付验收变更后重新归档。",
    };
  }

  return {
    state: evidence.state,
    label: evidence.label,
    latestArchivedAt: evidence.latestArchivedAt,
    refreshReasons: evidence.refreshReasons,
    detail:
      evidence.state === "needs_refresh"
        ? `最近归档时间：${shortDate(evidence.latestArchivedAt)}，但与当前${evidence.refreshReasons.join("、")}不一致。`
        : "当前还没有可用于上线复核的证据快照。",
    action:
      missingEvidence?.action ??
      "在后台健康页归档当前 Go / No-Go、Runbook、生产变量、落库探针和第三方诊断摘要。",
  };
}

function buildSummaryLines(input: {
  launchPackage: LaunchPackage;
  envChecklist: LaunchEnvChecklist;
  materials: LaunchMaterialPack;
  offlineAction: LaunchHandoffOfflineAction;
  productionGate: LaunchHandoff["productionGate"];
}) {
  return [
    `总状态：${input.launchPackage.label}；${input.launchPackage.detail}`,
    `生产总门禁：${input.productionGate.label}；releaseReady=${
      input.productionGate.releaseReady ? "yes" : "no"
    }；${input.productionGate.summary.blocking} 个门禁步骤阻断、${input.productionGate.checkSummary.blocking} 个细分检查阻断。`,
    `Go / No-Go：${input.launchPackage.summary.goNoGo.blocking} 个阻断、${input.launchPackage.summary.goNoGo.warning} 个警告。`,
    `生产变量：${input.envChecklist.summary.blocking} 个阻断、${input.envChecklist.summary.warning} 个警告、${input.envChecklist.summary.missing} 个未配置。`,
    `外部办理：${input.materials.summary.pending} 项待处理，覆盖 ${input.materials.summary.envKeyCount} 个生产变量。`,
    `线下办理当前动作：${input.offlineAction.current.title}；${input.offlineAction.blocking} 个阻断、${input.offlineAction.warning} 个需复核。`,
    `证据归档：${input.launchPackage.summary.evidence.label}。`,
  ];
}

function buildNextActions(input: {
  blockingFocus: LaunchHandoffAction[];
  environmentFocus: LaunchHandoffEnvItem[];
  externalFocus: LaunchHandoffExternalItem[];
  offlineAction: LaunchHandoffOfflineAction;
  productionGate: LaunchHandoff["productionGate"];
  goalFollowup: LaunchHandoff["goalFollowup"];
  evidenceFocus: LaunchHandoff["evidenceFocus"];
}) {
  const actions = [
    input.productionGate.nextActions[0]
      ? `处理生产总门禁：${input.productionGate.nextActions[0].label}，${input.productionGate.nextActions[0].action}`
      : undefined,
    input.blockingFocus[0]
      ? `先处理上线阻断：${input.blockingFocus[0].title}，${input.blockingFocus[0].action}`
      : undefined,
    input.environmentFocus[0]
      ? `补齐生产变量：${input.environmentFocus[0].key}，${input.environmentFocus[0].action}`
      : undefined,
    input.offlineAction.current.status === "ready"
      ? undefined
      : `推进线下办理当前动作：${input.offlineAction.current.title}，${input.offlineAction.current.action}`,
    input.externalFocus[0]
      ? `推进外部办理：${input.externalFocus[0].title}，${input.externalFocus[0].currentAction}`
      : undefined,
    input.goalFollowup.transitionGate.canAdvance
      ? undefined
      : `复核阶段推进门槛：${input.goalFollowup.transitionGate.label}，${input.goalFollowup.transitionGate.action}`,
    input.goalFollowup.nextActions[0]
      ? `补齐目标推进：${input.goalFollowup.nextActions[0]}`
      : undefined,
    input.evidenceFocus.state === "available"
      ? undefined
      : `处理证据归档：${input.evidenceFocus.action}`,
  ];

  return actions.filter((action): action is string => Boolean(action));
}

function buildCopyText(input: {
  generatedAt: string;
  status: HealthStatus;
  label: string;
  summaryLines: string[];
  blockingFocus: LaunchHandoffAction[];
  environmentFocus: LaunchHandoffEnvItem[];
  externalFocus: LaunchHandoffExternalItem[];
  offlineAction: LaunchHandoffOfflineAction;
  productionGate: LaunchHandoff["productionGate"];
  goalFollowup: LaunchHandoff["goalFollowup"];
  evidenceFocus: LaunchHandoff["evidenceFocus"];
  nextActions: string[];
}) {
  const blockingLines =
    input.blockingFocus.length > 0
      ? input.blockingFocus.map(
          (item, index) =>
            `${index + 1}. [${statusLabel(item.status)}] ${item.title}：${item.action}`,
        )
      : ["- 暂无上线阻断项。"];
  const envLines =
    input.environmentFocus.length > 0
      ? input.environmentFocus.map(
          (item, index) =>
            `${index + 1}. ${item.key} / ${item.stateLabel}：${item.action}`,
        )
      : ["- 生产变量暂无待处理项。"];
  const externalLines =
    input.externalFocus.length > 0
      ? input.externalFocus.map(
          (item, index) =>
            `${index + 1}. ${item.title} / ${item.statusLabel}：${item.currentAction}`,
        )
      : ["- 外部事项暂无待处理项。"];
  const offlineActionLines =
    input.offlineAction.todayActions.length > 0
      ? input.offlineAction.todayActions.map(
          (item, index) =>
            `${index + 1}. [${statusLabel(item.status)}] ${item.phase} / ${item.title} / ${item.owner} / ${item.dueLabel}：${item.action} 证据：${item.evidence}`,
        )
      : ["- 线下办理事项已闭合，下一步进入真实支付小额订单和最终证据归档。"];
  const productionGateLines =
    input.productionGate.nextActions.length > 0
      ? input.productionGate.nextActions.map(
          (item, index) =>
            `${index + 1}. [${statusLabel(item.status)}] ${item.label}：${item.action}`,
        )
      : ["- 生产总门禁暂无阻断或警告项。"];
  const goalFollowupLines =
    input.goalFollowup.items.length > 0
      ? input.goalFollowup.items.map(
          (item, index) =>
            `${index + 1}. [${statusLabel(item.status)}] ${item.title}：${item.detail} 下一步：${item.action}`,
        )
      : ["- 目标后续推进暂无待处理项。"];
  const goalFollowupFillInLines =
    input.goalFollowup.fillIns.length > 0
      ? input.goalFollowup.fillIns.map(
          (item, index) =>
            `${index + 1}. [${statusLabel(item.status)}] ${item.sectionLabel} (${item.route})：${item.action} 接口：${item.api.method} ${item.api.path} 请求体：${JSON.stringify(item.payloadTemplate)} 命令：${item.curlCommand} 持久化：${item.persistence.store}(feature=${item.persistence.feature}, event=${item.persistence.event}, model=${item.persistence.model})`,
        )
      : ["- 当前没有需要补齐的目标入口。"];
  const nextActionLines =
    input.nextActions.length > 0
      ? input.nextActions.map((item, index) => `${index + 1}. ${item}`)
      : ["- 当前没有新增动作。"];

  return [
    "玄机 AI 上线交接摘要",
    `生成时间：${shortDate(input.generatedAt)}`,
    `总体状态：${input.label} (${input.status})`,
    "",
    "关键摘要：",
    ...input.summaryLines.map((line) => `- ${line}`),
    "",
    "优先阻断：",
    ...blockingLines,
    "",
    "生产变量：",
    ...envLines,
    "",
    "外部办理：",
    ...externalLines,
    "",
    "线下办理当前动作：",
    `- ${input.offlineAction.label}；blocking=${input.offlineAction.blocking}；warning=${input.offlineAction.warning}`,
    `- 今天先办：${input.offlineAction.current.title} / ${input.offlineAction.current.owner} / ${input.offlineAction.current.dueLabel}`,
    `- 动作：${input.offlineAction.current.action}`,
    `- 证据：${input.offlineAction.current.evidence}`,
    ...offlineActionLines,
    "",
    "生产总门禁：",
    `- ${input.productionGate.label}；releaseReady=${
      input.productionGate.releaseReady ? "yes" : "no"
    }；门禁步骤 ${input.productionGate.summary.blocking} blocking / ${input.productionGate.summary.warning} warning；细分检查 ${input.productionGate.checkSummary.blocking} blocking / ${input.productionGate.checkSummary.warning} warning。`,
    `- 动作：${input.productionGate.action}`,
    ...productionGateLines,
    "",
    "目标后续推进：",
    `- 当前阶段：${input.goalFollowup.currentMilestone.title} / ${input.goalFollowup.currentMilestone.owner} / 目标日 ${input.goalFollowup.currentMilestone.targetDate}`,
    `- 阶段推进门槛：${input.goalFollowup.transitionGate.label}；canAdvance=${
      input.goalFollowup.transitionGate.canAdvance ? "yes" : "no"
    }；blocking=${input.goalFollowup.transitionGate.blocking}；warning=${
      input.goalFollowup.transitionGate.warning
    }。${input.goalFollowup.transitionGate.action}`,
    `- ${input.goalFollowup.label}：${input.goalFollowup.action}`,
    ...goalFollowupLines,
    "",
    "目标补齐入口：",
    ...goalFollowupFillInLines,
    "",
    "证据归档：",
    `- ${input.evidenceFocus.label}：${input.evidenceFocus.action}`,
    "",
    "下一步：",
    ...nextActionLines,
  ].join("\n");
}

export async function getLaunchHandoff(input: LaunchHandoffInput = {}) {
  const [
    launchPackage,
    envChecklist,
    materials,
    offlineActionPack,
    goalFollowup,
    productionGate,
  ] = await Promise.all([
    input.launchPackage ?? getLaunchPackage(),
    input.envChecklist ?? getLaunchEnvChecklist(),
    input.materials ?? getLaunchMaterialPack(),
    input.offlineActionPack ?? getLaunchOfflineActionPack(),
    input.goalFollowup ?? getLaunchGoalFollowup(),
    input.productionGate ?? getLaunchProductionGate(),
  ]);
  const generatedAt = new Date().toISOString();
  const blockingFocus = uniqueActions(
    [
      ...launchPackage.requiredBeforeGo.map(handoffAction),
      ...launchPackage.nextActions.map(handoffAction),
    ].filter((item) => item.status !== "ready"),
  ).slice(0, 6);
  const environmentFocus = envChecklist.nextItems.map(handoffEnvItem).slice(0, 6);
  const externalFocus = materials.nextItems.map(handoffExternalItem).slice(0, 5);
  const offlineAction = {
    status: offlineActionPack.status,
    label: offlineActionPack.label,
    detail: offlineActionPack.detail,
    action: offlineActionPack.action,
    blocking: offlineActionPack.summary.blocking,
    warning: offlineActionPack.summary.warning,
    current: offlineActionPack.currentAction,
    todayActions: offlineActionPack.todayActions.slice(0, 5),
  } satisfies LaunchHandoff["offlineAction"];
  const handoffGoalFollowup = {
    status: goalFollowup.status,
    label: goalFollowup.label,
    detail: goalFollowup.detail,
    action: goalFollowup.action,
    currentMilestone: goalFollowup.currentMilestone,
    transitionGate: goalFollowup.transitionGate,
    summary: goalFollowup.summary,
    items: goalFollowup.items.slice(0, 5),
    fillIns: goalFollowup.fillIns.slice(0, 5),
    nextActions: goalFollowup.nextActions.slice(0, 4),
  } satisfies LaunchHandoff["goalFollowup"];
  const handoffProductionGate = {
    status: productionGate.status,
    label: productionGate.label,
    releaseReady: productionGate.releaseReady,
    detail: productionGate.detail,
    action: productionGate.action,
    summary: productionGate.summary,
    checkSummary: productionGate.checkSummary,
    nextActions: productionGate.nextActions.slice(0, 6).map(handoffProductionGateItem),
  } satisfies LaunchHandoff["productionGate"];
  const evidenceFocus = buildEvidenceFocus(launchPackage);
  const summaryLines = buildSummaryLines({
    launchPackage,
    envChecklist,
    materials,
    offlineAction,
    productionGate: handoffProductionGate,
  });
  const nextActions = buildNextActions({
    blockingFocus,
    environmentFocus,
    externalFocus,
    offlineAction,
    productionGate: handoffProductionGate,
    goalFollowup: handoffGoalFollowup,
    evidenceFocus,
  });
  const copyText = buildCopyText({
    generatedAt,
    status: launchPackage.status,
    label: launchPackage.label,
    summaryLines,
    blockingFocus,
    environmentFocus,
    externalFocus,
    offlineAction,
    productionGate: handoffProductionGate,
    goalFollowup: handoffGoalFollowup,
    evidenceFocus,
    nextActions,
  });

  return {
    generatedAt,
    status: launchPackage.status,
    label: launchPackage.label,
    summaryLines,
    snapshot: {
      goNoGo: launchPackage.summary.goNoGo,
      runbook: launchPackage.summary.runbook,
      external: launchPackage.summary.external,
      environment: envChecklist.summary,
      materials: materials.summary,
      offlineAction: offlineActionPack.summary,
      evidence: launchPackage.summary.evidence,
    },
    productionGate: handoffProductionGate,
    blockingFocus,
    environmentFocus,
    externalFocus,
    offlineAction,
    goalFollowup: handoffGoalFollowup,
    evidenceFocus,
    nextActions,
    copyText,
  } satisfies LaunchHandoff;
}
