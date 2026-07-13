import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  getLaunchMaterialPack,
  type LaunchMaterialItem,
  type LaunchMaterialPack,
} from "@/lib/launch-materials";

export type LaunchFounderDossierPathId =
  | "individual_business"
  | "limited_company"
  | "overseas_later";

export type LaunchFounderDossierPath = {
  id: LaunchFounderDossierPathId;
  title: string;
  recommendation: "recommended" | "optional" | "later";
  fit: string;
  tradeoff: string;
  unlocks: string[];
  caution: string;
};

export type LaunchFounderDossierPathDecisionAction = {
  id: string;
  title: string;
  owner: string;
  status: HealthStatus;
  statusLabel: string;
  action: string;
  evidence: string;
  unlocks: string[];
  envKeys: string[];
};

export type LaunchFounderDossierPathDecisionUnlock = {
  id: string;
  title: string;
  status: HealthStatus;
  statusLabel: string;
  detail: string;
  envKeys: string[];
  blockedBy: string[];
};

export type LaunchFounderDossierPathDecision = {
  status: HealthStatus;
  label: string;
  recommendedPath: LaunchFounderDossierPath;
  alternatives: LaunchFounderDossierPath[];
  reason: string;
  immediateActions: LaunchFounderDossierPathDecisionAction[];
  unlockSequence: LaunchFounderDossierPathDecisionUnlock[];
  copyText: string;
};

export type LaunchFounderDossierStep = {
  id: string;
  title: string;
  phase: string;
  owner: string;
  status: HealthStatus;
  statusLabel: string;
  priority: number;
  blockedBy: string[];
  action: string;
  prepare: string[];
  outputs: string[];
  envKeys: string[];
  evidence: string;
};

export type LaunchFounderDossierGroup = {
  title: string;
  status: HealthStatus;
  steps: LaunchFounderDossierStep[];
};

export type LaunchFounderDossier = {
  generatedAt: string;
  status: HealthStatus;
  label: string;
  detail: string;
  action: string;
  summary: {
    ready: number;
    pending: number;
    blocking: number;
    total: number;
    envKeyCount: number;
    documentCount: number;
  };
  entityPaths: LaunchFounderDossierPath[];
  pathDecision: LaunchFounderDossierPathDecision;
  groups: LaunchFounderDossierGroup[];
  criticalPath: LaunchFounderDossierStep[];
  nextOfflineActions: LaunchFounderDossierStep[];
  envKeys: string[];
  officialRefs: Array<{
    title: string;
    url: string;
    note: string;
  }>;
  copyText: string;
};

const entityPathOptions = [
  {
    id: "individual_business",
    title: "个体工商户主体",
    recommendation: "recommended",
    fit: "第一版国内中文 Web 收费、团队很小、希望尽快跑通支付宝/微信支付和备案材料。",
    tradeoff: "办理和维护通常更轻，但品牌、融资、股权和多人协作空间有限。",
    unlocks: ["ICP备案主体", "支付宝/微信支付商户申请", "协议主体", "收款与对账"],
    caution: "具体可办理范围、行业表述和开户地址需按当地政策、支付平台审核和服务商要求确认。",
  },
  {
    id: "limited_company",
    title: "有限公司主体",
    recommendation: "optional",
    fit: "计划长期经营、后续要投放、招聘、融资、签供应商合同或做多渠道商业合作。",
    tradeoff: "主体信用和扩展性更强，但注册、记账、税务和维护成本更高。",
    unlocks: ["ICP备案主体", "支付商户", "对公账户", "合同签署", "法务复核"],
    caution: "如果选择公司路径，需要让营业执照经营范围、备案主体、支付主体和协议主体一致。",
  },
  {
    id: "overseas_later",
    title: "海外结构预留",
    recommendation: "later",
    fit: "后续要做英文站、海外支付、海外投放或境外主体收款。",
    tradeoff: "不适合作为国内首发收费的捷径；中文站、国内支付和备案仍要先解决国内主体问题。",
    unlocks: ["英文站", "海外支付", "海外数据合规", "多币种定价"],
    caution: "第一版建议只预留 i18n、币种和模型配置，不把海外主体作为国内收费上线前置方案。",
  },
] satisfies LaunchFounderDossierPath[];

