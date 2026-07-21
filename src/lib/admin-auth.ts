import "server-only";

import { timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { UserRole } from "@/generated/prisma/enums";
import { emailToUserId } from "@/lib/email-auth";
import { getSession } from "@/lib/session";
import { getPersistedUserEmail, getPersistedUserRole } from "@/lib/user-store";

export const adminEmail = "a1781194749@gmail.com";
type AdminSearchParams = Record<string, string | string[] | undefined>;

function normalizeEmail(email: string | undefined) {
  return email?.trim().toLowerCase();
}

function readFlag(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "true" || normalized === "1") {
    return true;
  }

  if (normalized === "false" || normalized === "0") {
    return false;
  }

  return undefined;
}

function configuredAdminEmails(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.ADMIN_EMAILS || env.ADMIN_EMAIL || adminEmail;
  const emails = configured
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter((email): email is string => Boolean(email));

  return [...new Set(emails)];
}

export function isAdminDashboardEnabled(env: NodeJS.ProcessEnv = process.env) {
  const configured = readFlag(env.ADMIN_DASHBOARD_ENABLED);

  if (configured !== undefined) {
    return configured;
  }

  return env.NODE_ENV !== "production";
}

function configuredAdminToken(env: NodeJS.ProcessEnv = process.env) {
  const token = env.ADMIN_ACCESS_TOKEN?.trim();

  if (!token) {
    return null;
  }

  if (env.NODE_ENV === "production" && token.length < 32) {
    return null;
  }

  return token;
}

function readSearchValue(searchParams: AdminSearchParams | undefined, key: string) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

export function readAdminAccessToken(searchParams?: AdminSearchParams) {
  return readSearchValue(searchParams, "token")?.trim() || undefined;
}

export function isValidAdminAccessToken(
  token: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!isAdminDashboardEnabled(env)) {
    return false;
  }

  const expected = configuredAdminToken(env);

  if (!token || !expected) {
    return false;
  }

  const actualBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export async function isAdminUserId(userId: string) {
  const role = await getPersistedUserRole(userId);

  if (role === UserRole.ADMIN) {
    return true;
  }

  const adminEmails = configuredAdminEmails();

  if (adminEmails.some((email) => userId === emailToUserId(email))) {
    return true;
  }

  const email = await getPersistedUserEmail(userId);
  return adminEmails.includes(normalizeEmail(email) ?? "");
}

export async function getAdminAccess(searchParams?: AdminSearchParams) {
  // Keep admin access decisions request-scoped without forcing a session/database read first.
  await cookies();

  if (!isAdminDashboardEnabled()) {
    return {
      enabled: false,
      authenticated: false,
      authorized: false,
      session: null,
      authMode: "disabled",
      adminToken: undefined,
    } as const;
  }

  const adminToken = readAdminAccessToken(searchParams);

  if (isValidAdminAccessToken(adminToken)) {
    return {
      enabled: true,
      authenticated: true,
      authorized: true,
      session: null,
      authMode: "token",
      adminToken,
    } as const;
  }

  const session = await getSession();

  if (!session) {
    return {
      enabled: true,
      authenticated: false,
      authorized: false,
      session: null,
      authMode: "none",
      adminToken: undefined,
    } as const;
  }

  const authorized = await isAdminUserId(session.userId);

  return {
    enabled: true,
    authenticated: true,
    authorized,
    session,
    authMode: "session",
    adminToken: undefined,
  } as const;
}

export async function canAccessAdmin(
  searchParams?: AdminSearchParams,
) {
  const access = await getAdminAccess(searchParams);
  return access.authorized;
}
