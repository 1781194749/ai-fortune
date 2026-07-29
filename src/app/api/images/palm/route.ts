import { createPalmImageUpload, getUserPalmImages } from "@/lib/image-upload-store";
import {
  PALM_IMAGE_SERVICE_UNAVAILABLE_BODY,
  toPublicPalmImage,
} from "@/lib/palm-image-public";
import { publicApiErrorResponse } from "@/lib/public-api-error";
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
      images: images.map(toPublicPalmImage),
    });
  } catch (error) {
    return publicApiErrorResponse(error, {
      context: "list palm images",
      message: "图片列表暂时无法读取，请稍后重试。",
      status: 503,
      unavailableMessage: PALM_IMAGE_SERVICE_UNAVAILABLE_BODY.message,
    });
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
          contentType?: string;
          sizeBytes?: number;
          provider?: "qiniu" | "mock";
          hash?: string;
        }
      | null;
    const contentType = body?.contentType?.trim() ?? "";
    const sizeBytes = Number(body?.sizeBytes ?? 0);
    const key = body?.key?.trim() ?? "";

    if (!key) {
      return Response.json({ ok: false, message: "图片信息不完整，请重新上传。" }, { status: 400 });
    }

    if (!isPalmImageKeyOwnedByUser({ key, userId: session.userId })) {
      return Response.json(
        { ok: false, message: "这张图片不属于当前账号，请重新上传。" },
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
      url: qiniuPublicUrl || `mock://${key}`,
      contentType,
      sizeBytes,
      metadata: {
        provider: body?.provider ?? "mock",
        hash: body?.hash,
      },
    });

    return Response.json({
      ok: true,
      image: toPublicPalmImage(image),
    });
  } catch (error) {
    return publicApiErrorResponse(error, {
      context: "create palm image record",
      message: "图片信息暂时无法保存，请稍后重试。",
      status: 503,
      unavailableMessage: PALM_IMAGE_SERVICE_UNAVAILABLE_BODY.message,
    });
  }
}
