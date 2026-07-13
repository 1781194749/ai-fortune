import { canAccessAdminRequest } from "@/lib/admin-request";
import {
  archiveLaunchEvidence,
  getLaunchEvidenceArchives,
} from "@/lib/launch-evidence";
import { getLaunchGoalPlan } from "@/lib/launch-goal-plan";
import { snapshotLaunchGoalTransitionGate } from "@/lib/launch-goal-transition-gate";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readRequestBody(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return {};
  }

  return (await request.json().catch(() => ({}))) as unknown;
}

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const archives = await getLaunchEvidenceArchives({ take: 10 });

  return Response.json(
    { ok: true, archives },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const body = await readRequestBody(request);
  const goalPlan = await getLaunchGoalPlan();
  const archive = await archiveLaunchEvidence({
    request,
    note: isRecord(body) ? body.note : undefined,
    goalTransitionGate: snapshotLaunchGoalTransitionGate(goalPlan.transitionGate),
  });

  return Response.json(
    {
      ok: true,
      message: "上线证据已归档。",
      archive,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
