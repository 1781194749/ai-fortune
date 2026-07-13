import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  getLaunchDecision,
  type LaunchDecision,
  type LaunchDecisionItem,
} from "@/lib/launch-decision";
import { getLaunchEvidenceGap, type LaunchEvidenceGap } from "@/lib/launch-evidence-gap";
import { getLaunchRolloutPlan, type LaunchRolloutPlan } from "@/lib/launch-rollout";
import { getLaunchScheduleRisk, type LaunchScheduleRisk } from "@/lib/launch-schedule";
import { getLaunchUnitEconomics, type LaunchUnitEconomics } from "@/lib/launch-unit-economics";
import { getLaunchWeeklyFocus, type LaunchWeeklyFocus } from "@/lib/launch-weekly-focus";
import {
  getLaunchGoalProgress,
  type LaunchGoalProgress,
  type LaunchGoalProgressItem,
  type LaunchGoalProgressStatus,
} from "@/lib/launch-goal-progress";

export type LaunchGoalPlanMilestoneId =
  | "start"
  | "paid_smoke"
  | "retention"
  | "international";

export type LaunchGoalPlanMetric = {
  label: string;
  target: string;
  current: string;
  status: HealthStatus;
};

export type LaunchGoalPlanMilestone = {
  id: LaunchGoalPlanMilestoneId;
  order: number;
  title: string;
  windowLabel: string;
  targetDate: string;
  status: HealthStatus;
  owner: string;
  objective: string;
  businessGoal: string;
  productScope: string[];
  metrics: LaunchGoalPlanMetric[];
  exitCriteria: string[];
  blockers: string[];
  nextActions: string[];
  evidence: string[];
  progress?: {
    status: LaunchGoalProgressStatus;
    targetDate?: string;
    owner?: string;
    evidenceNote?: string;
    note?: string;
    updatedAt: string;
    updatedBy: string;
    plannedTargetDate: string;
    plannedOwner: string;
  };
};

export type LaunchGoalPlanTransitionCheck = {
  id: string;
  title: string;
  status: HealthStatus;
  detail: string;
  action: string;
  evidence: string;
};

export type LaunchGoalPlanTransitionGate = {
  status: HealthStatus;
  label: string;
  detail: string;
  action: string;
  canAdvance: boolean;
  currentMilestoneId: LaunchGoalPlanMilestoneId;
  currentMilestoneTitle: string;
  nextMilestoneId?: LaunchGoalPlanMilestoneId;
  nextMilestoneTitle?: string;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
  };
  checks: LaunchGoalPlanTransitionCheck[];
  blockers: LaunchGoalPlanTransitionCheck[];
  warnings: LaunchGoalPlanTransitionCheck[];
};

export type LaunchGoalPlan = {
  generatedAt: string;
  today: string;
  status: HealthStatus;
  label: string;
  detail: string;
  action: string;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
  };
  currentMilestone: LaunchGoalPlanMilestone;
  transitionGate: LaunchGoalPlanTransitionGate;
  milestones: LaunchGoalPlanMilestone[];
  copyText: string;
};

type LaunchGoalPlanInput = {
  decision?: LaunchDecision;
  weeklyFocus?: LaunchWeeklyFocus;
  schedule?: LaunchScheduleRisk;
  rollout?: LaunchRolloutPlan;
  evidenceGap?: LaunchEvidenceGap;
  unitEconomics?: LaunchUnitEconomics;
  progress?: LaunchGoalProgress;
  now?: Date;
};

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(today: string, days: number) {
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return date.toISOString().slice(0, 10);
}

function statusRank(status: HealthStatus) {
  if (status === "blocking") {
    return 0;
  }

  if (status === "warning") {
    return 1;
  }

  return 2;
}

function worstStatus(statuses: HealthStatus[]) {
  return statuses.sort((a, b) => statusRank(a) - statusRank(b))[0] ?? "ready";
}

function metric(input: LaunchGoalPlanMetric) {
  return input;
}

