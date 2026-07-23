import "server-only";

import { createHmac, randomUUID } from "crypto";
import { getRuntimeFeatures } from "@/lib/features";

export type QiniuUploadTokenRequest = {
  userId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
};

const uploadHosts: Record<string, string> = {
  z0: "https://upload-z0.qiniup.com",
  z1: "https://upload-z1.qiniup.com",
  z2: "https://upload-z2.qiniup.com",
  na0: "https://upload-na0.qiniup.com",
  as0: "https://upload-as0.qiniup.com",
};

function safeBase64(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_").slice(0, 80) || "palm.jpg";
}

export function getQiniuPublicUrl(key: string) {
  const domain = process.env.QINIU_PUBLIC_DOMAIN?.replace(/\/$/, "");

  if (!domain) {
    return "";
  }

  return `${domain}/${key}`;
}

export function isQiniuPublicDomainSecure(
  env: Record<string, string | undefined> = process.env,
) {
  const domain = env.QINIU_PUBLIC_DOMAIN?.trim();

  if (!domain) {
    return false;
  }

  try {
    return new URL(domain).protocol === "https:";
  } catch {
    return false;
  }
}

export function isPalmImageKeyOwnedByUser(input: { key: string; userId: string }) {
  return input.key.startsWith(`palm/${input.userId}/`);
}

export function getQiniuUploadHost(region = process.env.QINIU_REGION) {
  return uploadHosts[region ?? ""] ?? "https://upload.qiniup.com";
}

export function createPalmImageKey(input: { userId: string; filename: string }) {
  const date = new Date().toISOString().slice(0, 10);
  return `palm/${input.userId}/${date}/${randomUUID()}-${sanitizeFilename(input.filename)}`;
}

export function createQiniuUploadToken(input: QiniuUploadTokenRequest) {
  const features = getRuntimeFeatures();
  const key = createPalmImageKey({ userId: input.userId, filename: input.filename });

  if (!features.qiniuConfigured) {
    return {
      mode: "mock" as const,
      key,
      token: "mock-qiniu-upload-token",
      uploadUrl: null,
      publicUrl: `mock://${key}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
  }

  const accessKey = process.env.QINIU_ACCESS_KEY ?? "";
  const secretKey = process.env.QINIU_SECRET_KEY ?? "";
  const bucket = process.env.QINIU_BUCKET ?? "";
  const deadline = Math.floor(Date.now() / 1000) + 60 * 60;
  const policy = {
    scope: `${bucket}:${key}`,
    deadline,
    mimeLimit: "image/*",
    fsizeLimit: Math.max(input.sizeBytes, 1),
    returnBody:
      '{"key":"$(key)","hash":"$(etag)","fsize":$(fsize),"mimeType":"$(mimeType)"}',
  };
  const encodedPolicy = safeBase64(JSON.stringify(policy));
  const encodedSign = safeBase64(
    createHmac("sha1", secretKey).update(encodedPolicy).digest(),
  );

  return {
    mode: "qiniu" as const,
    key,
    token: `${accessKey}:${encodedSign}:${encodedPolicy}`,
    uploadUrl: getQiniuUploadHost(),
    publicUrl: getQiniuPublicUrl(key),
    expiresAt: new Date(deadline * 1000).toISOString(),
  };
}
