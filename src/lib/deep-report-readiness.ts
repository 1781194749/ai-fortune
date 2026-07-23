import "server-only";

import type { DeepReportProductCode } from "@/lib/deep-report";
import {
  getFortuneProfile,
  type FortuneProfileRecord,
} from "@/lib/fortune-profile-store";
import {
  getUserPalmImages,
  type ImageUploadRecord,
} from "@/lib/image-upload-store";
import {
  getUserMockReports,
  type MockReport,
} from "@/lib/report-store";

export type DeepReportRequirementCode =
  | "BAZI_PROFILE_INCOMPLETE"
  | "PALM_READING_REQUIRED";

export type DeepReportMissingRequirement = {
  code: DeepReportRequirementCode;
  label: string;
  message: string;
  href: string;
};

export type DeepReportPalmEvidence = {
  reportId: string;
  imageId: string;
  imageUrl: string;
  summary: string;
  content: string;
  analyzer?: string;
};

export type DeepReportReadiness = {
  ok: boolean;
  productCode: DeepReportProductCode;
  profile: FortuneProfileRecord | null;
  palmEvidence?: DeepReportPalmEvidence;
  missing: DeepReportMissingRequirement[];
};

export class DeepReportRequirementsError extends Error {
  readonly code = "DEEP_REPORT_REQUIREMENTS_MISSING";
  readonly status = 409;
  readonly productCode: DeepReportProductCode;
  readonly requirements: DeepReportMissingRequirement[];

  constructor(readiness: DeepReportReadiness) {
    const first = readiness.missing[0];
    super(first?.message ?? "请先补齐生成深度报告所需的资料。");
    this.name = "DeepReportRequirementsError";
    this.productCode = readiness.productCode;
    this.requirements = readiness.missing;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasCompleteBazi(profile: FortuneProfileRecord | null) {
  if (!profile || !isRecord(profile.baziChart) || !isRecord(profile.wuxingProfile)) {
    return false;
  }

  const bazi = profile.baziChart.bazi;
  const pillars = profile.baziChart.pillars;
  const counts = profile.wuxingProfile.counts;
  const strongest = profile.wuxingProfile.strongest;
  const weakest = profile.wuxingProfile.weakest;

  return (
    Array.isArray(bazi) &&
    bazi.length === 4 &&
    bazi.every((item) => typeof item === "string" && item.trim().length >= 2) &&
    Array.isArray(pillars) &&
    pillars.length === 4 &&
    isRecord(counts) &&
    typeof strongest === "string" &&
    strongest.length > 0 &&
    Array.isArray(weakest) &&
    weakest.length > 0
  );
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getPalmReportImageId(report: MockReport) {
  return isRecord(report.inputSnapshot)
    ? readString(report.inputSnapshot.imageId)
    : undefined;
}

function isUsablePalmImage(image: ImageUploadRecord) {
  if (image.deletedAt || image.sizeBytes <= 0 || !image.contentType.startsWith("image/")) {
    return false;
  }

  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  try {
    const url = new URL(image.url);
    const metadata = isRecord(image.metadata) ? image.metadata : {};

    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      metadata.provider !== "mock"
    );
  } catch {
    return false;
  }
}

function getPalmAnalyzer(report: MockReport) {
  return isRecord(report.toolResults)
    ? readString(report.toolResults.analyzer)
    : undefined;
}

function findPalmEvidence(reports: MockReport[], images: ImageUploadRecord[]) {
  const imagesById = new Map(
    images.filter(isUsablePalmImage).map((image) => [image.id, image]),
  );

  for (const report of reports) {
    if (report.type !== "PALM" || report.status !== "COMPLETED") {
      continue;
    }

    const imageId = getPalmReportImageId(report);
    const image = imageId ? imagesById.get(imageId) : undefined;

    if (!image) {
      continue;
    }

    return {
      reportId: report.id,
      imageId: image.id,
      imageUrl: image.url,
      summary: report.summary,
      content: report.content,
      analyzer: getPalmAnalyzer(report),
    } satisfies DeepReportPalmEvidence;
  }

  return undefined;
}

export async function getDeepReportReadiness(input: {
  userId: string;
  productCode: DeepReportProductCode;
}) {
  const needsPalm = input.productCode === "composite_report";
  const [profile, reports, images] = await Promise.all([
    getFortuneProfile(input.userId),
    needsPalm ? getUserMockReports(input.userId) : Promise.resolve([]),
    needsPalm ? getUserPalmImages(input.userId) : Promise.resolve([]),
  ]);
  const missing: DeepReportMissingRequirement[] = [];

  if (!hasCompleteBazi(profile)) {
    missing.push({
      code: "BAZI_PROFILE_INCOMPLETE",
      label: "完成八字排盘",
      message: "请先填写出生日期和时辰并完成一次八字排盘；资料补齐前不会创建订单或扣除报告额度。",
      href: "/bazi",
    });
  }

  const palmEvidence = needsPalm ? findPalmEvidence(reports, images) : undefined;

  if (needsPalm && !palmEvidence) {
    missing.push({
      code: "PALM_READING_REQUIRED",
      label: "完成手相分析",
      message: "手相 + 八字综合报告需要先上传清晰手掌照片并完成一次手相分析。",
      href: "/palm",
    });
  }

  return {
    ok: missing.length === 0,
    productCode: input.productCode,
    profile,
    palmEvidence,
    missing,
  } satisfies DeepReportReadiness;
}

export async function assertDeepReportReady(input: {
  userId: string;
  productCode: DeepReportProductCode;
}) {
  const readiness = await getDeepReportReadiness(input);

  if (!readiness.ok) {
    throw new DeepReportRequirementsError(readiness);
  }

  return readiness;
}

export function getDeepReportRequirementsErrorResponse(error: DeepReportRequirementsError) {
  return {
    ok: false as const,
    code: error.code,
    message: error.message,
    productCode: error.productCode,
    requirements: error.requirements,
    nextAction: error.requirements[0],
  };
}
