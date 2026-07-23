import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  BrainCircuit,
  FileText,
  Landmark,
} from "lucide-react";
import { getAdminAccess } from "@/lib/admin-auth";
import { getAdminDashboardData } from "@/lib/admin-dashboard";
import {
  getAdminUserDetailData,
  type AdminUserDetailData,
} from "@/lib/admin-user-detail";
import { formatPrice } from "@/lib/commerce";
import { getOrderDisplay } from "@/lib/mock-payment-store";
import { createLoginHref } from "@/lib/return-to";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminShell } from "../../admin-shell";

const numberFormatter = new Intl.NumberFormat("zh-CN");
const fullDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatDateTime(value?: string) {
  return value ? fullDateFormatter.format(new Date(value)) : "—";
}

function shortId(value: string, length = 18) {
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

function initials(value: string) {
  const normalized = value.trim();
  return normalized ? normalized.slice(0, 2).toUpperCase() : "玄";
}

function tierLabel(tier: string) {
  if (tier === "YEARLY") return "年度会员";
  if (tier === "PRO" || tier === "PREMIUM") return "进阶会员";
  if (tier === "MONTHLY") return "月度会员";
  if (tier === "TRIAL") return "体验会员";
  return "免费用户";
}

function tierClass(tier: string) {
  if (tier === "FREE") return "border-slate-200 bg-slate-50 text-slate-600";
  if (tier === "TRIAL") return "border-sky-200 bg-sky-50 text-sky-700";
  if (tier === "PRO" || tier === "PREMIUM" || tier === "YEARLY") {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function orderStatusLabel(status: string) {
  if (status === "PAID") return "已支付";
  if (status === "PENDING") return "待支付";
  if (status === "REFUNDED") return "已退款";
  if (status === "CLOSED") return "已关闭";
  return "支付失败";
}

function orderStatusClass(status: string) {
  if (status === "PAID") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "PENDING") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "REFUNDED") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-red-200 bg-red-50 text-red-700";
}

function walletTypeLabel(type: string) {
  if (type === "GRANT") return "发放";
  if (type === "SPEND") return "消费";
  if (type === "REFUND") return "退款回滚";
  return "人工调整";
}

function reportStatusLabel(status: string) {
  if (status === "COMPLETED") return "已完成";
  if (status === "GENERATING") return "生成中";
  return "生成失败";
}

function reportStatusClass(status: string) {
  if (status === "COMPLETED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "GENERATING") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-red-200 bg-red-50 text-red-700";
}

function reportTypeLabel(type: string) {
  if (type === "BAZI_WUXING") return "八字命盘";
  if (type === "BAGUA") return "六十四卦";
  if (type === "PALM") return "手相分析";
  if (type === "COMPOSITE") return "综合报告";
  if (type === "YEARLY") return "年度运势";
  return "塔罗报告";
}

function featureLabel(feature: string) {
  if (feature === "chat_basic") return "AI 对话";
  if (feature === "palm_reading") return "手相分析";
  if (feature === "deep_report") return "深度报告";
  if (feature === "yearly_report") return "年度报告";
  return feature;
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  detail: string;
  icon: typeof Landmark;
  tone?: "default" | "positive" | "warning" | "brand";
}) {
  const toneClass = {
    default: "bg-slate-100 text-slate-600",
    positive: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    brand: "bg-[#f6efe1] text-[#8a6629]",
  }[tone];

  return (
    <Card className="relative shadow-xs ring-border/80">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums tracking-tight">
          {value}
        </CardTitle>
        <span className={cn("absolute right-5 top-5 flex size-9 items-center justify-center rounded-lg", toneClass)}>
          <Icon className="size-4.5" />
        </span>
      </CardHeader>
      <CardContent className="pt-0 text-xs text-muted-foreground">{detail}</CardContent>
    </Card>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function UserProfileCard({ data }: { data: AdminUserDetailData }) {
  const displayName = data.user.displayName || data.user.email || shortId(data.user.id);
  const topics = data.profile?.recurringTopics ?? [];

  return (
    <Card className="shadow-xs ring-border/80">
      <CardHeader className="border-b">
        <div className="flex items-start gap-4">
          <Avatar className="size-14 rounded-xl">
            <AvatarImage src={data.user.avatarUrl} alt={displayName} />
            <AvatarFallback className="rounded-xl">{initials(displayName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-xl">{displayName}</CardTitle>
            <CardDescription className="mt-1 font-mono text-xs">{data.user.id}</CardDescription>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline" className={cn("rounded-md", tierClass(data.user.tier))}>
                {tierLabel(data.user.tier)}
              </Badge>
              {(data.user.authProviders?.length ? data.user.authProviders : ["EMAIL"]).map((provider) => (
                <Badge key={provider} variant="secondary" className="rounded-md font-normal">
                  {provider === "GOOGLE" ? "Google" : "邮箱"}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-5 text-sm md:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">邮箱</p>
          <p className="mt-1 break-all font-medium">{data.user.email ?? "未绑定邮箱"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">星力余额</p>
          <p className="mt-1 font-medium tabular-nums">{formatNumber(data.user.starBalance)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">注册时间</p>
          <p className="mt-1 font-medium">{formatDateTime(data.user.createdAt)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">最近活跃</p>
          <p className="mt-1 font-medium">{formatDateTime(data.metrics.lastActiveAt)}</p>
        </div>
        <div className="md:col-span-2">
          <p className="text-xs text-muted-foreground">档案完整度</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-2 flex-1 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[#c9a35f]"
                style={{ width: `${data.profile?.completeness ?? 0}%` }}
              />
            </div>
            <span className="w-12 text-right text-sm font-semibold tabular-nums">
              {data.profile?.completeness ?? 0}%
            </span>
          </div>
        </div>
        <div className="md:col-span-2">
          <p className="text-xs text-muted-foreground">AI 记忆摘要</p>
          <p className="mt-2 rounded-lg bg-muted/45 p-3 text-sm leading-6 text-muted-foreground">
            {data.profile?.memorySummary || "暂无命理档案记忆。"}
          </p>
          {topics.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {topics.map((topic) => (
                <Badge key={topic} variant="outline" className="rounded-md font-normal">
                  {topic}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function OrdersCard({ data }: { data: AdminUserDetailData }) {
  return (
    <Card className="shadow-xs ring-border/80">
      <CardHeader className="border-b">
        <CardTitle>订单记录</CardTitle>
        <CardDescription>
          共 {data.orders.length} 笔，已支付 {data.paidOrders.length} 笔，退款 {data.refundedOrders.length} 笔
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {data.orders.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">商品</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>渠道</TableHead>
                <TableHead className="text-right">金额</TableHead>
                <TableHead className="pr-4 text-right">时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.orders.slice(0, 10).map((order) => {
                const display = getOrderDisplay(order);

                return (
                  <TableRow key={order.id}>
                    <TableCell className="pl-4">
                      <p className="font-medium">{order.productName}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{shortId(order.id)}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("rounded-md", orderStatusClass(order.status))}>
                        {orderStatusLabel(order.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <p>{order.provider}</p>
                      <p className="mt-0.5 max-w-36 truncate font-mono text-[11px] text-muted-foreground">
                        {order.providerOrderId ?? "暂无平台单号"}
                      </p>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{display.priceLabel}</TableCell>
                    <TableCell className="pr-4 text-right text-muted-foreground">
                      <p>{formatDateTime(order.createdAt)}</p>
                      <p className="mt-0.5 text-xs">支付：{formatDateTime(order.paidAt)}</p>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="p-5">
            <EmptyState title="暂无订单" description="该用户还没有产生充值或会员订单。" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UsageCard({ data }: { data: AdminUserDetailData }) {
  return (
    <Card className="shadow-xs ring-border/80">
      <CardHeader className="border-b">
        <CardTitle>AI 用量与成本</CardTitle>
        <CardDescription>
          {formatNumber(data.metrics.totalTokens)} Token，预估成本 {formatPrice(data.metrics.aiCostCents)}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {data.usageLogs.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">功能</TableHead>
                <TableHead>模型</TableHead>
                <TableHead className="text-right">输入</TableHead>
                <TableHead className="text-right">输出</TableHead>
                <TableHead className="text-right">费用</TableHead>
                <TableHead className="pr-4 text-right">时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.usageLogs.slice(0, 12).map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="pl-4">
                    <p className="font-medium">{featureLabel(log.feature)}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{shortId(log.id)}</p>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{log.model}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{log.provider}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(log.tokensIn ?? 0)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(log.tokensOut ?? 0)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {log.costCents === undefined ? "—" : formatPrice(log.costCents)}
                  </TableCell>
                  <TableCell className="pr-4 text-right text-muted-foreground">{formatDateTime(log.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-5">
            <EmptyState title="暂无 AI 用量" description="该用户还没有产生模型调用记录。" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AssetsCard({ data }: { data: AdminUserDetailData }) {
  const balances = data.entitlementSummary?.balances ?? [];

  return (
    <Card className="shadow-xs ring-border/80">
      <CardHeader className="border-b">
        <CardTitle>钱包与权益</CardTitle>
        <CardDescription>
          累计发放 {formatNumber(data.metrics.starsGranted)} 星力，累计消耗 {formatNumber(data.metrics.starsSpent)} 星力
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {balances.length > 0 ? balances.map((balance) => (
            <div key={balance.kind} className="rounded-lg border bg-card p-4">
              <p className="text-sm font-medium">{balance.label}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{balance.remaining}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                已发放 {balance.granted}，已使用 {balance.used}，来源订单 {balance.sourceOrders} 笔
              </p>
            </div>
          )) : (
            <div className="sm:col-span-2">
              <EmptyState title="暂无权益账户" description="该用户还没有深度报告或手相额度。" />
            </div>
          )}
        </div>

        {data.walletTransactions.length > 0 ? (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">钱包流水</TableHead>
                  <TableHead className="text-right">变动</TableHead>
                  <TableHead className="text-right">余额</TableHead>
                  <TableHead className="pr-4 text-right">时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.walletTransactions.slice(0, 8).map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="pl-4">
                      <p className="font-medium">{walletTypeLabel(transaction.type)}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{transaction.reason}</p>
                    </TableCell>
                    <TableCell className={cn("text-right font-semibold tabular-nums", transaction.amount >= 0 ? "text-emerald-700" : "text-red-700")}>
                      {transaction.amount >= 0 ? "+" : ""}
                      {transaction.amount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{transaction.balanceAfter}</TableCell>
                    <TableCell className="pr-4 text-right text-muted-foreground">{formatDateTime(transaction.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ReportsCard({ data }: { data: AdminUserDetailData }) {
  return (
    <Card className="shadow-xs ring-border/80">
      <CardHeader className="border-b">
        <CardTitle>报告记录</CardTitle>
        <CardDescription>
          共 {data.reports.length} 份，已完成 {data.metrics.completedReports} 份
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {data.reports.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">报告</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>模型 / Token</TableHead>
                <TableHead className="pr-4 text-right">时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.reports.slice(0, 10).map((report) => (
                <TableRow key={report.id}>
                  <TableCell className="max-w-80 whitespace-normal pl-4">
                    <p className="font-medium">{report.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{report.summary || "暂无摘要"}</p>
                  </TableCell>
                  <TableCell>{reportTypeLabel(report.type)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("rounded-md", reportStatusClass(report.status))}>
                      {reportStatusLabel(report.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{report.modelUsed ?? "本地工具"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {report.costTokens ? `${formatNumber(report.costTokens)} Token` : "暂无 Token"}
                    </p>
                  </TableCell>
                  <TableCell className="pr-4 text-right text-muted-foreground">{formatDateTime(report.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-5">
            <EmptyState title="暂无报告" description="该用户还没有生成深度或专项报告。" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UserDetailContent({ data }: { data: AdminUserDetailData }) {
  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="outline" size="sm" className="w-fit">
          <Link href="/admin?section=users">
            <ArrowLeft />
            返回用户列表
          </Link>
        </Button>
        <Button asChild size="sm" className="w-fit">
          <Link href="/admin?section=ai">
            查看全站 AI 成本
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="累计实付" value={formatPrice(data.metrics.totalSpentCents)} detail={`${data.paidOrders.length} 笔已支付订单`} icon={Landmark} tone="brand" />
        <MetricCard label="AI 预估成本" value={formatPrice(data.metrics.aiCostCents)} detail={`净额 ${formatPrice(data.metrics.netAfterAiCents)}`} icon={Bot} tone={data.metrics.aiCostCents > 0 ? "warning" : "default"} />
        <MetricCard label="Token 合计" value={formatNumber(data.metrics.totalTokens)} detail={`输入 ${formatNumber(data.metrics.tokensIn)} / 输出 ${formatNumber(data.metrics.tokensOut)}`} icon={BrainCircuit} tone="positive" />
        <MetricCard label="报告数量" value={formatNumber(data.reports.length)} detail={`${data.metrics.completedReports} 份已完成`} icon={FileText} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-6">
          <UserProfileCard data={data} />
          <AssetsCard data={data} />
        </div>
        <div className="space-y-6">
          <OrdersCard data={data} />
          <UsageCard data={data} />
          <ReportsCard data={data} />
        </div>
      </div>
    </div>
  );
}

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ userId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const access = await getAdminAccess(resolvedSearchParams);

  if (!access.enabled) {
    notFound();
  }

  if (!access.authenticated) {
    redirect(createLoginHref(`/admin/users/${encodeURIComponent(userId)}`, "/admin"));
  }

  if (!access.authorized) {
    notFound();
  }

  const [dashboard, detail] = await Promise.all([
    getAdminDashboardData(),
    getAdminUserDetailData(userId),
  ]);

  if (!detail) {
    notFound();
  }

  const databaseReady = dashboard.persistenceReadiness.storeMode === "database";
  const counts = {
    users: dashboard.users.length,
    orders: dashboard.orders.length,
    reports: dashboard.reports.length,
    aiCalls: dashboard.aiUsageLogs.length,
  };
  const displayName = detail.user.displayName || detail.user.email || shortId(detail.user.id);

  return (
    <AdminShell
      activeSection="users"
      adminToken={access.adminToken}
      title={`用户详情 · ${displayName}`}
      description="查看单个用户的档案、订单、权益、报告和模型成本"
      counts={counts}
      databaseReady={databaseReady}
      persistenceLabel={databaseReady ? "PostgreSQL 已连接" : dashboard.persistenceReadiness.label}
    >
      <UserDetailContent data={detail} />
    </AdminShell>
  );
}
