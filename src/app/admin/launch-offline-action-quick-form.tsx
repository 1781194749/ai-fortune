"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import type {
  ExternalReadinessItem,
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

type QueueAction = {
  item: ExternalReadinessItem;
  title: string;
  phase: string;
  owner: string;
  evidencePlaceholder: string;
  suggestedTargetDate?: string;
  scheduleLabel?: string;
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

function initialDraft(item: ExternalReadinessItem, suggestedTargetDate?: string): Draft {
  return {
    status: item.status,
    targetDate: item.targetDate ?? suggestedTargetDate ?? "",
    receiptNo: item.receiptNo ?? "",
    evidenceUrl: item.evidenceUrl ?? "",
    evidenceNote: item.evidenceNote ?? "",
    note: item.note ?? "",
  };
}

function statusLabel(status: ExternalReadinessStatus) {
  return statusOptions.find((option) => option.value === status)?.label ?? status;
}

async function saveExternalReadiness(input: {
  adminToken?: string;
  item: ExternalReadinessItem;
  draft: Draft;
}) {
  const response = await fetch(
    adminApiPath("/api/admin/launch/external-readiness", input.adminToken),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: input.item.id,
        status: input.draft.status,
        targetDate: input.draft.targetDate || null,
        receiptNo: input.draft.receiptNo,
        evidenceUrl: input.draft.evidenceUrl || null,
        evidenceNote: input.draft.evidenceNote,
        note: input.draft.note,
      }),
    },
  );
  const data = (await response.json().catch(() => ({
    ok: false,
    message: "保存响应解析失败。",
  }))) as AdminActionResponse;

  if (!response.ok || !data.ok) {
    throw new Error(data.message ?? "保存失败。");
  }

  return data;
}

async function saveExternalReadinessBatch(input: {
  adminToken?: string;
  items: Array<{
    item: ExternalReadinessItem;
    draft: Draft;
  }>;
}) {
  const response = await fetch(adminApiPath("/api/admin/launch/external-readiness", input.adminToken), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: input.items.map(({ item, draft }) => ({
        id: item.id,
        status: draft.status,
        targetDate: draft.targetDate || null,
        receiptNo: draft.receiptNo,
        evidenceUrl: draft.evidenceUrl || null,
        evidenceNote: draft.evidenceNote,
        note: draft.note,
      })),
    }),
  });
  const data = (await response.json().catch(() => ({
    ok: false,
    message: "保存响应解析失败。",
  }))) as AdminActionResponse;

  if (!response.ok || !data.ok) {
    throw new Error(data.message ?? "批量保存失败。");
  }

  return data;
}

