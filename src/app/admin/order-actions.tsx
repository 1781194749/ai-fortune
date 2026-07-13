"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type AdminOrderActionResponse =
  | {
      ok: true;
      message?: string;
      order?: {
        status: string;
      };
      balanceAfter?: number;
      tierAfter?: string;
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

export function AdminOrderActions({
  orderId,
  status,
  productName,
  adminToken,
}: {
  orderId: string;
  status: string;
  productName: string;
  adminToken?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const canRefund = status === "PAID";

  async function refundOrder() {
    const reason = `后台订单退款：${productName}`;
    const confirmed = window.confirm(
      "确认将该订单标记为退款，并扣回本订单发放的星力和会员额度？",
    );

    if (!confirmed) {
      return;
    }

    setLoading(true);
    setMessage("正在退款并回滚权益...");

    const response = await fetch(
      adminApiPath(`/api/admin/orders/${orderId}/refund`, adminToken),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      },
    );
    const data = (await response.json()) as AdminOrderActionResponse;

    setLoading(false);

    if (!response.ok || !data.ok) {
      setMessage(data.ok === false ? data.message ?? "退款失败。" : "退款失败。");
      return;
    }

    setMessage(
      data.balanceAfter !== undefined
        ? `${data.message ?? "已退款。"} 当前星力 ${data.balanceAfter}，档位 ${data.tierAfter ?? "FREE"}。`
        : data.message ?? "已退款。",
    );
    router.refresh();
  }

  if (!canRefund) {
    return null;
  }

  return (
    <div className="inline-flex flex-col items-end gap-1.5">
        <Button
          type="button"
          onClick={() => {
            void refundOrder();
          }}
          disabled={loading}
          variant="destructive"
          size="sm"
        >
          {loading ? <Loader2 className="animate-spin" size={14} /> : <Undo2 size={14} />}
          退款
        </Button>
      {message ? <p className="max-w-48 whitespace-normal text-right text-[11px] leading-4 text-muted-foreground">{message}</p> : null}
    </div>
  );
}
