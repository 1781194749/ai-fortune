import { canAccessAdminRequest } from "@/lib/admin-request";
import { recordAdminAudit } from "@/lib/admin-audit";
import { saveLaunchDatabaseAcceptanceEvidence } from "@/lib/launch-database-acceptance";
import { getLaunchDatabasePlan } from "@/lib/launch-database-plan";

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

  const databasePlan = await getLaunchDatabasePlan();

  return Response.json(
    { ok: true, databasePlan },
    { headers: { "cache-control": "no-store" } },
  );
}

function errorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "数据库验收证据保存失败。";
  }

  if (error.message === "ITEM_ID_INVALID") {
    return "数据库验收条目无效。";
  }

  if (error.message === "STATUS_INVALID") {
    return "验收状态无效。";
  }

  if (error.message === "EVIDENCE_URL_INVALID") {
    return "证据链接必须以 http:// 或 https:// 开头。";
  }

  return "数据库验收证据保存失败。";
}

export async function POST(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const body = await readRequestBody(request);

  if (!isRecord(body)) {
    return Response.json({ ok: false, message: "请求体无效。" }, { status: 400 });
  }

  try {
    const record = await saveLaunchDatabaseAcceptanceEvidence({
      itemId: body.itemId,
      status: body.status,
      evidenceUrl: body.evidenceUrl,
      migrationLogUrl: body.migrationLogUrl,
      backupPolicyUrl: body.backupPolicyUrl,
      restoreDrillUrl: body.restoreDrillUrl,
      note: body.note,
      request,
    });

    await recordAdminAudit({
      request,
      action: "launch_database_acceptance_evidence_update",
      status: "success",
      resourceType: "launch",
      resourceId: record.metadata.itemId,
      message: "数据库验收证据已保存。",
      details: {
        evidenceRecordId: record.id,
        itemId: record.metadata.itemId,
        status: record.metadata.status,
      },
    });

    return Response.json(
      {
        ok: true,
        message: "数据库验收证据已保存。",
        record,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    await recordAdminAudit({
      request,
      action: "launch_database_acceptance_evidence_update",
      status: "failed",
      resourceType: "launch",
      resourceId: typeof body.itemId === "string" ? body.itemId : "unknown",
      message: errorMessage(error),
    });

    return Response.json({ ok: false, message: errorMessage(error) }, { status: 400 });
  }
}