function decisionItems(items: LaunchDecisionItem[], take: number) {
  return items.slice(0, take).map((item) => `${item.gateTitle} / ${item.title}：${item.action}`);
}

function commitmentStatus(weeklyFocus: LaunchWeeklyFocus): HealthStatus {
  if (weeklyFocus.summary.commitmentBlocked > 0) {
    return "blocking";
  }

  if (weeklyFocus.summary.commitmentCoveragePercent < 100 || weeklyFocus.summary.uncommitted > 0) {
    return "warning";
  }

  return "ready";
}

function evidenceStatus(evidenceGap: LaunchEvidenceGap): HealthStatus {
  if (evidenceGap.summary.blocking > 0) {
    return "blocking";
  }

  if (evidenceGap.summary.warning > 0 || evidenceGap.coverage.score < 100) {
    return "warning";
  }

  return "ready";
}

function buildStartMilestone(input: {
  today: string;
  decision: LaunchDecision;
  weeklyFocus: LaunchWeeklyFocus;
  schedule: LaunchScheduleRisk;
}) {
  const targetDate = addDays(input.today, 14);
  const currentStatus = worstStatus([
    input.decision.status,
    input.weeklyFocus.status,
    input.schedule.status,
    commitmentStatus(input.weeklyFocus),
  ]);
  const blockers = [
    ...decisionItems(input.decision.nextActions, 4),
    ...input.weeklyFocus.commitmentGaps
      .slice(0, 3)
      .map((item) => `${item.laneTitle} / ${item.title}：${item.commitmentGapReason}`),
  ];

  return {
    id: "start",
    order: 1,
    title: "0-14 天：开工闭环",
    windowLabel: `${input.today} 至 ${targetDate}`,
    targetDate,
    status: currentStatus,
    owner: "创始人 / 技术 / 运营",
    objective: "把收费上线的阻断项、目标日期、负责人和证据口径全部落到后台看板。",
    businessGoal: "能明确回答什么时候可以收费上线、当前卡在哪、今天谁去推进。",
    productScope: [
      "中文 Web 首发",
      "邮箱登录优先，微信扫码登录预留",
      "支付宝、微信支付和七牛云按真实资质推进",
      "深度报告、会员档案和证据归档保留上线闸门",
    ],
    metrics: [
      metric({
        label: "Go / No-Go 阻断",
        target: "0 个 blocking",
        current: `${input.decision.summary.blockers} 个 blocking / ${input.decision.summary.warnings} 个 warning`,
        status: input.decision.status,
      }),
      metric({
        label: "本周承诺覆盖",
        target: "100% 重点任务有目标日期",
        current: `${input.weeklyFocus.summary.commitmentCoveragePercent}% (${input.weeklyFocus.summary.committed}/${input.weeklyFocus.summary.total})`,
        status: commitmentStatus(input.weeklyFocus),
      }),
      metric({
        label: "外部事项排期",
        target: "无逾期、无未排期",
        current: `${input.schedule.summary.overdue} 逾期 / ${input.schedule.summary.unscheduled} 未排期`,
        status: input.schedule.status,
      }),
    ],
    exitCriteria: [
      "后台最终决策不再出现 launch-critical 未归属事项",
      "本周重点任务都保存目标日期、负责人和证据备注",
      "主体、域名、备案、支付和七牛云事项至少进入已排期或办理中",
    ],
    blockers,
    nextActions:
      blockers.length > 0
        ? blockers.slice(0, 5)
        : ["保持每日更新本周承诺，处理新出现的上线阻断项。"],
    evidence: [
      "后台本周推进看板截图",
      "外部上线事项目标日期和证据备注",
      "最终决策 copyText 与当前状态一致",
    ],
  } satisfies LaunchGoalPlanMilestone;
}