const officialRefs = [
  {
    title: "工信部 ICP/IP 地址/域名信息备案管理系统",
    url: "https://beian.miit.gov.cn/",
    note: "查询和核对 ICP 备案主体、备案号与域名信息。",
  },
  {
    title: "支付宝开放平台",
    url: "https://open.alipay.com/",
    note: "创建应用、配置密钥、接入电脑网站支付和异步通知。",
  },
  {
    title: "微信开放平台",
    url: "https://open.weixin.qq.com/",
    note: "申请网站应用和微信扫码登录能力。",
  },
  {
    title: "微信支付商户平台",
    url: "https://pay.weixin.qq.com/",
    note: "申请商户号、配置 API v3 key、商户证书和支付产品。",
  },
  {
    title: "七牛云对象存储 Kodo",
    url: "https://developer.qiniu.com/kodo",
    note: "配置 bucket、公开域名、上传凭证和 CORS。",
  },
];

function statusRank(status: HealthStatus) {
  if (status === "blocking") {
    return 0;
  }

  if (status === "warning") {
    return 1;
  }

  return 2;
}

function stepFromMaterial(item: LaunchMaterialItem): LaunchFounderDossierStep {
  return {
    id: item.id,
    title: item.title,
    phase: item.phase,
    owner: item.owner,
    status: item.healthStatus,
    statusLabel: item.statusLabel,
    priority: item.priority,
    blockedBy: item.blockedBy,
    action: item.currentAction,
    prepare: item.materials,
    outputs: item.outputs,
    envKeys: item.envKeys,
    evidence: item.currentEvidence,
  };
}

function groupStatus(steps: LaunchFounderDossierStep[]): HealthStatus {
  if (steps.some((step) => step.status === "blocking")) {
    return "blocking";
  }

  if (steps.some((step) => step.status === "warning")) {
    return "warning";
  }

  return "ready";
}

function groupSteps(steps: LaunchFounderDossierStep[]) {
  const phases = Array.from(new Set(steps.map((step) => step.phase)));

  return phases.map((phase) => {
    const phaseSteps = steps
      .filter((step) => step.phase === phase)
      .sort(
        (a, b) =>
          statusRank(a.status) - statusRank(b.status) ||
          a.priority - b.priority ||
          a.title.localeCompare(b.title, "zh-CN"),
      );

    return {
      title: phase,
      status: groupStatus(phaseSteps),
      steps: phaseSteps,
    } satisfies LaunchFounderDossierGroup;
  });
}

function pathDecisionStatus(entityStep: LaunchFounderDossierStep | undefined): HealthStatus {
  if (!entityStep || entityStep.status === "blocking") {
    return "blocking";
  }

  if (entityStep.status === "warning") {
    return "warning";
  }

  return "ready";
}

function pathDecisionLabel(status: HealthStatus) {
  if (status === "ready") {
    return "收费主体路径已登记";
  }

  if (status === "warning") {
    return "收费主体路径待复核";
  }

  return "先定国内收费主体路径";
}

function pathDecisionAction(step: LaunchFounderDossierStep) {
  return {
    id: step.id,
    title: step.title,
    owner: step.owner,
    status: step.status,
    statusLabel: step.statusLabel,
    action: step.action,
    evidence: step.evidence,
    unlocks: step.outputs,
    envKeys: step.envKeys,
  } satisfies LaunchFounderDossierPathDecisionAction;
}

function pathDecisionUnlock(step: LaunchFounderDossierStep) {
  return {
    id: step.id,
    title: step.title,
    status: step.status,
    statusLabel: step.statusLabel,
    detail: step.action,
    envKeys: step.envKeys,
    blockedBy: step.blockedBy,
  } satisfies LaunchFounderDossierPathDecisionUnlock;
}

