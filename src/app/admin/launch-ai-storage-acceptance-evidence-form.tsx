"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import type { HealthStatus } from "@/lib/health-checks";
import type {
  LaunchAiStorageAcceptanceEvidenceItemId,
  LaunchAiStorageAcceptanceEvidenceRecord,
} from "@/lib/launch-ai-storage-acceptance";

type AdminActionResponse =
  | {
      ok: true;
      message?: string;
      record?: LaunchAiStorageAcceptanceEvidenceRecord;
    }
  | {
      ok: false;
      message?: string;
    };

type Draft = {
  itemId: LaunchAiStorageAcceptanceEvidenceItemId;
  status: HealthStatus;
  evidenceUrl: string;
  diagnosticUrl: string;
  publicImageUrl: string;
  palmReportUrl: string;
  deepReportUrl: string;
  costSampleUrl: string;
  note: string;
};

const itemOptions = [
  { value: "openai_application", label: "OpenAI 项目/预算" },
  { value: "openai_env", label: "OpenAI 模型变量" },
  { value: "openai_cost_rates", label: "OpenAI 成本费率" },
  { value: "openai_diagnostics", label: "OpenAI 诊断" },
  { value: "qiniu_application", label: "七牛 bucket/域名" },
  { value: "qiniu_env", label: "七牛生产变量" },
  { value: "qiniu_callbacks", label: "七牛 CORS/公开 URL" },
  { value: "palm_vision", label: "手相视觉报告" },
  { value: "deep_report", label: "付费深度报告" },
  { value: "cost_sample", label: "AI 成本样本" },
] satisfies Array<{ value: LaunchAiStorageAcceptanceEvidenceItemId; label: string }>;

const statusOptions = [
  { value: "ready", label: "已通过" },
  { value: "warning", label: "待复核" },
  { value: "blocking", label: "未通过" },
] satisfies Array<{ value: HealthStatus; label: string }>;

function adminApiPath(path: string, token?: string) {
  if (!token) {
    return path;
  }

  return `${path}?token=${encodeURIComponent(token)}`;
}

function statusLabel(status: HealthStatus) {
  return statusOptions.find((option) => option.value === status)?.label ?? status;
}

function itemLabel(itemId: LaunchAiStorageAcceptanceEvidenceItemId) {
  return itemOptions.find((option) => option.value === itemId)?.label ?? itemId;
}

function initialDraft(record?: LaunchAiStorageAcceptanceEvidenceRecord): Draft {
  return {
    itemId: record?.metadata.itemId ?? "openai_diagnostics",
    status: record?.metadata.status ?? "warning",
    evidenceUrl: record?.metadata.evidenceUrl ?? "",
    diagnosticUrl: record?.metadata.diagnosticUrl ?? "",
    publicImageUrl: record?.metadata.publicImageUrl ?? "",
    palmReportUrl: record?.metadata.palmReportUrl ?? "",
    deepReportUrl: record?.metadata.deepReportUrl ?? "",
    costSampleUrl: record?.metadata.costSampleUrl ?? "",
    note:
      record?.metadata.note ??
      "记录 OpenAI、七牛、手相视觉、深度报告或成本样本验收结果，不保存真实 key、token 或密钥。",
  };
}

export function AdminLaunchAiStorageAcceptanceEvidenceForm({
  adminToken,
  records,
}: {
  adminToken?: string;
  records: LaunchAiStorageAcceptanceEvidenceRecord[];
}) {
  const router = useRouter();
  const latestRecord = useMemo(() => records[0], [records]);
  const [draft, setDraft] = useState<Draft>(() => initialDraft(latestRecord));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function patchDraft(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function save() {
    setSaving(true);
    setMessage("正在保存 AI/图片验收证据...");

    const response = await fetch(adminApiPath("/api/admin/launch/ai-storage-plan", adminToken), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: draft.itemId,
        status: draft.status,
        evidenceUrl: draft.evidenceUrl || null,
        diagnosticUrl: draft.diagnosticUrl || null,
        publicImageUrl: draft.publicImageUrl || null,
        palmReportUrl: draft.palmReportUrl || null,
        deepReportUrl: draft.deepReportUrl || null,
        costSampleUrl: draft.costSampleUrl || null,
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

    setMessage(`AI/图片验收证据已保存为${statusLabel(draft.status)}。`);
    router.refresh();
  }

  return (
    <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-semibold text-[#f0d49a]">AI/图片验收证据快填</p>
          <p className="mt-1 text-xs leading-5 text-[#b9ad99]">
            保存 OpenAI 诊断、七牛公开 URL、手相视觉、深度报告和成本样本证据。
          </p>
        </div>
        <span className="inline-flex w-fit rounded-md border border-[#3a3023] px-2 py-1 text-xs text-[#b9ad99]">
          已归档 {records.length} 条
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_0.75fr_1fr_1fr]">
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          条目
          <select
            value={draft.itemId}
            onChange={(event) =>
              patchDraft({
                itemId: event.target.value as LaunchAiStorageAcceptanceEvidenceItemId,
              })
            }
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          >
            {itemOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          结果
          <select
            value={draft.status}
            onChange={(event) => patchDraft({ status: event.target.value as HealthStatus })}
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          截图/记录链接
          <input
            value={draft.evidenceUrl}
            onChange={(event) => patchDraft({ evidenceUrl: event.target.value.slice(0, 500) })}
            placeholder="https://..."
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          诊断输出
          <input
            value={draft.diagnosticUrl}
            onChange={(event) => patchDraft({ diagnosticUrl: event.target.value.slice(0, 500) })}
            placeholder="https://..."
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr]">
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          七牛公开图片
          <input
            value={draft.publicImageUrl}
            onChange={(event) => patchDraft({ publicImageUrl: event.target.value.slice(0, 500) })}
            placeholder="https://..."
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          手相报告
          <input
            value={draft.palmReportUrl}
            onChange={(event) => patchDraft({ palmReportUrl: event.target.value.slice(0, 500) })}
            placeholder="https://..."
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          深度报告
          <input
            value={draft.deepReportUrl}
            onChange={(event) => patchDraft({ deepReportUrl: event.target.value.slice(0, 500) })}
            placeholder="https://..."
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          成本样本
          <input
            value={draft.costSampleUrl}
            onChange={(event) => patchDraft({ costSampleUrl: event.target.value.slice(0, 500) })}
            placeholder="https://..."
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
      </div>

      <label className="mt-3 grid gap-1 text-xs text-[#b9ad99]">
        备注
        <input
          value={draft.note}
          onChange={(event) => patchDraft({ note: event.target.value.slice(0, 360) })}
          placeholder="记录模型、七牛域名、报告 ID、成本口径和待复核点"
          className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-[#6f6455]">
          最近记录：
          {latestRecord
            ? `${itemLabel(latestRecord.metadata.itemId)} · ${statusLabel(latestRecord.metadata.status)} · ${latestRecord.metadata.savedAt.slice(0, 16).replace("T", " ")}`
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
          保存证据
        </button>
      </div>
      {message ? <p className="mt-3 text-xs text-[#b9ad99]">{message}</p> : null}
    </div>
  );
}
