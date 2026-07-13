import { recordCheckoutExperimentExposure } from "@/lib/checkout-experiment";
import { getSession } from "@/lib/session";

export async function POST() {
  const session = await getSession();

  if (!session) {
    return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
  }

  const record = await recordCheckoutExperimentExposure(session.userId);

  return Response.json({
    ok: true,
    recorded: Boolean(record),
  });
}