function buildPathDecision(
  paths: LaunchFounderDossierPath[],
  steps: LaunchFounderDossierStep[],
) {
  const recommendedPath =
    paths.find((path) => path.recommendation === "recommended") ?? paths[0];
  const stepById = new Map(steps.map((step) => [step.id, step]));
  const entityStep = stepById.get("entity");
  const status = pathDecisionStatus(entityStep);
  const immediateIds =
    status === "ready"
      ? ["domain", "icp", "alipay"]
      : ["entity", "domain", "icp"];
  const immediateActions = immediateIds
    .map((id) => stepById.get(id))
    .filter((step): step is LaunchFounderDossierStep => Boolean(step))
    .map(pathDecisionAction);
  const unlockSequence = ["entity", "domain", "icp", "alipay", "wechat_pay", "legal_review"]
    .map((id) => stepById.get(id))
    .filter((step): step is LaunchFounderDossierStep => Boolean(step))
    .map(pathDecisionUnlock);
  const reason =
    status === "ready"
      ? "主体信息已进入办理链路，下一步要让正式域名、ICP备案、支付商户和协议主体继续保持一致。"
      : "当前个人没有可直接承接备案、支付宝、微信支付和协议责任的主体，第一步必须在个体工商户与有限公司之间确定一条国内收费路径。";
  const copyText = [
    "主体路径决策",
    `推荐路径：${recommendedPath.title}`,
    `状态：${pathDecisionLabel(status)} (${status})`,
    `原因：${reason}`,
    "",
    "立刻推进：",
    ...immediateActions.map(
      (item, index) =>
        `${index + 1}. [${item.statusLabel}] ${item.title}：${item.action}；证据：${item.evidence}`,
    ),
    "",
    "解锁顺序：",
    ...unlockSequence.map(
      (item, index) =>
        `${index + 1}. [${item.statusLabel}] ${item.title}；变量：${item.envKeys.join("、") || "无"}`,
    ),
  ].join("\n");

  return {
    status,
    label: pathDecisionLabel(status),
    recommendedPath,
    alternatives: paths.filter((path) => path.id !== recommendedPath.id),
    reason,
    immediateActions,
    unlockSequence,
    copyText,
  } satisfies LaunchFounderDossierPathDecision;
}

function dossierCopy(input: {
  status: HealthStatus;
  label: string;
  pathDecision: LaunchFounderDossierPathDecision;
  criticalPath: LaunchFounderDossierStep[];
  envKeys: string[];
}) {
  const stepLines =
    input.criticalPath.length > 0
      ? input.criticalPath.map(
          (step, index) =>
            `${index + 1}. [${step.statusLabel}] ${step.phase} / ${step.title}：${step.action}；产物：${step.outputs.slice(0, 3).join("、")}；变量：${step.envKeys.join("、") || "无"}`,
        )
      : ["- 当前没有待办理事项。"];

  return [
    "玄机 AI 创始人上线办理包",
    `状态：${input.label} (${input.status})`,
    "",
    input.pathDecision.copyText,
    "",
    "本轮关键路径：",
    ...stepLines,
    "",
    "会解锁的生产变量：",
    input.envKeys.join("、") || "暂无",
  ].join("\n");
}

function dossierStatus(materials: LaunchMaterialPack) {
  if (materials.summary.blocking > 0) {
    return {
      status: "blocking" as const,
      label: `办理包有 ${materials.summary.blocking} 个上线阻断事项`,
      detail: "当前主体、域名、备案、生产库、AI/存储或支付资质尚未闭合，不能进入真实收费。",
      action: "先确定主体路径，再按主体、域名、备案、生产库、AI/存储、支付和法务顺序推进。",
    };
  }

  if (materials.summary.pending > 0) {
    return {
      status: "warning" as const,
      label: `办理包有 ${materials.summary.pending} 个待复核事项`,
      detail: "核心外部事项没有硬阻断，但仍有材料、证据或生产变量需要复核。",
      action: "补齐平台截图、回调配置和生产变量，再进入小额真实订单验收。",
    };
  }

  return {
    status: "ready" as const,
    label: "办理包已闭合",
    detail: "外部主体、域名、备案、云服务、支付和法务材料均已闭合。",
    action: "进入真实支付小额订单验收，并归档最终上线证据。",
  };
}

export async function getLaunchFounderDossier(input?: {
  materials?: LaunchMaterialPack;
}) {
  const materials = input?.materials ?? (await getLaunchMaterialPack());
  const steps = materials.items.map(stepFromMaterial);
  const pendingSteps = steps.filter((step) => step.status !== "ready");
  const criticalPath = [...pendingSteps]
    .sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        a.priority - b.priority ||
        a.title.localeCompare(b.title, "zh-CN"),
    )
    .slice(0, 8);
  const status = dossierStatus(materials);
  const pathDecision = buildPathDecision(entityPathOptions, steps);

  return {
    generatedAt: new Date().toISOString(),
    ...status,
    summary: {
      ready: materials.summary.ready,
      pending: materials.summary.pending,
      blocking: materials.summary.blocking,
      total: materials.summary.total,
      envKeyCount: materials.summary.envKeyCount,
      documentCount: materials.summary.materialCount,
    },
    entityPaths: entityPathOptions,
    pathDecision,
    groups: groupSteps(steps),
    criticalPath,
    nextOfflineActions: criticalPath.slice(0, 5),
    envKeys: materials.envKeys,
    officialRefs,
    copyText: dossierCopy({
      status: status.status,
      label: status.label,
      pathDecision,
      criticalPath,
      envKeys: materials.envKeys,
    }),
  } satisfies LaunchFounderDossier;
}
