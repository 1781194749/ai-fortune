import { recordAdminAudit } from "@/lib/admin-audit";
import { canAccessAdminRequest } from "@/lib/admin-request";
import {
  getLaunchExternalReadiness,
  saveLaunchExternalReadinessItem,
  saveLaunchExternalReadinessItems,
} from "@/lib/launch-external-readiness";

export const dynamic = "force-dynamic";

async function readBody(request: Request) {
  return (await request.json().catch(() => null)) as
    | {
        items?: Array<{
          id?: unknown;
          status?: unknown;
          targetDate?: unknown;
          receiptNo?: unknown;
          evidenceUrl?: unknown;
          evidenceNote?: unknown;
          note?: unknown;
        }>;
        id?: unknown;
        status?: unknown;
        targetDate?: unknown;
        receiptNo?: unknown;
        evidenceUrl?: unknown;
        evidenceNote?: unknown;
        note?: unknown;
      }
    | null;
}

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const readiness = await getLaunchExternalReadiness();

  return Response.json(
    { ok: true, readiness },
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
    const isBatch = Array.isArray(body.items);
    const result = isBatch
      ? await saveLaunchExternalReadinessItems({
          items: body.items ?? [],
        })
      : await saveLaunchExternalReadinessItem({
          id: body.id,
          status: body.status,
          targetDate: body.targetDate,
          receiptNo: body.receiptNo,
          evidenceUrl: body.evidenceUrl,
          evidenceNote: body.evidenceNote,
          note: body.note,
        });

    await recordAdminAudit({
      action: "launch_external_readiness_update",
      status: "success",
      resourceType: "launch",
      resourceId: isBatch ? "batch" : typeof body.id === "string" ? body.id : "unknown",
      reason: isBatch ? "批量更新外部上线事项" : "更新外部上线事项",
      request,
      details: isBatch
        ? {
            count: body.items?.length ?? 0,
            ids: body.items?.map((item) => item.id),
            statuses: body.items?.map((item) => item.status),
          }
        : {
            id: body.id,
            status: body.status,
            targetDate: body.targetDate,
            receiptNo: body.receiptNo,
            evidenceUrl: body.evidenceUrl,
          },
    });

    return Response.json(
      {
        ok: true,
        message: isBatch ? "外部上线事项已批量更新。" : "外部上线事项已更新。",
        readiness: result.readiness,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error && error.message === "TARGET_DATE_INVALID"
        ? "目标日期格式不正确。"
        : error instanceof Error && error.message === "EVIDENCE_URL_INVALID"
          ? "证据链接必须是 http 或 https 地址。"
        : "外部上线事项或状态不正确。";

    await recordAdminAudit({
      action: "launch_external_readiness_update",
      status: "failed",
      resourceType: "launch",
      resourceId: Array.isArray(body.items)
        ? "batch"
        : typeof body.id === "string"
          ? body.id
          : "unknown",
      reason: message,
      request,
      details: Array.isArray(body.items)
        ? {
            count: body.items.length,
            ids: body.items.map((item) => item.id),
            statuses: body.items.map((item) => item.status),
          }
        : {
            id: body.id,
            status: body.status,
            receiptNo: body.receiptNo,
            evidenceUrl: body.evidenceUrl,
          },
    });

    return Response.json({ ok: false, message }, { status: 400 });
  }
}
