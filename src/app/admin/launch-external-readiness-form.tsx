"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import type {
  ExternalReadinessItem,
  ExternalReadinessItemId,
  ExternalReadinessStatus,
} from "@/lib/launch-external-readiness";

type AdminActionResponse =
  | {
      ok: true;
      message?: string;
    }
  | {
      ok: false;
      message?: string;
    };

type Draft = {
  status: ExternalReadinessStatus;
  targetDate: string;
  receiptNo: string;
  evidenceUrl: string;
  evidenceNote: string;
  note: string;
};

const statusOptions = [
  { value: "not_started", label: "未开始" },
  { value: "in_progress", label: "处理中" },
  { value: "submitted", label: "已提交" },
  { value: "ready", label: "已完成" },
  { value: "blocked", label: "卡住" },
] satisfies Array<{ value: ExternalReadinessStatus; label: string }>;

function adminApiPath(path: string, token?: string) {
  if (!token) {
    return path;
  }

  return `${path}?token=${encodeURIComponent(token)}`;
}

function initialDraft(item: ExternalReadinessItem): Draft {
  return {
    status: item.status,
    targetDate: item.targetDate ?? "",
    receiptNo: item.receiptNo ?? "",
    evidenceUrl: item.evidenceUrl ?? "",
    evidenceNote: item.evidenceNote ?? "",
    note: item.note ?? "",
  };
}

function statusLabel(status: ExternalReadinessStatus) {
  return statusOptions.find((option) => option.value === status)?.label ?? status;
}

export function AdminLaunchExternalReadinessForm({
  adminToken,
  items,
}: {
  adminToken?: string;
  items: ExternalReadinessItem[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(
    Object.fromEntries(items.map((item) => [item.id, initialDraft(item)])),
  );
  const [loadingId, setLoadingId] = useState<ExternalReadinessItemId | null>(null);
  const [message, setMessage] = useState("");

  function updateDraft(id: ExternalReadinessItemId, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? {
          status: "not_started",
          targetDate: "",
          receiptNo: "",
          evidenceUrl: "",
          evidenceNote: "",
          note: "",
        }),
        ...patch,
      },
    }));
  }

  async function save(item: ExternalReadinessItem) {
    const draft = drafts[item.id] ?? initialDraft(item);

    setLoadingId(item.id);
    setMessage(`正在保存 ${item.title}...`);

    const response = await fetch(
      adminApiPath("/api/admin/launch/external-readiness", adminToken),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          status: draft.status,
          targetDate: draft.targetDate || null,
          receiptNo: draft.receiptNo,
          evidenceUrl: draft.evidenceUrl || null,
          evidenceNote: draft.evidenceNote,
          note: draft.note,
        }),
      },
    );
    const data = (await response.json().catch(() => ({
      ok: false,
      message: "保存响应解析失败。",
    }))) as AdminActionResponse;

    setLoadingId(null);

    if (!response.ok || !data.ok) {
      setMessage(data.message ?? "保存失败。");
      return;
    }

    setMessage(`${item.title} 已更新为${statusLabel(draft.status)}。`);
    router.refresh();
  }

  return (
    <div className="mt-5 space-y-4">
      {items.map((item) => {
        const draft = drafts[item.id] ?? initialDraft(item);

        return (
          <article key={item.id} className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
            <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
              <div>
                <p className="text-xs text-[#b9ad99]">
                  {item.group} · {item.owner}
                </p>
                <h3 className="mt-1 font-semibold text-[#fff7e8]">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.why}</p>
              </div>
              <span className="inline-flex w-fit rounded-md border border-[#3a3023] px-2 py-1 text-xs text-[#b9ad99]">
                {item.updatedAt
                  ? `更新 ${item.updatedAt.slice(5, 16).replace("T", " ")}`
                  : "未更新"}
              </span>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[0.7fr_0.7fr_0.9fr_1fr]">
              <label className="grid gap-1 text-xs text-[#b9ad99]">
                状态
                <select
                  value={draft.status}
                  onChange={(event) =>
                    updateDraft(item.id, {
                      status: event.target.value as ExternalReadinessStatus,
                    })
                  }
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
                目标日期
                <input
                  value={draft.targetDate}
                  onChange={(event) => updateDraft(item.id, { targetDate: event.target.value })}
                  type="date"
                  className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
                />
              </label>
              <label className="grid gap-1 text-xs text-[#b9ad99]">
                提交回执
                <input
                  value={draft.receiptNo}
                  onChange={(event) =>
                    updateDraft(item.id, { receiptNo: event.target.value.slice(0, 120) })
                  }
                  placeholder="申请号 / 商户号 / 备案号"
                  className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
                />
              </label>
              <label className="grid gap-1 text-xs text-[#b9ad99]">
                证据链接
                <input
                  value={draft.evidenceUrl}
                  onChange={(event) =>
                    updateDraft(item.id, { evidenceUrl: event.target.value.slice(0, 500) })
                  }
                  placeholder="https://..."
                  className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
                />
              </label>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <label className="grid gap-1 text-xs text-[#b9ad99]">
                证据
                <input
                  value={draft.evidenceNote}
                  onChange={(event) =>
                    updateDraft(item.id, { evidenceNote: event.target.value.slice(0, 220) })
                  }
                  placeholder={item.evidence}
                  className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
                />
              </label>
              <label className="grid gap-1 text-xs text-[#b9ad99]">
                备注
                <input
                  value={draft.note}
                  onChange={(event) => updateDraft(item.id, { note: event.target.value.slice(0, 220) })}
                  placeholder={item.action}
                  className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-3xl text-xs leading-5 text-[#6f6455]">
                验收口径：{item.evidence}
              </p>
              <button
                type="button"
                onClick={() => {
                  void save(item);
                }}
                disabled={loadingId !== null}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-[#6a5431] px-3 text-xs font-semibold text-[#fff7e8] transition hover:border-[#c8a15a] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingId === item.id ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <Save size={14} />
                )}
                保存
              </button>
            </div>
          </article>
        );
      })}
      {message ? <p className="text-xs text-[#b9ad99]">{message}</p> : null}
    </div>
  );
}
