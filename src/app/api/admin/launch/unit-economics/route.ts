import { canAccessAdminRequest } from "@/lib/admin-request";
import { recordAdminAudit } from "@/lib/admin-audit";
import { getLaunchUnitEconomics } from "@/lib/launch-unit-economics";
import { saveLaunchUnitEconomicsCostSample } from "@/lib/launch-unit-economics-sample";

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

  const unitEconomics = await getLaunchUnitEconomics();

  return Response.json(
    { ok: true, unitEconomics },
    { headers: { "cache-control": "no-store" } },
  );
}

function errorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "AI 成本样本保存失败。";
  }

  if (error.message === "FEATURE_CODE_INVALID") {
    return "功能类型无效。";
  }

  if (error.message === "MODEL_INVALID") {
    return "模型名称不能为空。";
  }

  if (error.message === "TOKENS_INVALID") {
    return "tokens 必须是有效的非负整数。";
  }

  if (error.message === "COST_INVALID") {
    return "成本必须是有效的分值整数。";
  }

  if (error.message === "EVIDENCE_URL_INVALID") {
    return "证据链接必须以 http:// 或 https:// 开头。";
  }

  return "AI 成本样本保存失败。";
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
    const record = await saveLaunchUnitEconomicsCostSample({
      featureCode: body.featureCode,
      model: body.model,
      tokensIn: body.tokensIn,
      tokensOut: body.tokensOut,
      costCents: body.costCents,
      scenario: body.scenario,
      evidenceUrl: body.evidenceUrl,
      note: body.note,
      request,
    });

    if (!record) {
      throw new Error("AI_COST_SAMPLE_INVALID");
    }

    await recordAdminAudit({
      request,
      action: "launch_unit_economics_sample_update",
      status: "success",
      resourceType: "launch",
      resourceId: record.id,
      message: "AI 成本样本已保存。",
      details: {
        costSampleId: record.id,
        featureCode: record.featureCode,
        model: record.model,
        tokensIn: record.tokensIn,
        tokensOut: record.tokensOut,
        costCents: record.costCents,
      },
    });

    return Response.json(
      {
        ok: true,
        message: "AI 成本样本已保存。",
        record,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    await recordAdminAudit({
      request,
      action: "launch_unit_economics_sample_update",
      status: "failed",
      resourceType: "launch",
      resourceId: typeof body.featureCode === "string" ? body.featureCode : "unknown",
      message: errorMessage(error),
    });

    return Response.json({ ok: false, message: errorMessage(error) }, { status: 400 });
  }
}
