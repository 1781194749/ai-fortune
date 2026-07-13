import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import { getLaunchPackage, type LaunchPackageAction } from "@/lib/launch-package";
import {
  getLaunchWorkplan,
  type LaunchWorkplan,
  type LaunchWorkplanTask,
} from "@/lib/launch-workplan";

export type LaunchRolloutPhaseId =
  | "qualifications"
  | "production_config"
  | "integration"
  | "paid_smoke"
  | "growth_release";

export type LaunchRolloutBlocker = {
  id: string;
  title: string;
  status: HealthStatus;
  owner: string;
  action: string;
  evidence: string;
};

export type LaunchRolloutPhase = {
  id: LaunchRolloutPhaseId;
  order: number;
  title: string;
  status: HealthStatus;
  label: string;
  owner: string;
  goal: string;
  entryCriteria: string[];
  exitCriteria: string[];
  blockers: LaunchRolloutBlocker[];
  nextActions: string[];
};

export type LaunchRolloutPlan = {
  generatedAt: string;
  status: HealthStatus;
  label: string;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
  };
  phases: LaunchRolloutPhase[];
  currentPhase: LaunchRolloutPhase;
  copyText: string;
};

type PhaseTemplate = {
  id: LaunchRolloutPhaseId;
  order: number;
  title: string;
  owner: string;
  goal: string;
  entryCriteria: string[];
  exitCriteria: string[];
};

const phaseTemplates = [
  {
    id: "qualifications",
    order: 1,
    title: "资质与主体准备",
    owner: "创始人 / 运营 / 财务",
    goal: "确定可备案、可收款、可签署协议的主体，并拿到域名、备案和外部账号办理材料。",
    entryCriteria: ["确认中文 Web 首发", "明确主体路径：公司或个体工商户"],
    exitCriteria: [
      "主体名称、域名实名认证、ICP备案路径明确",
      "支付宝、微信开放平台、微信支付、七牛和 OpenAI 账号办理责任人明确",
      "平台申请材料包没有阻断字段",
    ],
  },
  {
    id: "production_config",
    order: 2,
    title: "生产配置与数据底座",
    owner: "技术 / 运维",
    goal: "把正式域名、后台保护、PostgreSQL、模型、七牛和支付参数写入生产环境。",
    entryCriteria: ["外部账号或主体材料开始就绪", "生产服务器或部署平台可配置环境变量"],
    exitCriteria: [
      "生产变量核对无 blocking",
      "PostgreSQL 迁移完成且落库探针通过",
      "后台访问 token 和会话密钥满足强度要求",
    ],
  },
  {
    id: "integration",
    order: 3,
    title: "AI、图片与支付联调",
    owner: "技术 / 产品 / 财务",
    goal: "验证 OpenAI、七牛、支付宝、微信支付和登录链路真实可用。",
    entryCriteria: ["生产变量已填入真实值", "第三方账号、密钥和回调地址已配置"],
    exitCriteria: [
      "OpenAI 模型读取诊断通过",
      "七牛上传和公开 URL 验证通过",
      "支付宝或微信支付签名诊断通过",
    ],
  },
  {
    id: "paid_smoke",
    order: 4,
    title: "小额真实订单灰度",
    owner: "产品 / 技术 / 财务",
    goal: "用真实小额订单验证下单、回调、权益发放、钱包流水和报告生成。",
    entryCriteria: ["Go / No-Go 无 blocking", "至少一个真实支付渠道诊断通过", "单位经济没有 blocking"],
    exitCriteria: [
      "一笔小额订单从待支付变为已支付",
      "会员或星力权益自动到账",
      "订单、钱包流水、报告和 UsageLog 可在重启后恢复",
    ],
  },
  {
    id: "growth_release",
    order: 5,
    title: "放量与复盘",
    owner: "产品 / 运营 / 技术",
    goal: "归档最终证据，小流量放开真实收费入口，并用渠道 ROI 与后台审计持续复盘。",
    entryCriteria: [
      "小额真实订单已验收",
      "上线证据归档与当前 Go / No-Go 状态一致",
      "单位经济检查无 warning",
    ],
    exitCriteria: [
      "首批真实用户支付链路稳定",
      "渠道来源、优惠码、订单、权益和成本记录可复盘",
      "OpenAI tokens、costCents、星力消耗和收入可按订单核算",
      "保留支付回滚、客服退款和运营补偿预案",
    ],
  },
] satisfies PhaseTemplate[];

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
    return "可进入下一阶段";
  }

  if (status === "blocking") {
    return "当前阶段阻断";
  }

  return "当前阶段需复核";
}

