import "server-only";

import {
  getProductionHealthChecks,
  summarizeHealth,
  type HealthStatus,
} from "@/lib/health-checks";
import { getIntegrationDiagnostics } from "@/lib/integration-diagnostics";
import { getLaunchEnvChecklist } from "@/lib/launch-env-checklist";
import {
  externalReadinessStatusLabel,
  getLaunchExternalReadiness,
} from "@/lib/launch-external-readiness";
import { getPersistenceReadiness } from "@/lib/persistence-readiness";

export type LaunchReadinessItem = {
  id: string;
  group: string;
  label: string;
  status: HealthStatus;
  detail: string;
  action: string;
  source: "production_check" | "env_checklist" | "persistence" | "integration" | "external";
};

export type LaunchReadiness = {
  generatedAt: string;
  status: HealthStatus;
  label: string;
  detail: string;
  action: string;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
  };
  blockers: LaunchReadinessItem[];
  warnings: LaunchReadinessItem[];
  nextActions: LaunchReadinessItem[];
};

function statusRank(status: HealthStatus) {
  if (status === "blocking") {
    return 0;
  }

  if (status === "warning") {
    return 1;
  }

  return 2;
}

function uniqueById(items: LaunchReadinessItem[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

function launchStatus(input: { blocking: number; warning: number }) {
  if (input.blocking > 0) {
    return {
      status: "blocking" as const,
      label: "暂不可收费上线",
      detail: `当前还有 ${input.blocking} 个阻断项，正式收费前必须处理。`,
      action: "优先处理阻断项，再核对生产变量、更新外部事项、运行落库探针和第三方诊断。",
    };
  }

  if (input.warning > 0) {
    return {
      status: "warning" as const,
      label: "可灰度验证",
      detail: `当前无阻断项，但还有 ${input.warning} 个警告项，适合内部灰度或小流量验证。`,
      action: "小流量放开前确认警告项影响范围，并保留 mock/回滚方案。",
    };
  }

  return {
    status: "ready" as const,
    label: "可进入收费上线",
    detail: "生产清单、变量核对、外部事项、落库验收和第三方诊断均无阻断或警告。",
    action: "可以进入真实支付小额验证、对账检查和灰度放量。",
  };
}

export async function getLaunchReadiness() {
  const checks = getProductionHealthChecks();
  const [envChecklist, persistenceReadiness, integrationDiagnostics, externalReadiness] =
    await Promise.all([
      getLaunchEnvChecklist(),
      getPersistenceReadiness(),
      getIntegrationDiagnostics(),
      getLaunchExternalReadiness(),
    ]);
  const productionItems = checks.map(
    (check) =>
      ({
        id: `check:${check.id}`,
        group: check.group,
        label: check.label,
        status: check.status,
        detail: check.detail,
        action: check.action,
        source: "production_check",
      }) satisfies LaunchReadinessItem,
  );
  const envItems = envChecklist.items.map(
    (item) =>
      ({
        id: `env:${item.key}`,
        group: `生产变量 / ${item.group}`,
        label: `${item.label} (${item.key})`,
        status: item.status,
        detail: [
          `当前状态：${item.stateLabel}`,
          `值：${item.displayValue}`,
          item.sourceItems.length > 0 ? `关联事项：${item.sourceItems.join("、")}` : undefined,
        ]
          .filter(Boolean)
          .join("；"),
        action: item.action,
        source: "env_checklist",
      }) satisfies LaunchReadinessItem,
  );
  const persistenceItem = {
    id: "persistence:database",
    group: "生产数据",
    label: "PostgreSQL 读写验收",
    status: persistenceReadiness.status,
    detail: persistenceReadiness.detail,
    action: persistenceReadiness.action,
    source: "persistence",
  } satisfies LaunchReadinessItem;
  const integrationItems = integrationDiagnostics.items.map(
    (item) =>
      ({
        id: `integration:${item.id}`,
        group: item.group,
        label: item.label,
        status: item.status,
        detail: item.detail,
        action: item.action,
        source: "integration",
      }) satisfies LaunchReadinessItem,
  );
  const externalItems = externalReadiness.items.map(
    (item) =>
      ({
        id: `external:${item.id}`,
        group: `外部事项 / ${item.group}`,
        label: item.title,
        status: item.healthStatus,
        detail: [
          `当前状态：${externalReadinessStatusLabel(item.status)}`,
          item.evidenceNote ? `证据：${item.evidenceNote}` : item.evidence,
          item.receiptNo ? `回执：${item.receiptNo}` : undefined,
          item.evidenceUrl ? `证据链接：${item.evidenceUrl}` : undefined,
          item.targetDate ? `目标日期：${item.targetDate}` : undefined,
          item.note ? `备注：${item.note}` : undefined,
        ]
          .filter(Boolean)
          .join("；"),
        action: item.action,
        source: "external",
      }) satisfies LaunchReadinessItem,
  );
  const items = [
    ...productionItems,
    ...envItems,
    persistenceItem,
    ...integrationItems,
    ...externalItems,
  ];
  const summary = summarizeHealth(items);
  const blockers = items.filter((item) => item.status === "blocking");
  const warnings = items.filter((item) => item.status === "warning");
  const nextActions = uniqueById([...blockers, ...warnings])
    .sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        a.group.localeCompare(b.group, "zh-CN") ||
        a.label.localeCompare(b.label, "zh-CN"),
    )
    .slice(0, 8);
  const status = launchStatus({
    blocking: summary.blocking,
    warning: summary.warning,
  });

  return {
    generatedAt: new Date().toISOString(),
    ...status,
    summary,
    blockers,
    warnings,
    nextActions,
  } satisfies LaunchReadiness;
}
