import "server-only";

import { randomUUID } from "crypto";
import type { HealthStatus } from "@/lib/health-checks";
import {
  getPrismaRuntimeState,
  isDatabaseUnavailableError,
  retryPrismaConnection,
  tryPrisma,
} from "@/lib/prisma";
import { launchDatabaseAcceptanceEvidenceFeature } from "@/lib/launch-database-acceptance";
import { launchDeploymentAcceptanceEvidenceFeature } from "@/lib/launch-deployment-acceptance";
import { launchAiStorageAcceptanceEvidenceFeature } from "@/lib/launch-ai-storage-acceptance";
import { launchDailyActionProgressFeature } from "@/lib/launch-daily-action-progress";
import { launchGoalProgressFeature } from "@/lib/launch-goal-progress";
import { launchUnitEconomicsSampleFeature } from "@/lib/launch-unit-economics-sample";
import {
  getUsageLogsByFeature,
  getUsageLogStoreStatus,
  type UsageLogRecord,
  type UsageLogStoreMode,
} from "@/lib/usage-log-store";

export const persistenceProbeFeature = "persistence_probe";

export type PersistenceReadinessItem = {
  label: string;
  value: string;
  detail: string;
  status: HealthStatus;
};

export type PersistenceFeatureCoverageItem = {
  feature: string;
  label: string;
  purpose: string;
  count: number;
  required: boolean;
  status: HealthStatus;
  action: string;
};

export type PersistenceFeatureCoverage = {
  total: number;
  required: number;
  covered: number;
  missingRequired: number;
  items: PersistenceFeatureCoverageItem[];
};

export type PersistenceReadiness = {
  status: HealthStatus;
  label: string;
  detail: string;
  action: string;
  databaseConfigured: boolean;
  storeMode: UsageLogStoreMode;
  prismaUnavailable: boolean;
  probeCount: number;
  featureCoverage: PersistenceFeatureCoverage;
  lastProbe?: {
    id: string;
    probeId?: string;
    createdAt: string;
    verifiedAt?: string;
    writeVerified: boolean;
    readVerified: boolean;
  };
  items: PersistenceReadinessItem[];
};

export type PersistenceProbeRun = PersistenceReadiness & {
  probe: {
    attempted: boolean;
    ok: boolean;
    canWrite: boolean;
    canRead: boolean;
    id?: string;
    probeId?: string;
    message: string;
  };
};

type ProbeMetadata = {
  event: "persistence_probe";
  probeId: string;
  requestedAt: string;
  verifiedAt?: string;
  writeVerified?: boolean;
  readVerified?: boolean;
  storeMode?: UsageLogStoreMode;
  path?: string;
  userAgent?: string;
};

const launchPersistenceFeatures = [
  {
    feature: persistenceProbeFeature,
    label: "落库探针",
    purpose: "确认 UsageLog 能写入并读回 PostgreSQL。",
    required: true,
  },
  {
    feature: "integration_probe",
    label: "第三方诊断",
    purpose: "保存 OpenAI、七牛、支付宝和微信支付联调结果。",
    required: true,
  },
  {
    feature: "launch_external_readiness",
    label: "外部事项",
    purpose: "保存主体、域名、备案、支付商户和云服务办理状态。",
    required: true,
  },
  {
    feature: "launch_weekly_commitments",
    label: "本周承诺",
    purpose: "保存本周上线任务的目标日期、负责人、证据和推进状态。",
    required: true,
  },
  {
    feature: launchDailyActionProgressFeature,
    label: "今日动作执行记录",
    purpose: "保存今日优先动作的处理状态、负责人、证据备注和推进备注。",
    required: true,
  },
  {
    feature: launchGoalProgressFeature,
    label: "目标推进记录",
    purpose: "保存 30/60/90 天阶段目标日、负责人、推进状态和证据备注。",
    required: true,
  },
  {
    feature: "launch_acceptance_evidence",
    label: "端到端验收证据",
    purpose: "保存主链路手测截图、录屏、验收人和复核备注。",
    required: true,
  },
  {
    feature: "launch_payment_acceptance_evidence",
    label: "支付验收证据",
    purpose: "保存真实支付小额订单、平台交易号、权益到账和对账凭证。",
    required: true,
  },
  {
    feature: launchUnitEconomicsSampleFeature,
    label: "AI 成本样本",
    purpose: "保存模型、tokens、成本金额和账单证据，支撑单次毛利复盘。",
    required: true,
  },
  {
    feature: launchAiStorageAcceptanceEvidenceFeature,
    label: "AI/图片验收证据",
    purpose: "保存 OpenAI、七牛、手相视觉、深度报告和成本样本联调证据。",
    required: true,
  },
  {
    feature: launchDatabaseAcceptanceEvidenceFeature,
    label: "数据库验收证据",
    purpose: "保存连接、迁移、备份和恢复演练证据，支撑生产库上线复核。",
    required: true,
  },
  {
    feature: launchDeploymentAcceptanceEvidenceFeature,
    label: "部署验收证据",
    purpose: "保存正式域名、生产变量、后台保护、回调、预检和页面烟测证据。",
    required: true,
  },
  {
    feature: "launch_evidence",
    label: "上线证据",
    purpose: "归档 Go/No-Go、Runbook、落库、支付验收、AI 成本和第三方诊断摘要。",
    required: true,
  },
  {
    feature: "admin_action",
    label: "后台审计",
    purpose: "记录后台重试、补偿、导出和上线推进更新操作。",
    required: false,
  },
] as const;

