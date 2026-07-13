import "server-only";

import { emailToUserId, normalizeEmail } from "@/lib/email-auth";
import type { HealthStatus } from "@/lib/health-checks";
import {
  getLaunchDecision,
  type LaunchDecision,
  type LaunchDecisionStage,
} from "@/lib/launch-decision";
import type { SessionPayload } from "@/lib/session";

type Env = Record<string, string | undefined>;

export type LivePaymentLaunchGateCode =
  | "LIVE_PAYMENT_NOT_RELEASED"
  | "LIVE_PAYMENT_SMOKE_NOT_CONFIGURED"
  | "LIVE_PAYMENT_SMOKE_NOT_ALLOWED"
  | "LIVE_PAYMENT_RELEASE_READY"
  | "LIVE_PAYMENT_SMOKE_ALLOWED";

export type LivePaymentLaunchGateScope =
  | "blocked"
  | "smoke_allowlist"
  | "public_release";

export type LivePaymentSmokeAllowlist = {
  configured: boolean;
  userIdsConfigured: number;
  emailsConfigured: number;
  totalAccounts: number;
};

export type LivePaymentLaunchGate = {
  allowed: boolean;
  decision: LaunchDecisionStage;
  code: LivePaymentLaunchGateCode;
  scope: LivePaymentLaunchGateScope;
  scopeLabel: string;
  status: HealthStatus;
  label: string;
  detail: string;
  action: string;
  message: string;
  requiresAllowlist: boolean;
  allowlist: LivePaymentSmokeAllowlist;
  currentUser: {
    checked: boolean;
    allowed: boolean;
    matchedBy: "user_id" | "email" | "none";
  };
};

function parseList(value: string | undefined) {
  return (value ?? "")
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function getSmokeAllowlist(env: Env = process.env) {
  const userIds = unique(parseList(env.LIVE_PAYMENT_SMOKE_TEST_USER_IDS));
  const emails = unique(parseList(env.LIVE_PAYMENT_SMOKE_TEST_EMAILS).map(normalizeEmail));
  const emailUserIds = unique(emails.map(emailToUserId));

  return {
    userIds,
    emails,
    emailUserIds,
    summary: {
      configured: userIds.length > 0 || emails.length > 0,
      userIdsConfigured: userIds.length,
      emailsConfigured: emails.length,
      totalAccounts: unique([...userIds, ...emailUserIds]).length,
    } satisfies LivePaymentSmokeAllowlist,
  };
}

function getScope(decision: LaunchDecisionStage): LivePaymentLaunchGateScope {
  if (decision === "release_ready") {
    return "public_release";
  }

  if (decision === "paid_smoke") {
    return "smoke_allowlist";
  }

  return "blocked";
}

function scopeLabel(scope: LivePaymentLaunchGateScope) {
  if (scope === "public_release") {
    return "公开放量";
  }

  if (scope === "smoke_allowlist") {
    return "内部小额灰度";
  }

  return "关闭真实支付";
}

function matchCurrentUser(
  user: Pick<SessionPayload, "userId"> | undefined,
  allowlist: ReturnType<typeof getSmokeAllowlist>,
) {
  if (!user) {
    return {
      checked: false,
      allowed: false,
      matchedBy: "none" as const,
    };
  }

  if (allowlist.userIds.includes(user.userId)) {
    return {
      checked: true,
      allowed: true,
      matchedBy: "user_id" as const,
    };
  }

  if (allowlist.emailUserIds.includes(user.userId)) {
    return {
      checked: true,
      allowed: true,
      matchedBy: "email" as const,
    };
  }

  return {
    checked: true,
    allowed: false,
    matchedBy: "none" as const,
  };
}

export async function getLivePaymentLaunchGate(input?: {
  decision?: LaunchDecision;
  user?: Pick<SessionPayload, "userId" | "emailMasked">;
  env?: Env;
}): Promise<LivePaymentLaunchGate> {
  const decision = input?.decision ?? (await getLaunchDecision());
  const scope = getScope(decision.decision);
  const allowlist = getSmokeAllowlist(input?.env);
  const currentUser = matchCurrentUser(input?.user, allowlist);
  const requiresAllowlist = scope === "smoke_allowlist";
  const allowed =
    scope === "public_release" ||
    (scope === "smoke_allowlist" && allowlist.summary.configured && currentUser.allowed);
  const code: LivePaymentLaunchGateCode =
    scope === "public_release"
      ? "LIVE_PAYMENT_RELEASE_READY"
      : scope === "blocked"
        ? "LIVE_PAYMENT_NOT_RELEASED"
        : allowed
          ? "LIVE_PAYMENT_SMOKE_ALLOWED"
          : allowlist.summary.configured
            ? "LIVE_PAYMENT_SMOKE_NOT_ALLOWED"
            : "LIVE_PAYMENT_SMOKE_NOT_CONFIGURED";
  const message =
    scope === "public_release"
      ? "真实支付入口已满足公开放量条件，登录用户可创建真实支付订单。"
      : scope === "blocked"
        ? `真实支付入口尚未开放：${decision.label}。${decision.action}`
        : allowed
          ? "真实支付入口已对当前内部测试账号开放，可创建小额真实订单。"
          : allowlist.summary.configured
            ? "真实支付处于小额订单灰度阶段，当前账号未加入内部测试白名单。"
            : "真实支付处于小额订单灰度阶段，但尚未配置内部测试账号白名单。";
  const action =
    scope === "smoke_allowlist" && !allowed
      ? "配置 LIVE_PAYMENT_SMOKE_TEST_USER_IDS 或 LIVE_PAYMENT_SMOKE_TEST_EMAILS，只把内部测试账号加入白名单；完成小额订单、回调、权益到账和对账留证后再进入 release_ready。"
      : decision.action;

  return {
    allowed,
    decision: decision.decision,
    code,
    scope,
    scopeLabel: scopeLabel(scope),
    status: decision.status,
    label: decision.label,
    detail: decision.detail,
    action,
    message,
    requiresAllowlist,
    allowlist: allowlist.summary,
    currentUser,
  };
}
