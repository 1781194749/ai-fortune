"use client";

import { useState } from "react";
import { BadgeCheck, Loader2 } from "lucide-react";

export function MockPayButton({ orderId }: { orderId: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("确认后，会员权益会立即发放到当前账号。");

  async function pay() {
    setLoading(true);
    setMessage("正在确认订单并发放权益...");

    const response = await fetch(`/api/payments/mock/orders/${orderId}/pay`, {
      method: "POST",
    });
    const data = (await response.json()) as {
      ok: boolean;
      message?: string;
      redirectTo?: string;
    };

    if (!response.ok || !data.ok) {
      setLoading(false);
      setMessage(data.message ?? "支付失败，请稍后重试。");
      return;
    }

    window.location.href = data.redirectTo ?? "/member";
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={pay}
        disabled={loading}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#c9a35f] px-5 font-semibold text-[#17130d] transition hover:bg-[#efd9a6] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="animate-spin" size={18} aria-hidden="true" />
        ) : (
          <BadgeCheck size={18} aria-hidden="true" />
        )}
        {loading ? "正在开通..." : "确认开通"}
      </button>
      <p className="text-center text-xs leading-5 text-[#777168]">{message}</p>
    </div>
  );
}
