"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, Loader2, Share2, ShieldOff } from "lucide-react";

type ShareResponse =
  | {
      ok: true;
      sharePath: string | null;
      report: {
        shareSlug?: string;
      };
    }
  | { ok: false; message?: string };

function absoluteUrl(path: string) {
  if (typeof window === "undefined") {
    return path;
  }

  return `${window.location.origin}${path}`;
}

export function ReportShareControl({
  reportId,
  initialShareSlug,
}: {
  reportId: string;
  initialShareSlug?: string;
}) {
  const router = useRouter();
  const [shareSlug, setShareSlug] = useState(initialShareSlug ?? "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(
    initialShareSlug ? "公开分享已开启。" : "公开分享已关闭。",
  );
  const sharePath = shareSlug ? `/share/${shareSlug}` : "";

  async function updateShare(enabled: boolean) {
    setLoading(true);
    setMessage(enabled ? "正在开启分享..." : "正在关闭分享...");

    const response = await fetch(`/api/reports/${reportId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    const data = (await response.json()) as ShareResponse;

    setLoading(false);

    if (!response.ok || data.ok === false) {
      setMessage(data.ok === false ? data.message ?? "分享设置失败。" : "分享设置失败。");
      return;
    }

    setShareSlug(data.report.shareSlug ?? "");
    setMessage(data.sharePath ? "公开分享已开启。" : "公开分享已关闭。");
    router.refresh();
  }

  async function copyLink() {
    if (!sharePath) {
      return;
    }

    await navigator.clipboard?.writeText(absoluteUrl(sharePath));
    setMessage("分享链接已复制。");
  }

  return (
    <section className="mt-6 rounded-md border border-[#2f261a] bg-[#080705] p-4">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold text-[#f0d49a]">公开分享控制</p>
          <p className="mt-2 text-sm leading-6 text-[#b9ad99]">
            开启后任何持有链接的人都能查看正文；关闭后原分享页将不可访问。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {sharePath ? (
            <>
              <Link
                href={sharePath}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-[#6a5431] px-3 text-sm text-[#fff7e8] transition hover:border-[#c8a15a]"
              >
                <Share2 size={16} aria-hidden="true" />
                打开
              </Link>
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-[#6a5431] px-3 text-sm text-[#fff7e8] transition hover:border-[#c8a15a]"
              >
                <Copy size={16} aria-hidden="true" />
                复制
              </button>
              <button
                type="button"
                onClick={() => updateShare(false)}
                disabled={loading}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-[#5d2b22] px-3 text-sm text-[#e08b74] transition hover:border-[#b34c32] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <Loader2 className="animate-spin" size={16} /> : <ShieldOff size={16} />}
                关闭
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => updateShare(true)}
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[#c8a15a] px-4 text-sm font-semibold text-[#130f09] transition hover:bg-[#f0d49a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 className="animate-spin" size={16} /> : <Share2 size={16} />}
              开启分享
            </button>
          )}
        </div>
      </div>
      <p className="mt-3 break-all text-xs leading-5 text-[#b9ad99]">
        {sharePath ? absoluteUrl(sharePath) : "当前没有公开分享链接。"} {message}
      </p>
    </section>
  );
}