export function AdminLaunchOfflineActionQuickForm({
  adminToken,
  item,
  evidencePlaceholder,
  suggestedTargetDate,
  scheduleLabel,
}: {
  adminToken?: string;
  item?: ExternalReadinessItem;
  evidencePlaceholder: string;
  suggestedTargetDate?: string;
  scheduleLabel?: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(
    item ? initialDraft(item, suggestedTargetDate) : null,
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  if (!item || !draft) {
    return (
      <p className="mt-4 rounded-md bg-[#12100d] p-3 text-xs leading-5 text-[#b9ad99]">
        当前没有需要快填的线下事项。
      </p>
    );
  }

  async function save() {
    if (!item || !draft) {
      return;
    }

    setLoading(true);
    setMessage(`正在保存 ${item.title}...`);

    try {
      await saveExternalReadiness({
        adminToken,
        item,
        draft,
      });
    } catch (error) {
      setLoading(false);
      setMessage(error instanceof Error ? error.message : "保存失败。");
      return;
    }

    setLoading(false);
    setMessage(`${item.title} 已更新为${statusLabel(draft.status)}。`);
    router.refresh();
  }

  return (
    <div className="mt-4 rounded-md border border-[#3a3023] bg-[#12100d] p-3">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <p className="text-xs font-semibold text-[#f0d49a]">快填办理进度</p>
          <p className="mt-1 text-xs leading-5 text-[#b9ad99]">
            {item.updatedAt
              ? `上次更新 ${item.updatedAt.slice(5, 16).replace("T", " ")}`
              : suggestedTargetDate
                ? `尚未保存过办理证据，已预填建议目标日 ${suggestedTargetDate}`
                : "尚未保存过办理证据"}
          </p>
          {scheduleLabel ? (
            <p className="mt-1 text-xs leading-5 text-[#6f6455]">排期状态：{scheduleLabel}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => {
            void save();
          }}
          disabled={loading}
          className="inline-flex h-9 w-fit items-center justify-center gap-2 rounded-md border border-[#6a5431] px-3 text-xs font-semibold text-[#fff7e8] transition hover:border-[#c8a15a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
          保存进度
        </button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          状态
          <select
            value={draft.status}
            onChange={(event) =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      status: event.target.value as ExternalReadinessStatus,
                    }
                  : current,
              )
            }
            className="h-9 rounded-md border border-[#3a3023] bg-[#080705] px-2 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
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
            onChange={(event) =>
              setDraft((current) =>
                current ? { ...current, targetDate: event.target.value } : current,
              )
            }
            type="date"
            className="h-9 rounded-md border border-[#3a3023] bg-[#080705] px-2 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          提交回执
          <input
            value={draft.receiptNo}
            onChange={(event) =>
              setDraft((current) =>
                current
                  ? { ...current, receiptNo: event.target.value.slice(0, 120) }
                  : current,
              )
            }
            placeholder="申请号 / 商户号 / 备案号"
            className="h-9 rounded-md border border-[#3a3023] bg-[#080705] px-2 text-sm text-[#fff7e8] outline-none placeholder:text-[#6f6455] focus:border-[#c8a15a]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          证据链接
          <input
            value={draft.evidenceUrl}
            onChange={(event) =>
              setDraft((current) =>
                current
                  ? { ...current, evidenceUrl: event.target.value.slice(0, 500) }
                  : current,
              )
            }
            placeholder="https://..."
            className="h-9 rounded-md border border-[#3a3023] bg-[#080705] px-2 text-sm text-[#fff7e8] outline-none placeholder:text-[#6f6455] focus:border-[#c8a15a]"
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          证据
          <input
            value={draft.evidenceNote}
            onChange={(event) =>
              setDraft((current) =>
                current
                  ? { ...current, evidenceNote: event.target.value.slice(0, 220) }
                  : current,
              )
            }
            placeholder={evidencePlaceholder}
            className="h-9 rounded-md border border-[#3a3023] bg-[#080705] px-2 text-sm text-[#fff7e8] outline-none placeholder:text-[#6f6455] focus:border-[#c8a15a]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          备注
          <input
            value={draft.note}
            onChange={(event) =>
              setDraft((current) =>
                current ? { ...current, note: event.target.value.slice(0, 220) } : current,
              )
            }
            placeholder={item.action}
            className="h-9 rounded-md border border-[#3a3023] bg-[#080705] px-2 text-sm text-[#fff7e8] outline-none placeholder:text-[#6f6455] focus:border-[#c8a15a]"
          />
        </label>
      </div>

      {message ? <p className="mt-3 text-xs text-[#b9ad99]">{message}</p> : null}
    </div>
  );
}

export function AdminLaunchOfflineActionQueueForm({
  adminToken,
  actions,
}: {
  adminToken?: string;
  actions: QueueAction[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(
    Object.fromEntries(
      actions.map((action) => [
        action.item.id,
        initialDraft(action.item, action.suggestedTargetDate),
      ]),
    ),
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  function updateDraft(id: string, patch: Partial<Draft>) {
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

  async function saveAll() {
    setLoading(true);
    setMessage(`正在保存 ${actions.length} 个优先事项...`);

    try {
      await saveExternalReadinessBatch({
        adminToken,
        items: actions.map((action) => ({
          item: action.item,
          draft: drafts[action.item.id] ?? initialDraft(action.item, action.suggestedTargetDate),
        })),
      });
    } catch (error) {
      setLoading(false);
      setMessage(error instanceof Error ? error.message : "批量保存失败。");
      return;
    }

    setLoading(false);
    setMessage(`已保存 ${actions.length} 个优先事项。`);
    router.refresh();
  }

  if (actions.length === 0) {
    return (
      <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
        当前没有可批量快填的优先事项。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-semibold text-[#f0d49a]">优先动作快填</p>
          <p className="mt-1 text-xs leading-5 text-[#b9ad99]">
            一次保存当前优先办理事项；未排期项会预填建议目标日，进度会同步到外部事项、排期风险和上线总闸。
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void saveAll();
          }}
          disabled={loading}
          className="inline-flex h-9 w-fit items-center justify-center gap-2 rounded-md border border-[#6a5431] px-3 text-xs font-semibold text-[#fff7e8] transition hover:border-[#c8a15a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
          保存全部
        </button>
      </div>

      <div className="space-y-3">
        {actions.map((action) => {
          const draft =
            drafts[action.item.id] ?? initialDraft(action.item, action.suggestedTargetDate);

          return (
            <div
              key={action.item.id}
              className="rounded-md border border-[#3a3023] bg-[#12100d] p-3"
            >
              <div className="flex flex-col justify-between gap-2 lg:flex-row lg:items-start">
                <div>
                  <p className="text-xs text-[#b9ad99]">
                    {action.phase} · {action.owner}
                  </p>
                  <p className="mt-1 font-semibold leading-6 text-[#fff7e8]">
                    {action.title}
                  </p>
                </div>
                <span className="inline-flex w-fit rounded-md border border-[#3a3023] px-2 py-1 text-xs text-[#b9ad99]">
                  {action.item.updatedAt
                    ? `更新 ${action.item.updatedAt.slice(5, 16).replace("T", " ")}`
                    : action.suggestedTargetDate
                      ? `建议 ${action.suggestedTargetDate}`
                      : "未更新"}
                </span>
              </div>
              {action.scheduleLabel ? (
                <p className="mt-2 text-xs leading-5 text-[#6f6455]">
                  排期状态：{action.scheduleLabel}
                </p>
              ) : null}

              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                <label className="grid gap-1 text-xs text-[#b9ad99]">
                  状态
                  <select
                    value={draft.status}
                    onChange={(event) =>
                      updateDraft(action.item.id, {
                        status: event.target.value as ExternalReadinessStatus,
                      })
                    }
                    className="h-9 rounded-md border border-[#3a3023] bg-[#080705] px-2 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
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
                    onChange={(event) =>
                      updateDraft(action.item.id, {
                        targetDate: event.target.value,
                      })
                    }
                    type="date"
                    className="h-9 rounded-md border border-[#3a3023] bg-[#080705] px-2 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
                  />
                </label>
                <label className="grid gap-1 text-xs text-[#b9ad99]">
                  提交回执
                  <input
                    value={draft.receiptNo}
                    onChange={(event) =>
                      updateDraft(action.item.id, {
                        receiptNo: event.target.value.slice(0, 120),
                      })
                    }
                    placeholder="申请号 / 商户号 / 备案号"
                    className="h-9 rounded-md border border-[#3a3023] bg-[#080705] px-2 text-sm text-[#fff7e8] outline-none placeholder:text-[#6f6455] focus:border-[#c8a15a]"
                  />
                </label>
                <label className="grid gap-1 text-xs text-[#b9ad99]">
                  证据链接
                  <input
                    value={draft.evidenceUrl}
                    onChange={(event) =>
                      updateDraft(action.item.id, {
                        evidenceUrl: event.target.value.slice(0, 500),
                      })
                    }
                    placeholder="https://..."
                    className="h-9 rounded-md border border-[#3a3023] bg-[#080705] px-2 text-sm text-[#fff7e8] outline-none placeholder:text-[#6f6455] focus:border-[#c8a15a]"
                  />
                </label>
              </div>

              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <label className="grid gap-1 text-xs text-[#b9ad99]">
                  证据
                  <input
                    value={draft.evidenceNote}
                    onChange={(event) =>
                      updateDraft(action.item.id, {
                        evidenceNote: event.target.value.slice(0, 220),
                      })
                    }
                    placeholder={action.evidencePlaceholder}
                    className="h-9 rounded-md border border-[#3a3023] bg-[#080705] px-2 text-sm text-[#fff7e8] outline-none placeholder:text-[#6f6455] focus:border-[#c8a15a]"
                  />
                </label>
                <label className="grid gap-1 text-xs text-[#b9ad99]">
                  备注
                  <input
                    value={draft.note}
                    onChange={(event) =>
                      updateDraft(action.item.id, {
                        note: event.target.value.slice(0, 220),
                      })
                    }
                    placeholder={action.item.action}
                    className="h-9 rounded-md border border-[#3a3023] bg-[#080705] px-2 text-sm text-[#fff7e8] outline-none placeholder:text-[#6f6455] focus:border-[#c8a15a]"
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {message ? <p className="text-xs text-[#b9ad99]">{message}</p> : null}
    </div>
  );
}
