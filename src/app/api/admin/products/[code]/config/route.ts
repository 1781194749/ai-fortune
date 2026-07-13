import { recordAdminAudit } from "@/lib/admin-audit";
import { canAccessAdmin } from "@/lib/admin-auth";
import { membershipProducts, type ProductRuntimeOverride } from "@/lib/commerce";
import { saveProductRuntimeConfig } from "@/lib/product-config";

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function parseBoolean(value: unknown, field: string) {
  if (typeof value !== "boolean") {
    throw new Error(`${field}_INVALID`);
  }

  return value;
}

function parseNonNegativeInteger(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${field}_INVALID`);
  }

  return value;
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
  const code = rawCode.trim();
  const product = membershipProducts.find((item) => item.code === code);

  if (!product) {
    return Response.json({ ok: false, message: "套餐不存在。" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | (ProductRuntimeOverride & {
        reset?: unknown;
        note?: unknown;
      })
    | null;

  if (!body) {
    return Response.json({ ok: false, message: "请求参数不正确。" }, { status: 400 });
  }

  if (body.reset === true) {
    const metadata = await saveProductRuntimeConfig({
      code: product.code,
      reset: true,
      note: typeof body.note === "string" ? body.note : "恢复默认套餐配置",
    });

    await recordAdminAudit({
      action: "product_config_update",
      status: "success",
      resourceType: "product",
      resourceId: product.code,
      reason: "恢复套餐默认配置",
      request,
      details: { code: product.code, reset: true },
    });

    return Response.json({ ok: true, config: metadata });
  }

  try {
    const name = readString(body.name);
    const description = readString(body.description);

    if (!name) {
      return Response.json({ ok: false, message: "套餐名称不能为空。" }, { status: 400 });
    }

    if (!description) {
      return Response.json({ ok: false, message: "套餐描述不能为空。" }, { status: 400 });
    }

    const config = {
      enabled: parseBoolean(body.enabled, "enabled"),
      highlighted: parseBoolean(body.highlighted, "highlighted"),
      name,
      priceCents: parseNonNegativeInteger(body.priceCents, "priceCents"),
      starGrant: parseNonNegativeInteger(body.starGrant, "starGrant"),
      durationDays: parseNonNegativeInteger(body.durationDays, "durationDays"),
      reportQuota: parseNonNegativeInteger(body.reportQuota, "reportQuota"),
      palmQuota: parseNonNegativeInteger(body.palmQuota, "palmQuota"),
      description,
    } satisfies ProductRuntimeOverride;

    const metadata = await saveProductRuntimeConfig({
      code: product.code,
      config,
      note: typeof body.note === "string" ? body.note : "后台更新套餐配置",
    });

    await recordAdminAudit({
      action: "product_config_update",
      status: "success",
      resourceType: "product",
      resourceId: product.code,
      reason: "更新套餐运行配置",
      request,
      details: { code: product.code, ...config },
    });

    return Response.json({ ok: true, config: metadata });
  } catch {
    const message = "价格、额度和天数必须是大于等于 0 的整数。";

    await recordAdminAudit({
      action: "product_config_update",
      status: "failed",
      resourceType: "product",
      resourceId: product.code,
      reason: message,
      request,
      details: { code: product.code },
    });

    return Response.json({ ok: false, message }, { status: 400 });
  }
}
