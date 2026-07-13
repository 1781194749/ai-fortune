"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import type { HealthStatus } from "@/lib/health-checks";
import type {
  LaunchDeploymentAcceptanceEvidenceItemId,
  LaunchDeploymentAcceptanceEvidenceRecord,
} from "@/lib/launch-deployment-acceptance";

type AdminActionResponse =
  | {
      ok: true;
      message?: string;
      record?: LaunchDeploymentAcceptanceEvidenceRecord;
    }
  | {
      ok: false;
      message?: string;
    };

type Draft = {
  itemId: LaunchDeploymentAcceptanceEvidenceItemId;
  status: HealthStatus;
  evidenceUrl: string;
  urlCheckUrl: string;
  preflightUrl: string;
  smokeRecordingUrl: string;
  rollbackUrl: string;
  note: string;
};

const itemOptions = [
  { value: "domain_dns", label: "域名 / DNS / HTTPS" },
  { value: "https_app_url", label: "正式 APP_URL" },
  { value: "deploy_env", label: "生产变量" },
  { value: "admin_security", label: "后台保护" },
  { value: "session_secret", label: "会话安全" },
  { value: "public_callbacks", label: "公网回调" },
  { value: "preflight", label: "上线预检" },
  { value: "page_smoke", label: "页面烟测" },
  { value: "restart_rollback", label: "重启回滚" },
] satisfies Array<{ value: LaunchDeploymentAcceptanceEvidenceItemId; label: string }>;

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

function itemLabel(itemId: LaunchDeploymentAcceptanceEvidenceItemId) {
  return itemOptions.find((option) => option.value === itemId)?.label ?? itemId;
}

function initialDraft(record?: LaunchDeploymentAcceptanceEvidenceRecord): Draft {
  return {
    itemId: record?.metadata.itemId ?? "https_app_url",
    status: record?.metadata.status ?? "warning",
    evidenceUrl: record?.metadata.evidenceUrl ?? "",
    urlCheckUrl: record?.metadata.urlCheckUrl ?? "",
    preflightUrl: record?.metadata.preflightUrl ?? "",
    smokeRecordingUrl: record?.metadata.smokeRecordingUrl ?? "",
    rollbackUrl: record?.metadata.rollbackUrl ?? "",
    note:
      record?.metadata.note ??
      "记录正式域名、部署变量或公网验收结果，注意不要保存真实 token、密钥或完整连接串。",
  };
}

export function AdminLaunchDeploymentAcceptanceEvidenceForm({
  adminToken,
  records,
}: {
  adminToken?: string;
  records: LaunchDeploymentAcceptanceEvidenceRecord[];
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
    setMessage("正在保存部署验收证据...");

    const response = await fetch(adminApiPath("/api/admin/launch/deployment-plan", adminToken), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: draft.itemId,
        status: draft.status,
        evidenceUrl: draft.evidenceUrl || null,
        urlCheckUrl: draft.urlCheckUrl || null,
        preflightUrl: draft.preflightUrl || null,
        smokeRecordingUrl: draft.smokeRecordingUrl || null,
        rollbackUrl: draft.rollbackUrl || null,
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

    setMessage(`部署验收证据已保存为${statusLabel(draft.status)}。`);
    router.refresh();
  }

  return (
    <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-semibold text-[#f0d49a]">部署验收证据快填</p>
          <p className="mt-1 text-xs leading-5 text-[#b9ad99]">
            保存正式域名、生产变量、后台保护、公网回调、预检、页面烟测和回滚证据。
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
                itemId: event.target.value as LaunchDeploymentAcceptanceEvidenceItemId,
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
          URL 检查输出
          <input
            value={draft.urlCheckUrl}
            onChange={(event) => patchDraft({ urlCheckUrl: event.target.value.slice(0, 500) })}
            placeholder="https://..."
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr_1fr]">
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          预检输出
          <input
            value={draft.preflightUrl}
            onChange={(event) => patchDraft({ preflightUrl: event.target.value.slice(0, 500) })}
            placeholder="https://..."
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          页面烟测/录屏
          <input
            value={draft.smokeRecordingUrl}
            onChange={(event) =>
              patchDraft({ smokeRecordingUrl: event.target.value.slice(0, 500) })
            }
            placeholder="https://..."
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          回滚/重启记录
          <input
            value={draft.rollbackUrl}
            onChange={(event) => patchDraft({ rollbackUrl: event.target.value.slice(0, 500) })}
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
          placeholder="记录域名、部署环境、检查命令和待复核点"
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
