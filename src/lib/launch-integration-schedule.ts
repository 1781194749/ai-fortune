import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  getLaunchAiStoragePlan,
  type LaunchAiStoragePlan,
  type LaunchAiStoragePlanStep,
} from "@/lib/launch-ai-storage-plan";
import {
  getLaunchPaymentPlan,
  type LaunchPaymentPlan,
  type LaunchPaymentPlanChannel,
  type LaunchPaymentPlanStep,
} from "@/lib/launch-payment-plan";

export type LaunchIntegrationScheduleLaneId = "openai" | "qiniu" | "alipay" | "wechat_pay";

export type LaunchIntegrationScheduleStep = {
  id: string;
  title: string;
  status: HealthStatus;
  owner: string;
  action: string;
  evidence: string;
  envKeys: string[];
  routes: string[];
};

export type LaunchIntegrationScheduleLane = {
  id: LaunchIntegrationScheduleLaneId;
  order: number;
  title: string;
  status: HealthStatus;
  stage: "waiting_external" | "waiting_config" | "ready_to_probe" | "ready_to_e2e" | "done";
  label: string;
  detail: string;
  action: string;
  evidence: string;
  owner: string;
  readySteps: number;
  totalSteps: number;
  nextStep?: LaunchIntegrationScheduleStep;
  steps: LaunchIntegrationScheduleStep[];
};

export type LaunchIntegrationSchedule = {
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
    nextActions: number;
  };
  currentLane: LaunchIntegrationScheduleLane;
  lanes: LaunchIntegrationScheduleLane[];
  nextActions: Array<LaunchIntegrationScheduleStep & { laneTitle: string; laneId: LaunchIntegrationScheduleLaneId }>;
  copyText: string;
};

