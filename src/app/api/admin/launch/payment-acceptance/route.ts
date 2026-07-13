import { canAccessAdminRequest } from "@/lib/admin-request";
import { recordAdminAudit } from "@/lib/admin-audit";
import {
  getLaunchPaymentAcceptance,
  saveLaunchPaymentAcceptanceEvidence,
} from "@/lib/launch-payment-acceptance";

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

  const paymentAcceptance = await getLaunchPaymentAcceptance();

  return Response.json(
    { ok: true, paymentAcceptance },
    { headers: { "cache-control": "no-store" } },
  );
}

function errorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "支付验收证据保存失败。";
  }

  if (error.message === "CHANNEL_INVALID") {
    return "支付渠道无效。";
  }

  if (error.message === "STATUS_INVALID") {
    return "验收状态无效。";
  }

  if (error.message === "AMOUNT_INVALID") {
    return "金额必须是有效的分值整数。";
  }

  if (error.message === "EVIDENCE_URL_INVALID") {
    return "证据链接必须以 http:// 或 https:// 开头。";
  }

  return "支付验收证据保存失败。";
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
    const record = await saveLaunchPaymentAcceptanceEvidence({
      channel: body.channel,
      status: body.status,
      orderId: body.orderId,
      providerOrderId: body.providerOrderId,
      amountCents: body.amountCents,
      evidenceUrl: body.evidenceUrl,
      reconciliationUrl: body.reconciliationUrl,
      note: body.note,
      request,
    });

    await recordAdminAudit({
      request,
      action: "launch_payment_acceptance_evidence_update",
      status: "success",
      resourceType: "launch",
      resourceId: record.metadata.channel,
      message: "支付验收证据已保存。",
      details: {
        evidenceRecordId: record.id,
        channel: record.metadata.channel,
        orderId: record.metadata.orderId,
        status: record.metadata.status,
      },
    });

    return Response.json(
      {
        ok: true,
        message: "支付验收证据已保存。",
        record,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    await recordAdminAudit({
      request,
      action: "launch_payment_acceptance_evidence_update",
      status: "failed",
      resourceType: "launch",
      resourceId: typeof body.channel === "string" ? body.channel : "unknown",
      message: errorMessage(error),
    });

    return Response.json({ ok: false, message: errorMessage(error) }, { status: 400 });
  }
}
