import "server-only";

import { randomUUID } from "crypto";
import { ImageKind } from "@/generated/prisma/enums";
import { assertDatabaseFallbackAllowed, tryPrisma } from "@/lib/prisma";
import { ensureDbUser } from "@/lib/user-store";

export type ImageUploadRecord = {
  id: string;
  userId: string;
  kind: "PALM";
  qiniuKey: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  metadata: unknown;
  deletedAt?: string;
  createdAt: string;
};

type DbImageLike = {
  id: string;
  userId: string;
  kind: string;
  qiniuKey: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  metadata: unknown;
  deletedAt: Date | null;
  createdAt: Date;
};

declare global {
  var xuanjiImageUploads: Map<string, ImageUploadRecord> | undefined;
}

const imageUploads = globalThis.xuanjiImageUploads ?? new Map<string, ImageUploadRecord>();

if (!globalThis.xuanjiImageUploads) {
  globalThis.xuanjiImageUploads = imageUploads;
}

function requireImageDatabaseRead() {
  assertDatabaseFallbackAllowed("PostgreSQL 暂时不可用，无法读取图片记录。");
}

function requireImageDatabaseWrite() {
  assertDatabaseFallbackAllowed("PostgreSQL 暂时不可用，图片记录未保存。");
}

function toJsonValue(value: unknown) {
  if (value === undefined) {
    return undefined as never;
  }

  return JSON.parse(JSON.stringify(value)) as never;
}

function createImageId() {
  return `image_${randomUUID()}`;
}

function mapDbImage(image: DbImageLike): ImageUploadRecord {
  return {
    id: image.id,
    userId: image.userId,
    kind: "PALM",
    qiniuKey: image.qiniuKey,
    url: image.url,
    contentType: image.contentType,
    sizeBytes: image.sizeBytes,
    metadata: image.metadata,
    deletedAt: image.deletedAt?.toISOString(),
    createdAt: image.createdAt.toISOString(),
  };
}

export async function createPalmImageUpload(input: {
  userId: string;
  qiniuKey: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  metadata?: unknown;
}) {
  const dbResult = await tryPrisma(async (prisma) => {
    await ensureDbUser(prisma, { userId: input.userId });

    const image = await prisma.imageUpload.create({
      data: {
        id: createImageId(),
        userId: input.userId,
        kind: ImageKind.PALM,
        qiniuKey: input.qiniuKey,
        url: input.url,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        metadata: toJsonValue(input.metadata),
      },
    });

    return mapDbImage(image);
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireImageDatabaseWrite();

  const image: ImageUploadRecord = {
    id: createImageId(),
    userId: input.userId,
    kind: "PALM",
    qiniuKey: input.qiniuKey,
    url: input.url,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    metadata: input.metadata,
    createdAt: new Date().toISOString(),
  };

  imageUploads.set(image.id, image);
  return image;
}

export async function getPalmImageUpload(imageId: string) {
  const dbResult = await tryPrisma(async (prisma) => {
    const image = await prisma.imageUpload.findUnique({ where: { id: imageId } });
    return image ? mapDbImage(image) : null;
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireImageDatabaseRead();

  return imageUploads.get(imageId) ?? null;
}

export async function getUserPalmImages(userId: string) {
  const dbResult = await tryPrisma(async (prisma) => {
    const images = await prisma.imageUpload.findMany({
      where: { userId, kind: ImageKind.PALM, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return images.map(mapDbImage);
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireImageDatabaseRead();

  return Array.from(imageUploads.values())
    .filter((image) => image.userId === userId && !image.deletedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);
}

export async function deletePalmImageUpload(input: { imageId: string; userId: string }) {
  const dbResult = await tryPrisma(async (prisma) => {
    const image = await prisma.imageUpload.findUnique({ where: { id: input.imageId } });

    if (!image || image.userId !== input.userId || image.deletedAt) {
      return null;
    }

    const deleted = await prisma.imageUpload.update({
      where: { id: image.id },
      data: { deletedAt: new Date() },
    });

    return mapDbImage(deleted);
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  requireImageDatabaseWrite();

  const image = imageUploads.get(input.imageId);

  if (!image || image.userId !== input.userId || image.deletedAt) {
    return null;
  }

  const deleted = {
    ...image,
    deletedAt: new Date().toISOString(),
  };

  imageUploads.set(input.imageId, deleted);
  return deleted;
}
