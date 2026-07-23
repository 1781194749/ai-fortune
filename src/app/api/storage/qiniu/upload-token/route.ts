import {
  createQiniuUploadToken,
  isQiniuPublicDomainSecure,
} from "@/lib/qiniu";
import { getSession } from "@/lib/session";

function isSupportedImage(contentType: string) {
  return ["image/jpeg", "image/png", "image/webp"].includes(contentType);
}

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { filename?: string; contentType?: string; sizeBytes?: number }
    | null;
  const filename = body?.filename?.trim() ?? "palm.jpg";
  const contentType = body?.contentType?.trim() ?? "";
  const sizeBytes = Number(body?.sizeBytes ?? 0);

  if (!isSupportedImage(contentType)) {
    return Response.json(
      { ok: false, message: "请上传 JPG、PNG 或 WebP 图片。" },
      { status: 400 },
    );
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > 8 * 1024 * 1024) {
    return Response.json(
      { ok: false, message: "图片大小需在 8MB 以内。" },
      { status: 400 },
    );
  }

  if (process.env.NODE_ENV === "production" && !isQiniuPublicDomainSecure()) {
    return Response.json(
      {
        ok: false,
        code: "IMAGE_STORAGE_UNAVAILABLE",
        message: "图片服务暂未开放，请稍后再试。",
      },
      { status: 503 },
    );
  }

  const token = createQiniuUploadToken({
    userId: session.userId,
    filename,
    contentType,
    sizeBytes,
  });

  return Response.json({
    ok: true,
    ...token,
  });
}