const launchPersistenceFeatureIds = launchPersistenceFeatures.map((item) => item.feature);

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as never;
}

function modeLabel(mode: UsageLogStoreMode) {
  if (mode === "database") {
    return "PostgreSQL";
  }

  if (mode === "memory_fallback") {
    return "数据库不可用";
  }

  return "进程内存";
}

function statusLabel(status: HealthStatus) {
  if (status === "ready") {
    return "落库已验收";
  }

  if (status === "warning") {
    return "待写入探针";
  }

  return "未达到生产落库";
}

function buildFeatureCoverage(input: {
  featureCounts: Record<string, number>;
  storeMode: UsageLogStoreMode;
}) {
  const items = launchPersistenceFeatures.map((item) => {
    const count = input.featureCounts[item.feature] ?? 0;
    const status: HealthStatus =
      input.storeMode !== "database"
        ? item.required
          ? "blocking"
          : "warning"
        : count > 0
          ? "ready"
          : "warning";

    return {
      ...item,
      count,
      status,
      action:
        input.storeMode !== "database"
          ? `恢复 PostgreSQL 后重新完成${item.label}保存或归档。`
          : count > 0
          ? "保留记录并在正式收费前确认最近一次结果有效。"
          : item.feature === persistenceProbeFeature
            ? "运行后台 PostgreSQL 读写探针。"
            : `在后台完成一次${item.label}保存或归档。`,
    } satisfies PersistenceFeatureCoverageItem;
  });
  const requiredItems = items.filter((item) => item.required);
  const coveredRequired = requiredItems.filter((item) => item.status === "ready").length;

  return {
    total: items.length,
    required: requiredItems.length,
    covered: coveredRequired,
    missingRequired: requiredItems.length - coveredRequired,
    items,
  } satisfies PersistenceFeatureCoverage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function readProbeMetadata(log: UsageLogRecord): ProbeMetadata | undefined {
  if (log.feature !== persistenceProbeFeature || !isRecord(log.metadata)) {
    return undefined;
  }

  const probeId = readString(log.metadata.probeId);

  if (log.metadata.event !== "persistence_probe" || !probeId) {
    return undefined;
  }

  const storeMode =
    log.metadata.storeMode === "database" ||
    log.metadata.storeMode === "memory" ||
    log.metadata.storeMode === "memory_fallback"
      ? log.metadata.storeMode
      : undefined;

  return {
    event: "persistence_probe",
    probeId,
    requestedAt: readString(log.metadata.requestedAt) ?? log.createdAt,
    verifiedAt: readString(log.metadata.verifiedAt),
    writeVerified: readBoolean(log.metadata.writeVerified),
    readVerified: readBoolean(log.metadata.readVerified),
    storeMode,
    path: readString(log.metadata.path),
    userAgent: readString(log.metadata.userAgent),
  };
}

function buildLastProbe(log: UsageLogRecord | undefined, storeMode: UsageLogStoreMode) {
  if (!log) {
    return undefined;
  }

  const metadata = readProbeMetadata(log);
  const storedInDatabase = storeMode === "database";
  const writeVerified = storedInDatabase && (metadata?.writeVerified ?? true);
  const readVerified = storedInDatabase && (metadata?.readVerified ?? true);

  return {
    id: log.id,
    probeId: metadata?.probeId,
    createdAt: log.createdAt,
    verifiedAt: metadata?.verifiedAt,
    writeVerified,
    readVerified,
  };
}

function buildReadiness(input: {
  databaseConfigured: boolean;
  storeMode: UsageLogStoreMode;
  prismaUnavailable: boolean;
  probeCount: number;
  featureCounts: Record<string, number>;
  lastProbe?: PersistenceReadiness["lastProbe"];
}) {
  const featureCoverage = buildFeatureCoverage({
    featureCounts: input.featureCounts,
    storeMode: input.storeMode,
  });
  const lastProbeOk = Boolean(input.lastProbe?.writeVerified && input.lastProbe.readVerified);
  const status: HealthStatus = !input.databaseConfigured
    ? "blocking"
    : input.storeMode !== "database"
      ? "blocking"
      : lastProbeOk
        ? featureCoverage.missingRequired > 0
          ? "warning"
          : "ready"
        : "warning";
  const label = statusLabel(status);
  const detail =
    status === "ready"
      ? "UsageLog 已完成 PostgreSQL 写入和读回验证，可支撑付费订单、会员档案、报告和运营审计恢复。"
      : !input.databaseConfigured
        ? "当前未配置 DATABASE_URL，仅适合开发演示；生产关键业务会阻断。"
        : input.storeMode !== "database"
          ? "已配置 DATABASE_URL，但 Prisma 当前不可用；生产关键业务已阻断，避免写入不可恢复的内存数据。"
          : lastProbeOk && featureCoverage.missingRequired > 0
            ? `数据库读写已通过，但还有 ${featureCoverage.missingRequired} 类上线关键事件没有 PostgreSQL 记录。`
          : "数据库可读，但还没有完成后台写入探针验收。";
  const action =
    status === "ready"
      ? "保持生产库备份与迁移流程；支付上线前再跑一次探针并确认无回退。"
      : !input.databaseConfigured
        ? "配置生产 PostgreSQL 的 DATABASE_URL，执行 Prisma 迁移后运行落库探针。"
        : input.storeMode !== "database"
          ? "检查数据库网络、账号、Schema 和迁移状态，恢复后点击后台探针重新验收。"
          : lastProbeOk && featureCoverage.missingRequired > 0
            ? "补齐外部事项、本周承诺、第三方诊断和上线证据归档，让关键运营事件都有 PostgreSQL 快照。"
          : "点击运行落库探针，写入并读回一条内部 UsageLog。";
  const lastProbeValue = input.lastProbe
    ? input.lastProbe.verifiedAt ?? input.lastProbe.createdAt
    : "未运行";

  return {
    status,
    label,
    detail,
    action,
    databaseConfigured: input.databaseConfigured,
    storeMode: input.storeMode,
    prismaUnavailable: input.prismaUnavailable,
    probeCount: input.probeCount,
    featureCoverage,
    lastProbe: input.lastProbe,
    items: [
      {
        label: "DATABASE_URL",
        value: input.databaseConfigured ? "已配置" : "未配置",
        detail: input.databaseConfigured
          ? "生产库连接字符串存在。"
          : "没有数据库连接字符串时只能使用内存模式。",
        status: input.databaseConfigured ? "ready" : "blocking",
      },
      {
        label: "当前存储模式",
        value: modeLabel(input.storeMode),
        detail:
          input.storeMode === "database"
            ? "UsageLog 查询已走 PostgreSQL。"
            : "当前请求未命中真实数据库持久化；生产关键业务不会继续内存降级。",
        status: input.storeMode === "database" ? "ready" : "blocking",
      },
      {
        label: "Prisma 状态",
        value: input.prismaUnavailable ? "已降级" : "可尝试连接",
        detail: input.prismaUnavailable
          ? "当前进程已标记 Prisma 不可用。"
          : "当前进程未锁定数据库降级状态。",
        status: input.prismaUnavailable ? "blocking" : "ready",
      },
      {
        label: "探针记录",
        value: `${input.probeCount} 条`,
        detail: "内部探针写入 UsageLog，用于确认服务重启前后的运营数据可恢复。",
        status: input.probeCount > 0 ? "ready" : "warning",
      },
      {
        label: "最近读写验收",
        value: lastProbeValue,
        detail: input.lastProbe
          ? input.lastProbe.writeVerified && input.lastProbe.readVerified
            ? "最近一次探针已写入并读回。"
            : "最近一次探针没有完成读写双验。"
          : "尚未运行后台写入探针。",
        status: lastProbeOk ? "ready" : "warning",
      },
      {
        label: "上线事件覆盖",
        value: `${featureCoverage.covered}/${featureCoverage.required}`,
        detail:
          featureCoverage.missingRequired > 0
            ? `还有 ${featureCoverage.missingRequired} 类关键上线事件缺少持久化记录。`
            : "关键上线事件均已有持久化记录。",
        status:
          input.storeMode !== "database"
            ? "blocking"
            : featureCoverage.missingRequired > 0
              ? "warning"
              : "ready",
      },
    ],
  } satisfies PersistenceReadiness;
}

function requestPath(request: Request | undefined) {
  return request ? new URL(request.url).pathname : undefined;
}

function readHeader(request: Request | undefined, name: string) {
  return request?.headers.get(name) ?? undefined;
}

export async function getPersistenceReadiness() {
  const storeStatus = await getUsageLogStoreStatus(launchPersistenceFeatureIds);
  let probeLogs: UsageLogRecord[] = [];

  try {
    probeLogs = await getUsageLogsByFeature(persistenceProbeFeature, { take: 1 });
  } catch (error) {
    if (!isDatabaseUnavailableError(error)) {
      throw error;
    }
  }

  const runtime = getPrismaRuntimeState();
  const storeMode =
    runtime.unavailable && storeStatus.databaseConfigured ? "memory_fallback" : storeStatus.mode;
  const lastProbe = buildLastProbe(probeLogs[0], storeMode);

  return buildReadiness({
    databaseConfigured: storeStatus.databaseConfigured,
    storeMode,
    prismaUnavailable: runtime.unavailable,
    probeCount: storeStatus.featureCounts[persistenceProbeFeature] ?? 0,
    featureCounts: storeStatus.featureCounts,
    lastProbe,
  });
}

export async function runPersistenceProbe(input: { request?: Request } = {}) {
  const runtime = getPrismaRuntimeState();

  if (!runtime.databaseConfigured) {
    const readiness = await getPersistenceReadiness();

    return {
      ...readiness,
      probe: {
        attempted: false,
        ok: false,
        canWrite: false,
        canRead: false,
        message: "未配置 DATABASE_URL，无法运行生产落库探针。",
      },
    } satisfies PersistenceProbeRun;
  }

  if (runtime.unavailable) {
    retryPrismaConnection();
  }

  const probeId = `probe_${randomUUID()}`;
  const requestedAt = new Date().toISOString();
  const baseMetadata: ProbeMetadata = {
    event: "persistence_probe",
    probeId,
    requestedAt,
    path: requestPath(input.request),
    userAgent: readHeader(input.request, "user-agent"),
  };
  const dbResult = await tryPrisma(async (prisma) => {
    const created = await prisma.usageLog.create({
      data: {
        provider: "internal",
        model: "persistence-readiness",
        feature: persistenceProbeFeature,
        imageCount: 0,
        costCents: 0,
        metadata: toJsonValue(baseMetadata),
      },
    });
    const readBack = await prisma.usageLog.findUnique({ where: { id: created.id } });
    const verifiedAt = new Date().toISOString();
    const metadata: ProbeMetadata = {
      ...baseMetadata,
      verifiedAt,
      writeVerified: true,
      readVerified: Boolean(readBack),
      storeMode: "database",
    };

    await prisma.usageLog.update({
      where: { id: created.id },
      data: { metadata: toJsonValue(metadata) },
    });

    const probeCount = await prisma.usageLog.count({
      where: { feature: persistenceProbeFeature },
    });
    const featureCountEntries = await Promise.all(
      launchPersistenceFeatureIds.map(async (feature) => [
        feature,
        await prisma.usageLog.count({ where: { feature } }),
      ] as const),
    );

    return {
      id: created.id,
      createdAt: created.createdAt.toISOString(),
      verifiedAt,
      readVerified: Boolean(readBack),
      probeCount,
      featureCounts: Object.fromEntries(featureCountEntries),
    };
  });

  if (!dbResult.ok) {
    const readiness = await getPersistenceReadiness();

    return {
      ...readiness,
      probe: {
        attempted: true,
        ok: false,
        canWrite: false,
        canRead: false,
        probeId,
        message: "数据库写入失败，已保持内存降级状态。",
      },
    } satisfies PersistenceProbeRun;
  }

  const readiness = buildReadiness({
    databaseConfigured: true,
    storeMode: "database",
    prismaUnavailable: false,
    probeCount: dbResult.value.probeCount,
    featureCounts: dbResult.value.featureCounts,
    lastProbe: {
      id: dbResult.value.id,
      probeId,
      createdAt: dbResult.value.createdAt,
      verifiedAt: dbResult.value.verifiedAt,
      writeVerified: true,
      readVerified: dbResult.value.readVerified,
    },
  });

  return {
    ...readiness,
    probe: {
      attempted: true,
      ok: dbResult.value.readVerified,
      canWrite: true,
      canRead: dbResult.value.readVerified,
      id: dbResult.value.id,
      probeId,
      message: dbResult.value.readVerified
        ? "生产落库探针已写入并读回。"
        : "探针已写入，但读回验证失败。",
    },
  } satisfies PersistenceProbeRun;
}