function buildPaidSmokeMilestone(input: {
  today: string;
  decision: LaunchDecision;
  rollout: LaunchRolloutPlan;
  evidenceGap: LaunchEvidenceGap;
}) {
  const startDate = addDays(input.today, 15);
  const targetDate = addDays(input.today, 30);
  const paymentGate = input.decision.gates.find((gate) => gate.id === "payment_acceptance");
  const currentStatus =
    input.decision.decision === "no_go"
      ? "blocking"
      : worstStatus([
          paymentGate?.status ?? "warning",
          evidenceStatus(input.evidenceGap),
          input.rollout.status,
        ]);
  const blockers =
    input.decision.decision === "no_go"
      ? decisionItems(input.decision.nextActions, 4)
      : input.evidenceGap.nextGaps
          .slice(0, 4)
          .map((item) => `${item.group} / ${item.title}：${item.action}`);

  return {
    id: "paid_smoke",
    order: 2,
    title: "15-30 天：小额真实订单",
    windowLabel: `${startDate} 至 ${targetDate}`,
    targetDate,
    status: currentStatus,
    owner: "技术 / 财务 / 产品",
    objective: "用真实渠道跑通一笔小额付费订单，验证支付、权益、报告、UsageLog 和证据归档。",
    businessGoal: "证明用户可以真的付费，后台可以追踪收入、权益和 AI 成本。",
    productScope: [
      "支付宝与微信支付至少 1 个渠道完成小额链路",
      "会员权益、星力消耗和深度报告产出可追溯",
      "付款成功、失败、回调重放和退款/补偿预案可操作",
    ],
    metrics: [
      metric({
        label: "支付入口",
        target: "至少 1 个真实渠道可用",
        current: input.decision.paymentEntryReady
          ? `${input.decision.summary.configuredPaymentChannels} 个渠道可进入`
          : "真实支付入口未就绪",
        status: paymentGate?.status ?? "warning",
      }),
      metric({
        label: "证据缺口",
        target: "小额订单和后台归档缺口为 0",
        current: `${input.evidenceGap.summary.blocking} blocking / ${input.evidenceGap.summary.warning} warning`,
        status: evidenceStatus(input.evidenceGap),
      }),
      metric({
        label: "灰度阶段",
        target: "进入小额真实订单灰度",
        current: input.rollout.currentPhase.title,
        status: input.rollout.currentPhase.status,
      }),
    ],
    exitCriteria: [
      "真实小额订单从待支付流转到已支付",
      "会员或星力权益自动到账",
      "订单、钱包流水、报告和 UsageLog 重启后仍可恢复",
      "上线证据归档包含支付截图、回执、后台记录和成本样本",
    ],
    blockers,
    nextActions:
      blockers.length > 0
        ? blockers.slice(0, 5)
        : ["安排 1 笔小额真实订单，并归档订单、权益、报告和成本证据。"],
    evidence: [
      "真实支付平台订单号或回执",
      "站内订单与钱包流水截图",
      "报告生成记录和 UsageLog 成本样本",
    ],
  } satisfies LaunchGoalPlanMilestone;
}

