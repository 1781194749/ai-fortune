import "server-only";

import type { HealthStatus } from "@/lib/health-checks";
import {
  getLaunchEnvChecklist,
  type LaunchEnvChecklist,
  type LaunchEnvChecklistItem,
} from "@/lib/launch-env-checklist";
import {
  getLaunchExternalReadiness,
  type ExternalReadinessItem,
  type LaunchExternalReadiness,
} from "@/lib/launch-external-readiness";
import {
  getLaunchDatabaseAcceptanceEvidenceRecords,
  latestLaunchDatabaseAcceptanceEvidenceByItem,
  summarizeLaunchDatabaseAcceptanceEvidenceRecords,
  type LaunchDatabaseAcceptanceEvidenceRecord,
  type LaunchDatabaseAcceptanceEvidenceSummary,
} from "@/lib/launch-database-acceptance";
import {
  getPersistenceReadiness,
  type PersistenceReadiness,
} from "@/lib/persistence-readiness";

export type LaunchDatabasePlanStepId =
  | "provision"
  | "connection"
  | "schema"
  | "probe"
  | "coverage"
  | "backup";

export type LaunchDatabasePlanStep = {
  id: LaunchDatabasePlanStepId;
  order: number;
  title: string;
  status: HealthStatus;
  owner: string;
  detail: string;
  action: string;
  evidence: string;
  command?: string;
};

export type LaunchDatabasePlanCommand = {
  label: string;
  command: string;
  detail: string;
};

export type LaunchDatabasePlanCommandGroup = {
  title: string;
  when: string;
  commands: LaunchDatabasePlanCommand[];
};

export type LaunchDatabasePlan = {
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
  database: {
    configured: boolean;
    storeMode: PersistenceReadiness["storeMode"];
    prismaUnavailable: boolean;
    requiredEventCoverage: string;
    lastProbeLabel: string;
    externalStatusLabel: string;
    evidenceRecordCount: number;
    latestEvidenceAt?: string;
  };
  evidenceSummary: LaunchDatabaseAcceptanceEvidenceSummary;
  evidenceRecords: LaunchDatabaseAcceptanceEvidenceRecord[];
  steps: LaunchDatabasePlanStep[];
  nextSteps: LaunchDatabasePlanStep[];
  commandGroups: LaunchDatabasePlanCommandGroup[];
  evidence: string[];
  copyText: string;
};

