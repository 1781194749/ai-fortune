import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  getLaunchApplicationPack,
  type LaunchApplicationPack,
  type LaunchApplicationPlatform,
} from "@/lib/launch-application-pack";
import {
  getLaunchCallbackChecklist,
  type LaunchCallbackChecklist,
} from "@/lib/launch-callbacks";
import {
  getLaunchComplianceChecklist,
  type LaunchComplianceChecklist,
  type LaunchComplianceItem,
} from "@/lib/launch-compliance";
import {
  externalReadinessStatusLabel,
  getLaunchExternalReadiness,
  type ExternalReadinessItem,
  type ExternalReadinessItemId,
  type LaunchExternalReadiness,
} from "@/lib/launch-external-readiness";
import { legalDocuments, legalVersion } from "@/lib/legal";

export type LaunchCompliancePlanStepId =
  | "entity_path"
  | "domain_icp"
  | "agreement_subject"
  | "payment_subjects"
  | "legal_documents"
  | "privacy_suppliers"
  | "image_consent"
  | "refund_boundary"
  | "legal_review_archive";

export type LaunchCompliancePlanStep = {
  id: LaunchCompliancePlanStepId;
  order: number;
  title: string;
  status: HealthStatus;
  owner: string;
  detail: string;
  action: string;
  evidence: string;
  routes?: string[];
  envKeys?: string[];
  externalIds?: ExternalReadinessItemId[];
};

export type LaunchCompliancePlanAction = {
  label: string;
  command: string;
  detail: string;
};

export type LaunchCompliancePlanActionGroup = {
  title: string;
  when: string;
  commands: LaunchCompliancePlanAction[];
};

export type LaunchCompliancePlan = {
  generatedAt: string;
  status: HealthStatus;
  label: string;
  detail: string;
  action: string;
  version: string;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
    entityReady: boolean;
    icpReady: boolean;
    paymentSubjectsReady: boolean;
    legalDocsReady: boolean;
    refundBoundaryReady: boolean;
  };
  subject: {
    entityStatus: string;
    icpStatus: string;
    appUrl: string;
    legalVersion: string;
  };
  steps: LaunchCompliancePlanStep[];
  nextSteps: LaunchCompliancePlanStep[];
  commandGroups: LaunchCompliancePlanActionGroup[];
  evidence: string[];
  copyText: string;
};

