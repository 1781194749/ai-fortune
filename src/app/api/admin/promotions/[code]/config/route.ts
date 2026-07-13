import { recordAdminAudit } from "@/lib/admin-audit";
import { canAccessAdmin } from "@/lib/admin-auth";
import { getBasePromotionRules } from "@/lib/promo-code";
import { savePromotionRuntimeConfig } from "@/lib/promotion-config";

function parseOptionalLimit(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error("LIMIT_INVALID");
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const url = new URL(request.url);

  if (!(await canAccessAdmin(Object.fromEntries(url.searchParams)))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const { code: rawCode } = await context.params;
  const code = rawCode.trim().toUpperCase();
  const rule = getBasePromotionRules().find((item) => item.code === code);

  if (!rule) {
    return Response.json({ ok: false, message: "优惠码不存在。" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        enabled?: unknown;
        startsAt?: unknown;
        endsAt?: unknown;
        totalLimit?: unknown;
        perUserLimit?: unknown;
        reset?: unknown;
        note?: unknown;
      }
    | null;

  if (!body) {
    return Response.json({ ok: false, message: "请求参数不正确。" }, { status: 400 });
  }

  if (body.reset === true) {
    const metadata = await savePromotionRuntimeConfig({
      code,
      reset: true,
      note: typeof body.note === "string" ? body.note : "恢复默认配置",
    });

    await recordAdminAudit({
      action: "promotion_config_update",
      status: "success",
      resourceType: "promotion",
      resourceId: code,
      reason: "恢复优惠码默认配置",
      request,
      details: { code, reset: true },
    });

    return Response.json({ ok: true, config: metadata });
  }

  if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
    return Response.json({ ok: false, message: "启用状态不正确。" }, { status: 400 });
  }

  try {
    const startsAt = parseOptionalDate(body.startsAt);
    const endsAt = parseOptionalDate(body.endsAt);

    if (startsAt && endsAt && new Date(startsAt).getTime() > new Date(endsAt).getTime()) {
      return Response.json(
        { ok: false, message: "开始时间不能晚于结束时间。" },
        { status: 400 },
      );
    }

    const metadata = await savePromotionRuntimeConfig({
      code,
      config: {
        enabled: body.enabled,
        startsAt,
        endsAt,
        totalLimit: parseOptionalLimit(body.totalLimit),
        perUserLimit: parseOptionalLimit(body.perUserLimit),
      },
      note: typeof body.note === "string" ? body.note : "后台更新优惠码配置",
    });

    await recordAdminAudit({
      action: "promotion_config_update",
      status: "success",
      resourceType: "promotion",
      resourceId: code,
      reason: "更新优惠码运行配置",
      request,
      details: {
        code,
        enabled: body.enabled,
        startsAt,
        endsAt,
        totalLimit: body.totalLimit,
        perUserLimit: body.perUserLimit,
      },
    });

    return Response.json({ ok: true, config: metadata });
  } catch (error) {
    const message =
      error instanceof Error && error.message === "DATE_INVALID"
        ? "活动时间格式不正确。"
        : "额度必须是大于等于 0 的整数。";

    await recordAdminAudit({
      action: "promotion_config_update",
      status: "failed",
      resourceType: "promotion",
      resourceId: code,
      reason: message,
      request,
      details: { code },
    });

    return Response.json({ ok: false, message }, { status: 400 });
  }
}
