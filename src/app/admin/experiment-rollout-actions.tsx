"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FlaskConical, Loader2, Trophy } from "lucide-react";
import type { CheckoutExperimentVariant } from "@/lib/checkout-experiment";

type AdminActionResponse =
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

export function ExperimentRolloutActions({
  adminToken,
  recommendedVariant,
}: {
  adminToken?: string;
  recommendedVariant?: CheckoutExperimentVariant;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"experiment" | CheckoutExperimentVariant | null>(null);
  const [message, setMessage] = useState("");

  async function updateRollout(mode: "experiment" | "forced", variant?: CheckoutExperimentVariant) {
    const loadingKey = mode === "experiment" ? "experiment" : variant ?? null;

    setLoading(loadingKey);
    setMessage(mode === "experiment" ? "正在恢复 A/B..." : "正在固化默认券...");

    const response = await fetch(
      adminApiPath("/api/admin/experiments/new-user-offer/config", adminToken),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          forcedVariant: variant,
          note:
            mode === "experiment"
              ? "后台恢复首单 A/B 实验"
              : `后台固化首单实验变体 ${variant}`,
        }),
      },
    );
    const data = (await response.json()) as AdminActionResponse;

    setLoading(null);

    if (!response.ok || !data.ok) {
      setMessage(data.ok === false ? data.message ?? "操作失败。" : "操作失败。");
      return;
    }

    setMessage(mode === "experiment" ? "已恢复 A/B 分流。" : "已固化默认新客券。");
    router.refresh();
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => {
          void updateRollout("experiment");
        }}
        disabled={loading !== null}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-[#3a3023] px-3 text-xs font-semibold text-[#d8cab2] transition hover:border-[#c8a15a] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading === "experiment" ? (
          <Loader2 className="animate-spin" size={14} />
        ) : (
          <FlaskConical size={14} />
        )}
        恢复 A/B
      </button>
      {(["first50", "xuanji20"] as const).map((variant) => (
        <button
          key={variant}
          type="button"
          onClick={() => {
            void updateRollout("forced", variant);
          }}
          disabled={loading !== null}
          className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
            recommendedVariant === variant
              ? "border-[#c8a15a] text-[#f0d49a]"
              : "border-[#3a3023] text-[#d8cab2] hover:border-[#c8a15a]"
          }`}
        >
          {loading === variant ? (
            <Loader2 className="animate-spin" size={14} />
          ) : (
            <Trophy size={14} />
          )}
          固化 {variant === "first50" ? "FIRST50" : "XUANJI20"}
        </button>
      ))}
      {message ? <p className="basis-full text-xs text-[#b9ad99]">{message}</p> : null}
    </div>
  );
}