function buildRetentionMilestone(input: {
  today: string;
  unitEconomics: LaunchUnitEconomics;
  evidenceGap: LaunchEvidenceGap;
}) {
  const startDate = addDays(input.today, 31);
  const targetDate = addDays(input.today, 60);
  const currentStatus = worstStatus([input.unitEconomics.status, evidenceStatus(input.evidenceGap)]);
  const blockers = input.unitEconomics.nextIssues
    .slice(0, 5)
    .map((item) => `${item.group} / ${item.title}：${item.action}`);

  return {
    id: "retention",
    order: 3,
    title: "31-60 天：复购与会员档案",
    windowLabel: `${startDate} 至 ${targetDate}`,
    targetDate,
    status: currentStatus === "ready" ? "warning" : currentStatus,
    owner: "产品 / 运营 / 技术",
    objective: "把一次性算命体验沉淀成会员档案、复购报告和可复盘毛利模型。",
    businessGoal: "让用户愿意二次消费：从塔罗/手相/八字单次体验升级到会员和深度报告。",
    productScope: [
      "会员档案记录出生信息、历史报告和偏好主题",
      "深度报告支持按主题复购：感情、事业、财运、年度",
      "按订单复盘收入、星力、OpenAI tokens 和成本",
    ],
    metrics: [
      metric({
        label: "AI 成本样本",
        target: "真实 OpenAI 调用有 costCents",
        current: `${input.unitEconomics.summary.openaiLogCount} 条 OpenAI 日志 / ${input.unitEconomics.summary.missingOpenaiCostCount} 条缺成本`,
        status: input.unitEconomics.status,
      }),
      metric({
        label: "产品毛利",
        target: "会员和单次报告都能按星力核算",
        current: `${input.unitEconomics.summary.productCount} 个商品已进入核算`,
        status: input.unitEconomics.status,
      }),
      metric({
        label: "证据覆盖",
        target: "成本样本和后台归档齐全",
        current: `${input.evidenceGap.coverage.score}% 覆盖率`,
        status: evidenceStatus(input.evidenceGap),
      }),
    ],
    exitCriteria: [
      "用户能在会员档案看到历史报告和权益记录",
      "深度报告与会员套餐的星力消耗清晰",
      "至少形成 10 笔真实或灰度订单的收入/成本样本",
    ],
    blockers,
    nextActions:
      blockers.length > 0
        ? blockers
        : ["灰度订单跑通后，补会员档案复购入口和订单级成本复盘报表。"],
    evidence: [
      "会员档案页面截图",
      "订单级收入、星力和 OpenAI 成本样本",
      "深度报告生成记录",
    ],
  } satisfies LaunchGoalPlanMilestone;
}

function buildInternationalMilestone(input: {
  today: string;
  decision: LaunchDecision;
  unitEconomics: LaunchUnitEconomics;
}) {
  const startDate = addDays(input.today, 61);
  const targetDate = addDays(input.today, 90);
  const currentStatus =
    input.decision.decision === "release_ready" && input.unitEconomics.status === "ready"
      ? "warning"
      : "warning";

  return {
    id: "international",
    order: 4,
    title: "61-90 天：海外结构预留",
    windowLabel: `${startDate} 至 ${targetDate}`,
    targetDate,
    status: currentStatus,
    owner: "产品 / 技术 / 增长",
    objective: "中文转化稳定后，再扩展英文结构、海外获客素材和国际支付评估。",
    businessGoal: "先验证国内付费，再用同一套报告能力测试海外占星、塔罗和命理需求。",
    productScope: [
      "保留 en 路由、文案字典和海外 SEO 结构",
      "评估 Stripe、PayPal 或海外收款主体路径",
      "沉淀中英双语 Prompt 与报告模板差异",
    ],
    metrics: [
      metric({
        label: "中文付费稳定性",
        target: "国内真实支付链路稳定后再开放",
        current: input.decision.label,
        status: input.decision.status === "ready" ? "ready" : "warning",
      }),
      metric({
        label: "成本模型",
        target: "海外 Prompt 成本可按订单核算",
        current: `${input.unitEconomics.summary.aiTokens} tokens 样本`,
        status: input.unitEconomics.status,
      }),
      metric({
        label: "英文结构",
        target: "页面、报告和支付结构可插拔",
        current: "第一版中文为主，英文结构预留",
        status: "warning",
      }),
    ],
    exitCriteria: [
      "英文页面与报告模板不会影响中文主站转化",
      "海外支付和主体路径形成独立上线清单",
      "海外投放素材和关键词有首轮转化样本",
    ],
    blockers: ["海外版不作为第一阶段上线阻断，国内真实收费稳定后再启动。"],
    nextActions: [
      "先完成中文付费闭环；在路由、文案和报告模板中保留英文扩展点。",
      "记录海外支付主体、税务、退款和隐私协议差异，单独成清单。",
    ],
    evidence: [
      "en 路由或文案字典预留记录",
      "海外支付和协议差异清单",
      "英文报告模板样稿",
    ],
  } satisfies LaunchGoalPlanMilestone;
}

