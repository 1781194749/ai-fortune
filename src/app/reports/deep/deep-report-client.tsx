"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  BadgePercent,
  Clock3,
  CreditCard,
  Loader2,
  ScrollText,
  Sparkles,
  XCircle,
} from "lucide-react";

type DeepProduct = {
  code: string;
  name: string;
  priceLabel: string;
  description: string;
};

type DeepOrder = {
  id: string;
  productCode: string;
  productName: string;
  provider: string;
  priceLabel: string;
  discountLabel?: string;
  promotionLabel?: string;
  status: string;
  createdAt: string;
};

type DeepReport = {
  id: string;
  orderId?: string;
  title: string;
  summary: string;
  shareSlug?: string;
  status: string;
};

type EntitlementBalance = {
  kind: string;
  label: string;
  granted: number;
  used: number;
  remaining: number;
  sourceOrders: number;
};

type MissingRequirement = {
  code: string;
  label: string;
  message: string;
  href: string;
};

type ApiResult =
  | {
      ok: true;
      order?: DeepOrder;
      checkoutUrl?: string;
      report?: DeepReport;
      reused?: boolean;
      queued?: boolean;
      entitlement?: EntitlementBalance;
    }
  | {
      ok: false;
      message?: string;
      entitlement?: EntitlementBalance;
      requirements?: MissingRequirement[];
      nextAction?: MissingRequirement;
    };

type ReportApiResult =
  | {
      ok: true;
      report: DeepReport;
    }
  | { ok: false; message?: string };

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

function statusLabel(status: string) {
  if (status === "PAID") {
    return "已支付";
  }

  if (status === "PENDING") {
    return "待支付";
  }

  if (status === "CLOSED") {
    return "已关闭";
  }

  if (status === "REFUNDED") {
    return "已退款";
  }

  if (status === "FAILED") {
    return "支付失败";
  }

  return status;
}

function getNextAction(data: ApiResult) {
  return data.ok ? null : data.nextAction ?? data.requirements?.[0] ?? null;
}

function formatOrderTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "已创建";
  }

  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function reportStatusMeta(status: string) {
  if (status === "GENERATING") {
    return {
      label: "生成中",
      className: "text-[#f0d49a]",
      icon: Clock3,
    };
  }

  if (status === "FAILED") {
    return {
      label: "生成失败",
      className: "text-[#e08b74]",
      icon: XCircle,
    };
  }

  return {
    label: "报告已完成",
    className: "text-[#8ad5bd]",
    icon: BadgeCheck,
  };
}