type LaunchCompliancePlanInput = {
  compliance?: LaunchComplianceChecklist;
  externalReadiness?: LaunchExternalReadiness;
  applicationPack?: LaunchApplicationPack;
  callbacks?: LaunchCallbackChecklist;
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

function worstStatus(statuses: HealthStatus[]) {
  return statuses.sort((a, b) => statusRank(a) - statusRank(b))[0] ?? "ready";
}

function planStatusFromExternal(item: ExternalReadinessItem | undefined): HealthStatus {
  if (!item) {
    return "blocking";
  }

  if (item.status === "ready") {
    return "ready";
  }

  if (item.status === "in_progress" || item.status === "submitted") {
    return "warning";
  }

  return "blocking";
}

function summarize(steps: LaunchCompliancePlanStep[]) {
  return {
    ready: steps.filter((step) => step.status === "ready").length,
    warning: steps.filter((step) => step.status === "warning").length,
    blocking: steps.filter((step) => step.status === "blocking").length,
    total: steps.length,
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

function complianceById(compliance: LaunchComplianceChecklist) {
  return new Map(compliance.items.map((item) => [item.id, item]));
}

function externalById(externalReadiness: LaunchExternalReadiness) {
  return new Map(externalReadiness.items.map((item) => [item.id, item]));
}

function platformById(applicationPack: LaunchApplicationPack) {
  return new Map(applicationPack.platforms.map((platform) => [platform.id, platform]));
}

function complianceStatus(item: LaunchComplianceItem | undefined) {
  return item?.status ?? "blocking";
}

function platformStatus(item: LaunchApplicationPlatform | undefined) {
  return item?.status ?? "blocking";
}

function externalDetail(item: ExternalReadinessItem | undefined) {
  if (!item) {
    return "外部事项未登记。";
  }

  return [
    `状态：${externalReadinessStatusLabel(item.status)}`,
    item.targetDate ? `目标日：${item.targetDate}` : undefined,
    item.receiptNo ? `回执：${item.receiptNo}` : undefined,
    item.evidenceNote ? `证据：${item.evidenceNote}` : undefined,
    item.note ? `备注：${item.note}` : undefined,
  ]
    .filter(Boolean)
    .join("；");
}

function platformDetail(platforms: Array<LaunchApplicationPlatform | undefined>) {
  const existing = platforms.filter((platform): platform is LaunchApplicationPlatform =>
    Boolean(platform),
  );

  if (existing.length === 0) {
    return "平台申请材料未生成。";
  }

  return existing
    .map((platform) => `${platform.title}：${platform.label}`)
    .join("；");
}

function legalText() {
  return legalDocuments
    .flatMap((document) => [
      document.title,
      document.summary,
      ...document.sections.flatMap((section) => [section.title, ...section.body]),
    ])
    .join("\n");
}

function hasRefundBoundary() {
  const text = legalText();

  return text.includes("退款") && text.includes("客服") && text.includes("异常订单");
}

function labelForStatus(status: HealthStatus, summary: ReturnType<typeof summarize>) {
  if (status === "blocking") {
    return `合规与主体落地有 ${summary.blocking} 个阻断步骤`;
  }

  if (status === "warning") {
    return `合规与主体落地有 ${summary.warning} 个待复核步骤`;
  }

  return "合规与主体落地已闭合";
}

function buildCopyText(input: {
  status: HealthStatus;
  label: string;
  appUrl: string;
  steps: LaunchCompliancePlanStep[];
}) {
  const lines = input.steps.map((step, index) => {
    const tags = [
      step.envKeys?.length ? `变量：${step.envKeys.join("、")}` : undefined,
      step.externalIds?.length ? `外部事项：${step.externalIds.join("、")}` : undefined,
      step.routes?.length ? `路径：${step.routes.join("、")}` : undefined,
    ]
      .filter(Boolean)
      .join("；");

    return [
      `${index + 1}. [${step.status}] ${step.title} / ${step.owner}`,
      `动作：${step.action}`,
      `证据：${step.evidence}`,
      tags,
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    "玄机 AI 合规与主体落地计划",
    `APP_URL：${input.appUrl}`,
    `协议版本：${legalVersion}`,
    `状态：${input.label} (${input.status})`,
    "",
    ...lines,
  ].join("\n\n");
}

function buildSteps(input: {
  compliance: LaunchComplianceChecklist;
  externalReadiness: LaunchExternalReadiness;
  applicationPack: LaunchApplicationPack;
  refundBoundaryReady: boolean;
}) {
  const complianceItems = complianceById(input.compliance);
  const externalItems = externalById(input.externalReadiness);
  const platforms = platformById(input.applicationPack);
  const entity = externalItems.get("entity");
  const domain = externalItems.get("domain");
  const icp = externalItems.get("icp");
  const alipay = externalItems.get("alipay");
  const wechatPay = externalItems.get("wechat_pay");
  const legalReview = externalItems.get("legal_review");
  const alipayPlatform = platforms.get("alipay");
  const wechatPayPlatform = platforms.get("wechat_pay");
  const icpPlatform = platforms.get("icp");
  const legalDocumentsItem = complianceItems.get("legal:documents");
  const legalEntityItem = complianceItems.get("legal:entity");
  const legalIcpItem = complianceItems.get("legal:icp");
  const legalLinksItem = complianceItems.get("legal:links");
  const contentBoundaryItem = complianceItems.get("legal:content-boundary");
  const privacyItem = complianceItems.get("legal:privacy-suppliers");
  const uploadConsentItem = complianceItems.get("legal:upload-consent");
  const legalReviewItem = complianceItems.get("legal:external-review");
  const entityStatus = planStatusFromExternal(entity);
  const domainStatus = planStatusFromExternal(domain);
  const icpStatus = planStatusFromExternal(icp);
  const paymentSubjectStatus = worstStatus([
    entityStatus,
    planStatusFromExternal(alipay),
    planStatusFromExternal(wechatPay),
    platformStatus(alipayPlatform),
    platformStatus(wechatPayPlatform),
  ]);
  const steps = [
    {
      id: "entity_path",
      order: 1,
      title: "确定收费主体路径",
      status: entityStatus,
      owner: "创始人 / 财务",
      detail: externalDetail(entity),
      action:
        entity?.status === "ready"
          ? "把该主体作为备案、支付商户、协议和客服口径的唯一收费主体。"
          : "在公司或个体工商户中确定一条路径，准备证照、经营者/法人、联系人和收款账户材料。",
      evidence: entity?.evidenceNote ?? entity?.evidence ?? "主体名称、证照信息和收款主体一致。",
      envKeys: ["COMPANY_NAME"],
      externalIds: ["entity"],
    },
    {
      id: "domain_icp",
      order: 2,
      title: "正式域名与 ICP 备案",
      status: worstStatus([
        domainStatus,
        icpStatus,
        complianceStatus(legalIcpItem),
        platformStatus(icpPlatform),
      ]),
      owner: "运营 / 技术 / 法务",
      detail: [
        `域名：${externalDetail(domain)}`,
        `ICP备案：${externalDetail(icp)}`,
        `备案展示：${legalIcpItem?.detail ?? "ICP备案展示未核对。"}`,
      ].join("；"),
      action:
        domainStatus === "ready" && icpStatus === "ready"
          ? "确认 APP_URL、页脚备案号、协议页备案主体和备案系统记录一致。"
          : "先完成域名实名认证、HTTPS 解析和 ICP 提交；备案号下发后配置 ICP_RECORD_NO。",
      evidence: "正式域名可访问；ICP备案号在首页、协议页和备案系统中一致。",
      routes: ["/", "/legal/terms", "/legal/privacy"],
      envKeys: ["APP_URL", "ICP_RECORD_NO"],
      externalIds: ["domain", "icp"],
    },
    {
      id: "agreement_subject",
      order: 3,
      title: "协议主体与平台入口一致",
      status: worstStatus([
        complianceStatus(legalEntityItem),
        complianceStatus(legalIcpItem),
        complianceStatus(legalLinksItem),
      ]),
      owner: "运营 / 法务 / 技术",
      detail: [
        legalEntityItem?.detail ?? "协议主体未核对。",
        legalIcpItem?.detail ?? "备案号未核对。",
        legalLinksItem?.detail ?? "平台协议链接未核对。",
      ].join("；"),
      action: "用真实 APP_URL 生成用户协议、隐私政策和免责声明链接，并同步到微信、支付宝、ICP备案和 OpenAI 项目材料。",
      evidence: "首页 footer、协议页面、支付平台应用和备案材料展示同一主体与正式 HTTPS 协议链接。",
      routes: ["/legal/terms", "/legal/privacy", "/legal/disclaimer"],
      envKeys: ["COMPANY_NAME", "ICP_RECORD_NO", "APP_URL"],
    },
    {
      id: "payment_subjects",
      order: 4,
      title: "支付宝与微信支付主体一致",
      status: paymentSubjectStatus,
      owner: "财务 / 技术",
      detail: [
        externalDetail(alipay),
        externalDetail(wechatPay),
        platformDetail([alipayPlatform, wechatPayPlatform]),
      ].join("；"),
      action:
        paymentSubjectStatus === "ready"
          ? "保留商户后台主体截图、应用审核回执和支付产品开通状态。"
          : "用同一经营主体申请支付宝开放平台应用和微信支付商户号，回调域名使用正式 APP_URL。",
      evidence: "支付宝应用主体、微信支付商户主体、协议主体和备案主体一致，且均有平台回执或截图。",
      routes: ["/api/admin/launch/application-pack", "/api/admin/launch/payment-plan"],
      envKeys: [
        "ALIPAY_APP_ID",
        "WECHAT_PAY_MCH_ID",
        "WECHAT_PAY_API_V3_KEY",
      ],
      externalIds: ["alipay", "wechat_pay"],
    },
    {
      id: "legal_documents",
      order: 5,
      title: "协议四件套与 AI 命理边界",
      status: worstStatus([
        complianceStatus(legalDocumentsItem),
        complianceStatus(contentBoundaryItem),
      ]),
      owner: "产品 / 法务",
      detail: [
        legalDocumentsItem?.detail ?? "协议四件套未核对。",
        contentBoundaryItem?.detail ?? "命理内容边界未核对。",
      ].join("；"),
      action: "保持用户协议、隐私政策、免责声明和图片上传授权四件套可访问，并明确 AI 命理仅作娱乐、文化参考和自我探索。",
      evidence: "四个协议页面可访问，免责声明覆盖非医疗、非投资、非法律、非重大决策建议。",
      routes: ["/legal/terms", "/legal/privacy", "/legal/disclaimer", "/legal/upload-consent"],
    },
    {
      id: "privacy_suppliers",
      order: 6,
      title: "隐私政策与模型/存储/支付披露",
      status: complianceStatus(privacyItem),
      owner: "产品 / 法务",
      detail: privacyItem?.detail ?? "隐私供应商披露未核对。",
      action: "按实际上线供应商复核支付宝、微信支付、七牛、OpenAI、订单、图片和 AI 调用日志的数据处理说明。",
      evidence: "隐私政策覆盖支付渠道、图片存储、模型供应商、保存期限、删除方式和用户权利说明。",
      routes: ["/legal/privacy"],
    },
    {
      id: "image_consent",
      order: 7,
      title: "手相图片授权与上传前同意",
      status: complianceStatus(uploadConsentItem),
      owner: "产品 / 技术 / 法务",
      detail: uploadConsentItem?.detail ?? "图片上传授权未核对。",
      action: "保持手相上传前授权勾选，明确本人或已获授权、七牛存储、AI 分析、禁止上传和删除口径。",
      evidence: "手相页未勾选授权时不能上传；上传授权页面可从产品入口访问。",
      routes: ["/palm", "/legal/upload-consent"],
    },
    {
      id: "refund_boundary",
      order: 8,
      title: "付费退款与异常订单口径",
      status: input.refundBoundaryReady ? "ready" : "warning",
      owner: "产品 / 运营 / 法务",
      detail: input.refundBoundaryReady
        ? "用户协议已覆盖退款、客服和异常订单处理边界。"
        : "用户协议尚未完整覆盖退款、客服或异常订单处理口径。",
      action: input.refundBoundaryReady
        ? "上线前结合真实支付平台规则复核退款入口、客服邮箱和异常订单补偿策略。"
        : "在用户协议或单独售后说明中补齐退款条件、未到账处理、重复扣款、异常订单和客服联系方式。",
      evidence: "付费页、用户协议或售后说明中能看到退款边界、未到账处理和客服入口。",
      routes: ["/member", "/legal/terms"],
    },
    {
      id: "legal_review_archive",
      order: 9,
      title: "最终法务复核与证据归档",
      status: worstStatus([
        planStatusFromExternal(legalReview),
        complianceStatus(legalReviewItem),
      ]),
      owner: "创始人 / 法务 / 运营",
      detail: [
        externalDetail(legalReview),
        legalReviewItem?.detail ?? "法务复核未核对。",
      ].join("；"),
      action:
        legalReview?.status === "ready"
          ? "把最终协议版本、复核记录、平台回执和截图归档到上线证据。"
          : "完成协议、免责声明、隐私披露、图片授权和退款说明的最终复核，并在外部事项中留下证据。",
      evidence: "外部事项 legal_review 标记完成；上线证据归档包含最终协议版本、复核备注和截图/回执。",
      routes: ["/admin/health", "/api/admin/launch/evidence"],
      externalIds: ["legal_review"],
    },
  ] satisfies LaunchCompliancePlanStep[];

  return steps;
}

export async function getLaunchCompliancePlan(input?: LaunchCompliancePlanInput) {
  const [compliance, externalReadiness, callbacks] = await Promise.all([
    input?.compliance ?? getLaunchComplianceChecklist(),
    input?.externalReadiness ?? getLaunchExternalReadiness(),
    input?.callbacks ?? getLaunchCallbackChecklist(),
  ]);
  const applicationPack =
    input?.applicationPack ??
    (await getLaunchApplicationPack({
      callbacks,
    }));
  const refundBoundaryReady = hasRefundBoundary();
  const steps = buildSteps({
    compliance,
    externalReadiness,
    applicationPack,
    refundBoundaryReady,
  }).sort((a, b) => a.order - b.order);
  const baseSummary = summarize(steps);
  const status = planStatus(baseSummary);
  const label = labelForStatus(status, baseSummary);
  const entityStep = steps.find((step) => step.id === "entity_path");
  const icpStep = steps.find((step) => step.id === "domain_icp");
  const paymentStep = steps.find((step) => step.id === "payment_subjects");
  const legalDocsStep = steps.find((step) => step.id === "legal_documents");
  const summary = {
    ...baseSummary,
    entityReady: entityStep?.status === "ready",
    icpReady: icpStep?.status === "ready",
    paymentSubjectsReady: paymentStep?.status === "ready",
    legalDocsReady: legalDocsStep?.status === "ready",
    refundBoundaryReady,
  };
  const subjectEntity = externalReadiness.items.find((item) => item.id === "entity");
  const subjectIcp = externalReadiness.items.find((item) => item.id === "icp");

  return {
    generatedAt: new Date().toISOString(),
    status,
    label,
    detail:
      status === "ready"
        ? "主体、备案、协议、支付主体、图片授权、退款边界和法务留证均已闭合。"
        : "真实收费上线前，需要把现实主体资质、支付平台开户、ICP备案、协议版本和图片授权证据落到同一条链路。",
    action:
      status === "blocking"
        ? "先处理主体路径、正式域名/备案、支付主体一致和最终法务复核这些阻断步骤。"
        : status === "warning"
          ? "复核退款口径、隐私供应商披露和最终协议证据，再进入小额真实订单。"
          : "归档最终证据，并把该计划作为小额真实订单前的合规放行记录。",
    version: legalVersion,
    summary,
    subject: {
      entityStatus: subjectEntity ? externalReadinessStatusLabel(subjectEntity.status) : "未登记",
      icpStatus: subjectIcp ? externalReadinessStatusLabel(subjectIcp.status) : "未登记",
      appUrl: callbacks.appUrl,
      legalVersion,
    },
    steps,
    nextSteps: steps.filter((step) => step.status !== "ready").slice(0, 6),
    commandGroups: [
      {
        title: "主体与备案先行",
        when: "你处理公司/个体工商户、域名和备案时使用。",
        commands: [
          {
            label: "确定主体",
            command: "COMPANY_NAME=<公司或个体工商户全称>",
            detail: "该名称后续必须同时出现在协议、备案、支付宝和微信支付材料中。",
          },
          {
            label: "备案通过后",
            command: "APP_URL=https://<正式域名>  ICP_RECORD_NO=<备案号>",
            detail: "正式域名和备案号会解锁协议链接、支付回调和平台申请材料。",
          },
        ],
      },
      {
        title: "支付平台开户前",
        when: "提交支付宝/微信支付申请前使用。",
        commands: [
          {
            label: "核对协议入口",
            command: `${callbacks.appUrl}/legal/terms  ${callbacks.appUrl}/legal/privacy`,
            detail: "服务协议和隐私政策链接必须是正式 HTTPS，且主体名称一致。",
          },
          {
            label: "核对支付回调",
            command: `${callbacks.appUrl}/api/payments/alipay/notify  ${callbacks.appUrl}/api/payments/wechat/notify`,
            detail: "两个回调地址应与平台应用或商户后台配置一致。",
          },
        ],
      },
      {
        title: "上线前留证",
        when: "进入小额真实订单前使用。",
        commands: [
          {
            label: "更新外部事项",
            command: "/admin/health -> 外部上线事项",
            detail: "保存主体、备案、支付宝、微信支付和法务复核的目标日、回执、证据链接和备注。",
          },
          {
            label: "归档证据",
            command: "/admin/health -> 上线证据归档",
            detail: "归档最终协议版本、平台回执、回调配置截图和法务复核备注。",
          },
        ],
      },
    ],
    evidence: [
      "主体证照或个体工商户登记信息",
      "正式域名、HTTPS 证书和 ICP 备案通过记录",
      "支付宝应用和微信支付商户主体截图或审核回执",
      "用户协议、隐私政策、免责声明和上传授权最终版本",
      "退款/客服/异常订单说明",
      "法务复核记录与上线证据归档",
    ],
    copyText: buildCopyText({
      status,
      label,
      appUrl: callbacks.appUrl,
      steps,
    }),
  } satisfies LaunchCompliancePlan;
}
