import { recordAdminAudit } from "@/lib/admin-audit";
import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchDailyBrief } from "@/lib/launch-daily-brief";
import { saveLaunchDailyActionProgress } from "@/lib/launch-daily-action-progress";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const dailyBrief = await getLaunchDailyBrief();

  return Response.json(
    { ok: true, dailyBrief },
    { headers: { "cache-control": "no-store" } },
  );
}

async function readBody(request: Request) {
  return (await request.json().catch(() => null)) as
    | {
        actionId?: unknown;
        status?: unknown;
        owner?: unknown;
        evidenceNote?: unknown;
        note?: unknown;
      }
    | null;
}

export async function PATCH(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const body = await readBody(request);

  if (!body) {
    return Response.json({ ok: false, message: "请求内容不正确。" }, { status: 400 });
  }

  try {
    await saveLaunchDailyActionProgress({
      actionId: body.actionId,
      status: body.status,
      owner: body.owner,
      evidenceNote: body.evidenceNote,
      note: body.note,
    });

    await recordAdminAudit({
      action: "launch_daily_action_progress_update",
      status: "success",
      resourceType: "launch",
      resourceId: typeof body.actionId === "string" ? body.actionId : "unknown",
      reason: "更新今日目标推进动作",
      request,
      details: {
        actionId: body.actionId,
        status: body.status,
        owner: body.owner,
      },
    });

    const dailyBrief = await getLaunchDailyBrief();

    return Response.json(
      {
        ok: true,
        message: "今日推进动作已更新。",
        dailyBrief,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error && error.message === "ACTION_ID_INVALID"
        ? "今日动作不正确。"
        : "今日推进动作内容不正确。";

    await recordAdminAudit({
      action: "launch_daily_action_progress_update",
      status: "failed",
      resourceType: "launch",
      resourceId: typeof body.actionId === "string" ? body.actionId : "unknown",
      reason: message,
      request,
      details: {
        actionId: body.actionId,
        status: body.status,
      },
    });

    return Response.json({ ok: false, message }, { status: 400 });
  }
}
