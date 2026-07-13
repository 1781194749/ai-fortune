"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bot,
  Database,
  FileBarChart,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Package,
  ReceiptText,
  ScrollText,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";
import { XuanjiMark } from "@/app/_components/xuanji-mark";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { brand } from "@/lib/site";
import {
  buildAdminHref,
  buildProtectedAdminPath,
  type AdminSection,
} from "./admin-navigation";

type AdminSidebarProps = React.ComponentProps<typeof Sidebar> & {
  activeSection: AdminSection;
  adminToken?: string;
  counts: {
    users: number;
    orders: number;
    reports: number;
    aiCalls: number;
  };
  databaseReady: boolean;
};

const primaryItems: Array<{
  section: AdminSection;
  title: string;
  icon: LucideIcon;
  countKey?: "users" | "orders" | "reports" | "aiCalls";
}> = [
  { section: "overview", title: "数据总览", icon: LayoutDashboard },
  { section: "users", title: "用户管理", icon: Users, countKey: "users" },
  { section: "orders", title: "订单管理", icon: ReceiptText, countKey: "orders" },
  { section: "products", title: "商品配置", icon: Package },
  { section: "assets", title: "资产与权益", icon: WalletCards },
  { section: "ai", title: "AI 用量成本", icon: Bot, countKey: "aiCalls" },
  { section: "risk", title: "风控复盘", icon: ShieldAlert },
  { section: "reports", title: "报告管理", icon: ScrollText, countKey: "reports" },
];

export function AdminSidebar({
  activeSection,
  adminToken,
  counts,
  databaseReady,
  ...props
}: AdminSidebarProps) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="px-3 py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              className="h-12 data-[slot=sidebar-menu-button]:p-1.5"
            >
              <Link href={buildAdminHref({ token: adminToken })}>
                <XuanjiMark className="size-8 rounded-lg border-amber-300/25 bg-amber-300/10 text-amber-200" />
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold">{brand.cn}</span>
                  <span className="truncate text-[11px] text-sidebar-foreground/55">
                    平台后台
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>业务管理</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryItems.map((item) => {
                const Icon = item.icon;
                const count = item.countKey ? counts[item.countKey] : undefined;

                return (
                  <SidebarMenuItem key={item.section}>
                    <SidebarMenuButton
                      asChild
                      isActive={activeSection === item.section}
                      tooltip={item.title}
                      className="h-9"
                    >
                      <Link
                        href={buildAdminHref({
                          section: item.section,
                          token: adminToken,
                        })}
                      >
                        <Icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {count !== undefined ? (
                      <SidebarMenuBadge>{count > 999 ? "999+" : count}</SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>运营与系统</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="运营工具">
                  <Link href={buildProtectedAdminPath("/admin/operations", adminToken)}>
                    <FileBarChart />
                    <span>运营工具</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="系统状态">
                  <Link href={buildProtectedAdminPath("/admin/health", adminToken)}>
                    <HeartPulse />
                    <span>系统状态</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="配置与审计">
                  <Link href={buildProtectedAdminPath("/admin/operations#configuration", adminToken)}>
                    <Settings2 />
                    <span>配置与审计</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={databaseReady ? "PostgreSQL 已连接" : "数据持久化需检查"}>
              {databaseReady ? <Database className="text-emerald-400" /> : <Activity className="text-amber-400" />}
              <span className="flex-1">{databaseReady ? "数据库已连接" : "检查数据持久化"}</span>
              <ShieldCheck className="size-3.5 opacity-50" />
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="返回用户端">
              <Link href="/">
                <LogOut />
                <span>返回用户端</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
