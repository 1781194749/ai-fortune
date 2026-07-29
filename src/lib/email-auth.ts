import "server-only";

import { createHash, createHmac, randomInt, timingSafeEqual } from "crypto";

export type EmailVerificationResult = {
  method: "email_code" | "local_development" | "acceptance_hmac";
  adminEligible: boolean;
};

type EmailCodeRecord = {
  code: string;
  expiresAt: number;
  attempts: number;
  method: "email_code" | "local_development";
};

const emailCodeTtlMs = 10 * 60 * 1000;
const maxAttempts = 5;
const acceptanceMaxClockSkewMs = 90 * 1000;
const localDevelopmentHeader = "x-xuanji-local-email-auth";
const acceptanceTimestampHeader = "x-xuanji-email-auth-timestamp";
const acceptanceSignatureHeader = "x-xuanji-email-auth-signature";
const acceptanceSignatureVersion = "xuanji-email-auth-v1";

declare global {
  var xuanjiEmailCodes: Map<string, EmailCodeRecord> | undefined;
}

const emailCodes = globalThis.xuanjiEmailCodes ?? new Map<string, EmailCodeRecord>();

if (!globalThis.xuanjiEmailCodes) {
  globalThis.xuanjiEmailCodes = emailCodes;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function maskEmail(email: string) {
  const [name, domain] = email.split("@");

  if (!name || !domain) {
    return email;
  }

  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${"*".repeat(Math.max(2, name.length - visible.length))}@${domain}`;
}

export function emailToUserId(email: string) {
  return `email_${createHash("sha256").update(email).digest("hex").slice(0, 24)}`;
}

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

export function isLocalDevelopmentTestEmail(email: string) {
  const domain = normalizeEmail(email).split("@").at(1) ?? "";
  return ["example.com", "example.org", "example.net", "example.test", "invalid"]
    .some((reservedDomain) =>
      domain === reservedDomain || domain.endsWith(`.${reservedDomain}`)
    );
}

export function isExplicitLocalEmailAuthRequest(request: Request, email?: string) {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  if (email && !isLocalDevelopmentTestEmail(email)) {
    return false;
  }

  try {
    return (
      request.headers.get(localDevelopmentHeader) === "1" &&
      isLoopbackHostname(new URL(request.url).hostname)
    );
  } catch {
    return false;
  }
}

function getAcceptanceSecret() {
  const secret = process.env.EMAIL_AUTH_ACCEPTANCE_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

function acceptanceSignaturePayload(input: {
  timestamp: string;
  email: string;
  code: string;
  returnTo?: string;
}) {
  return [
    acceptanceSignatureVersion,
    input.timestamp,
    normalizeEmail(input.email),
    input.code.trim(),
    input.returnTo?.trim() ?? "",
  ].join("\n");
}

export function createEmailAuthAcceptanceSignature(
  input: {
    timestamp: string;
    email: string;
    code: string;
    returnTo?: string;
  },
  secret = getAcceptanceSecret(),
) {
  if (!secret || secret.length < 32) {
    return null;
  }

  return createHmac("sha256", secret)
    .update(acceptanceSignaturePayload(input))
    .digest("base64url");
}

function signaturesMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function hasUsableEmailCodeRecord(record: EmailCodeRecord | undefined) {
  return Boolean(
    record &&
      record.expiresAt > Date.now() &&
      record.attempts < maxAttempts,
  );
}

export function requestEmailCode(
  email: string,
  options: { localDevelopment?: boolean } = {},
) {
  const normalizedEmail = normalizeEmail(email);
  const code = String(randomInt(100000, 1000000));
  const expiresAt = Date.now() + emailCodeTtlMs;

  emailCodes.set(normalizedEmail, {
    code,
    expiresAt,
    attempts: 0,
    method: options.localDevelopment ? "local_development" : "email_code",
  });

  return {
    code,
    expiresAt,
  };
}

export function verifyEmailCode(email: string, code: string) {
  const normalizedEmail = normalizeEmail(email);
  const record = emailCodes.get(normalizedEmail);

  if (!hasUsableEmailCodeRecord(record)) {
    emailCodes.delete(normalizedEmail);
    return null;
  }

  if (!record) {
    return null;
  }

  record.attempts += 1;

  if (record.code !== code) {
    return null;
  }

  emailCodes.delete(normalizedEmail);
  return {
    method: record.method,
    adminEligible: record.method === "email_code",
  } satisfies EmailVerificationResult;
}

export function verifyEmailAuthBypass(input: {
  request: Request;
  email: string;
  code: string;
  returnTo?: string;
}) {
  if (process.env.NODE_ENV === "production" || input.code !== "000000") {
    return null;
  }

  const normalizedEmail = normalizeEmail(input.email);
  const record = emailCodes.get(normalizedEmail);

  if (
    isExplicitLocalEmailAuthRequest(input.request, normalizedEmail) &&
    hasUsableEmailCodeRecord(record)
  ) {
    emailCodes.delete(normalizedEmail);
    return {
      method: "local_development",
      adminEligible: false,
    } satisfies EmailVerificationResult;
  }

  const timestamp = input.request.headers.get(acceptanceTimestampHeader)?.trim() ?? "";
  const signature = input.request.headers.get(acceptanceSignatureHeader)?.trim() ?? "";
  const timestampMs = Number(timestamp);
  const secret = getAcceptanceSecret();

  if (
    !secret ||
    !/^\d{13}$/.test(timestamp) ||
    !Number.isSafeInteger(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > acceptanceMaxClockSkewMs ||
    !signature
  ) {
    return null;
  }

  const expected = createEmailAuthAcceptanceSignature(
    {
      timestamp,
      email: normalizedEmail,
      code: input.code,
      returnTo: input.returnTo,
    },
    secret,
  );

  if (!expected || !signaturesMatch(signature, expected)) {
    return null;
  }

  emailCodes.delete(normalizedEmail);
  return {
    method: "acceptance_hmac",
    adminEligible: false,
  } satisfies EmailVerificationResult;
}
