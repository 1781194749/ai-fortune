import { isValidEmail, normalizeEmail, requestEmailCode } from "@/lib/email-auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = normalizeEmail(body?.email ?? "");

  if (!isValidEmail(email)) {
    return Response.json(
      { ok: false, message: "请输入有效邮箱地址。" },
      { status: 400 },
    );
  }

  const { code, expiresAt } = requestEmailCode(email);

  return Response.json({
    ok: true,
    message: "验证码已生成。",
    expiresAt,
    devCode: process.env.NODE_ENV === "production" ? undefined : code,
  });
}
