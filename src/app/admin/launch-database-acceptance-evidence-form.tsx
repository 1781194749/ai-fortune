"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import type { HealthStatus } from "@/lib/health-checks";
import type {
  LaunchDatabaseAcceptanceEvidenceItemId,
  LaunchDatabaseAcceptanceEvidenceRecord,
} from "@/lib/launch-database-acceptance";

type AdminActionResponse =
  | {
      ok: true;
      message?: string;
      record?: LaunchDatabaseAcceptanceEvidenceRecord;
    }
  | {
      ok: false;
      message?: string;
    };

type Draft = {
  itemId: LaunchDatabaseAcceptanceEvidenceItemId;
  status: HealthStatus;
  evidenceUrl: string;
  migrationLogUrl: string;
  backupPolicyUrl: string;
  restoreDrillUrl: string;
  note: string;
};

const itemOptions = [
  { value: "provision", label: "生产 PostgreSQL 实例" },
  { value: "connection", label: "DATABASE_URL / 白名单" },
  { value: "schema", label: "Prisma Schema / 迁移" },
  { value: "probe", label: "落库探针" },
  { value: "coverage", label: "上线事件覆盖" },
  { value: "backup", label: "自动备份策略" },
  { value: "restore", label: "恢复演练" },
] satisfies Array<{ value: LaunchDatabaseAcceptanceEvidenceItemId; label: string }>;

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

function itemLabel(itemId: LaunchDatabaseAcceptanceEvidenceItemId) {
  return itemOptions.find((option) => option.value === itemId)?.label ?? itemId;
}

function initialDraft(record?: LaunchDatabaseAcceptanceEvidenceRecord): Draft {
  return {
    itemId: record?.metadata.itemId ?? "backup",
    status: record?.metadata.status ?? "warning",
    evidenceUrl: record?.metadata.evidenceUrl ?? "",
    migrationLogUrl: record?.metadata.migrationLogUrl ?? "",
    backupPolicyUrl: record?.metadata.backupPolicyUrl ?? "",
    restoreDrillUrl: record?.metadata.restoreDrillUrl ?? "",
    note:
      record?.metadata.note ??
      "记录生产库验收结果，注意不要保存明文连接串、账号密码或完整密钥。",
  };
}

export function AdminLaunchDatabaseAcceptanceEvidenceForm({
  adminToken,
  records,
}: {
  adminToken?: string;
  records: LaunchDatabaseAcceptanceEvidenceRecord[];
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
    setMessage("正在保存数据库验收证据...");

    const response = await fetch(adminApiPath("/api/admin/launch/database-plan", adminToken), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: draft.itemId,
        status: draft.status,
        evidenceUrl: draft.evidenceUrl || null,
        migrationLogUrl: draft.migrationLogUrl || null,
        backupPolicyUrl: draft.backupPolicyUrl || null,
        restoreDrillUrl: draft.restoreDrillUrl || null,
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

    setMessage(`数据库验收证据已保存为${statusLabel(draft.status)}。`);
    router.refresh();
  }

  return (
    <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-semibold text-[#f0d49a]">数据库验收证据快填</p>
          <p className="mt-1 text-xs leading-5 text-[#b9ad99]">
            保存连接检查、Schema 同步、探针、备份和恢复演练证据，避免收费上线前漏掉数据安全闭环。
          </p>
        </div>
        <span className="inline-flex w-fit rounded-md border border-[#3a3023] px-2 py-1 text-xs text-[#b9ad99]">
          已归档 {records.length} 条
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_0.8fr_1fr_1fr]">
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          条目
          <select
            value={draft.itemId}
            onChange={(event) =>
              patchDraft({
                itemId: event.target.value as LaunchDatabaseAcceptanceEvidenceItemId,
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
          迁移日志
          <input
            value={draft.migrationLogUrl}
            onChange={(event) =>
              patchDraft({ migrationLogUrl: event.target.value.slice(0, 500) })
            }
            placeholder="https://..."
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          备份策略
          <input
            value={draft.backupPolicyUrl}
            onChange={(event) =>
              patchDraft({ backupPolicyUrl: event.target.value.slice(0, 500) })
            }
            placeholder="https://..."
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          恢复演练
          <input
            value={draft.restoreDrillUrl}
            onChange={(event) =>
              patchDraft({ restoreDrillUrl: event.target.value.slice(0, 500) })
            }
            placeholder="https://..."
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
      </div>

      <label className="mt-3 grid gap-1 text-xs text-[#b9ad99]">
        备注
        <input
          value={draft.note}
          onChange={(event) => patchDraft({ note: event.target.value.slice(0, 320) })}
          placeholder="记录验收范围、命令输出摘要和待复核点"
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
