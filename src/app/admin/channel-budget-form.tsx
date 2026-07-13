"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { normalizeChannelSource } from "@/lib/channel-source";

type AdminActionResponse =
  | {
      ok: true;
      source?: string;
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

function parseYuanToCents(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return Number.NaN;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return Number.NaN;
  }

  const [yuan, cents = ""] = trimmed.split(".");

  return Number(yuan) * 100 + Number(cents.padEnd(2, "0"));
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function parseDateTime(value: string) {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
}

export function AdminChannelBudgetForm({
  adminToken,
  appUrl,
  sourceOptions,
}: {
  adminToken?: string;
  appUrl: string;
  sourceOptions: string[];
}) {
  const router = useRouter();
  const [source, setSource] = useState(sourceOptions[0] ?? "paid_ad__cpc__new_user");
  const [budgetYuan, setBudgetYuan] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState<"save" | "reset" | null>(null);
  const [message, setMessage] = useState("");
  const normalizedSource = normalizeChannelSource(source);
  const shareLinkTemplate = useMemo(() => {
    const base = stripTrailingSlash(appUrl);

    return `${base}/share/{shareSlug}?source=${encodeURIComponent(normalizedSource)}`;
  }, [appUrl, normalizedSource]);

  async function submit(reset = false) {
    const budgetCents = parseYuanToCents(budgetYuan);

    if (!reset && Number.isNaN(budgetCents)) {
      setMessage("预算金额最多保留两位小数。");
      return;
    }

    if (!reset && startsAt && endsAt && new Date(startsAt).getTime() > new Date(endsAt).getTime()) {
      setMessage("开始时间不能晚于结束时间。");
      return;
    }

    setLoading(reset ? "reset" : "save");
    setMessage(reset ? "正在清除预算..." : "正在保存预算...");

    const response = await fetch(adminApiPath("/api/admin/channels/budget", adminToken), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        reset
          ? {
              source: normalizedSource,
              reset: true,
              note: note || "后台清除渠道预算",
            }
          : {
              source: normalizedSource,
              budgetCents,
              startsAt: parseDateTime(startsAt),
              endsAt: parseDateTime(endsAt),
              note: note || "后台更新渠道预算",
            },
      ),
    });
    const data = (await response.json()) as AdminActionResponse;

    setLoading(null);

    if (!response.ok || !data.ok) {
      setMessage(data.ok === false ? data.message ?? "保存失败。" : "保存失败。");
      return;
    }

    setMessage(reset ? "已清除预算。" : `已保存 ${data.source ?? normalizedSource}。`);
    router.refresh();
  }

  return (
    <div className="rounded-md border border-[#2f261a] bg-[#080705] p-4">
      <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          source
          <input
            list="channel-source-options"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
          <datalist id="channel-source-options">
            {sourceOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          投放预算 / 成本
          <input
            value={budgetYuan}
            onChange={(event) => setBudgetYuan(event.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          周期开始
          <input
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            type="datetime-local"
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          周期结束
          <input
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            type="datetime-local"
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
      </div>

      <label className="mt-3 grid gap-1 text-xs text-[#b9ad99]">
        投放链接模板
        <input
          readOnly
          value={shareLinkTemplate}
          className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#f0d49a] outline-none"
        />
      </label>

      <label className="mt-3 grid gap-1 text-xs text-[#b9ad99]">
        备注
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="例如：首轮达人投放预算"
          className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            void submit(false);
          }}
          disabled={loading !== null}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-[#6a5431] px-3 text-xs font-semibold text-[#fff7e8] transition hover:border-[#c8a15a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading === "save" ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
          保存预算
        </button>
        <button
          type="button"
          onClick={() => {
            void submit(true);
          }}
          disabled={loading !== null}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-[#3a3023] px-3 text-xs font-semibold text-[#d8cab2] transition hover:border-[#c8a15a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading === "reset" ? (
            <Loader2 className="animate-spin" size={14} />
          ) : (
            <RotateCcw size={14} />
          )}
          清除预算
        </button>
      </div>
      {message ? <p className="mt-2 text-xs text-[#b9ad99]">{message}</p> : null}
    </div>
  );
}
