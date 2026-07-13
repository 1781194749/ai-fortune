import Link from "next/link";
import { ArrowUpRight, CircleCheck, CircleDashed, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AdminSidebar } from "./admin-sidebar";
import { buildProtectedAdminPath, type AdminSection } from "./admin-navigation";

export function AdminShell({
  activeSection,
  adminToken,
  title,
  description,
  counts,
  databaseReady,
  persistenceLabel,
  children,
}: {
  activeSection: AdminSection;
  adminToken?: string;
  title: string;
  description: string;
  counts: {
    users: number;
    orders: number;
    reports: number;
    aiCalls: number;
  };
  databaseReady: boolean;
  persistenceLabel: string;
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider>
      <SidebarProvider
        className="admin-theme"
        style={
          {
            "--sidebar-width": "17rem",
            "--header-height": "4.25rem",
          } as React.CSSProperties
        }
      >
        <AdminSidebar
          activeSection={activeSection}
          adminToken={adminToken}
          counts={counts}
          databaseReady={databaseReady}
          variant="inset"
        />
        <SidebarInset className="min-w-0 overflow-hidden bg-background">
          <header className="sticky top-0 z-30 flex h-(--header-height) shrink-0 items-center border-b border-border/80 bg-background/90 backdrop-blur-xl">
            <div className="flex w-full items-center gap-3 px-4 lg:px-6">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="h-5" />
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">
                  {title}
                </h1>
                <p className="hidden truncate text-xs text-muted-foreground md:block">
                  {description}
                </p>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "hidden h-7 gap-1.5 rounded-md bg-card px-2.5 font-normal sm:inline-flex",
                  databaseReady
                    ? "border-emerald-200 text-emerald-700"
                    : "border-amber-200 text-amber-700",
                )}
              >
                {databaseReady ? <CircleCheck /> : <CircleDashed />}
                {persistenceLabel}
              </Badge>
              <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                <Link href={buildProtectedAdminPath("/admin/health", adminToken)}>
                  <RefreshCw />
                  系统检查
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/" target="_blank">
                  查看用户端
                  <ArrowUpRight />
                </Link>
              </Button>
            </div>
          </header>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