function summarize(phases: LaunchRolloutPhase[]) {
  return {
    ready: phases.filter((phase) => phase.status === "ready").length,
    warning: phases.filter((phase) => phase.status === "warning").length,
    blocking: phases.filter((phase) => phase.status === "blocking").length,
    total: phases.length,
  };
}

function statusFromBlockers(blockers: LaunchRolloutBlocker[]) {
  if (blockers.some((blocker) => blocker.status === "blocking")) {
    return "blocking";
  }

  if (blockers.some((blocker) => blocker.status === "warning")) {
    return "warning";
  }

  return "ready";
}

function blockerFromTask(task: LaunchWorkplanTask): LaunchRolloutBlocker {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    owner: task.owner,
    action: task.action,
    evidence: task.evidence,
  };
}

function blockerFromAction(action: LaunchPackageAction): LaunchRolloutBlocker {
  return {
    id: action.id,
    title: action.title,
    status: action.status,
    owner: action.owner ?? action.group ?? "产品 / 技术",
    action: action.action,
    evidence: action.evidence ?? "后台健康页显示对应检查项已通过。",
  };
}

function isPaymentTask(task: LaunchWorkplanTask) {
  const haystack = [task.id, task.title, task.phase, ...task.envKeys].join(" ");

  return /PAYMENT|ALIPAY|WECHAT_PAY|支付宝|微信支付|支付/i.test(haystack);
}

function laneTasks(workplan: LaunchWorkplan, ids: LaunchWorkplanTask["laneId"][]) {
  return workplan.lanes
    .filter((lane) => ids.includes(lane.id))
    .flatMap((lane) => lane.tasks);
}

function blockersForPhase(input: {
  phaseId: LaunchRolloutPhaseId;
  workplan: LaunchWorkplan;
  requiredBeforeGo: LaunchPackageAction[];
  missingEvidence: LaunchPackageAction[];
}) {
  if (input.phaseId === "qualifications") {
    return laneTasks(input.workplan, ["external", "application"]).map(blockerFromTask);
  }

  if (input.phaseId === "production_config") {
    return laneTasks(input.workplan, ["environment"]).map(blockerFromTask);
  }

  if (input.phaseId === "integration") {
    return laneTasks(input.workplan, ["verification"])
      .filter((task) => !isPaymentTask(task))
      .map(blockerFromTask);
  }

  if (input.phaseId === "paid_smoke") {
    const paymentTasks = laneTasks(input.workplan, ["verification"])
      .filter(isPaymentTask)
      .map(blockerFromTask);
    const economicsBlockers = laneTasks(input.workplan, ["economics"])
      .filter((task) => task.status === "blocking")
      .map(blockerFromTask);
    const paymentActions = input.requiredBeforeGo
      .filter((action) => /支付|PAYMENT|ALIPAY|WECHAT/i.test([action.id, action.title].join(" ")))
      .map(blockerFromAction);

    return uniqueBlockers([...paymentTasks, ...paymentActions, ...economicsBlockers]);
  }

  return uniqueBlockers([
    ...laneTasks(input.workplan, ["economics"]).map(blockerFromTask),
    ...input.missingEvidence.map(blockerFromAction),
    ...input.requiredBeforeGo
      .filter((action) => action.type === "evidence")
      .map(blockerFromAction),
  ]);
}

