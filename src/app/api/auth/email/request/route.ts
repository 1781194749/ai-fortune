import {
  isExplicitLocalEmailAuthRequest,
  isValidEmail,
  normalizeEmail,
  requestEmailCode,
} from "@/lib/email-auth";
import { publicApiErrorResponse } from "@/lib/public-api-error";

async function requestEmailCodeResponse(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = normalizeEmail(body?.email ?? "");

  if (!isValidEmail(email)) {
    return Response.json(
      { ok: false, message: "请输入有效邮箱地址。" },
      { status: 400 },
    );
  }

  const localDevelopment = isExplicitLocalEmailAuthRequest(request, email);
  const { code, expiresAt } = requestEmailCode(email, { localDevelopment });

  return Response.json({
    ok: true,
    message: "验证码已生成。",
    expiresAt,
    devCode: localDevelopment ? code : undefined,
  });
}

export async function POST(request: Request) {
  try {
    return await requestEmailCodeResponse(request);
  } catch (error) {
    return publicApiErrorResponse(error, {
      context: "request email login code",
      message: "验证码暂时无法发送，请稍后重试。",
    });
  }
}
