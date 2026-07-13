import { reconcileExpiredMemberships } from "@/lib/membership-lifecycle";

function isAuthorized(request: Request) {
  const configuredSecret = process.env.MEMBERSHIP_RECONCILE_SECRET ?? process.env.CRON_SECRET;
  const expectedSecret = configuredSecret || (process.env.NODE_ENV !== "production" ? "local-membership-reconcile" : "");

  if (!expectedSecret) {
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${expectedSecret}`;
}

async function reconcile(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false, message: "未授权的会员到期任务。" }, { status: 401 });
  }

  try {
    const result = await reconcileExpiredMemberships();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "会员到期任务执行失败。" },
      { status: 503 },
    );
  }
}

export async function GET(request: Request) {
  return reconcile(request);
}

export async function POST(request: Request) {
  return reconcile(request);
}
