import Link from "next/link";
import { FileText, ScrollText } from "lucide-react";
import { getUserMockReports } from "@/lib/report-store";
import {
  formatTime,
  getReportStatusLabel,
  getReportTypeLabel,
  getRequiredMemberSession,
} from "../member-data";
import { EmptyState, PageHeader, Panel } from "../member-ui";

export default async function MemberReportsPage() {
  const session = await getRequiredMemberSession();
  const reports = await getUserMockReports(session.userId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reports"
        title="报告文件"
        description="报告列表独立出来，方便以后做筛选、导出和分享管理。"
        action={{ href: "/reports/deep", label: "生成深度报告", icon: ScrollText }}
      />

      <Panel title="全部报告" description="按更新时间倒序展示" icon={FileText}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-[#252a32] text-xs text-[#697386]">
              <tr>
                <th className="px-5 py-3 font-medium">报告</th>
                <th className="px-5 py-3 font-medium">类型</th>
                <th className="px-5 py-3 font-medium">状态</th>
                <th className="px-5 py-3 font-medium">更新时间</th>
                <th className="px-5 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#20252d]">
              {reports.length > 0 ? (
                reports.map((report) => (
                  <tr key={report.id} className="text-[#c8d0dc]">
                    <td className="max-w-[340px] px-5 py-4">
                      <p className="truncate font-medium text-[#d7dee8]">{report.title}</p>
                      <p className="mt-1 truncate text-xs text-[#697386]">{report.summary || "报告内容整理中"}</p>
                    </td>
                    <td className="px-5 py-4">{getReportTypeLabel(report.type)}</td>
                    <td className="px-5 py-4">{getReportStatusLabel(report.status)}</td>
                    <td className="px-5 py-4 text-[#8d98a8]">{formatTime(report.updatedAt)}</td>
                    <td className="px-5 py-4">
                      <Link href={`/reports/${report.id}`} className="text-[#d8b873] transition hover:text-[#efd9a6]">查看</Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-5 py-10">
                    <EmptyState icon={FileText} title="暂无报告文件" action={{ href: "/reports/deep", label: "生成深度报告" }} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
