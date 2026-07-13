"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Archive, CheckCircle2, Loader2 } from "lucide-react";

type EvidenceResponse =
  | {
      ok: true;
      message?: string;
    }
  | {
      ok: false;
      message?: string;
    };

function adminApiPath(path: string, token?: string) {
  if (!token) {
    return path;
  }

  return `${path}?token=${encodeURIComponent(token)}`;
}

export function AdminLaunchEvidenceActions({ adminToken }: { adminToken?: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState<boolean | null>(null);

  async function archiveEvidence() {
    setLoading(true);
    setOk(null);
    setMessage("正在归档当前上线证据...");

    const response = await fetch(adminApiPath("/api/admin/launch/evidence", adminToken), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    const data = (await response.json().catch(() => ({
      ok: false,
      message: "证据归档响应解析失败。",
    }))) as EvidenceResponse;

    setLoading(false);

    if (!response.ok || !data.ok) {
      setOk(false);
      setMessage(data.message ?? "证据归档失败。");
      router.refresh();
      return;
    }

    setOk(true);
    setNote("");
    setMessage(data.message ?? "上线证据已归档。");
    router.refresh();
  }

  return (
    <div className="mt-4 space-y-3">
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value.slice(0, 240))}
        rows={3}
        placeholder="记录本次归档备注，例如：支付参数待主体通过后复验"
        className="w-full rounded-md border border-[#3a3023] bg-[#080705] px-3 py-2 text-sm text-[#fff7e8] outline-none transition placeholder:text-[#6f6455] focus:border-[#c8a15a]"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            void archiveEvidence();
          }}
          disabled={loading}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#6a5431] px-3 text-xs font-semibold text-[#fff7e8] transition hover:border-[#c8a15a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="animate-spin" size={14} /> : <Archive size={14} />}
          归档当前证据
        </button>
        {message ? (
          <span
            className={`inline-flex items-center gap-2 text-xs ${
              ok === false ? "text-[#e08b74]" : "text-[#b9ad99]"
            }`}
          >
            {ok === false ? (
              <AlertTriangle size={14} aria-hidden="true" />
            ) : (
              <CheckCircle2 size={14} aria-hidden="true" />
            )}
            {message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
