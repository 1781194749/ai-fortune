"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, Loader2 } from "lucide-react";
import { normalizeChannelSource } from "@/lib/channel-source";

type ChannelBudgetReviewDecision = "scale" | "pause" | "retest" | "close";

type AdminActionResponse =
  | {
      ok: true;
      message?: string;
    }
  | {
      ok: false;
      message?: string;
    };

const decisions = [
  { value: "scale", label: "加码" },
  { value: "pause", label: "暂停" },
  { value: "retest", label: "复测" },
  { value: "close", label: "结案" },
] as const satisfies Array<{ value: ChannelBudgetReviewDecision; label: string }>;

function adminApiPath(path: string, token?: string) {
  if (!token) {
    return path;
  }

  return `${path}?token=${encodeURIComponent(token)}`;
}

export function AdminChannelBudgetReviewForm({
  adminToken,
  sourceOptions,
}: {
  adminToken?: string;
  sourceOptions: string[];
}) {
  const router = useRouter();
  const [source, setSource] = useState(sourceOptions[0] ?? "paid_ad__cpc__new_user");
  const [decision, setDecision] = useState<ChannelBudgetReviewDecision>("retest");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const normalizedSource = normalizeChannelSource(source);

  async function submit() {
    if (!normalizedSource) {
      setMessage("请填写 source。");
      return;
    }

    setLoading(true);
    setMessage("正在归档复盘...");

    const response = await fetch(adminApiPath("/api/admin/channels/reviews", adminToken), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: normalizedSource,
        decision,
        note: note || "后台归档渠道预算复盘",
      }),
    });
    const data = (await response.json()) as AdminActionResponse;

    setLoading(false);

    if (!response.ok || !data.ok) {
      setMessage(data.ok === false ? data.message ?? "归档失败。" : "归档失败。");
      return;
    }

    setMessage("已归档复盘。");
    router.refresh();
  }

  return (
    <div className="rounded-md border border-[#2f261a] bg-[#080705] p-4">
      <p className="text-sm font-semibold text-[#fff7e8]">复盘归档</p>
      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_160px]">
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          source
          <input
            list="channel-review-source-options"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
          <datalist id="channel-review-source-options">
            {sourceOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          结论
          <select
            value={decision}
            onChange={(event) => setDecision(event.target.value as ChannelBudgetReviewDecision)}
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          >
            {decisions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-3 grid gap-1 text-xs text-[#b9ad99]">
        复盘结论
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="例如：素材点击高但支付弱，暂停放量后复测落地页"
          className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
        />
      </label>

      <button
        type="button"
        onClick={() => {
          void submit();
        }}
        disabled={loading}
        className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-[#6a5431] px-3 text-xs font-semibold text-[#fff7e8] transition hover:border-[#c8a15a] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? <Loader2 className="animate-spin" size={14} /> : <Archive size={14} />}
        归档复盘
      </button>
      {message ? <p className="mt-2 text-xs text-[#b9ad99]">{message}</p> : null}
    </div>
  );
}