type LaunchIntegrationScheduleInput = {
  aiStoragePlan?: LaunchAiStoragePlan;
  paymentPlan?: LaunchPaymentPlan;
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

function statusLabel(status: HealthStatus) {
  if (status === "ready") {
    return "已就绪";
  }

  if (status === "blocking") {
    return "阻断";
  }

  return "待复核";
}

function summarize(lanes: LaunchIntegrationScheduleLane[]) {
  return {
    ready: lanes.filter((lane) => lane.status === "ready").length,
    warning: lanes.filter((lane) => lane.status === "warning").length,
    blocking: lanes.filter((lane) => lane.status === "blocking").length,
    total: lanes.length,
  };
}

function scheduleStatus(lanes: LaunchIntegrationScheduleLane[]) {
  if (lanes.some((lane) => lane.status === "blocking")) {
    return "blocking" as const;
  }

  if (lanes.some((lane) => lane.status === "warning")) {
    return "warning" as const;
  }

  return "ready" as const;
}

function aiStep(step: LaunchAiStoragePlanStep): LaunchIntegrationScheduleStep {
  return {
    id: `ai:${step.id}`,
    title: step.title,
    status: step.status,
    owner: step.owner,
    action: step.action,
    evidence: step.evidence,
    envKeys: step.envKeys ?? [],
    routes: step.routes ?? [],
  };
}

function paymentStep(step: LaunchPaymentPlanStep): LaunchIntegrationScheduleStep {
  return {
    id: `payment:${step.id}`,
    title: step.title,
    status: step.status,
    owner: step.owner,
    action: step.action,
    evidence: step.evidence,
    envKeys: [],
    routes: [],
  };
}

function laneStage(steps: LaunchIntegrationScheduleStep[]) {
  const nextStep = steps.find((step) => step.status !== "ready");

  if (!nextStep) {
    return "done" as const;
  }

  if (/(项目|资质|平台|bucket|主体|应用)/.test(nextStep.title)) {
    return "waiting_external" as const;
  }

  if (/(变量|参数|开关|回调|CORS|URL)/.test(nextStep.title)) {
    return "waiting_config" as const;
  }

  if (/(诊断|签名|模型读取)/.test(nextStep.title)) {
    return "ready_to_probe" as const;
  }

  return "ready_to_e2e" as const;
}

function laneLabel(lane: {
  title: string;
  status: HealthStatus;
  stage: LaunchIntegrationScheduleLane["stage"];
}) {
  if (lane.stage === "done") {
    return `${lane.title} 联调已闭合`;
  }

  if (lane.stage === "waiting_external") {
    return `${lane.title} 等待外部账号或资质`;
  }

  if (lane.stage === "waiting_config") {
    return `${lane.title} 等待生产配置`;
  }

  if (lane.stage === "ready_to_probe") {
    return `${lane.title} 可以运行诊断`;
  }

  return `${lane.title} 可以做端到端验收`;
}

function laneFromSteps(input: {
  id: LaunchIntegrationScheduleLaneId;
  order: number;
  title: string;
  owner: string;
  detail: string;
  steps: LaunchIntegrationScheduleStep[];
}): LaunchIntegrationScheduleLane {
  const status =
    input.steps.find((step) => step.status === "blocking")?.status ??
    input.steps.find((step) => step.status === "warning")?.status ??
    "ready";
  const stage = laneStage(input.steps);
  const nextStep = input.steps.find((step) => step.status !== "ready");
  const lane: LaunchIntegrationScheduleLane = {
    id: input.id,
    order: input.order,
    title: input.title,
    status,
    stage,
    label: laneLabel({ title: input.title, status, stage }),
    detail: input.detail,
    action: nextStep?.action ?? "保留当前联调证据，进入下一条真实能力链路。",
    evidence: nextStep?.evidence ?? "诊断记录、端到端截图和上线证据归档均已闭合。",
    owner: input.owner,
    readySteps: input.steps.filter((step) => step.status === "ready").length,
    totalSteps: input.steps.length,
    steps: input.steps,
  };

  if (nextStep) {
    lane.nextStep = nextStep;
  }

  return lane;
}

function channelLane(input: {
  channel: LaunchPaymentPlanChannel;
  id: LaunchIntegrationScheduleLaneId;
  order: number;
  detail: string;
}) {
  return laneFromSteps({
    id: input.id,
    order: input.order,
    title: input.channel.label,
    owner: "财务 / 技术",
    detail: input.detail,
    steps: input.channel.steps.map(paymentStep),
  });
}

function buildLanes(input: {
  aiStoragePlan: LaunchAiStoragePlan;
  paymentPlan: LaunchPaymentPlan;
}) {
  const openaiStepIds = new Set([
    "openai_application",
    "openai_env",
    "openai_cost_rates",
    "openai_diagnostics",
    "cost_sample",
  ]);
  const qiniuStepIds = new Set(["qiniu_application", "qiniu_env", "qiniu_callbacks", "palm_vision"]);
  const alipay = input.paymentPlan.channels.find((channel) => channel.id === "alipay");
  const wechatPay = input.paymentPlan.channels.find((channel) => channel.id === "wechat_pay");
  const lanes: LaunchIntegrationScheduleLane[] = [
    laneFromSteps({
      id: "openai",
      order: 10,
      title: "OpenAI",
      owner: "技术 / 产品",
      detail: "先确认 API Key、模型读取、视觉模型和成本样本，决定 AI 对话、手相和深度报告质量。",
      steps: input.aiStoragePlan.steps
        .filter((step) => openaiStepIds.has(step.id))
        .sort((a, b) => a.order - b.order)
        .map(aiStep),
    }),
    laneFromSteps({
      id: "qiniu",
      order: 20,
      title: "七牛图片",
      owner: "技术 / 运维",
      detail: "确认 bucket、公开域名、CORS、上传凭证和手相公开 URL 可被视觉模型读取。",
      steps: input.aiStoragePlan.steps
        .filter((step) => qiniuStepIds.has(step.id))
        .sort((a, b) => a.order - b.order)
        .map(aiStep),
    }),
  ];

  if (alipay) {
    lanes.push(
      channelLane({
        channel: alipay,
        id: "alipay",
        order: 30,
        detail: "支付宝适合优先跑通中文 Web 小额订单，重点看应用主体、密钥签名、notify_url、PAID 回调和权益到账。",
      }),
    );
  }

  if (wechatPay) {
    lanes.push(
      channelLane({
        channel: wechatPay,
        id: "wechat_pay",
        order: 40,
        detail: "微信支付依赖商户号、Native 支付、API v3 key、证书、公网回调和扫码支付小额订单证据。",
      }),
    );
  }

  return lanes.sort((a, b) => a.order - b.order);
}

function buildCopyText(input: {
  status: HealthStatus;
  label: string;
  lanes: LaunchIntegrationScheduleLane[];
  nextActions: LaunchIntegrationSchedule["nextActions"];
}) {
  const laneLines = input.lanes.map(
    (lane) =>
      `- [${statusLabel(lane.status)}] ${lane.title}：${lane.readySteps}/${lane.totalSteps}，下一步：${lane.nextStep?.title ?? "保留证据"}`,
  );
  const actionLines = input.nextActions.length
    ? input.nextActions.map(
        (item, index) =>
          `${index + 1}. ${item.laneTitle} / [${statusLabel(item.status)}] ${item.title}：${item.action}；证据：${item.evidence}`,
      )
    : ["暂无真实联调动作。"];

  return [
    "玄机 AI 真实联调排程",
    `状态：${input.label} (${input.status})`,
    "",
    "联调顺序：",
    ...laneLines,
    "",
    "优先动作：",
    ...actionLines,
  ].join("\n");
}

export async function getLaunchIntegrationSchedule(input?: LaunchIntegrationScheduleInput) {
  const [aiStoragePlan, paymentPlan] = await Promise.all([
    input?.aiStoragePlan ?? getLaunchAiStoragePlan(),
    input?.paymentPlan ?? getLaunchPaymentPlan(),
  ]);
  const generatedAt = new Date().toISOString();
  const lanes = buildLanes({ aiStoragePlan, paymentPlan });
  const summaryBase = summarize(lanes);
  const status = scheduleStatus(lanes);
  const currentLane =
    lanes.find((lane) => lane.status !== "ready") ??
    lanes[0] ??
    laneFromSteps({
      id: "openai",
      order: 10,
      title: "OpenAI",
      owner: "技术 / 产品",
      detail: "真实联调链路暂未生成。",
      steps: [],
    });
  const laneOrder = new Map(lanes.map((lane) => [lane.id, lane.order]));
  const nextActions = lanes
    .flatMap((lane) =>
      lane.steps
        .filter((step) => step.status !== "ready")
        .slice(0, 2)
        .map((step) => ({
          ...step,
          laneTitle: lane.title,
          laneId: lane.id,
        })),
    )
    .sort(
      (a, b) =>
        (laneOrder.get(a.laneId) ?? 999) - (laneOrder.get(b.laneId) ?? 999) ||
        statusRank(a.status) - statusRank(b.status),
    )
    .slice(0, 8);
  const label =
    status === "ready"
      ? "真实联调排程已闭合"
      : status === "warning"
        ? `真实联调排程有 ${summaryBase.warning} 条链路待复核`
        : `真实联调排程有 ${summaryBase.blocking} 条链路阻断`;

  return {
    generatedAt,
    status,
    label,
    detail:
      status === "ready"
        ? "OpenAI、七牛、支付宝和微信支付均已形成真实诊断、端到端验收和证据归档。"
        : `当前建议先推进「${currentLane.title}」：${currentLane.detail}`,
    action:
      nextActions[0]?.action ??
      "保留所有第三方诊断、真实图片、真实订单和成本样本证据，进入小额真实订单灰度。",
    summary: {
      ...summaryBase,
      nextActions: nextActions.length,
    },
    currentLane,
    lanes,
    nextActions,
    copyText: buildCopyText({ status, label, lanes, nextActions }),
  } satisfies LaunchIntegrationSchedule;
}
