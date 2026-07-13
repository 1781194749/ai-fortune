"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import type { LaunchDailyBriefAction } from "@/lib/launch-daily-brief";
import type { LaunchDailyActionProgressStatus } from "@/lib/launch-daily-action-progress";

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
  status: LaunchDailyActionProgressStatus;
  owner: string;
  evidenceNote: string;
  note: string;
};

const actionStatusOptions = [
  { value: "todo", label: "未开始" },
  { value: "in_progress", label: "处理中" },
  { value: "blocked", label: "卡住" },
  { value: "done", label: "已完成" },
] satisfies Array<{ value: LaunchDailyActionProgressStatus; label: string }>;

function actionStatusLabel(status?: LaunchDailyActionProgressStatus) {
  return actionStatusOptions.find((option) => option.value === status)?.label ?? "未开始";
}

function adminApiPath(path: string, token?: string) {
  if (!token) {
    return path;
  }

  return `${path}?token=${encodeURIComponent(token)}`;
}

function initialDraft(action: LaunchDailyBriefAction): Draft {
  return {
    status: action.progress?.status ?? "todo",
    owner: action.progress?.owner ?? action.owner,
    evidenceNote: action.progress?.evidenceNote ?? "",
    note: action.progress?.note ?? "",
  };
}

export function AdminLaunchDailyActionProgressForm({
  adminToken,
  actions,
}: {
  adminToken?: string;
  actions: LaunchDailyBriefAction[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(
    Object.fromEntries(actions.map((action) => [action.id, initialDraft(action)])),
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
          owner: "",
          evidenceNote: "",
          note: "",
        }),
        ...patch,
      },
    }));
  }

  async function saveDraft(action: LaunchDailyBriefAction, draft: Draft) {
    return fetch(adminApiPath("/api/admin/launch/daily-brief", adminToken), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actionId: action.id,
        status: draft.status,
        owner: draft.owner,
        evidenceNote: draft.evidenceNote,
        note: draft.note,
      }),
    });
  }

  async function save(action: LaunchDailyBriefAction) {
    const draft = drafts[action.id] ?? initialDraft(action);

    setLoadingId(action.id);
    setMessage(`正在保存 ${action.title}...`);

    const response = await saveDraft(action, draft);
    const data = (await response.json().catch(() => ({
      ok: false,
      message: "保存响应解析失败。",
    }))) as AdminActionResponse;

    setLoadingId(null);

    if (!response.ok || !data.ok) {
      setMessage(data.message ?? "保存失败。");
      return;
    }

    setMessage(`${action.title} 已更新。`);
    router.refresh();
  }

  async function saveAllVisible() {
    const draftsToSave = actions.map((action) => ({
      action,
      draft: drafts[action.id] ?? initialDraft(action),
    }));

    setSavingAll(true);
    setMessage(`正在保存 ${draftsToSave.length} 个今日动作...`);

    for (const { action, draft } of draftsToSave) {
      const response = await saveDraft(action, draft);
      const data = (await response.json().catch(() => ({
        ok: false,
        message: "保存响应解析失败。",
      }))) as AdminActionResponse;

      if (!response.ok || !data.ok) {
        setSavingAll(false);
        setMessage(`${action.title} 保存失败：${data.message ?? "保存失败。"}`);
        return;
      }
    }

    setSavingAll(false);
    setMessage(`已保存 ${draftsToSave.length} 个今日动作。`);
    router.refresh();
  }

  return (
    <div className="mt-4 rounded-md border border-[#3a3023] bg-[#12100d] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#f0d49a]">今日动作执行快填</p>
          <p className="mt-1 text-xs leading-5 text-[#b9ad99]">
            保存今日动作的处理状态、负责人、证据备注和推进备注；这里只做执行留痕，不改变 Go / No-Go 判断。
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void saveAllVisible();
          }}
          disabled={savingAll || loadingId !== null || actions.length === 0}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-[#6a5431] px-3 text-xs font-semibold text-[#fff7e8] transition hover:border-[#c8a15a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {savingAll ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
          保存全部动作
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {actions.map((action) => {
          const draft = drafts[action.id] ?? initialDraft(action);

          return (
            <article key={action.id} className="rounded-md border border-[#3a3023] bg-[#080705] p-3">
              <div className="flex flex-col justify-between gap-2 lg:flex-row lg:items-start">
                <div>
                  <p className="text-xs text-[#b9ad99]">
                    {action.sourceLabel} · {action.owner}
                    {action.dueLabel ? ` · ${action.dueLabel}` : ""}
                  </p>
                  <p className="mt-1 font-semibold text-[#fff7e8]">{action.title}</p>
                </div>
                <span className="inline-flex w-fit rounded-md border border-[#3a3023] px-2 py-1 text-xs text-[#b9ad99]">
                  {action.progress
                    ? `${actionStatusLabel(action.progress.status)} · 更新 ${action.progress.updatedAt.slice(5, 16).replace("T", " ")}`
                    : "未记录"}
                </span>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[0.7fr_0.9fr_1fr_1fr]">
                <label className="grid gap-1 text-xs text-[#b9ad99]">
                  状态
                  <select
                    value={draft.status}
                    onChange={(event) =>
                      updateDraft(action.id, {
                        status: event.target.value as LaunchDailyActionProgressStatus,
                      })
                    }
                    className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
                  >
                    {actionStatusOptions.map((option) => (
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
                    onChange={(event) =>
                      updateDraft(action.id, { owner: event.target.value.slice(0, 80) })
                    }
                    className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
                  />
                </label>
                <label className="grid gap-1 text-xs text-[#b9ad99]">
                  证据备注
                  <input
                    value={draft.evidenceNote}
                    onChange={(event) =>
                      updateDraft(action.id, { evidenceNote: event.target.value.slice(0, 260) })
                    }
                    placeholder={action.evidence}
                    className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
                  />
                </label>
                <label className="grid gap-1 text-xs text-[#b9ad99]">
                  推进备注
                  <input
                    value={draft.note}
                    onChange={(event) =>
                      updateDraft(action.id, { note: event.target.value.slice(0, 260) })
                    }
                    placeholder={action.action}
                    className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
                  />
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs leading-5 text-[#6f6455]">
                  系统状态：{action.status}；动作 ID {action.id}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void save(action);
                  }}
                  disabled={loadingId !== null || savingAll}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-[#6a5431] px-3 text-xs font-semibold text-[#fff7e8] transition hover:border-[#c8a15a] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingId === action.id ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    <Save size={14} />
                  )}
                  保存动作
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {message ? <p className="mt-3 text-xs text-[#b9ad99]">{message}</p> : null}
    </div>
  );
}
