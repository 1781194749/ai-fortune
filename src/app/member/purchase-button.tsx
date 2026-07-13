"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  BadgePercent,
  Check,
  CreditCard,
  Loader2,
  WalletCards,
  X,
} from "lucide-react";
import type { ProductCode } from "@/lib/commerce";

type LiveChannel = "alipay" | "wechat_pay";
type LivePaymentGate = {
  allowed: boolean;
  label: string;
  detail: string;
  action: string;
  message: string;
  decision: string;
  scope: string;
  scopeLabel: string;
  requiresAllowlist: boolean;
  allowlist: {
    configured: boolean;
    userIdsConfigured: number;
    emailsConfigured: number;
    totalAccounts: number;
  };
  currentUser: {
    checked: boolean;
    allowed: boolean;
    matchedBy: string;
  };
};

type PromotionQuote =
  | {
      ok: true;
      priceLabel: string;
      originalPriceLabel: string;
      discountLabel: string;
      message: string;
    }
  | {
      ok: false;
      message?: string;
    };

export function PurchaseButton({
  productCode,
  initialPromotionCode = "",
  offerLabel,
  livePaymentGate,
  ctaLabel = "立即开通",
  featured = false,
  disabledReason,
}: {
  productCode: ProductCode;
  initialPromotionCode?: string;
  offerLabel?: string;
  livePaymentGate: LivePaymentGate;
  ctaLabel?: string;
  featured?: boolean;
  disabledReason?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [liveLoading, setLiveLoading] = useState<LiveChannel | null>(null);
  const [promotionCode, setPromotionCode] = useState(initialPromotionCode);
  const [promotionMessage, setPromotionMessage] = useState(offerLabel ?? "");
  const [promotionQuote, setPromotionQuote] = useState<Extract<PromotionQuote, { ok: true }> | null>(null);
  const [promotionOpen, setPromotionOpen] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState("");

  useEffect(() => {
    if (!promotionOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPromotionOpen(false);
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [promotionOpen]);

  async function validatePromotion() {
    const code = promotionCode.trim();

    if (!code) {
      setPromotionQuote(null);
      setPromotionMessage("请输入优惠码。");
      return;
    }

    setPromotionMessage("正在核验优惠...");

    try {
      const response = await fetch("/api/promotions/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productCode, promotionCode: code }),
      });
      const data = (await response.json()) as PromotionQuote;

      if (!response.ok || !data.ok) {
        setPromotionQuote(null);
        setPromotionMessage(data.message ?? "这个优惠码暂不可用。");
        return;
      }

      setPromotionQuote(data);
      setPromotionMessage(`${data.message}，应付 ${data.priceLabel}`);
    } catch {
      setPromotionQuote(null);
      setPromotionMessage("暂时无法核验，请稍后再试。");
    }
  }

  async function createOrder() {
    setLoading(true);
    setCheckoutMessage("");

    try {
      const response = await fetch("/api/payments/mock/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productCode,
          promotionCode: promotionCode.trim() || undefined,
        }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        message?: string;
        checkoutUrl?: string;
      };

      if (!response.ok || !data.ok || !data.checkoutUrl) {
        setCheckoutMessage(data.message ?? "暂时无法创建订单，请稍后再试。");
        return;
      }

      window.location.href = data.checkoutUrl;
    } catch {
      setCheckoutMessage("网络连接异常，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }

  async function createLiveOrder(channel: LiveChannel) {
    if (!livePaymentGate.allowed) {
      return;
    }

    setLiveLoading(channel);
    setCheckoutMessage("");

    try {
      const response = await fetch("/api/payments/live/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productCode,
          channel,
          promotionCode: promotionCode.trim() || undefined,
        }),
      });
      const data = (await response.json()) as { ok: boolean; message?: string };

      if (!response.ok || !data.ok) {
        setCheckoutMessage(data.message ?? "支付通道暂不可用，请稍后再试。");
        return;
      }

      setCheckoutMessage("订单已创建，请按支付页面提示继续。");
    } catch {
      setCheckoutMessage("网络连接异常，请稍后再试。");
    } finally {
      setLiveLoading(null);
    }
  }

  const primaryClass = featured
    ? "bg-[#c9a35f] text-[#17130d] shadow-[0_12px_30px_rgba(201,163,95,0.2)] hover:bg-[#efd9a6]"
    : "border border-[#c9a35f]/50 bg-[#c9a35f]/10 text-[#efd9a6] hover:border-[#c9a35f]/75 hover:bg-[#c9a35f]/16";

  if (disabledReason) {
    return (
      <div className="mt-6">
        <button
          type="button"
          disabled
          className="inline-flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full border border-[#34342e] bg-[#181814] px-5 text-sm font-semibold text-[#777168]"
        >
          {ctaLabel}
        </button>
        <p className="mt-3 text-center text-xs leading-5 text-[#8f887b]">
          {disabledReason}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {livePaymentGate.allowed ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <button
            type="button"
            onClick={() => void createLiveOrder("alipay")}
            disabled={liveLoading !== null}
            className={`inline-flex h-12 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55 ${primaryClass}`}
          >
            {liveLoading === "alipay" ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <CreditCard size={16} aria-hidden="true" />}
            支付宝开通
          </button>
          <button
            type="button"
            onClick={() => void createLiveOrder("wechat_pay")}
            disabled={liveLoading !== null}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[#3b6258] bg-[#2c7b78]/10 px-4 text-sm font-semibold text-[#a5d2cc] transition hover:border-[#79b8b1]/65 hover:bg-[#2c7b78]/16 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {liveLoading === "wechat_pay" ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <WalletCards size={16} aria-hidden="true" />}
            微信支付
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void createOrder()}
          disabled={loading}
          className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55 ${primaryClass}`}
        >
          {loading ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
          {loading ? "正在准备订单..." : ctaLabel}
        </button>
      )}

      <button
        type="button"
        onClick={() => setPromotionOpen(true)}
        className="mx-auto mt-3 flex min-h-9 items-center justify-center gap-2 px-3 text-xs text-[#777168] transition hover:text-[#aaa294]"
      >
        <BadgePercent size={13} aria-hidden="true" />
        {promotionQuote ? "已应用优惠码" : "有优惠码？"}
      </button>

      {promotionQuote ? (
        <p className="mt-1 text-center text-xs text-[#79b8b1]">
          <span className="inline-flex items-center gap-1.5">
            <Check size={12} aria-hidden="true" />
            {promotionQuote.discountLabel}，应付 {promotionQuote.priceLabel}
          </span>
        </p>
      ) : null}

      {promotionOpen && typeof document !== "undefined" ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`promotion-title-${productCode}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setPromotionOpen(false);
            }
          }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-[420px] rounded-[26px] border border-[#3a392f] bg-[#11120f] p-5 shadow-[0_32px_120px_rgba(0,0,0,0.55)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs tracking-[0.22em] text-[#c9a35f]">PROMO CODE</p>
                <h3 id={`promotion-title-${productCode}`} className="mt-2 font-ritual text-2xl text-[#f4efe5]">
                  输入优惠码
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#8f887b]">
                  校验成功后，下单时会自动带上这个优惠码。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPromotionOpen(false)}
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-[#8f887b] transition hover:bg-[#1c1d19] hover:text-[#f4efe5]"
                aria-label="关闭优惠码弹窗"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
              <label className="sr-only" htmlFor={`promotion-${productCode}`}>优惠码</label>
              <input
                id={`promotion-${productCode}`}
                value={promotionCode}
                onChange={(event) => {
                  setPromotionCode(event.target.value);
                  setPromotionQuote(null);
                  setPromotionMessage("");
                }}
                placeholder="输入优惠码"
                autoFocus
                className="h-12 min-w-0 rounded-2xl border border-[#34352e] bg-[#080907] px-4 text-sm text-[#f4efe5] outline-none placeholder:text-[#5f5b53] focus:border-[#c9a35f]/60"
              />
              <button
                type="button"
                onClick={() => void validatePromotion()}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#c9a35f]/45 px-5 text-sm font-semibold text-[#efd9a6] transition hover:border-[#c9a35f]/70"
              >
                应用
              </button>
            </div>

            <p className={`mt-3 min-h-6 text-sm ${promotionQuote ? "text-[#79b8b1]" : "text-[#8f887b]"}`}>
              {promotionQuote ? (
                <span className="inline-flex items-center gap-1.5"><Check size={13} aria-hidden="true" />{promotionMessage}</span>
              ) : promotionMessage || "输入后点击应用，系统会先校验优惠是否可用。"}
            </p>

            <button
              type="button"
              onClick={() => setPromotionOpen(false)}
              className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full bg-[#c9a35f] px-5 text-sm font-semibold text-[#17130d] transition hover:bg-[#efd9a6]"
            >
              完成
            </button>
          </div>
        </div>,
        document.body,
      ) : null}

      <p className="min-h-5 text-center text-xs leading-5 text-[#b56b59]" aria-live="polite">{checkoutMessage}</p>
    </div>
  );
}
