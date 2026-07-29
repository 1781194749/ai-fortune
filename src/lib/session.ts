import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { MembershipTierCode } from "./commerce";
import { getPersistedAccountState } from "./user-store";

export type SessionPayload = {
  userId: string;
  emailMasked: string;
  tier: MembershipTierCode;
  starBalance: number;
  chatQuota?: number;
  chatUsed?: number;
  profileLimit?: number;
  quotaPeriodStart?: string;
  adminEligible?: boolean;
  expiresAt: string;
};

const sessionCookieName = "xuanji_session";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;

function getSessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET;

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SESSION_SECRET is required in production.");
  }

  return "xuanji-ai-local-development-secret";
}

function toBase64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function encodeSession(payload: SessionPayload) {
  const body = toBase64Url(JSON.stringify(payload));
  const signature = sign(body);
  return `${body}.${signature}`;
}

function decodeSession(value: string | undefined): SessionPayload | null {
  if (!value) {
    return null;
  }

  const [body, signature] = value.split(".");

  if (!body || !signature) {
    return null;
  }

  const expected = sign(body);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(body)) as SessionPayload;

    if (new Date(payload.expiresAt).getTime() <= Date.now()) {
      return null;
    }

    return {
      ...payload,
      // Sessions created before this trust marker existed must re-authenticate
      // before they can be used for privileged operations.
      adminEligible: payload.adminEligible === true,
    };
  } catch {
    return null;
  }
}

export async function createSession(input: Omit<SessionPayload, "expiresAt">) {
  const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds * 1000);
  const cookieStore = await cookies();
  const existing = decodeSession(cookieStore.get(sessionCookieName)?.value);
  const adminEligible =
    input.adminEligible ??
    (existing?.userId === input.userId ? existing.adminEligible === true : false);
  const session = encodeSession({
    ...input,
    adminEligible,
    expiresAt: expiresAt.toISOString(),
  });

  cookieStore.set(sessionCookieName, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionMaxAgeSeconds,
    expires: expiresAt,
  });
}

export async function getSession() {
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(sessionCookieName)?.value);

  if (!session) {
    return null;
  }

  const accountState = await getPersistedAccountState(session.userId, {
    tier: session.tier,
    starBalance: session.starBalance,
    chatQuota: session.chatQuota,
    chatUsed: session.chatUsed,
    profileLimit: session.profileLimit,
    quotaPeriodStart: session.quotaPeriodStart,
  });

  return {
    ...session,
    tier: accountState.tier,
    starBalance: accountState.starBalance,
    chatQuota: accountState.chatQuota,
    chatUsed: accountState.chatUsed,
    profileLimit: accountState.profileLimit,
    quotaPeriodStart: accountState.quotaPeriodStart,
  };
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
}
