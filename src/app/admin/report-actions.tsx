"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Gift, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

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

export function AdminReportActions({
  reportId,
  status,
  adminToken,
}: {
  reportId: string;
  status: string;
  adminToken?: string;
}) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<"retry" | "compensate" | null>(null);
  const [message, setMessage] = useState("");
  const canRetry = status === "FAILED" || status === "GENERATING";

  async function postAction(action: "retry" | "compensate") {
    setLoadingAction(action);
    setMessage(action === "retry" ? "正在重试..." : "正在补发...");

    const response = await fetch(
      adminApiPath(`/api/admin/reports/${reportId}/${action}`, adminToken),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body:
          action === "compensate"
            ? JSON.stringify({
                amount: 80,
                reason: "报告生成异常运营补偿 80 星力",
              })
            : undefined,
      },
    );
    const data = (await response.json()) as AdminActionResponse;

    setLoadingAction(null);

    if (!response.ok || data.ok === false) {
      setMessage(data.ok === false ? data.message ?? "操作失败。" : "操作失败。");
      return;
    }

    setMessage(data.message ?? (action === "retry" ? "已进入重试队列。" : "已补发星力。"));
    router.refresh();
  }

  return (
    <div className="inline-flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1.5">
        {canRetry ? (
          <Button
            type="button"
            onClick={() => {
              void postAction("retry");
            }}
            disabled={loadingAction !== null}
            variant="outline"
            size="sm"
          >
            {loadingAction === "retry" ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <RotateCw size={14} />
            )}
            重试生成
          </Button>
        ) : null}
        <Button
          type="button"
          onClick={() => {
            void postAction("compensate");
          }}
          disabled={loadingAction !== null}
          variant="secondary"
          size="sm"
        >
          {loadingAction === "compensate" ? (
            <Loader2 className="animate-spin" size={14} />
          ) : (
            <Gift size={14} />
          )}
          补偿
        </Button>
      </div>
      {message ? <p className="max-w-56 whitespace-normal text-right text-[11px] leading-4 text-muted-foreground">{message}</p> : null}
    </div>
  );
}
