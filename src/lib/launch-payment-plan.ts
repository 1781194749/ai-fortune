import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  getIntegrationDiagnostics,
  type IntegrationDiagnostics,
  type IntegrationId,
  type IntegrationProbeItem,
} from "@/lib/integration-diagnostics";
import {
  getLaunchApplicationPack,
  type LaunchApplicationPack,
  type LaunchApplicationPlatform,
  type LaunchApplicationPlatformId,
} from "@/lib/launch-application-pack";
import {
  getLaunchCallbackChecklist,
  type LaunchCallbackChecklist,
  type LaunchCallbackItem,
} from "@/lib/launch-callbacks";
import {
  getLaunchExternalReadiness,
  type ExternalReadinessItemId,
  type ExternalReadinessItem,
  type LaunchExternalReadiness,
} from "@/lib/launch-external-readiness";
import {
  getLaunchPaymentAcceptance,
  type LaunchPaymentAcceptance,
  type LaunchPaymentAcceptanceChannel,
  type LaunchPaymentAcceptanceItem,
} from "@/lib/launch-payment-acceptance";
import type { LivePaymentChannel } from "@/lib/payment-adapters";

export type LaunchPaymentPlanStepId =
  | "application"
  | "credentials"
  | "diagnostics"
  | "callback_guard"
  | "callback"
  | "order"
  | "paid_callback"
  | "entitlement"
  | "reconciliation";

export type LaunchPaymentPlanStep = {
  id: string;
  stepId: LaunchPaymentPlanStepId;
  channelId: LivePaymentChannel;
  channelLabel: string;
  order: number;
  title: string;
  status: HealthStatus;
  owner: string;
  detail: string;
  action: string;
  evidence: string;
  commands?: string[];
};

export type LaunchPaymentPlanChannel = {
  id: LivePaymentChannel;
  label: string;
  status: HealthStatus;
  enabled: boolean;
  missingFields: string[];
  applicationStatus: HealthStatus;
  diagnosticStatus: HealthStatus;
  orderCount: number;
  paidOrderCount: number;
  nextStep?: LaunchPaymentPlanStep;
  steps: LaunchPaymentPlanStep[];
};

export type LaunchPaymentPlanCommand = {
  label: string;
  command: string;
  detail: string;
};

export type LaunchPaymentPlanCommandGroup = {
  title: string;
  when: string;
  commands: LaunchPaymentPlanCommand[];
};

export type LaunchPaymentPlan = {
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
    readyChannels: number;
    configuredChannels: number;
    paidLiveOrders: number;
  };
  payment: {
    mode: string;
    devBypassEnabled: boolean;
    preferredChannel: string;
    appUrl: string;
  };
  channels: LaunchPaymentPlanChannel[];
  nextSteps: LaunchPaymentPlanStep[];
  commandGroups: LaunchPaymentPlanCommandGroup[];
  evidence: string[];
  copyText: string;
};

type LaunchPaymentPlanInput = {
  paymentAcceptance?: LaunchPaymentAcceptance;
  applicationPack?: LaunchApplicationPack;
  callbacks?: LaunchCallbackChecklist;
  integrationDiagnostics?: IntegrationDiagnostics;
  externalReadiness?: LaunchExternalReadiness;
};

