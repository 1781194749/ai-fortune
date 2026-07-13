import { deletePalmImageUpload } from "@/lib/image-upload-store";
import { getSession } from "@/lib/session";

export async function DELETE(
  _request: Request,
  context: { params: Promise<unknown> },
) {
  const session = await getSession();

  if (!session) {
    return Response.json({ ok: false, message: "请先登录。" }, { status: 401 });
  }

  const { imageId } = (await context.params) as { imageId: string };
  const image = await deletePalmImageUpload({
    imageId,
    userId: session.userId,
  });

  if (!image) {
    return Response.json({ ok: false, message: "图片不存在或已删除。" }, { status: 404 });
  }

  return Response.json({
    ok: true,
    image,
  });
}
