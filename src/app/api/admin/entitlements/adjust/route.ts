import { recordAdminAudit } from "@/lib/admin-audit";
import {
  adjustMemberEntitlement,
  type MemberEntitlementKind,
} from "@/lib/entitlement-store";
import { canAccessAdminRequest } from "@/lib/admin-request";

function normalizeKind(value: unknown): MemberEntitlementKind | undefined {
  return value === "deep_report" || value === "palm_reading" ? value : undefined;
}

function normalizeIdempotencyKey(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return typeof value === "string" && value.length <= 160 ? value : undefined;
}

export async function POST(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无后台权限。" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        userId?: unknown;
        kind?: unknown;
        amount?: unknown;
        reason?: unknown;
        idempotencyKey?: unknown;
      }
    | null;
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const kind = normalizeKind(body?.kind);
  const amount = body?.amount;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const idempotencyKey = normalizeIdempotencyKey(body?.idempotencyKey);

  if (!userId || !kind) {
    return Response.json(
      { ok: false, message: "请提供用户 ID 和权益类型。" },
      { status: 400 },
    );
  }

  if (
    typeof amount !== "number" ||
    !Number.isInteger(amount) ||
    amount === 0 ||
    Math.abs(amount) > 100
  ) {
    const message = "调整数量必须是 -100 到 100 之间的非 0 整数。";

    await recordAdminAudit({
      request,
      action: "entitlement_adjust",
      status: "failed",
      resourceType: "entitlement",
      resourceId: `${userId}:${kind}`,
      targetUserId: userId,
      amount: typeof amount === "number" ? amount : undefined,
      reason,
      message,
      details: { kind },
    });

    return Response.json({ ok: false, message }, { status: 400 });
  }
  const adjustmentAmount = amount;

  if (!reason || reason.length > 120) {
    const message = "请填写 1-120 字的调整原因。";

    await recordAdminAudit({
      request,
      action: "entitlement_adjust",
      status: "failed",
      resourceType: "entitlement",
      resourceId: `${userId}:${kind}`,
      targetUserId: userId,
      amount: adjustmentAmount,
      reason,
      message,
      details: { kind },
    });

    return Response.json({ ok: false, message }, { status: 400 });
  }

  const result = await adjustMemberEntitlement({
    userId,
    kind,
    amount: adjustmentAmount,
    reason,
    idempotencyKey,
    metadata: {
      operator: "admin",
      adjustmentReason: reason,
    },
  });

  if (!result.ok) {
    const message = "当前余额不足，不能扣成负数。";

    await recordAdminAudit({
      request,
      action: "entitlement_adjust",
      status: "failed",
      resourceType: "entitlement",
      resourceId: `${userId}:${kind}`,
      targetUserId: userId,
      amount: adjustmentAmount,
      reason,
      message,
      details: {
        kind,
        balance: result.balance,
        failureReason: result.reason,
      },
    });

    return Response.json({ ok: false, message, balance: result.balance }, { status: 409 });
  }

  await recordAdminAudit({
    request,
    action: "entitlement_adjust",
    status: "success",
    resourceType: "entitlement",
    resourceId: `${userId}:${kind}`,
    targetUserId: userId,
    amount: adjustmentAmount,
    reason,
    message: adjustmentAmount > 0 ? "已补发会员权益额度。" : "已扣回会员权益额度。",
    details: {
      kind,
      transactionId: result.transaction.id,
      balanceAfter: result.transaction.balanceAfter,
      idempotencyKey,
    },
  });

  return Response.json({
    ok: true,
    transaction: result.transaction,
    balance: result.balance,
  });
}
