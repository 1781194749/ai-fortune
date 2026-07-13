"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Play } from "lucide-react";

type ProbeResponse =
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

export function AdminPersistenceProbeActions({ adminToken }: { adminToken?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState<boolean | null>(null);

  async function runProbe() {
    setLoading(true);
    setOk(null);
    setMessage("正在写入并读回探针...");

    const response = await fetch(adminApiPath("/api/admin/persistence/probe", adminToken), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = (await response.json().catch(() => ({
      ok: false,
      message: "探针响应解析失败。",
    }))) as ProbeResponse;

    setLoading(false);

    if (!response.ok || !data.ok) {
      setOk(false);
      setMessage(data.message ?? "生产落库探针未通过。");
      router.refresh();
      return;
    }

    setOk(true);
    setMessage(data.message ?? "生产落库探针已通过。");
    router.refresh();
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => {
          void runProbe();
        }}
        disabled={loading}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#6a5431] px-3 text-xs font-semibold text-[#fff7e8] transition hover:border-[#c8a15a] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />}
        运行落库探针
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
  );
}
