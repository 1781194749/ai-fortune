import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  HeartHandshake,
  LockKeyhole,
  MessageCircle,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Stars,
} from "lucide-react";
import { PurchaseButton } from "@/app/member/purchase-button";
import { XuanjiMark } from "@/app/_components/xuanji-mark";
import {
  freeStarterStarGrant,
  formatPrice,
  membershipTierByProduct,
  type Product,
  type ProductCode,
} from "@/lib/commerce";
import { compareMembershipTiers } from "@/lib/membership-lifecycle";
import { getRuntimeFeatures } from "@/lib/features";
import { getLivePaymentLaunchGate } from "@/lib/live-payment-launch-gate";
import {
  getRuntimeMembershipProducts,
  getRuntimeOneTimeProducts,
} from "@/lib/product-config";
import { createLoginHref } from "@/lib/return-to";
import { getSession } from "@/lib/session";
import { brand } from "@/lib/site";

const planMeta: Partial<Record<ProductCode, { eyebrow: string; promise: string; badge?: string }>> = {
  trial_7d: {
    eyebrow: "先完整体验一次",
    promise: "适合第一次认识玄机，从建档、提问到报告完整走一遍。",
  },
  monthly: {
    eyebrow: "稳定的日常陪伴",
    promise: "适合每周持续问事，让档案和对话记忆逐渐形成上下文。",
    badge: "最多人选择",
  },
  pro_monthly: {
    eyebrow: "高频深度推演",
    promise: "适合正在经历重要阶段，希望更频繁使用报告和手相的人。",
    badge: "深度用户",
  },
  yearly: {
    eyebrow: "一个重要阶段，连续看 30 天",
    promise: "适合正在做重要决定的人。围绕一个核心主题持续跟进，每周复盘变化，30 天后沉淀阶段结论。",
    badge: "完整体验",
  },
};

const membershipValues = [
  {
    icon: MessageCircle,
    title: "持续追问",
    detail: "不用每次重新解释背景，围绕同一个问题继续推演。",
  },
  {
    icon: Bot,
    title: "自动选择方式",
    detail: "AI 会判断该聊天、抽牌、起卦，还是读取你的命盘。",
  },
  {
    icon: FileText,
    title: "报告长期沉淀",
    detail: "重要判断保存为报告，之后可以回看、补充和继续追问。",
  },
] as const;

const faqs = [
  {
    question: "星力是什么？",
    answer: "星力用于 AI 对话、塔罗、八卦、手相和深度报告等推演。不同能力消耗不同，使用前会显示所需星力。",
  },
  {
    question: "开通后会记住哪些信息？",
    answer: "只会使用你主动填写的命理档案、关注方向和产品内对话记录做个性化分析。你可以随时查看和修改档案。",
  },
  {
    question: "不想开会员，可以单独买报告吗？",
    answer: "可以。深度报告、八字详批、综合报告和年度报告均支持单次购买，适合有明确问题时使用。",
  },
  {
    question: "解读结果可以当作专业建议吗？",
    answer: "不能。玄机 AI 用于文化娱乐、自我观察与思路整理，不替代医疗、法律、投资或其他专业意见。",
  },
] as const;

function localLivePaymentGate() {
  return {
    allowed: false,
    decision: "no_go",
    code: "LIVE_PAYMENT_NOT_RELEASED",
    scope: "blocked",
    scopeLabel: "not_released",
    label: "not_released",
    detail: "Payment channel is not released.",
    action: "Try again later.",
    message: "Payment channel is not released.",
    status: "warning",
    requiresAllowlist: false,
    allowlist: {
      configured: false,
      userIdsConfigured: 0,
      emailsConfigured: 0,
      totalAccounts: 0,
    },
    currentUser: {
      checked: true,
      allowed: false,
      matchedBy: "none",
    },
  } as const;
}

function getMembershipIntent(value: string | string[] | undefined, products: Product[]) {
  const intent = Array.isArray(value) ? value[0] : value;
  return products.find((product) => product.code === intent);
}

