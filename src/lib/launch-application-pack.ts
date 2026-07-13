import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  getLaunchCallbackChecklist,
  type LaunchCallbackChecklist,
  type LaunchCallbackItem,
} from "@/lib/launch-callbacks";
import {
  getLaunchFounderDossier,
  type LaunchFounderDossier,
} from "@/lib/launch-founder-dossier";
import {
  getLaunchMaterialPack,
  type LaunchMaterialItem,
  type LaunchMaterialPack,
} from "@/lib/launch-materials";
import { brand } from "@/lib/site";

export type LaunchApplicationPlatformId =
  | "icp"
  | "alipay"
  | "wechat_pay"
  | "wechat_open"
  | "qiniu"
  | "openai";

export type LaunchApplicationField = {
  label: string;
  value: string;
  status: HealthStatus;
  source: string;
  action: string;
};

export type LaunchApplicationPlatform = {
  id: LaunchApplicationPlatformId;
  title: string;
  owner: string;
  status: HealthStatus;
  label: string;
  purpose: string;
  officialUrl: string;
  fields: LaunchApplicationField[];
  envKeys: string[];
  evidence: string[];
  submission: {
    statusLabel?: string;
    targetDate?: string;
    receiptNo?: string;
    evidenceUrl?: string;
    evidenceNote?: string;
    note?: string;
    evidence: string[];
  };
  nextAction: string;
};

export type LaunchApplicationPack = {
  generatedAt: string;
  status: HealthStatus;
  label: string;
  detail: string;
  action: string;
  appUrl: string;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
    fields: number;
    envKeys: number;
    receipts: number;
    evidenceLinks: number;
  };
  platforms: LaunchApplicationPlatform[];
  nextPlatforms: LaunchApplicationPlatform[];
  copyText: string;
};

type LaunchApplicationPackInput = {
  callbacks?: LaunchCallbackChecklist;
  materials?: LaunchMaterialPack;
  founderDossier?: LaunchFounderDossier;
};

type LaunchApplicationPlatformTemplate = Omit<
  LaunchApplicationPlatform,
  "status" | "label" | "submission"
