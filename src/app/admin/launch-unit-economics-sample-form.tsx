"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { getStarCostLabel, type FeatureCode } from "@/lib/commerce";
import type { LaunchUnitEconomicsCostSample } from "@/lib/launch-unit-economics-sample";

type AdminActionResponse =
  | {
      ok: true;
      message?: string;
      record?: LaunchUnitEconomicsCostSample;
    }
  | {
      ok: false;
      message?: string;
    };

type Draft = {
  featureCode: FeatureCode;
  model: string;
  tokensIn: string;
  tokensOut: string;
  costYuan: string;
  scenario: string;
  evidenceUrl: string;
  note: string;
};

const featureOptions = [
  { value: "chat_basic", label: "AI 对话" },
  { value: "tarot_love", label: "塔罗爱情牌阵" },
  { value: "bagua_question", label: "八卦提问" },
  { value: "bazi_brief", label: "八字简析" },
  { value: "palm_reading", label: "手相视觉" },
  { value: "deep_report", label: "深度报告" },
  { value: "yearly_report", label: "年度报告" },
] satisfies Array<{ value: FeatureCode; label: string }>;

function adminApiPath(path: string, token?: string) {
  if (!token) {
    return path;
  }

  return `${path}?token=${encodeURIComponent(token)}`;
}

function yuanFromCents(value?: number) {
  if (value === undefined) {
    return "";
  }

  return (value / 100).toFixed(value % 100 === 0 ? 0 : 2);
}

function centsFromYuan(value: string) {
  const text = value.trim();

  if (!text) {
    return null;
  }

  const amount = Number(text);

  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return Math.round(amount * 100);
}

function integerFromInput(value: string) {
  const text = value.trim();

  if (!/^\d+$/.test(text)) {
    return null;
  }

  const amount = Number(text);

  if (!Number.isSafeInteger(amount)) {
    return null;
  }

  return amount;
}

function featureLabel(featureCode: FeatureCode) {
  const option = featureOptions.find((item) => item.value === featureCode);

  return option ? `${option.label} / ${getStarCostLabel(featureCode)}` : featureCode;
}

function initialDraft(sample?: LaunchUnitEconomicsCostSample): Draft {
  return {
    featureCode: sample?.featureCode ?? "deep_report",
    model: sample?.model ?? "gpt-5.4-mini",
    tokensIn: sample ? String(sample.tokensIn) : "",
    tokensOut: sample ? String(sample.tokensOut) : "",
    costYuan: yuanFromCents(sample?.costCents),
    scenario: sample?.metadata.scenario ?? "真实样本复盘",
    evidenceUrl: sample?.metadata.evidenceUrl ?? "",
    note: sample?.metadata.note ?? "",
  };
}

export function AdminLaunchUnitEconomicsSampleForm({
  adminToken,
  samples,
}: {
  adminToken?: string;
  samples: LaunchUnitEconomicsCostSample[];
}) {
  const router = useRouter();
  const latestSample = useMemo(() => samples[0], [samples]);
  const [draft, setDraft] = useState<Draft>(() => initialDraft(latestSample));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function patchDraft(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function save() {
    const tokensIn = integerFromInput(draft.tokensIn);
    const tokensOut = integerFromInput(draft.tokensOut);
    const costCents = centsFromYuan(draft.costYuan);

    if (tokensIn === null || tokensOut === null) {
      setMessage("tokens 必须填写非负整数。");
      return;
    }

    if (costCents === null) {
      setMessage("成本金额格式不正确。");
      return;
    }

    setSaving(true);
    setMessage("正在保存 AI 成本样本...");

    const response = await fetch(adminApiPath("/api/admin/launch/unit-economics", adminToken), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        featureCode: draft.featureCode,
        model: draft.model,
        tokensIn,
        tokensOut,
        costCents,
        scenario: draft.scenario,
        evidenceUrl: draft.evidenceUrl || null,
        note: draft.note,
      }),
    });
    const data = (await response.json().catch(() => ({
      ok: false,
      message: "保存响应解析失败。",
    }))) as AdminActionResponse;

    setSaving(false);

    if (!response.ok || !data.ok) {
      setMessage(data.message ?? "保存失败。");
      return;
    }

    setMessage("AI 成本样本已保存。");
    router.refresh();
  }

  return (
    <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-semibold text-[#f0d49a]">AI 成本样本快填</p>
          <p className="mt-1 text-xs leading-5 text-[#b9ad99]">
            保存模型、tokens、成本金额和账单截图，用于复盘单次毛利。
          </p>
        </div>
        <span className="inline-flex w-fit rounded-md border border-[#3a3023] px-2 py-1 text-xs text-[#b9ad99]">
          已留样 {samples.length} 条
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_0.75fr_0.75fr_0.75fr]">
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          功能
          <select
            value={draft.featureCode}
            onChange={(event) => patchDraft({ featureCode: event.target.value as FeatureCode })}
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          >
            {featureOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {featureLabel(option.value)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          模型
          <input
            value={draft.model}
            onChange={(event) => patchDraft({ model: event.target.value.slice(0, 100) })}
            placeholder="gpt-5.4-mini"
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          输入 tokens
          <input
            value={draft.tokensIn}
            onChange={(event) => patchDraft({ tokensIn: event.target.value.slice(0, 10) })}
            inputMode="numeric"
            placeholder="1200"
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          输出 tokens
          <input
            value={draft.tokensOut}
            onChange={(event) => patchDraft({ tokensOut: event.target.value.slice(0, 10) })}
            inputMode="numeric"
            placeholder="900"
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          成本
          <input
            value={draft.costYuan}
            onChange={(event) => patchDraft({ costYuan: event.target.value.slice(0, 12) })}
            inputMode="decimal"
            placeholder="0.08"
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          场景
          <input
            value={draft.scenario}
            onChange={(event) => patchDraft({ scenario: event.target.value.slice(0, 160) })}
            placeholder="手相真实图片 / 深度报告首单"
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          账单/截图链接
          <input
            value={draft.evidenceUrl}
            onChange={(event) => patchDraft({ evidenceUrl: event.target.value.slice(0, 500) })}
            placeholder="https://..."
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
      </div>

      <label className="mt-3 grid gap-1 text-xs text-[#b9ad99]">
        备注
        <input
          value={draft.note}
          onChange={(event) => patchDraft({ note: event.target.value.slice(0, 300) })}
          placeholder="记录价格页、账单口径、是否包含图片输入等"
          className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-[#6f6455]">
          最近样本：
          {latestSample
            ? `${featureLabel(latestSample.featureCode)} · ${latestSample.model} · ${yuanFromCents(latestSample.costCents)} 元`
            : "暂无"}
        </p>
        <button
          type="button"
          onClick={() => {
            void save();
          }}
          disabled={saving}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-[#6a5431] px-3 text-xs font-semibold text-[#fff7e8] transition hover:border-[#c8a15a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
          保存样本
        </button>
      </div>
      {message ? <p className="mt-3 text-xs text-[#b9ad99]">{message}</p> : null}
    </div>
  );
}
