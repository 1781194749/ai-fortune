import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  timingSafeEqual,
} from "crypto";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { adjustMemberEntitlement } from "@/lib/entitlement-store";
import { grantOperationalStars } from "@/lib/mock-payment-store";
import {
  createUsageLog,
  getUsageLogsByFeature,
  type UsageLogRecord,
} from "@/lib/usage-log-store";
import { resolvePublicAppOrigin } from "@/lib/public-origin";

export type InviteRewardRecord = {
  inviteeId: string;
  createdAt: string;
  inviterStarGrant: number;
  inviteeStarGrant: number;
  inviteeDeepReportGrant: number;
};

export type InviteRewardSummary = {
  code: string;
  displayCode: string;
  invitePath: string;
  inviteUrl: string;
  inviterStarGrant: number;
  inviteeStarGrant: number;
  inviteeDeepReportGrant: number;
  totalAccepted: number;
  totalStarsEarned: number;
  recentRewards: InviteRewardRecord[];
};

type InviteAttributionPayload = {
  code: string;
  inviterId: string;
  firstSeenAt: string;
  lastSeenAt: string;
};

type InviteRewardEvent = "landing" | "rewarded" | "skipped";

type InviteRewardMetadata = {
  event: InviteRewardEvent;
  code: string;
  inviterId: string;
  inviteeId?: string;
  reason?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  inviterStarGrant?: number;
  inviteeStarGrant?: number;
  inviteeDeepReportGrant?: number;
  referrer?: string;
  userAgent?: string;
};

const inviteCookieName = "xuanji_invite_attr";
const inviteCookieMaxAgeSeconds = 60 * 60 * 24 * 30;
const inviteCodeVersion = "v2";
const legacyInviteCodeVersion = "v1";
const inviteCodeAad = Buffer.from("xuanji-invite-code-v2", "utf8");
const rewardFeature = "invite_reward";

export const inviteRewardConfig = {
  inviterStarGrant: 50,
  inviteeStarGrant: 30,
  inviteeDeepReportGrant: 1,
} as const;

function getInviteSecret() {
  const secret = process.env.INVITE_CODE_SECRET || process.env.AUTH_SESSION_SECRET;

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("生产环境必须配置 INVITE_CODE_SECRET 或 AUTH_SESSION_SECRET。");
  }

  return "xuanji-ai-local-invite-secret";
}

function toBase64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signLegacyInviteUserId(userId: string) {
  return createHmac("sha256", getInviteSecret())
    .update(`${legacyInviteCodeVersion}:${userId}`)
    .digest("base64url")
    .slice(0, 18);
}

function getInviteEncryptionKey() {
  return createHash("sha256").update(getInviteSecret()).digest();
}

function getInviteIv(userId: string) {
  return createHmac("sha256", getInviteSecret())
    .update(`${inviteCodeVersion}:iv:${userId}`)
    .digest()
    .subarray(0, 12);
}

