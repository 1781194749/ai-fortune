import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  getLaunchApplicationPack,
  type LaunchApplicationPlatform,
} from "@/lib/launch-application-pack";
import {
  getLaunchEnvChecklist,
  type LaunchEnvChecklistItem,
} from "@/lib/launch-env-checklist";
import {
  getLaunchMaterialPack,
  type LaunchMaterialItem,
} from "@/lib/launch-materials";
import { getLaunchPackage, type LaunchPackageAction } from "@/lib/launch-package";
import type { LaunchRunbookStep } from "@/lib/launch-runbook";
import {
  getLaunchUnitEconomics,
  type LaunchUnitEconomicsIssue,
} from "@/lib/launch-unit-economics";

export type LaunchWorkplanLaneId =
  | "external"
  | "application"
  | "environment"
  | "verification"
  | "economics"
  | "evidence";

export type LaunchWorkplanTaskSource =
  | "external"
  | "application_pack"
  | "environment"
  | "runbook"
  | "unit_economics"
  | "evidence";

export type LaunchWorkplanTask = {
  id: string;
  source: LaunchWorkplanTaskSource;
  laneId: LaunchWorkplanLaneId;
  laneTitle: string;
  title: string;
  status: HealthStatus;
  owner: string;
  phase: string;
  detail: string;
  action: string;
  evidence: string;
  priority: number;
  blockedBy: string[];
  envKeys: string[];
};

export type LaunchWorkplanLane = {
  id: LaunchWorkplanLaneId;
  title: string;
  description: string;
  ownerHint: string;
  status: HealthStatus;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
  };
  tasks: LaunchWorkplanTask[];
};

export type LaunchWorkplan = {
  generatedAt: string;
  status: HealthStatus;
  label: string;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
  };
  lanes: LaunchWorkplanLane[];
  activeLane?: LaunchWorkplanLane;
  workingSet: LaunchWorkplanTask[];
  copyText: string;
};

const laneMeta = {
  external: {
    title: "外部办理",
    description: "主体、域名、备案、云账号、微信和支付宝资质。",
    ownerHint: "创始人 / 运营 / 财务主导，技术配合回调和域名。",
  },
  application: {
    title: "平台申请",
    description: "ICP、支付宝、微信支付、微信开放平台、七牛和 OpenAI 申请材料。",
    ownerHint: "创始人 / 运营 / 财务提交材料，技术提供回调、协议和变量。",
  },
  environment: {
    title: "生产变量",
    description: "域名、密钥、数据库、模型、存储和支付参数。",
    ownerHint: "技术 / 运维主导，外部账号拿到后立即配置。",
  },
  verification: {
    title: "联调验收",
    description: "落库、OpenAI、七牛、支付宝、微信支付和登录链路验证。",
    ownerHint: "技术主导，产品和财务共同验收真实小额订单。",
  },
  economics: {
    title: "单位经济",
    description: "产品定价、星力发放、AI tokens、成本金额和年费发放节奏。",
    ownerHint: "产品 / 财务 / 技术共同确认，灰度后持续复盘毛利。",
  },
  evidence: {
    title: "证据放量",
    description: "归档上线证据、复核 Go / No-Go，并准备灰度放量。",
    ownerHint: "产品 / 技术共同确认，保留回滚和补偿方案。",
  },
} satisfies Record<
  LaunchWorkplanLaneId,
  {
    title: string;
    description: string;
    ownerHint: string;
  }
>;

function statusRank(status: HealthStatus) {
  if (status === "blocking") {
    return 0;
  }

  if (status === "warning") {
    return 1;
  }

  return 2;
}

function statusLabel(status: HealthStatus) {
  if (status === "ready") {
    return "已就绪";
  }

  if (status === "blocking") {
    return "阻断";
  }

  return "需复核";
}

function summarizeTasks(tasks: LaunchWorkplanTask[]) {
  return {
    ready: tasks.filter((task) => task.status === "ready").length,
    warning: tasks.filter((task) => task.status === "warning").length,
    blocking: tasks.filter((task) => task.status === "blocking").length,
    total: tasks.length,
  };
}

function statusFromSummary(summary: ReturnType<typeof summarizeTasks>) {
  if (summary.blocking > 0) {
    return "blocking";
  }

  if (summary.warning > 0) {
    return "warning";
  }

  return "ready";
}

