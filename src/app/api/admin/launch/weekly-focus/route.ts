import { recordAdminAudit } from "@/lib/admin-audit";
import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchWeeklyFocus } from "@/lib/launch-weekly-focus";
import { saveLaunchWeeklyCommitment } from "@/lib/launch-weekly-commitments";

export const dynamic = "force-dynamic";

async function readBody(request: Request) {
  return (await request.json().catch(() => null)) as
    | {
        taskId?: unknown;
        status?: unknown;
        targetDate?: unknown;
        owner?: unknown;
        evidenceNote?: unknown;
        note?: unknown;
      }
    | null;
}

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const weeklyFocus = await getLaunchWeeklyFocus();

  return Response.json(
    { ok: true, weeklyFocus },
    { headers: { "cache-control": "no-store" } },
  );
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
    await saveLaunchWeeklyCommitment({
      taskId: body.taskId,
      status: body.status,
      targetDate: body.targetDate,
      owner: body.owner,
      evidenceNote: body.evidenceNote,
      note: body.note,
    });

    await recordAdminAudit({
      action: "launch_weekly_focus_update",
      status: "success",
      resourceType: "launch",
      resourceId: typeof body.taskId === "string" ? body.taskId : "unknown",
      reason: "更新本周推进任务",
      request,
      details: {
        taskId: body.taskId,
        status: body.status,
        targetDate: body.targetDate,
        owner: body.owner,
      },
    });

    const weeklyFocus = await getLaunchWeeklyFocus();

    return Response.json(
      {
        ok: true,
        message: "本周推进任务已更新。",
        weeklyFocus,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error && error.message === "TARGET_DATE_INVALID"
        ? "目标日期格式不正确。"
        : "本周推进任务或内容不正确。";

    await recordAdminAudit({
      action: "launch_weekly_focus_update",
      status: "failed",
      resourceType: "launch",
      resourceId: typeof body.taskId === "string" ? body.taskId : "unknown",
      reason: message,
      request,
      details: {
        taskId: body.taskId,
        status: body.status,
        targetDate: body.targetDate,
      },
    });

    return Response.json({ ok: false, message }, { status: 400 });
  }
}
