import { recordAdminAudit } from "@/lib/admin-audit";
import { canAccessAdminRequest } from "@/lib/admin-request";
import {
  checkoutExperimentKey,
  saveCheckoutExperimentConfig,
  type CheckoutExperimentVariant,
} from "@/lib/checkout-experiment";

function normalizeVariant(value: unknown): CheckoutExperimentVariant | undefined {
  return value === "first50" || value === "xuanji20" ? value : undefined;
}

export async function PATCH(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        mode?: unknown;
        forcedVariant?: unknown;
        note?: unknown;
      }
    | null;

  if (!body || (body.mode !== "experiment" && body.mode !== "forced")) {
    return Response.json({ ok: false, message: "实验配置参数不正确。" }, { status: 400 });
  }

  const forcedVariant = normalizeVariant(body.forcedVariant);

  if (body.mode === "forced" && !forcedVariant) {
    return Response.json({ ok: false, message: "请选择要固化的变体。" }, { status: 400 });
  }

  const config = await saveCheckoutExperimentConfig({
    mode: body.mode,
    forcedVariant: body.mode === "forced" ? forcedVariant : undefined,
    note: typeof body.note === "string" ? body.note : "后台更新首单实验策略",
  });

  await recordAdminAudit({
    action: "checkout_experiment_config_update",
    status: "success",
    resourceType: "experiment",
    resourceId: checkoutExperimentKey,
    reason: body.mode === "forced" ? "固化首单实验胜出变体" : "恢复首单实验 A/B 分流",
    request,
    details: {
      mode: config.mode,
      forcedVariant: config.forcedVariant,
    },
  });

  return Response.json({
    ok: true,
    config,
  });
}
