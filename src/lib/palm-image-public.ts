export type PalmImage = {
  id: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
};

type PalmImageSource = Pick<
  PalmImage,
  "id" | "contentType" | "sizeBytes" | "createdAt"
>;

export function toPublicPalmImage(image: PalmImageSource): PalmImage {
  return {
    id: image.id,
    url: `/api/images/palm/${encodeURIComponent(image.id)}`,
    contentType: image.contentType,
    sizeBytes: image.sizeBytes,
    createdAt: image.createdAt,
  };
}

export const PALM_IMAGE_SERVICE_UNAVAILABLE_BODY = {
  ok: false,
  message: "图片服务暂时不可用，请稍后再试。",
} as const;

export function toCustomerPalmImageIssue(
  imageStatus: "invalid_image" | "unverified",
) {
  if (imageStatus === "invalid_image") {
    return {
      message: "这张图片未通过手掌照片校验，本次不会生成掌纹结论。",
      imageStatus,
      imageAssessment:
        "请上传手掌正面完整入镜、光线均匀、对焦清楚且掌纹可见的照片。",
      charged: false,
    };
  }

  return {
    message: "图片暂时无法完成校验，本次不会生成掌纹结论，请稍后重试。",
    imageStatus,
    imageAssessment: "图片校验服务暂时不可用，请稍后重试。",
    charged: false,
  };
}
