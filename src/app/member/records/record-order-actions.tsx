"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RecordOrderActions({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function cancel() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/payments/mock/orders/${orderId}/cancel`, { method: "POST" });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;

      if (!response.ok || !data?.ok) {
        setMessage(data?.message ?? "取消失败");
        return;
      }

      router.refresh();
    } catch {
      setMessage("网络异常");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/checkout/mock/${orderId}`} className="text-xs text-[#d8b873] hover:text-[#efd9a6]">继续支付</Link>
      <button type="button" disabled={loading} onClick={() => void cancel()} className="text-xs text-[#d98572] hover:text-[#f0a08c] disabled:opacity-50">
        {loading ? "取消中" : "取消订单"}
      </button>
      {message ? <span className="text-xs text-[#d98572]">{message}</span> : null}
    </div>
  );
}