function summarize(milestones: LaunchGoalPlanMilestone[]) {
  return {
    ready: milestones.filter((item) => item.status === "ready").length,
    warning: milestones.filter((item) => item.status === "warning").length,
    blocking: milestones.filter((item) => item.status === "blocking").length,
    total: milestones.length,
  };
}

function planStatus(summary: ReturnType<typeof summarize>) {
  if (summary.blocking > 0) {
    return "blocking" as const;
  }

  if (summary.warning > 0) {
    return "warning" as const;
  }

  return "ready" as const;
}

function labelFor(status: HealthStatus, currentMilestone: LaunchGoalPlanMilestone) {
  if (status === "blocking") {
    return `开工目标卡在：${currentMilestone.title}`;
  }

  if (status === "warning") {
    return `开工目标需复核：${currentMilestone.title}`;
  }

  return "开工目标已进入放量节奏";
}

function detailFor(status: HealthStatus, currentMilestone: LaunchGoalPlanMilestone) {
  if (status === "ready") {
    return "30/60/90 天目标均无阻断，可以按灰度节奏持续放量并复盘毛利。";
  }

  return `${currentMilestone.windowLabel} 的重点是：${currentMilestone.objective}`;
}

function actionFor(currentMilestone: LaunchGoalPlanMilestone) {
  return currentMilestone.nextActions[0] ?? "按当前目标补齐证据、负责人和目标日期。";
}

function transitionCheck(input: LaunchGoalPlanTransitionCheck) {
  return input;
}

function summarizeTransitionChecks(checks: LaunchGoalPlanTransitionCheck[]) {
  return {
    ready: checks.filter((item) => item.status === "ready").length,
    warning: checks.filter((item) => item.status === "warning").length,
    blocking: checks.filter((item) => item.status === "blocking").length,
    total: checks.length,
  };
}

function progressGateStatus(progress: LaunchGoalPlanMilestone["progress"]) {
  if (progress?.status === "done") {
    return "ready" as const;
  }

  if (progress?.status === "blocked") {
    return "blocking" as const;
  }

  return "warning" as const;
}

function progressEvidenceStatus(progress: LaunchGoalPlanMilestone["progress"]) {
  if (progress?.evidenceNote || progress?.note) {
    return "ready" as const;
  }

  return progress?.status === "blocked" ? "blocking" : "warning";
}

function nextStageStatus(input: {
  currentMilestone: LaunchGoalPlanMilestone;
  nextMilestone: LaunchGoalPlanMilestone | undefined;
}) {
  if (!input.nextMilestone) {
    return "ready" as const;
  }

  if (input.currentMilestone.status !== "ready") {
    return "warning" as const;
  }

  return input.nextMilestone.status === "blocking" ? "blocking" : "ready";
}

