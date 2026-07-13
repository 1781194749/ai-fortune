import "server-only";

import { canAccessAdmin } from "@/lib/admin-auth";

export async function canAccessAdminRequest(request?: Request) {
  void request;

  return canAccessAdmin();
}
