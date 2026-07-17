import { recordCheckoutExperimentExposure } from "@/lib/checkout-experiment";
import { isDatabaseUnavailableError } from "@/lib/prisma";
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
    if (isDatabaseUnavailableError(error)) {
      return Response.json(
        { ok: false, code: error.code, message: error.message },
        { status: error.status },
      );
    }

    throw error;
  }
}