const channelMeta = {
  alipay: {
    label: "支付宝",
    owner: "财务 / 技术",
    applicationId: "alipay",
    externalId: "alipay",
    callbackId: "alipay:notify-url",
    diagnosticId: "alipay",
    envKeys: ["ALIPAY_ENABLED", "ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY", "ALIPAY_PUBLIC_KEY"],
    checkoutCommand:
      'fetch("/api/payments/live/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: "alipay", productCode: "trial" }) })',
  },
  wechat_pay: {
    label: "微信支付",
    owner: "财务 / 技术",
    applicationId: "wechat_pay",
    externalId: "wechat_pay",
    callbackId: "wechat-pay:notify-url",
    diagnosticId: "wechat_pay",
    envKeys: [
      "WECHAT_PAY_ENABLED",
      "WECHAT_PAY_MCH_ID",
      "WECHAT_PAY_API_V3_KEY",
      "WECHAT_PAY_PRIVATE_KEY",
      "WECHAT_PAY_SERIAL_NO",
      "WECHAT_PAY_PLATFORM_PUBLIC_KEY",
    ],
    checkoutCommand:
      'fetch("/api/payments/live/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: "wechat_pay", productCode: "trial" }) })',
  },
} satisfies Record<
  LivePaymentChannel,
  {
    label: string;
    owner: string;
    applicationId: LaunchApplicationPlatformId;
    externalId: ExternalReadinessItemId;
    callbackId: string;
    diagnosticId: IntegrationId;
    envKeys: string[];
    checkoutCommand: string;
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

function worstStatus(statuses: HealthStatus[]) {
  return statuses.sort((a, b) => statusRank(a) - statusRank(b))[0] ?? "ready";
}

function statusLabel(status: HealthStatus) {
  if (status === "ready") {
    return "已完成";
  }

  if (status === "blocking") {
    return "阻断";
  }

  return "需复核";
}

function summarize(steps: LaunchPaymentPlanStep[], channels: LaunchPaymentPlanChannel[]) {
  return {
    ready: steps.filter((step) => step.status === "ready").length,
    warning: steps.filter((step) => step.status === "warning").length,
    blocking: steps.filter((step) => step.status === "blocking").length,
    total: steps.length,
    readyChannels: channels.filter((channel) => channel.status === "ready").length,
    configuredChannels: channels.filter((channel) => channel.enabled && channel.missingFields.length === 0)
      .length,
    paidLiveOrders: channels.reduce((sum, channel) => sum + channel.paidOrderCount, 0),
  };
}

function platformById(applicationPack: LaunchApplicationPack) {
  return new Map(applicationPack.platforms.map((platform) => [platform.id, platform]));
}

function callbackById(callbacks: LaunchCallbackChecklist) {
  return new Map(callbacks.items.map((callback) => [callback.id, callback]));
}

function diagnosticById(integrationDiagnostics: IntegrationDiagnostics) {
  return new Map(integrationDiagnostics.items.map((item) => [item.id, item]));
}

function externalById(externalReadiness: LaunchExternalReadiness) {
  return new Map(externalReadiness.items.map((item) => [item.id, item]));
}

function itemBySuffix(channel: LaunchPaymentAcceptanceChannel, suffix: string) {
  return channel.items.find((item) => item.id === `${channel.id}:${suffix}`);
}

function applicationDetail(input: {
  platform?: LaunchApplicationPlatform;
  external?: ExternalReadinessItem;
}) {
  const pieces = [
    input.platform ? `${input.platform.title}：${input.platform.label}` : undefined,
    input.platform?.submission.statusLabel
      ? `外部状态：${input.platform.submission.statusLabel}`
      : undefined,
    input.platform?.submission.receiptNo ? `回执：${input.platform.submission.receiptNo}` : undefined,
    input.external?.targetDate ? `目标日期：${input.external.targetDate}` : undefined,
  ];

  return pieces.filter(Boolean).join("；") || "支付平台申请材料尚未闭合。";
}

function fromAcceptanceItem(input: {
  stepId: LaunchPaymentPlanStepId;
  order: number;
  channel: LaunchPaymentAcceptanceChannel;
  item: LaunchPaymentAcceptanceItem | undefined;
  fallback: {
    title: string;
    status: HealthStatus;
    detail: string;
    action: string;
    evidence: string;
  };
}) {
  return {
    id: `${input.channel.id}:${input.stepId}`,
    stepId: input.stepId,
    channelId: input.channel.id,
    channelLabel: input.channel.label,
    order: input.order,
    title: input.item?.title ?? input.fallback.title,
    status: input.item?.status ?? input.fallback.status,
    owner: channelMeta[input.channel.id].owner,
    detail: input.item?.detail ?? input.fallback.detail,
    action: input.item?.action ?? input.fallback.action,
    evidence: input.item?.evidence ?? input.fallback.evidence,
  } satisfies LaunchPaymentPlanStep;
}

function buildChannel(input: {
  channel: LaunchPaymentAcceptanceChannel;
  platform?: LaunchApplicationPlatform;
  callback?: LaunchCallbackItem;
  diagnostic?: IntegrationProbeItem;
  external?: ExternalReadinessItem;
  devBypassEnabled: boolean;
}) {
  const applicationStatus = worstStatus([
    input.platform?.status ?? "blocking",
    input.external?.healthStatus ?? "blocking",
  ]);
  const diagnosticStatus = input.diagnostic?.status ?? "warning";
  const callbackStatus = input.callback?.status ?? "blocking";
  const steps = [
    {
      id: `${input.channel.id}:application`,
      stepId: "application",
      channelId: input.channel.id,
      channelLabel: input.channel.label,
      order: 1,
      title: "支付资质和平台应用",
      status: applicationStatus,
      owner: channelMeta[input.channel.id].owner,
      detail: applicationDetail({ platform: input.platform, external: input.external }),
      action:
        applicationStatus === "ready"
          ? "保留平台申请截图、回执和商户主体信息，进入生产参数配置。"
          : input.platform?.nextAction ?? input.external?.action ?? "先完成主体、支付商户和平台应用申请。",
      evidence:
        input.platform?.evidence.join("；") ||
        input.external?.evidenceNote ||
        input.external?.evidence ||
        "平台申请提交截图、审核通过截图、商户主体和回执编号。",
    },
    fromAcceptanceItem({
      stepId: "credentials",
      order: 2,
      channel: input.channel,
      item: itemBySuffix(input.channel, "config"),
      fallback: {
        title: "商户参数与生产开关",
        status: input.channel.enabled ? "warning" : "blocking",
        detail: input.channel.enabled ? "支付开关已开启，等待参数复核。" : "支付渠道尚未开启。",
        action: `写入 ${channelMeta[input.channel.id].envKeys.join("、")} 并重启生产应用。`,
        evidence: "生产环境变量脱敏截图和商户平台配置截图。",
      },
    }),
    {
      id: `${input.channel.id}:diagnostics`,
      stepId: "diagnostics",
      channelId: input.channel.id,
      channelLabel: input.channel.label,
      order: 3,
      title: "签名诊断",
      status: diagnosticStatus,
      owner: "技术",
      detail: input.diagnostic?.detail ?? "还没有该渠道的第三方诊断记录。",
      action: input.diagnostic?.action ?? "配置商户参数后运行第三方联调诊断。",
      evidence: "命令行支付检查和后台第三方诊断显示签名烟测通过，并写入 integration_probe。",
      commands: ["npm run launch:payment-check", "POST /api/admin/integrations/probe"],
    },
    {
      id: `${input.channel.id}:callback-guard`,
      stepId: "callback_guard",
      channelId: input.channel.id,
      channelLabel: input.channel.label,
      order: 4,
      title: "回调业务防护",
      status: input.devBypassEnabled ? "blocking" : "ready",
      owner: "技术",
      detail: input.devBypassEnabled
        ? "PAYMENT_CALLBACK_DEV_BYPASS 已开启，生产回调可能绕过真实验签与业务字段校验。"
        : "回调在验签后会校验订单渠道、应用/商户号和金额一致性；微信支付先解密 API v3 resource。",
      action: input.devBypassEnabled
        ? "生产环境关闭 PAYMENT_CALLBACK_DEV_BYPASS，并重新运行 launch:payment-check。"
        : "保留 markPaid 前的业务字段校验；小额订单时核对金额、平台交易号和权益到账。",
      evidence: "launch:payment-check 回调安全检查通过，微信支付 resource 解密烟测通过，生产变量关闭开发旁路。",
      commands: ["npm run launch:payment-check"],
    },
    {
      id: `${input.channel.id}:callback`,
      stepId: "callback",
      channelId: input.channel.id,
      channelLabel: input.channel.label,
      order: 5,
      title: "回调地址和正式域名",
      status: callbackStatus,
      owner: "技术 / 运维",
      detail: input.callback
        ? `${input.callback.platform} / ${input.callback.configName}: ${input.callback.value}`
        : "缺少支付回调配置项。",
      action: input.callback?.action ?? "配置正式 HTTPS APP_URL 后，把 notify_url 写入支付平台。",
      evidence: input.callback?.evidence ?? "支付平台回调地址截图和正式域名访问截图。",
    },
    fromAcceptanceItem({
      stepId: "order",
      order: 6,
      channel: input.channel,
      item: itemBySuffix(input.channel, "order-created"),
      fallback: {
        title: "小额真实订单创建",
        status: "blocking",
        detail: "当前没有真实支付订单。",
        action: "用内部账号在会员页创建一笔小额真实订单。",
        evidence: "Order(provider=ALIPAY/WECHAT_PAY) 中出现真实订单。",
      },
    }),
    fromAcceptanceItem({
      stepId: "paid_callback",
      order: 7,
      channel: input.channel,
      item: itemBySuffix(input.channel, "paid-callback"),
      fallback: {
        title: "支付成功回调",
        status: "blocking",
        detail: "当前没有 PAID 订单。",
        action: "完成真实支付并等待异步通知验签。",
        evidence: "Order.status=PAID、paidAt 和 providerOrderId。",
      },
    }),
    fromAcceptanceItem({
      stepId: "entitlement",
      order: 8,
      channel: input.channel,
      item: itemBySuffix(input.channel, "entitlement"),
      fallback: {
        title: "权益到账",
        status: "blocking",
        detail: "当前没有可核对权益的成功订单。",
        action: "完成会员商品支付后核对会员档位、星力和钱包流水。",
        evidence: "WalletTransaction(type=GRANT) 和会员中心权益截图。",
      },
    }),
    fromAcceptanceItem({
      stepId: "reconciliation",
      order: 9,
      channel: input.channel,
      item: itemBySuffix(input.channel, "reconciliation"),
      fallback: {
        title: "对账留证",
        status: "blocking",
        detail: "当前没有完整对账证据。",
        action: "补齐平台交易号、订单、钱包流水和支付平台交易详情。",
        evidence: "平台交易详情、站内订单和上线证据归档记录。",
      },
    }),
  ] satisfies LaunchPaymentPlanStep[];
  const status = worstStatus(steps.map((step) => step.status));

  return {
    id: input.channel.id,
    label: input.channel.label,
    status,
    enabled: input.channel.enabled,
    missingFields: input.channel.missingFields,
    applicationStatus,
    diagnosticStatus,
    orderCount: input.channel.orderCount,
    paidOrderCount: input.channel.paidOrderCount,
    nextStep: steps.find((step) => step.status !== "ready"),
    steps,
  } satisfies LaunchPaymentPlanChannel;
}

function planStatus(input: {
  paymentAcceptance: LaunchPaymentAcceptance;
  summary: LaunchPaymentPlan["summary"];
}) {
  if (
    input.paymentAcceptance.paymentMode !== "live" ||
    input.paymentAcceptance.devBypassEnabled ||
    input.summary.configuredChannels === 0 ||
    input.summary.readyChannels === 0 ||
    input.summary.blocking > 0
  ) {
    return "blocking" as const;
  }

  if (input.summary.warning > 0 || input.summary.readyChannels < 2) {
    return "warning" as const;
  }

  return "ready" as const;
}

function labelFor(status: HealthStatus, summary: LaunchPaymentPlan["summary"]) {
  if (status === "blocking") {
    return `真实支付未闭合：${summary.blocking} 个阻断步骤`;
  }

  if (status === "warning") {
    return `真实支付可小额复核：${summary.warning} 个待复核步骤`;
  }

  return "真实支付已可进入收费灰度";
}

function preferredChannel(channels: LaunchPaymentPlanChannel[]) {
  const ready = channels.find((channel) => channel.status === "ready");

  if (ready) {
    return ready.label;
  }

  const configured = channels.find((channel) => channel.enabled && channel.missingFields.length === 0);

  if (configured) {
    return configured.label;
  }

  return "先完成支付宝或微信支付任一渠道";
}

function detailFor(input: {
  status: HealthStatus;
  paymentAcceptance: LaunchPaymentAcceptance;
  preferredChannel: string;
}) {
  if (input.status === "ready") {
    return "支付宝和微信支付的资质、参数、回调、小额订单、权益到账和对账证据均已闭合。";
  }

  if (input.paymentAcceptance.paymentMode !== "live") {
    return `当前 PAYMENT_PROVIDER=${input.paymentAcceptance.paymentMode}，真实支付入口不会进入正式收款。`;
  }

  return `当前优先渠道：${input.preferredChannel}。先跑通一个渠道的小额真实订单，再补齐第二渠道。`;
}

function buildCommandGroups(channels: LaunchPaymentPlanChannel[], callbacks: LaunchCallbackChecklist) {
  return [
    {
      title: "生产支付变量",
      when: "商户审核通过并拿到密钥后配置。",
      commands: channels.map((channel) => ({
        label: channel.label,
        command: channelMeta[channel.id].envKeys.map((key) => `${key}=<value>`).join(" "),
        detail: "写入部署平台环境变量，密钥只保存脱敏截图，不提交代码仓库。",
      })),
    },
    {
      title: "命令行前置检查",
      when: "生产支付变量写入后、创建真实订单前执行。",
      commands: [
        {
          label: "支付配置与签名检查",
          command: "npm run launch:payment-check",
          detail: "检查 PAYMENT_PROVIDER、APP_URL、支付宝/微信支付参数、私钥签名能力和公钥格式。",
        },
      ],
    },
    {
      title: "支付平台回调",
      when: "正式 APP_URL 可访问后写入支付宝/微信支付控制台。",
      commands: channels.map((channel) => {
        const callbackId = channelMeta[channel.id].callbackId;
        const callback = callbacks.items.find((item) => item.id === callbackId);

        return {
          label: channel.label,
          command: callback?.value ?? `${callbacks.appUrl}/api/payments/${channel.id}/notify`,
          detail: callback?.action ?? "把 notify_url 写入支付平台并确认公网可访问。",
        };
      }),
    },
    {
      title: "小额订单烟测",
      when: "最终上线决策进入 paid_smoke 后，用内部账号执行。",
      commands: channels.map((channel) => ({
        label: channel.label,
        command: channelMeta[channel.id].checkoutCommand,
        detail: "创建小额真实订单后等待异步回调，再核对权益到账和平台交易号。",
      })),
    },
  ] satisfies LaunchPaymentPlanCommandGroup[];
}

function buildCopyText(input: {
  generatedAt: string;
  label: string;
  status: HealthStatus;
  channels: LaunchPaymentPlanChannel[];
  nextSteps: LaunchPaymentPlanStep[];
}) {
  const channelLines = input.channels.flatMap((channel) => [
    `${channel.label}：${channel.status}，订单 ${channel.orderCount}，支付成功 ${channel.paidOrderCount}`,
    ...channel.steps.map(
      (step) =>
        `  ${step.order}. [${statusLabel(step.status)}] ${step.title}：${step.action} 证据：${step.evidence}`,
    ),
  ]);
  const nextLines = input.nextSteps.length
    ? input.nextSteps.map(
        (step, index) =>
          `${index + 1}. ${step.channelLabel} / ${step.title}：${step.action}`,
      )
    : ["暂无支付落地缺口。"];

  return [
    "玄机 AI 真实支付落地计划",
    `生成时间：${input.generatedAt.slice(0, 16).replace("T", " ")}`,
    `状态：${input.label} (${input.status})`,
    "",
    "渠道步骤：",
    ...channelLines,
    "",
    "优先处理：",
    ...nextLines,
  ].join("\n");
}

export async function getLaunchPaymentPlan(input?: LaunchPaymentPlanInput) {
  const [paymentAcceptance, applicationPack, callbacks, integrationDiagnostics, externalReadiness] =
    await Promise.all([
      input?.paymentAcceptance ?? getLaunchPaymentAcceptance(),
      input?.applicationPack ?? getLaunchApplicationPack(),
      input?.callbacks ?? getLaunchCallbackChecklist(),
      input?.integrationDiagnostics ?? getIntegrationDiagnostics(),
      input?.externalReadiness ?? getLaunchExternalReadiness(),
    ]);
  const platforms = platformById(applicationPack);
  const callbackItems = callbackById(callbacks);
  const diagnostics = diagnosticById(integrationDiagnostics);
  const externalItems = externalById(externalReadiness);
  const channels = paymentAcceptance.channels.map((channel) =>
    buildChannel({
      channel,
      platform: platforms.get(channelMeta[channel.id].applicationId),
      callback: callbackItems.get(channelMeta[channel.id].callbackId),
      diagnostic: diagnostics.get(channelMeta[channel.id].diagnosticId),
      external: externalItems.get(channelMeta[channel.id].externalId),
      devBypassEnabled: paymentAcceptance.devBypassEnabled,
    }),
  );
  const steps = channels.flatMap((channel) => channel.steps);
  const summary = summarize(steps, channels);
  const status = planStatus({ paymentAcceptance, summary });
  const label = labelFor(status, summary);
  const preferred = preferredChannel(channels);
  const nextSteps = steps
    .filter((step) => step.status !== "ready")
    .sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        a.order - b.order ||
        a.channelLabel.localeCompare(b.channelLabel, "zh-CN"),
    )
    .slice(0, 8);
  const generatedAt = new Date().toISOString();

  return {
    generatedAt,
    status,
    label,
    detail: detailFor({ status, paymentAcceptance, preferredChannel: preferred }),
    action: nextSteps[0]?.action ?? paymentAcceptance.action,
    summary,
    payment: {
      mode: paymentAcceptance.paymentMode,
      devBypassEnabled: paymentAcceptance.devBypassEnabled,
      preferredChannel: preferred,
      appUrl: callbacks.appUrl,
    },
    channels,
    nextSteps,
    commandGroups: buildCommandGroups(channels, callbacks),
    evidence: [
      "支付宝/微信支付平台申请通过截图、商户主体和回执编号。",
      "生产环境变量脱敏截图和支付平台密钥配置截图。",
      "第三方诊断中支付签名烟测通过记录。",
      "launch:payment-check 回调业务字段校验和微信支付 resource 解密烟测通过记录。",
      "支付平台 notify_url 配置截图和正式域名访问截图。",
      "小额真实订单、PAID 回调、平台交易号、权益到账和钱包流水截图。",
      "支付平台交易详情、站内订单和上线证据归档记录。",
    ],
    copyText: buildCopyText({
      generatedAt,
      label,
      status,
      channels,
      nextSteps,
    }),
  } satisfies LaunchPaymentPlan;
}
