"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import type { HealthStatus } from "@/lib/health-checks";
import type { LaunchAcceptanceCase } from "@/lib/launch-acceptance";
import type { LaunchAcceptanceEvidenceRecord } from "@/lib/launch-acceptance-evidence";

type AdminActionResponse =
  | {
      ok: true;
      message?: string;
      record?: LaunchAcceptanceEvidenceRecord;
    }
  | {
      ok: false;
      message?: string;
    };

type Draft = {
  caseId: string;
  status: HealthStatus;
  tester: string;
  evidenceUrl: string;
  recordingUrl: string;
  note: string;
};

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

function initialDraft(item: LaunchAcceptanceCase): Draft {
  const evidence = item.latestEvidence?.metadata;

  return {
    caseId: item.id,
    status: evidence?.status ?? (item.relatedIssues.some((issue) => issue.status === "blocking") ? "blocking" : "ready"),
    tester: evidence?.tester ?? "",
    evidenceUrl: evidence?.evidenceUrl ?? "",
    recordingUrl: evidence?.recordingUrl ?? "",
    note: evidence?.note ?? item.evidence,
  };
}

export function AdminLaunchAcceptanceEvidenceForm({
  adminToken,
  cases,
  records,
}: {
  adminToken?: string;
  cases: LaunchAcceptanceCase[];
  records: LaunchAcceptanceEvidenceRecord[];
}) {
  const router = useRouter();
  const defaultCase = useMemo(
    () =>
      cases.find((item) => item.status !== "ready" && !item.latestEvidence) ??
      cases.find((item) => item.status !== "ready") ??
      cases[0],
    [cases],
  );
  const [draft, setDraft] = useState<Draft | null>(defaultCase ? initialDraft(defaultCase) : null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  if (!draft || cases.length === 0) {
    return (
      <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
        <p className="text-sm text-[#b9ad99]">暂无可记录的验收用例。</p>
      </div>
    );
  }

  const activeDraft = draft;
  const activeCase = cases.find((item) => item.id === activeDraft.caseId) ?? cases[0];

  function patchDraft(patch: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function selectCase(caseId: string) {
    const item = cases.find((candidate) => candidate.id === caseId);

    if (item) {
      setDraft(initialDraft(item));
    }
  }

  async function save() {
    const currentDraft = draft;

    if (!currentDraft) {
      return;
    }

    setSaving(true);
    setMessage("正在保存验收证据...");

    const response = await fetch(adminApiPath("/api/admin/launch/acceptance", adminToken), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseId: currentDraft.caseId,
        status: currentDraft.status,
        tester: currentDraft.tester,
        evidenceUrl: currentDraft.evidenceUrl || null,
        recordingUrl: currentDraft.recordingUrl || null,
        note: currentDraft.note,
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

    setMessage(`验收证据已保存为${statusLabel(currentDraft.status)}。`);
    router.refresh();
  }

  return (
    <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-semibold text-[#f0d49a]">验收证据快填</p>
          <p className="mt-1 text-xs leading-5 text-[#b9ad99]">
            保存端到端手测截图、录屏、验收人和备注；没有通过证据的用例会保持待复核。
          </p>
        </div>
        <span className="inline-flex w-fit rounded-md border border-[#3a3023] px-2 py-1 text-xs text-[#b9ad99]">
          已留证 {records.length} 条
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_0.7fr_0.8fr]">
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          用例
          <select
            value={activeDraft.caseId}
            onChange={(event) => selectCase(event.target.value)}
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          >
            {cases.map((item) => (
              <option key={item.id} value={item.id}>
                {item.group} / {item.title}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          结果
          <select
            value={activeDraft.status}
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
          验收人
          <input
            value={activeDraft.tester}
            onChange={(event) => patchDraft({ tester: event.target.value.slice(0, 80) })}
            placeholder="产品 / 技术 / 财务"
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          截图/记录链接
          <input
            value={activeDraft.evidenceUrl}
            onChange={(event) => patchDraft({ evidenceUrl: event.target.value.slice(0, 500) })}
            placeholder="https://..."
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          录屏链接
          <input
            value={activeDraft.recordingUrl}
            onChange={(event) => patchDraft({ recordingUrl: event.target.value.slice(0, 500) })}
            placeholder="https://..."
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
      </div>

      <label className="mt-3 grid gap-1 text-xs text-[#b9ad99]">
        备注
        <input
          value={activeDraft.note}
          onChange={(event) => patchDraft({ note: event.target.value.slice(0, 300) })}
          placeholder="记录手测结果、缺口或复核口径"
          className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-[#6f6455]">
          当前用例：{activeCase.evidenceRecordCount} 条留证
          {activeCase.latestEvidence
            ? `，最近 ${statusLabel(activeCase.latestEvidence.metadata.status)} ${activeCase.latestEvidence.metadata.savedAt.slice(0, 16).replace("T", " ")}`
            : ""}
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