type LaunchDatabasePlanInput = {
  persistenceReadiness?: PersistenceReadiness;
  envChecklist?: LaunchEnvChecklist;
  externalReadiness?: LaunchExternalReadiness;
  evidenceRecords?: LaunchDatabaseAcceptanceEvidenceRecord[];
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

function statusLabel(status: HealthStatus) {
  if (status === "ready") {
    return "已完成";
  }

  if (status === "blocking") {
    return "阻断";
  }

  return "需复核";
}

function dateLabel(value: string | undefined) {
  return value ? value.slice(0, 16).replace("T", " ") : "未记录";
}

function evidenceRecordLabel(record: LaunchDatabaseAcceptanceEvidenceRecord | undefined) {
  if (!record) {
    return undefined;
  }

  const firstUrl =
    record.metadata.evidenceUrl ??
    record.metadata.migrationLogUrl ??
    record.metadata.backupPolicyUrl ??
    record.metadata.restoreDrillUrl;
  const extra = record.metadata.note ?? firstUrl ?? "已保存后台证据";

  return `最近证据：${statusLabel(record.metadata.status)}，${dateLabel(
    record.metadata.savedAt,
  )}，${extra}`;
}

function summarize(steps: LaunchDatabasePlanStep[]) {
  return {
    ready: steps.filter((step) => step.status === "ready").length,
    warning: steps.filter((step) => step.status === "warning").length,
    blocking: steps.filter((step) => step.status === "blocking").length,
    total: steps.length,
  };
}

function planStatus(summary: ReturnType<typeof summarize>) {
  if (summary.blocking > 0) {
    return "blocking" as const;
  }

  if (summary.warning > 0) {
    return "warning" as const;
  }

  return "ready" as const;
}

function databaseEnv(envChecklist: LaunchEnvChecklist) {
  return envChecklist.items.find((item) => item.key === "DATABASE_URL");
}

function postgresExternal(externalReadiness: LaunchExternalReadiness) {
  return externalReadiness.items.find((item) => item.id === "postgres");
}

function externalLabel(item: ExternalReadinessItem | undefined) {
  if (!item) {
    return "未登记";
  }

  if (item.status === "ready") {
    return "已完成";
  }

  if (item.status === "submitted") {
    return "已提交";
  }

  if (item.status === "in_progress") {
    return "处理中";
  }

  if (item.status === "blocked") {
    return "卡住";
  }

  return "未开始";
}

function provisionStatus(input: {
  persistence: PersistenceReadiness;
  postgres?: ExternalReadinessItem;
}) {
  if (input.persistence.databaseConfigured || input.postgres?.status === "ready") {
    return "ready" as const;
  }

  if (input.postgres?.status === "blocked" || input.postgres?.healthStatus === "blocking") {
    return "blocking" as const;
  }

  return input.postgres?.status === "in_progress" || input.postgres?.status === "submitted"
    ? "warning"
    : "blocking";
}

function schemaStatus(persistence: PersistenceReadiness) {
  if (!persistence.databaseConfigured) {
    return "blocking" as const;
  }

  if (persistence.storeMode !== "database" || persistence.prismaUnavailable) {
    return "blocking" as const;
  }

  return persistence.probeCount > 0 ? "ready" : "warning";
}

function probeStatus(persistence: PersistenceReadiness) {
  if (!persistence.databaseConfigured || persistence.storeMode !== "database") {
    return "blocking" as const;
  }

  return persistence.lastProbe?.writeVerified && persistence.lastProbe.readVerified
    ? "ready"
    : "warning";
}

function coverageStatus(persistence: PersistenceReadiness) {
  if (persistence.storeMode !== "database") {
    return "blocking" as const;
  }

  return persistence.featureCoverage.missingRequired > 0 ? "warning" : "ready";
}

function backupStatus(input: {
  persistence: PersistenceReadiness;
  postgres?: ExternalReadinessItem;
  backupEvidence?: LaunchDatabaseAcceptanceEvidenceRecord;
  restoreEvidence?: LaunchDatabaseAcceptanceEvidenceRecord;
}) {
  if (!input.persistence.databaseConfigured) {
    return "blocking" as const;
  }

  if (
    input.backupEvidence?.metadata.status === "blocking" ||
    input.restoreEvidence?.metadata.status === "blocking"
  ) {
    return "blocking" as const;
  }

  if (
    input.backupEvidence?.metadata.status === "ready" ||
    input.restoreEvidence?.metadata.status === "ready"
  ) {
    return "ready" as const;
  }

  if (
    input.postgres?.status === "ready" &&
    (input.postgres.evidenceNote || input.postgres.evidenceUrl || input.postgres.receiptNo)
  ) {
    return "ready" as const;
  }

  return "warning";
}

function buildSteps(input: {
  persistence: PersistenceReadiness;
  dbEnv?: LaunchEnvChecklistItem;
  postgres?: ExternalReadinessItem;
  evidenceRecords: LaunchDatabaseAcceptanceEvidenceRecord[];
}) {
  const lastProbeLabel = input.persistence.lastProbe
    ? input.persistence.lastProbe.verifiedAt ?? input.persistence.lastProbe.createdAt
    : "未运行";
  const evidenceByItem = latestLaunchDatabaseAcceptanceEvidenceByItem(input.evidenceRecords);
  const provisionEvidence = evidenceRecordLabel(evidenceByItem.get("provision"));
  const connectionEvidence = evidenceRecordLabel(evidenceByItem.get("connection"));
  const schemaEvidence = evidenceRecordLabel(evidenceByItem.get("schema"));
  const probeEvidence = evidenceRecordLabel(evidenceByItem.get("probe"));
  const coverageEvidence = evidenceRecordLabel(evidenceByItem.get("coverage"));
  const backupEvidence = evidenceByItem.get("backup");
  const restoreEvidence = evidenceByItem.get("restore");
  const backupEvidenceLabel = evidenceRecordLabel(backupEvidence);
  const restoreEvidenceLabel = evidenceRecordLabel(restoreEvidence);

  return [
    {
      id: "provision",
      order: 1,
      title: "创建生产 PostgreSQL 实例",
      status: provisionStatus({
        persistence: input.persistence,
        postgres: input.postgres,
      }),
      owner: "技术 / 运维",
      detail: input.postgres
        ? `${input.postgres.title} 当前为${externalLabel(input.postgres)}。${input.postgres.note ?? input.postgres.why}`
        : "外部事项中未找到 PostgreSQL 实例记录。",
      action:
        input.persistence.databaseConfigured || input.postgres?.status === "ready"
          ? "保留实例配置、地域、规格、备份策略和访问白名单记录。"
          : "先创建正式 PostgreSQL 实例，确认地域、规格、备份策略和生产访问白名单。",
      evidence:
        provisionEvidence ??
        input.postgres?.evidenceNote ??
        input.postgres?.evidenceUrl ??
        input.postgres?.receiptNo ??
        "云数据库实例截图、连接信息脱敏截图和备份策略截图。",
    },
    {
      id: "connection",
      order: 2,
      title: "配置生产 DATABASE_URL",
      status: input.dbEnv?.status ?? (input.persistence.databaseConfigured ? "ready" : "blocking"),
      owner: "技术 / 运维",
      detail: input.dbEnv
        ? `${input.dbEnv.stateLabel}；当前值：${input.dbEnv.displayValue}。`
        : input.persistence.databaseConfigured
          ? "运行时已读取到 DATABASE_URL。"
          : "运行时没有读取到 DATABASE_URL。",
      action:
        input.dbEnv?.action ??
        "把生产 PostgreSQL 连接串写入部署平台环境变量，避免提交到代码仓库。",
      evidence:
        connectionEvidence ??
        "部署平台环境变量截图只展示键名和脱敏状态，不能保存真实连接串明文。",
      command: "npm run launch:db-check",
    },
    {
      id: "schema",
      order: 3,
      title: "生成 Prisma Client 并部署 Migration",
      status: schemaStatus(input.persistence),
      owner: "技术",
      detail:
        input.persistence.storeMode === "database"
          ? "当前 UsageLog 查询已走 PostgreSQL。"
          : "当前业务数据还没有命中 PostgreSQL 持久化。",
      action:
        input.persistence.storeMode === "database"
          ? "保留 migration deploy 日志；正式上线前再对生产库执行一次只读核对。"
          : "先在生产连接串可用后执行 Prisma 生成和 migration deploy，再重启应用。",
      evidence:
        schemaEvidence ?? "Prisma 命令输出、部署日志和数据库表结构已创建记录。",
      command: "npm run prisma:generate && npm run prisma:migrate:deploy",
    },
    {
      id: "probe",
      order: 4,
      title: "运行后台落库探针",
      status: probeStatus(input.persistence),
      owner: "技术 / 产品",
      detail: `最近探针：${lastProbeLabel}；探针记录 ${input.persistence.probeCount} 条。`,
      action:
        input.persistence.lastProbe?.writeVerified && input.persistence.lastProbe.readVerified
          ? "正式收费前再运行一次探针，确认写入和读回仍然通过。"
          : "在 /admin/health 点击运行落库探针，或调用 POST /api/admin/persistence/probe。",
      evidence:
        probeEvidence ??
        "/api/admin/persistence/probe 返回 ok=true，后台显示 PostgreSQL 读写验收通过。",
      command: "curl -X POST \"https://<your-domain>/api/admin/persistence/probe?token=<admin-token>\"",
    },
    {
      id: "coverage",
      order: 5,
      title: "补齐上线关键事件持久化",
      status: coverageStatus(input.persistence),
      owner: "产品 / 技术 / 运营",
      detail: `必要事件 ${input.persistence.featureCoverage.covered}/${input.persistence.featureCoverage.required} 已有 PostgreSQL 记录，缺口 ${input.persistence.featureCoverage.missingRequired} 类。`,
      action:
        input.persistence.featureCoverage.missingRequired > 0
          ? "依次完成外部事项更新、本周承诺保存、第三方诊断、上线证据归档，让必要事件都有 PostgreSQL 快照。"
          : "保留关键事件快照；正式收费前确认最近记录仍然有效。",
      evidence: coverageEvidence ?? "上线事件持久化区域显示必要事件覆盖无缺口。",
    },
    {
      id: "backup",
      order: 6,
      title: "确认备份与回滚口径",
      status: backupStatus({
        persistence: input.persistence,
        postgres: input.postgres,
        backupEvidence,
        restoreEvidence,
      }),
      owner: "技术 / 运维 / 财务",
      detail:
        backupEvidenceLabel || restoreEvidenceLabel
          ? [backupEvidenceLabel, restoreEvidenceLabel].filter(Boolean).join("；")
          : input.postgres?.evidenceNote || input.postgres?.evidenceUrl || input.postgres?.receiptNo
          ? "外部事项已记录数据库证据，可继续补充备份策略和恢复演练记录。"
          : "生产收费前需要确认自动备份、保留周期、恢复方式和支付事故回滚口径。",
      action:
        input.persistence.status === "ready"
          ? "补一份自动备份截图和恢复演练记录，再归档到外部事项证据中。"
          : "数据库读写验收通过后，补充备份策略、恢复演练和上线前快照记录。",
      evidence:
        [backupEvidenceLabel, restoreEvidenceLabel].filter(Boolean).join("；") ||
        "自动备份策略截图、恢复演练记录、上线前快照或备份编号。",
    },
  ] satisfies LaunchDatabasePlanStep[];
}

function buildCommandGroups() {
  return [
    {
      title: "部署前本地校验",
      when: "改完环境变量和 Prisma 配置后先跑。",
      commands: [
        {
          label: "类型检查",
          command: "npm run typecheck",
          detail: "确认 Prisma 类型、API route 和后台页面都能通过 TypeScript。",
        },
        {
          label: "Lint",
          command: "npm run lint",
          detail: "确认代码风格和 React/Next 规则没有新问题。",
        },
        {
          label: "生产构建",
          command: "npm run build",
          detail: "确认 Next 16 生产构建能生成所有动态路由。",
        },
      ],
    },
    {
      title: "生产 Schema 同步",
      when: "生产 DATABASE_URL 已写入部署平台或临时 shell 后执行。",
      commands: [
        {
          label: "连接串检查",
          command: "npm run launch:db-check",
          detail: "确认 DATABASE_URL 不是占位值、本地地址或格式错误，并能连接 PostgreSQL。",
        },
        {
          label: "生成 Prisma Client",
          command: "npm run prisma:generate",
          detail: "生成当前 schema 对应的 Prisma client。",
        },
        {
          label: "部署数据库迁移",
          command: "npm run prisma:migrate:deploy",
          detail: "生产环境只执行已提交的 migration，不使用 db push 改表。",
        },
        {
          label: "核心表检查",
          command: "npm run launch:db-check -- --schema",
          detail: "确认 User、Order、Report、UsageLog 等 Prisma 核心表已存在。",
        },
      ],
    },
    {
      title: "上线前验收",
      when: "生产应用重启并读取新环境变量后执行。",
      commands: [
        {
          label: "上线预检",
          command: "npm run launch:preflight",
          detail: "确认 DATABASE_URL、后台 token、支付、七牛、OpenAI 和主体备案阻断项。",
        },
        {
          label: "落库探针",
          command: "POST /api/admin/persistence/probe",
          detail: "写入并读回 UsageLog，确认不是内存回退。",
        },
        {
          label: "归档上线证据",
          command: "POST /api/admin/launch/evidence",
          detail: "把 Go/No-Go、Runbook、落库和第三方诊断摘要写入 PostgreSQL。",
        },
      ],
    },
  ] satisfies LaunchDatabasePlanCommandGroup[];
}

function labelFor(status: HealthStatus, summary: LaunchDatabasePlan["summary"]) {
  if (status === "blocking") {
    return `生产数据库未闭合：${summary.blocking} 个阻断步骤`;
  }

  if (status === "warning") {
    return `生产数据库待复核：${summary.warning} 个步骤`;
  }

  return "生产数据库已可支撑收费灰度";
}

function detailFor(input: {
  status: HealthStatus;
  persistence: PersistenceReadiness;
}) {
  if (input.status === "ready") {
    return "生产 PostgreSQL、Schema、落库探针、上线关键事件和备份证据均已形成闭环。";
  }

  if (!input.persistence.databaseConfigured) {
    return "当前还没有生产 DATABASE_URL，订单、会员、钱包、报告和后台审计仍有重启丢失风险。";
  }

  if (input.persistence.storeMode !== "database") {
    return "已配置 DATABASE_URL，但当前运行时没有进入 PostgreSQL 持久化，需要检查连接、网络、账号或 Schema。";
  }

  return input.persistence.detail;
}

function buildCopyText(input: {
  generatedAt: string;
  label: string;
  status: HealthStatus;
  steps: LaunchDatabasePlanStep[];
  commandGroups: LaunchDatabasePlanCommandGroup[];
  evidenceSummary: LaunchDatabaseAcceptanceEvidenceSummary;
}) {
  const stepLines = input.steps.map(
    (step) =>
      `${step.order}. [${statusLabel(step.status)}] ${step.title} / ${step.owner}：${step.action} 验收：${step.evidence}`,
  );
  const commandLines = input.commandGroups.flatMap((group) => [
    `- ${group.title}：${group.when}`,
    ...group.commands.map((command) => `  ${command.label}: ${command.command}`),
  ]);

  return [
    "玄机 AI 生产数据库落地计划",
    `生成时间：${input.generatedAt.slice(0, 16).replace("T", " ")}`,
    `状态：${input.label} (${input.status})`,
    `数据库验收证据：${input.evidenceSummary.readyItems}/${input.evidenceSummary.trackedItems} 个条目已通过，最近证据 ${dateLabel(input.evidenceSummary.latestEvidenceAt)}`,
    "",
    "步骤：",
    ...stepLines,
    "",
    "命令：",
    ...commandLines,
  ].join("\n");
}

export async function getLaunchDatabasePlan(input?: LaunchDatabasePlanInput) {
  const [persistence, envChecklist, externalReadiness, evidenceRecords] = await Promise.all([
    input?.persistenceReadiness ?? getPersistenceReadiness(),
    input?.envChecklist ?? getLaunchEnvChecklist(),
    input?.externalReadiness ?? getLaunchExternalReadiness(),
    input?.evidenceRecords ?? getLaunchDatabaseAcceptanceEvidenceRecords({ take: 80 }),
  ]);
  const generatedAt = new Date().toISOString();
  const dbEnv = databaseEnv(envChecklist);
  const postgres = postgresExternal(externalReadiness);
  const evidenceSummary = summarizeLaunchDatabaseAcceptanceEvidenceRecords(evidenceRecords);
  const steps = buildSteps({ persistence, dbEnv, postgres, evidenceRecords }).sort(
    (a, b) => a.order - b.order,
  );
  const summary = summarize(steps);
  const status = planStatus(summary);
  const label = labelFor(status, summary);
  const commandGroups = buildCommandGroups();

  return {
    generatedAt,
    status,
    label,
    detail: detailFor({ status, persistence }),
    action: steps.find((step) => step.status !== "ready")?.action ?? persistence.action,
    summary,
    database: {
      configured: persistence.databaseConfigured,
      storeMode: persistence.storeMode,
      prismaUnavailable: persistence.prismaUnavailable,
      requiredEventCoverage: `${persistence.featureCoverage.covered}/${persistence.featureCoverage.required}`,
      lastProbeLabel: persistence.lastProbe
        ? persistence.lastProbe.verifiedAt ?? persistence.lastProbe.createdAt
        : "未运行",
      externalStatusLabel: externalLabel(postgres),
      evidenceRecordCount: evidenceSummary.total,
      latestEvidenceAt: evidenceSummary.latestEvidenceAt,
    },
    evidenceSummary,
    evidenceRecords,
    steps,
    nextSteps: steps
      .filter((step) => step.status !== "ready")
      .sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.order - b.order)
      .slice(0, 4),
    commandGroups,
    evidence: [
      "生产 PostgreSQL 实例、地域、规格和访问白名单截图。",
      "DATABASE_URL 在部署平台的脱敏配置截图。",
      "Prisma 生成和 Schema 同步命令输出。",
      "落库探针 ok=true 的后台截图或 API 响应。",
      "上线关键事件持久化覆盖无缺口截图。",
      "自动备份策略、恢复演练或上线前快照记录。",
    ],
    copyText: buildCopyText({
      generatedAt,
      label,
      status,
      steps,
      commandGroups,
      evidenceSummary,
    }),
  } satisfies LaunchDatabasePlan;
}
