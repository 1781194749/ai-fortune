import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchDecision } from "@/lib/launch-decision";
import { getLaunchGoalPlan } from "@/lib/launch-goal-plan";
import { snapshotLaunchGoalTransitionGate } from "@/lib/launch-goal-transition-gate";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const baseDecision = await getLaunchDecision();
  const goalPlan = await getLaunchGoalPlan({ decision: baseDecision });
  const decision = await getLaunchDecision({
    goalTransitionGate: snapshotLaunchGoalTransitionGate(goalPlan.transitionGate),
  });

  return Response.json(
    { ok: true, decision },
    { headers: { "cache-control": "no-store" } },
  );
}
