import "server-only";

import { canAccessAdmin } from "@/lib/admin-auth";

function bearerToken(value: string | null) {
  const prefix = "bearer ";

  if (!value?.toLowerCase().startsWith(prefix)) {
    return undefined;
  }

  return value.slice(prefix.length).trim() || undefined;
}

function requestSearchParams(request: Request | undefined) {
  if (!request) {
    return undefined;
  }

  const url = new URL(request.url);
  const token =
    url.searchParams.get("token")?.trim() ||
    request.headers.get("x-admin-token")?.trim() ||
    bearerToken(request.headers.get("authorization"));
  const searchParams = Object.fromEntries(url.searchParams);

  if (token) {
    searchParams.token = token;
  }

  return searchParams;
}

export async function canAccessAdminRequest(request?: Request) {
  return canAccessAdmin(requestSearchParams(request));
}
