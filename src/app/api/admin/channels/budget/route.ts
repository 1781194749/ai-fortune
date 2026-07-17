import { recordAdminAudit } from "@/lib/admin-audit";
import { canAccessAdminRequest } from "@/lib/admin-request";
import { normalizeChannelSource } from "@/lib/channel-source";
import { saveChannelBudgetConfig } from "@/lib/channel-budget-config";

function parseBudgetCents(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error("BUDGET_INVALID");
  }

  return value;
}

function parseOptionalDate(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
    throw new Error("DATE_INVALID");
  }

  return new Date(value).toISOString();
}

export async function PATCH(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        source?: unknown;
        budgetCents?: unknown;
        startsAt?: unknown;
        endsAt?: unknown;
        reset?: unknown;
        note?: unknown;
      }
    | null;

  if (!body || typeof body.source !== "string" || !body.source.trim()) {
    return Response.json({ ok: false, message: "请填写渠道 source。" }, { status: 400 });
  }

  const source = normalizeChannelSource(body.source);

  if (body.reset === true) {
    const metadata = await saveChannelBudgetConfig({
      source,
      reset: true,
      note: typeof body.note === "string" ? body.note : "后台清除渠道预算",
    });

    await recordAdminAudit({
      action: "channel_budget_config_update",
      status: "success",
      resourceType: "channel",
      resourceId: source,
      reason: "清除渠道投放预算",
      request,
      details: { source, reset: true },
    });

    return Response.json({ ok: true, config: metadata, source });
  }

  try {
    const budgetCents = parseBudgetCents(body.budgetCents);
    const startsAt = parseOptionalDate(body.startsAt);
    const endsAt = parseOptionalDate(body.endsAt);

    if (startsAt && endsAt && new Date(startsAt).getTime() > new Date(endsAt).getTime()) {
      await recordAdminAudit({
        action: "channel_budget_config_update",
        status: "failed",
        resourceType: "channel",
        resourceId: source,
        reason: "开始时间不能晚于结束时间",
        request,
        details: { source, startsAt, endsAt },
      });

      return Response.json(
        { ok: false, message: "开始时间不能晚于结束时间。" },
        { status: 400 },
      );
    }

    const metadata = await saveChannelBudgetConfig({
      source,
      budgetCents,
      startsAt,
      endsAt,
      note: typeof body.note === "string" ? body.note : "后台更新渠道预算",
    });

    await recordAdminAudit({
      action: "channel_budget_config_update",
      status: "success",
      resourceType: "channel",
      resourceId: source,
      amount: budgetCents,
      reason: "更新渠道投放预算",
      request,
      details: { source, budgetCents, startsAt, endsAt },
    });

    return Response.json({ ok: true, config: metadata, source });
  } catch (error) {
    const message =
      error instanceof Error && error.message === "DATE_INVALID"
        ? "预算周期时间格式不正确。"
        : "预算必须是大于等于 0 的整数分。";

    await recordAdminAudit({
      action: "channel_budget_config_update",
      status: "failed",
      resourceType: "channel",
      resourceId: source,
      reason: message,
      request,
      details: { source },
    });

    return Response.json(
      { ok: false, message },
      { status: 400 },
    );
  }
}
