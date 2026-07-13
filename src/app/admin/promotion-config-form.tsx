"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import type { PromotionUsageSummary } from "@/lib/promo-code";

type AdminActionResponse =
  | {
      ok: true;
      message?: string;
    }
  | {
      ok: false;
      message?: string;
    };

function adminApiPath(path: string, token?: string) {
  if (!token) {
    return path;
  }

  return `${path}?token=${encodeURIComponent(token)}`;
}

function toInputDateTime(value: string | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 16);
}

function parseLimit(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const number = Number(trimmed);

  return Number.isInteger(number) && number >= 0 ? number : Number.NaN;
}

function parseDateTime(value: string) {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
}

export function AdminPromotionConfigForm({
  summary,
  adminToken,
}: {
  summary: PromotionUsageSummary;
  adminToken?: string;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(summary.enabled);
  const [startsAt, setStartsAt] = useState(toInputDateTime(summary.startsAt));
  const [endsAt, setEndsAt] = useState(toInputDateTime(summary.endsAt));
  const [totalLimit, setTotalLimit] = useState(
    summary.totalLimit === undefined ? "" : String(summary.totalLimit),
  );
  const [perUserLimit, setPerUserLimit] = useState(
    summary.perUserLimit === undefined ? "" : String(summary.perUserLimit),
  );
  const [loading, setLoading] = useState<"save" | "reset" | null>(null);
  const [message, setMessage] = useState("");

  async function submit(reset = false) {
    const parsedTotalLimit = parseLimit(totalLimit);
    const parsedPerUserLimit = parseLimit(perUserLimit);

    if (!reset && (Number.isNaN(parsedTotalLimit) || Number.isNaN(parsedPerUserLimit))) {
      setMessage("额度必须是大于等于 0 的整数。");
      return;
    }

    setLoading(reset ? "reset" : "save");
    setMessage(reset ? "正在恢复默认..." : "正在保存配置...");

    const response = await fetch(
      adminApiPath(`/api/admin/promotions/${summary.code}/config`, adminToken),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          reset
            ? { reset: true, note: "后台恢复默认优惠配置" }
            : {
                enabled,
                startsAt: parseDateTime(startsAt),
                endsAt: parseDateTime(endsAt),
                totalLimit: parsedTotalLimit,
                perUserLimit: parsedPerUserLimit,
                note: "后台更新优惠配置",
              },
        ),
      },
    );
    const data = (await response.json()) as AdminActionResponse;

    setLoading(null);

    if (!response.ok || !data.ok) {
      setMessage(data.ok === false ? data.message ?? "保存失败。" : "保存失败。");
      return;
    }

    setMessage(reset ? "已恢复默认配置。" : "已保存配置。");
    router.refresh();
  }

  return (
    <div className="mt-4 rounded-md border border-[#2f261a] bg-[#12100d] p-3">
      <div className="grid gap-3">
        <label className="flex items-center gap-2 text-xs text-[#d8cab2]">
          <input
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            type="checkbox"
            className="size-4 accent-[#c8a15a]"
          />
          启用优惠码
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs text-[#b9ad99]">
            总量上限
            <input
              value={totalLimit}
              onChange={(event) => setTotalLimit(event.target.value)}
              inputMode="numeric"
              placeholder="不限"
              className="h-9 rounded-md border border-[#3a3023] bg-[#080705] px-2 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
            />
          </label>
          <label className="grid gap-1 text-xs text-[#b9ad99]">
            单人限用
            <input
              value={perUserLimit}
              onChange={(event) => setPerUserLimit(event.target.value)}
              inputMode="numeric"
              placeholder="不限"
              className="h-9 rounded-md border border-[#3a3023] bg-[#080705] px-2 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
            />
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs text-[#b9ad99]">
            开始时间
            <input
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              type="datetime-local"
              className="h-9 rounded-md border border-[#3a3023] bg-[#080705] px-2 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
            />
          </label>
          <label className="grid gap-1 text-xs text-[#b9ad99]">
            结束时间
            <input
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
              type="datetime-local"
              className="h-9 rounded-md border border-[#3a3023] bg-[#080705] px-2 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
            />
          </label>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            void submit(false);
          }}
          disabled={loading !== null}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-[#6a5431] px-2 text-xs font-semibold text-[#fff7e8] transition hover:border-[#c8a15a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading === "save" ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
          保存
        </button>
        <button
          type="button"
          onClick={() => {
            void submit(true);
          }}
          disabled={loading !== null || !summary.configured}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-[#3a3023] px-2 text-xs font-semibold text-[#d8cab2] transition hover:border-[#c8a15a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading === "reset" ? (
            <Loader2 className="animate-spin" size={14} />
          ) : (
            <RotateCcw size={14} />
          )}
          恢复默认
        </button>
      </div>
      {message ? <p className="mt-2 text-xs text-[#b9ad99]">{message}</p> : null}
    </div>
  );
}
