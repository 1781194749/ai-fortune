import { canAccessAdminRequest } from "@/lib/admin-request";
import { getLaunchPaymentPlan } from "@/lib/launch-payment-plan";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canAccessAdminRequest(request))) {
    return Response.json({ ok: false, message: "无权访问后台。" }, { status: 404 });
  }

  const paymentPlan = await getLaunchPaymentPlan();

  return Response.json(
    { ok: true, paymentPlan },
    { headers: { "cache-control": "no-store" } },
  );
}
