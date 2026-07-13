import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BadgeCheck, CreditCard, LockKeyhole, ShieldCheck } from "lucide-react";
import { XuanjiMark } from "@/app/_components/xuanji-mark";
import { isDeepReportProductCode } from "@/lib/deep-report";
import { getOrderDisplay, getMockOrder } from "@/lib/mock-payment-store";
import { createLoginHref } from "@/lib/return-to";
import { getSession } from "@/lib/session";
import { brand } from "@/lib/site";
import { MockPayButton } from "./pay-button";

function statusLabel(status: string) {
  if (status === "PAID") return "已完成";
  if (status === "PENDING") return "待确认";
  if (status === "REFUNDED") return "已退款";
  if (status === "CLOSED") return "已关闭";
  return "处理中";
}

export default async function MockCheckoutPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const session = await getSession();

  if (!session) {
    redirect(createLoginHref(`/checkout/mock/${encodeURIComponent(orderId)}`));
  }

  const order = await getMockOrder(orderId);

  if (!order || order.userId !== session.userId) {
    notFound();
  }

  const displayOrder = getOrderDisplay(order);
  const isDeepReportOrder = isDeepReportProductCode(displayOrder.productCode);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#080907] px-5 pb-14 text-[#f4efe5] sm:px-8">
      <div className="absolute inset-0 xuanji-stars opacity-25" />
      <div className="absolute left-1/2 top-[-30%] size-[720px] -translate-x-1/2 rounded-full bg-[#c9a35f]/7 blur-[150px]" />

      <header className="relative mx-auto flex h-[72px] max-w-5xl items-center justify-between border-b border-[#24251f]">
        <Link href="/" className="flex items-center gap-3" aria-label="返回玄机 AI 首页">
          <XuanjiMark />
          <span>
            <span className="block font-ritual text-lg tracking-[0.08em]">{brand.cn}</span>
            <span className="block text-[9px] tracking-[0.22em] text-[#777168]">SECURE CHECKOUT</span>
          </span>
        </Link>
        <Link href="/pricing" className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm text-[#8f887b] transition hover:bg-[#11120f] hover:text-[#efd9a6]">
          <ArrowLeft size={15} aria-hidden="true" />
          返回方案
        </Link>
      </header>

      <section className="relative mx-auto grid max-w-5xl gap-10 py-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:py-20">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#30312b] bg-[#11120f]/75 px-3 py-1.5 text-xs text-[#aaa294]">
            <ShieldCheck size={14} className="text-[#79b8b1]" aria-hidden="true" />
            权益与金额已为你保留
          </div>
          <h1 className="mt-6 font-ritual text-5xl leading-tight tracking-[-0.04em] sm:text-6xl">
            确认你的方案
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-8 text-[#aaa294] sm:text-base">
            核对商品与金额后完成开通。权益到账后，可在个人中心查看星力、报告和手相额度。
          </p>
          <div className="mt-7 space-y-3 text-xs text-[#777168]">
            <p className="flex items-center gap-2"><BadgeCheck size={14} className="text-[#79b8b1]" />开通结果会自动同步到个人中心</p>
            <p className="flex items-center gap-2"><LockKeyhole size={14} className="text-[#79b8b1]" />订单仅与你当前登录的账号关联</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-[30px] border border-[#3a392f] bg-[#11120f] shadow-[0_35px_120px_rgba(0,0,0,0.42)]">
          <div className="flex items-center gap-3 border-b border-[#292a24] px-6 py-5">
            <span className="flex size-11 items-center justify-center rounded-full border border-[#c9a35f]/30 bg-[#c9a35f]/8 text-[#c9a35f]">
              <CreditCard size={20} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs text-[#777168]">订单确认</p>
              <p className="mt-1 text-sm text-[#c8c0b2]">编号 · {displayOrder.id.slice(-10)}</p>
            </div>
          </div>

          <div className="space-y-3 p-6">
            <div className="flex items-center justify-between gap-5 rounded-2xl border border-[#292a24] bg-[#0b0c0a] px-4 py-4">
              <span className="text-sm text-[#777168]">商品</span>
              <span className="text-right font-medium text-[#ded6c8]">{displayOrder.productName}</span>
            </div>
            <div className="flex items-center justify-between gap-5 rounded-2xl border border-[#292a24] bg-[#0b0c0a] px-4 py-4">
              <span className="text-sm text-[#777168]">应付金额</span>
              <span className="text-2xl font-semibold text-[#efd9a6]">{displayOrder.priceLabel}</span>
            </div>
            {displayOrder.promotionLabel ? (
              <div className="flex items-center justify-between gap-5 rounded-2xl border border-[#2c7b78]/25 bg-[#2c7b78]/7 px-4 py-3">
                <span className="text-sm text-[#79b8b1]">{displayOrder.promotionLabel}</span>
                <span className="font-medium text-[#a5d2cc]">{displayOrder.discountLabel}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-5 px-1 py-2 text-xs">
              <span className="text-[#68645c]">订单状态</span>
              <span className="rounded-full border border-[#34352e] px-3 py-1 text-[#aaa294]">{statusLabel(displayOrder.status)}</span>
            </div>

            <div className="pt-2">
              {displayOrder.status === "PAID" ? (
                <Link
                  href={isDeepReportOrder ? `/reports/deep?orderId=${displayOrder.id}` : "/member"}
                  className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[#c9a35f] px-5 font-semibold text-[#17130d] transition hover:bg-[#efd9a6]"
                >
                  {isDeepReportOrder ? "开始生成深度报告" : "查看已到账权益"}
                </Link>
              ) : (
                <MockPayButton orderId={displayOrder.id} />
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
