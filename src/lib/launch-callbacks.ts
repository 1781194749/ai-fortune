import "server-only";

import type { HealthStatus } from "@/lib/health-checks";

type Env = Record<string, string | undefined>;

export type LaunchCallbackItem = {
  id: string;
  group: string;
  title: string;
  status: HealthStatus;
  requiredForLaunch: boolean;
  implemented: boolean;
  platform: string;
  configName: string;
  value: string;
  method?: string;
  detail: string;
  action: string;
  evidence: string;
};

export type LaunchCallbackChecklist = {
  generatedAt: string;
  appUrl: string;
  status: HealthStatus;
  label: string;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
  };
  items: LaunchCallbackItem[];
  nextItems: LaunchCallbackItem[];
  copyText: string;
};

function rawAppUrl(env: Env) {
  return (env.APP_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");
}

function isPlaceholder(value: string) {
  const normalized = value.toLowerCase();

  return (
    normalized.includes("<") ||
    normalized.includes(">") ||
    normalized.includes("your-domain") ||
    normalized.includes("example.")
  );
}

function isLocalUrl(value: string) {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(value);
}

function appUrlStatus(appUrl: string): HealthStatus {
  if (!appUrl.startsWith("https://") || isLocalUrl(appUrl) || isPlaceholder(appUrl)) {
    return "blocking";
  }

  return "ready";
}

function hostname(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return value.replace(/^https?:\/\//, "").split("/")[0] || value;
  }
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

function summarize(items: LaunchCallbackItem[]) {
  return {
    ready: items.filter((item) => item.status === "ready").length,
    warning: items.filter((item) => item.status === "warning").length,
    blocking: items.filter((item) => item.status === "blocking").length,
    total: items.length,
  };
}

function checklistStatus(summary: ReturnType<typeof summarize>): HealthStatus {
  if (summary.blocking > 0) {
    return "blocking";
  }

  if (summary.warning > 0) {
    return "warning";
  }

  return "ready";
}

function checklistLabel(status: HealthStatus, summary: ReturnType<typeof summarize>) {
  if (status === "blocking") {
    return `第三方配置有 ${summary.blocking} 个阻断项`;
  }

  if (status === "warning") {
    return `第三方配置有 ${summary.warning} 个待复核项`;
  }

  return "第三方配置清单已就绪";
}

function itemStatus(input: {
  baseStatus: HealthStatus;
  requiredForLaunch: boolean;
  implemented: boolean;
  enabled?: boolean;
}) {
  if (!input.implemented) {
    return input.enabled ? "blocking" : "warning";
  }

  if (input.requiredForLaunch && input.baseStatus === "blocking") {
    return "blocking";
  }

  if (!input.requiredForLaunch && input.baseStatus === "blocking") {
    return "warning";
  }

  return "ready";
}

function buildCopyText(input: {
  label: string;
  status: HealthStatus;
  appUrl: string;
  items: LaunchCallbackItem[];
}) {
  const lines = input.items.map((item, index) => {
    const required = item.requiredForLaunch ? "必填" : "预留";

    return `${index + 1}. [${required}] ${item.platform} / ${item.configName}: ${item.value}`;
  });

  return [
    "玄机 AI 第三方回调配置清单",
    `APP_URL：${input.appUrl}`,
    `状态：${input.label} (${input.status})`,
    "",
    ...lines,
  ].join("\n");
}

export function getLaunchCallbackChecklist(env: Env = process.env) {
  const appUrl = rawAppUrl(env);
  const baseStatus = appUrlStatus(appUrl);
  const domain = hostname(appUrl);
  const wechatLoginEnabled = env.AUTH_WECHAT_ENABLED === "true";
  const items = [
    {
      id: "app:base-url",
      group: "基础域名",
      title: "正式站点域名",
      requiredForLaunch: true,
      implemented: true,
      platform: "部署平台 / 域名服务商",
      configName: "APP_URL",
      value: appUrl,
      detail: "所有支付通知、公开分享、协议链接和平台申请材料都依赖正式 HTTPS 域名。",
      action: "配置正式 HTTPS 域名，不能使用 localhost、占位域名或 HTTP。",
      evidence: "首页、登录页、会员页和公开分享页均可通过 APP_URL 访问。",
      status: itemStatus({ baseStatus, requiredForLaunch: true, implemented: true }),
    },
    {
      id: "alipay:notify-url",
      group: "支付宝",
      title: "支付宝异步通知地址",
      requiredForLaunch: true,
      implemented: true,
      platform: "支付宝开放平台",
      configName: "异步通知地址 notify_url",
      value: `${appUrl}/api/payments/alipay/notify`,
      method: "POST",
      detail: "支付宝支付成功后通过该地址通知服务端，服务端验签后发放会员或星力。",
      action: "在支付宝应用中配置该 notify_url，并确认生产环境可公网访问。",
      evidence: "支付宝诊断通过；小额订单支付后订单变为已支付且权益到账。",
      status: itemStatus({ baseStatus, requiredForLaunch: true, implemented: true }),
    },
    {
      id: "alipay:return-url",
      group: "支付宝",
      title: "支付宝同步返回地址",
      requiredForLaunch: true,
      implemented: true,
      platform: "支付宝开放平台",
      configName: "同步返回地址 return_url",
      value: `${appUrl}/member`,
      method: "GET",
      detail: "浏览器支付完成后返回会员中心，最终支付状态仍以异步通知为准。",
      action: "在支付宝应用或支付请求中保持 return_url 指向会员中心。",
      evidence: "用户支付完成后能回到会员中心并看到权益状态。",
      status: itemStatus({ baseStatus, requiredForLaunch: true, implemented: true }),
    },
    {
      id: "wechat-pay:notify-url",
      group: "微信支付",
      title: "微信支付通知地址",
      requiredForLaunch: true,
      implemented: true,
      platform: "微信支付商户平台",
      configName: "支付通知地址 notify_url",
      value: `${appUrl}/api/payments/wechat/notify`,
      method: "POST",
      detail: "微信支付 Native 支付成功后通过该地址通知服务端，服务端验签后发放权益。",
      action: "在微信支付商户平台配置该通知地址，并确认平台公钥和 API v3 key 已配置。",
      evidence: "微信支付诊断通过；扫码支付回调后订单、钱包流水和会员权益一致。",
      status: itemStatus({ baseStatus, requiredForLaunch: true, implemented: true }),
    },
    {
      id: "wechat-open:domain",
      group: "微信开放平台",
      title: "微信网站应用授权回调域",
      requiredForLaunch: false,
      implemented: false,
      platform: "微信开放平台",
      configName: "授权回调域",
      value: domain,
      detail: "第一版以 Google 邮箱登录承接，微信扫码登录为预留能力；当前仓库尚未实现微信 OAuth 回调 route。",
      action: "微信开放平台通过后再实现扫码登录回调，并开启 AUTH_WECHAT_ENABLED=true。",
      evidence: "微信扫码登录能创建或恢复同一用户，Google 登录仍可作为主入口。",
      status: itemStatus({
        baseStatus,
        requiredForLaunch: false,
        implemented: false,
        enabled: wechatLoginEnabled,
      }),
    },
    {
      id: "qiniu:cors-origin",
      group: "七牛云",
      title: "七牛 CORS 来源",
      requiredForLaunch: true,
      implemented: true,
      platform: "七牛云对象存储",
      configName: "CORS 允许来源",
      value: appUrl,
      detail: "浏览器直传手相图片需要七牛 bucket 允许正式站点跨域上传。",
      action: "在七牛 bucket CORS 中允许正式 APP_URL 来源，并允许上传所需请求头。",
      evidence: "浏览器可从正式站点上传手相图片，ImageUpload 记录保存成功。",
      status: itemStatus({ baseStatus, requiredForLaunch: true, implemented: true }),
    },
    {
      id: "qiniu:public-domain",
      group: "七牛云",
      title: "七牛公开访问域名",
      requiredForLaunch: true,
      implemented: true,
      platform: "七牛云对象存储",
      configName: "公开图片域名",
      value: env.QINIU_PUBLIC_DOMAIN?.trim() || "未配置",
      detail: "手相视觉模型需要读取公开图片 URL，本地 mock URL 不适合真实收费。",
      action: "绑定七牛 HTTPS 公开域名，并写入 QINIU_PUBLIC_DOMAIN。",
      evidence: "上传后的图片 URL 可公网访问，手相视觉报告可读取图片。",
      status:
        env.QINIU_PUBLIC_DOMAIN?.trim() && env.QINIU_PUBLIC_DOMAIN.startsWith("https://")
          ? "ready"
          : "warning",
    },
    {
      id: "legal:terms",
      group: "协议材料",
      title: "用户协议链接",
      requiredForLaunch: true,
      implemented: true,
      platform: "微信 / 支付宝 / 备案材料",
      configName: "服务协议 URL",
      value: `${appUrl}/legal/terms`,
      method: "GET",
      detail: "平台申请和用户支付前需要可访问的服务协议链接。",
      action: "主体和备案号确定后同步协议内容，并确保链接公网可访问。",
      evidence: "协议页展示主体、备案和联系方式，且与支付申请主体一致。",
      status: itemStatus({ baseStatus, requiredForLaunch: true, implemented: true }),
    },
    {
      id: "legal:privacy",
      group: "协议材料",
      title: "隐私政策链接",
      requiredForLaunch: true,
      implemented: true,
      platform: "微信 / 支付宝 / 备案材料",
      configName: "隐私政策 URL",
      value: `${appUrl}/legal/privacy`,
      method: "GET",
      detail: "微信开放平台、支付平台和图片上传授权都会要求隐私政策可访问。",
      action: "主体、联系方式和模型供应商披露确定后同步隐私政策。",
      evidence: "隐私政策页面可访问，内容覆盖账号、图片、AI 模型和支付数据处理。",
      status: itemStatus({ baseStatus, requiredForLaunch: true, implemented: true }),
    },
  ] satisfies LaunchCallbackItem[];
  const summary = summarize(items);
  const status = checklistStatus(summary);
  const label = checklistLabel(status, summary);
  const sortedItems = [...items].sort(
    (a, b) =>
      statusRank(a.status) - statusRank(b.status) ||
      a.group.localeCompare(b.group, "zh-CN") ||
      a.title.localeCompare(b.title, "zh-CN"),
  );
  const nextItems = sortedItems.filter((item) => item.status !== "ready").slice(0, 8);

  return {
    generatedAt: new Date().toISOString(),
    appUrl,
    status,
    label,
    summary,
    items: sortedItems,
    nextItems,
    copyText: buildCopyText({ label, status, appUrl, items: sortedItems }),
  } satisfies LaunchCallbackChecklist;
}
