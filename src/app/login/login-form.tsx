"use client";

import Link from "next/link";
import { ArrowRight, Gift, ShieldCheck } from "lucide-react";
import { sanitizeReturnTo } from "@/lib/return-to";

type PurchaseIntent = {
  name: string;
  priceLabel: string;
  durationDays?: number;
  starGrant?: number;
  reportQuota?: number;
  palmQuota?: number;
};

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.36l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.13H3.06v2.62A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.4 13.93A6 6 0 0 1 6.09 12c0-.67.12-1.32.31-1.93V7.45H3.06A10 10 0 0 0 2 12c0 1.61.39 3.14 1.06 4.55l3.34-2.62Z" />
      <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.94 5.45l3.34 2.62c.79-2.37 3-4.13 5.6-4.13Z" />
    </svg>
  );
}

function returnToLabel(returnTo: string, purchaseIntent?: PurchaseIntent) {
  if (purchaseIntent) {
    return `使用 Google 继续购买${purchaseIntent.name}`;
  }

  if (returnTo.startsWith("/pricing")) {
    return "使用 Google 回到价格页";
  }

  if (returnTo.startsWith("/reports/deep")) {
    return "使用 Google 继续购买报告";
  }

  if (returnTo.startsWith("/chat")) {
    return "使用 Google 继续问 AI";
  }

  if (returnTo.startsWith("/onboarding")) {
    return "使用 Google 进入 Chat";
  }

  if (returnTo.startsWith("/admin")) {
    return "使用 Google 进入平台后台";
  }

  return "使用 Google 进入 Chat";
}

function initialMessage(returnTo: string, purchaseIntent?: PurchaseIntent) {
  if (returnTo.startsWith("/admin")) {
    return "使用已授权的 Google 邮箱登录。";
  }

  if (returnTo.startsWith("/onboarding")) {
    return "使用 Google 邮箱确认账号后，直接进入 Chat 开始问事。";
  }

  return purchaseIntent
    ? `使用 Google 邮箱登录后，继续购买${purchaseIntent.name}。`
    : "使用 Google 邮箱登录后，直接进入 Chat 开始问事。";
}

function googleErrorMessage(error?: string) {
  if (error === "callback_failed") {
    return "Google 登录未完成，请重试。";
  }

  if (error === "not_configured") {
    return "Google 登录暂未配置，请先在环境变量中补齐 OAuth Client ID 和 Secret。";
  }

  if (error === "database_unavailable") {
    return "生产数据库暂不可用，暂时无法完成登录。";
  }

  return undefined;
}

function inviteStatusMessage(inviteActive?: boolean, inviteError?: string) {
  if (inviteError === "invalid") {
    return "邀请链接无效或已过期，可以继续使用 Google 邮箱登录。";
  }

  if (inviteActive) {
    return "好友邀请礼包已锁定，完成 Google 登录后自动到账。";
  }

  return undefined;
}

export function LoginForm({
  initialReturnTo = "/chat",
  purchaseIntent,
  googleEnabled = false,
  googleError,
  inviteActive = false,
  inviteError,
}: {
  initialReturnTo?: string;
  purchaseIntent?: PurchaseIntent;
  googleEnabled?: boolean;
  googleError?: string;
  inviteActive?: boolean;
  inviteError?: string;
}) {
  const returnTo = sanitizeReturnTo(initialReturnTo);
  const message =
    googleErrorMessage(googleError) ??
    inviteStatusMessage(inviteActive, inviteError) ??
    initialMessage(returnTo, purchaseIntent);
  const googleHref = `/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div className="rounded-lg border border-[#3a3023] bg-[#12100d] p-5 shadow-2xl shadow-black/30">
      <div className="flex items-center gap-3 border-b border-[#2f261a] pb-5">
        <span className="flex size-11 items-center justify-center rounded-lg border border-[#c8a15a]/50 bg-[#c8a15a]/10 text-[#f0d49a]">
          <GoogleLogo />
        </span>
        <div>
          <p className="text-sm text-[#b9ad99]">Google 邮箱登录</p>
          <h1 className="font-ritual text-3xl text-[#fff7e8]">进入玄机 AI</h1>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {googleEnabled ? (
          <a
            href={googleHref}
            className="group inline-flex h-12 w-full items-center justify-center gap-3 rounded-md border border-[#4b4031] bg-[#181611] px-5 font-semibold text-[#f5efe2] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-[#c8a15a]/70 hover:bg-[#201c15] hover:text-white"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-white shadow-sm transition group-hover:scale-105">
              <GoogleLogo />
            </span>
            <span>{returnToLabel(returnTo, purchaseIntent)}</span>
            <ArrowRight size={17} className="transition group-hover:translate-x-0.5" aria-hidden="true" />
          </a>
        ) : (
          <div className="rounded-md border border-[#5d2b22] bg-[#160c09] p-4 text-sm leading-6 text-[#d8cab2]">
            Google 登录尚未配置。上线前请设置 AUTH_GOOGLE_ENABLED、GOOGLE_CLIENT_ID 和
            GOOGLE_CLIENT_SECRET。
          </div>
        )}
        {purchaseIntent ? (
          <div className="rounded-md border border-[#c8a15a]/45 bg-[#c8a15a]/10 p-4">
            <p className="text-sm font-semibold text-[#f0d49a]">
              已保留套餐：{purchaseIntent.name}
            </p>
            <div className="mt-3 grid gap-2 text-sm text-[#d8cab2] sm:grid-cols-2">
              <p className="rounded-md bg-[#080705] px-3 py-2">
                {purchaseIntent.priceLabel} / {purchaseIntent.durationDays} 天
              </p>
              <p className="rounded-md bg-[#080705] px-3 py-2">
                {purchaseIntent.starGrant} 星力
              </p>
              <p className="rounded-md bg-[#080705] px-3 py-2">
                {purchaseIntent.reportQuota} 份报告额度
              </p>
              <p className="rounded-md bg-[#080705] px-3 py-2">
                {purchaseIntent.palmQuota} 次手相额度
              </p>
            </div>
          </div>
        ) : null}
        {inviteActive ? (
          <div className="rounded-md border border-[#3c8b72]/45 bg-[#3c8b72]/10 p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[#3c8b72]/15 text-[#8ad5bd]">
                <Gift size={18} aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-[#8ad5bd]">好友邀请礼包</p>
                <p className="mt-2 text-sm leading-6 text-[#d8cab2]">
                  新账号完成 Google 登录后自动获得 30 星力和 1 份深度报告额度。
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <p className="min-h-6 text-sm text-[#b9ad99]">{message}</p>

        <p className="text-xs leading-6 text-[#9f927f]">
          登录即表示你已阅读并同意
          <Link href="/legal/terms" className="mx-1 text-[#f0d49a] hover:text-[#fff7e8]">
            用户协议
          </Link>
          和
          <Link href="/legal/privacy" className="mx-1 text-[#f0d49a] hover:text-[#fff7e8]">
            隐私政策
          </Link>
          。
        </p>
      </div>

      <div className="mt-6 flex gap-3 rounded-md border border-[#2f261a] bg-[#0b0906] p-3 text-sm leading-6 text-[#b9ad99]">
        <ShieldCheck className="mt-0.5 shrink-0 text-[#3c8b72]" size={18} />
        Google 登录仅用于确认账号邮箱。我们只会在你授权的范围内保存账号与命理档案信息。
      </div>
    </div>
  );
}
