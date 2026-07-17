import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Bot,
  BrainCircuit,
  CircleDollarSign,
  Coins,
  FileText,
  Gauge,
  Gift,
  Image,
  Landmark,
  MessageSquareText,
  Package,
  ReceiptText,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  WalletCards,
} from "lucide-react";
import { AdminActivityChart, AdminTokenChart } from "./admin-charts";
import { AdminEntitlementAdjustForm } from "./entitlement-adjust-form";
import { AdminOrderActions } from "./order-actions";
import { AdminReportActions } from "./report-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminDashboardData } from "@/lib/admin-dashboard";
import type { getAdminProductConfigRows } from "@/lib/product-config";
import { formatPrice } from "@/lib/commerce";
import { getOrderDisplay } from "@/lib/mock-payment-store";
import { cn } from "@/lib/utils";
import { AdminProductConfigForm } from "./product-config-form";
import {
  buildAdminHref,
  buildProtectedAdminPath,
  type AdminSection,
} from "./admin-navigation";

const numberFormatter = new Intl.NumberFormat("zh-CN");
const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
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
  return value ? dateTimeFormatter.format(new Date(value)) : "—";
}

function formatFullDate(value?: string) {
  return value ? fullDateFormatter.format(new Date(value)) : "—";
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(value > 0 && value < 0.1 ? 1 : 0)}%`;
}

function shortId(value: string, length = 12) {
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

function userName(user: AdminDashboardData["users"][number] | undefined, fallbackId: string) {
  return user?.displayName || user?.email || shortId(fallbackId);
}

function initials(value: string) {
  const normalized = value.trim();
  return normalized ? normalized.slice(0, 2).toUpperCase() : "玄";
}

function tierLabel(tier: string) {
  if (tier === "YEARLY") return "深度陪伴会员";
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

function walletTypeLabel(type: string) {
  if (type === "GRANT") return "发放";
  if (type === "SPEND") return "消费";
  if (type === "REFUND") return "退款回滚";
  return "人工调整";
}

function entitlementTypeLabel(type: string) {
  if (type === "GRANT") return "发放";
  if (type === "SPEND") return "消费";
  if (type === "REFUND") return "退回";
  if (type === "EXPIRE") return "过期";
  return "调整";
}

function readMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function costSourceLabel(metadata: unknown) {
  const source = readMetadataString(metadata, "costSource");

  if (source === "env_model_rate") return "模型费率";
  if (source === "env_default_rate") return "默认费率";
  if (source === "startup_estimate_v1") return "系统估算";
  if (source === "local_no_model_cost") return "本地零成本";
  return "待补齐";
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "default",
  footer,
}: {
  label: string;
  value: ReactNode;
  detail: string;
  icon: LucideIcon;
  tone?: "default" | "positive" | "warning" | "brand";
  footer?: ReactNode;
}) {
  const toneClass = {
    default: "bg-slate-100 text-slate-600",
    positive: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    brand: "bg-[#f6efe1] text-[#8a6629]",
  }[tone];

  return (
    <Card className="shadow-xs ring-border/80">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums tracking-tight @[250px]/card:text-3xl">
          {value}
        </CardTitle>
        <CardAction>
          <span className={cn("flex size-9 items-center justify-center rounded-lg", toneClass)}>
            <Icon className="size-4.5" />
          </span>
        </CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1 border-t-0 bg-transparent pt-0 text-xs text-muted-foreground">
        <span>{detail}</span>
        {footer}
      </CardFooter>
    </Card>
  );
}

function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="mt-4 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

type AdminProductRows = Awaited<ReturnType<typeof getAdminProductConfigRows>>;

function productConfigFormKey(row: AdminProductRows[number]) {
  const product = row.effective;

  return [
    row.code,
    row.enabled,
    row.configured,
    product.name,
    product.priceCents,
    product.starGrant ?? 0,
    product.durationDays ?? 0,
    product.reportQuota ?? 0,
    product.palmQuota ?? 0,
    product.highlighted ? "highlighted" : "normal",
    product.description,
  ].join("|");
}

function UserIdentity({
  user,
  fallbackId,
}: {
  user: AdminDashboardData["users"][number] | undefined;
  fallbackId: string;
}) {
  const name = userName(user, fallbackId);

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-8 rounded-lg">
        <AvatarImage src={user?.avatarUrl} alt={name} />
        <AvatarFallback className="rounded-lg bg-slate-100 text-[11px] text-slate-600">
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="max-w-52 truncate text-sm font-medium text-foreground">{name}</p>
        <p className="max-w-52 truncate font-mono text-[11px] text-muted-foreground">
          {shortId(fallbackId, 18)}
        </p>
      </div>
    </div>
  );
}

function FilterToolbar({
  section,
  adminToken,
  query,
  status,
  statusOptions,
  placeholder,
}: {
  section: AdminSection;
  adminToken?: string;
  query?: string;
  status?: string;
  statusOptions?: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <form method="get" className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
      <input type="hidden" name="section" value={section} />
      {adminToken ? <input type="hidden" name="token" value={adminToken} /> : null}
      <label className="relative block sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={query} placeholder={placeholder} className="pl-9" />
      </label>
      {statusOptions ? (
        <select
          name="status"
          defaultValue={status}
          className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
      <Button type="submit" variant="outline" size="sm">筛选</Button>
      {query || status ? (
        <Button asChild variant="ghost" size="sm">
          <Link href={buildAdminHref({ section, token: adminToken })}>重置</Link>
        </Button>
      ) : null}
    </form>
  );
}

export function AdminOverview({ data, adminToken }: { data: AdminDashboardData; adminToken?: string }) {
  const recentOrders = data.orders.slice(0, 6);
  const recentUsers = data.users.slice(0, 6);

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="实收收入"
          value={formatPrice(data.metrics.grossCents)}
          detail={`${data.paidOrders.length} 笔已支付订单`}
          icon={CircleDollarSign}
          tone="positive"
          footer={
            <span className="flex items-center gap-1 text-emerald-700">
              <TrendingUp className="size-3.5" />
              扣除 AI 预估成本后 {formatPrice(data.metrics.netAfterAiCents)}
            </span>
          }
        />
        <MetricCard
          label="注册用户"
          value={formatNumber(data.users.length)}
          detail={`${data.metrics.activeMembers} 位付费/体验会员`}
          icon={Users}
          tone="default"
          footer={<span>付费转化率 {formatPercent(data.metrics.paidConversion)}</span>}
        />
        <MetricCard
          label="AI 调用成本"
          value={formatPrice(data.metrics.totalAiCostCents)}
          detail={`${formatNumber(data.aiUsageLogs.length)} 次模型调用`}
          icon={Bot}
          tone={data.metrics.hasStartupEstimate ? "warning" : "brand"}
          footer={<span>{formatNumber(data.metrics.totalTokens)} Token</span>}
        />
        <MetricCard
          label="星力资产"
          value={formatNumber(data.metrics.totalStarBalance)}
          detail={`累计发放 ${formatNumber(data.metrics.totalStarsGranted)}`}
          icon={Coins}
          tone="brand"
          footer={<span>累计消耗 {formatNumber(data.metrics.totalStarsSpent)}</span>}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,0.7fr)]">
        <Card className="shadow-xs ring-border/80">
          <CardHeader className="border-b">
            <CardTitle>近 14 天业务趋势</CardTitle>
            <CardDescription>支付订单与 AI 调用次数按日汇总</CardDescription>
            <CardAction>
              <Badge variant="outline" className="rounded-md font-normal">实时数据库</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="px-2 pt-5 sm:px-5">
            <AdminActivityChart data={data.dailyMetrics} />
          </CardContent>
        </Card>

        <Card className="shadow-xs ring-border/80">
          <CardHeader className="border-b">
            <CardTitle>经营健康度</CardTitle>
            <CardDescription>收入、模型成本和待处理事项</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 pt-1">
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">AI 成本占收入</span>
                <span className="font-medium tabular-nums">
                  {data.metrics.grossCents > 0
                    ? formatPercent(data.metrics.totalAiCostCents / data.metrics.grossCents)
                    : "0%"}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-[#b68b43]"
                  style={{
                    width: `${Math.min(
                      data.metrics.grossCents > 0
                        ? (data.metrics.totalAiCostCents / data.metrics.grossCents) * 100
                        : 0,
                      100,
                    )}%`,
                  }}
                />
              </div>
            </div>

            {[
              { label: "待支付订单", value: data.pendingOrders.length, icon: ReceiptText, tone: "text-amber-700 bg-amber-50" },
              { label: "失败订单", value: data.failedOrders.length, icon: ShieldAlert, tone: "text-red-700 bg-red-50" },
              { label: "失败报告", value: data.reports.filter((report) => report.status === "FAILED").length, icon: FileText, tone: "text-red-700 bg-red-50" },
              { label: "未记录成本调用", value: data.metrics.missingCostCalls, icon: Gauge, tone: "text-slate-700 bg-slate-100" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center gap-3">
                  <span className={cn("flex size-9 items-center justify-center rounded-lg", item.tone)}>
                    <Icon className="size-4" />
                  </span>
                  <span className="flex-1 text-sm text-muted-foreground">{item.label}</span>
                  <span className="font-semibold tabular-nums text-foreground">{item.value}</span>
                </div>
              );
            })}
          </CardContent>
          <CardFooter className="text-xs leading-5 text-muted-foreground">
            {data.metrics.hasStartupEstimate
              ? "模型费用目前包含系统估算费率，接入中转站账单后可替换为实际成本。"
              : "模型费率已按环境配置计算。"}
          </CardFooter>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="shadow-xs ring-border/80">
          <CardHeader className="border-b">
            <CardTitle>最近订单</CardTitle>
            <CardDescription>最新创建的充值与会员订单</CardDescription>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href={buildAdminHref({ section: "orders", token: adminToken })}>查看全部 <ArrowUpRight /></Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="p-0">
            {recentOrders.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">订单</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="pr-4 text-right">金额</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentOrders.map((order) => (
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
                      <TableCell className="pr-4 text-right font-medium tabular-nums">
                        {getOrderDisplay(order).priceLabel}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState icon={ReceiptText} title="暂无订单" description="用户下单后会实时出现在这里。" />
            )}
          </CardContent>
        </Card>

        <Card className="shadow-xs ring-border/80">
          <CardHeader className="border-b">
            <CardTitle>最新用户</CardTitle>
            <CardDescription>最近完成注册的用户账户</CardDescription>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href={buildAdminHref({ section: "users", token: adminToken })}>查看全部 <ArrowUpRight /></Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="p-0">
            {recentUsers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">用户</TableHead>
                    <TableHead>会员</TableHead>
                    <TableHead className="pr-4 text-right">星力</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="pl-4"><UserIdentity user={user} fallbackId={user.id} /></TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("rounded-md", tierClass(user.tier))}>
                          {tierLabel(user.tier)}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-4 text-right font-medium tabular-nums">{user.starBalance}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState icon={Users} title="暂无用户" description="注册账户会出现在这里。" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function AdminUsers({
  data,
  adminToken,
  query,
}: {
  data: AdminDashboardData;
  adminToken?: string;
  query?: string;
}) {
  const normalizedQuery = query?.trim().toLowerCase();
  const filteredUsers = normalizedQuery
    ? data.users.filter((user) =>
        [user.id, user.email, user.displayName, ...(user.authProviders ?? [])]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(normalizedQuery)),
      )
    : data.users;

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="用户总数" value={formatNumber(data.users.length)} detail="当前数据库账户" icon={Users} />
        <MetricCard label="会员用户" value={formatNumber(data.metrics.activeMembers)} detail="体验卡及以上等级" icon={UserCheck} tone="positive" />
        <MetricCard label="用户总消费" value={formatPrice(data.metrics.grossCents)} detail={`${data.metrics.paidUsers} 位付费用户`} icon={Landmark} tone="brand" />
      </div>

      <Card className="shadow-xs ring-border/80">
        <CardHeader className="border-b">
          <SectionHeading
            title="注册用户"
            description={`共 ${data.users.length} 位用户，当前筛选结果 ${filteredUsers.length} 位`}
            action={<FilterToolbar section="users" adminToken={adminToken} query={query} placeholder="搜索邮箱、昵称或用户 ID" />}
          />
        </CardHeader>
        <CardContent className="p-0">
          {filteredUsers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">用户</TableHead>
                  <TableHead>登录方式</TableHead>
                  <TableHead>会员等级</TableHead>
                  <TableHead className="text-right">星力余额</TableHead>
                  <TableHead className="text-right">订单 / 实付</TableHead>
                  <TableHead>注册时间</TableHead>
                  <TableHead className="pr-4 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => {
                  const commerce = data.commerceByUser.get(user.id);

                  return (
                    <TableRow key={user.id}>
                      <TableCell className="pl-4"><UserIdentity user={user} fallbackId={user.id} /></TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(user.authProviders?.length ? user.authProviders : ["EMAIL"]).map((provider) => (
                            <Badge key={provider} variant="secondary" className="rounded-md font-normal">
                              {provider === "GOOGLE" ? "Google" : "邮箱"}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("rounded-md", tierClass(user.tier))}>
                          {tierLabel(user.tier)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatNumber(user.starBalance)}</TableCell>
                      <TableCell className="text-right">
                        <p className="font-medium tabular-nums">{commerce?.paidOrders ?? 0} / {formatPrice(commerce?.spentCents ?? 0)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">共 {commerce?.orders ?? 0} 笔</p>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatFullDate(user.createdAt)}</TableCell>
                      <TableCell className="pr-4 text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={buildProtectedAdminPath(`/admin/users/${encodeURIComponent(user.id)}`, adminToken)}>
                            查看详情
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState icon={Search} title="没有匹配用户" description="换一个邮箱、昵称或用户 ID 再试。" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminOrders({
  data,
  adminToken,
  query,
  status,
}: {
  data: AdminDashboardData;
  adminToken?: string;
  query?: string;
  status?: string;
}) {
  const normalizedQuery = query?.trim().toLowerCase();
  const filteredOrders = data.orders.filter((order) => {
    const user = data.userById.get(order.userId);
    const matchesQuery = !normalizedQuery ||
      [order.id, order.providerOrderId, order.productName, order.userId, user?.email]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedQuery));
    const matchesStatus = !status || status === "ALL" || order.status === status;
    return matchesQuery && matchesStatus;
  });

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="订单总数" value={formatNumber(data.orders.length)} detail="全部充值和会员订单" icon={ReceiptText} />
        <MetricCard label="已支付" value={formatNumber(data.paidOrders.length)} detail={formatPrice(data.metrics.grossCents)} icon={CircleDollarSign} tone="positive" />
        <MetricCard label="待支付" value={formatNumber(data.pendingOrders.length)} detail="等待支付回调" icon={Activity} tone="warning" />
        <MetricCard label="退款订单" value={formatNumber(data.refundedOrders.length)} detail="已回滚对应权益" icon={ArrowDownRight} />
      </div>

      <Card className="shadow-xs ring-border/80">
        <CardHeader className="border-b">
          <SectionHeading
            title="订单列表"
            description={`共 ${data.orders.length} 笔订单，当前筛选结果 ${filteredOrders.length} 笔`}
            action={
              <FilterToolbar
                section="orders"
                adminToken={adminToken}
                query={query}
                status={status}
                placeholder="搜索订单号、用户或商品"
                statusOptions={[
                  { value: "ALL", label: "全部状态" },
                  { value: "PAID", label: "已支付" },
                  { value: "PENDING", label: "待支付" },
                  { value: "REFUNDED", label: "已退款" },
                  { value: "FAILED", label: "支付失败" },
                  { value: "CLOSED", label: "已关闭" },
                ]}
              />
            }
          />
        </CardHeader>
        <CardContent className="p-0">
          {filteredOrders.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">订单</TableHead>
                  <TableHead>用户</TableHead>
                  <TableHead>渠道</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">金额</TableHead>
                  <TableHead>创建 / 支付时间</TableHead>
                  <TableHead className="pr-4 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => {
                  const display = getOrderDisplay(order);
                  const user = data.userById.get(order.userId);

                  return (
                    <TableRow key={order.id}>
                      <TableCell className="pl-4">
                        <p className="font-medium text-foreground">{order.productName}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{shortId(order.id, 20)}</p>
                        {order.promotionCode ? <p className="mt-1 text-xs text-emerald-700">优惠：{order.promotionCode}</p> : null}
                      </TableCell>
                      <TableCell><UserIdentity user={user} fallbackId={order.userId} /></TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{order.provider}</p>
                        <p className="mt-0.5 max-w-36 truncate font-mono text-[11px] text-muted-foreground">{order.providerOrderId ?? "暂无平台单号"}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("rounded-md", orderStatusClass(order.status))}>
                          {orderStatusLabel(order.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <p className="font-semibold tabular-nums">{display.priceLabel}</p>
                        {display.discountLabel ? <p className="mt-0.5 text-xs text-emerald-700">{display.discountLabel}</p> : null}
                      </TableCell>
                      <TableCell>
                        <p>{formatDateTime(order.createdAt)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">支付：{formatDateTime(order.paidAt)}</p>
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <AdminOrderActions orderId={order.id} status={order.status} productName={order.productName} adminToken={adminToken} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState icon={Search} title="没有匹配订单" description="调整订单状态或搜索关键词后再试。" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminProducts({
  rows,
  adminToken,
}: {
  rows: AdminProductRows;
  adminToken?: string;
}) {
  const enabledRows = rows.filter((row) => row.enabled);
  const configuredRows = rows.filter((row) => row.configured);
  const highlightedRows = rows.filter((row) => row.effective.highlighted);

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="会员套餐"
          value={formatNumber(rows.length)}
          detail="前台价格页展示的套餐"
          icon={Package}
          tone="brand"
        />
        <MetricCard
          label="可购买"
          value={formatNumber(enabledRows.length)}
          detail="关闭后前台和下单接口都会隐藏"
          icon={BadgeCheck}
          tone="positive"
        />
        <MetricCard
          label="已配置"
          value={formatNumber(configuredRows.length)}
          detail="后台覆盖过默认配置"
          icon={Gauge}
        />
        <MetricCard
          label="主推"
          value={formatNumber(highlightedRows.length)}
          detail="价格页会使用高亮样式"
          icon={Sparkles}
          tone="warning"
        />
      </div>

      <section className="grid gap-5">
        <SectionHeading
          title="套餐配置"
          description="保存后，价格页、登录购买意图和下单接口会读取同一份运行配置。"
        />
        <div className="grid gap-5">
          {rows.map((row) => (
            <section
              key={row.code}
              className="rounded-lg border bg-card p-4 shadow-xs"
            >
              <div className="mb-4 flex flex-col justify-between gap-3 border-b pb-4 md:flex-row md:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-foreground">
                      {row.effective.name}
                    </h3>
                    <Badge variant="outline" className="rounded-md font-mono text-[11px]">
                      {row.code}
                    </Badge>
                    {row.configured ? (
                      <Badge variant="outline" className="rounded-md border-amber-200 bg-amber-50 text-amber-700">
                        后台配置
                      </Badge>
                    ) : null}
                    {!row.enabled ? (
                      <Badge variant="outline" className="rounded-md border-slate-200 bg-slate-50 text-slate-600">
                        已下架
                      </Badge>
                    ) : null}
                    {row.effective.highlighted ? (
                      <Badge variant="outline" className="rounded-md border-violet-200 bg-violet-50 text-violet-700">
                        主推
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    默认：{row.base.name} / {formatPrice(row.base.priceCents, row.base.currency)}
                    {" · "}
                    {row.base.starGrant ?? 0} 星力
                    {" · "}
                    {row.base.reportQuota ?? 0} 份报告
                    {" · "}
                    {row.base.palmQuota ?? 0} 次手相
                  </p>
                </div>
                <div className="text-left md:text-right">
                  <p className="text-2xl font-semibold tracking-tight text-foreground">
                    {formatPrice(row.effective.priceCents, row.effective.currency)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.effective.durationDays ?? 0} 天有效
                  </p>
                </div>
              </div>
              <AdminProductConfigForm
                key={productConfigFormKey(row)}
                row={row}
                adminToken={adminToken}
              />
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

export function AdminAssets({ data, adminToken }: { data: AdminDashboardData; adminToken?: string }) {
  const userOptions = Array.from(new Set([...data.users.map((user) => user.id), ...data.entitlementAccounts.map((account) => account.userId)]));

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="当前星力余额" value={formatNumber(data.metrics.totalStarBalance)} detail={`累计发放 ${formatNumber(data.metrics.totalStarsGranted)}`} icon={WalletCards} tone="brand" />
        <MetricCard label="累计消耗星力" value={formatNumber(data.metrics.totalStarsSpent)} detail={`${data.walletTransactions.length} 条钱包流水`} icon={Coins} />
        <MetricCard label="深度报告额度" value={formatNumber(data.metrics.reportQuota)} detail="全部用户剩余额度" icon={FileText} tone="positive" />
        <MetricCard label="手相分析额度" value={formatNumber(data.metrics.palmQuota)} detail="全部用户剩余额度" icon={Image} tone="warning" />
      </div>

      <AdminEntitlementAdjustForm adminToken={adminToken} userOptions={userOptions} />

      <Card className="shadow-xs ring-border/80">
        <CardHeader className="border-b">
          <SectionHeading title="钱包流水" description="星力发放、消费、退款和人工调整记录" />
        </CardHeader>
        <CardContent className="p-0">
          {data.walletTransactions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">用户</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>变动原因</TableHead>
                  <TableHead className="text-right">变动</TableHead>
                  <TableHead className="text-right">变动后余额</TableHead>
                  <TableHead>关联记录</TableHead>
                  <TableHead className="pr-4 text-right">时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.walletTransactions.slice(0, 100).map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="pl-4"><UserIdentity user={data.userById.get(transaction.userId)} fallbackId={transaction.userId} /></TableCell>
                    <TableCell><Badge variant="secondary" className="rounded-md font-normal">{walletTypeLabel(transaction.type)}</Badge></TableCell>
                    <TableCell className="max-w-80 whitespace-normal"><p className="line-clamp-2 leading-5">{transaction.reason}</p></TableCell>
                    <TableCell className={cn("text-right font-semibold tabular-nums", transaction.amount >= 0 ? "text-emerald-700" : "text-red-700")}>
                      {transaction.amount >= 0 ? "+" : ""}{transaction.amount}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{transaction.balanceAfter}</TableCell>
                    <TableCell>
                      <p className="font-mono text-[11px] text-muted-foreground">{transaction.orderId ? `订单 ${shortId(transaction.orderId)}` : transaction.reportId ? `报告 ${shortId(transaction.reportId)}` : "—"}</p>
                    </TableCell>
                    <TableCell className="pr-4 text-right text-muted-foreground">{formatFullDate(transaction.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState icon={WalletCards} title="暂无钱包流水" description="星力发放或消费后会自动记录。" />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="shadow-xs ring-border/80">
          <CardHeader className="border-b">
            <CardTitle>会员权益账本</CardTitle>
            <CardDescription>额度余额与发放流水中的报告额度、手相额度和幂等键</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {data.entitlementAccounts.length > 0 ? (
              <Table>
                <TableHeader><TableRow><TableHead className="pl-4">用户</TableHead><TableHead>权益</TableHead><TableHead className="pr-4 text-right">余额</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.entitlementAccounts.slice(0, 50).map((account) => (
                    <TableRow key={account.id}>
                      <TableCell className="pl-4"><UserIdentity user={data.userById.get(account.userId)} fallbackId={account.userId} /></TableCell>
                      <TableCell>{account.label}</TableCell>
                      <TableCell className="pr-4 text-right text-lg font-semibold tabular-nums">{account.balance}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <EmptyState icon={Gift} title="暂无权益账户" description="会员订单支付后会创建权益账户。" />}
          </CardContent>
        </Card>

        <Card className="shadow-xs ring-border/80">
          <CardHeader className="border-b">
            <CardTitle>会员权益流水</CardTitle>
            <CardDescription>发放、消费、退回、人工调整额度和幂等键</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {data.entitlementTransactions.length > 0 ? (
              <Table>
                <TableHeader><TableRow><TableHead className="pl-4">用户</TableHead><TableHead>权益 / 类型</TableHead><TableHead>原因</TableHead><TableHead className="text-right">变动</TableHead><TableHead className="pr-4 text-right">时间</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.entitlementTransactions.slice(0, 80).map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell className="pl-4"><UserIdentity user={data.userById.get(transaction.userId)} fallbackId={transaction.userId} /></TableCell>
                      <TableCell><p className="font-medium">{transaction.label}</p><p className="mt-0.5 text-xs text-muted-foreground">{entitlementTypeLabel(transaction.type)}</p></TableCell>
                      <TableCell className="max-w-72 whitespace-normal"><p className="line-clamp-2 leading-5">{transaction.reason}</p></TableCell>
                      <TableCell className={cn("text-right font-semibold tabular-nums", transaction.amount >= 0 ? "text-emerald-700" : "text-red-700")}>
                        {transaction.amount >= 0 ? "+" : ""}{transaction.amount}
                        <p className="mt-0.5 text-xs font-normal text-muted-foreground">余额 {transaction.balanceAfter}</p>
                      </TableCell>
                      <TableCell className="pr-4 text-right text-muted-foreground">{formatDateTime(transaction.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <EmptyState icon={Gift} title="暂无权益流水" description="会员额度变动后会自动记录。" />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function AdminAiUsage({ data }: { data: AdminDashboardData }) {
  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="模型调用" value={formatNumber(data.aiUsageLogs.length)} detail={`${data.modelBreakdown.length} 个模型`} icon={BrainCircuit} tone="brand" />
        <MetricCard label="输入 Token" value={formatNumber(data.metrics.totalTokensIn)} detail="请求、档案与上下文" icon={ArrowUpRight} />
        <MetricCard label="输出 Token" value={formatNumber(data.metrics.totalTokensOut)} detail="模型生成内容" icon={ArrowDownRight} tone="positive" />
        <MetricCard label="预估模型成本" value={formatPrice(data.metrics.totalAiCostCents)} detail={`平均 ¥${(data.metrics.averageAiCostCents / 100).toFixed(3)} / 次`} icon={CircleDollarSign} tone={data.metrics.hasStartupEstimate ? "warning" : "positive"} />
      </div>

      {data.metrics.hasStartupEstimate ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">当前费用包含系统估算值</p>
            <p className="mt-1 leading-6 text-amber-800">Token 数量来自模型响应；费用按项目内置启动费率估算，不等于中转站最终账单。配置模型费率或接入账单 API 后可得到更准确成本。</p>
          </div>
        </div>
      ) : null}

      <Card className="shadow-xs ring-border/80">
        <CardHeader className="border-b">
          <CardTitle>近 14 天 Token 与成本趋势</CardTitle>
          <CardDescription>输入、输出 Token 使用量与每日预估费用</CardDescription>
        </CardHeader>
        <CardContent className="px-2 pt-5 sm:px-5"><AdminTokenChart data={data.dailyMetrics} /></CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="shadow-xs ring-border/80">
          <CardHeader className="border-b"><CardTitle>按模型汇总</CardTitle><CardDescription>调用次数、Token 与预估成本</CardDescription></CardHeader>
          <CardContent className="p-0">
            {data.modelBreakdown.length > 0 ? (
              <Table>
                <TableHeader><TableRow><TableHead className="pl-4">模型</TableHead><TableHead className="text-right">调用</TableHead><TableHead className="text-right">输入</TableHead><TableHead className="text-right">输出</TableHead><TableHead className="pr-4 text-right">成本</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.modelBreakdown.map((item) => (
                    <TableRow key={item.key}>
                      <TableCell className="pl-4"><p className="font-medium">{item.model}</p><p className="mt-0.5 text-xs text-muted-foreground">{item.provider} · {item.users} 位用户</p></TableCell>
                      <TableCell className="text-right tabular-nums">{item.calls}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(item.tokensIn)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(item.tokensOut)}</TableCell>
                      <TableCell className="pr-4 text-right font-semibold tabular-nums">{formatPrice(item.costCents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <EmptyState icon={Bot} title="暂无模型调用" description="用户开始对话后会记录模型、Token 与费用。" />}
          </CardContent>
        </Card>

        <Card className="shadow-xs ring-border/80">
          <CardHeader className="border-b"><CardTitle>按功能汇总</CardTitle><CardDescription>查看不同产品功能的模型消耗</CardDescription></CardHeader>
          <CardContent className="p-0">
            {data.featureBreakdown.length > 0 ? (
              <Table>
                <TableHeader><TableRow><TableHead className="pl-4">功能</TableHead><TableHead className="text-right">调用</TableHead><TableHead className="text-right">总 Token</TableHead><TableHead className="pr-4 text-right">成本</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.featureBreakdown.map((item) => (
                    <TableRow key={item.key}>
                      <TableCell className="pl-4"><p className="font-medium">{featureLabel(item.feature)}</p><p className="mt-0.5 text-xs text-muted-foreground">{item.model}</p></TableCell>
                      <TableCell className="text-right tabular-nums">{item.calls}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(item.tokensIn + item.tokensOut)}</TableCell>
                      <TableCell className="pr-4 text-right font-semibold tabular-nums">{formatPrice(item.costCents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <EmptyState icon={Sparkles} title="暂无功能消耗" description="各产品功能调用模型后会自动汇总。" />}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-xs ring-border/80">
        <CardHeader className="border-b"><SectionHeading title="调用明细" description={`最近 ${data.aiUsageLogs.length} 条真实模型调用记录`} /></CardHeader>
        <CardContent className="p-0">
          {data.aiUsageLogs.length > 0 ? (
            <Table>
              <TableHeader><TableRow><TableHead className="pl-4">用户 / 功能</TableHead><TableHead>模型</TableHead><TableHead className="text-right">输入 Token</TableHead><TableHead className="text-right">输出 Token</TableHead><TableHead className="text-right">合计</TableHead><TableHead className="text-right">费用</TableHead><TableHead>计费来源</TableHead><TableHead className="pr-4 text-right">时间</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.aiUsageLogs.slice(0, 200).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="pl-4">
                      <p className="font-medium">{featureLabel(log.feature)}</p>
                      <p className="mt-0.5 max-w-44 truncate text-xs text-muted-foreground">{log.userId ? userName(data.userById.get(log.userId), log.userId) : "系统调用"}</p>
                    </TableCell>
                    <TableCell><p className="font-medium">{log.model}</p><p className="mt-0.5 text-xs text-muted-foreground">{log.provider}</p></TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(log.tokensIn ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(log.tokensOut ?? 0)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatNumber((log.tokensIn ?? 0) + (log.tokensOut ?? 0))}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{log.costCents === undefined ? "—" : formatPrice(log.costCents)}</TableCell>
                    <TableCell><Badge variant="outline" className="rounded-md font-normal">{costSourceLabel(log.metadata)}</Badge></TableCell>
                    <TableCell className="pr-4 text-right text-muted-foreground">{formatFullDate(log.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <EmptyState icon={Bot} title="暂无 AI 调用明细" description="真实模型请求完成后会自动写入 UsageLog。" />}
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminRisk({
  data,
  adminToken,
}: {
  data: AdminDashboardData;
  adminToken?: string;
}) {
  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="风险用户" value={formatNumber(data.metrics.riskUsers)} detail="退款、失败或高成本用户" icon={ShieldAlert} tone={data.metrics.riskUsers > 0 ? "warning" : "positive"} />
        <MetricCard label="失败订单" value={formatNumber(data.failedOrders.length)} detail="支付失败或关闭需关注" icon={ReceiptText} tone={data.failedOrders.length > 0 ? "warning" : "positive"} />
        <MetricCard label="退款订单" value={formatNumber(data.refundedOrders.length)} detail="需核对权益回滚" icon={ArrowDownRight} tone={data.refundedOrders.length > 0 ? "warning" : "default"} />
        <MetricCard label="缺成本调用" value={formatNumber(data.metrics.missingCostCalls)} detail="模型成本归因不完整" icon={BrainCircuit} tone={data.metrics.missingCostCalls > 0 ? "warning" : "positive"} />
      </div>

      <Card className="shadow-xs ring-border/80">
        <CardHeader className="border-b">
          <SectionHeading
            title="风险用户复盘"
            description="按退款、失败、模型成本和成本缺失综合排序"
          />
        </CardHeader>
        <CardContent className="p-0">
          {data.riskUsers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">用户</TableHead>
                  <TableHead className="text-right">风险分</TableHead>
                  <TableHead>异常信号</TableHead>
                  <TableHead className="text-right">AI 调用 / 成本</TableHead>
                  <TableHead className="text-right">订单异常</TableHead>
                  <TableHead className="pr-4 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.riskUsers.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell className="pl-4">
                      <UserIdentity user={data.userById.get(row.userId)} fallbackId={row.userId} />
                      <p className="mt-1 text-xs text-muted-foreground">最近：{formatFullDate(row.lastSeenAt)}</p>
                    </TableCell>
                    <TableCell className="text-right text-lg font-semibold tabular-nums">{row.riskScore}</TableCell>
                    <TableCell>
                      <div className="flex max-w-md flex-wrap gap-1.5">
                        {row.signals.map((signal) => (
                          <Badge key={signal} variant="outline" className="rounded-md border-amber-200 bg-amber-50 font-normal text-amber-700">
                            {signal}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <p className="font-medium tabular-nums">{formatNumber(row.aiCalls)} 次</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatPrice(row.costCents)} · {formatNumber(row.tokens)} Token</p>
                    </TableCell>
                    <TableCell className="text-right">
                      <p className="font-medium tabular-nums">失败 {row.failedOrders} / 退款 {row.refundedOrders}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">报告失败 {row.failedReports}</p>
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={buildProtectedAdminPath(`/admin/users/${encodeURIComponent(row.userId)}`, adminToken)}>
                          查看详情
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState icon={ShieldAlert} title="暂无明显风险" description="当前没有退款、失败或高成本异常用户。" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminReports({ data, adminToken }: { data: AdminDashboardData; adminToken?: string }) {
  const completed = data.reports.filter((report) => report.status === "COMPLETED");
  const generating = data.reports.filter((report) => report.status === "GENERATING");
  const failed = data.reports.filter((report) => report.status === "FAILED");

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="报告总数" value={formatNumber(data.reports.length)} detail="全部深度与专项报告" icon={FileText} />
        <MetricCard label="已完成" value={formatNumber(completed.length)} detail="可在用户端查看" icon={UserCheck} tone="positive" />
        <MetricCard label="生成中" value={formatNumber(generating.length)} detail="正在等待或生成" icon={Activity} tone="warning" />
        <MetricCard label="生成失败" value={formatNumber(failed.length)} detail="可重试或补偿" icon={ShieldAlert} tone={failed.length > 0 ? "warning" : "default"} />
      </div>

      <Card className="shadow-xs ring-border/80">
        <CardHeader className="border-b"><SectionHeading title="报告列表" description="查看生成状态、模型消耗并处理失败报告" /></CardHeader>
        <CardContent className="p-0">
          {data.reports.length > 0 ? (
            <Table>
              <TableHeader><TableRow><TableHead className="pl-4">报告</TableHead><TableHead>用户</TableHead><TableHead>类型</TableHead><TableHead>状态</TableHead><TableHead>模型 / Token</TableHead><TableHead>创建时间</TableHead><TableHead className="pr-4 text-right">操作</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="max-w-80 whitespace-normal pl-4"><p className="font-medium">{report.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{report.summary || "暂无摘要"}</p><p className="mt-1 font-mono text-[11px] text-muted-foreground">{shortId(report.id, 18)}</p></TableCell>
                    <TableCell><UserIdentity user={data.userById.get(report.userId)} fallbackId={report.userId} /></TableCell>
                    <TableCell>{reportTypeLabel(report.type)}</TableCell>
                    <TableCell><Badge variant="outline" className={cn("rounded-md", reportStatusClass(report.status))}>{reportStatusLabel(report.status)}</Badge></TableCell>
                    <TableCell><p className="font-medium">{report.modelUsed ?? "本地工具"}</p><p className="mt-0.5 text-xs text-muted-foreground">{report.costTokens ? `${formatNumber(report.costTokens)} Token` : "暂无 Token"}</p></TableCell>
                    <TableCell className="text-muted-foreground">{formatFullDate(report.createdAt)}</TableCell>
                    <TableCell className="pr-4 text-right"><AdminReportActions reportId={report.id} status={report.status} adminToken={adminToken} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <EmptyState icon={MessageSquareText} title="暂无报告" description="用户购买并生成报告后会出现在这里。" />}
        </CardContent>
      </Card>
    </div>
  );
}
