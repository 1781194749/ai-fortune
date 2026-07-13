"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import type { LaunchWeeklyFocusItem } from "@/lib/launch-weekly-focus";
import type { LaunchWeeklyCommitmentStatus } from "@/lib/launch-weekly-commitments";

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
  status: LaunchWeeklyCommitmentStatus;
  targetDate: string;
  owner: string;
  evidenceNote: string;
  note: string;
};

const commitmentStatusOptions = [
  { value: "todo", label: "未开始" },
  { value: "in_progress", label: "处理中" },
  { value: "blocked", label: "卡住" },
  { value: "done", label: "已完成" },
] satisfies Array<{ value: LaunchWeeklyCommitmentStatus; label: string }>;

function commitmentStatusLabel(status?: LaunchWeeklyCommitmentStatus) {
  return commitmentStatusOptions.find((option) => option.value === status)?.label ?? "未开始";
}

function adminApiPath(path: string, token?: string) {
  if (!token) {
    return path;
  }

  return `${path}?token=${encodeURIComponent(token)}`;
}

function initialDraft(item: LaunchWeeklyFocusItem): Draft {
  return {
    status: item.commitment?.status ?? "todo",
    targetDate: item.commitment?.targetDate ?? item.dueDate ?? item.suggestedTargetDate ?? "",
    owner: item.commitment?.owner ?? item.owner,
    evidenceNote: item.commitment?.evidenceNote ?? "",
    note: item.commitment?.note ?? "",
  };
}

export function AdminLaunchWeeklyFocusForm({
  adminToken,
  items,
}: {
  adminToken?: string;
  items: LaunchWeeklyFocusItem[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(
    Object.fromEntries(items.map((item) => [item.id, initialDraft(item)])),
  );
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [message, setMessage] = useState("");

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? {
          status: "todo",
          targetDate: "",
          owner: "",
          evidenceNote: "",
          note: "",
        }),
        ...patch,
      },
    }));
  }

  async function save(item: LaunchWeeklyFocusItem) {
    const draft = drafts[item.id] ?? initialDraft(item);

    setLoadingId(item.id);
    setMessage(`正在保存 ${item.title}...`);

    const response = await saveDraft(item, draft);
    const data = (await response.json().catch(() => ({
      ok: false,
      message: "保存响应解析失败。",
    }))) as AdminActionResponse;

    setLoadingId(null);

    if (!response.ok || !data.ok) {
      setMessage(data.message ?? "保存失败。");
      return;
    }

    setMessage(`${item.title} 已更新。`);
    router.refresh();
  }

  async function saveDraft(item: LaunchWeeklyFocusItem, draft: Draft) {
    return fetch(adminApiPath("/api/admin/launch/weekly-focus", adminToken), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: item.id,
        status: draft.status,
        targetDate: draft.targetDate || null,
        owner: draft.owner,
        evidenceNote: draft.evidenceNote,
        note: draft.note,
      }),
    });
  }

  async function saveAllVisible() {
    const draftsToSave = items
      .map((item) => ({
        item,
        draft: drafts[item.id] ?? initialDraft(item),
      }))
      .filter(({ draft }) => draft.targetDate);

    if (draftsToSave.length === 0) {
      setMessage("当前没有可保存的目标日期。");
      return;
    }

    setSavingAll(true);
    setMessage(`正在保存 ${draftsToSave.length} 项承诺...`);

    for (const { item, draft } of draftsToSave) {
      const response = await saveDraft(item, draft);
      const data = (await response.json().catch(() => ({
        ok: false,
        message: "保存响应解析失败。",
      }))) as AdminActionResponse;

      if (!response.ok || !data.ok) {
        setSavingAll(false);
        setMessage(`${item.title} 保存失败：${data.message ?? "保存失败。"}`);
        return;
      }
    }

    setSavingAll(false);
    setMessage(`已保存 ${draftsToSave.length} 项本周承诺。`);
    router.refresh();
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#3a3023] bg-[#12100d] p-3">
        <p className="text-xs leading-5 text-[#b9ad99]">
          {items.length} 项可承诺
        </p>
        <button
          type="button"
          onClick={() => {
            void saveAllVisible();
          }}
          disabled={savingAll || loadingId !== null || items.length === 0}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-[#6a5431] px-3 text-xs font-semibold text-[#fff7e8] transition hover:border-[#c8a15a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {savingAll ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
          保存全部建议
        </button>
      </div>
      {items.map((item) => {
        const draft = drafts[item.id] ?? initialDraft(item);

        return (
          <article key={item.id} className="rounded-md border border-[#3a3023] bg-[#12100d] p-3">
            <div className="flex flex-col justify-between gap-2 lg:flex-row lg:items-start">
              <div>
                <p className="text-xs text-[#b9ad99]">
                  {item.laneTitle} · {item.suggestedTargetLabel ?? item.dueLabel}
                </p>
                <p className="mt-1 font-semibold text-[#fff7e8]">{item.title}</p>
              </div>
              <span className="inline-flex w-fit rounded-md border border-[#3a3023] px-2 py-1 text-xs text-[#b9ad99]">
                {item.commitment
                  ? `${commitmentStatusLabel(item.commitment.status)} · 更新 ${item.commitment.updatedAt.slice(5, 16).replace("T", " ")}`
                  : "未承诺"}
              </span>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[0.7fr_0.75fr_0.9fr_1fr_1fr]">
              <label className="grid gap-1 text-xs text-[#b9ad99]">
                目标日期
                <input
                  value={draft.targetDate}
                  onChange={(event) => updateDraft(item.id, { targetDate: event.target.value })}
                  type="date"
                  className="h-10 rounded-md border border-[#3a3023] bg-[#080705] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
                />
              </label>
              <label className="grid gap-1 text-xs text-[#b9ad99]">
                状态
                <select
                  value={draft.status}
                  onChange={(event) =>
                    updateDraft(item.id, {
                      status: event.target.value as LaunchWeeklyCommitmentStatus,
                    })
                  }
                  className="h-10 rounded-md border border-[#3a3023] bg-[#080705] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
                >
                  {commitmentStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-[#b9ad99]">
                负责人
                <input
                  value={draft.owner}
                  onChange={(event) => updateDraft(item.id, { owner: event.target.value.slice(0, 80) })}
                  className="h-10 rounded-md border border-[#3a3023] bg-[#080705] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
                />
              </label>
              <label className="grid gap-1 text-xs text-[#b9ad99]">
                证据备注
                <input
                  value={draft.evidenceNote}
                  onChange={(event) =>
                    updateDraft(item.id, { evidenceNote: event.target.value.slice(0, 220) })
                  }
                  placeholder={item.evidence}
                  className="h-10 rounded-md border border-[#3a3023] bg-[#080705] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
                />
              </label>
              <label className="grid gap-1 text-xs text-[#b9ad99]">
                推进备注
                <input
                  value={draft.note}
                  onChange={(event) => updateDraft(item.id, { note: event.target.value.slice(0, 220) })}
                  placeholder={item.action}
                  className="h-10 rounded-md border border-[#3a3023] bg-[#080705] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
                />
              </label>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  void save(item);
                }}
                disabled={loadingId !== null || savingAll}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-[#6a5431] px-3 text-xs font-semibold text-[#fff7e8] transition hover:border-[#c8a15a] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingId === item.id ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <Save size={14} />
                )}
                保存承诺
              </button>
            </div>
          </article>
        );
      })}
      {message ? <p className="text-xs text-[#b9ad99]">{message}</p> : null}
    </div>
  );
}
