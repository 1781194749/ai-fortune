import Link from "next/link";
import { Sparkles } from "lucide-react";
import { formatPrice } from "@/lib/commerce";
import { getRuntimeMembershipProducts } from "@/lib/product-config";
import { sanitizeReturnTo } from "@/lib/return-to";
import { brand } from "@/lib/site";
import { isGoogleAuthConfigured } from "@/lib/google-auth";
import { LoginForm } from "./login-form";

async function getPurchaseIntent(returnTo: string) {
  const parsed = new URL(returnTo, "https://xuanji.local");

  if (parsed.pathname !== "/pricing") {
    return undefined;
  }

  const intent = parsed.searchParams.get("intent");
  const membershipProducts = await getRuntimeMembershipProducts();
  const product = membershipProducts.find((item) => item.code === intent);

  if (!product) {
    return undefined;
  }

  return {
    name: product.name,
    priceLabel: formatPrice(product.priceCents, product.currency),
    durationDays: product.durationDays,
    starGrant: product.starGrant,
    reportQuota: product.reportQuota,
    palmQuota: product.palmQuota,
  };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    returnTo?: string | string[];
    googleError?: string | string[];
    invite?: string | string[];
    inviteError?: string | string[];
  }>;
}) {
  const {
    returnTo: rawReturnTo,
    googleError: rawGoogleError,
    invite: rawInvite,
    inviteError: rawInviteError,
  } = await searchParams;
  const returnTo = sanitizeReturnTo(Array.isArray(rawReturnTo) ? rawReturnTo[0] : rawReturnTo);
  const googleError = Array.isArray(rawGoogleError) ? rawGoogleError[0] : rawGoogleError;
  const invite = Array.isArray(rawInvite) ? rawInvite[0] : rawInvite;
  const inviteError = Array.isArray(rawInviteError) ? rawInviteError[0] : rawInviteError;
  const inviteActive = invite === "1";
  const purchaseIntent = await getPurchaseIntent(returnTo);
  const onboardingIntent = returnTo.startsWith("/onboarding");
  const adminIntent = returnTo.startsWith("/admin");

  return (
    <main className="min-h-screen bg-[#080705] px-5 py-8 text-[#f5efe2] sm:px-8">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg border border-[#c8a15a]/55 bg-[#c8a15a]/10 text-[#f0d49a]">
            <Sparkles size={20} aria-hidden="true" />
          </span>
          <span>
            <span className="block font-ritual text-xl">{brand.cn}</span>
            <span className="block text-xs text-[#b9ad99]">{brand.en}</span>
          </span>
        </Link>
        <Link href="/" className="text-sm text-[#d8cab2] hover:text-[#f0d49a]">
          返回首页
        </Link>
      </div>

      <section className="mx-auto grid max-w-5xl gap-8 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <p className="text-sm font-semibold text-[#c8a15a]">
            {adminIntent
              ? "管理员登录"
              : inviteActive
                ? "好友邀请"
              : purchaseIntent
                ? "购买前登录"
                : onboardingIntent
                  ? "起盘前登录"
                  : "账号与个人中心"}
          </p>
          <h2 className="mt-4 font-ritual text-5xl leading-tight text-[#fff7e8]">
            {adminIntent
              ? "登录平台后台"
              : purchaseIntent
              ? `登录后继续购买${purchaseIntent.name}`
              : onboardingIntent
                ? "先建立账号，再让玄机 AI 记住你"
                : "登录后继续你的推演"}
          </h2>
          <p className="mt-5 leading-8 text-[#b9ad99]">
            {adminIntent
              ? "平台后台与用户端共用账号体系。只有已授权管理员邮箱可以进入用户、订单、资产、报告和 AI 成本管理页面。"
              : inviteActive
              ? "你的邀请礼包已经锁定。完成邮箱验证或 Google 登录后，新账号会自动收到星力和深度报告额度。"
              : purchaseIntent
              ? "你的套餐选择会被保留，登录成功后将回到价格页确认权益并创建订单。"
              : onboardingIntent
                ? "验证邮箱后会进入轻量起盘流程。完成称呼、生辰、行业与关注方向后，就可以直接进入 Chat 问事。"
                : "使用邮箱验证码登录。你的命理档案、对话、报告和会员权益会与账号同步保存。"}
          </p>
        </div>
        <LoginForm
          initialReturnTo={returnTo}
          purchaseIntent={purchaseIntent}
          googleEnabled={isGoogleAuthConfigured()}
          googleError={googleError}
          inviteActive={inviteActive}
          inviteError={inviteError}
        />
      </section>
    </main>
  );
}