function sortTasks(tasks: LaunchWorkplanTask[]) {
  return [...tasks].sort(
    (a, b) =>
      statusRank(a.status) - statusRank(b.status) ||
      a.priority - b.priority ||
      a.laneTitle.localeCompare(b.laneTitle, "zh-CN") ||
      a.title.localeCompare(b.title, "zh-CN"),
  );
}

function externalTask(item: LaunchMaterialItem): LaunchWorkplanTask {
  return {
    id: `external:${item.id}`,
    source: "external",
    laneId: "external",
    laneTitle: laneMeta.external.title,
    title: item.title,
    status: item.healthStatus,
    owner: item.owner,
    phase: item.phase,
    detail: [
      `当前状态：${item.statusLabel}`,
      item.blockedBy.length > 0 ? `前置依赖：${item.blockedBy.join("、")}` : undefined,
      item.note ? `备注：${item.note}` : undefined,
    ]
      .filter(Boolean)
      .join("；"),
    action: item.currentAction,
    evidence: item.currentEvidence,
    priority: item.priority,
    blockedBy: item.blockedBy,
    envKeys: item.envKeys,
  };
}

function applicationTask(platform: LaunchApplicationPlatform): LaunchWorkplanTask {
  const pendingFields = platform.fields
    .filter((field) => field.status !== "ready")
    .map((field) => field.label);

  return {
    id: `application:${platform.id}`,
    source: "application_pack",
    laneId: "application",
    laneTitle: laneMeta.application.title,
    title: platform.title,
    status: platform.status,
    owner: platform.owner,
    phase: "平台申请",
    detail: [
      platform.purpose,
      pendingFields.length > 0 ? `待复核字段：${pendingFields.join("、")}` : undefined,
    ]
      .filter(Boolean)
      .join("；"),
    action: platform.nextAction,
    evidence: platform.evidence.join("；") || "平台申请提交截图、审核回执或控制台配置截图。",
    priority: platform.status === "blocking" ? 15 : 55,
    blockedBy: pendingFields,
    envKeys: platform.envKeys,
  };
}

function environmentTask(item: LaunchEnvChecklistItem): LaunchWorkplanTask {
  return {
    id: `environment:${item.key}`,
    source: "environment",
    laneId: "environment",
    laneTitle: laneMeta.environment.title,
    title: `${item.label} (${item.key})`,
    status: item.status,
    owner: "技术 / 运维",
    phase: item.group,
    detail: `当前状态：${item.stateLabel}；值：${item.displayValue}；${item.detail}`,
    action: item.action,
    evidence:
      item.sourceItems.length > 0
        ? `变量配置完成后，对应外部事项需闭合：${item.sourceItems.join("、")}`
        : "变量配置完成后重新运行上线预检和后台健康页核对。",
    priority: item.status === "blocking" ? 20 : 60,
    blockedBy: item.sourceItems,
    envKeys: [item.key],
  };
}

function runbookTask(step: LaunchRunbookStep): LaunchWorkplanTask {
  return {
    id: `runbook:${step.id}`,
    source: "runbook",
    laneId: "verification",
    laneTitle: laneMeta.verification.title,
    title: step.title,
    status: step.status,
    owner: step.owner,
    phase: step.groupId,
    detail: step.why,
    action: step.action,
    evidence: step.evidence,
    priority: step.status === "blocking" ? 30 : 70,
    blockedBy: step.relatedIssues.map((issue) => issue.label),
    envKeys: step.relatedCheckIds
      .filter((id) => id.startsWith("env:"))
      .map((id) => id.replace("env:", "")),
  };
}

function unitEconomicsTask(item: LaunchUnitEconomicsIssue): LaunchWorkplanTask {
  const envKeys = item.group.includes("AI") ? ["OPENAI_API_KEY", "OPENAI_DEFAULT_MODEL"] : [];

  return {
    id: `unit-economics:${item.id}`,
    source: "unit_economics",
    laneId: "economics",
    laneTitle: laneMeta.economics.title,
    title: item.title,
    status: item.status,
    owner: "产品 / 财务 / 技术",
    phase: item.group,
    detail: item.detail,
    action: item.action,
    evidence: item.evidence,
    priority: item.status === "blocking" ? 35 : 75,
    blockedBy: [],
    envKeys,
  };
}