function uniqueBlockers(blockers: LaunchRolloutBlocker[]) {
  const seen = new Set<string>();

  return blockers.filter((blocker) => {
    if (seen.has(blocker.id)) {
      return false;
    }

    seen.add(blocker.id);
    return true;
  });
}

function nextActions(blockers: LaunchRolloutBlocker[]) {
  return blockers
    .filter((blocker) => blocker.status !== "ready")
    .sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        a.title.localeCompare(b.title, "zh-CN"),
    )
    .slice(0, 3)
    .map((blocker) => `${blocker.owner}：${blocker.action}`);
}

function buildPhase(input: {
  template: PhaseTemplate;
  workplan: LaunchWorkplan;
  requiredBeforeGo: LaunchPackageAction[];
  missingEvidence: LaunchPackageAction[];
}) {
  const blockers = blockersForPhase({
    phaseId: input.template.id,
    workplan: input.workplan,
    requiredBeforeGo: input.requiredBeforeGo,
    missingEvidence: input.missingEvidence,
  });
  const status = statusFromBlockers(blockers);

  return {
    ...input.template,
    status,
    label: statusLabel(status),
    blockers,
    nextActions: nextActions(blockers),
  } satisfies LaunchRolloutPhase;
}

function rolloutStatus(phases: LaunchRolloutPhase[]) {
  if (phases.some((phase) => phase.status === "blocking")) {
    return "blocking";
  }

  if (phases.some((phase) => phase.status === "warning")) {
    return "warning";
  }

  return "ready";
}

function rolloutLabel(status: HealthStatus, currentPhase: LaunchRolloutPhase) {
  if (status === "ready") {
    return "灰度放量计划已闭合";
  }

  if (status === "warning") {
    return `灰度放量计划待复核：${currentPhase.title}`;
  }

  return `灰度放量计划阻断：${currentPhase.title}`;
}

function buildCopyText(input: {
  generatedAt: string;
  status: HealthStatus;
  label: string;
  phases: LaunchRolloutPhase[];
  currentPhase: LaunchRolloutPhase;
}) {
  const phaseLines = input.phases.map(
    (phase) =>
      `${phase.order}. [${phase.label}] ${phase.title}：${phase.blockers.filter((blocker) => blocker.status !== "ready").length} 个待处理`,
  );
  const nextActionLines =
    input.currentPhase.nextActions.length > 0
      ? input.currentPhase.nextActions.map((action, index) => `${index + 1}. ${action}`)
      : ["- 当前阶段暂无待处理动作。"];

  return [
    "玄机 AI 灰度放量计划",
    `生成时间：${input.generatedAt.slice(0, 16).replace("T", " ")}`,
    `总体状态：${input.label} (${input.status})`,
    `当前阶段：${input.currentPhase.title}`,
    "",
    "阶段状态：",
    ...phaseLines,
    "",
    "当前阶段下一步：",
    ...nextActionLines,
  ].join("\n");
}

export async function getLaunchRolloutPlan() {
  const [launchPackage, workplan] = await Promise.all([getLaunchPackage(), getLaunchWorkplan()]);
  const generatedAt = new Date().toISOString();
  const phases = phaseTemplates.map((template) =>
    buildPhase({
      template,
      workplan,
      requiredBeforeGo: launchPackage.requiredBeforeGo,
      missingEvidence: launchPackage.missingEvidence,
    }),
  );
  const status = rolloutStatus(phases);
  const currentPhase = phases.find((phase) => phase.status !== "ready") ?? phases[phases.length - 1];
  const label = rolloutLabel(status, currentPhase);

  return {
    generatedAt,
    status,
    label,
    summary: summarize(phases),
    phases,
    currentPhase,
    copyText: buildCopyText({ generatedAt, status, label, phases, currentPhase }),
  } satisfies LaunchRolloutPlan;
}
