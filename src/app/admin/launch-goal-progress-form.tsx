"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import type { LaunchGoalPlanMilestone } from "@/lib/launch-goal-plan";
import type { LaunchGoalProgressStatus } from "@/lib/launch-goal-progress";

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
  status: LaunchGoalProgressStatus;
  targetDate: string;
  owner: string;
  evidenceNote: string;
  note: string;
};

const progressStatusOptions = [
  { value: "todo", label: "未开始" },
  { value: "in_progress", label: "处理中" },
  { value: "blocked", label: "卡住" },
  { value: "done", label: "已完成" },
] satisfies Array<{ value: LaunchGoalProgressStatus; label: string }>;

function progressStatusLabel(status?: LaunchGoalProgressStatus) {
  return progressStatusOptions.find((option) => option.value === status)?.label ?? "未开始";
}

function adminApiPath(path: string, token?: string) {
  if (!token) {
    return path;
  }

  return `${path}?token=${encodeURIComponent(token)}`;
}

function initialDraft(milestone: LaunchGoalPlanMilestone): Draft {
  return {
    status: milestone.progress?.status ?? "todo",
    targetDate:
      milestone.progress?.targetDate ??
      milestone.progress?.plannedTargetDate ??
      milestone.targetDate,
    owner: milestone.progress?.owner ?? milestone.progress?.plannedOwner ?? milestone.owner,
    evidenceNote: milestone.progress?.evidenceNote ?? "",
    note: milestone.progress?.note ?? "",
  };
}

export function AdminLaunchGoalProgressForm({
  adminToken,
  milestones,
}: {
  adminToken?: string;
  milestones: LaunchGoalPlanMilestone[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(
    Object.fromEntries(milestones.map((milestone) => [milestone.id, initialDraft(milestone)])),
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

  async function saveDraft(milestone: LaunchGoalPlanMilestone, draft: Draft) {
    return fetch(adminApiPath("/api/admin/launch/goal-plan", adminToken), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        milestoneId: milestone.id,
        status: draft.status,
        targetDate: draft.targetDate || null,
        owner: draft.owner,
        evidenceNote: draft.evidenceNote,
        note: draft.note,
      }),
    });
  }

  async function save(milestone: LaunchGoalPlanMilestone) {
    const draft = drafts[milestone.id] ?? initialDraft(milestone);

    setLoadingId(milestone.id);
    setMessage(`正在保存 ${milestone.title}...`);

    const response = await saveDraft(milestone, draft);
    const data = (await response.json().catch(() => ({
      ok: false,
      message: "保存响应解析失败。",
    }))) as AdminActionResponse;

    setLoadingId(null);

    if (!response.ok || !data.ok) {
      setMessage(data.message ?? "保存失败。");
      return;
    }

    setMessage(`${milestone.title} 已更新。`);
    router.refresh();
  }

  async function saveAllVisible() {
    const draftsToSave = milestones.map((milestone) => ({
      milestone,
      draft: drafts[milestone.id] ?? initialDraft(milestone),
    }));

    setSavingAll(true);
    setMessage(`正在保存 ${draftsToSave.length} 个阶段...`);

    for (const { milestone, draft } of draftsToSave) {
      const response = await saveDraft(milestone, draft);
      const data = (await response.json().catch(() => ({
        ok: false,
        message: "保存响应解析失败。",
      }))) as AdminActionResponse;

      if (!response.ok || !data.ok) {
        setSavingAll(false);
        setMessage(`${milestone.title} 保存失败：${data.message ?? "保存失败。"}`);
        return;
      }
    }

    setSavingAll(false);
    setMessage(`已保存 ${draftsToSave.length} 个目标阶段。`);
    router.refresh();
  }

  return (
    <div className="mt-5 rounded-md border border-[#3a3023] bg-[#080705] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#f0d49a]">目标推进快填</p>
          <p className="mt-1 text-xs leading-5 text-[#b9ad99]">
            保存每个阶段的目标日、负责人、推进状态和证据备注；真实上线闸门仍由系统检查决定。
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void saveAllVisible();
          }}
          disabled={savingAll || loadingId !== null || milestones.length === 0}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-[#6a5431] px-3 text-xs font-semibold text-[#fff7e8] transition hover:border-[#c8a15a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {savingAll ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
          保存全部阶段
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {milestones.map((milestone) => {
          const draft = drafts[milestone.id] ?? initialDraft(milestone);

          return (
            <article key={milestone.id} className="rounded-md border border-[#3a3023] bg-[#12100d] p-3">
              <div className="flex flex-col justify-between gap-2 lg:flex-row lg:items-start">
                <div>
                  <p className="text-xs text-[#b9ad99]">{milestone.windowLabel}</p>
                  <p className="mt-1 font-semibold text-[#fff7e8]">{milestone.title}</p>
                </div>
                <span className="inline-flex w-fit rounded-md border border-[#3a3023] px-2 py-1 text-xs text-[#b9ad99]">
                  {milestone.progress
                    ? `${progressStatusLabel(milestone.progress.status)} · 更新 ${milestone.progress.updatedAt.slice(5, 16).replace("T", " ")}`
                    : "未记录"}
                </span>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[0.75fr_0.75fr_0.9fr_1fr_1fr]">
                <label className="grid gap-1 text-xs text-[#b9ad99]">
                  目标日期
                  <input
                    value={draft.targetDate}
                    onChange={(event) => updateDraft(milestone.id, { targetDate: event.target.value })}
                    type="date"
                    className="h-10 rounded-md border border-[#3a3023] bg-[#080705] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
                  />
                </label>
                <label className="grid gap-1 text-xs text-[#b9ad99]">
                  推进状态
                  <select
                    value={draft.status}
                    onChange={(event) =>
                      updateDraft(milestone.id, {
                        status: event.target.value as LaunchGoalProgressStatus,
                      })
                    }
                    className="h-10 rounded-md border border-[#3a3023] bg-[#080705] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
                  >
                    {progressStatusOptions.map((option) => (
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
                      updateDraft(milestone.id, { owner: event.target.value.slice(0, 80) })
                    }
                    className="h-10 rounded-md border border-[#3a3023] bg-[#080705] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
                  />
                </label>
                <label className="grid gap-1 text-xs text-[#b9ad99]">
                  证据备注
                  <input
                    value={draft.evidenceNote}
                    onChange={(event) =>
                      updateDraft(milestone.id, { evidenceNote: event.target.value.slice(0, 260) })
                    }
                    placeholder={milestone.evidence[0]}
                    className="h-10 rounded-md border border-[#3a3023] bg-[#080705] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
                  />
                </label>
                <label className="grid gap-1 text-xs text-[#b9ad99]">
                  推进备注
                  <input
                    value={draft.note}
                    onChange={(event) =>
                      updateDraft(milestone.id, { note: event.target.value.slice(0, 260) })
                    }
                    placeholder={milestone.nextActions[0]}
                    className="h-10 rounded-md border border-[#3a3023] bg-[#080705] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
                  />
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs leading-5 text-[#6f6455]">
                  系统状态：{milestone.status}；计划目标日 {milestone.progress?.plannedTargetDate ?? milestone.targetDate}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void save(milestone);
                  }}
                  disabled={loadingId !== null || savingAll}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-[#6a5431] px-3 text-xs font-semibold text-[#fff7e8] transition hover:border-[#c8a15a] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingId === milestone.id ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    <Save size={14} />
                  )}
                  保存阶段
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
