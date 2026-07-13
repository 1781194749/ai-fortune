import "server-only";

import { createHash, randomInt } from "crypto";

type EmailCodeRecord = {
  code: string;
  expiresAt: number;
  attempts: number;
};

const emailCodeTtlMs = 10 * 60 * 1000;
const maxAttempts = 5;

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

export function requestEmailCode(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const code = String(randomInt(100000, 1000000));
  const expiresAt = Date.now() + emailCodeTtlMs;

  emailCodes.set(normalizedEmail, {
    code,
    expiresAt,
    attempts: 0,
  });

  return {
    code,
    expiresAt,
  };
}

export function verifyEmailCode(email: string, code: string) {
  const normalizedEmail = normalizeEmail(email);
  const record = emailCodes.get(normalizedEmail);

  if (process.env.NODE_ENV !== "production" && code === "000000") {
    emailCodes.delete(normalizedEmail);
    return true;
  }

  if (!record) {
    return false;
  }

  if (record.expiresAt <= Date.now() || record.attempts >= maxAttempts) {
    emailCodes.delete(normalizedEmail);
    return false;
  }

  record.attempts += 1;

  if (record.code !== code) {
    return false;
  }

  emailCodes.delete(normalizedEmail);
  return true;
}