function buildTransitionGate(input: {
  milestones: LaunchGoalPlanMilestone[];
  currentMilestone: LaunchGoalPlanMilestone;
}) {
  const currentIndex = input.milestones.findIndex(
    (milestone) => milestone.id === input.currentMilestone.id,
  );
  const nextMilestone = currentIndex >= 0 ? input.milestones[currentIndex + 1] : undefined;
  const progress = input.currentMilestone.progress;
  const checks = [
    transitionCheck({
      id: "current_stage_system",
      title: "当前阶段系统状态",
      status: input.currentMilestone.status,
      detail: `${input.currentMilestone.title} 当前为 ${input.currentMilestone.status}。`,
      action:
        input.currentMilestone.status === "ready"
          ? "保留当前阶段系统证据，继续核对人工推进记录。"
          : input.currentMilestone.nextActions[0] ?? "先处理当前阶段阻断项。",
      evidence: input.currentMilestone.exitCriteria[0] ?? "当前阶段验收标准。",
    }),
    transitionCheck({
      id: "current_stage_progress",
      title: "当前阶段人工推进",
      status: progressGateStatus(progress),
      detail: `人工推进状态：${progressStatusLabel(progress?.status)}。`,
      action:
        progress?.status === "done"
          ? "保留阶段推进记录。"
          : "在目标推进快填中把当前阶段更新为处理中、卡住或已完成，并写清负责人。",
      evidence: "UsageLog(feature=launch_goal_progress) 阶段推进状态。",
    }),
    transitionCheck({
      id: "current_stage_evidence",
      title: "当前阶段证据备注",
      status: progressEvidenceStatus(progress),
      detail: progress?.evidenceNote ?? progress?.note ?? "当前阶段还没有人工证据备注。",
      action:
        progress?.evidenceNote || progress?.note
          ? "保留证据备注，并在上线证据归档中同步。"
          : "补充阶段证据链接、截图编号、平台回执或验收摘要。",
      evidence: "目标推进快填 evidenceNote/note 与上线证据归档。",
    }),
    transitionCheck({
      id: "next_stage_entry",
      title: nextMilestone ? "下一阶段入口" : "阶段收口",
      status: nextStageStatus({ currentMilestone: input.currentMilestone, nextMilestone }),
      detail: nextMilestone
        ? `下一阶段：${nextMilestone.title}，当前状态 ${nextMilestone.status}。`
        : "当前已经是 90 天目标最后阶段。",
      action: nextMilestone
        ? input.currentMilestone.status === "ready"
          ? nextMilestone.nextActions[0] ?? "准备下一阶段负责人、目标日和证据。"
          : "先把当前阶段系统状态补到 ready，再进入下一阶段。"
        : "保留 90 天复盘证据，进入常规经营复盘。",
      evidence: nextMilestone?.exitCriteria[0] ?? "90 天目标复盘记录。",
    }),
  ];
  const summary = summarizeTransitionChecks(checks);
  const status = planStatus(summary);
  const canAdvance = summary.blocking === 0 && summary.warning === 0;
  const firstIssue = checks.find((item) => item.status !== "ready");
  const nextTitle = nextMilestone?.title ?? "常规经营复盘";

  return {
    status,
    label: canAdvance ? `可进入：${nextTitle}` : `暂不能进入：${nextTitle}`,
    detail: canAdvance
      ? `${input.currentMilestone.title} 的系统状态、人工推进和证据备注均已闭合。`
      : `${input.currentMilestone.title} 还有 ${summary.blocking} 个阻断、${summary.warning} 个需复核门槛。`,
    action: firstIssue?.action ?? `进入 ${nextTitle}，同步更新目标推进和上线证据。`,
    canAdvance,
    currentMilestoneId: input.currentMilestone.id,
    currentMilestoneTitle: input.currentMilestone.title,
    nextMilestoneId: nextMilestone?.id,
    nextMilestoneTitle: nextMilestone?.title,
    summary,
    checks,
    blockers: checks.filter((item) => item.status === "blocking"),
    warnings: checks.filter((item) => item.status === "warning"),
  } satisfies LaunchGoalPlanTransitionGate;
}

function buildCopyText(input: {
  generatedAt: string;
  today: string;
  label: string;
  status: HealthStatus;
  milestones: LaunchGoalPlanMilestone[];
  currentMilestone: LaunchGoalPlanMilestone;
  transitionGate: LaunchGoalPlanTransitionGate;
}) {
  const milestoneLines = input.milestones.flatMap((milestone) => [
    `${milestone.order}. [${milestone.status}] ${milestone.title} (${milestone.windowLabel})`,
    `   推进：${progressStatusLabel(milestone.progress?.status)} / 目标日 ${milestone.targetDate} / 负责人 ${milestone.owner}`,
    `   目标：${milestone.businessGoal}`,
    `   下一步：${milestone.nextActions.slice(0, 2).join("；")}`,
    `   验收：${milestone.exitCriteria.slice(0, 2).join("；")}`,
  ]);
  const transitionLines = input.transitionGate.checks.map(
    (check, index) =>
      `${index + 1}. [${check.status}] ${check.title}：${check.detail} 下一步：${check.action} 证据：${check.evidence}`,
  );

  return [
    "玄机 AI 30/60/90 天目标规划",
    `生成时间：${input.generatedAt.slice(0, 16).replace("T", " ")}`,
    `当前日期：${input.today}`,
    `总体状态：${input.label} (${input.status})`,
    `当前阶段：${input.currentMilestone.title}`,
    `阶段推进门槛：${input.transitionGate.label} / canAdvance=${input.transitionGate.canAdvance ? "yes" : "no"} / blocking=${input.transitionGate.summary.blocking} / warning=${input.transitionGate.summary.warning}`,
    "",
    "阶段目标：",
    ...milestoneLines,
    "",
    "阶段推进门槛：",
    ...transitionLines,
  ].join("\n");
}