function evidenceTask(item: LaunchPackageAction): LaunchWorkplanTask {
  return {
    id: `evidence:${item.id}`,
    source: "evidence",
    laneId: "evidence",
    laneTitle: laneMeta.evidence.title,
    title: item.title,
    status: item.status,
    owner: item.owner ?? "产品 / 技术",
    phase: item.group ?? "上线证据",
    detail: item.detail,
    action: item.action,
    evidence: item.evidence ?? "后台健康页显示最新证据归档与当前 Go / No-Go 状态一致。",
    priority: item.status === "blocking" ? 40 : 80,
    blockedBy: [],
    envKeys: [],
  };
}

function buildLane(id: LaunchWorkplanLaneId, tasks: LaunchWorkplanTask[]) {
  const laneTasks = sortTasks(tasks.filter((task) => task.laneId === id));
  const summary = summarizeTasks(laneTasks);

  return {
    id,
    title: laneMeta[id].title,
    description: laneMeta[id].description,
    ownerHint: laneMeta[id].ownerHint,
    status: statusFromSummary(summary),
    summary,
    tasks: laneTasks,
  } satisfies LaunchWorkplanLane;
}

function workplanLabel(status: HealthStatus, summary: LaunchWorkplan["summary"]) {
  if (status === "blocking") {
    return `执行计划未闭合：${summary.blocking} 个阻断任务`;
  }

  if (status === "warning") {
    return `执行计划待复核：${summary.warning} 个警告任务`;
  }

  return "执行计划已闭合";
}

function buildCopyText(input: {
  generatedAt: string;
  status: HealthStatus;
  label: string;
  lanes: LaunchWorkplanLane[];
  workingSet: LaunchWorkplanTask[];
}) {
  const laneLines = input.lanes.map(
    (lane) =>
      `- ${lane.title}：${lane.summary.blocking} 阻断 / ${lane.summary.warning} 警告 / ${lane.summary.ready} 完成；负责人：${lane.ownerHint}`,
  );
  const taskLines =
    input.workingSet.length > 0
      ? input.workingSet.map(
          (task, index) =>
            `${index + 1}. [${statusLabel(task.status)}] ${task.laneTitle} / ${task.title} / ${task.owner}：${task.action}`,
        )
      : ["- 当前无待执行任务。"];

  return [
    "玄机 AI 上线执行工作计划",
    `生成时间：${input.generatedAt.slice(0, 16).replace("T", " ")}`,
    `总体状态：${input.label} (${input.status})`,
    "",
    "工作线：",
    ...laneLines,
    "",
    "本轮优先任务：",
    ...taskLines,
  ].join("\n");
}

export async function getLaunchWorkplan() {
  const [launchPackage, envChecklist, materials, applicationPack, unitEconomics] = await Promise.all([
    getLaunchPackage(),
    getLaunchEnvChecklist(),
    getLaunchMaterialPack(),
    getLaunchApplicationPack(),
    getLaunchUnitEconomics(),
  ]);
  const generatedAt = new Date().toISOString();
  const tasks = sortTasks([
    ...materials.nextItems.map(externalTask),
    ...applicationPack.nextPlatforms.map(applicationTask),
    ...envChecklist.nextItems.map(environmentTask),
    ...launchPackage.runbook.nextSteps.map(runbookTask),
    ...unitEconomics.nextIssues.map(unitEconomicsTask),
    ...launchPackage.missingEvidence.map(evidenceTask),
  ]);
  const lanes = (
    ["external", "application", "environment", "verification", "economics", "evidence"] as const
  ).map((id) => buildLane(id, tasks));
  const summary = summarizeTasks(tasks);
  const status = statusFromSummary(summary);
  const activeLane = lanes.find((lane) => lane.status !== "ready");
  const workingSet = tasks.slice(0, 10);
  const label = workplanLabel(status, summary);

  return {
    generatedAt,
    status,
    label,
    summary,
    lanes,
    activeLane,
    workingSet,
    copyText: buildCopyText({ generatedAt, status, label, lanes, workingSet }),
  } satisfies LaunchWorkplan;
}