> & {
  sourceStatus: HealthStatus;
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

function itemById(callbacks: LaunchCallbackChecklist) {
  return new Map(callbacks.items.map((item) => [item.id, item]));
}

function materialById(materials: LaunchMaterialPack) {
  return new Map(materials.items.map((item) => [item.id, item]));
}

function fieldFromCallback(
  callback: LaunchCallbackItem | undefined,
  fallback: {
    label: string;
    value: string;
    source: string;
    action: string;
  },
): LaunchApplicationField {
  if (!callback) {
    return {
      ...fallback,
      status: "warning",
    };
  }

  return {
    label: callback.configName,
    value: callback.value,
    status: callback.status,
    source: callback.platform,
    action: callback.action,
  };
}

function manualField(input: LaunchApplicationField) {
  return input;
}

function platformStatus(fields: LaunchApplicationField[], fallbackStatus: HealthStatus) {
  if (fields.some((field) => field.status === "blocking") || fallbackStatus === "blocking") {
    return "blocking";
  }

  if (fields.some((field) => field.status === "warning") || fallbackStatus === "warning") {
    return "warning";
  }

  return "ready";
}

function labelForStatus(status: HealthStatus) {
  if (status === "ready") {
    return "申请材料可提交";
  }

  if (status === "warning") {
    return "申请材料待复核";
  }

  return "申请材料阻断";
}

function safeHostname(appUrl: string) {
  try {
    return new URL(appUrl).hostname;
  } catch {
    return appUrl.replace(/^https?:\/\//, "").split("/")[0] || appUrl;
  }
}

function officialUrl(input: LaunchFounderDossier, keyword: string, fallback: string) {
  return input.officialRefs.find((ref) => ref.title.includes(keyword))?.url ?? fallback;
}

function uniqueText(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function submissionFromMaterial(material: LaunchMaterialItem | undefined) {
  const evidence = uniqueText([
    material?.evidenceNote ? `证据备注：${material.evidenceNote}` : undefined,
    material?.receiptNo ? `提交回执：${material.receiptNo}` : undefined,
    material?.evidenceUrl ? `证据链接：${material.evidenceUrl}` : undefined,
  ]);

  return {
    statusLabel: material?.statusLabel,
    targetDate: material?.targetDate,
    receiptNo: material?.receiptNo,
    evidenceUrl: material?.evidenceUrl,
    evidenceNote: material?.evidenceNote,
    note: material?.note,
    evidence,
  } satisfies LaunchApplicationPlatform["submission"];
}

function buildPlatforms(input: {
  callbacks: LaunchCallbackChecklist;
  materials: LaunchMaterialPack;
  founderDossier: LaunchFounderDossier;
}) {
  const callbacks = itemById(input.callbacks);
  const materials = materialById(input.materials);
  const appUrl = input.callbacks.appUrl;
  const termsUrl = `${appUrl}/legal/terms`;
  const privacyUrl = `${appUrl}/legal/privacy`;
  const disclaimerUrl = `${appUrl}/legal/disclaimer`;
  const uploadConsentUrl = `${appUrl}/legal/upload-consent`;
  const commonFields = [
    manualField({
      label: "网站名称",
      value: brand.cn,
      status: "ready",
      source: "站点配置",
      action: "平台申请名称建议与品牌保持一致。",
    }),
    manualField({
      label: "英文名称",
      value: brand.en,
      status: "ready",
      source: "站点配置",
      action: "海外预留和 OpenAI 项目命名可使用该名称。",
    }),
    manualField({
      label: "网站简介",
      value: brand.description,
      status: "ready",
      source: "站点配置",
      action: "申请材料中如需产品描述，可使用该简介并补充娱乐参考边界。",
    }),
  ];
  const legalFields = [
    fieldFromCallback(callbacks.get("legal:terms"), {
      label: "服务协议 URL",
      value: termsUrl,
      source: "协议页面",
      action: "正式域名配置后填入平台申请材料。",
    }),
    fieldFromCallback(callbacks.get("legal:privacy"), {
      label: "隐私政策 URL",
      value: privacyUrl,
      source: "协议页面",
      action: "正式域名配置后填入平台申请材料。",
    }),
  ];

  const platformTemplates = [
    {
      id: "icp",
      title: "ICP备案材料",
      owner: materials.get("icp")?.owner ?? "运营 / 法务",
      purpose: "让中文 Web 站点具备国内正式访问和备案展示条件。",
      officialUrl: officialUrl(input.founderDossier, "ICP", "https://beian.miit.gov.cn/"),
      sourceStatus: materials.get("icp")?.healthStatus ?? "blocking",
      fields: [
        ...commonFields,
        manualField({
          label: "网站首页 URL",
          value: appUrl,
          status: callbacks.get("app:base-url")?.status ?? "blocking",
          source: "APP_URL",
          action: "备案前确认正式 HTTPS 域名和接入服务商。",
        }),
        ...legalFields,
        manualField({
          label: "免责声明 URL",
          value: disclaimerUrl,
          status: callbacks.get("app:base-url")?.status ?? "blocking",
          source: "协议页面",
          action: "备案与协议材料保持同一主体名称和联系方式。",
        }),
      ],
      envKeys: materials.get("icp")?.envKeys ?? ["COMPANY_NAME", "ICP_RECORD_NO", "APP_URL"],
      evidence: materials.get("icp")?.verification ?? ["备案号与主体信息一致。"],
      nextAction: materials.get("icp")?.currentAction ?? "完成主体和域名后提交备案。",
    },
    {
      id: "alipay",
      title: "支付宝开放平台应用",
      owner: materials.get("alipay")?.owner ?? "财务 / 技术",
      purpose: "申请电脑网站支付能力，用于 Web 会员和深度报告收费。",
      officialUrl: officialUrl(input.founderDossier, "支付宝", "https://open.alipay.com/"),
      sourceStatus: materials.get("alipay")?.healthStatus ?? "blocking",
      fields: [
        ...commonFields,
        ...legalFields,
        fieldFromCallback(callbacks.get("alipay:notify-url"), {
          label: "异步通知地址 notify_url",
          value: `${appUrl}/api/payments/alipay/notify`,
          source: "支付回调",
          action: "配置到支付宝应用并确认公网可访问。",
        }),
        fieldFromCallback(callbacks.get("alipay:return-url"), {
          label: "同步返回地址 return_url",
          value: `${appUrl}/member`,
          source: "支付回调",
          action: "支付完成后返回会员中心。",
        }),
      ],
      envKeys: materials.get("alipay")?.envKeys ?? [
        "ALIPAY_ENABLED",
        "ALIPAY_APP_ID",
        "ALIPAY_PRIVATE_KEY",
        "ALIPAY_PUBLIC_KEY",
      ],
      evidence: materials.get("alipay")?.verification ?? ["小额订单支付成功并发放权益。"],
      nextAction: materials.get("alipay")?.currentAction ?? "创建支付宝应用并配置密钥和回调。",
    },
    {
      id: "wechat_pay",
      title: "微信支付商户号",
      owner: materials.get("wechat_pay")?.owner ?? "财务 / 技术",
      purpose: "申请微信 Native 支付能力，用于国内扫码支付场景。",
      officialUrl: officialUrl(input.founderDossier, "微信支付", "https://pay.weixin.qq.com/"),
      sourceStatus: materials.get("wechat_pay")?.healthStatus ?? "blocking",
      fields: [
        ...commonFields,
        ...legalFields,
        fieldFromCallback(callbacks.get("wechat-pay:notify-url"), {
          label: "支付通知地址 notify_url",
          value: `${appUrl}/api/payments/wechat/notify`,
          source: "支付回调",
          action: "配置到微信支付商户平台并确认验签配置。",
        }),
      ],
      envKeys: materials.get("wechat_pay")?.envKeys ?? [
        "WECHAT_PAY_ENABLED",
        "WECHAT_PAY_MCH_ID",
        "WECHAT_PAY_API_V3_KEY",
        "WECHAT_PAY_PRIVATE_KEY",
      ],
      evidence: materials.get("wechat_pay")?.verification ?? ["扫码支付回调后订单和权益一致。"],
      nextAction: materials.get("wechat_pay")?.currentAction ?? "完成微信支付商户申请和支付产品开通。",
    },
    {
      id: "wechat_open",
      title: "微信开放平台网站应用",
      owner: materials.get("wechat_open")?.owner ?? "运营 / 技术",
      purpose: "预留微信扫码登录能力，降低中文站登录阻力。",
      officialUrl: officialUrl(input.founderDossier, "微信开放平台", "https://open.weixin.qq.com/"),
      sourceStatus: materials.get("wechat_open")?.healthStatus ?? "blocking",
      fields: [
        ...commonFields,
        ...legalFields,
        fieldFromCallback(callbacks.get("wechat-open:domain"), {
          label: "授权回调域",
          value: safeHostname(appUrl),
          source: "APP_URL",
          action: "微信开放平台应用通过后再实现 OAuth 回调。",
        }),
      ],
      envKeys: materials.get("wechat_open")?.envKeys ?? [
        "AUTH_WECHAT_ENABLED",
        "WECHAT_APP_ID",
        "WECHAT_APP_SECRET",
      ],
      evidence: materials.get("wechat_open")?.verification ?? ["微信扫码登录可创建或恢复账号。"],
      nextAction: materials.get("wechat_open")?.currentAction ?? "创建微信开放平台网站应用。",
    },
    {
      id: "qiniu",
      title: "七牛云对象存储",
      owner: materials.get("qiniu")?.owner ?? "技术 / 运维",
      purpose: "支撑手相图片上传、公开访问和视觉模型读取。",
      officialUrl: officialUrl(input.founderDossier, "七牛", "https://developer.qiniu.com/kodo"),
      sourceStatus: materials.get("qiniu")?.healthStatus ?? "blocking",
      fields: [
        fieldFromCallback(callbacks.get("qiniu:cors-origin"), {
          label: "CORS 允许来源",
          value: appUrl,
          source: "七牛 CORS",
          action: "允许正式站点来源直传图片。",
        }),
        fieldFromCallback(callbacks.get("qiniu:public-domain"), {
          label: "公开图片域名",
          value: "未配置",
          source: "QINIU_PUBLIC_DOMAIN",
          action: "绑定 HTTPS 图片域名并写入生产变量。",
        }),
        manualField({
          label: "上传授权页面",
          value: uploadConsentUrl,
          status: callbacks.get("app:base-url")?.status ?? "blocking",
          source: "协议页面",
          action: "图片上传前授权与七牛存储说明保持一致。",
        }),
      ],
      envKeys: materials.get("qiniu")?.envKeys ?? [
        "QINIU_ACCESS_KEY",
        "QINIU_SECRET_KEY",
        "QINIU_BUCKET",
        "QINIU_PUBLIC_DOMAIN",
      ],
      evidence: materials.get("qiniu")?.verification ?? ["手相图片上传后公开 URL 可访问。"],
      nextAction: materials.get("qiniu")?.currentAction ?? "创建 bucket 并配置公开域名和 CORS。",
    },
    {
      id: "openai",
      title: "OpenAI 项目与预算",
      owner: materials.get("openai")?.owner ?? "技术 / 产品",
      purpose: "支撑 AI 对话、视觉手相和深度报告模型调用。",
      officialUrl: "https://platform.openai.com/",
      sourceStatus: materials.get("openai")?.healthStatus ?? "blocking",
      fields: [
        manualField({
          label: "项目名称",
          value: brand.en,
          status: "ready",
          source: "站点配置",
          action: "建议单独创建生产项目，便于预算和用量隔离。",
        }),
        manualField({
          label: "用途说明",
          value: "AI fortune-telling companion for chat, tarot, BaZi, Bagua, palm image reading and paid reports.",
          status: "ready",
          source: "产品范围",
          action: "用途说明需避免承诺医疗、投资、法律等专业建议。",
        }),
        manualField({
          label: "隐私政策 URL",
          value: privacyUrl,
          status: callbacks.get("legal:privacy")?.status ?? "blocking",
          source: "协议页面",
          action: "模型供应商披露与隐私政策保持一致。",
        }),
      ],
      envKeys: materials.get("openai")?.envKeys ?? [
        "OPENAI_API_KEY",
        "OPENAI_DEFAULT_MODEL",
        "OPENAI_VISION_MODEL",
      ],
      evidence: materials.get("openai")?.verification ?? ["OpenAI 模型读取诊断通过。"],
      nextAction: materials.get("openai")?.currentAction ?? "创建生产 API Key 并配置预算。",
    },
  ] satisfies LaunchApplicationPlatformTemplate[];
  const platforms = platformTemplates.map((platform) => {
    const status = platformStatus(platform.fields, platform.sourceStatus);
    const material = materials.get(platform.id);
    const submission = submissionFromMaterial(material);

    return {
      id: platform.id,
      title: platform.title,
      owner: platform.owner,
      status,
      label: labelForStatus(status),
      purpose: platform.purpose,
      officialUrl: platform.officialUrl,
      fields: platform.fields,
      envKeys: platform.envKeys,
      evidence: uniqueText([...platform.evidence, ...submission.evidence]),
      submission,
      nextAction: platform.nextAction,
    } satisfies LaunchApplicationPlatform;
  });

  return platforms;
}

function summarize(platforms: LaunchApplicationPlatform[]) {
  const fields = platforms.flatMap((platform) => platform.fields);
  const envKeys = Array.from(new Set(platforms.flatMap((platform) => platform.envKeys)));
  const receipts = platforms.filter((platform) => Boolean(platform.submission.receiptNo)).length;
  const evidenceLinks = platforms.filter((platform) => Boolean(platform.submission.evidenceUrl)).length;

  return {
    ready: platforms.filter((platform) => platform.status === "ready").length,
    warning: platforms.filter((platform) => platform.status === "warning").length,
    blocking: platforms.filter((platform) => platform.status === "blocking").length,
    total: platforms.length,
    fields: fields.length,
    envKeys: envKeys.length,
    receipts,
    evidenceLinks,
  };
}

function packStatus(summary: ReturnType<typeof summarize>) {
  if (summary.blocking > 0) {
    return {
      status: "blocking" as const,
      label: `平台申请材料有 ${summary.blocking} 个阻断平台`,
      detail: "正式域名、主体、协议链接、回调地址或平台材料仍未闭合，暂不能提交完整收费申请。",
      action: "先补齐 APP_URL、主体/备案和支付平台所需回调链接，再提交支付宝、微信支付和七牛配置。",
    };
  }

  if (summary.warning > 0) {
    return {
      status: "warning" as const,
      label: `平台申请材料有 ${summary.warning} 个待复核平台`,
      detail: "核心字段已基本齐备，但仍需复核预留登录、图片域名或模型预算等材料。",
      action: "复核待处理平台字段，保留申请截图后进入真实小额订单验收。",
    };
  }

  return {
    status: "ready" as const,
    label: "平台申请材料已可提交",
    detail: "备案、支付、存储、模型和登录相关申请字段均已闭合。",
    action: "提交或归档平台申请材料，并将回执、截图和密钥写入生产变量。",
  };
}

function buildCopyText(input: {
  status: HealthStatus;
  label: string;
  appUrl: string;
  platforms: LaunchApplicationPlatform[];
}) {
  const lines = input.platforms.flatMap((platform, platformIndex) => [
    "",
    `${platformIndex + 1}. [${platform.label}] ${platform.title} / ${platform.owner}`,
    `用途：${platform.purpose}`,
    `官方入口：${platform.officialUrl}`,
    "字段：",
    ...platform.fields.map((field) => `- [${field.status}] ${field.label}: ${field.value}`),
    platform.submission.statusLabel ? `外部状态：${platform.submission.statusLabel}` : "",
    platform.submission.targetDate ? `目标日期：${platform.submission.targetDate}` : "",
    platform.submission.receiptNo ? `提交回执：${platform.submission.receiptNo}` : "",
    platform.submission.evidenceUrl ? `证据链接：${platform.submission.evidenceUrl}` : "",
    platform.submission.evidenceNote ? `证据备注：${platform.submission.evidenceNote}` : "",
    `变量：${platform.envKeys.join("、") || "无"}`,
    `证据：${platform.evidence.join("；") || "平台申请提交截图、审核回执或控制台配置截图。"}`,
    `下一步：${platform.nextAction}`,
  ].filter(Boolean));

  return [
    "玄机 AI 平台申请材料包",
    `APP_URL：${input.appUrl}`,
    `状态：${input.label} (${input.status})`,
    ...lines,
  ].join("\n");
}

export async function getLaunchApplicationPack(input?: LaunchApplicationPackInput) {
  const [callbacks, materials] = await Promise.all([
    input?.callbacks ?? getLaunchCallbackChecklist(),
    input?.materials ?? getLaunchMaterialPack(),
  ]);
  const founderDossier =
    input?.founderDossier ??
    (await getLaunchFounderDossier({
      materials,
    }));
  const platforms = buildPlatforms({
    callbacks,
    materials,
    founderDossier,
  }).sort(
    (a, b) =>
      statusRank(a.status) - statusRank(b.status) ||
      a.title.localeCompare(b.title, "zh-CN"),
  );
  const summary = summarize(platforms);
  const status = packStatus(summary);

  return {
    generatedAt: new Date().toISOString(),
    ...status,
    appUrl: callbacks.appUrl,
    summary,
    platforms,
    nextPlatforms: platforms.filter((platform) => platform.status !== "ready").slice(0, 6),
    copyText: buildCopyText({
      status: status.status,
      label: status.label,
      appUrl: callbacks.appUrl,
      platforms,
    }),
  } satisfies LaunchApplicationPack;
}
