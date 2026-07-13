import { notFound, redirect } from "next/navigation";
import { getAdminAccess } from "@/lib/admin-auth";
import { getAdminDashboardData } from "@/lib/admin-dashboard";
import { getAdminProductConfigRows } from "@/lib/product-config";
import { createLoginHref } from "@/lib/return-to";
import {
  AdminAiUsage,
  AdminAssets,
  AdminOrders,
  AdminOverview,
  AdminProducts,
  AdminReports,
  AdminRisk,
  AdminUsers,
} from "./admin-section-content";
import {
  buildAdminHref,
  normalizeAdminSection,
  type AdminSection,
} from "./admin-navigation";
import { AdminShell } from "./admin-shell";

const sectionMeta: Record<AdminSection, { title: string; description: string }> = {
  overview: {
    title: "数据总览",
    description: "实时掌握用户、收入、资产和模型成本",
  },
  users: {
    title: "用户管理",
    description: "查看注册账户、会员等级、星力余额和付费情况",
  },
  orders: {
    title: "订单管理",
    description: "管理充值与会员订单、支付状态和退款回滚",
  },
  products: {
    title: "商品配置",
    description: "调整前台会员套餐、价格和权益额度",
  },
  assets: {
    title: "资产与权益",
    description: "追踪星力钱包和会员报告、手相额度流水",
  },
  ai: {
    title: "AI 用量与成本",
    description: "分析模型调用、输入输出 Token 和预估费用",
  },
  risk: {
    title: "风控与异常复盘",
    description: "关注退款、失败订单、高成本用户和缺失成本记录",
  },
  reports: {
    title: "报告管理",
    description: "查看报告生成状态并处理失败、重试与补偿",
  },
};

function readSearchValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const activeSection = normalizeAdminSection(readSearchValue(resolvedSearchParams, "section"));
  const query = readSearchValue(resolvedSearchParams, "q");
  const status = readSearchValue(resolvedSearchParams, "status");
  const access = await getAdminAccess();

  if (!access.authenticated) {
    redirect(
      createLoginHref(
        buildAdminHref({ section: activeSection, query, status }),
        "/admin",
      ),
    );
  }

  if (!access.authorized) {
    notFound();
  }

  const adminToken = undefined;
  const [data, productRows] = await Promise.all([
    getAdminDashboardData(),
    getAdminProductConfigRows(),
  ]);
  const meta = sectionMeta[activeSection];
  const databaseReady = data.persistenceReadiness.storeMode === "database";
  const counts = {
    users: data.users.length,
    orders: data.orders.length,
    reports: data.reports.length,
    aiCalls: data.aiUsageLogs.length,
  };

  let content: React.ReactNode;

  if (activeSection === "users") {
    content = <AdminUsers data={data} adminToken={adminToken} query={query} />;
  } else if (activeSection === "orders") {
    content = (
      <AdminOrders
        data={data}
        adminToken={adminToken}
        query={query}
        status={status}
      />
    );
  } else if (activeSection === "products") {
    content = <AdminProducts rows={productRows} adminToken={adminToken} />;
  } else if (activeSection === "assets") {
    content = <AdminAssets data={data} adminToken={adminToken} />;
  } else if (activeSection === "ai") {
    content = <AdminAiUsage data={data} />;
  } else if (activeSection === "risk") {
    content = <AdminRisk data={data} adminToken={adminToken} />;
  } else if (activeSection === "reports") {
    content = <AdminReports data={data} adminToken={adminToken} />;
  } else {
    content = <AdminOverview data={data} adminToken={adminToken} />;
  }

  return (
    <AdminShell
      activeSection={activeSection}
      adminToken={adminToken}
      title={meta.title}
      description={meta.description}
      counts={counts}
      databaseReady={databaseReady}
      persistenceLabel={databaseReady ? "PostgreSQL 已连接" : data.persistenceReadiness.label}
    >
      {content}
    </AdminShell>
  );
}
