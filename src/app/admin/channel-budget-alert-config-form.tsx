"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import type { ChannelBudgetAlertConfig } from "@/lib/channel-budget-alert-config";

type AdminActionResponse =
  | {
      ok: true;
      message?: string;
    }
  | {
      ok: false;
      message?: string;
    };

const defaultValues = {
  breakEvenRoi: "1",
  healthyRoi: "2.5",
  endingSoonDays: "2",
  noPaidLandingThreshold: "3",
  highBudgetYuan: "100",
};

function adminApiPath(path: string, token?: string) {
  if (!token) {
    return path;
  }

  return `${path}?token=${encodeURIComponent(token)}`;
}

function yuan(cents: number) {
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

function parseYuanToCents(value: string) {
  const trimmed = value.trim();

  if (!trimmed || !/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return Number.NaN;
  }

  const [yuanValue, cents = ""] = trimmed.split(".");

  return Number(yuanValue) * 100 + Number(cents.padEnd(2, "0"));
}

function parseNumber(value: string) {
  const number = Number(value.trim());

  return Number.isFinite(number) ? number : Number.NaN;
}

function parseInteger(value: string) {
  const number = Number(value.trim());

  return Number.isInteger(number) ? number : Number.NaN;
}

export function AdminChannelBudgetAlertConfigForm({
  adminToken,
  config,
}: {
  adminToken?: string;
  config: ChannelBudgetAlertConfig;
}) {
  const router = useRouter();
  const [breakEvenRoi, setBreakEvenRoi] = useState(String(config.breakEvenRoi));
  const [healthyRoi, setHealthyRoi] = useState(String(config.healthyRoi));
  const [endingSoonDays, setEndingSoonDays] = useState(String(config.endingSoonDays));
  const [noPaidLandingThreshold, setNoPaidLandingThreshold] = useState(
    String(config.noPaidLandingThreshold),
  );
  const [highBudgetYuan, setHighBudgetYuan] = useState(yuan(config.highBudgetCents));
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState<"save" | "reset" | null>(null);
  const [message, setMessage] = useState("");

  async function submit(reset = false) {
    const nextBreakEvenRoi = parseNumber(reset ? defaultValues.breakEvenRoi : breakEvenRoi);
    const nextHealthyRoi = parseNumber(reset ? defaultValues.healthyRoi : healthyRoi);
    const nextEndingSoonDays = parseInteger(
      reset ? defaultValues.endingSoonDays : endingSoonDays,
    );
    const nextNoPaidLandingThreshold = parseInteger(
      reset ? defaultValues.noPaidLandingThreshold : noPaidLandingThreshold,
    );
    const nextHighBudgetCents = parseYuanToCents(
      reset ? defaultValues.highBudgetYuan : highBudgetYuan,
    );

    if (
      Number.isNaN(nextBreakEvenRoi) ||
      Number.isNaN(nextHealthyRoi) ||
      Number.isNaN(nextEndingSoonDays) ||
      Number.isNaN(nextNoPaidLandingThreshold) ||
      Number.isNaN(nextHighBudgetCents) ||
      nextBreakEvenRoi < 0 ||
      nextHealthyRoi < nextBreakEvenRoi ||
      nextEndingSoonDays < 0 ||
      nextNoPaidLandingThreshold < 0 ||
      nextHighBudgetCents < 0
    ) {
      setMessage("请检查阈值：健康倍数需大于等于收支平衡倍数，天数和金额不能为负。");
      return;
    }

    setLoading(reset ? "reset" : "save");
    setMessage(reset ? "正在恢复默认阈值..." : "正在保存阈值...");

    const response = await fetch(
      adminApiPath("/api/admin/channels/budget-alerts/config", adminToken),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          breakEvenRoi: nextBreakEvenRoi,
          healthyRoi: nextHealthyRoi,
          endingSoonDays: nextEndingSoonDays,
          noPaidLandingThreshold: nextNoPaidLandingThreshold,
          highBudgetCents: nextHighBudgetCents,
          note: note || (reset ? "后台恢复预算预警默认阈值" : "后台更新预算预警阈值"),
        }),
      },
    );
    const data = (await response.json()) as AdminActionResponse;

    setLoading(null);

    if (!response.ok || !data.ok) {
      setMessage(data.ok === false ? data.message ?? "保存失败。" : "保存失败。");
      return;
    }

    if (reset) {
      setBreakEvenRoi(defaultValues.breakEvenRoi);
      setHealthyRoi(defaultValues.healthyRoi);
      setEndingSoonDays(defaultValues.endingSoonDays);
      setNoPaidLandingThreshold(defaultValues.noPaidLandingThreshold);
      setHighBudgetYuan(defaultValues.highBudgetYuan);
    }

    setMessage(reset ? "已恢复默认阈值。" : "已保存预算预警阈值。");
    router.refresh();
  }

  return (
    <div className="rounded-md border border-[#2f261a] bg-[#080705] p-4">
      <p className="text-sm font-semibold text-[#fff7e8]">预警阈值</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          收支平衡倍数
          <input
            value={breakEvenRoi}
            onChange={(event) => setBreakEvenRoi(event.target.value)}
            inputMode="decimal"
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          健康回收倍数
          <input
            value={healthyRoi}
            onChange={(event) => setHealthyRoi(event.target.value)}
            inputMode="decimal"
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          临期天数
          <input
            value={endingSoonDays}
            onChange={(event) => setEndingSoonDays(event.target.value)}
            inputMode="numeric"
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          无支付落地阈值
          <input
            value={noPaidLandingThreshold}
            onChange={(event) => setNoPaidLandingThreshold(event.target.value)}
            inputMode="numeric"
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          高成本阈值
          <input
            value={highBudgetYuan}
            onChange={(event) => setHighBudgetYuan(event.target.value)}
            inputMode="decimal"
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          备注
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="例如：首轮投放严格阈值"
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            void submit(false);
          }}
          disabled={loading !== null}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-[#6a5431] px-3 text-xs font-semibold text-[#fff7e8] transition hover:border-[#c8a15a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading === "save" ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
          保存阈值
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
          恢复默认
        </button>
        {message ? <span className="text-xs text-[#b9ad99]">{message}</span> : null}
      </div>
    </div>
  );
}
