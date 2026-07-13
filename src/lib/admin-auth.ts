import "server-only";

import { emailToUserId } from "@/lib/email-auth";
import { getSession } from "@/lib/session";
import { getPersistedUserEmail } from "@/lib/user-store";

export const adminEmail = "a1781194749@gmail.com";
const adminUserId = emailToUserId(adminEmail);

function normalizeEmail(email: string | undefined) {
  return email?.trim().toLowerCase();
}

export async function isAdminUserId(userId: string) {
  if (userId === adminUserId) {
    return true;
  }

  const email = await getPersistedUserEmail(userId);
  return normalizeEmail(email) === adminEmail;
}

export async function getAdminAccess() {
  const session = await getSession();

  if (!session) {
    return {
      authenticated: false,
      authorized: false,
      session: null,
    } as const;
  }

  const authorized = await isAdminUserId(session.userId);

  return {
    authenticated: true,
    authorized,
    session,
  } as const;
}

export async function canAccessAdmin(
  searchParams?: Record<string, string | string[] | undefined>,
) {
  void searchParams;

  const access = await getAdminAccess();
  return access.authorized;
}
