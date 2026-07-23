import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { getSharedMockReport } from "@/lib/report-store";
import { createLoginHref } from "@/lib/return-to";
import { resolveShareTrackingSource, recordShareEvent } from "@/lib/share-tracking";
import { brand } from "@/lib/site";
import { PosterCanvas } from "./poster-canvas";
import { getPublicReportView } from "@/lib/report-public-view";

function reportTypeLabel(type: string) {
  if (type === "BAZI_WUXING") {
    return "八字命盘";
  }

  if (type === "BAGUA") {
    return "六十四卦";
  }

  if (type === "PALM") {
    return "手相简析";
  }

  if (type === "YEARLY") {
    return "年度报告";
  }

  if (type === "COMPOSITE") {
    return "综合命盘";
  }

  return "塔罗解读";
}

function excerpt(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ shareSlug: string }>;
}): Promise<Metadata> {
  const { shareSlug } = await params;
  const report = await getSharedMockReport(shareSlug);

  if (!report || report.status !== "COMPLETED") {
    return {
      title: `${brand.cn} 报告海报`,
    };
  }
  const publicReport = getPublicReportView(report);

  return {
    title: `${publicReport.title}海报 - ${brand.cn}`,
    description: publicReport.summary,
  };
}

export default async function SharedReportPosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ shareSlug: string }>;
  searchParams: Promise<{
    source?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
  }>;
}) {
  const { shareSlug } = await params;
  const source = resolveShareTrackingSource(await searchParams);
  const report = await getSharedMockReport(shareSlug);

  if (!report || report.status !== "COMPLETED") {
    notFound();
  }
  const publicReport = getPublicReportView(report);

  await recordShareEvent({
    shareSlug,
    report,
    event: "poster_view",
    source,
  });

  const sharePath = `/share/${shareSlug}?source=poster_link`;
  const qrPath = `/share/${shareSlug}?source=poster_qr`;

  return (
    <main className="min-h-screen bg-[#080705] px-5 py-8 text-[#f5efe2] sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link href={`/share/${shareSlug}?source=poster_page`} className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg border border-[#c8a15a]/55 bg-[#c8a15a]/10 text-[#f0d49a]">
            <ArrowLeft size={20} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm text-[#b9ad99]">返回公开报告</span>
            <span className="block font-ritual text-xl">{brand.cn}</span>
          </span>
        </Link>
        <Link
          href={createLoginHref("/pricing#plans")}
          className="inline-flex items-center gap-2 text-sm text-[#d8cab2] hover:text-[#f0d49a]"
        >
          <Sparkles size={16} aria-hidden="true" />
          创建我的档案
        </Link>
      </div>

      <PosterCanvas
        payload={{
          brandCn: brand.cn,
          brandEn: brand.en,
          tagline: brand.tagline,
          title: publicReport.title,
          typeLabel: reportTypeLabel(report.type),
          summary: publicReport.summary,
          excerpt: excerpt(publicReport.content, 280),
          sharePath,
          qrPath,
          shareSlug,
        }}
      />
    </main>
  );
}
