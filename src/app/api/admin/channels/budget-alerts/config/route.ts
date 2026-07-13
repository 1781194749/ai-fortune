import { recordAdminAudit } from "@/lib/admin-audit";
import { canAccessAdmin } from "@/lib/admin-auth";
import { saveChannelBudgetAlertConfig } from "@/lib/channel-budget-alert-config";

function readNumber(value: unknown, name: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name}_INVALID`);
  }

  return value;
}

function readInteger(value: unknown, name: string) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${name}_INVALID`);
  }

  return value;
}

export async function PATCH(request: Request) {
  const url = new URL(request.url);

  if (!(await canAccessAdmin(Object.fromEntries(url.searchParams)))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        breakEvenRoi?: unknown;
        healthyRoi?: unknown;
        endingSoonDays?: unknown;
        noPaidLandingThreshold?: unknown;
        highBudgetCents?: unknown;
        note?: unknown;
      }
    | null;

  if (!body) {
    return Response.json({ ok: false, message: "请求参数不正确。" }, { status: 400 });
  }

  try {
    const breakEvenRoi = readNumber(body.breakEvenRoi, "BREAK_EVEN_ROI");
    const healthyRoi = readNumber(body.healthyRoi, "HEALTHY_ROI");
    const endingSoonDays = readInteger(body.endingSoonDays, "ENDING_SOON_DAYS");
    const noPaidLandingThreshold = readInteger(
      body.noPaidLandingThreshold,
      "NO_PAID_LANDING_THRESHOLD",
    );
    const highBudgetCents = readInteger(body.highBudgetCents, "HIGH_BUDGET_CENTS");

    if (
      breakEvenRoi < 0 ||
      healthyRoi < breakEvenRoi ||
      healthyRoi > 20 ||
      endingSoonDays < 0 ||
      endingSoonDays > 30 ||
      noPaidLandingThreshold < 0 ||
      noPaidLandingThreshold > 1000 ||
      highBudgetCents < 0
    ) {
      throw new Error("CONFIG_RANGE_INVALID");
    }

    const config = await saveChannelBudgetAlertConfig({
      breakEvenRoi,
      healthyRoi,
      endingSoonDays,
      noPaidLandingThreshold,
      highBudgetCents,
      note: typeof body.note === "string" ? body.note : "后台更新预算预警阈值",
    });

    await recordAdminAudit({
      action: "channel_budget_alert_config_update",
      status: "success",
      resourceType: "channel",
      resourceId: "budget-alerts",
      reason: "更新渠道预算预警阈值",
      request,
      details: {
        breakEvenRoi,
        healthyRoi,
        endingSoonDays,
        noPaidLandingThreshold,
        highBudgetCents,
      },
    });

    return Response.json({ ok: true, config });
  } catch {
    await recordAdminAudit({
      action: "channel_budget_alert_config_update",
      status: "failed",
      resourceType: "channel",
      resourceId: "budget-alerts",
      reason: "渠道预算预警阈值不正确",
      request,
    });

    return Response.json(
      { ok: false, message: "阈值不正确，请检查倍数、天数和金额范围。" },
      { status: 400 },
    );
  }
}
