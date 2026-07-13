import { canAccessAdminRequest } from "@/lib/admin-request";
import { recordAdminAudit } from "@/lib/admin-audit";
import { getLaunchGoalPlan } from "@/lib/launch-goal-plan";
import { saveLaunchGoalProgress } from "@/lib/launch-goal-progress";

export const dynamic = "force-dynamic";

async function readBody(request: Request) {
  return (await request.json().catch(() => null)) as
    | {
        milestoneId?: unknown;
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

  const goalPlan = await getLaunchGoalPlan();

  return Response.json(
    { ok: true, goalPlan },
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
    await saveLaunchGoalProgress({
      milestoneId: body.milestoneId,
      status: body.status,
      targetDate: body.targetDate,
      owner: body.owner,
      evidenceNote: body.evidenceNote,
      note: body.note,
    });

    await recordAdminAudit({
      action: "launch_goal_progress_update",
      status: "success",
      resourceType: "launch",
      resourceId: typeof body.milestoneId === "string" ? body.milestoneId : "unknown",
      reason: "更新 30/60/90 天目标推进",
      request,
      details: {
        milestoneId: body.milestoneId,
        status: body.status,
        targetDate: body.targetDate,
        owner: body.owner,
      },
    });

    const goalPlan = await getLaunchGoalPlan();

    return Response.json(
      {
        ok: true,
        message: "目标推进已更新。",
        goalPlan,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error && error.message === "TARGET_DATE_INVALID"
        ? "目标日期格式不正确。"
        : error instanceof Error && error.message === "MILESTONE_ID_INVALID"
          ? "目标阶段不正确。"
          : "目标推进内容不正确。";

    await recordAdminAudit({
      action: "launch_goal_progress_update",
      status: "failed",
      resourceType: "launch",
      resourceId: typeof body.milestoneId === "string" ? body.milestoneId : "unknown",
      reason: message,
      request,
      details: {
        milestoneId: body.milestoneId,
        status: body.status,
        targetDate: body.targetDate,
      },
    });

    return Response.json({ ok: false, message }, { status: 400 });
  }
}
