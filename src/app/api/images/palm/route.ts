import { createPalmImageUpload, getUserPalmImages } from "@/lib/image-upload-store";
import { isDatabaseUnavailableError } from "@/lib/prisma";
import { getQiniuPublicUrl, isPalmImageKeyOwnedByUser } from "@/lib/qiniu";
import { getSession } from "@/lib/session";

function isSupportedImage(contentType: string) {
  return ["image/jpeg", "image/png", "image/webp"].includes(contentType);
}

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
    }

    const images = await getUserPalmImages(session.userId);

    return Response.json({
      ok: true,
      images,
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

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | {
          key?: string;
          url?: string;
          contentType?: string;
          sizeBytes?: number;
          originalName?: string;
          provider?: "qiniu" | "mock";
          hash?: string;
        }
      | null;
    const contentType = body?.contentType?.trim() ?? "";
    const sizeBytes = Number(body?.sizeBytes ?? 0);
    const key = body?.key?.trim() ?? "";
    const imageUrl = body?.url?.trim() ?? "";

    if (!key) {
      return Response.json({ ok: false, message: "图片 key 缺失。" }, { status: 400 });
    }

    if (!isPalmImageKeyOwnedByUser({ key, userId: session.userId })) {
      return Response.json(
        { ok: false, message: "图片 key 与当前账号不匹配。" },
        { status: 403 },
      );
    }

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

    const qiniuPublicUrl = body?.provider === "qiniu" ? getQiniuPublicUrl(key) : "";

    if (process.env.NODE_ENV === "production" && !/^https:\/\//i.test(qiniuPublicUrl)) {
      return Response.json(
        { ok: false, message: "正式环境只接受已上传到对象存储的真实图片。" },
        { status: 400 },
      );
    }

    const image = await createPalmImageUpload({
      userId: session.userId,
      qiniuKey: key,
      url: qiniuPublicUrl || imageUrl || `mock://${key}`,
      contentType,
      sizeBytes,
      metadata: {
        originalName: body?.originalName?.trim(),
        provider: body?.provider ?? "mock",
        hash: body?.hash,
      },
    });

    return Response.json({
      ok: true,
      image,
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
