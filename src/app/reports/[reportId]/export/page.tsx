import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ScrollText, Sparkles } from "lucide-react";
import { getMockReport } from "@/lib/report-store";
import { createLoginHref } from "@/lib/return-to";
import { getSession } from "@/lib/session";
import { brand } from "@/lib/site";
import { PrintActions } from "./print-actions";
import { ReportMarkdown } from "@/app/_components/report-markdown";

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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function ReportExportPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const session = await getSession();

  if (!session) {
    redirect(createLoginHref(`/reports/${encodeURIComponent(reportId)}/export`));
  }

  const report = await getMockReport(reportId);

  if (!report || report.userId !== session.userId || report.status !== "COMPLETED") {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#080705] px-5 py-8 text-[#f5efe2] sm:px-8">
      <div className="no-print mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link href={`/reports/${report.id}`} className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg border border-[#c8a15a]/55 bg-[#c8a15a]/10 text-[#f0d49a]">
            <ArrowLeft size={20} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm text-[#b9ad99]">返回报告详情</span>
            <span className="block font-ritual text-xl">{brand.cn}</span>
          </span>
        </Link>
        <PrintActions reportId={report.id} />
      </div>

      <article className="print-sheet mx-auto mt-8 max-w-5xl rounded-lg border border-[#3a3023] bg-[#fbf8f0] p-8 text-[#1b1710] shadow-2xl sm:p-12">
        <header className="border-b border-[#d7c8a6] pb-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#8a672d]">{brand.cn} · {brand.en}</p>
              <h1 className="mt-3 font-ritual text-4xl leading-tight text-[#17120b]">
                {report.title}
              </h1>
            </div>
            <span className="flex size-14 items-center justify-center rounded-lg border border-[#c8a15a] bg-[#f1e5c9] text-[#8a672d]">
              <Sparkles size={26} aria-hidden="true" />
            </span>
          </div>

          <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-[#ded0b2] bg-white/55 p-3">
              <p className="text-xs text-[#7d725f]">报告类型</p>
              <p className="mt-1 font-semibold">{reportTypeLabel(report.type)}</p>
            </div>
            <div className="rounded-md border border-[#ded0b2] bg-white/55 p-3">
              <p className="text-xs text-[#7d725f]">生成时间</p>
              <p className="mt-1 font-semibold">{formatDateTime(report.updatedAt)}</p>
            </div>
            <div className="rounded-md border border-[#ded0b2] bg-white/55 p-3">
              <p className="text-xs text-[#7d725f]">模型</p>
              <p className="mt-1 break-all font-semibold">{report.modelUsed ?? "local-tools"}</p>
            </div>
            <div className="rounded-md border border-[#ded0b2] bg-white/55 p-3">
              <p className="text-xs text-[#7d725f]">报告编号</p>
              <p className="mt-1 break-all font-semibold">{report.id}</p>
            </div>
          </div>
        </header>

        <section className="mt-8">
          <div className="flex items-center gap-2 text-[#8a672d]">
            <ScrollText size={18} aria-hidden="true" />
            <h2 className="font-ritual text-2xl text-[#17120b]">摘要</h2>
          </div>
          <p className="mt-4 rounded-md border border-[#ded0b2] bg-white/55 p-4 text-base leading-8 text-[#393126]">
            {report.summary}
          </p>
        </section>

        <section className="mt-8">
          <h2 className="font-ritual text-2xl text-[#17120b]">正文</h2>
          <div className="mt-4"><ReportMarkdown content={report.content} variant="light" /></div>
        </section>

        <footer className="mt-10 border-t border-[#d7c8a6] pt-5 text-xs leading-6 text-[#6f6555]">
          <p>
            本导出版仅包含报告正文、摘要和必要元数据，不包含用户原始输入、图片、工具原始结果或账户信息。
          </p>
          <p>内容仅供娱乐、文化参考和自我探索，不构成医疗、投资、法律或重大人生决策建议。</p>
        </footer>
      </article>
    </main>
  );
}
