import { publicApiErrorResponse } from "@/lib/public-api-error";
import { deleteSession } from "@/lib/session";

export async function POST() {
  try {
    await deleteSession();
    return Response.json({ ok: true, redirectTo: "/" });
  } catch (error) {
    return publicApiErrorResponse(error, {
      context: "delete customer session",
      message: "退出登录失败，请稍后重试。",
    });
  }
}