function getPlanBenefits(product: Product) {
  const benefits = [
    `${product.starGrant ?? 0} 星力，用于日常推演`,
    `${product.reportQuota ?? 0} 份深度报告额度`,
    `${product.palmQuota ?? 0} 次手相分析额度`,
  ];

  if (product.code === "trial_7d") {
    benefits.push("7 天内体验完整会员能力");
  } else if (product.code === "yearly") {
    return [
      "锁定 1 个核心主题，连续跟进 30 天",
      "每满 7 天生成 1 次 AI 周复盘",
      "30 天结束生成阶段总结与下一步",
      "自动关联历史 Chat，不用重复解释背景",
      `${product.starGrant ?? 0} 星力 + ${product.reportQuota ?? 0} 份深度报告 + ${product.palmQuota ?? 0} 次手相`,
    ];
  } else if (product.code === "pro_monthly") {
    benefits.push("更适合高频对话与深度分析");
  } else {
    benefits.push("基础档案记忆与历史沉淀");
  }

  return benefits;
}

function getPlanUnit(product: Product) {
  if (product.code === "trial_7d") {
    return "/ 7 天";
  }

  return "/ 月";
}

function getValueHint(product: Product) {
  if (!product.durationDays) {
    return "";
  }

  const daily = product.priceCents / 100 / product.durationDays;
  return `约 ¥${daily < 1 ? daily.toFixed(1) : daily.toFixed(0)} / 天`;
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string | string[] }>;
}) {
  const [{ intent }, session, membershipProducts, oneTimeProducts] = await Promise.all([
    searchParams,
    getSession(),
    getRuntimeMembershipProducts(),
    getRuntimeOneTimeProducts(),
  ]);
  const features = getRuntimeFeatures();
  const livePaymentGate = features.paymentProvider === "live"
    ? await getLivePaymentLaunchGate({ user: session ?? undefined })
    : localLivePaymentGate();
  const visibleMembershipProducts = membershipProducts.filter(
    (product) => product.code !== "trial_7d",
  );
  const selectedPlan = getMembershipIntent(intent, visibleMembershipProducts);

  return (
    <main className="min-h-screen overflow-hidden bg-[#080907] text-[#f4efe5]">
      <header className="sticky top-0 z-50 border-b border-[#24251f]/90 bg-[#080907]/84 backdrop-blur-2xl">
        <div className="mx-auto flex h-[72px] max-w-[1280px] items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="返回玄机 AI 首页">
            <XuanjiMark />
            <span>
              <span className="block font-ritual text-lg tracking-[0.08em]">{brand.cn}</span>
              <span className="block text-[9px] tracking-[0.22em] text-[#777168]">MEMBERSHIP</span>
            </span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/chat" className="hidden px-3 py-2 text-[#aaa294] transition hover:text-[#efd9a6] sm:inline-flex">
              先问问 AI
            </Link>
            <Link
              href={session ? "/member" : createLoginHref("/pricing#plans")}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#c9a35f]/45 bg-[#c9a35f]/9 px-4 text-[#efd9a6] transition hover:border-[#c9a35f]/70 hover:bg-[#c9a35f]/14"
            >
              {session ? "进入个人中心" : "登录后购买"}
              <ChevronRight size={15} aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative isolate px-5 pb-20 pt-16 sm:px-8 sm:pt-24">
        <div className="absolute inset-0 xuanji-stars opacity-45" />
        <div className="absolute left-1/2 top-[-34%] size-[760px] -translate-x-1/2 rounded-full bg-[#c9a35f]/7 blur-[150px]" />
        <div className="relative mx-auto grid max-w-[1180px] gap-14 lg:grid-cols-[1fr_0.78fr] lg:items-center">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#323128] bg-[#11120f]/75 px-3 py-1.5 text-xs text-[#aaa294]">
              <Stars size={14} className="text-[#c9a35f]" aria-hidden="true" />
              让每一次推演，都接得上上一次
            </div>
            <h1 className="mt-7 font-ritual text-[clamp(3rem,6vw,5.6rem)] leading-[1.05] tracking-[-0.05em]">
              选择适合你的
              <span className="block text-[#c9a35f]">陪伴方式</span>
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-8 text-[#aaa294] sm:text-lg sm:leading-9">
              会员不是一包孤立的次数。它让玄机持续读取你的档案、记住问题脉络，并把重要判断沉淀成可回看的报告。
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="#plans"
                className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-[#c9a35f] px-7 font-semibold text-[#17130d] shadow-[0_14px_45px_rgba(201,163,95,0.18)] transition hover:bg-[#efd9a6]"
              >
                查看会员方案
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <Link
                href="/reports/deep"
                className="inline-flex h-13 items-center justify-center gap-2 rounded-full border border-[#3a3a31] bg-[#11120f]/70 px-7 text-[#ded6c8] transition hover:border-[#c9a35f]/50 hover:text-[#efd9a6]"
              >
                <ScrollText size={17} aria-hidden="true" />
                只买一份报告
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs text-[#777168]">
              <span className="inline-flex items-center gap-2"><LockKeyhole size={14} className="text-[#79b8b1]" />档案隐私可控</span>
              <span className="inline-flex items-center gap-2"><ShieldCheck size={14} className="text-[#79b8b1]" />权益清晰可查</span>
              <span className="inline-flex items-center gap-2"><BadgeCheck size={14} className="text-[#79b8b1]" />结果可持续追问</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[430px]">
            <div className="absolute inset-[-28px] rounded-full border border-[#c9a35f]/10" />
            <div className="absolute inset-[-8px] rounded-full border border-[#2c7b78]/12" />
            <div className="relative overflow-hidden rounded-[32px] border border-[#38372e] bg-[#11120f]/92 p-6 shadow-[0_35px_120px_rgba(0,0,0,0.45)] backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] tracking-[0.24em] text-[#777168]">YOUR XUANJI PROFILE</p>
                  <h2 className="mt-2 font-ritual text-2xl">你的长期命理档案</h2>
                </div>
                <span className="flex size-12 items-center justify-center rounded-full border border-[#c9a35f]/30 bg-[#c9a35f]/8 text-[#efd9a6]">
                  <Sparkles size={20} aria-hidden="true" />
                </span>
              </div>
              <div className="mt-7 space-y-3">
                {[
                  ["近期关注", "事业选择 · 关系节奏"],
                  ["对话记忆", "已连续推演 12 次"],
                  ["报告沉淀", "3 份判断可随时回看"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4 rounded-2xl border border-[#2b2c26] bg-[#0b0c0a] px-4 py-3.5">
                    <span className="text-xs text-[#777168]">{label}</span>
                    <span className="text-sm text-[#d8d0c2]">{value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-2xl border border-[#2c7b78]/28 bg-[#2c7b78]/8 p-4">
                <div className="flex items-center gap-2 text-xs text-[#79b8b1]">
                  <Bot size={14} aria-hidden="true" />
                  AI 顾问记忆已连接
                </div>
                <p className="mt-3 text-sm leading-7 text-[#aebfba]">“我记得你上次在犹豫转岗。我们可以接着看，这次的新机会改变了哪些条件。”</p>
              </div>
              {session ? (
                <div className="mt-5 flex items-center justify-between border-t border-[#292a24] pt-5 text-sm">
                  <span className="text-[#777168]">当前星力</span>
                  <span className="font-semibold text-[#efd9a6]">{session.starBalance} 星力</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section id="plans" className="scroll-mt-20 border-y border-[#24251f] bg-[#0b0c0a] px-5 py-20 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-[1280px]">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs tracking-[0.26em] text-[#c9a35f]">MEMBERSHIP PLANS</p>
            <h2 className="mt-4 font-ritual text-4xl tracking-[-0.03em] sm:text-5xl">从免费体验，到更深的月度陪伴</h2>
            <p className="mt-5 text-sm leading-7 text-[#8f887b] sm:text-base">基础方案解决一次次具体问题，99 元方案会围绕一个重要主题持续跟进 30 天。</p>
          </div>

          {selectedPlan ? (
            <div className="mx-auto mt-8 max-w-3xl rounded-[28px] border border-[#c9a35f]/40 bg-[#17150f] p-5 text-left shadow-[0_24px_80px_rgba(201,163,95,0.08)]">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-[#c9a35f]">
                    <Check size={14} aria-hidden="true" />
                    已选择套餐
                  </p>
                  <h3 className="mt-2 font-ritual text-2xl text-[#f4efe5]">已带回你的购买意图：{selectedPlan.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#aaa294]">
                    确认权益无误后即可继续下单；99 元方案还会开放独立的关键阶段陪伴管理页。
                  </p>
                  <Link
                    href={`#plan-${selectedPlan.code}`}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#79b8b1] transition hover:text-[#b8ebe4]"
                  >
                    查看套餐卡
                    <ChevronRight size={13} aria-hidden="true" />
                  </Link>
                </div>
                <div className="min-w-56">
                  {session ? (
                    <PurchaseButton
                      productCode={selectedPlan.code}
                      livePaymentGate={livePaymentGate}
                      ctaLabel={`继续购买${selectedPlan.name}`}
                      featured
                    />
                  ) : (
                    <Link
                      href={createLoginHref(`/pricing?intent=${selectedPlan.code}#plans`)}
                      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#c9a35f] px-5 text-sm font-semibold text-[#17130d] transition hover:bg-[#efd9a6]"
                    >
                      登录后继续购买
                      <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <article className="relative flex scroll-mt-28 flex-col rounded-[28px] border border-[#3b6258] bg-[#0f1512] p-6 transition duration-300 hover:-translate-y-1 hover:border-[#79b8b1]/60">
              <span className="absolute right-5 top-5 rounded-full border border-[#3b6258] bg-[#2c7b78]/12 px-3 py-1 text-[10px] font-semibold tracking-[0.08em] text-[#79b8b1]">
                永久免费
              </span>
              <p className="text-xs text-[#8f887b]">先免费认识玄机</p>
              <h3 className="mt-3 font-ritual text-2xl text-[#f4efe5]">免费版</h3>
              <div className="mt-6 flex items-end gap-2">
                <span className="text-5xl font-semibold tracking-[-0.06em] text-[#f7f0e4]">¥0</span>
                <span className="pb-1 text-sm text-[#777168]">/ 长期</span>
              </div>
              <p className="mt-2 text-xs text-[#79b8b1]">无需绑卡，注册即可使用</p>
              <p className="mt-5 min-h-20 text-sm leading-7 text-[#aaa294]">
                先建立档案、体验基础问事与每日塔罗，再决定是否需要更深的会员能力。
              </p>

              <div className="mt-6 space-y-3 border-t border-[#29423a] pt-5">
                {[
                  `新用户赠送 ${freeStarterStarGrant} 星力`,
                  "约 5–10 次基础 AI 问事",
                  "每日单牌塔罗免费体验",
                  "档案与推演记录持续保留",
                ].map((benefit) => (
                  <p key={benefit} className="flex items-start gap-2.5 text-sm leading-6 text-[#c8c0b2]">
                    <Check size={15} className="mt-1 shrink-0 text-[#79b8b1]" aria-hidden="true" />
                    {benefit}
                  </p>
                ))}
              </div>

              <div className="mt-auto pt-1">
                <Link
                  href={session ? "/chat" : createLoginHref("/onboarding")}
                  className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-[#79b8b1]/45 bg-[#2c7b78]/12 px-5 text-sm font-semibold text-[#a5d2cc] transition hover:border-[#79b8b1]/70 hover:bg-[#2c7b78]/18"
                >
                  {session ? "进入免费版" : "免费注册体验"}
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </article>

            {visibleMembershipProducts.map((product) => {
              const meta = planMeta[product.code];
              const selected = selectedPlan?.code === product.code;
              const featured = Boolean(product.highlighted || selected);
              const productTier = membershipTierByProduct[product.code];
              const tierComparison = session && productTier
                ? compareMembershipTiers(session.tier, productTier)
                : null;
              const isRenewal = tierComparison === 0;
              const isDowngrade = tierComparison !== null && tierComparison > 0;
              const ctaLabel = isDowngrade
                ? "当前等级不可购买"
                : isRenewal
                  ? product.code === "yearly"
                    ? "续费 30 天陪伴"
                    : `续费${product.name}`
                  : session && session.tier !== "FREE"
                    ? product.code === "yearly"
                      ? "升级到 30 天深度陪伴"
                      : `升级到${product.name}`
                    : product.code === "yearly"
                      ? "开启 30 天深度陪伴"
                      : `开通${product.name}`;

              return (
                <article
                  key={product.code}
                  id={`plan-${product.code}`}
                  className={`relative flex scroll-mt-28 flex-col rounded-[28px] border p-6 transition duration-300 hover:-translate-y-1 ${
                    featured
                      ? "border-[#c9a35f]/75 bg-[#17150f] shadow-[0_24px_80px_rgba(201,163,95,0.11)]"
                      : "border-[#30312b] bg-[#11120f] hover:border-[#c9a35f]/35"
                  }`}
                >
                  {meta?.badge ? (
                    <span className={`absolute right-5 top-5 rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.08em] ${featured ? "bg-[#c9a35f] text-[#17130d]" : "border border-[#3b6258] bg-[#2c7b78]/10 text-[#79b8b1]"}`}>
                      {selected ? "已选择" : meta.badge}
                    </span>
                  ) : selected ? (
                    <span className="absolute right-5 top-5 rounded-full bg-[#c9a35f] px-3 py-1 text-[10px] font-semibold text-[#17130d]">已选择</span>
                  ) : null}
                  <p className="text-xs text-[#8f887b]">{meta?.eyebrow}</p>
                  <h3 className="mt-3 font-ritual text-2xl text-[#f4efe5]">{product.name}</h3>
                  <div className="mt-6 flex items-end gap-2">
                    <span className="text-5xl font-semibold tracking-[-0.06em] text-[#f7f0e4]">{formatPrice(product.priceCents, product.currency)}</span>
                    <span className="pb-1 text-sm text-[#777168]">{getPlanUnit(product)}</span>
                  </div>
                  <p className="mt-2 text-xs text-[#6f6a61]">{getValueHint(product)}</p>
                  <p className="mt-5 min-h-20 text-sm leading-7 text-[#aaa294]">{meta?.promise ?? product.description}</p>

                  <div className="mt-6 space-y-3 border-t border-[#292a24] pt-5">
                    {getPlanBenefits(product).map((benefit) => (
                      <p key={benefit} className="flex items-start gap-2.5 text-sm leading-6 text-[#c8c0b2]">
                        <Check size={15} className="mt-1 shrink-0 text-[#79b8b1]" aria-hidden="true" />
                        {benefit}
                      </p>
                    ))}
                  </div>

                  <div className="mt-auto pt-1">
                    {session ? (
                      <PurchaseButton
                        productCode={product.code}
                        livePaymentGate={livePaymentGate}
                        ctaLabel={ctaLabel}
                        featured={featured}
                        disabledReason={isDowngrade
                          ? "当前会员等级更高。可在现有会员到期后选择该方案。"
                          : undefined}
                      />
                    ) : (
                      <Link
                        href={createLoginHref(`/pricing?intent=${product.code}#plans`)}
                        className={`mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition ${featured ? "bg-[#c9a35f] text-[#17130d] hover:bg-[#efd9a6]" : "border border-[#c9a35f]/45 bg-[#c9a35f]/8 text-[#efd9a6] hover:border-[#c9a35f]/70"}`}
                      >
                        {product.code === "yearly" ? "登录后开启 30 天陪伴" : "登录后选择"}
                        <ArrowRight size={16} aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-xs text-[#777168]">
            <span className="inline-flex items-center gap-2"><BadgeCheck size={14} className="text-[#79b8b1]" />权益到账后可在个人中心查看</span>
            <span className="inline-flex items-center gap-2"><Clock3 size={14} className="text-[#79b8b1]" />有效期从开通成功后开始计算</span>
            <span className="inline-flex items-center gap-2"><ShieldCheck size={14} className="text-[#79b8b1]" />下单前可再次确认方案</span>
          </div>
        </div>
      </section>

      <section className="px-5 py-20 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-[1180px]">
          <div className="grid gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
            <div className="lg:sticky lg:top-28">
              <p className="text-xs tracking-[0.26em] text-[#c9a35f]">WHY MEMBERSHIP</p>
              <h2 className="mt-4 font-ritual text-4xl leading-tight tracking-[-0.03em] sm:text-5xl">真正有价值的，是它越来越了解你</h2>
              <p className="mt-5 text-sm leading-8 text-[#8f887b]">一次解读解决当下，持续的档案与对话记忆，才让之后的判断更贴近你的真实处境。</p>
            </div>
            <div className="grid gap-4">
              {membershipValues.map((item, index) => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className="group grid gap-5 rounded-[26px] border border-[#30312b] bg-[#11120f] p-6 transition hover:border-[#c9a35f]/35 sm:grid-cols-[64px_1fr_auto] sm:items-center">
                    <span className="flex size-14 items-center justify-center rounded-2xl border border-[#c9a35f]/22 bg-[#c9a35f]/7 text-[#c9a35f]">
                      <Icon size={23} aria-hidden="true" />
                    </span>
                    <div>
                      <p className="font-ritual text-xl text-[#f4efe5]">{item.title}</p>
                      <p className="mt-2 text-sm leading-7 text-[#8f887b]">{item.detail}</p>
                    </div>
                    <span className="font-ritual text-3xl text-[#34352e] transition group-hover:text-[#c9a35f]/45">0{index + 1}</span>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="mt-20 grid overflow-hidden rounded-[30px] border border-[#34352e] bg-[#11120f] lg:grid-cols-[1fr_0.9fr]">
            <div className="p-7 sm:p-10">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-full bg-[#2c7b78]/12 text-[#79b8b1]"><ScrollText size={20} /></span>
                <p className="text-xs tracking-[0.2em] text-[#79b8b1]">ONE-TIME REPORTS</p>
              </div>
              <h2 className="mt-6 font-ritual text-3xl sm:text-4xl">暂时不想开会员，也可以只为一个重要问题付费</h2>
              <p className="mt-4 max-w-2xl text-sm leading-8 text-[#8f887b]">选择单次报告，不影响之后再建立会员档案。报告会同样保存到你的个人中心。</p>
              <Link href="/reports/deep" className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[#79b8b1]/35 bg-[#2c7b78]/10 px-6 text-sm font-semibold text-[#a5d2cc] transition hover:border-[#79b8b1]/60">
                查看深度报告
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <div className="border-t border-[#30312b] bg-[#0b0c0a] p-5 lg:border-l lg:border-t-0 sm:p-7">
              <div className="space-y-2">
                {oneTimeProducts.slice(0, 4).map((product) => (
                  <div key={product.code} className="flex items-center justify-between gap-4 rounded-2xl px-4 py-3 transition hover:bg-[#151612]">
                    <div>
                      <p className="text-sm text-[#d8d0c2]">{product.name}</p>
                      <p className="mt-1 line-clamp-1 text-xs text-[#68645c]">{product.description}</p>
                    </div>
                    <span className="shrink-0 font-semibold text-[#efd9a6]">{formatPrice(product.priceCents, product.currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[#24251f] bg-[#0b0c0a] px-5 py-20 sm:px-8">
        <div className="mx-auto grid max-w-[1100px] gap-10 lg:grid-cols-[0.65fr_1.35fr]">
          <div>
            <span className="flex size-12 items-center justify-center rounded-full border border-[#c9a35f]/25 bg-[#c9a35f]/7 text-[#c9a35f]"><CircleHelp size={21} /></span>
            <h2 className="mt-5 font-ritual text-3xl">开通前，你可能还想知道</h2>
            <p className="mt-4 text-sm leading-7 text-[#777168]">如果还有具体权益问题，可以先进入 Chat 直接问玄机。</p>
          </div>
          <div className="space-y-3">
            {faqs.map((faq) => (
              <details key={faq.question} className="group rounded-2xl border border-[#30312b] bg-[#11120f] open:border-[#c9a35f]/35">
                <summary className="flex min-h-16 list-none items-center justify-between gap-4 px-5 text-sm font-medium text-[#ded6c8] [&::-webkit-details-marker]:hidden">
                  {faq.question}
                  <ChevronRight size={16} className="shrink-0 text-[#777168] transition group-open:rotate-90 group-open:text-[#c9a35f]" />
                </summary>
                <p className="border-t border-[#292a24] px-5 py-4 text-sm leading-7 text-[#8f887b]">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden px-5 py-20 text-center sm:px-8 sm:py-24">
        <div className="absolute inset-0 xuanji-stars opacity-30" />
        <div className="relative mx-auto max-w-3xl">
          <HeartHandshake size={30} className="mx-auto text-[#c9a35f]" aria-hidden="true" />
          <h2 className="mt-6 font-ritual text-4xl sm:text-5xl">从第一次具体的问题开始</h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-8 text-[#8f887b]">先建立你的档案，再把最近真正困扰你的事情告诉玄机。会员只是让这段陪伴走得更久、更深。</p>
          <Link
            href={session ? "/chat" : createLoginHref("/onboarding")}
            className="mt-8 inline-flex h-13 items-center justify-center gap-2 rounded-full bg-[#c9a35f] px-8 font-semibold text-[#17130d] transition hover:bg-[#efd9a6]"
          >
            {session ? "进入 Chat 开始问事" : "起盘并建立档案"}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-[#24251f] px-5 py-8 text-xs text-[#68645c] sm:px-8">
        <div className="mx-auto flex max-w-[1180px] flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <p>玄机 AI · 用于文化娱乐、自我观察与思路整理</p>
          <div className="flex gap-5">
            <Link href="/legal/terms" className="transition hover:text-[#aaa294]">用户协议</Link>
            <Link href="/legal/privacy" className="transition hover:text-[#aaa294]">隐私政策</Link>
            <Link href="/legal/disclaimer" className="transition hover:text-[#aaa294]">免责声明</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
