import { recordCheckoutExperimentExposure } from "@/lib/checkout-experiment";
import { isDatabaseUnavailableError } from "@/lib/prisma";
import { publicApiErrorResponse } from "@/lib/public-api-error";
import { getSession } from "@/lib/session";

export async function POST() {
  try {
    const session = await getSession();

    if (!session) {
      return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
    }

    const record = await recordCheckoutExperimentExposure(session.userId).catch((error) => {
      if (isDatabaseUnavailableError(error)) {
        return null;
      }

      throw error;
    });

    return Response.json({
      ok: true,
      recorded: Boolean(record),
    });
  } catch (error) {
    return publicApiErrorResponse(error, {
      context: "record checkout experiment exposure",
      message: "当前暂时无法记录活动信息。",
    });
  }
}
