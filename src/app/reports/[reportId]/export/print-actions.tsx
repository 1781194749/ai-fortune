"use client";

import { Copy, Printer } from "lucide-react";
import { useState } from "react";

export function PrintActions({ reportId }: { reportId: string }) {
  const [message, setMessage] = useState("");

  async function copyLink() {
    await navigator.clipboard?.writeText(window.location.href);
    setMessage("导出版链接已复制。");
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-10 items-center gap-2 rounded-md bg-[#c8a15a] px-4 text-sm font-semibold text-[#130f09] transition hover:bg-[#f0d49a]"
      >
        <Printer size={16} aria-hidden="true" />
        打印 / 保存 PDF
      </button>
      <button
        type="button"
        onClick={copyLink}
        className="inline-flex h-10 items-center gap-2 rounded-md border border-[#6a5431] px-4 text-sm text-[#fff7e8] transition hover:border-[#c8a15a]"
      >
        <Copy size={16} aria-hidden="true" />
        复制链接
      </button>
      <span className="text-xs text-[#b9ad99]">
        {message || `报告编号：${reportId}`}
      </span>
    </div>
  );
}
