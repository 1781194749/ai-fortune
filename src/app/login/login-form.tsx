"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Gift, Mail, ShieldCheck } from "lucide-react";
import { sanitizeReturnTo } from "@/lib/return-to";

type Step = "email" | "code";
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
    return `登录后继续购买${purchaseIntent.name}`;
  }

  if (returnTo.startsWith("/pricing")) {
    return "登录后回到价格页";
  }

  if (returnTo.startsWith("/reports/deep")) {
    return "登录后继续购买报告";
  }

  if (returnTo.startsWith("/chat")) {
    return "登录后继续问 AI";
  }

  if (returnTo.startsWith("/onboarding")) {
    return "登录并开始起盘";
  }

  if (returnTo.startsWith("/admin")) {
    return "登录并进入平台后台";
  }

  return "登录并进入个人中心";
}

function initialMessage(returnTo: string, purchaseIntent?: PurchaseIntent) {
  if (returnTo.startsWith("/admin")) {
    return "使用已授权的管理员邮箱登录。";
  }

  if (returnTo.startsWith("/onboarding")) {
    return "输入邮箱，验证后开始建立你的命理档案。";
  }

  return purchaseIntent
    ? `输入邮箱，登录后继续购买${purchaseIntent.name}。`
    : "输入邮箱，先进入开发期会员流程。";
}

function googleErrorMessage(error?: string) {
  if (error === "callback_failed") {
    return "Google 登录未完成，请重试或使用邮箱验证码。";
  }

  if (error === "not_configured") {
    return "Google 登录暂未配置，请使用邮箱验证码。";
  }

  return undefined;
}

function inviteStatusMessage(inviteActive?: boolean, inviteError?: string) {
  if (inviteError === "invalid") {
    return "邀请链接无效或已过期，可以继续使用邮箱验证码登录。";
  }

  if (inviteActive) {
    return "好友邀请礼包已锁定，完成新账号登录后自动到账。";
  }

  return undefined;
}

export function LoginForm({
  initialReturnTo = "/member",
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
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [message, setMessage] = useState(
    googleErrorMessage(googleError) ??
      inviteStatusMessage(inviteActive, inviteError) ??
      initialMessage(returnTo, purchaseIntent),
  );
  const [loading, setLoading] = useState(false);

  async function requestCode() {
    setLoading(true);
    setMessage("正在生成验证码...");

    const response = await fetch("/api/auth/email/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = (await response.json()) as {
      ok: boolean;
      message?: string;
      devCode?: string;
    };

    setLoading(false);

    if (!response.ok || !data.ok) {
      setMessage(data.message ?? "验证码生成失败。");
      return;
    }

    setStep("code");
    setDevCode(data.devCode ?? null);
    setMessage("验证码已生成。开发环境会直接展示验证码。");
  }

  async function verifyCode() {
    setLoading(true);
    setMessage("正在验证并创建会话...");

    const response = await fetch("/api/auth/email/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, returnTo }),
    });
    const data = (await response.json()) as {
      ok: boolean;
      message?: string;
      redirectTo?: string;
    };

    setLoading(false);

    if (!response.ok || !data.ok) {
      setMessage(data.message ?? "登录失败。");
      return;
    }

    window.location.assign(sanitizeReturnTo(data.redirectTo, returnTo));
  }

  return (
    <div className="rounded-lg border border-[#3a3023] bg-[#12100d] p-5 shadow-2xl shadow-black/30">
      <div className="flex items-center gap-3 border-b border-[#2f261a] pb-5">
        <span className="flex size-11 items-center justify-center rounded-lg border border-[#c8a15a]/50 bg-[#c8a15a]/10 text-[#f0d49a]">
          <Mail size={21} aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm text-[#b9ad99]">邮箱验证码登录</p>
          <h1 className="font-ritual text-3xl text-[#fff7e8]">进入玄机 AI</h1>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {googleEnabled ? (
          <>
            <a
              href={`/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`}
              className="group inline-flex h-12 w-full items-center justify-center gap-3 rounded-md border border-[#4b4031] bg-[#181611] px-5 font-semibold text-[#f5efe2] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-[#c8a15a]/70 hover:bg-[#201c15] hover:text-white"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-white shadow-sm transition group-hover:scale-105">
                <GoogleLogo />
              </span>
              <span>使用 Google 登录</span>
            </a>
            <div className="flex items-center gap-3 text-xs text-[#8f8371]">
              <span className="h-px flex-1 bg-[#2f261a]" />
              <span>或使用邮箱验证码</span>
              <span className="h-px flex-1 bg-[#2f261a]" />
            </div>
          </>
        ) : null}
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
                  新账号完成登录后自动获得 30 星力和 1 份深度报告额度。
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <label className="block">
          <span className="text-sm text-[#d8cab2]">邮箱</span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={loading || step === "code"}
            type="email"
            placeholder="you@example.com"
            className="mt-2 h-12 w-full rounded-md border border-[#3a3023] bg-[#080705] px-4 text-[#fff7e8] outline-none transition placeholder:text-[#6f6455] focus:border-[#c8a15a]"
          />
        </label>

        {step === "code" ? (
          <label className="block">
            <span className="text-sm text-[#d8cab2]">验证码</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={loading}
              inputMode="numeric"
              placeholder="6 位数字"
              className="mt-2 h-12 w-full rounded-md border border-[#3a3023] bg-[#080705] px-4 text-[#fff7e8] outline-none transition placeholder:text-[#6f6455] focus:border-[#c8a15a]"
            />
          </label>
        ) : null}

        {devCode ? (
          <div className="rounded-md border border-[#3c8b72]/40 bg-[#3c8b72]/10 p-3 text-sm text-[#d8cab2]">
            开发环境验证码：<span className="font-semibold text-[#f0d49a]">{devCode}</span>
            <span className="ml-2 text-[#9f927f]">也可输入 000000 快速登录</span>
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

        <button
          type="button"
          onClick={step === "email" ? requestCode : verifyCode}
          disabled={loading}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#c8a15a] px-5 font-semibold text-[#130f09] transition hover:bg-[#f0d49a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "处理中..." : step === "email" ? "获取验证码" : returnToLabel(returnTo, purchaseIntent)}
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-6 flex gap-3 rounded-md border border-[#2f261a] bg-[#0b0906] p-3 text-sm leading-6 text-[#b9ad99]">
        <ShieldCheck className="mt-0.5 shrink-0 text-[#3c8b72]" size={18} />
        邮箱验证码仅用于确认账号。我们只会在你授权的范围内保存账号与命理档案信息。
      </div>
    </div>
  );
}