function progressStatusLabel(status: LaunchGoalProgressStatus | undefined) {
  if (status === "in_progress") {
    return "处理中";
  }

  if (status === "blocked") {
    return "卡住";
  }

  if (status === "done") {
    return "已完成";
  }

  return "未开始";
}

function applyMilestoneProgress(
  milestone: LaunchGoalPlanMilestone,
  progress: LaunchGoalProgressItem | undefined,
) {
  if (!progress) {
    return milestone;
  }

  return {
    ...milestone,
    targetDate: progress.targetDate ?? milestone.targetDate,
    owner: progress.owner ?? milestone.owner,
    progress: {
      status: progress.status,
      targetDate: progress.targetDate,
      owner: progress.owner,
      evidenceNote: progress.evidenceNote,
      note: progress.note,
      updatedAt: progress.updatedAt,
      updatedBy: progress.updatedBy,
      plannedTargetDate: milestone.targetDate,
      plannedOwner: milestone.owner,
    },
  } satisfies LaunchGoalPlanMilestone;
}

export async function getLaunchGoalPlan(input?: LaunchGoalPlanInput) {
  const [decision, weeklyFocus, schedule, rollout, evidenceGap, unitEconomics, progress] =
    await Promise.all([
    input?.decision ?? getLaunchDecision(),
    input?.weeklyFocus ?? getLaunchWeeklyFocus({ now: input?.now }),
    input?.schedule ?? getLaunchScheduleRisk(input?.now),
    input?.rollout ?? getLaunchRolloutPlan(),
    input?.evidenceGap ?? getLaunchEvidenceGap(),
    input?.unitEconomics ?? getLaunchUnitEconomics(),
    input?.progress ?? getLaunchGoalProgress(),
  ]);
  const today = dateKey(input?.now ?? new Date());
  const generatedAt = new Date().toISOString();
  const milestones = [
    buildStartMilestone({ today, decision, weeklyFocus, schedule }),
    buildPaidSmokeMilestone({ today, decision, rollout, evidenceGap }),
    buildRetentionMilestone({ today, unitEconomics, evidenceGap }),
    buildInternationalMilestone({ today, decision, unitEconomics }),
  ].map((milestone) =>
    applyMilestoneProgress(milestone, progress.itemByMilestoneId.get(milestone.id)),
  );
  const summary = summarize(milestones);
  const status = planStatus(summary);
  const currentMilestone =
    milestones.find((milestone) => milestone.status !== "ready") ?? milestones[milestones.length - 1];
  const transitionGate = buildTransitionGate({ milestones, currentMilestone });
  const label = labelFor(status, currentMilestone);
  const detail = detailFor(status, currentMilestone);
  const action = actionFor(currentMilestone);

  return {
    generatedAt,
    today,
    status,
    label,
    detail,
    action,
    summary,
    currentMilestone,
    transitionGate,
    milestones,
    copyText: buildCopyText({
      generatedAt,
      today,
      label,
      status,
      milestones,
      currentMilestone,
      transitionGate,
    }),
  } satisfies LaunchGoalPlan;
}