export function DeepReportClient({
  products,
  initialOrders,
  initialReports,
  initialReportQuota,
  highlightedOrderId,
}: {
  products: DeepProduct[];
  initialOrders: DeepOrder[];
  initialReports: DeepReport[];
  initialReportQuota: EntitlementBalance;
  highlightedOrderId?: string;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [reports, setReports] = useState(initialReports);
  const [reportQuota, setReportQuota] = useState(initialReportQuota);
  const [loadingProduct, setLoadingProduct] = useState<string | null>(null);
  const [loadingQuotaProduct, setLoadingQuotaProduct] = useState<string | null>(null);
  const [generatingOrder, setGeneratingOrder] = useState<string | null>(null);
  const [retryingReportId, setRetryingReportId] = useState<string | null>(null);
  const [promotionCodes, setPromotionCodes] = useState<Record<string, string>>({});
  const [promotionMessages, setPromotionMessages] = useState<Record<string, string>>({});
  const [promotionQuotes, setPromotionQuotes] = useState<
    Record<string, Extract<PromotionQuote, { ok: true }>>
  >({});
  const [nextAction, setNextAction] = useState<MissingRequirement | null>(null);
  const [message, setMessage] = useState(
    highlightedOrderId ? "支付完成后可在下方生成深度报告。" : "选择一种报告，确认后即可开始。",
  );
  const reportsByOrder = useMemo(
    () =>
      new Map(
        reports.flatMap((report) =>
          report.orderId ? ([[report.orderId, report]] as const) : [],
        ),
      ),
    [reports],
  );
  const memberQuotaReports = useMemo(
    () => reports.filter((report) => !report.orderId),
    [reports],
  );
  const generatingReportIds = useMemo(
    () =>
      reports
        .filter((report) => report.status === "GENERATING")
        .map((report) => report.id)
        .join("|"),
    [reports],
  );

  useEffect(() => {
    if (!generatingReportIds) {
      return;
    }

    let cancelled = false;
    const ids = generatingReportIds.split("|");

    async function pollReports() {
      const updates = await Promise.all(
        ids.map(async (reportId) => {
          const response = await fetch(`/api/reports/${reportId}`);

          if (!response.ok) {
            return null;
          }

          const data = (await response.json()) as ReportApiResult;
          return data.ok ? data.report : null;
        }),
      );

      if (cancelled) {
        return;
      }

      const updatedReports = new Map(
        updates.flatMap((report) => (report ? ([[report.id, report]] as const) : [])),
      );

      if (updatedReports.size === 0) {
        return;
      }

      setReports((current) =>
        current.map((report) => updatedReports.get(report.id) ?? report),
      );

      if (updates.some((report) => report?.status === "COMPLETED")) {
        setMessage("深度报告已生成，可以查看。");
      }

      if (updates.some((report) => report?.status === "FAILED")) {
        setMessage("深度报告生成失败，可以重新发起生成。");
      }
    }

    void pollReports();
    const timer = window.setInterval(() => {
      void pollReports();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [generatingReportIds]);

  async function validatePromotion(productCode: string) {
    const code = promotionCodes[productCode]?.trim() ?? "";

    if (!code) {
      setPromotionMessages((current) => ({
        ...current,
        [productCode]: "请输入优惠码。",
      }));
      setPromotionQuotes((current) => {
        const next = { ...current };
        delete next[productCode];
        return next;
      });
      return;
    }

    setPromotionMessages((current) => ({
      ...current,
      [productCode]: "正在试算优惠...",
    }));

    const response = await fetch("/api/promotions/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productCode, promotionCode: code }),
    });
    const data = (await response.json()) as PromotionQuote;

    if (!response.ok || !data.ok) {
      setPromotionQuotes((current) => {
        const next = { ...current };
        delete next[productCode];
        return next;
      });
      setPromotionMessages((current) => ({
        ...current,
        [productCode]: data.message ?? "优惠码不可用。",
      }));
      return;
    }

    setPromotionQuotes((current) => ({
      ...current,
      [productCode]: data,
    }));
    setPromotionMessages((current) => ({
      ...current,
      [productCode]: `${data.message} 应付 ${data.priceLabel}`,
    }));
  }

  async function createOrder(productCode: string) {
    setLoadingProduct(productCode);
    setNextAction(null);
    setMessage("正在准备报告订单...");

    const response = await fetch("/api/reports/deep/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productCode,
        promotionCode: promotionCodes[productCode]?.trim() || undefined,
      }),
    });
    const data = (await response.json()) as ApiResult;

    setLoadingProduct(null);

    if (!response.ok || data.ok === false || !data.checkoutUrl) {
      setMessage(data.ok === false ? data.message ?? "订单创建失败。" : "订单创建失败。");
      setNextAction(getNextAction(data));
      return;
    }

    window.location.assign(data.checkoutUrl);
  }

  async function createMemberQuotaReport(productCode: string) {
    if (reportQuota.remaining <= 0) {
      setMessage("深度报告额度不足，请购买会员或单次报告。");
      return;
    }

    setLoadingQuotaProduct(productCode);
    setNextAction(null);
    setMessage("正在使用会员报告额度创建生成任务...");

    const response = await fetch("/api/reports/deep/member-quota", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productCode }),
    });
    const data = (await response.json()) as ApiResult;

    setLoadingQuotaProduct(null);

    if (!response.ok || data.ok === false) {
      setMessage(data.ok === false ? data.message ?? "会员报告额度生成失败。" : "会员报告额度生成失败。");
      setNextAction(getNextAction(data));

      if (data.entitlement) {
        setReportQuota(data.entitlement);
      }

      return;
    }

    if (!data.report) {
      setMessage("会员报告额度生成失败。");
      return;
    }

    const nextReport = data.report;

    setReports((current) =>
      current.some((report) => report.id === nextReport.id)
        ? current.map((report) => (report.id === nextReport.id ? nextReport : report))
        : [nextReport, ...current],
    );

    if (data.entitlement) {
      setReportQuota(data.entitlement);
    }

    setMessage("已使用 1 份会员报告额度，深度报告已进入生成队列。");
  }

  async function retryReport(reportId: string) {
    setRetryingReportId(reportId);
    setNextAction(null);
    setMessage("正在重新派发深度报告生成任务...");

    const response = await fetch(`/api/reports/${reportId}/retry`, {
      method: "POST",
    });
    const data = (await response.json()) as ApiResult & { message?: string };

    setRetryingReportId(null);

    if (!response.ok || data.ok === false) {
      setMessage(data.ok === false ? data.message ?? "报告重试失败。" : "报告重试失败。");
      setNextAction(getNextAction(data));

      if (data.entitlement) {
        setReportQuota(data.entitlement);
      }

      return;
    }

    if (!data.report) {
      setMessage("报告重试失败。");
      return;
    }

    const nextReport = data.report;

    setReports((current) =>
      current.some((report) => report.id === nextReport.id)
        ? current.map((report) => (report.id === nextReport.id ? nextReport : report))
        : [nextReport, ...current],
    );

    if (data.entitlement) {
      setReportQuota(data.entitlement);
    }

    setMessage(data.message ?? "深度报告已重新进入生成队列。");
  }

  async function generateReport(orderId: string) {
    setGeneratingOrder(orderId);
    setNextAction(null);
    setMessage("正在创建深度报告生成任务...");

    const response = await fetch(`/api/reports/deep/orders/${orderId}/generate`, {
      method: "POST",
    });
    const data = (await response.json()) as ApiResult;

    setGeneratingOrder(null);

    if (!response.ok || data.ok === false) {
      setMessage(data.ok === false ? data.message ?? "报告生成失败。" : "报告生成失败。");
      setNextAction(getNextAction(data));
      return;
    }

    const nextOrder = data.order;
    const nextReport = data.report;

    if (!nextReport) {
      setMessage("报告生成失败。");
      return;
    }

    if (nextOrder) {
      setOrders((current) =>
        current.some((order) => order.id === nextOrder.id)
          ? current.map((order) => (order.id === nextOrder.id ? nextOrder : order))
          : [nextOrder, ...current],
      );
    }

    setReports((current) =>
      current.some((report) => report.id === nextReport.id)
        ? current.map((report) => (report.id === nextReport.id ? nextReport : report))
        : [nextReport, ...current],
    );
    setMessage(
      data.queued
        ? "深度报告已进入生成队列。"
        : data.reused
          ? "该订单已生成过报告，已为你读取。"
          : "深度报告已生成。",
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <section className="rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
        <div className="flex items-center justify-between gap-4 border-b border-[#2f261a] pb-5">
          <div>
            <p className="text-sm font-semibold text-[#c8a15a]">单次付费报告</p>
            <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">选择报告类型</h2>
          </div>
          <CreditCard className="text-[#c8a15a]" size={28} aria-hidden="true" />
        </div>

        <div className="mt-5 rounded-lg border border-[#6a5431] bg-[#1a140d] p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-semibold text-[#f0d49a]">会员报告额度</p>
              <p className="mt-1 text-sm leading-6 text-[#d8cab2]">
                剩余 {reportQuota.remaining} 份，已用 {reportQuota.used}/{reportQuota.granted}
              </p>
            </div>
            <span className="inline-flex h-9 items-center justify-center rounded-full border border-[#c8a15a]/50 px-3 text-sm font-semibold text-[#fff7e8]">
              {reportQuota.remaining > 0 ? "可直接使用" : "购买后可增加"}
            </span>
          </div>
          {reportQuota.remaining <= 0 ? (
            <Link
              href="/pricing#plans"
              className="mt-3 inline-flex h-9 items-center justify-center rounded-md bg-[#c8a15a] px-3 text-sm font-semibold text-[#130f09] transition hover:bg-[#f0d49a]"
            >
              查看会员套餐
            </Link>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4">
          {products.map((product) => (
            <article
              key={product.code}
              className="rounded-lg border border-[#2f261a] bg-[#080705] p-4"
            >
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <h3 className="font-ritual text-2xl text-[#fff7e8]">{product.name}</h3>
                  <p className="mt-2 text-sm leading-7 text-[#b9ad99]">
                    {product.description}
                  </p>
                </div>
                <p className="text-2xl font-semibold text-[#f0d49a]">
                  {promotionQuotes[product.code]?.priceLabel ?? product.priceLabel}
                </p>
              </div>
              <div className="mt-4 grid gap-2">
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <label className="sr-only" htmlFor={`deep-promotion-${product.code}`}>
                    优惠码
                  </label>
                  <input
                    id={`deep-promotion-${product.code}`}
                    value={promotionCodes[product.code] ?? ""}
                    onChange={(event) => {
                      setPromotionCodes((current) => ({
                        ...current,
                        [product.code]: event.target.value,
                      }));
                      setPromotionMessages((current) => ({
                        ...current,
                        [product.code]: "",
                      }));
                      setPromotionQuotes((current) => {
                        const next = { ...current };
                        delete next[product.code];
                        return next;
                      });
                    }}
                    placeholder="优惠码"
                    className="h-10 min-w-0 rounded-md border border-[#3a3023] bg-[#12100d] px-3 text-sm text-[#fff7e8] outline-none transition placeholder:text-[#6f6455] focus:border-[#c8a15a]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void validatePromotion(product.code);
                    }}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#6a5431] px-3 text-xs font-semibold text-[#fff7e8] transition hover:border-[#c8a15a]"
                  >
                    <BadgePercent size={14} aria-hidden="true" />
                    应用
                  </button>
                </div>
                {promotionCodes[product.code] || promotionQuotes[product.code] ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPromotionCodes((current) => ({ ...current, [product.code]: "" }));
                      setPromotionQuotes((current) => {
                        const next = { ...current };
                        delete next[product.code];
                        return next;
                      });
                      setPromotionMessages((current) => ({ ...current, [product.code]: "" }));
                    }}
                    className="text-left text-xs text-[#d98572] underline underline-offset-4"
                  >
                    清除优惠码
                  </button>
                ) : null}
                <p className="min-h-5 text-xs text-[#b9ad99]">
                  {promotionQuotes[product.code]
                    ? `${promotionQuotes[product.code].originalPriceLabel} ${promotionQuotes[product.code].discountLabel}`
                    : promotionMessages[product.code]}
                </p>
              </div>
              <button
                type="button"
                onClick={() => createOrder(product.code)}
                disabled={loadingProduct !== null || loadingQuotaProduct !== null}
                className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#c8a15a] px-4 text-sm font-semibold text-[#130f09] transition hover:bg-[#f0d49a] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingProduct === product.code ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
                {loadingProduct === product.code ? "正在准备..." : "立即购买"}
              </button>
              <button
                type="button"
                onClick={() => createMemberQuotaReport(product.code)}
                disabled={
                  reportQuota.remaining <= 0 ||
                  loadingProduct !== null ||
                  loadingQuotaProduct !== null
                }
                className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-[#6a5431] bg-[#12100d] px-4 text-sm font-semibold text-[#fff7e8] transition hover:border-[#c8a15a] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingQuotaProduct === product.code ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <ScrollText size={16} />
                )}
                {loadingQuotaProduct === product.code ? "创建任务..." : "用会员额度生成"}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
        <div className="flex items-center justify-between gap-4 border-b border-[#2f261a] pb-5">
          <div>
            <p className="text-sm font-semibold text-[#c8a15a]">报告进度</p>
            <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">我的深度报告</h2>
          </div>
          <ScrollText className="text-[#c8a15a]" size={28} aria-hidden="true" />
        </div>

        <div className="mt-4 rounded-md border border-[#2f261a] bg-[#080705] p-3 text-sm text-[#b9ad99]" aria-live="polite">
          <p>{message}</p>
          {nextAction ? (
            <Link
              href={nextAction.href}
              className="mt-3 inline-flex h-9 items-center justify-center rounded-md bg-[#c8a15a] px-3 font-semibold text-[#130f09] transition hover:bg-[#f0d49a]"
            >
              {nextAction.label}
            </Link>
          ) : null}
        </div>

        <div className="mt-5 space-y-3">
          {memberQuotaReports.map((report) => (
            <article
              key={report.id}
              className="rounded-lg border border-[#6a5431] bg-[#1a140d] p-4"
            >
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <p className="font-semibold text-[#fff7e8]">{report.title}</p>
                  <p className="mt-1 text-xs text-[#b9ad99]">{reportStatusMeta(report.status).label}</p>
                </div>
                <span className="rounded-md border border-[#c8a15a]/50 px-2 py-1 text-xs text-[#f0d49a]">
                  会员额度
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#b9ad99]">{report.summary}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {report.status === "COMPLETED" ? (
                  <Link
                    href={`/reports/${report.id}`}
                    className="inline-flex h-9 items-center justify-center rounded-md bg-[#c8a15a] px-3 text-sm font-semibold text-[#130f09] transition hover:bg-[#f0d49a]"
                  >
                    查看报告
                  </Link>
                ) : report.status === "FAILED" ? (
                  <button
                    type="button"
                    onClick={() => {
                      void retryReport(report.id);
                    }}
                    disabled={retryingReportId !== null || loadingProduct !== null || loadingQuotaProduct !== null}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#c8a15a] px-3 text-sm font-semibold text-[#130f09] transition hover:bg-[#f0d49a] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {retryingReportId === report.id ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <ScrollText size={16} />
                    )}
                    {retryingReportId === report.id ? "重试中..." : "重新生成"}
                  </button>
                ) : (
                  <span className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#6a5431] px-3 text-sm text-[#d8cab2]">
                    <Clock3
                      className={report.status === "GENERATING" ? "animate-spin" : undefined}
                      size={16}
                      aria-hidden="true"
                    />
                    {reportStatusMeta(report.status).label}
                  </span>
                )}
              </div>
            </article>
          ))}
          {orders.length > 0 ? (
            orders.map((order) => {
              const report = reportsByOrder.get(order.id);
              const highlighted = highlightedOrderId === order.id;

              return (
                <article
                  key={order.id}
                  className={`rounded-lg border p-4 ${
                    highlighted
                      ? "border-[#c8a15a] bg-[#c8a15a]/10"
                      : "border-[#2f261a] bg-[#080705]"
                  }`}
                >
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <p className="font-semibold text-[#fff7e8]">{order.productName}</p>
                      <p className="mt-1 text-xs text-[#b9ad99]">{formatOrderTime(order.createdAt)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-md border border-[#3a3023] px-2 py-1 text-[#d8cab2]">
                        {statusLabel(order.status)}
                      </span>
                      <span className="rounded-md border border-[#3a3023] px-2 py-1 text-[#f0d49a]">
                        {order.priceLabel}
                      </span>
                    </div>
                  </div>
                  {order.promotionLabel ? (
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[#8ad5bd]">
                      <span>{order.promotionLabel}</span>
                      <span>{order.discountLabel}</span>
                    </div>
                  ) : null}

                  {report ? (
                    <div className="mt-4 rounded-md border border-[#2f261a] bg-[#12100d] p-3">
                      {(() => {
                        const meta = reportStatusMeta(report.status);
                        const StatusIcon = meta.icon;

                        return (
                          <div className={`flex items-center gap-2 text-sm ${meta.className}`}>
                            <StatusIcon
                              className={
                                report.status === "GENERATING" ? "animate-spin" : undefined
                              }
                              size={16}
                              aria-hidden="true"
                            />
                            {meta.label}
                          </div>
                        );
                      })()}
                      <p className="mt-2 text-sm leading-6 text-[#b9ad99]">
                        {report.summary}
                      </p>
                      {report.status === "GENERATING" ? (
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#2f261a]">
                          <div className="h-full w-2/3 animate-pulse rounded-full bg-[#c8a15a]" />
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {report.status === "COMPLETED" ? (
                          <>
                            <Link
                              href={`/reports/${report.id}`}
                              className="inline-flex h-9 items-center justify-center rounded-md bg-[#c8a15a] px-3 text-sm font-semibold text-[#130f09] transition hover:bg-[#f0d49a]"
                            >
                              查看报告
                            </Link>
                            {report.shareSlug ? (
                              <Link
                                href={`/share/${report.shareSlug}`}
                                className="inline-flex h-9 items-center justify-center rounded-md border border-[#6a5431] px-3 text-sm text-[#fff7e8] transition hover:border-[#c8a15a]"
                              >
                                分享页
                              </Link>
                            ) : null}
                          </>
                        ) : report.status === "FAILED" ? (
                          <button
                            type="button"
                            onClick={() => generateReport(order.id)}
                            disabled={generatingOrder !== null || retryingReportId !== null}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#c8a15a] px-3 text-sm font-semibold text-[#130f09] transition hover:bg-[#f0d49a] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {generatingOrder === order.id ? (
                              <Loader2 className="animate-spin" size={16} />
                            ) : (
                              <ScrollText size={16} />
                            )}
                            重新生成
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : order.status === "PAID" ? (
                    <button
                      type="button"
                      onClick={() => generateReport(order.id)}
                      disabled={generatingOrder !== null}
                      className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#c8a15a] px-4 text-sm font-semibold text-[#130f09] transition hover:bg-[#f0d49a] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {generatingOrder === order.id ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : (
                        <ScrollText size={16} />
                      )}
                      {generatingOrder === order.id ? "生成中..." : "生成深度报告"}
                    </button>
                  ) : order.status === "PENDING" && order.provider === "MOCK" ? (
                    <Link
                      href={`/checkout/mock/${order.id}`}
                      className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-md border border-[#6a5431] px-4 text-sm font-semibold text-[#fff7e8] transition hover:border-[#c8a15a]"
                    >
                      继续支付
                    </Link>
                  ) : order.status === "PENDING" ? (
                    <p className="mt-4 rounded-md border border-[#3a3023] bg-[#12100d] p-3 text-sm leading-6 text-[#b9ad99]">
                      请在原支付渠道完成付款；如已付款，请稍后刷新查看支付结果。
                    </p>
                  ) : (
                    <p className="mt-4 rounded-md border border-[#3a3023] bg-[#12100d] p-3 text-sm leading-6 text-[#8f887b]">
                      该订单{statusLabel(order.status)}，如仍需要此报告，请在左侧重新购买。
                    </p>
                  )}
                </article>
              );
            })
          ) : memberQuotaReports.length === 0 ? (
            <p className="rounded-md border border-[#2f261a] bg-[#080705] p-4 text-sm text-[#b9ad99]">
              暂无深度报告订单。
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
