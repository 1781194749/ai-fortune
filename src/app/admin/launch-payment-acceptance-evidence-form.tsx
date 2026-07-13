"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import type { HealthStatus } from "@/lib/health-checks";
import type {
  LaunchPaymentAcceptanceChannel,
  LaunchPaymentAcceptanceEvidenceRecord,
} from "@/lib/launch-payment-acceptance";
import type { LivePaymentChannel } from "@/lib/payment-adapters";

type AdminActionResponse =
  | {
      ok: true;
      message?: string;
      record?: LaunchPaymentAcceptanceEvidenceRecord;
    }
  | {
      ok: false;
      message?: string;
    };

type Draft = {
  channel: LivePaymentChannel;
  status: HealthStatus;
  orderId: string;
  providerOrderId: string;
  amountYuan: string;
  evidenceUrl: string;
  reconciliationUrl: string;
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

function yuanFromCents(value?: number) {
  if (value === undefined) {
    return "";
  }

  return (value / 100).toFixed(value % 100 === 0 ? 0 : 2);
}

function amountCentsFromYuan(value: string) {
  const text = value.trim();

  if (!text) {
    return undefined;
  }

  const amount = Number(text);

  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return Math.round(amount * 100);
}

function initialDraft(channel: LaunchPaymentAcceptanceChannel): Draft {
  const evidence = channel.latestEvidence?.metadata;
  const order = channel.latestPaidOrder ?? channel.latestOrder;

  return {
    channel: channel.id,
    status: evidence?.status ?? (channel.latestPaidOrder ? "ready" : "warning"),
    orderId: evidence?.orderId ?? order?.id ?? "",
    providerOrderId: evidence?.providerOrderId ?? channel.latestPaidOrder?.providerOrderId ?? "",
    amountYuan: yuanFromCents(evidence?.amountCents ?? order?.amountCents),
    evidenceUrl: evidence?.evidenceUrl ?? "",
    reconciliationUrl: evidence?.reconciliationUrl ?? "",
    note:
      evidence?.note ??
      (channel.latestPaidOrder
        ? "小额订单已支付，待核对平台交易、站内订单、权益到账和对账截图。"
        : "等待创建并支付小额真实订单。"),
  };
}

function statusLabel(status: HealthStatus) {
  return statusOptions.find((option) => option.value === status)?.label ?? status;
}

export function AdminLaunchPaymentAcceptanceEvidenceForm({
  adminToken,
  channels,
  records,
}: {
  adminToken?: string;
  channels: LaunchPaymentAcceptanceChannel[];
  records: LaunchPaymentAcceptanceEvidenceRecord[];
}) {
  const router = useRouter();
  const defaultChannel = useMemo(
    () =>
      channels.find((channel) => channel.latestPaidOrder && !channel.latestEvidence) ??
      channels.find((channel) => channel.latestPaidOrder) ??
      channels[0],
    [channels],
  );
  const [draft, setDraft] = useState<Draft | null>(
    defaultChannel ? initialDraft(defaultChannel) : null,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  if (!draft || channels.length === 0) {
    return (
      <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
        <p className="text-sm text-[#b9ad99]">暂无可记录的真实支付渠道。</p>
      </div>
    );
  }

  const activeDraft = draft;

  function patchDraft(patch: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function selectChannel(channelId: LivePaymentChannel) {
    const channel = channels.find((item) => item.id === channelId);

    if (channel) {
      setDraft(initialDraft(channel));
    }
  }

  async function save() {
    const currentDraft = draft;

    if (!currentDraft) {
      return;
    }

    const amountCents = amountCentsFromYuan(currentDraft.amountYuan);

    if (amountCents === null) {
      setMessage("金额格式不正确。");
      return;
    }

    setSaving(true);
    setMessage("正在保存支付验收证据...");

    const response = await fetch(
      adminApiPath("/api/admin/launch/payment-acceptance", adminToken),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: currentDraft.channel,
          status: currentDraft.status,
          orderId: currentDraft.orderId || null,
          providerOrderId: currentDraft.providerOrderId || null,
          amountCents,
          evidenceUrl: currentDraft.evidenceUrl || null,
          reconciliationUrl: currentDraft.reconciliationUrl || null,
          note: currentDraft.note,
        }),
      },
    );
    const data = (await response.json().catch(() => ({
      ok: false,
      message: "保存响应解析失败。",
    }))) as AdminActionResponse;

    setSaving(false);

    if (!response.ok || !data.ok) {
      setMessage(data.message ?? "保存失败。");
      return;
    }

    setMessage(`支付验收证据已保存为${statusLabel(currentDraft.status)}。`);
    router.refresh();
  }

  return (
    <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-semibold text-[#f0d49a]">支付验收证据快填</p>
          <p className="mt-1 text-xs leading-5 text-[#b9ad99]">
            保存平台交易截图、站内订单、权益到账和对账凭证，作为小额真实订单放量前的证据。
          </p>
        </div>
        <span className="inline-flex w-fit rounded-md border border-[#3a3023] px-2 py-1 text-xs text-[#b9ad99]">
          已归档 {records.length} 条
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[0.8fr_0.8fr_1fr_1fr]">
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          渠道
          <select
            value={activeDraft.channel}
            onChange={(event) => selectChannel(event.target.value as LivePaymentChannel)}
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          >
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.label}
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
          站内订单号
          <input
            value={activeDraft.orderId}
            onChange={(event) => patchDraft({ orderId: event.target.value.slice(0, 120) })}
            placeholder="Order.id"
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          平台交易号
          <input
            value={activeDraft.providerOrderId}
            onChange={(event) =>
              patchDraft({ providerOrderId: event.target.value.slice(0, 160) })
            }
            placeholder="trade_no / transaction_id"
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[0.7fr_1fr_1fr]">
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          金额
          <input
            value={activeDraft.amountYuan}
            onChange={(event) => patchDraft({ amountYuan: event.target.value.slice(0, 12) })}
            inputMode="decimal"
            placeholder="9.90"
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          交易/权益截图
          <input
            value={activeDraft.evidenceUrl}
            onChange={(event) => patchDraft({ evidenceUrl: event.target.value.slice(0, 500) })}
            placeholder="https://..."
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[#b9ad99]">
          对账凭证
          <input
            value={activeDraft.reconciliationUrl}
            onChange={(event) =>
              patchDraft({ reconciliationUrl: event.target.value.slice(0, 500) })
            }
            placeholder="https://..."
            className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
          />
        </label>
      </div>

      <label className="mt-3 grid gap-1 text-xs text-[#b9ad99]">
        备注
        <input
          value={activeDraft.note}
          onChange={(event) => patchDraft({ note: event.target.value.slice(0, 260) })}
          placeholder="记录支付平台、站内订单、权益到账和对账核对结果"
          className="h-10 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none focus:border-[#c8a15a]"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-[#6f6455]">
          最近记录：
          {records[0]
            ? `${records[0].metadata.channelLabel} · ${statusLabel(records[0].metadata.status)} · ${records[0].metadata.savedAt.slice(0, 16).replace("T", " ")}`
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
