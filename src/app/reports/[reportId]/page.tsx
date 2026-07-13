import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  BadgeCheck,
  Clock3,
  Download,
  ScrollText,
  Share2,
  Sparkles,
  XCircle,
} from "lucide-react";
import { getMockReport } from "@/lib/report-store";
import { createLoginHref } from "@/lib/return-to";
import { getSession } from "@/lib/session";
import { brand } from "@/lib/site";
import { ReportAutoRefresh } from "./report-auto-refresh";
import { ReportShareControl } from "./share-control";

function statusMeta(status: string) {
  if (status === "GENERATING") {
    return {
      label: "生成中",
      className: "border-[#6a5431] text-[#f0d49a]",
      icon: Clock3,
    };
  }

  if (status === "FAILED") {
    return {
      label: "失败",
      className: "border-[#5d2b22] text-[#e08b74]",
      icon: XCircle,
    };
  }

  return {
    label: "已完成",
    className: "border-[#2f594b] text-[#8ad5bd]",
    icon: BadgeCheck,
  };
}

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const session = await getSession();

  if (!session) {
    redirect(createLoginHref(`/reports/${encodeURIComponent(reportId)}`));
  }

  const report = await getMockReport(reportId);

  if (!report || report.userId !== session.userId) {
    notFound();
  }

  const status = statusMeta(report.status);
  const StatusIcon = status.icon;
  const isCompleted = report.status === "COMPLETED";
  const sharePath = isCompleted && report.shareSlug ? `/share/${report.shareSlug}` : null;

  return (
    <main className="min-h-screen bg-[#080705] px-5 py-8 text-[#f5efe2] sm:px-8">
      <ReportAutoRefresh enabled={report.status === "GENERATING"} />
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
        <Link href="/member" className="text-sm text-[#d8cab2] hover:text-[#f0d49a]">
          返回个人中心
        </Link>
      </div>

      <article className="mx-auto mt-12 max-w-5xl rounded-lg border border-[#3a3023] bg-[#12100d] p-6">
        <div className="flex flex-col gap-5 border-b border-[#2f261a] pb-6 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-lg border border-[#c8a15a]/50 bg-[#c8a15a]/10 text-[#f0d49a]">
              <ScrollText size={24} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm text-[#b9ad99]">报告编号：{report.id}</p>
              <h1 className="font-ritual text-4xl text-[#fff7e8]">{report.title}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm ${status.className}`}
            >
              <StatusIcon size={16} aria-hidden="true" />
              {status.label}
            </span>
            {sharePath ? (
              <Link
                href={sharePath}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-[#6a5431] px-3 text-sm text-[#fff7e8] transition hover:border-[#c8a15a]"
              >
                <Share2 size={16} aria-hidden="true" />
                分享页
              </Link>
            ) : null}
            {isCompleted ? (
              <Link
                href={`/reports/${report.id}/export`}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-[#c8a15a] px-3 text-sm font-semibold text-[#130f09] transition hover:bg-[#f0d49a]"
              >
                <Download size={16} aria-hidden="true" />
                导出
              </Link>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
            <p className="text-xs text-[#b9ad99]">报告类型</p>
            <p className="mt-2 text-sm font-semibold text-[#fff7e8]">{report.type}</p>
          </div>
          <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
            <p className="text-xs text-[#b9ad99]">模型</p>
            <p className="mt-2 text-sm font-semibold text-[#fff7e8]">
              {report.modelUsed ?? "local-tools"}
            </p>
          </div>
          <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
            <p className="text-xs text-[#b9ad99]">成本 token</p>
            <p className="mt-2 text-sm font-semibold text-[#fff7e8]">
              {report.costTokens ?? 0}
            </p>
          </div>
          <div className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
            <p className="text-xs text-[#b9ad99]">分享标识</p>
            <p className="mt-2 break-all text-sm font-semibold text-[#fff7e8]">
              {report.shareSlug ?? "未生成"}
            </p>
          </div>
        </div>

        <p className="mt-6 rounded-md border border-[#2f261a] bg-[#080705] p-4 leading-7 text-[#d8cab2]">
          {report.summary}
        </p>

        {isCompleted ? (
          <ReportShareControl reportId={report.id} initialShareSlug={report.shareSlug} />
        ) : (
          <div className="mt-6 rounded-md border border-[#2f261a] bg-[#080705] p-4 text-sm leading-6 text-[#b9ad99]">
            当前报告状态为「{status.label}」，完成后可开启公开分享。
          </div>
        )}

        <div className="mt-6 whitespace-pre-line text-sm leading-8 text-[#d8cab2]">
          {report.content}
        </div>

        <details className="mt-8 rounded-md border border-[#2f261a] bg-[#080705] p-4">
          <summary className="cursor-pointer text-sm font-semibold text-[#f0d49a]">
            查看工具结果
          </summary>
          <pre className="mt-4 max-h-[420px] overflow-auto text-xs leading-6 text-[#b9ad99]">
            {JSON.stringify(report.toolResults, null, 2)}
          </pre>
        </details>
      </article>
    </main>
  );
}
