import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  Database,
  Gauge,
  ListChecks,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAdminAccess } from "@/lib/admin-auth";
import {
  getProductionHealthChecks,
  summarizeHealth,
  type HealthStatus,
} from "@/lib/health-checks";
import { tryPrisma } from "@/lib/prisma";
import { createLoginHref } from "@/lib/return-to";
import { cn } from "@/lib/utils";
import { buildProtectedAdminPath } from "../admin-navigation";

function statusMeta(status: HealthStatus) {
  if (status === "ready") {
    return {
      label: "已就绪",
      icon: CheckCircle2,
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (status === "blocking") {
    return {
      label: "阻塞",
      icon: AlertTriangle,
      className: "border-red-200 bg-red-50 text-red-700",
    };
  }

  return {
    label: "待完善",
    icon: CircleDashed,
    className: "border-amber-200 bg-amber-50 text-amber-700",
  };
}

export default async function AdminHealthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const access = await getAdminAccess(resolvedSearchParams);

  if (!access.enabled) {
    notFound();
  }

  if (!access.authenticated) {
    redirect(createLoginHref("/admin/health", "/admin"));
  }

  if (!access.authorized) {
    notFound();
  }

  const checks = getProductionHealthChecks();
  const summary = summarizeHealth(checks);
  const databaseProbe = await tryPrisma((prisma) => prisma.user.count());
  const databaseReady = databaseProbe.ok;
  const groups = Array.from(new Set(checks.map((check) => check.group)));
  const adminToken = access.adminToken;

  return (
    <main className="admin-theme min-h-screen bg-background text-foreground">
      <header className="border-b bg-card/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
              玄机 AI · 平台后台
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">系统状态</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              快速检查数据库连通性和上线必需配置；复杂上线材料按需进入完整控制台。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={buildProtectedAdminPath("/admin", adminToken)}>
                <ArrowLeft />
                返回业务后台
              </Link>
            </Button>
            <Button asChild>
              <Link href={buildProtectedAdminPath("/admin/health/full", adminToken)}>
                <ListChecks />
                完整上线控制台
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 lg:px-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>数据库实时探针</CardDescription>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Database className={databaseReady ? "text-emerald-600" : "text-red-600"} />
                {databaseReady ? "已连接" : "连接失败"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {databaseReady
                ? `PostgreSQL 查询成功，当前共 ${databaseProbe.value} 位用户。`
                : "PostgreSQL 查询未通过，生产关键写入应保持阻断。"}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>检查项</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{summary.total}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">基础配置、登录、AI、图片、支付与合规</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>已就绪</CardDescription>
              <CardTitle className="text-3xl tabular-nums text-emerald-700">{summary.ready}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">可直接进入下一步验收</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>阻塞 / 待完善</CardDescription>
              <CardTitle className="text-3xl tabular-nums text-amber-700">
                {summary.blocking} / {summary.warning}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">真实支付和公网图片配置会在此提示</CardContent>
          </Card>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          {groups.map((group) => (
            <Card key={group}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Gauge className="size-4 text-primary" />
                  {group}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {checks
                  .filter((check) => check.group === group)
                  .map((check) => {
                    const meta = statusMeta(check.status);
                    const Icon = meta.icon;

                    return (
                      <div key={check.id} className="rounded-xl border bg-muted/20 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">{check.label}</p>
                            <p className="mt-1 text-sm leading-6 text-muted-foreground">{check.detail}</p>
                          </div>
                          <Badge variant="outline" className={cn("shrink-0 rounded-md", meta.className)}>
                            <Icon />
                            {meta.label}
                          </Badge>
                        </div>
                        {check.status !== "ready" ? (
                          <p className="mt-3 border-t pt-3 text-xs leading-5 text-muted-foreground">
                            建议：{check.action}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </main>
  );
}
