import {
  deletePalmImageUpload,
  getPalmImageUpload,
} from "@/lib/image-upload-store";
import {
  PALM_IMAGE_SERVICE_UNAVAILABLE_BODY,
  toPublicPalmImage,
} from "@/lib/palm-image-public";
import { publicApiErrorResponse } from "@/lib/public-api-error";
import { getQiniuPublicUrl } from "@/lib/qiniu";
import { getSession } from "@/lib/session";

function getApprovedImageSource(key: string) {
  const configuredDomain = process.env.QINIU_PUBLIC_DOMAIN?.trim();
  const sourceUrl = getQiniuPublicUrl(key);

  if (!configuredDomain || !sourceUrl) {
    return null;
  }

  try {
    const allowed = new URL(configuredDomain);
    const source = new URL(sourceUrl);
    const allowedPath = `${allowed.pathname.replace(/\/$/, "")}/`;

    if (
      allowed.protocol !== "https:" ||
      source.protocol !== "https:" ||
      source.origin !== allowed.origin ||
      !source.pathname.startsWith(allowedPath)
    ) {
      return null;
    }

    return source;
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ imageId: string }> },
) {
  try {
    const session = await getSession();

    if (!session) {
      return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
    }

    const { imageId } = await context.params;
    const image = await getPalmImageUpload(imageId);

    if (!image || image.userId !== session.userId || image.deletedAt) {
      return Response.json({ ok: false, message: "图片不存在或已删除。" }, { status: 404 });
    }

    const source = getApprovedImageSource(image.qiniuKey);

    if (!source) {
      return Response.json(PALM_IMAGE_SERVICE_UNAVAILABLE_BODY, { status: 503 });
    }

    const upstream = await fetch(source, {
      cache: "no-store",
      redirect: "error",
      headers: { Accept: image.contentType },
      signal: AbortSignal.timeout(10_000),
    });

    if (!upstream.ok || !upstream.body) {
      throw new Error(`Palm image upstream returned ${upstream.status}.`);
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": image.contentType,
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return publicApiErrorResponse(error, {
      context: "read palm image content",
      message: "图片暂时无法加载，请稍后重试。",
      status: 502,
      unavailableMessage: "图片服务暂时不可用，请稍后重试。",
    });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ imageId: string }> },
) {
  try {
    const session = await getSession();

    if (!session) {
      return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
    }

    const { imageId } = await context.params;
    const image = await deletePalmImageUpload({
      imageId,
      userId: session.userId,
    });

    if (!image) {
      return Response.json({ ok: false, message: "图片不存在或已删除。" }, { status: 404 });
    }

    return Response.json({
      ok: true,
      image: toPublicPalmImage(image),
    });
  } catch (error) {
    return publicApiErrorResponse(error, {
      context: "delete palm image record",
      message: "图片暂时无法删除，请稍后重试。",
      status: 503,
      unavailableMessage: PALM_IMAGE_SERVICE_UNAVAILABLE_BODY.message,
    });
  }
}
