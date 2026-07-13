import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Bot,
  CreditCard,
  Database,
  HardDriveUpload,
  ShieldCheck,
} from "lucide-react";
import { XuanjiMark } from "@/app/_components/xuanji-mark";
import { getAdminAccess } from "@/lib/admin-auth";
import { getRuntimeFeatures } from "@/lib/features";
import { tryPrisma } from "@/lib/prisma";
import { createLoginHref } from "@/lib/return-to";
import { brand } from "@/lib/site";

type HealthStatus = "ready" | "warning" | "blocking";

const statusMeta: Record<HealthStatus, { label: string; className: string }> = {
  ready: {
    label: "正常",
    className: "border-[#3c8b72]/45 bg-[#3c8b72]/10 text-[#8ad5bd]",
  },
  warning: {
    label: "待配置",
    className: "border-[#c8a15a]/45 bg-[#c8a15a]/10 text-[#f0d49a]",
  },
  blocking: {
    label: "异常",
    className: "border-[#b34c32]/45 bg-[#b34c32]/10 text-[#e08b74]",
  },
};

function configured(...keys: string[]) {
  return keys.every((key) => Boolean(process.env[key]?.trim()));
}

export default async function AdminHealthPage() {
  const access = await getAdminAccess();

  if (!access.authenticated) {
    redirect(createLoginHref("/admin/health", "/admin"));
  }

  if (!access.authorized) {
    notFound();
  }

  const features = getRuntimeFeatures();
  const database = await tryPrisma(async (prisma) => {
    const [users, orders, reports] = await Promise.all([
      prisma.user.count(),
      prisma.order.count(),
      prisma.report.count(),
    ]);

    return { users, orders, reports };
  });
  const sessionReady = (process.env.AUTH_SESSION_SECRET?.trim().length ?? 0) >= 32;
  const aiReady = configured("OPENAI_API_KEY");
  const storageReady = configured(
    "QINIU_ACCESS_KEY",
    "QINIU_SECRET_KEY",
    "QINIU_BUCKET",
    "QINIU_PUBLIC_URL",
  );
  const paymentLive = features.paymentProvider === "live";
  const checks = [
    {
      label: "PostgreSQL",
      detail: database.ok
        ? `${database.value.users} 用户 · ${database.value.orders} 订单 · ${database.value.reports} 报告`
        : "数据库探针未通过，业务写入不可依赖内存回退。",
      status: database.ok ? "ready" : "blocking",
      icon: Database,
    },
    {
      label: "会话安全",
      detail: sessionReady ? "会话密钥已配置。" : "AUTH_SESSION_SECRET 长度不足或未配置。",
      status: sessionReady ? "ready" : "blocking",
      icon: ShieldCheck,
    },
    {
      label: "AI 服务",
      detail: aiReady ? "OpenAI 服务密钥已配置。" : "当前没有可用的 OpenAI 服务密钥。",
      status: aiReady ? "ready" : "warning",
      icon: Bot,
    },
    {
      label: "图片存储",
      detail: storageReady ? "七牛存储参数已配置。" : "图片上传仍缺少完整的七牛存储参数。",
      status: storageReady ? "ready" : "warning",
      icon: HardDriveUpload,
    },
    {
      label: "支付通道",
      detail: paymentLive ? "正式支付通道已启用。" : "当前使用 Mock 支付，正式通道尚未发布。",
      status: paymentLive ? "ready" : "warning",
      icon: CreditCard,
    },
  ] satisfies Array<{
    label: string;
    detail: string;
    status: HealthStatus;
    icon: typeof Activity;
  }>;
  const readyCount = checks.filter((item) => item.status === "ready").length;
  const warningCount = checks.filter((item) => item.status === "warning").length;
  const blockingCount = checks.filter((item) => item.status === "blocking").length;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#080705] px-5 py-8 text-[#f5efe2] sm:px-8">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Link href="/admin" className="flex items-center gap-3" aria-label="返回平台后台">
          <XuanjiMark />
          <span>
            <span className="block font-ritual text-xl">{brand.cn}</span>
            <span className="block text-xs text-[#8f887b]">SYSTEM HEALTH</span>
          </span>
        </Link>
        <Link href="/admin" className="text-sm text-[#d8cab2] transition hover:text-[#f0d49a]">
          返回后台
        </Link>
      </header>

      <section className="mx-auto max-w-6xl py-14">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#c8a15a]">系统状态</p>
            <h1 className="mt-4 font-ritual text-5xl leading-tight text-[#fff7e8] sm:text-6xl">
              运行健康检查
            </h1>
            <p className="mt-5 max-w-2xl leading-8 text-[#b9ad99]">
              核心服务只展示当前可用性。上线证据、资质、成本样本和完整验收清单已拆到独立页面。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              [readyCount, "正常", "text-[#8ad5bd]"],
              [warningCount, "待配置", "text-[#f0d49a]"],
              [blockingCount, "异常", "text-[#e08b74]"],
            ].map(([value, label, className]) => (
              <div key={String(label)} className="min-w-24 rounded-md border border-[#3a3023] bg-[#12100d] px-4 py-4 text-center">
                <p className={`text-2xl font-semibold ${className}`}>{value}</p>
                <p className="mt-1 text-xs text-[#8f887b]">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {checks.map((item) => {
            const Icon = item.icon;
            const meta = statusMeta[item.status];

            return (
              <article key={item.label} className="min-w-0 rounded-md border border-[#332a20] bg-[#12100d] p-5">
                <div className="flex items-start justify-between gap-4">
                  <span className="flex size-10 items-center justify-center rounded-md border border-[#3a3023] bg-[#080705] text-[#f0d49a]">
                    <Icon size={19} aria-hidden="true" />
                  </span>
                  <span className={`rounded-md border px-2.5 py-1 text-xs ${meta.className}`}>
                    {meta.label}
                  </span>
                </div>
                <h2 className="mt-5 font-ritual text-2xl text-[#fff7e8]">{item.label}</h2>
                <p className="mt-3 break-words text-sm leading-7 text-[#b9ad99]">{item.detail}</p>
              </article>
            );
          })}
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-5 rounded-md border border-[#3a3023] bg-[#12100d] p-6 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <Activity className="mt-1 shrink-0 text-[#c8a15a]" size={20} aria-hidden="true" />
            <div>
              <h2 className="font-ritual text-2xl text-[#fff7e8]">完整上线清单</h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-[#b9ad99]">
                资质、支付验收、存储证据、成本样本和 Go / No-Go 决策集中在深度检查页。
              </p>
            </div>
          </div>
          <Link
            href="/admin/health/full"
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-[#c8a15a]/45 bg-[#c8a15a]/10 px-4 text-sm font-semibold text-[#f0d49a] transition hover:border-[#c8a15a]/70"
          >
            打开完整清单
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </main>
  );
}
