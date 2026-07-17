import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ImageDown, MessageCircle, ScrollText, Sparkles } from "lucide-react";
import { getSharedMockReport } from "@/lib/report-store";
import { createLoginHref } from "@/lib/return-to";
import { resolveShareTrackingSource, recordShareEvent } from "@/lib/share-tracking";
import { brand } from "@/lib/site";
import { AttributionTracker } from "./attribution-tracker";
import { ShareActions } from "./share-actions";

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ shareSlug: string }>;
}): Promise<Metadata> {
  const { shareSlug } = await params;
  const report = await getSharedMockReport(shareSlug);

  if (!report || report.status !== "COMPLETED") {
    return {
      title: `${brand.cn} 公开报告`,
      description: brand.description,
    };
  }

  return {
    title: `${report.title} - ${brand.cn}`,
    description: report.summary,
    openGraph: {
      title: report.title,
      description: report.summary,
      type: "article",
    },
  };
}

export default async function SharedReportPage({
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

  await recordShareEvent({
    shareSlug,
    report,
    event: "view",
    source,
  });

  return (
    <main className="min-h-screen bg-[#080705] px-5 py-8 text-[#f5efe2] sm:px-8">
      <AttributionTracker shareSlug={shareSlug} source={source} />
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg border border-[#c8a15a]/55 bg-[#c8a15a]/10 text-[#f0d49a]">
            <Sparkles size={20} aria-hidden="true" />
          </span>
          <span>
            <span className="block font-ritual text-xl">{brand.cn}</span>
            <span className="block text-xs text-[#b9ad99]">{brand.en}</span>
          </span>
        </Link>
        <Link
          href={createLoginHref("/pricing#plans")}
          className="text-sm text-[#d8cab2] hover:text-[#f0d49a]"
        >
          创建我的档案
        </Link>
      </div>

      <article className="mx-auto mt-12 max-w-5xl rounded-lg border border-[#3a3023] bg-[#12100d] p-6">
        <div className="flex flex-col gap-5 border-b border-[#2f261a] pb-6 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-lg border border-[#c8a15a]/50 bg-[#c8a15a]/10 text-[#f0d49a]">
              <ScrollText size={24} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm text-[#b9ad99]">{reportTypeLabel(report.type)}</p>
              <h1 className="font-ritual text-4xl text-[#fff7e8]">{report.title}</h1>
            </div>
          </div>
          <div>
            <Link
              href={`/share/${shareSlug}/poster?source=share_page`}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[#c8a15a] px-3 text-sm font-semibold text-[#130f09] transition hover:bg-[#f0d49a]"
            >
              <ImageDown size={16} aria-hidden="true" />
              生成海报
            </Link>
          </div>
        </div>

        <ShareActions shareSlug={shareSlug} title={report.title} summary={report.summary} />

        <p className="mt-6 rounded-md border border-[#2f261a] bg-[#080705] p-4 leading-7 text-[#d8cab2]">
          {report.summary}
        </p>

        <div className="mt-6 whitespace-pre-line text-sm leading-8 text-[#d8cab2]">
          {report.content}
        </div>

        <div className="mt-8 rounded-md border border-[#2f261a] bg-[#080705] p-4 text-sm leading-7 text-[#b9ad99]">
          本分享页仅展示报告正文，不包含用户原始输入、图片、工具原始结果或账户信息。内容仅供娱乐、文化参考和自我探索。
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-md border border-[#3a3023] bg-[#080705] p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#f0d49a]">也想生成自己的命理档案？</p>
            <p className="mt-1 text-sm leading-6 text-[#b9ad99]">
              从塔罗、八字、八卦或手相开始，报告会沉淀到个人中心。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/chat?source=share_cta&share=${encodeURIComponent(shareSlug)}`}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-[#6a5431] px-3 text-sm text-[#fff7e8] transition hover:border-[#c8a15a]"
            >
              <MessageCircle size={16} aria-hidden="true" />
              问 AI
            </Link>
            <Link
              href={`/reports/deep?source=share_cta&share=${encodeURIComponent(shareSlug)}`}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[#c8a15a] px-3 text-sm font-semibold text-[#130f09] transition hover:bg-[#f0d49a]"
            >
              <Sparkles size={16} aria-hidden="true" />
              购买深度报告
            </Link>
          </div>
        </div>
      </article>
    </main>
  );
}
