import "server-only";

import { getLaunchCallbackChecklist } from "@/lib/launch-callbacks";
import {
  getLaunchEnvChecklist,
  type LaunchEnvChecklist,
  type LaunchEnvChecklistItem,
} from "@/lib/launch-env-checklist";
import type { HealthStatus } from "@/lib/health-checks";
import { getLaunchMaterialPack, type LaunchMaterialItem } from "@/lib/launch-materials";

export type LaunchEnvDraftEntry = {
  key: string;
  group: string;
  label: string;
  status: HealthStatus;
  stateLabel: string;
  kind: LaunchEnvChecklistItem["kind"];
  safeValue: string;
  line: string;
  action: string;
  sourceItems: string[];
  platformHints: string[];
  isSecret: boolean;
};

export type LaunchEnvDraftGroup = {
  name: string;
  status: HealthStatus;
  ready: number;
  warning: number;
  blocking: number;
  total: number;
  entries: LaunchEnvDraftEntry[];
};

export type LaunchEnvDraft = {
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
    secret: number;
    groups: number;
  };
  groups: LaunchEnvDraftGroup[];
  priorityEntries: LaunchEnvDraftEntry[];
  callbackHints: Array<{
    id: string;
    platform: string;
    configName: string;
    value: string;
    status: HealthStatus;
  }>;
  copyText: string;
};

const suggestedValues: Record<string, string> = {
  APP_URL: "https://your-domain.com",
  APP_LOCALE: "zh-CN",
  COMPANY_NAME: "<company-or-individual-business-name>",
  ICP_RECORD_NO: "<icp-record-number>",
  AUTH_SESSION_SECRET: "<generate-64-character-random-secret>",
  ADMIN_DASHBOARD_ENABLED: "true",
  ADMIN_ACCESS_TOKEN: "<generate-64-character-admin-token>",
  DATABASE_URL: "<postgresql-connection-string>",
  AUTH_EMAIL_ENABLED: "true",
  AUTH_WECHAT_ENABLED: "false",
  WECHAT_APP_ID: "<wechat-open-platform-app-id>",
  WECHAT_APP_SECRET: "<wechat-open-platform-app-secret>",
  OPENAI_BASE_URL: "https://api.openai.com/v1",
  OPENAI_API_KEY: "<openai-api-key>",
  OPENAI_USER_AGENT: "Xuanji-AI/1.0",
  OPENAI_DEFAULT_MODEL: "gpt-5.4",
  OPENAI_FAST_MODEL: "gpt-5.4",
  OPENAI_PREMIUM_MODEL: "gpt-5.5",
  OPENAI_VISION_MODEL: "gpt-5.4",
  PAYMENT_PROVIDER: "live",
  LIVE_PAYMENT_SMOKE_TEST_USER_IDS: "<comma-separated-internal-test-user-ids>",
  PAYMENT_CALLBACK_DEV_BYPASS: "false",
  ALIPAY_ENABLED: "true",
  ALIPAY_GATEWAY: "https://openapi.alipay.com/gateway.do",
  ALIPAY_APP_ID: "<alipay-app-id>",
  ALIPAY_PRIVATE_KEY: "<alipay-application-private-key>",
  ALIPAY_PUBLIC_KEY: "<alipay-public-key>",
  WECHAT_PAY_ENABLED: "true",
  WECHAT_PAY_MCH_ID: "<wechat-pay-merchant-id>",
  WECHAT_PAY_API_V3_KEY: "<wechat-pay-api-v3-key>",
  WECHAT_PAY_PRIVATE_KEY: "<wechat-pay-merchant-private-key>",
  WECHAT_PAY_SERIAL_NO: "<wechat-pay-merchant-serial-no>",
  WECHAT_PAY_PLATFORM_PUBLIC_KEY: "<wechat-pay-platform-public-key>",
  QINIU_ACCESS_KEY: "<qiniu-access-key>",
  QINIU_SECRET_KEY: "<qiniu-secret-key>",
  QINIU_BUCKET: "<qiniu-bucket>",
  QINIU_REGION: "<qiniu-region>",
  QINIU_PUBLIC_DOMAIN: "https://your-qiniu-public-domain",
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

function isSecretKind(kind: LaunchEnvChecklistItem["kind"]) {
  return kind === "secret" || kind === "connection";
}

function quoteEnvValue(value: string) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
}

function safeValue(item: LaunchEnvChecklistItem) {
  if (isSecretKind(item.kind)) {
    return suggestedValues[item.key] ?? "<set-in-deploy-platform>";
  }

  if (item.status === "ready" && item.displayValue && item.displayValue !== "未配置") {
    return item.displayValue;
  }

  return suggestedValues[item.key] ?? `<${item.key.toLowerCase().replaceAll("_", "-")}>`;
}

function platformHintsForKey(
  key: string,
  materialItems: LaunchMaterialItem[],
  callbackHints: LaunchEnvDraft["callbackHints"],
) {
  const materialHints = materialItems
    .filter((item) => item.envKeys.includes(key))
    .map((item) => `${item.phase} / ${item.title}`);
  const callbackHint =
    key === "APP_URL"
      ? callbackHints.map((item) => `${item.platform} / ${item.configName}`)
      : key === "QINIU_PUBLIC_DOMAIN"
        ? callbackHints
            .filter((item) => item.id === "qiniu:public-domain")
            .map((item) => `${item.platform} / ${item.configName}`)
        : [];

  return Array.from(new Set([...materialHints, ...callbackHint]));
}

