"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, ImageDown, Share2 } from "lucide-react";

export function ShareActions({
  shareSlug,
  title,
  summary,
}: {
  shareSlug: string;
  title: string;
  summary: string;
}) {
  const [message, setMessage] = useState("");

  function currentUrl(source: string) {
    return `${window.location.origin}/share/${shareSlug}?source=${encodeURIComponent(source)}`;
  }

  function track(event: string, source: string) {
    void fetch(`/api/share/${shareSlug}/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, source }),
      keepalive: true,
    });
  }

  async function copyLink() {
    await navigator.clipboard?.writeText(currentUrl("copy_link"));
    track("copy_link", "share_page");
    setMessage("分享链接已复制。");
  }

  async function nativeShare() {
    if (!navigator.share) {
      await copyLink();
      return;
    }

    await navigator.share({
      title,
      text: summary,
      url: currentUrl("system_share"),
    });
    track("native_share", "share_page");
    setMessage("已调起系统分享。");
  }

  return (
    <section className="mt-6 rounded-md border border-[#2f261a] bg-[#080705] p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#f0d49a]">分享这份报告</p>
          <p className="mt-1 text-sm leading-6 text-[#b9ad99]">
            可复制链接，也可以生成一张适合社群和朋友圈转发的报告海报。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[#6a5431] px-3 text-sm text-[#fff7e8] transition hover:border-[#c8a15a]"
          >
            <Copy size={16} aria-hidden="true" />
            复制链接
          </button>
          <button
            type="button"
            onClick={() => {
              void nativeShare();
            }}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[#6a5431] px-3 text-sm text-[#fff7e8] transition hover:border-[#c8a15a]"
          >
            <Share2 size={16} aria-hidden="true" />
            系统分享
          </button>
          <Link
            href={`/share/${shareSlug}/poster?source=share_page`}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[#c8a15a] px-3 text-sm font-semibold text-[#130f09] transition hover:bg-[#f0d49a]"
          >
            <ImageDown size={16} aria-hidden="true" />
            生成海报
          </Link>
        </div>
      </div>
      <p className="mt-3 min-h-5 text-xs text-[#b9ad99]">{message}</p>
    </section>
  );
}