function encryptInviteUserId(userId: string) {
  const iv = getInviteIv(userId);
  const cipher = createCipheriv("aes-256-gcm", getInviteEncryptionKey(), iv);
  cipher.setAAD(inviteCodeAad);
  const encrypted = Buffer.concat([
    cipher.update(userId, "utf8"),
    cipher.final(),
  ]);

  return [
    inviteCodeVersion,
    iv.toString("base64url"),
    encrypted.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

function decryptInviteUserId(code: string) {
  const [version, ivValue, encryptedValue, tagValue, extra] = code.split(".");

  if (
    version !== inviteCodeVersion ||
    !ivValue ||
    !encryptedValue ||
    !tagValue ||
    extra
  ) {
    return null;
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getInviteEncryptionKey(),
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAAD(inviteCodeAad);
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

function getInviteDisplayCode(userId: string) {
  return createHmac("sha256", getInviteSecret())
    .update(`${inviteCodeVersion}:display:${userId}`)
    .digest("hex")
    .slice(0, 8)
    .toUpperCase();
}

function signaturesMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeInviteCode(value: string | undefined) {
  return value?.trim().replace(/\s+/g, "") ?? "";
}

function encodeAttributionPayload(payload: InviteAttributionPayload) {
  return toBase64Url(JSON.stringify(payload));
}

function decodeAttributionPayload(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(value)) as unknown;

    if (!isRecord(parsed)) {
      return null;
    }

    const code = readString(parsed.code);
    const inviterId = readString(parsed.inviterId);
    const firstSeenAt = readString(parsed.firstSeenAt);
    const lastSeenAt = readString(parsed.lastSeenAt);

    if (!code || !inviterId || !firstSeenAt || !lastSeenAt) {
      return null;
    }

    return {
      code,
      inviterId,
      firstSeenAt,
      lastSeenAt,
    } satisfies InviteAttributionPayload;
  } catch {
    return null;
  }
}

function toInviteRewardMetadata(log: UsageLogRecord) {
  if (log.feature !== rewardFeature || !isRecord(log.metadata)) {
    return undefined;
  }

  const event = readString(log.metadata.event);
  const code = readString(log.metadata.code);
  const inviterId = readString(log.metadata.inviterId);

  if (
    (event !== "landing" && event !== "rewarded" && event !== "skipped") ||
    !code ||
    !inviterId
  ) {
    return undefined;
  }

  return {
    event,
    code,
    inviterId,
    inviteeId: readString(log.metadata.inviteeId),
    reason: readString(log.metadata.reason),
    firstSeenAt: readString(log.metadata.firstSeenAt),
    lastSeenAt: readString(log.metadata.lastSeenAt),
    inviterStarGrant: readNumber(log.metadata.inviterStarGrant),
    inviteeStarGrant: readNumber(log.metadata.inviteeStarGrant),
    inviteeDeepReportGrant: readNumber(log.metadata.inviteeDeepReportGrant),
    referrer: readString(log.metadata.referrer),
    userAgent: readString(log.metadata.userAgent),
  } satisfies InviteRewardMetadata;
}

async function recordInviteRewardLog(metadata: InviteRewardMetadata, userId?: string) {
  return createUsageLog({
    userId,
    provider: "internal",
    model: "invite-reward",
    feature: rewardFeature,
    costCents: 0,
    metadata,
  });
}

async function hasRewardForInvitee(inviteeId: string) {
  const logs = await getUsageLogsByFeature(rewardFeature, { take: 5000 });

  return logs.some((log) => {
    const metadata = toInviteRewardMetadata(log);

    return metadata?.event === "rewarded" && metadata.inviteeId === inviteeId;
  });
}

export function createInviteCode(userId: string) {
  return encryptInviteUserId(userId);
}

export function parseInviteCode(code: string | undefined) {
  const normalized = normalizeInviteCode(code);
  const encryptedUserId = decryptInviteUserId(normalized);

  if (encryptedUserId) {
    if (
      encryptedUserId.length > 160 ||
      /[\u0000-\u001F\u007F]/.test(encryptedUserId)
    ) {
      return null;
    }

    return {
      code: normalized,
      inviterId: encryptedUserId,
    };
  }

  const legacyPrefix = `${legacyInviteCodeVersion}_`;
  const legacySignatureLength = 18;
  const signatureSeparatorIndex = normalized.length - legacySignatureLength - 1;

  if (
    !normalized.startsWith(legacyPrefix) ||
    signatureSeparatorIndex <= legacyPrefix.length ||
    normalized[signatureSeparatorIndex] !== "_"
  ) {
    return null;
  }

  const encodedUserId = normalized.slice(legacyPrefix.length, signatureSeparatorIndex);
  const signature = normalized.slice(signatureSeparatorIndex + 1);

  try {
    const userId = fromBase64Url(encodedUserId);

    if (!userId || userId.length > 160 || /[\u0000-\u001F\u007F]/.test(userId)) {
      return null;
    }

    const expected = signLegacyInviteUserId(userId);

    if (!signaturesMatch(signature, expected)) {
      return null;
    }

    return {
      code: normalized,
      inviterId: userId,
    };
  } catch {
    return null;
  }
}

export function getInviteLinkForUser(userId: string, appOrigin?: string) {
  const code = createInviteCode(userId);
  const invitePath = `/invite/${code}`;

  return {
    code,
    displayCode: `XJ-${getInviteDisplayCode(userId)}`,
    invitePath,
    inviteUrl: `${appOrigin ?? resolvePublicAppOrigin()}${invitePath}`,
  };
}

export async function writeInviteAttribution(input: {
  code: string;
  referrer?: string;
  userAgent?: string;
}) {
  const invite = parseInviteCode(input.code);

  if (!invite) {
    return null;
  }

  const cookieStore = await cookies();
  const existing = decodeAttributionPayload(cookieStore.get(inviteCookieName)?.value);
  const now = new Date().toISOString();
  const isSameInvite = existing?.code === invite.code;
  const payload = {
    code: invite.code,
    inviterId: invite.inviterId,
    firstSeenAt: isSameInvite ? existing?.firstSeenAt ?? now : now,
    lastSeenAt: now,
  } satisfies InviteAttributionPayload;

  cookieStore.set(inviteCookieName, encodeAttributionPayload(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: inviteCookieMaxAgeSeconds,
  });

  await recordInviteRewardLog(
    {
      event: "landing",
      ...payload,
      referrer: input.referrer?.slice(0, 240),
      userAgent: input.userAgent?.slice(0, 240),
    },
    invite.inviterId,
  );

  return payload;
}

export async function readInviteAttribution() {
  const cookieStore = await cookies();
  const payload = decodeAttributionPayload(cookieStore.get(inviteCookieName)?.value);

  if (!payload) {
    return null;
  }

  const invite = parseInviteCode(payload.code);

  if (!invite || invite.inviterId !== payload.inviterId) {
    return null;
  }

  return payload;
}

export async function clearInviteAttribution() {
  const cookieStore = await cookies();
  cookieStore.delete(inviteCookieName);
}

export async function completeInviteRewardForLogin(input: {
  userId: string;
  isNewUser: boolean;
}) {
  if (!input.isNewUser) {
    return null;
  }

  const attribution = await readInviteAttribution();

  if (!attribution) {
    return null;
  }

  if (attribution.inviterId === input.userId) {
    await clearInviteAttribution();
    await recordInviteRewardLog({
      event: "skipped",
      ...attribution,
      inviteeId: input.userId,
      reason: "self_invite",
    });
    return null;
  }

  if (await hasRewardForInvitee(input.userId)) {
    await clearInviteAttribution();
    return null;
  }

  const metadata = {
    code: attribution.code,
    inviterId: attribution.inviterId,
    inviteeId: input.userId,
    firstSeenAt: attribution.firstSeenAt,
    lastSeenAt: attribution.lastSeenAt,
  };

  const inviterTransaction = await grantOperationalStars({
    userId: attribution.inviterId,
    amount: inviteRewardConfig.inviterStarGrant,
    reason: `邀请新用户奖励 ${inviteRewardConfig.inviterStarGrant} 星力`,
    source: "invite_reward",
    metadata,
  });
  const inviteeTransaction = await grantOperationalStars({
    userId: input.userId,
    amount: inviteRewardConfig.inviteeStarGrant,
    reason: `好友邀请新人礼包 ${inviteRewardConfig.inviteeStarGrant} 星力`,
    source: "invite_reward",
    metadata,
  });
  const inviteeEntitlement =
    inviteRewardConfig.inviteeDeepReportGrant > 0
      ? await adjustMemberEntitlement({
          userId: input.userId,
          kind: "deep_report",
          amount: inviteRewardConfig.inviteeDeepReportGrant,
          reason: `好友邀请新人礼包 ${inviteRewardConfig.inviteeDeepReportGrant} 份深度报告额度`,
          idempotencyKey: `invite:${input.userId}:deep_report:gift`,
          metadata: {
            source: "invite_reward",
            ...metadata,
          },
        })
      : null;

  await recordInviteRewardLog(
    {
      event: "rewarded",
      ...attribution,
      inviteeId: input.userId,
      inviterStarGrant: inviteRewardConfig.inviterStarGrant,
      inviteeStarGrant: inviteRewardConfig.inviteeStarGrant,
      inviteeDeepReportGrant: inviteRewardConfig.inviteeDeepReportGrant,
    },
    input.userId,
  );
  await clearInviteAttribution();

  return {
    inviterTransaction,
    inviteeTransaction,
    inviteeEntitlement,
  };
}

export async function getInviteRewardSummary(userId: string) {
  const requestHeaders = await headers();
  const link = getInviteLinkForUser(
    userId,
    resolvePublicAppOrigin({ headers: requestHeaders }),
  );
  const logs = await getUsageLogsByFeature(rewardFeature, { take: 5000 });
  const rewards = logs
    .map((log) => {
      const metadata = toInviteRewardMetadata(log);

      if (metadata?.event !== "rewarded" || metadata.inviterId !== userId || !metadata.inviteeId) {
        return null;
      }

      return {
        inviteeId: metadata.inviteeId,
        createdAt: log.createdAt,
        inviterStarGrant: metadata.inviterStarGrant ?? inviteRewardConfig.inviterStarGrant,
        inviteeStarGrant: metadata.inviteeStarGrant ?? inviteRewardConfig.inviteeStarGrant,
        inviteeDeepReportGrant:
          metadata.inviteeDeepReportGrant ?? inviteRewardConfig.inviteeDeepReportGrant,
      } satisfies InviteRewardRecord;
    })
    .filter((record): record is InviteRewardRecord => Boolean(record))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    ...link,
    ...inviteRewardConfig,
    totalAccepted: rewards.length,
    totalStarsEarned: rewards.reduce((sum, reward) => sum + reward.inviterStarGrant, 0),
    recentRewards: rewards.slice(0, 3),
  } satisfies InviteRewardSummary;
}