function entryFromItem(input: {
  item: LaunchEnvChecklistItem;
  materialItems: LaunchMaterialItem[];
  callbackHints: LaunchEnvDraft["callbackHints"];
}) {
  const value = safeValue(input.item);

  return {
    key: input.item.key,
    group: input.item.group,
    label: input.item.label,
    status: input.item.status,
    stateLabel: input.item.stateLabel,
    kind: input.item.kind,
    safeValue: value,
    line: `${input.item.key}=${quoteEnvValue(value)}`,
    action: input.item.action,
    sourceItems: input.item.sourceItems,
    platformHints: platformHintsForKey(input.item.key, input.materialItems, input.callbackHints),
    isSecret: isSecretKind(input.item.kind),
  } satisfies LaunchEnvDraftEntry;
}

function groupStatus(entries: LaunchEnvDraftEntry[]): HealthStatus {
  if (entries.some((entry) => entry.status === "blocking")) {
    return "blocking";
  }

  if (entries.some((entry) => entry.status === "warning")) {
    return "warning";
  }

  return "ready";
}

function groupEntries(entries: LaunchEnvDraftEntry[]) {
  const names = Array.from(new Set(entries.map((entry) => entry.group)));

  return names.map((name) => {
    const groupItems = entries
      .filter((entry) => entry.group === name)
      .sort((a, b) => a.key.localeCompare(b.key, "zh-CN"));

    return {
      name,
      status: groupStatus(groupItems),
      ready: groupItems.filter((item) => item.status === "ready").length,
      warning: groupItems.filter((item) => item.status === "warning").length,
      blocking: groupItems.filter((item) => item.status === "blocking").length,
      total: groupItems.length,
      entries: groupItems,
    } satisfies LaunchEnvDraftGroup;
  });
}

function draftStatus(summary: LaunchEnvChecklist["summary"]) {
  if (summary.blocking > 0) {
    return {
      status: "blocking" as const,
      label: `生产变量草案有 ${summary.blocking} 个阻断项`,
      detail: "当前生产变量仍存在缺失、占位、本地地址、弱密钥或开关不一致，不能直接用于收费上线。",
      action: "按优先填项补齐主体、正式域名、生产库、后台 token 和真实支付参数，再运行上线预检。",
    };
  }

  if (summary.warning > 0) {
    return {
      status: "warning" as const,
      label: `生产变量草案有 ${summary.warning} 个待复核项`,
      detail: "当前没有阻断项，但仍有微信登录、AI、七牛或合规信息需要复核。",
      action: "将草案同步到部署平台后，运行第三方诊断、落库探针和小额支付验收。",
    };
  }

  return {
    status: "ready" as const,
    label: "生产变量草案可用于预检",
    detail: "当前变量核对没有阻断或警告项。",
    action: "复制草案到部署平台环境变量，运行 launch:preflight、诊断和上线证据归档。",
  };
}

function buildCopyText(input: {
  status: HealthStatus;
  label: string;
  groups: LaunchEnvDraftGroup[];
  callbackHints: LaunchEnvDraft["callbackHints"];
}) {
  const lines = input.groups.flatMap((group) => [
    "",
    `# ${group.name}`,
    ...group.entries.flatMap((entry) => [
      `# ${entry.label} / ${entry.stateLabel} / ${entry.action}`,
      entry.line,
    ]),
  ]);
  const callbackLines =
    input.callbackHints.length > 0
      ? [
          "",
          "# 第三方平台回调与协议配置参考",
          ...input.callbackHints.map((item) => `# ${item.platform} / ${item.configName}: ${item.value}`),
        ]
      : [];

  return [
    "# 玄机 AI 生产环境变量草案",
    "# 仅用于部署平台填写参考；不要把真实密钥提交到代码仓库。",
    `# 状态：${input.label} (${input.status})`,
    ...lines,
    ...callbackLines,
  ].join("\n");
}

export async function getLaunchEnvDraft() {
  const [envChecklist, materials, callbacks] = await Promise.all([
    getLaunchEnvChecklist(),
    getLaunchMaterialPack(),
    getLaunchCallbackChecklist(),
  ]);
  const callbackHints = callbacks.items
    .filter((item) => item.requiredForLaunch)
    .map((item) => ({
      id: item.id,
      platform: item.platform,
      configName: item.configName,
      value: item.value,
      status: item.status,
    }));
  const entries = envChecklist.items.map((item) =>
    entryFromItem({
      item,
      materialItems: materials.items,
      callbackHints,
    }),
  );
  const groups = groupEntries(entries).sort(
    (a, b) =>
      statusRank(a.status) - statusRank(b.status) ||
      a.name.localeCompare(b.name, "zh-CN"),
  );
  const status = draftStatus(envChecklist.summary);
  const priorityEntries = [...entries]
    .filter((entry) => entry.status !== "ready")
    .sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        a.group.localeCompare(b.group, "zh-CN") ||
        a.key.localeCompare(b.key, "zh-CN"),
    )
    .slice(0, 10);

  return {
    generatedAt: new Date().toISOString(),
    ...status,
    summary: {
      ready: envChecklist.summary.ready,
      warning: envChecklist.summary.warning,
      blocking: envChecklist.summary.blocking,
      total: envChecklist.summary.total,
      secret: envChecklist.summary.secret,
      groups: groups.length,
    },
    groups,
    priorityEntries,
    callbackHints,
    copyText: buildCopyText({
      status: status.status,
      label: status.label,
      groups,
      callbackHints,
    }),
  } satisfies LaunchEnvDraft;
}
