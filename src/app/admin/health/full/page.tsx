import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  Database,
  Sparkles,
} from "lucide-react";
import { getAdminAccess } from "@/lib/admin-auth";
import { getProductionHealthChecks, summarizeHealth, type HealthStatus } from "@/lib/health-checks";
import { getIntegrationDiagnostics } from "@/lib/integration-diagnostics";
import { getLaunchAcceptanceMatrix } from "@/lib/launch-acceptance";
import { getLaunchAiStoragePlan } from "@/lib/launch-ai-storage-plan";
import { getLaunchApplicationPack } from "@/lib/launch-application-pack";
import { getLaunchBlockerDashboard } from "@/lib/launch-blocker-dashboard";
import { getLaunchBusinessModel } from "@/lib/launch-business-model";
import { getLaunchCallbackChecklist } from "@/lib/launch-callbacks";
import { getLaunchComplianceChecklist } from "@/lib/launch-compliance";
import { getLaunchCompliancePlan } from "@/lib/launch-compliance-plan";
import { getLaunchDatabasePlan } from "@/lib/launch-database-plan";
import { getLaunchDailyBrief } from "@/lib/launch-daily-brief";
import { getLaunchDecision } from "@/lib/launch-decision";
import { getLaunchDeploymentPlan } from "@/lib/launch-deployment-plan";
import { getLaunchEnvBatchPlan } from "@/lib/launch-env-batch-plan";
import { getLaunchEnvChecklist } from "@/lib/launch-env-checklist";
import { getLaunchEnvDraft } from "@/lib/launch-env-draft";
import { getLaunchEvidenceArchives } from "@/lib/launch-evidence";
import { getLaunchEvidenceActionCenter } from "@/lib/launch-evidence-action-center";
import { getLaunchEvidenceGap, type LaunchEvidenceGapKind } from "@/lib/launch-evidence-gap";
import { getLaunchFounderDossier } from "@/lib/launch-founder-dossier";
import { getLaunchGoalFollowup } from "@/lib/launch-goal-followup";
import { getLaunchGoalPlan } from "@/lib/launch-goal-plan";
import { snapshotLaunchGoalTransitionGate } from "@/lib/launch-goal-transition-gate";
import { getLaunchHandoff } from "@/lib/launch-handoff";
import { getLaunchIntegrationSchedule } from "@/lib/launch-integration-schedule";
import { getLaunchMaterialPack } from "@/lib/launch-materials";
import { getLaunchOfflineActionPack } from "@/lib/launch-offline-action-pack";
import { getLaunchPackage } from "@/lib/launch-package";
import { getLaunchPaymentAcceptance } from "@/lib/launch-payment-acceptance";
import { getLaunchPaymentPlan } from "@/lib/launch-payment-plan";
import { getLaunchProductionGate } from "@/lib/launch-production-gate";
import { getLaunchRolloutPlan } from "@/lib/launch-rollout";
import { getLaunchScheduleRisk } from "@/lib/launch-schedule";
import { getLaunchUnitEconomics } from "@/lib/launch-unit-economics";
import { getLaunchWeeklyFocus } from "@/lib/launch-weekly-focus";
import type { LaunchWeeklyCommitmentStatus } from "@/lib/launch-weekly-commitments";
import { getLaunchWorkplan } from "@/lib/launch-workplan";
import { getLivePaymentLaunchGate } from "@/lib/live-payment-launch-gate";
import { getPersistenceReadiness } from "@/lib/persistence-readiness";
import { createLoginHref } from "@/lib/return-to";
import { brand } from "@/lib/site";
import { AdminIntegrationProbeActions } from "../../integration-probe-actions";
import { AdminLaunchAcceptanceEvidenceForm } from "../../launch-acceptance-evidence-form";
import { AdminLaunchAiStorageAcceptanceEvidenceForm } from "../../launch-ai-storage-acceptance-evidence-form";
import { AdminLaunchDatabaseAcceptanceEvidenceForm } from "../../launch-database-acceptance-evidence-form";
import { AdminLaunchDeploymentAcceptanceEvidenceForm } from "../../launch-deployment-acceptance-evidence-form";
import { AdminLaunchDailyActionProgressForm } from "../../launch-daily-action-progress-form";
import { AdminLaunchEvidenceActions } from "../../launch-evidence-actions";
import { AdminLaunchExternalReadinessForm } from "../../launch-external-readiness-form";
import { AdminLaunchGoalProgressForm } from "../../launch-goal-progress-form";
import {
  AdminLaunchOfflineActionQueueForm,
  AdminLaunchOfflineActionQuickForm,
} from "../../launch-offline-action-quick-form";
import { AdminLaunchPaymentAcceptanceEvidenceForm } from "../../launch-payment-acceptance-evidence-form";
import { AdminLaunchUnitEconomicsSampleForm } from "../../launch-unit-economics-sample-form";
import { AdminLaunchWeeklyFocusForm } from "../../launch-weekly-focus-form";
import { AdminPersistenceProbeActions } from "../../persistence-probe-actions";

function statusStyle(status: HealthStatus) {
  if (status === "ready") {
    return {
      label: "ready",
      className: "border-[#3c8b72] bg-[#3c8b72]/10 text-[#cfe9df]",
      icon: CheckCircle2,
    };
  }

  if (status === "blocking") {
    return {
      label: "blocking",
      className: "border-[#b34c32] bg-[#b34c32]/10 text-[#f0d2c8]",
      icon: AlertTriangle,
    };
  }

  return {
    label: "warning",
    className: "border-[#c8a15a] bg-[#c8a15a]/10 text-[#f0d49a]",
    icon: CircleDashed,
  };
}

function commitmentStatusLabel(status?: LaunchWeeklyCommitmentStatus) {
  if (status === "in_progress") {
    return "处理中";
  }

  if (status === "blocked") {
    return "卡住";
  }

  if (status === "done") {
    return "已完成";
  }

  return "未开始";
}

function evidenceKindLabel(kind: LaunchEvidenceGapKind) {
  if (kind === "receipt") {
    return "平台回执";
  }

  if (kind === "small_order") {
    return "小额订单";
  }

  if (kind === "cost_sample") {
    return "成本样本";
  }

  if (kind === "archive") {
    return "后台归档";
  }

  if (kind === "admin_record") {
    return "后台记录";
  }

  return "截图/录屏";
}

function yuanLabel(cents: number | undefined) {
  if (cents === undefined) {
    return "待估";
  }

  return `${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)} 元`;
}

function percentLabel(value: number | undefined) {
  if (value === undefined) {
    return "暂无";
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function multipleLabel(value: number | undefined) {
  if (value === undefined) {
    return "暂无";
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)}x`;
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
  const [
    persistenceReadiness,
    integrationDiagnostics,
    launchPackage,
    launchEvidenceArchives,
    launchMaterials,
    launchEnvChecklist,
    launchHandoff,
    launchWorkplan,
    launchRollout,
    launchSchedule,
    launchCallbacks,
    launchAcceptance,
    launchPaymentAcceptance,
    launchEnvDraft,
    launchCompliance,
    launchUnitEconomics,
  ] = await Promise.all([
    getPersistenceReadiness(),
    getIntegrationDiagnostics(),
    getLaunchPackage(),
    getLaunchEvidenceArchives({ take: 6 }),
    getLaunchMaterialPack(),
    getLaunchEnvChecklist(),
    getLaunchHandoff(),
    getLaunchWorkplan(),
    getLaunchRolloutPlan(),
    getLaunchScheduleRisk(),
    getLaunchCallbackChecklist(),
    getLaunchAcceptanceMatrix(),
    getLaunchPaymentAcceptance(),
    getLaunchEnvDraft(),
    getLaunchComplianceChecklist(),
    getLaunchUnitEconomics(),
  ]);
  const launchReadiness = launchPackage.goNoGo;
  const launchRunbook = launchPackage.runbook;
  const launchExternalReadiness = launchPackage.external;
  const launchBusinessModel = await getLaunchBusinessModel({
    unitEconomics: launchUnitEconomics,
  });
  const launchFounderDossier = await getLaunchFounderDossier({
    materials: launchMaterials,
  });
  const launchApplicationPack = await getLaunchApplicationPack({
    callbacks: launchCallbacks,
    materials: launchMaterials,
    founderDossier: launchFounderDossier,
  });
  const launchDeploymentPlan = await getLaunchDeploymentPlan({
    envChecklist: launchEnvChecklist,
    envDraft: launchEnvDraft,
    callbacks: launchCallbacks,
    externalReadiness: launchExternalReadiness,
    healthChecks: checks,
  });
  const launchCompliancePlan = await getLaunchCompliancePlan({
    compliance: launchCompliance,
    externalReadiness: launchExternalReadiness,
    applicationPack: launchApplicationPack,
    callbacks: launchCallbacks,
  });
  const launchWeeklyFocus = await getLaunchWeeklyFocus({
    workplan: launchWorkplan,
    schedule: launchSchedule,
    founderDossier: launchFounderDossier,
    applicationPack: launchApplicationPack,
    rollout: launchRollout,
  });
  const launchEvidenceGap = await getLaunchEvidenceGap({
    launchPackage,
    acceptance: launchAcceptance,
    paymentAcceptance: launchPaymentAcceptance,
    compliance: launchCompliance,
    applicationPack: launchApplicationPack,
    unitEconomics: launchUnitEconomics,
  });
  const launchEvidenceActionCenter = await getLaunchEvidenceActionCenter({
    evidenceGap: launchEvidenceGap,
  });
  const launchDatabasePlan = await getLaunchDatabasePlan({
    persistenceReadiness,
    envChecklist: launchEnvChecklist,
    externalReadiness: launchExternalReadiness,
  });
  const launchPaymentPlan = await getLaunchPaymentPlan({
    paymentAcceptance: launchPaymentAcceptance,
    applicationPack: launchApplicationPack,
    callbacks: launchCallbacks,
    integrationDiagnostics,
    externalReadiness: launchExternalReadiness,
  });
  const launchAiStoragePlan = await getLaunchAiStoragePlan({
    envChecklist: launchEnvChecklist,
    integrationDiagnostics,
    applicationPack: launchApplicationPack,
    callbacks: launchCallbacks,
    acceptance: launchAcceptance,
    externalReadiness: launchExternalReadiness,
    unitEconomics: launchUnitEconomics,
  });
  const launchProductionGate = await getLaunchProductionGate({
    envChecklist: launchEnvChecklist,
    databasePlan: launchDatabasePlan,
    deploymentPlan: launchDeploymentPlan,
    aiStoragePlan: launchAiStoragePlan,
    compliancePlan: launchCompliancePlan,
    paymentPlan: launchPaymentPlan,
  });
  const launchDecisionBase = await getLaunchDecision({
    launchPackage,
    productionGate: launchProductionGate,
    applicationPack: launchApplicationPack,
    envDraft: launchEnvDraft,
    paymentAcceptance: launchPaymentAcceptance,
    compliance: launchCompliance,
    unitEconomics: launchUnitEconomics,
    evidenceGap: launchEvidenceGap,
    rollout: launchRollout,
    schedule: launchSchedule,
    workplan: launchWorkplan,
  });
  const launchIntegrationSchedule = await getLaunchIntegrationSchedule({
    aiStoragePlan: launchAiStoragePlan,
    paymentPlan: launchPaymentPlan,
  });
  const launchEnvBatchPlan = await getLaunchEnvBatchPlan({
    envDraft: launchEnvDraft,
    materials: launchMaterials,
    callbacks: launchCallbacks,
  });
  const launchOfflineActionPack = await getLaunchOfflineActionPack({
    materials: launchMaterials,
    founderDossier: launchFounderDossier,
    applicationPack: launchApplicationPack,
    envBatchPlan: launchEnvBatchPlan,
    schedule: launchSchedule,
  });
  const launchGoalPlan = await getLaunchGoalPlan({
    decision: launchDecisionBase,
    weeklyFocus: launchWeeklyFocus,
    schedule: launchSchedule,
    rollout: launchRollout,
    evidenceGap: launchEvidenceGap,
    unitEconomics: launchUnitEconomics,
  });
  const launchDecision = await getLaunchDecision({
    launchPackage,
    productionGate: launchProductionGate,
    applicationPack: launchApplicationPack,
    envDraft: launchEnvDraft,
    paymentAcceptance: launchPaymentAcceptance,
    compliance: launchCompliance,
    unitEconomics: launchUnitEconomics,
    evidenceGap: launchEvidenceGap,
    rollout: launchRollout,
    schedule: launchSchedule,
    workplan: launchWorkplan,
    goalTransitionGate: snapshotLaunchGoalTransitionGate(launchGoalPlan.transitionGate),
  });
  const livePaymentGate = await getLivePaymentLaunchGate({
    decision: launchDecision,
  });
  const launchBlockerDashboard = await getLaunchBlockerDashboard({
    deploymentPlan: launchDeploymentPlan,
    compliancePlan: launchCompliancePlan,
    databasePlan: launchDatabasePlan,
    aiStoragePlan: launchAiStoragePlan,
    paymentPlan: launchPaymentPlan,
    productionGate: launchProductionGate,
    evidenceActionCenter: launchEvidenceActionCenter,
    goalPlan: launchGoalPlan,
  });
  const launchDailyBrief = await getLaunchDailyBrief({
    launchPackage,
    productionGate: launchProductionGate,
    blockerDashboard: launchBlockerDashboard,
    goalPlan: launchGoalPlan,
    weeklyFocus: launchWeeklyFocus,
    offlineActionPack: launchOfflineActionPack,
  });
  const launchGoalFollowup = await getLaunchGoalFollowup({
    goalPlan: launchGoalPlan,
    dailyBrief: launchDailyBrief,
    weeklyFocus: launchWeeklyFocus,
    evidenceActionCenter: launchEvidenceActionCenter,
  });
  const summary = summarizeHealth(checks);
  const adminToken = access.adminToken;
  const currentOfflineReadinessItem = launchExternalReadiness.items.find(
    (item) => item.id === launchOfflineActionPack.currentAction.id,
  );
  const externalReadinessById = new Map(
    launchExternalReadiness.items.map((item) => [item.id, item]),
  );
  const offlineActionQueue = launchOfflineActionPack.todayActions
    .slice(0, 5)
    .map((action) => {
      const item = externalReadinessById.get(action.id);

      if (!item) {
        return undefined;
      }

      return {
        item,
        title: action.title,
        phase: action.phase,
        owner: action.owner,
        evidencePlaceholder: action.evidence,
        suggestedTargetDate: action.suggestedTargetDate,
        scheduleLabel: action.scheduleLabel,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const groupedChecks = Object.entries(
    checks.reduce<Record<string, typeof checks>>((groups, check) => {
      groups[check.group] = [...(groups[check.group] ?? []), check];
      return groups;
    }, {}),
  );

  return (
    <main className="min-h-screen overflow-x-hidden break-words bg-[#080705] px-5 py-8 text-[#f5efe2] sm:px-8 [&_*]:min-w-0">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg border border-[#c8a15a]/55 bg-[#c8a15a]/10 text-[#f0d49a]">
            <Sparkles size={20} aria-hidden="true" />
          </span>
          <span>
            <span className="block font-ritual text-xl">{brand.cn}</span>
            <span className="block text-xs text-[#b9ad99]">{brand.en}</span>
          </span>
        </Link>
        <Link href="/admin" className="text-sm text-[#d8cab2] hover:text-[#f0d49a]">
          返回后台
        </Link>
      </div>

      <section className="mx-auto max-w-7xl py-12">
        <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold text-[#c8a15a]">上线自检</p>
            <h1 className="mt-3 font-ritual text-5xl leading-tight text-[#fff7e8]">
              生产环境清单
            </h1>
            <p className="mt-5 leading-8 text-[#b9ad99]">
              检查正式上线前必须补齐的密钥、数据库、支付、存储和合规配置。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-[#3c8b72] bg-[#3c8b72]/10 p-4 text-center">
              <p className="text-2xl font-semibold text-[#cfe9df]">{summary.ready}</p>
              <p className="text-xs text-[#b9ad99]">ready</p>
            </div>
            <div className="rounded-lg border border-[#c8a15a] bg-[#c8a15a]/10 p-4 text-center">
              <p className="text-2xl font-semibold text-[#f0d49a]">{summary.warning}</p>
              <p className="text-xs text-[#b9ad99]">warning</p>
            </div>
            <div className="rounded-lg border border-[#b34c32] bg-[#b34c32]/10 p-4 text-center">
              <p className="text-2xl font-semibold text-[#f0d2c8]">{summary.blocking}</p>
              <p className="text-xs text-[#b9ad99]">blocking</p>
            </div>
          </div>
        </div>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">最终决策</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                {launchDecision.label}
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchDecision.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchDecision.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchDecision.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {launchDecision.decision}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">综合就绪度</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchDecision.readinessPercent}%
              </p>
            </div>
            <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-4">
              <p className="text-xs text-[#b9ad99]">阻断项</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchDecision.summary.blockers}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchDecision.productionGate.status);

              return (
                <div className={`rounded-md border p-4 ${style.className}`}>
                  <p className="text-xs text-[#b9ad99]">生产总门禁</p>
                  <p className="mt-2 text-lg font-semibold">
                    {launchDecision.productionGate.releaseReady
                      ? "releaseReady=yes"
                      : "releaseReady=no"}
                  </p>
                  <p className="mt-1 text-xs leading-5">
                    门禁 {launchDecision.productionGate.stepBlocking} blocking · 细分{" "}
                    {launchDecision.productionGate.checkBlocking}
                  </p>
                </div>
              );
            })()}
            {launchDecision.goalTransitionGate ? (
              (() => {
                const style = statusStyle(launchDecision.goalTransitionGate.status);

                return (
                  <div className={`rounded-md border p-4 ${style.className}`}>
                    <p className="text-xs text-[#b9ad99]">最终决策阶段门槛</p>
                    <p className="mt-2 text-lg font-semibold">
                      {launchDecision.goalTransitionGate.canAdvance
                        ? "canAdvance=yes"
                        : "canAdvance=no"}
                    </p>
                    <p className="mt-1 text-xs leading-5">
                      阻断 {launchDecision.goalTransitionGate.summary.blocking} · 复核{" "}
                      {launchDecision.goalTransitionGate.summary.warning}
                    </p>
                  </div>
                );
              })()
            ) : null}
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">可用支付渠道</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchDecision.summary.configuredPaymentChannels}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">当前阶段</p>
              <p className="mt-2 font-semibold leading-6 text-[#fff7e8]">
                {launchDecision.currentPhase.title}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                {launchDecision.currentPhase.owner}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-md border border-[#3a3023] bg-[#080705] p-4">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
              <div>
                <p className="text-sm font-semibold text-[#c8a15a]">真实支付 API 守门</p>
                <h3 className="mt-2 font-ritual text-2xl text-[#fff7e8]">
                  {livePaymentGate.scopeLabel}
                </h3>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-[#b9ad99]">
                  {livePaymentGate.message}
                </p>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#d8cab2]">
                  {livePaymentGate.action}
                </p>
              </div>
              {(() => {
                const style = statusStyle(livePaymentGate.status);
                const Icon = style.icon;

                return (
                  <span
                    className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                  >
                    <Icon size={15} aria-hidden="true" />
                    {livePaymentGate.code}
                  </span>
                );
              })()}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border border-[#3a3023] bg-[#12100d] p-3">
                <p className="text-xs text-[#b9ad99]">接口状态</p>
                <p className="mt-2 font-semibold text-[#fff7e8]">
                  {livePaymentGate.allowed ? "可创建真实订单" : "当前不会创建真实订单"}
                </p>
              </div>
              <div className="rounded-md border border-[#3a3023] bg-[#12100d] p-3">
                <p className="text-xs text-[#b9ad99]">灰度白名单</p>
                <p className="mt-2 font-semibold text-[#fff7e8]">
                  {livePaymentGate.allowlist.configured ? "已配置" : "未配置"}
                </p>
              </div>
              <div className="rounded-md border border-[#3a3023] bg-[#12100d] p-3">
                <p className="text-xs text-[#b9ad99]">白名单账号</p>
                <p className="mt-2 font-semibold text-[#fff7e8]">
                  {livePaymentGate.allowlist.totalAccounts}
                </p>
                <p className="mt-1 text-xs text-[#b9ad99]">
                  userId {livePaymentGate.allowlist.userIdsConfigured} / email{" "}
                  {livePaymentGate.allowlist.emailsConfigured}
                </p>
              </div>
              <div className="rounded-md border border-[#3a3023] bg-[#12100d] p-3">
                <p className="text-xs text-[#b9ad99]">放行规则</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#fff7e8]">
                  {livePaymentGate.requiresAllowlist
                    ? "paid_smoke 只放内部测试账号"
                    : "release_ready 放开登录用户"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {launchDecision.gates.map((item) => {
              const style = statusStyle(item.status);
              const Icon = style.icon;

              return (
                <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-[#b9ad99]">{item.title}</p>
                      <p className="mt-1 font-semibold leading-6 text-[#fff7e8]">
                        {item.label}
                      </p>
                    </div>
                    <Icon size={15} aria-hidden="true" />
                  </div>
                  <p className="mt-3 text-xs text-[#b9ad99]">
                    {item.summary.ready} ready / {item.summary.warning} warning /{" "}
                    {item.summary.blocking} blocking
                  </p>
                </article>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <AlertTriangle size={16} aria-hidden="true" />
                优先处理
              </div>
              <div className="mt-4 grid gap-3">
                {launchDecision.nextActions.length > 0 ? (
                  launchDecision.nextActions.slice(0, 6).map((item) => {
                    const style = statusStyle(item.status);
                    const Icon = style.icon;

                    return (
                      <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-[#b9ad99]">
                              {item.gateTitle}
                              {item.group ? ` · ${item.group}` : ""}
                            </p>
                            <p className="mt-1 font-semibold text-[#fff7e8]">{item.title}</p>
                          </div>
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.action}</p>
                        <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                          证据：{item.evidence}
                        </p>
                      </article>
                    );
                  })
                ) : (
                  <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                    当前没有阻断或警告项。
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                可复制最终决策
              </div>
              <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                {launchDecision.copyText}
              </pre>
            </div>
          </div>
        </section>

        <section
          id="launch-production-gate"
          className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5"
        >
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">生产上线总门禁</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                {launchProductionGate.label}
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchProductionGate.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchProductionGate.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchProductionGate.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {launchProductionGate.releaseReady ? "releaseReady=yes" : "releaseReady=no"}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">门禁步骤</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchProductionGate.summary.blocking} blocking ·{" "}
                {launchProductionGate.summary.warning} warning
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">细分检查</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchProductionGate.checkSummary.blocking} blocking ·{" "}
                {launchProductionGate.checkSummary.warning} warning
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">命令入口</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                npm run launch:production-gate
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">生成时间</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchProductionGate.generatedAt.slice(0, 16).replace("T", " ")}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-5">
            {launchProductionGate.steps.map((step) => {
              const style = statusStyle(step.status);
              const Icon = style.icon;

              return (
                <article key={step.id} className={`rounded-md border p-3 ${style.className}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-[#b9ad99]">{step.command}</p>
                      <p className="mt-1 font-semibold leading-6 text-[#fff7e8]">
                        {step.label}
                      </p>
                    </div>
                    <Icon size={15} aria-hidden="true" />
                  </div>
                  <p className="mt-3 text-xs text-[#b9ad99]">
                    {step.summary.ready} ready / {step.summary.warning} warning /{" "}
                    {step.summary.blocking} blocking
                  </p>
                </article>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <AlertTriangle size={16} aria-hidden="true" />
                总门禁优先处理
              </div>
              <div className="mt-4 grid gap-3">
                {launchProductionGate.nextActions.length > 0 ? (
                  launchProductionGate.nextActions.slice(0, 8).map((item) => {
                    const style = statusStyle(item.status);
                    const Icon = style.icon;

                    return (
                      <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-[#b9ad99]">{item.detail}</p>
                            <p className="mt-1 font-semibold text-[#fff7e8]">{item.label}</p>
                          </div>
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.action}</p>
                        {item.evidence ? (
                          <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                            证据：{item.evidence}
                          </p>
                        ) : null}
                      </article>
                    );
                  })
                ) : (
                  <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                    当前生产总门禁没有阻断或警告项。
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                可复制总门禁
              </div>
              <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                {launchProductionGate.copyText}
              </pre>
            </div>
          </div>
        </section>

        <section
          id="launch-goal-followup"
          className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5"
        >
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">目标后续推进复盘</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                {launchGoalFollowup.label}
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchGoalFollowup.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchGoalFollowup.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchGoalFollowup.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {style.label}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="rounded-md border border-[#3c8b72] bg-[#3c8b72]/10 p-4">
              <p className="text-xs text-[#b9ad99]">已闭合检查</p>
              <p className="mt-2 text-2xl font-semibold text-[#cfe9df]">
                {launchGoalFollowup.summary.ready}
              </p>
            </div>
            <div className="rounded-md border border-[#c8a15a] bg-[#c8a15a]/10 p-4">
              <p className="text-xs text-[#b9ad99]">需补记录</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d49a]">
                {launchGoalFollowup.summary.warning}
              </p>
            </div>
            <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-4">
              <p className="text-xs text-[#b9ad99]">阻断检查</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchGoalFollowup.summary.blocking}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">今日动作留痕</p>
              <p className="mt-2 font-semibold leading-6 text-[#fff7e8]">
                {launchGoalFollowup.summary.actionProgressSaved} /{" "}
                {launchDailyBrief.summary.todayActionCount}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                完成 {launchGoalFollowup.summary.actionProgressDone} / 卡住{" "}
                {launchGoalFollowup.summary.actionProgressBlocked}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">本周承诺</p>
              <p className="mt-2 font-semibold leading-6 text-[#fff7e8]">
                {launchGoalFollowup.summary.weeklyCommitmentCoveragePercent}%
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                处理中 {launchGoalFollowup.summary.weeklyCommitmentInProgress} / 已完成{" "}
                {launchGoalFollowup.summary.weeklyCommitmentDone}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">补证覆盖</p>
              <p className="mt-2 font-semibold leading-6 text-[#fff7e8]">
                {launchGoalFollowup.evidenceActionCenter.coverageScore}%
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                阻断 {launchGoalFollowup.evidenceActionCenter.blocking} / 复核{" "}
                {launchGoalFollowup.evidenceActionCenter.warning}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchGoalFollowup.transitionGate.status);

              return (
                <div className={`rounded-md border p-4 ${style.className}`}>
                  <p className="text-xs text-[#b9ad99]">阶段衔接</p>
                  <p className="mt-2 font-semibold leading-6">
                    {launchGoalFollowup.transitionGate.canAdvance
                      ? "canAdvance=yes"
                      : "canAdvance=no"}
                  </p>
                  <p className="mt-1 text-xs leading-5">
                    阻断 {launchGoalFollowup.summary.transitionBlocking} · 复核{" "}
                    {launchGoalFollowup.summary.transitionWarning}
                  </p>
                </div>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                复盘检查项
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {launchGoalFollowup.items.map((item) => {
                  const style = statusStyle(item.status);
                  const Icon = style.icon;

                  return (
                    <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#fff7e8]">{item.title}</p>
                          <p className="mt-1 text-xs leading-5 text-[#b9ad99]">
                            {item.detail}
                          </p>
                        </div>
                        <Icon size={14} aria-hidden="true" />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.action}</p>
                      <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                        证据：{item.evidence}
                      </p>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  后续优先补齐
                </div>
                <div className="mt-4 space-y-2">
                  {launchGoalFollowup.nextActions.length > 0 ? (
                    launchGoalFollowup.nextActions.map((action, index) => (
                      <p
                        key={`${index}:${action}`}
                        className="rounded-md bg-[#12100d] p-3 text-xs leading-5 text-[#d8cab2]"
                      >
                        {action}
                      </p>
                    ))
                  ) : (
                    <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                      当前复盘没有新增补齐项。
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  补齐入口
                </div>
                <div className="mt-4 space-y-3">
                  {launchGoalFollowup.fillIns.length > 0 ? (
                    launchGoalFollowup.fillIns.map((item) => {
                      const style = statusStyle(item.status);
                      const Icon = style.icon;

                      return (
                        <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs text-[#b9ad99]">{item.sectionLabel}</p>
                              <p className="mt-1 font-semibold text-[#fff7e8]">{item.title}</p>
                            </div>
                            <Icon size={14} aria-hidden="true" />
                          </div>
                          <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.action}</p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            <a
                              href={`#${item.sectionId}`}
                              className="rounded-md border border-[#c8a15a]/40 px-2 py-1 font-semibold text-[#f0d49a] hover:text-[#fff7e8]"
                            >
                              跳到填写区
                            </a>
                            <span className="rounded-md bg-[#12100d] px-2 py-1 text-[#b9ad99]">
                              {item.api.method} {item.api.path}
                            </span>
                          </div>
                          <p className="mt-2 rounded-md bg-[#12100d] p-2 text-xs leading-5 text-[#b9ad99]">
                            {item.payloadHint}
                          </p>
                          <p className="mt-2 text-xs font-semibold text-[#f0d49a]">请求体模板</p>
                          <pre className="mt-2 overflow-auto rounded-md bg-[#12100d] p-2 text-xs leading-5 text-[#d8cab2]">
                            {JSON.stringify(item.payloadTemplate, null, 2)}
                          </pre>
                          <p className="mt-2 text-xs font-semibold text-[#f0d49a]">执行命令</p>
                          <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-2 text-xs leading-5 text-[#d8cab2]">
                            {item.curlCommand}
                          </pre>
                          <p className="mt-2 text-xs font-semibold text-[#f0d49a]">持久化证据</p>
                          <p className="mt-2 break-words rounded-md bg-[#12100d] p-2 text-xs leading-5 text-[#b9ad99]">
                            {item.persistence.store} / feature={item.persistence.feature} / event=
                            {item.persistence.event} / model={item.persistence.model}
                            <br />
                            {item.persistence.purpose}
                          </p>
                          <p className="mt-2 rounded-md bg-[#12100d] p-2 text-xs leading-5 text-[#b9ad99]">
                            证据：{item.evidence}
                          </p>
                          {item.sourceItemIds.length > 0 ? (
                            <p className="mt-2 break-words text-xs leading-5 text-[#b9ad99]">
                              来源：{item.sourceItemIds.slice(0, 4).join("、")}
                              {item.sourceItemIds.length > 4 ? " 等" : ""}
                            </p>
                          ) : null}
                        </article>
                      );
                    })
                  ) : (
                    <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                      当前没有需要补齐的操作入口。
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  可复制复盘
                </div>
                <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                  {launchGoalFollowup.copyText}
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">商业模型</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                用户画像、定价与回收护栏
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchBusinessModel.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchBusinessModel.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchBusinessModel.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {launchBusinessModel.label}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-7">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">用户画像</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchBusinessModel.summary.personas}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">成本覆盖</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchBusinessModel.summary.productsWithCostEstimate}/
                {launchBusinessModel.summary.products}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">平均 AI 成本</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {percentLabel(launchBusinessModel.summary.averageAiCostSharePercent)}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                上限 {launchBusinessModel.summary.targetAiCostShareMaxPercent}%
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">支付订单</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchBusinessModel.summary.paidOrders}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">实收 / 成本</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#fff7e8]">
                {yuanLabel(launchBusinessModel.summary.revenueCents)} /{" "}
                {yuanLabel(launchBusinessModel.summary.marketingCostCents)}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">综合回收</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {multipleLabel(launchBusinessModel.summary.blendedRoiMultiple)}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                经营护栏
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {launchBusinessModel.guardrails.map((item) => {
                  const style = statusStyle(item.status);
                  const Icon = style.icon;

                  return (
                    <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#fff7e8]">{item.label}</p>
                          <p className="mt-1 text-xs leading-5 text-[#b9ad99]">
                            目标：{item.target}
                          </p>
                        </div>
                        <Icon size={14} aria-hidden="true" />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#d8cab2]">
                        当前：{item.current}
                      </p>
                      <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                        {item.action}
                      </p>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                可复制商业模型
              </div>
              <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                {launchBusinessModel.copyText}
              </pre>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                主推商品回收
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {launchBusinessModel.products.slice(0, 8).map((product) => {
                  const style = statusStyle(product.status);
                  const Icon = style.icon;

                  return (
                    <article key={product.code} className={`rounded-md border p-3 ${style.className}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#fff7e8]">{product.name}</p>
                          <p className="mt-1 text-xs text-[#b9ad99]">
                            {product.priceLabel} · CAC {yuanLabel(product.suggestedMaxCacCents)}
                          </p>
                        </div>
                        <Icon size={14} aria-hidden="true" />
                      </div>
                      <p className="mt-2 text-xs leading-5 text-[#d8cab2]">
                        AI {yuanLabel(product.estimatedAiCostCents)} /{" "}
                        {percentLabel(product.estimatedAiCostSharePercent)} · 贡献{" "}
                        {yuanLabel(product.contributionCents)}
                      </p>
                      <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                        {product.action}
                      </p>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                买单人群
              </div>
              <div className="mt-4 space-y-3">
                {launchBusinessModel.personas.map((persona) => {
                  const style = statusStyle(persona.status);
                  const Icon = style.icon;

                  return (
                    <article key={persona.id} className={`rounded-md border p-3 ${style.className}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#fff7e8]">{persona.title}</p>
                          <p className="mt-1 text-xs text-[#b9ad99]">
                            {persona.ageRange} · {persona.entryOffer}
                          </p>
                        </div>
                        <Icon size={14} aria-hidden="true" />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{persona.need}</p>
                      <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                        {persona.action}
                      </p>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>

          {launchBusinessModel.topChannels.length > 0 ? (
            <div className="mt-5 rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                渠道回收样本
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {launchBusinessModel.topChannels.map((channel) => (
                  <article key={channel.source} className="rounded-md border border-[#3a3023] bg-[#12100d] p-3">
                    <p className="break-all font-semibold text-[#fff7e8]">{channel.source}</p>
                    <p className="mt-2 text-xs leading-5 text-[#b9ad99]">
                      {channel.paidOrders} 笔 · {yuanLabel(channel.revenueCents)} 实收 ·{" "}
                      {multipleLabel(channel.blendedRoiMultiple)}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p
                id="launch-offline-action-pack"
                className="text-sm font-semibold text-[#c8a15a]"
              >
                线下办理行动包
              </p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                今天先办、材料、回执和变量一页纸
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchOfflineActionPack.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchOfflineActionPack.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchOfflineActionPack.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {launchOfflineActionPack.label}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-7">
            <div className="rounded-md border border-[#3c8b72] bg-[#3c8b72]/10 p-4">
              <p className="text-xs text-[#b9ad99]">ready</p>
              <p className="mt-2 text-2xl font-semibold text-[#cfe9df]">
                {launchOfflineActionPack.summary.ready}
              </p>
            </div>
            <div className="rounded-md border border-[#c8a15a] bg-[#c8a15a]/10 p-4">
              <p className="text-xs text-[#b9ad99]">warning</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d49a]">
                {launchOfflineActionPack.summary.warning}
              </p>
            </div>
            <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-4">
              <p className="text-xs text-[#b9ad99]">blocking</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchOfflineActionPack.summary.blocking}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">可立即推进</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchOfflineActionPack.summary.unblockedActions}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">材料 / 字段</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchOfflineActionPack.summary.materials} /{" "}
                {launchOfflineActionPack.summary.platformFields}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">变量 / 证据</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchOfflineActionPack.summary.envKeys} /{" "}
                {launchOfflineActionPack.summary.receipts +
                  launchOfflineActionPack.summary.evidenceLinks}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                <div>
                  <p className="text-sm font-semibold text-[#f0d49a]">今天先办</p>
                  <h3 className="mt-2 font-ritual text-2xl text-[#fff7e8]">
                    {launchOfflineActionPack.currentAction.title}
                  </h3>
                  <p className="mt-2 text-xs text-[#b9ad99]">
                    {launchOfflineActionPack.currentAction.phase} ·{" "}
                    {launchOfflineActionPack.currentAction.owner} · 目标日{" "}
                    {launchOfflineActionPack.currentAction.dueLabel}
                  </p>
                </div>
                {(() => {
                  const style = statusStyle(launchOfflineActionPack.currentAction.status);
                  const Icon = style.icon;

                  return (
                    <span
                      className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                    >
                      <Icon size={15} aria-hidden="true" />
                      {style.label}
                    </span>
                  );
                })()}
              </div>
              <p className="mt-4 text-sm leading-6 text-[#d8cab2]">
                {launchOfflineActionPack.currentAction.action}
              </p>
              <p className="mt-3 rounded-md bg-[#12100d] p-3 text-xs leading-5 text-[#b9ad99]">
                证据：{launchOfflineActionPack.currentAction.evidence}
              </p>
              {launchOfflineActionPack.currentAction.envKeys.length > 0 ? (
                <p className="mt-3 break-words rounded-md bg-[#12100d] p-3 text-xs leading-5 text-[#f0d49a]">
                  变量：{launchOfflineActionPack.currentAction.envKeys.join("、")}
                </p>
              ) : null}
              {launchOfflineActionPack.currentAction.unlocks.length > 0 ? (
                <p className="mt-3 text-xs leading-5 text-[#b9ad99]">
                  解锁：{launchOfflineActionPack.currentAction.unlocks.slice(0, 4).join("、")}
                </p>
              ) : null}
              <AdminLaunchOfflineActionQuickForm
                adminToken={adminToken}
                item={currentOfflineReadinessItem}
                evidencePlaceholder={launchOfflineActionPack.currentAction.evidence}
                suggestedTargetDate={launchOfflineActionPack.currentAction.suggestedTargetDate}
                scheduleLabel={launchOfflineActionPack.currentAction.scheduleLabel}
              />
            </div>

            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                可复制办理一页纸
              </div>
              <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                {launchOfflineActionPack.copyText}
              </pre>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {launchOfflineActionPack.groups.map((group) => {
              const style = statusStyle(group.status);
              const Icon = style.icon;

              return (
                <article key={group.title} className={`rounded-md border p-4 ${style.className}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-[#b9ad99]">办理阶段</p>
                      <p className="mt-1 font-semibold leading-6 text-[#fff7e8]">
                        {group.title}
                      </p>
                    </div>
                    <Icon size={15} aria-hidden="true" />
                  </div>
                  <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-xs leading-5 text-[#b9ad99]">
                    {group.summary.ready}/{group.summary.total} ready ·{" "}
                    {group.summary.blocking} blocking · {group.summary.warning} warning
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[#d8cab2]">
                    {group.items
                      .filter((item) => item.status !== "ready")
                      .slice(0, 2)
                      .map((item) => item.title)
                      .join("、") || "当前阶段已闭合"}
                  </p>
                </article>
              );
            })}
          </div>

          <div className="mt-5 rounded-md border border-[#3a3023] bg-[#080705] p-4">
            <AdminLaunchOfflineActionQueueForm
              adminToken={adminToken}
              actions={offlineActionQueue}
            />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <AlertTriangle size={16} aria-hidden="true" />
                优先动作队列
              </div>
              <div className="mt-4 space-y-3">
                {launchOfflineActionPack.items.filter((item) => item.status !== "ready").length >
                0 ? (
                  launchOfflineActionPack.items
                    .filter((item) => item.status !== "ready")
                    .slice(0, 6)
                    .map((item) => {
                      const style = statusStyle(item.status);
                      const Icon = style.icon;

                      return (
                        <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs text-[#b9ad99]">
                                {item.phase} · {item.owner} · {item.dependencyLabel}
                              </p>
                              <p className="mt-1 font-semibold text-[#fff7e8]">{item.title}</p>
                            </div>
                            <Icon size={14} aria-hidden="true" />
                          </div>
                          {item.blockedBy.length > 0 ? (
                            <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#f0d49a]">
                              前置依赖：{item.blockedBy.join("、")}
                            </p>
                          ) : null}
                          <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.action}</p>
                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            <p className="rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                              材料：{item.materials.slice(0, 3).join("、")}
                            </p>
                            <p className="rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                              产物：{item.outputs.slice(0, 3).join("、")}
                            </p>
                          </div>
                          {item.envKeys.length > 0 ? (
                            <p className="mt-2 break-words rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#f0d49a]">
                              变量：{item.envKeys.join("、")}
                            </p>
                          ) : null}
                        </article>
                      );
                    })
                ) : (
                  <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                    当前没有待办理线下动作。
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  当前事项填表字段
                </div>
                <div className="mt-4 space-y-2">
                  {(() => {
                    const fields =
                      launchOfflineActionPack.items.find(
                        (item) => item.id === launchOfflineActionPack.currentAction.id,
                      )?.platformFields ?? [];

                    return fields.length > 0 ? (
                      fields.slice(0, 6).map((field) => (
                        <p
                          key={field.label}
                          className="rounded-md bg-[#12100d] p-2 text-xs leading-5 text-[#d8cab2]"
                        >
                          <span className="font-semibold text-[#fff7e8]">{field.label}：</span>
                          <span className="break-all">{field.value}</span>
                        </p>
                      ))
                    ) : (
                      <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                        当前事项不需要第三方平台填表字段。
                      </p>
                    );
                  })()}
                </div>
              </div>

              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  官方入口
                </div>
                <div className="mt-4 space-y-2">
                  {launchOfflineActionPack.officialRefs.slice(0, 5).map((ref) => (
                    <a
                      key={ref.url}
                      href={ref.url}
                      className="block rounded-md border border-[#3a3023] bg-[#12100d] p-3 text-sm text-[#d8cab2] transition hover:border-[#c8a15a]"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="font-semibold text-[#fff7e8]">{ref.title}</span>
                      <span className="mt-1 block text-xs leading-5 text-[#b9ad99]">
                        {ref.note}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">生产变量批次</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                {launchEnvBatchPlan.label}
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchEnvBatchPlan.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchEnvBatchPlan.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchEnvBatchPlan.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {launchEnvBatchPlan.currentBatch.title}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">当前批次</p>
              <p className="mt-2 font-semibold leading-6 text-[#fff7e8]">
                {launchEnvBatchPlan.currentBatch.title}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                {launchEnvBatchPlan.currentBatch.owner}
              </p>
            </div>
            <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-4">
              <p className="text-xs text-[#b9ad99]">阻断批次</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchEnvBatchPlan.summary.blocking}
              </p>
            </div>
            <div className="rounded-md border border-[#c8a15a] bg-[#c8a15a]/10 p-4">
              <p className="text-xs text-[#b9ad99]">待复核批次</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d49a]">
                {launchEnvBatchPlan.summary.warning}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">优先变量</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchEnvBatchPlan.summary.nextEntries}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {launchEnvBatchPlan.batches.map((batch) => {
              const style = statusStyle(batch.status);
              const Icon = style.icon;

              return (
                <article key={batch.id} className={`rounded-md border p-4 ${style.className}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-[#b9ad99]">{batch.owner}</p>
                      <p className="mt-1 font-semibold leading-6 text-[#fff7e8]">
                        {batch.title}
                      </p>
                    </div>
                    <Icon size={15} aria-hidden="true" />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#d8cab2]">{batch.label}</p>
                  <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-xs leading-5 text-[#b9ad99]">
                    {batch.summary.ready}/{batch.summary.total} ready · 密钥/连接串{" "}
                    {batch.summary.secret}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[#b9ad99]">
                    验证：{batch.validation.slice(0, 2).join("、")}
                  </p>
                </article>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                批次优先填写
              </div>
              <div className="mt-4 space-y-3">
                {launchEnvBatchPlan.nextEntries.length > 0 ? (
                  launchEnvBatchPlan.nextEntries.map((entry) => {
                    const style = statusStyle(entry.status);
                    const Icon = style.icon;

                    return (
                      <article
                        key={`${entry.batchId}:${entry.key}`}
                        className={`rounded-md border p-3 ${style.className}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="break-all text-xs text-[#b9ad99]">
                              {entry.batchTitle} · {entry.key}
                            </p>
                            <p className="mt-1 font-semibold text-[#fff7e8]">{entry.label}</p>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#080705]/70 px-2 py-1 text-xs">
                            <Icon size={14} aria-hidden="true" />
                            {entry.stateLabel}
                          </span>
                        </div>
                        <p className="mt-2 break-all rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#d8cab2]">
                          {`${entry.key}="${entry.safeValue}"`}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{entry.action}</p>
                        {entry.platformHints.length > 0 ? (
                          <p className="mt-2 text-xs leading-5 text-[#b9ad99]">
                            来源：{entry.platformHints.slice(0, 3).join("、")}
                          </p>
                        ) : null}
                      </article>
                    );
                  })
                ) : (
                  <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                    当前没有待填写变量。
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                可复制批次清单
              </div>
              <pre className="mt-4 max-h-[38rem] overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                {launchEnvBatchPlan.copyText}
              </pre>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">真实联调排程</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                {launchIntegrationSchedule.label}
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchIntegrationSchedule.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchIntegrationSchedule.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchIntegrationSchedule.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {launchIntegrationSchedule.currentLane.title}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">当前联调</p>
              <p className="mt-2 font-semibold leading-6 text-[#fff7e8]">
                {launchIntegrationSchedule.currentLane.title}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                {launchIntegrationSchedule.currentLane.owner}
              </p>
            </div>
            <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-4">
              <p className="text-xs text-[#b9ad99]">阻断链路</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchIntegrationSchedule.summary.blocking}
              </p>
            </div>
            <div className="rounded-md border border-[#c8a15a] bg-[#c8a15a]/10 p-4">
              <p className="text-xs text-[#b9ad99]">待复核链路</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d49a]">
                {launchIntegrationSchedule.summary.warning}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">优先动作</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchIntegrationSchedule.summary.nextActions}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {launchIntegrationSchedule.lanes.map((lane) => {
              const style = statusStyle(lane.status);
              const Icon = style.icon;

              return (
                <article key={lane.id} className={`rounded-md border p-4 ${style.className}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-[#b9ad99]">{lane.owner}</p>
                      <p className="mt-1 font-semibold leading-6 text-[#fff7e8]">
                        {lane.title}
                      </p>
                    </div>
                    <Icon size={15} aria-hidden="true" />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#d8cab2]">{lane.label}</p>
                  <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-xs leading-5 text-[#b9ad99]">
                    {lane.readySteps}/{lane.totalSteps} ready
                    {lane.nextStep ? ` · 下一步：${lane.nextStep.title}` : ""}
                  </p>
                </article>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <AlertTriangle size={16} aria-hidden="true" />
                联调动作队列
              </div>
              <div className="mt-4 space-y-3">
                {launchIntegrationSchedule.nextActions.length > 0 ? (
                  launchIntegrationSchedule.nextActions.map((item) => {
                    const style = statusStyle(item.status);
                    const Icon = style.icon;

                    return (
                      <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-[#b9ad99]">
                              {item.laneTitle} · {item.owner}
                            </p>
                            <p className="mt-1 font-semibold text-[#fff7e8]">{item.title}</p>
                          </div>
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        {item.envKeys.length > 0 ? (
                          <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#f0d49a]">
                            变量：{item.envKeys.join("、")}
                          </p>
                        ) : null}
                        <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.action}</p>
                        <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                          证据：{item.evidence}
                        </p>
                      </article>
                    );
                  })
                ) : (
                  <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                    当前没有待处理真实联调动作。
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                可复制联调排程
              </div>
              <pre className="mt-4 max-h-[38rem] overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                {launchIntegrationSchedule.copyText}
              </pre>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">上线阻断总控台</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                {launchBlockerDashboard.label}
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchBlockerDashboard.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchBlockerDashboard.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchBlockerDashboard.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {style.label}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {(() => {
              const style = statusStyle(launchBlockerDashboard.productionGate.status);
              const Icon = style.icon;

              return (
                <div className={`rounded-md border p-4 ${style.className}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-[#b9ad99]">生产总门禁</p>
                      <p className="mt-2 text-lg font-semibold leading-6 text-[#fff7e8]">
                        {launchBlockerDashboard.productionGate.releaseReady
                          ? "releaseReady=yes"
                          : "releaseReady=no"}
                      </p>
                    </div>
                    <Icon size={15} aria-hidden="true" />
                  </div>
                  <p className="mt-1 text-xs text-[#b9ad99]">
                    门禁 {launchBlockerDashboard.productionGate.stepBlocking} blocking · 细分{" "}
                    {launchBlockerDashboard.productionGate.checkBlocking}
                  </p>
                </div>
              );
            })()}
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">当前先办</p>
              <p className="mt-2 font-semibold leading-6 text-[#fff7e8]">
                {launchBlockerDashboard.currentWorkstream.title}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                {launchBlockerDashboard.currentWorkstream.owner}
              </p>
            </div>
            <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-4">
              <p className="text-xs text-[#b9ad99]">阻断工作线</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchBlockerDashboard.summary.blocking}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                共 {launchBlockerDashboard.summary.workstreams} 条工作线
              </p>
            </div>
            <div className="rounded-md border border-[#c8a15a] bg-[#c8a15a]/10 p-4">
              <p className="text-xs text-[#b9ad99]">待复核工作线</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d49a]">
                {launchBlockerDashboard.summary.warning}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                已闭合 {launchBlockerDashboard.summary.ready} 条
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">优先动作</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchBlockerDashboard.summary.nextActions}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                {launchBlockerDashboard.generatedAt.slice(0, 10)}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {launchBlockerDashboard.workstreams.map((workstream) => {
              const style = statusStyle(workstream.status);
              const Icon = style.icon;

              return (
                <article key={workstream.id} className={`rounded-md border p-4 ${style.className}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-[#b9ad99]">{workstream.owner}</p>
                      <p className="mt-1 font-semibold leading-6 text-[#fff7e8]">
                        {workstream.title}
                      </p>
                    </div>
                    <Icon size={15} aria-hidden="true" />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#d8cab2]">{workstream.label}</p>
                  <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-xs leading-5 text-[#b9ad99]">
                    {workstream.summary.blocking} blocking · {workstream.summary.warning} warning ·{" "}
                    {workstream.summary.ready}/{workstream.summary.total} ready
                  </p>
                </article>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <AlertTriangle size={16} aria-hidden="true" />
                优先动作队列
              </div>
              <div className="mt-4 space-y-3">
                {launchBlockerDashboard.nextActions.length > 0 ? (
                  launchBlockerDashboard.nextActions.map((item) => {
                    const style = statusStyle(item.status);
                    const Icon = style.icon;

                    return (
                      <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-[#b9ad99]">
                              {item.source} · {item.owner}
                            </p>
                            <p className="mt-1 font-semibold text-[#fff7e8]">{item.title}</p>
                          </div>
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.action}</p>
                        <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                          证据：{item.evidence}
                        </p>
                      </article>
                    );
                  })
                ) : (
                  <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                    当前没有阻断或警告动作。
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                可复制阻断总控
              </div>
              <pre className="mt-4 max-h-[38rem] overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                {launchBlockerDashboard.copyText}
              </pre>
            </div>
          </div>
        </section>

        <section
          id="launch-daily-brief"
          className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5"
        >
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">今日目标推进日报</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                {launchDailyBrief.label}
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchDailyBrief.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchDailyBrief.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchDailyBrief.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {launchDailyBrief.today}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {(() => {
              const style = statusStyle(launchDailyBrief.productionGate.status);
              const Icon = style.icon;

              return (
                <div className={`rounded-md border p-4 ${style.className}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-[#b9ad99]">生产门禁</p>
                      <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                        {launchDailyBrief.productionGate.stepBlocking}
                      </p>
                    </div>
                    <Icon size={15} aria-hidden="true" />
                  </div>
                  <p className="mt-1 text-xs text-[#b9ad99]">
                    {launchDailyBrief.productionGate.releaseReady
                      ? "releaseReady=yes"
                      : "releaseReady=no"}{" "}
                    · 细分 {launchDailyBrief.productionGate.checkBlocking}
                  </p>
                </div>
              );
            })()}
            <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-4">
              <p className="text-xs text-[#b9ad99]">Go / No-Go 阻断</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchDailyBrief.summary.goNoGoBlocking}
              </p>
            </div>
            <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-4">
              <p className="text-xs text-[#b9ad99]">阻断工作线</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchDailyBrief.summary.workstreamBlocking}
              </p>
            </div>
            <div className="rounded-md border border-[#c8a15a] bg-[#c8a15a]/10 p-4">
              <p className="text-xs text-[#b9ad99]">承诺覆盖</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d49a]">
                {launchDailyBrief.summary.commitmentCoveragePercent}%
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                未承诺 {launchDailyBrief.summary.weeklyUncommitted}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">目标推进记录</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchDailyBrief.summary.goalProgressSaved}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                阶段阻断 {launchDailyBrief.summary.goalBlocking}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchDailyBrief.transitionGate.status);
              const Icon = style.icon;

              return (
                <div className={`rounded-md border p-4 ${style.className}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-[#b9ad99]">阶段门槛</p>
                      <p className="mt-2 text-sm font-semibold leading-6">
                        {launchDailyBrief.transitionGate.canAdvance
                          ? "canAdvance=yes"
                          : "canAdvance=no"}
                      </p>
                    </div>
                    <Icon size={15} aria-hidden="true" />
                  </div>
                  <p className="mt-1 text-xs leading-5">
                    阻断 {launchDailyBrief.transitionGate.blocking} · 复核{" "}
                    {launchDailyBrief.transitionGate.warning}
                  </p>
                </div>
              );
            })()}
            {(() => {
              const style = statusStyle(launchDailyBrief.offlineAction.status);
              const Icon = style.icon;

              return (
                <div className={`rounded-md border p-4 ${style.className}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-[#b9ad99]">线下办理</p>
                      <p className="mt-2 text-sm font-semibold leading-6">
                        {launchDailyBrief.offlineAction.current.title}
                      </p>
                    </div>
                    <Icon size={15} aria-hidden="true" />
                  </div>
                  <p className="mt-1 text-xs leading-5">
                    阻断 {launchDailyBrief.offlineAction.blocking} · 复核{" "}
                    {launchDailyBrief.offlineAction.warning}
                  </p>
                </div>
              );
            })()}
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">今日动作</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchDailyBrief.summary.todayActionCount}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                记录 {launchDailyBrief.summary.actionProgressSaved} / 完成{" "}
                {launchDailyBrief.summary.actionProgressDone}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <AlertTriangle size={16} aria-hidden="true" />
                今日优先动作
              </div>
              <div className="mt-4 space-y-3">
                {launchDailyBrief.todayActions.length > 0 ? (
                  launchDailyBrief.todayActions.map((item) => {
                    const style = statusStyle(item.status);
                    const Icon = style.icon;

                    return (
                      <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-[#b9ad99]">
                              {item.sourceLabel} · {item.owner}
                              {item.dueLabel ? ` · ${item.dueLabel}` : ""}
                            </p>
                            <p className="mt-1 font-semibold text-[#fff7e8]">{item.title}</p>
                          </div>
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.action}</p>
                        <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                          证据：{item.evidence}
                        </p>
                        {item.progress ? (
                          <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                            执行：{commitmentStatusLabel(item.progress.status)}
                            {item.progress.note ? ` · ${item.progress.note}` : ""}
                            {item.progress.evidenceNote
                              ? `；证据备注：${item.progress.evidenceNote}`
                              : ""}
                          </p>
                        ) : null}
                      </article>
                    );
                  })
                ) : (
                  <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                    当前没有待处理动作。
                  </p>
                )}
              </div>
              <AdminLaunchDailyActionProgressForm
                adminToken={adminToken}
                actions={launchDailyBrief.todayActions}
              />
            </div>

            <div className="grid gap-4">
              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  当前目标与证据
                </div>
                <div className="mt-4 space-y-3">
                  <div className="rounded-md bg-[#12100d] p-3">
                    <p className="text-xs text-[#b9ad99]">
                      {launchDailyBrief.goalSnapshot.owner} · 目标日{" "}
                      {launchDailyBrief.goalSnapshot.targetDate}
                    </p>
                    <p className="mt-1 font-semibold leading-6 text-[#fff7e8]">
                      {launchDailyBrief.goalSnapshot.title}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-[#b9ad99]">
                      推进：{commitmentStatusLabel(launchDailyBrief.goalSnapshot.progressStatus)}{" "}
                      {launchDailyBrief.goalSnapshot.progressNote
                        ? `· ${launchDailyBrief.goalSnapshot.progressNote}`
                        : ""}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-[#f0d49a]">
                      阶段门槛：
                      {launchDailyBrief.transitionGate.canAdvance
                        ? "canAdvance=yes"
                        : "canAdvance=no"}{" "}
                      · {launchDailyBrief.transitionGate.label}
                    </p>
                  </div>
                  <div className="rounded-md bg-[#12100d] p-3">
                    <p className="font-semibold text-[#fff7e8]">
                      {launchDailyBrief.evidence.label}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-[#b9ad99]">
                      最近归档：
                      {launchDailyBrief.evidence.latestArchivedAt
                        ? launchDailyBrief.evidence.latestArchivedAt.slice(0, 16).replace("T", " ")
                        : "暂无"}
                    </p>
                    {launchDailyBrief.evidence.refreshReasons.length > 0 ? (
                      <p className="mt-2 text-xs leading-5 text-[#f0d49a]">
                        需刷新：{launchDailyBrief.evidence.refreshReasons.join("、")}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs leading-5 text-[#b9ad99]">
                      {launchDailyBrief.evidence.action}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  可复制推进日报
                </div>
                <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                  {launchDailyBrief.copyText}
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section
          id="launch-goal-plan"
          className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5"
        >
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">开工目标</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                {launchGoalPlan.label}
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchGoalPlan.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchGoalPlan.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchGoalPlan.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  30 / 60 / 90
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-5">
            <div className="rounded-md border border-[#3c8b72] bg-[#3c8b72]/10 p-4">
              <p className="text-xs text-[#b9ad99]">已闭合阶段</p>
              <p className="mt-2 text-2xl font-semibold text-[#cfe9df]">
                {launchGoalPlan.summary.ready}
              </p>
            </div>
            <div className="rounded-md border border-[#c8a15a] bg-[#c8a15a]/10 p-4">
              <p className="text-xs text-[#b9ad99]">需复核阶段</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d49a]">
                {launchGoalPlan.summary.warning}
              </p>
            </div>
            <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-4">
              <p className="text-xs text-[#b9ad99]">阻断阶段</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchGoalPlan.summary.blocking}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">当前目标日</p>
              <p className="mt-2 font-semibold leading-6 text-[#fff7e8]">
                {launchGoalPlan.currentMilestone.targetDate}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                {launchGoalPlan.currentMilestone.owner}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchGoalPlan.transitionGate.status);

              return (
                <div className={`rounded-md border p-4 ${style.className}`}>
                  <p className="text-xs text-[#b9ad99]">阶段推进门槛</p>
                  <p className="mt-2 font-semibold leading-6">
                    {launchGoalPlan.transitionGate.canAdvance ? "canAdvance=yes" : "canAdvance=no"}
                  </p>
                  <p className="mt-1 text-xs leading-5">
                    阻断 {launchGoalPlan.transitionGate.summary.blocking} · 复核{" "}
                    {launchGoalPlan.transitionGate.summary.warning}
                  </p>
                </div>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-4">
            {launchGoalPlan.milestones.map((milestone) => {
              const style = statusStyle(milestone.status);
              const Icon = style.icon;

              return (
                <article key={milestone.id} className={`rounded-md border p-4 ${style.className}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-[#b9ad99]">{milestone.windowLabel}</p>
                      <p className="mt-1 font-semibold leading-6 text-[#fff7e8]">
                        {milestone.title}
                      </p>
                    </div>
                    <Icon size={15} aria-hidden="true" />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#d8cab2]">
                    {milestone.businessGoal}
                  </p>
                  <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-xs leading-5 text-[#b9ad99]">
                    负责人：{milestone.owner}
                  </p>
                  {milestone.progress ? (
                    <p className="mt-2 rounded-md bg-[#080705]/70 p-3 text-xs leading-5 text-[#b9ad99]">
                      推进：{commitmentStatusLabel(milestone.progress.status)} ·{" "}
                      {milestone.progress.evidenceNote ?? milestone.progress.note ?? "已记录"}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>

          <AdminLaunchGoalProgressForm
            adminToken={adminToken}
            milestones={launchGoalPlan.milestones}
          />

          <div className="mt-5 rounded-md border border-[#3a3023] bg-[#080705] p-4">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  阶段推进门槛
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#b9ad99]">
                  {launchGoalPlan.transitionGate.detail}
                </p>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#d8cab2]">
                  {launchGoalPlan.transitionGate.action}
                </p>
              </div>
              {(() => {
                const style = statusStyle(launchGoalPlan.transitionGate.status);
                const Icon = style.icon;

                return (
                  <span
                    className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                  >
                    <Icon size={15} aria-hidden="true" />
                    {launchGoalPlan.transitionGate.canAdvance
                      ? "canAdvance=yes"
                      : "canAdvance=no"}
                  </span>
                );
              })()}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {launchGoalPlan.transitionGate.checks.map((item) => {
                const style = statusStyle(item.status);
                const Icon = style.icon;

                return (
                  <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#fff7e8]">{item.title}</p>
                        <p className="mt-1 text-xs leading-5 text-[#b9ad99]">
                          {item.detail}
                        </p>
                      </div>
                      <Icon size={14} aria-hidden="true" />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.action}</p>
                    <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                      证据：{item.evidence}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                当前阶段指标
              </div>
              <div className="mt-4 space-y-3">
                {launchGoalPlan.currentMilestone.metrics.map((item) => {
                  const style = statusStyle(item.status);
                  const Icon = style.icon;

                  return (
                    <article key={item.label} className={`rounded-md border p-3 ${style.className}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#fff7e8]">{item.label}</p>
                          <p className="mt-1 text-xs leading-5 text-[#b9ad99]">
                            目标：{item.target}
                          </p>
                        </div>
                        <Icon size={14} aria-hidden="true" />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#d8cab2]">
                        当前：{item.current}
                      </p>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  当前阶段下一步
                </div>
                <div className="mt-4 space-y-2">
                  {launchGoalPlan.currentMilestone.nextActions.slice(0, 5).map((action, index) => (
                    <p
                      key={`${index}:${action}`}
                      className="rounded-md bg-[#12100d] p-3 text-xs leading-5 text-[#d8cab2]"
                    >
                      {action}
                    </p>
                  ))}
                </div>
                <p className="mt-3 rounded-md bg-[#12100d] p-3 text-xs leading-5 text-[#b9ad99]">
                  验收：{launchGoalPlan.currentMilestone.exitCriteria.slice(0, 3).join("；")}
                </p>
              </div>

              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  可复制目标规划
                </div>
                <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                  {launchGoalPlan.copyText}
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section
          id="launch-weekly-focus"
          className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5"
        >
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">本周推进</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                {launchWeeklyFocus.label}
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchWeeklyFocus.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchWeeklyFocus.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchWeeklyFocus.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {launchWeeklyFocus.week.start} - {launchWeeklyFocus.week.end}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-4">
              <p className="text-xs text-[#b9ad99]">本周阻断</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchWeeklyFocus.summary.blocking}
              </p>
            </div>
            <div className="rounded-md border border-[#c8a15a] bg-[#c8a15a]/10 p-4">
              <p className="text-xs text-[#b9ad99]">本周到期</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d49a]">
                {launchWeeklyFocus.summary.today + launchWeeklyFocus.summary.thisWeek}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">未排期</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchWeeklyFocus.summary.unscheduled}
              </p>
            </div>
            <div className="rounded-md border border-[#c8a15a] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">承诺覆盖</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchWeeklyFocus.summary.commitmentCoveragePercent}%
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                {launchWeeklyFocus.summary.committed}/{launchWeeklyFocus.summary.total}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">承诺状态</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#fff7e8]">
                处理中 {launchWeeklyFocus.summary.commitmentInProgress}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                卡住 {launchWeeklyFocus.summary.commitmentBlocked} · 已完成{" "}
                {launchWeeklyFocus.summary.commitmentDone}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">当前阶段</p>
              <p className="mt-2 font-semibold leading-6 text-[#fff7e8]">
                {launchWeeklyFocus.currentPhase.title}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                {launchWeeklyFocus.currentPhase.owner}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchGoalPlan.transitionGate.status);
              const Icon = style.icon;

              return (
                <div className={`rounded-md border p-4 ${style.className}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-[#b9ad99]">本周阶段门槛</p>
                      <p className="mt-2 text-sm font-semibold leading-6">
                        {launchGoalPlan.transitionGate.canAdvance
                          ? "canAdvance=yes"
                          : "canAdvance=no"}
                      </p>
                    </div>
                    <Icon size={15} aria-hidden="true" />
                  </div>
                  <p className="mt-1 text-xs leading-5">
                    阻断 {launchGoalPlan.transitionGate.summary.blocking} · 复核{" "}
                    {launchGoalPlan.transitionGate.summary.warning}
                  </p>
                </div>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {launchWeeklyFocus.lanes.map((lane) => {
              const style = statusStyle(lane.status);
              const Icon = style.icon;

              return (
                <article key={lane.id} className={`rounded-md border p-4 ${style.className}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#fff7e8]">{lane.title}</p>
                      <p className="mt-2 text-xs text-[#b9ad99]">
                        {lane.summary.blocking} blocking · {lane.summary.warning} warning ·{" "}
                        {lane.summary.ready}/{lane.summary.total} ready
                      </p>
                    </div>
                    <Icon size={15} aria-hidden="true" />
                  </div>
                  {lane.nextItem ? (
                    <div className="mt-3 rounded-md bg-[#080705]/70 p-3">
                      <p className="text-xs text-[#b9ad99]">{lane.nextItem.dueLabel}</p>
                      <p className="mt-1 text-sm font-semibold leading-6 text-[#fff7e8]">
                        {lane.nextItem.title}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[#d8cab2]">
                        {lane.nextItem.owner}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-sm text-[#b9ad99]">
                      本周暂无待处理项。
                    </p>
                  )}
                </article>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                本周重点任务
              </div>
              <div className="mt-4 space-y-3">
                {launchWeeklyFocus.focusItems.length > 0 ? (
                  launchWeeklyFocus.focusItems.slice(0, 8).map((item) => {
                    const style = statusStyle(item.status);
                    const Icon = style.icon;
                    const commitmentLabel = item.commitment
                      ? commitmentStatusLabel(item.commitment.status)
                      : "未承诺";

                    return (
                      <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-[#b9ad99]">
                              {item.laneTitle} · {item.owner} ·{" "}
                              {item.suggestedTargetLabel ?? item.dueLabel} · {commitmentLabel}
                            </p>
                            <p className="mt-1 font-semibold text-[#fff7e8]">{item.title}</p>
                          </div>
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        {item.blockedBy.length > 0 ? (
                          <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#f0d49a]">
                            依赖：{item.blockedBy.slice(0, 4).join("、")}
                          </p>
                        ) : null}
                        <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.action}</p>
                        <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                          验收：{item.evidence}
                        </p>
                      </article>
                    );
                  })
                ) : (
                  <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                    当前没有本周重点任务。
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  负责人视图
                </div>
                <div className="mt-4 space-y-3">
                  {launchWeeklyFocus.ownerGroups.slice(0, 5).map((group) => {
                    const style = statusStyle(group.status);
                    const Icon = style.icon;

                    return (
                      <article key={group.owner} className={`rounded-md border p-3 ${style.className}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-[#fff7e8]">{group.owner}</p>
                            <p className="mt-1 text-xs text-[#b9ad99]">
                              {group.summary.blocking} blocking · {group.summary.warning} warning ·{" "}
                              处理中 {group.summary.commitmentInProgress} · {group.summary.total} 项
                            </p>
                          </div>
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        <p className="mt-2 text-xs leading-5 text-[#d8cab2]">
                          {group.items.map((item) => item.title).join("、")}
                        </p>
                      </article>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  本周承诺
                </div>
                <p className="mt-2 text-xs leading-5 text-[#b9ad99]">
                  还剩 {launchWeeklyFocus.summary.uncommitted} 项未保存目标日承诺；处理中{" "}
                  {launchWeeklyFocus.summary.commitmentInProgress} 项，卡住{" "}
                  {launchWeeklyFocus.summary.commitmentBlocked} 项，已完成{" "}
                  {launchWeeklyFocus.summary.commitmentDone} 项。
                </p>
                {launchWeeklyFocus.commitmentGaps.length > 0 ? (
                  <p className="mt-2 rounded-md bg-[#12100d] p-2 text-xs leading-5 text-[#f0d49a]">
                    待补：{launchWeeklyFocus.commitmentGaps
                      .slice(0, 4)
                      .map((item) =>
                        item.suggestedTargetDate
                          ? `${item.title} (${item.suggestedTargetDate})`
                          : item.title,
                      )
                      .join("、")}
                  </p>
                ) : null}
                <AdminLaunchWeeklyFocusForm
                  adminToken={adminToken}
                  items={launchWeeklyFocus.focusItems.slice(0, 5)}
                />
              </div>

              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  可复制本周看板
                </div>
                <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                  {launchWeeklyFocus.copyText}
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">域名与部署落地</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                {launchDeploymentPlan.label}
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchDeploymentPlan.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchDeploymentPlan.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchDeploymentPlan.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  APP_URL / HTTPS / 预检
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">APP_URL</p>
              <p className="mt-2 break-words text-sm font-semibold leading-6 text-[#fff7e8]">
                {launchDeploymentPlan.deployment.appUrl}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                {launchDeploymentPlan.summary.appUrlReady ? "已闭合" : "未闭合"}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">域名外部事项</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchDeploymentPlan.deployment.domainStatus}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">部署变量</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchDeploymentPlan.summary.deployEnvBlocking}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">阻断变量</p>
            </div>
            <div className="rounded-md border border-[#3c8b72] bg-[#3c8b72]/10 p-4">
              <p className="text-xs text-[#b9ad99]">公网回调</p>
              <p className="mt-2 text-2xl font-semibold text-[#cfe9df]">
                {launchDeploymentPlan.summary.requiredCallbacksReady}/
                {launchDeploymentPlan.summary.requiredCallbacksTotal}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">健康检查</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchDeploymentPlan.deployment.healthReady} ready
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                {launchDeploymentPlan.deployment.healthWarning} warning /{" "}
                {launchDeploymentPlan.deployment.healthBlocking} blocking
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">验收证据</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchDeploymentPlan.evidenceSummary.readyItems}/
                {launchDeploymentPlan.evidenceSummary.trackedItems || 9}
              </p>
              <p className="mt-1 break-words text-xs leading-5 text-[#b9ad99]">
                {launchDeploymentPlan.deployment.latestEvidenceAt
                  ? launchDeploymentPlan.deployment.latestEvidenceAt
                      .slice(0, 16)
                      .replace("T", " ")
                  : "暂无"}
              </p>
            </div>
            <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-4">
              <p className="text-xs text-[#b9ad99]">阻断步骤</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchDeploymentPlan.summary.blocking}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                {launchDeploymentPlan.summary.ready}/{launchDeploymentPlan.summary.total} ready
              </p>
            </div>
          </div>

          <div className="mt-5">
            <AdminLaunchDeploymentAcceptanceEvidenceForm
              adminToken={adminToken}
              records={launchDeploymentPlan.evidenceRecords}
            />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                部署上线步骤
              </div>
              <div className="mt-4 space-y-3">
                {launchDeploymentPlan.steps.map((step) => {
                  const style = statusStyle(step.status);
                  const Icon = style.icon;

                  return (
                    <article key={step.id} className={`rounded-md border p-3 ${style.className}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-[#b9ad99]">
                            步骤 {step.order} · {step.owner}
                          </p>
                          <p className="mt-1 font-semibold text-[#fff7e8]">{step.title}</p>
                        </div>
                        <Icon size={14} aria-hidden="true" />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{step.detail}</p>
                      <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                        动作：{step.action}
                      </p>
                      {step.envKeys?.length ? (
                        <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#f0d49a]">
                          变量：{step.envKeys.join("、")}
                        </p>
                      ) : null}
                      {step.routes?.length ? (
                        <p className="mt-2 break-words rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                          路径：{step.routes.slice(0, 6).join("、")}
                          {step.routes.length > 6 ? " 等" : ""}
                        </p>
                      ) : null}
                      {step.commands?.length ? (
                        <p className="mt-2 break-words rounded-md bg-[#080705]/70 p-2 font-mono text-xs leading-5 text-[#f0d49a]">
                          {step.commands.join("；")}
                        </p>
                      ) : null}
                      <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                        证据：{step.evidence}
                      </p>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  优先部署补齐项
                </div>
                <div className="mt-4 space-y-3">
                  {launchDeploymentPlan.nextSteps.length > 0 ? (
                    launchDeploymentPlan.nextSteps.map((step) => {
                      const style = statusStyle(step.status);
                      const Icon = style.icon;

                      return (
                        <article key={step.id} className={`rounded-md border p-3 ${style.className}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs text-[#b9ad99]">步骤 {step.order}</p>
                              <p className="mt-1 font-semibold text-[#fff7e8]">{step.title}</p>
                            </div>
                            <Icon size={14} aria-hidden="true" />
                          </div>
                          <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{step.action}</p>
                          <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                            证据：{step.evidence}
                          </p>
                        </article>
                      );
                    })
                  ) : (
                    <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                      当前没有域名与部署缺口。
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  部署命令与烟测
                </div>
                <div className="mt-4 space-y-3">
                  {launchDeploymentPlan.commandGroups.map((group) => (
                    <article key={group.title} className="rounded-md border border-[#3a3023] bg-[#12100d] p-3">
                      <p className="font-semibold text-[#fff7e8]">{group.title}</p>
                      <p className="mt-1 text-xs leading-5 text-[#b9ad99]">{group.when}</p>
                      <div className="mt-3 space-y-2">
                        {group.commands.map((command) => (
                          <div key={`${group.title}-${command.label}`} className="rounded-md bg-[#080705] p-2">
                            <p className="text-xs font-semibold text-[#f0d49a]">
                              {command.label}
                            </p>
                            <p className="mt-1 break-words font-mono text-xs leading-5 text-[#fff7e8]">
                              {command.command}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-[#b9ad99]">
                              {command.detail}
                            </p>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  部署证据清单
                </div>
                <div className="mt-4 space-y-2">
                  {launchDeploymentPlan.evidence.map((item) => (
                    <p
                      key={item}
                      className="rounded-md bg-[#12100d] p-2 text-xs leading-5 text-[#d8cab2]"
                    >
                      {item}
                    </p>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  可复制部署计划
                </div>
                <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                  {launchDeploymentPlan.copyText}
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">AI 与图片能力</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                {launchAiStoragePlan.label}
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchAiStoragePlan.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchAiStoragePlan.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchAiStoragePlan.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  OpenAI / 七牛
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">OpenAI</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchAiStoragePlan.diagnostics.openai}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">七牛</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchAiStoragePlan.diagnostics.qiniu}
              </p>
            </div>
            <div className="rounded-md border border-[#3c8b72] bg-[#3c8b72]/10 p-4">
              <p className="text-xs text-[#b9ad99]">OpenAI 闭环</p>
              <p className="mt-2 font-semibold text-[#cfe9df]">
                {launchAiStoragePlan.summary.openaiReady ? "已闭合" : "未闭合"}
              </p>
            </div>
            <div className="rounded-md border border-[#3c8b72] bg-[#3c8b72]/10 p-4">
              <p className="text-xs text-[#b9ad99]">七牛闭环</p>
              <p className="mt-2 font-semibold text-[#cfe9df]">
                {launchAiStoragePlan.summary.qiniuReady ? "已闭合" : "未闭合"}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">AI 样本</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchAiStoragePlan.summary.aiCostSamples}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                缺成本 {launchAiStoragePlan.summary.missingCostSamples}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">验收证据</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchAiStoragePlan.evidenceSummary.readyItems}/
                {launchAiStoragePlan.evidenceSummary.trackedItems || 9}
              </p>
              <p className="mt-1 break-words text-xs leading-5 text-[#b9ad99]">
                {launchAiStoragePlan.aiStorage.latestEvidenceAt
                  ? launchAiStoragePlan.aiStorage.latestEvidenceAt
                      .slice(0, 16)
                      .replace("T", " ")
                  : "暂无"}
              </p>
            </div>
            <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-4">
              <p className="text-xs text-[#b9ad99]">阻断步骤</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchAiStoragePlan.summary.blocking}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <AdminLaunchAiStorageAcceptanceEvidenceForm
              adminToken={adminToken}
              records={launchAiStoragePlan.evidenceRecords}
            />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                AI 与图片上线步骤
              </div>
              <div className="mt-4 space-y-3">
                {launchAiStoragePlan.steps.map((step) => {
                  const style = statusStyle(step.status);
                  const Icon = style.icon;

                  return (
                    <article key={step.id} className={`rounded-md border p-3 ${style.className}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-[#b9ad99]">
                            步骤 {step.order} · {step.owner}
                          </p>
                          <p className="mt-1 font-semibold text-[#fff7e8]">{step.title}</p>
                        </div>
                        <Icon size={14} aria-hidden="true" />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{step.detail}</p>
                      <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                        动作：{step.action}
                      </p>
                      {step.envKeys?.length ? (
                        <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#f0d49a]">
                          变量：{step.envKeys.join("、")}
                        </p>
                      ) : null}
                      {step.routes?.length ? (
                        <p className="mt-2 break-words rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                          路径：{step.routes.join("、")}
                        </p>
                      ) : null}
                      <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                        证据：{step.evidence}
                      </p>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  优先补齐项
                </div>
                <div className="mt-4 space-y-3">
                  {launchAiStoragePlan.nextSteps.length > 0 ? (
                    launchAiStoragePlan.nextSteps.map((step) => {
                      const style = statusStyle(step.status);
                      const Icon = style.icon;

                      return (
                        <article key={step.id} className={`rounded-md border p-3 ${style.className}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs text-[#b9ad99]">步骤 {step.order}</p>
                              <p className="mt-1 font-semibold text-[#fff7e8]">{step.title}</p>
                            </div>
                            <Icon size={14} aria-hidden="true" />
                          </div>
                          <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{step.action}</p>
                        </article>
                      );
                    })
                  ) : (
                    <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                      当前没有 AI 与图片能力缺口。
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  配置与烟测顺序
                </div>
                <div className="mt-4 space-y-3">
                  {launchAiStoragePlan.commandGroups.map((group) => (
                    <article key={group.title} className="rounded-md border border-[#3a3023] bg-[#12100d] p-3">
                      <p className="font-semibold text-[#fff7e8]">{group.title}</p>
                      <p className="mt-1 text-xs leading-5 text-[#b9ad99]">{group.when}</p>
                      <div className="mt-3 space-y-2">
                        {group.commands.map((command) => (
                          <div key={`${group.title}-${command.label}`} className="rounded-md bg-[#080705] p-2">
                            <p className="text-xs font-semibold text-[#f0d49a]">
                              {command.label}
                            </p>
                            <p className="mt-1 break-words font-mono text-xs leading-5 text-[#fff7e8]">
                              {command.command}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-[#b9ad99]">
                              {command.detail}
                            </p>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  可复制 AI/图片计划
                </div>
                <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                  {launchAiStoragePlan.copyText}
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">单位经济</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                产品毛利与 AI 成本复盘
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchUnitEconomics.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchUnitEconomics.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchUnitEconomics.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {launchUnitEconomics.label}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">产品</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchUnitEconomics.summary.productCount}
              </p>
            </div>
            <div className="rounded-md border border-[#c8a15a] bg-[#c8a15a]/10 p-4">
              <p className="text-xs text-[#b9ad99]">warning</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d49a]">
                {launchUnitEconomics.summary.warning}
              </p>
            </div>
            <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-4">
              <p className="text-xs text-[#b9ad99]">blocking</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchUnitEconomics.summary.blocking}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">OpenAI 日志</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchUnitEconomics.summary.openaiLogCount}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">缺成本</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchUnitEconomics.summary.missingOpenaiCostCount}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">AI tokens</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchUnitEconomics.summary.aiTokens}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">成本样本</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchUnitEconomics.summary.costSampleCount}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">最近样本</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#fff7e8]">
                {launchUnitEconomics.summary.latestCostSampleAt
                  ? launchUnitEconomics.summary.latestCostSampleAt.slice(5, 16).replace("T", " ")
                  : "暂无"}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <AdminLaunchUnitEconomicsSampleForm
              adminToken={adminToken}
              samples={launchUnitEconomics.costSamples}
            />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                产品折算与缺口
              </div>
              <div className="mt-4 grid gap-3">
                {launchUnitEconomics.nextIssues.length > 0 ? (
                  launchUnitEconomics.nextIssues.map((issue) => {
                    const style = statusStyle(issue.status);
                    const Icon = style.icon;

                    return (
                      <article key={issue.id} className={`rounded-md border p-3 ${style.className}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-[#b9ad99]">{issue.group}</p>
                            <p className="mt-1 font-semibold text-[#fff7e8]">{issue.title}</p>
                          </div>
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{issue.detail}</p>
                        <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                          {issue.action}
                        </p>
                      </article>
                    );
                  })
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {launchUnitEconomics.products.slice(0, 6).map((product) => (
                      <article key={product.code} className="rounded-md border border-[#3a3023] bg-[#12100d] p-3">
                        <p className="font-semibold text-[#fff7e8]">{product.name}</p>
                        <p className="mt-2 text-sm text-[#b9ad99]">
                          {product.priceLabel}
                          {product.starGrant ? ` / ${product.starGrant} 星力` : ""}
                          {product.starCostLabel ? ` / ${product.starCostLabel}` : ""}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
                {launchUnitEconomics.costSamples.length > 0 ? (
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {launchUnitEconomics.costSamples.slice(0, 4).map((sample) => (
                      <article key={sample.id} className="rounded-md border border-[#3a3023] bg-[#12100d] p-3">
                        <p className="text-xs text-[#b9ad99]">
                          {sample.metadata.savedAt.slice(0, 16).replace("T", " ")}
                        </p>
                        <p className="mt-1 font-semibold text-[#fff7e8]">
                          {sample.featureCode} / {sample.model}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-[#b9ad99]">
                          {sample.tokensIn + sample.tokensOut} tokens ·{" "}
                          {(sample.costCents / 100).toFixed(2)} 元
                        </p>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                可复制单位经济检查
              </div>
              <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                {launchUnitEconomics.copyText}
              </pre>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">平台申请材料</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                备案、支付、存储与模型平台填表包
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchApplicationPack.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchApplicationPack.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchApplicationPack.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {launchApplicationPack.label}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-6">
            <div className="rounded-md border border-[#3c8b72] bg-[#3c8b72]/10 p-4">
              <p className="text-xs text-[#b9ad99]">ready</p>
              <p className="mt-2 text-2xl font-semibold text-[#cfe9df]">
                {launchApplicationPack.summary.ready}
              </p>
            </div>
            <div className="rounded-md border border-[#c8a15a] bg-[#c8a15a]/10 p-4">
              <p className="text-xs text-[#b9ad99]">warning</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d49a]">
                {launchApplicationPack.summary.warning}
              </p>
            </div>
            <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-4">
              <p className="text-xs text-[#b9ad99]">blocking</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchApplicationPack.summary.blocking}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">平台</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchApplicationPack.summary.total}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">字段</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchApplicationPack.summary.fields}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">变量</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchApplicationPack.summary.envKeys}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">回执</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchApplicationPack.summary.receipts}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">证据链接</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchApplicationPack.summary.evidenceLinks}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                待提交平台
              </div>
              <div className="mt-4 grid gap-3">
                {launchApplicationPack.nextPlatforms.length > 0 ? (
                  launchApplicationPack.nextPlatforms.map((platform) => {
                    const style = statusStyle(platform.status);
                    const Icon = style.icon;

                    return (
                      <article key={platform.id} className={`rounded-md border p-3 ${style.className}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-[#b9ad99]">
                              {platform.owner} · {platform.label}
                            </p>
                            <p className="mt-1 font-semibold text-[#fff7e8]">{platform.title}</p>
                          </div>
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#d8cab2]">
                          {platform.purpose}
                        </p>
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {platform.fields.slice(0, 4).map((field) => (
                            <div
                              key={`${platform.id}-${field.label}`}
                              className="rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]"
                            >
                              <span className="block font-semibold text-[#fff7e8]">
                                {field.label}
                              </span>
                              <span className="break-all">{field.value}</span>
                            </div>
                          ))}
                        </div>
                        <p className="mt-3 break-words rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                          变量：{platform.envKeys.join("、") || "无"}
                        </p>
                        {platform.submission.receiptNo ||
                        platform.submission.evidenceUrl ||
                        platform.submission.evidenceNote ||
                        platform.submission.targetDate ? (
                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            {platform.submission.statusLabel ? (
                              <p className="rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                                外部状态：{platform.submission.statusLabel}
                              </p>
                            ) : null}
                            {platform.submission.targetDate ? (
                              <p className="rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                                目标日期：{platform.submission.targetDate}
                              </p>
                            ) : null}
                            {platform.submission.receiptNo ? (
                              <p className="rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                                回执：{platform.submission.receiptNo}
                              </p>
                            ) : null}
                            {platform.submission.evidenceUrl ? (
                              <a
                                href={platform.submission.evidenceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-md bg-[#080705]/70 p-2 text-xs font-semibold leading-5 text-[#f0d49a] hover:text-[#fff7e8]"
                              >
                                查看证据链接
                              </a>
                            ) : null}
                            {platform.submission.evidenceNote ? (
                              <p className="rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99] md:col-span-2">
                                证据备注：{platform.submission.evidenceNote}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                        <p className="mt-2 text-sm leading-6 text-[#d8cab2]">
                          下一步：{platform.nextAction}
                        </p>
                        <a
                          href={platform.officialUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex text-xs font-semibold text-[#f0d49a] hover:text-[#fff7e8]"
                        >
                          官方入口
                        </a>
                      </article>
                    );
                  })
                ) : (
                  <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                    当前没有待提交平台。
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                可复制申请材料
              </div>
              <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                {launchApplicationPack.copyText}
              </pre>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">创始人办理包</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                主体、备案、支付与云服务关键路径
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchFounderDossier.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchFounderDossier.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchFounderDossier.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {launchFounderDossier.label}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-md border border-[#3c8b72] bg-[#3c8b72]/10 p-4">
              <p className="text-xs text-[#b9ad99]">已完成</p>
              <p className="mt-2 text-2xl font-semibold text-[#cfe9df]">
                {launchFounderDossier.summary.ready}
              </p>
            </div>
            <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-4">
              <p className="text-xs text-[#b9ad99]">阻断</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchFounderDossier.summary.blocking}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">办理事项</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchFounderDossier.summary.total}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">材料项</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchFounderDossier.summary.documentCount}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">生产变量</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchFounderDossier.summary.envKeyCount}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">关键路径</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchFounderDossier.criticalPath.length}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-md border border-[#3a3023] bg-[#080705] p-4">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
              <div>
                <p className="text-sm font-semibold text-[#f0d49a]">主体路径决策</p>
                <h3 className="mt-2 font-ritual text-2xl text-[#fff7e8]">
                  {launchFounderDossier.pathDecision.label}
                </h3>
                <p className="mt-3 max-w-4xl text-sm leading-6 text-[#b9ad99]">
                  {launchFounderDossier.pathDecision.reason}
                </p>
              </div>
              {(() => {
                const style = statusStyle(launchFounderDossier.pathDecision.status);
                const Icon = style.icon;

                return (
                  <span
                    className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                  >
                    <Icon size={15} aria-hidden="true" />
                    {launchFounderDossier.pathDecision.recommendedPath.title}
                  </span>
                );
              })()}
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
              <div className="rounded-md border border-[#3a3023] bg-[#12100d] p-4">
                <p className="text-xs text-[#b9ad99]">第一版推荐</p>
                <p className="mt-2 font-semibold text-[#fff7e8]">
                  {launchFounderDossier.pathDecision.recommendedPath.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#d8cab2]">
                  {launchFounderDossier.pathDecision.recommendedPath.fit}
                </p>
                <p className="mt-3 rounded-md bg-[#080705] p-3 text-xs leading-5 text-[#b9ad99]">
                  取舍：{launchFounderDossier.pathDecision.recommendedPath.tradeoff}
                </p>
                <p className="mt-3 text-xs leading-5 text-[#f0d49a]">
                  解锁：{launchFounderDossier.pathDecision.recommendedPath.unlocks.join("、")}
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {launchFounderDossier.pathDecision.immediateActions.map((item) => {
                  const style = statusStyle(item.status);
                  const Icon = style.icon;

                  return (
                    <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-[#b9ad99]">{item.owner}</p>
                          <p className="mt-1 font-semibold leading-6 text-[#fff7e8]">
                            {item.title}
                          </p>
                        </div>
                        <Icon size={14} aria-hidden="true" />
                      </div>
                      <p className="mt-2 text-xs leading-5 text-[#d8cab2]">{item.action}</p>
                      <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                        证据：{item.evidence}
                      </p>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              {launchFounderDossier.pathDecision.unlockSequence.map((item) => {
                const style = statusStyle(item.status);
                const Icon = style.icon;

                return (
                  <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-[#b9ad99]">{item.statusLabel}</p>
                        <p className="mt-1 text-sm font-semibold leading-5 text-[#fff7e8]">
                          {item.title}
                        </p>
                      </div>
                      <Icon size={13} aria-hidden="true" />
                    </div>
                    <p className="mt-2 text-xs leading-5 text-[#b9ad99]">
                      变量：{item.envKeys.join("、") || "无"}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            {launchFounderDossier.entityPaths.map((path) => (
              <article key={path.id} className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-[#b9ad99]">
                      {path.recommendation === "recommended"
                        ? "第一版优先"
                        : path.recommendation === "optional"
                          ? "可选路径"
                          : "后续预留"}
                    </p>
                    <p className="mt-1 font-semibold text-[#fff7e8]">{path.title}</p>
                  </div>
                  <span className="rounded-md border border-[#6a5431] px-2 py-1 text-xs text-[#f0d49a]">
                    {path.recommendation}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[#d8cab2]">{path.fit}</p>
                <p className="mt-3 rounded-md bg-[#12100d] p-3 text-sm leading-6 text-[#b9ad99]">
                  {path.tradeoff}
                </p>
                <p className="mt-3 text-xs leading-5 text-[#b9ad99]">
                  解锁：{path.unlocks.join("、")}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                本轮关键路径
              </div>
              <div className="mt-4 grid gap-3">
                {launchFounderDossier.nextOfflineActions.length > 0 ? (
                  launchFounderDossier.nextOfflineActions.map((step) => {
                    const style = statusStyle(step.status);
                    const Icon = style.icon;

                    return (
                      <article key={step.id} className={`rounded-md border p-3 ${style.className}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-[#b9ad99]">
                              {step.phase} · {step.owner} · {step.statusLabel}
                            </p>
                            <p className="mt-1 font-semibold text-[#fff7e8]">{step.title}</p>
                          </div>
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        {step.blockedBy.length > 0 ? (
                          <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#f0d49a]">
                            前置依赖：{step.blockedBy.join("、")}
                          </p>
                        ) : null}
                        <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{step.action}</p>
                        <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                          产物：{step.outputs.slice(0, 3).join("、")}；变量：
                          {step.envKeys.join("、") || "无"}
                        </p>
                      </article>
                    );
                  })
                ) : (
                  <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                    当前没有待办理关键路径。
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                可复制办理摘要
              </div>
              <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                {launchFounderDossier.copyText}
              </pre>
              <div className="mt-4 space-y-2">
                {launchFounderDossier.officialRefs.slice(0, 5).map((ref) => (
                  <a
                    key={ref.url}
                    href={ref.url}
                    className="block rounded-md border border-[#3a3023] bg-[#12100d] p-3 text-sm text-[#d8cab2] transition hover:border-[#c8a15a]"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="font-semibold text-[#fff7e8]">{ref.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-[#b9ad99]">{ref.note}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">上线总闸</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                Go / No-Go 判断
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchReadiness.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchReadiness.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchReadiness.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {launchReadiness.label}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-[#3c8b72] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">ready</p>
              <p className="mt-2 text-2xl font-semibold text-[#cfe9df]">
                {launchReadiness.summary.ready}
              </p>
            </div>
            <div className="rounded-md border border-[#c8a15a] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">warning</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d49a]">
                {launchReadiness.summary.warning}
              </p>
            </div>
            <div className="rounded-md border border-[#b34c32] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">blocking</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchReadiness.summary.blocking}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">检查项</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchReadiness.summary.total}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {launchReadiness.nextActions.length > 0 ? (
              launchReadiness.nextActions.map((item) => {
                const style = statusStyle(item.status);
                const Icon = style.icon;

                return (
                  <article key={item.id} className={`rounded-md border p-4 ${style.className}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-[#b9ad99]">{item.group}</p>
                        <p className="mt-1 font-semibold text-[#fff7e8]">{item.label}</p>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#080705]/70 px-2 py-1 text-xs">
                        <Icon size={14} aria-hidden="true" />
                        {style.label}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#d8cab2]">{item.detail}</p>
                    <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#b9ad99]">
                      {item.action}
                    </p>
                  </article>
                );
              })
            ) : (
              <p className="rounded-md bg-[#080705] p-4 text-sm text-[#b9ad99]">
                暂无阻断或警告项。
              </p>
            )}
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">上线验收</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                端到端验收用例矩阵
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                覆盖账号、会员档案、AI 对话、命理工具、手相上传、支付、深度报告、分享归因和后台证据，正式收费前逐项手测并留证。
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchAcceptance.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {launchAcceptance.label}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-5">
            <div className="rounded-md border border-[#3c8b72] bg-[#3c8b72]/10 p-4">
              <p className="text-xs text-[#b9ad99]">可执行</p>
              <p className="mt-2 text-2xl font-semibold text-[#cfe9df]">
                {launchAcceptance.summary.ready}
              </p>
            </div>
            <div className="rounded-md border border-[#c8a15a] bg-[#c8a15a]/10 p-4">
              <p className="text-xs text-[#b9ad99]">待复核</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d49a]">
                {launchAcceptance.summary.warning}
              </p>
            </div>
            <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-4">
              <p className="text-xs text-[#b9ad99]">阻断</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchAcceptance.summary.blocking}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">用例</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchAcceptance.summary.total}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">已留证</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchAcceptance.summary.casesWithEvidence}/{launchAcceptance.summary.total}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                {launchAcceptance.summary.latestEvidenceAt
                  ? launchAcceptance.summary.latestEvidenceAt.slice(0, 16).replace("T", " ")
                  : "暂无"}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <AdminLaunchAcceptanceEvidenceForm
              adminToken={adminToken}
              cases={launchAcceptance.cases}
              records={launchAcceptance.evidenceRecords}
            />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                优先验收用例
              </div>
              <div className="mt-4 space-y-3">
                {launchAcceptance.nextCases.length > 0 ? (
                  launchAcceptance.nextCases.slice(0, 6).map((item) => {
                    const style = statusStyle(item.status);
                    const Icon = style.icon;

                    return (
                      <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-[#b9ad99]">
                              {item.group} · {item.owner}
                            </p>
                            <p className="mt-1 font-semibold text-[#fff7e8]">{item.title}</p>
                          </div>
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.goal}</p>
                        <p className="mt-2 break-words rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                          路径：{item.routes.slice(0, 5).join("、")}
                          {item.routes.length > 5 ? " 等" : ""}
                        </p>
                        {item.relatedIssues.length > 0 ? (
                          <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#f0d49a]">
                            先处理：{item.relatedIssues.slice(0, 3).map((issue) => issue.label).join("、")}
                          </p>
                        ) : null}
                        {item.latestEvidence ? (
                          <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                            最近留证：{item.latestEvidence.metadata.status} ·{" "}
                            {item.latestEvidence.metadata.savedAt.slice(0, 16).replace("T", " ")}
                          </p>
                        ) : null}
                      </article>
                    );
                  })
                ) : (
                  <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                    当前没有阻断或待复核用例。
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                可复制验收矩阵
              </div>
              <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                {launchAcceptance.copyText}
              </pre>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">第三方配置</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                回调、域名与协议链接
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                集中列出支付宝、微信支付、七牛、协议材料和微信开放平台申请时需要填写或核对的 URL。
              </p>
              <p className="mt-2 max-w-3xl break-all leading-7 text-[#d8cab2]">
                APP_URL：{launchCallbacks.appUrl}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchCallbacks.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {launchCallbacks.label}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="rounded-md border border-[#3c8b72] bg-[#3c8b72]/10 p-4">
              <p className="text-xs text-[#b9ad99]">ready</p>
              <p className="mt-2 text-2xl font-semibold text-[#cfe9df]">
                {launchCallbacks.summary.ready}
              </p>
            </div>
            <div className="rounded-md border border-[#c8a15a] bg-[#c8a15a]/10 p-4">
              <p className="text-xs text-[#b9ad99]">warning</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d49a]">
                {launchCallbacks.summary.warning}
              </p>
            </div>
            <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-4">
              <p className="text-xs text-[#b9ad99]">blocking</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchCallbacks.summary.blocking}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">配置项</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchCallbacks.summary.total}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                优先核对项
              </div>
              <div className="mt-4 space-y-3">
                {launchCallbacks.nextItems.length > 0 ? (
                  launchCallbacks.nextItems.map((item) => {
                    const style = statusStyle(item.status);
                    const Icon = style.icon;

                    return (
                      <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-[#b9ad99]">
                              {item.group} · {item.platform} · {item.configName}
                            </p>
                            <p className="mt-1 font-semibold text-[#fff7e8]">{item.title}</p>
                          </div>
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        <p className="mt-2 break-all rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#d8cab2]">
                          {item.method ? `${item.method} ` : ""}
                          {item.value}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.action}</p>
                      </article>
                    );
                  })
                ) : (
                  <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                    当前回调配置清单没有待处理项。
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                可复制配置清单
              </div>
              <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                {launchCallbacks.copyText}
              </pre>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">合规核对</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                协议主体与备案一致性
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchCompliance.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchCompliance.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchCompliance.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {launchCompliance.label}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-5">
            <div className="rounded-md border border-[#3c8b72] bg-[#3c8b72]/10 p-4">
              <p className="text-xs text-[#b9ad99]">ready</p>
              <p className="mt-2 text-2xl font-semibold text-[#cfe9df]">
                {launchCompliance.summary.ready}
              </p>
            </div>
            <div className="rounded-md border border-[#c8a15a] bg-[#c8a15a]/10 p-4">
              <p className="text-xs text-[#b9ad99]">warning</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d49a]">
                {launchCompliance.summary.warning}
              </p>
            </div>
            <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-4">
              <p className="text-xs text-[#b9ad99]">blocking</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchCompliance.summary.blocking}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">核对项</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchCompliance.summary.total}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">协议版本</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">{launchCompliance.version}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                优先合规项
              </div>
              <div className="mt-4 space-y-3">
                {launchCompliance.nextItems.length > 0 ? (
                  launchCompliance.nextItems.slice(0, 6).map((item) => {
                    const style = statusStyle(item.status);
                    const Icon = style.icon;

                    return (
                      <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-[#b9ad99]">{item.group}</p>
                            <p className="mt-1 font-semibold text-[#fff7e8]">{item.title}</p>
                          </div>
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.action}</p>
                        <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                          证据：{item.evidence}
                        </p>
                        <p className="mt-2 break-words rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                          路径：{item.routes.join("、")}
                        </p>
                      </article>
                    );
                  })
                ) : (
                  <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                    当前没有合规阻断或待复核项。
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                可复制合规核对
              </div>
              <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                {launchCompliance.copyText}
              </pre>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">排期风险</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                上线排期风险
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                根据外部事项的目标日期识别逾期、临期和未排期项目，目标日期可在下方外部上线事项表单中维护。
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                当前日期：{launchSchedule.today}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchSchedule.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {launchSchedule.label}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-5">
            <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-4">
              <p className="text-xs text-[#b9ad99]">逾期</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchSchedule.summary.overdue}
              </p>
            </div>
            <div className="rounded-md border border-[#c8a15a] bg-[#c8a15a]/10 p-4">
              <p className="text-xs text-[#b9ad99]">临期</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d49a]">
                {launchSchedule.summary.dueSoon}
              </p>
            </div>
            <div className="rounded-md border border-[#c8a15a] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">未排期</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchSchedule.summary.unscheduled}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">已排期</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchSchedule.summary.scheduled}
              </p>
            </div>
            <div className="rounded-md border border-[#3c8b72] bg-[#3c8b72]/10 p-4">
              <p className="text-xs text-[#b9ad99]">已完成</p>
              <p className="mt-2 text-2xl font-semibold text-[#cfe9df]">
                {launchSchedule.summary.ready}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                排期优先项
              </div>
              <div className="mt-4 space-y-3">
                {launchSchedule.nextItems.length > 0 ? (
                  launchSchedule.nextItems.slice(0, 6).map((item) => {
                    const style = statusStyle(item.scheduleStatus);
                    const Icon = style.icon;

                    return (
                      <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-[#b9ad99]">
                              {item.phase} · {item.owner}
                            </p>
                            <p className="mt-1 font-semibold text-[#fff7e8]">{item.title}</p>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#080705]/70 px-2 py-1 text-xs">
                            <Icon size={14} aria-hidden="true" />
                            {item.statusLabel}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.detail}</p>
                        <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                          {item.targetDate
                            ? `目标日期：${item.targetDate}`
                            : `建议目标日期：${item.suggestedDate}`}
                        </p>
                      </article>
                    );
                  })
                ) : (
                  <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                    当前没有排期风险。
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                可复制排期风险
              </div>
              <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                {launchSchedule.copyText}
              </pre>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">灰度节奏</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                分阶段放量计划
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                按资质主体、生产配置、第三方联调、小额真实订单和放量复盘拆分阶段，避免跳过真实收费前的关键验收。
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                当前阶段：{launchRollout.currentPhase.title}，{launchRollout.currentPhase.goal}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchRollout.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {launchRollout.label}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-5">
            {launchRollout.phases.map((phase) => {
              const style = statusStyle(phase.status);
              const Icon = style.icon;

              return (
                <article key={phase.id} className={`rounded-md border p-4 ${style.className}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-[#b9ad99]">阶段 {phase.order}</p>
                      <p className="mt-1 font-semibold text-[#fff7e8]">{phase.title}</p>
                    </div>
                    <Icon size={15} aria-hidden="true" />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#d8cab2]">{phase.label}</p>
                  <p className="mt-3 text-xs leading-5 text-[#b9ad99]">
                    待处理：{phase.blockers.filter((item) => item.status !== "ready").length}
                  </p>
                </article>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                当前阶段动作
              </div>
              <div className="mt-4 space-y-3">
                {launchRollout.currentPhase.nextActions.length > 0 ? (
                  launchRollout.currentPhase.nextActions.map((action, index) => (
                    <p
                      key={`${index}:${action}`}
                      className="rounded-md bg-[#12100d] p-3 text-sm leading-6 text-[#d8cab2]"
                    >
                      {action}
                    </p>
                  ))
                ) : (
                  <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                    当前阶段暂无待处理动作。
                  </p>
                )}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-md border border-[#3a3023] bg-[#12100d] p-3">
                  <p className="text-sm font-semibold text-[#fff7e8]">进入条件</p>
                  <p className="mt-2 text-xs leading-5 text-[#b9ad99]">
                    {launchRollout.currentPhase.entryCriteria.join("；")}
                  </p>
                </div>
                <div className="rounded-md border border-[#3a3023] bg-[#12100d] p-3">
                  <p className="text-sm font-semibold text-[#fff7e8]">退出证据</p>
                  <p className="mt-2 text-xs leading-5 text-[#b9ad99]">
                    {launchRollout.currentPhase.exitCriteria.join("；")}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                可复制放量计划
              </div>
              <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                {launchRollout.copyText}
              </pre>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">执行工作台</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                上线执行工作计划
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                把外部办理、平台申请、生产变量、联调验收、单位经济和证据放量拆成六条工作线，方便同步推进你手上的资质事项和技术侧配置验收。
              </p>
              {launchWorkplan.activeLane ? (
                <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                  当前优先工作线：{launchWorkplan.activeLane.title}，{launchWorkplan.activeLane.description}
                </p>
              ) : null}
            </div>
            {(() => {
              const style = statusStyle(launchWorkplan.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {launchWorkplan.label}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {launchWorkplan.lanes.map((lane) => {
              const style = statusStyle(lane.status);
              const Icon = style.icon;

              return (
                <article key={lane.id} className={`rounded-md border p-4 ${style.className}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#fff7e8]">{lane.title}</p>
                      <p className="mt-2 text-sm leading-6 text-[#b9ad99]">{lane.description}</p>
                    </div>
                    <Icon size={15} aria-hidden="true" />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#d8cab2]">
                    {lane.summary.blocking} blocking · {lane.summary.warning} warning ·{" "}
                    {lane.summary.ready}/{lane.summary.total} ready
                  </p>
                  <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-xs leading-5 text-[#b9ad99]">
                    {lane.ownerHint}
                  </p>
                </article>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                本轮优先任务
              </div>
              <div className="mt-4 space-y-3">
                {launchWorkplan.workingSet.length > 0 ? (
                  launchWorkplan.workingSet.slice(0, 8).map((task) => {
                    const style = statusStyle(task.status);
                    const Icon = style.icon;

                    return (
                      <article key={task.id} className={`rounded-md border p-3 ${style.className}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-[#b9ad99]">
                              {task.laneTitle} · {task.owner} · {task.phase}
                            </p>
                            <p className="mt-1 font-semibold text-[#fff7e8]">{task.title}</p>
                          </div>
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        {task.blockedBy.length > 0 ? (
                          <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#f0d49a]">
                            依赖：{task.blockedBy.slice(0, 4).join("、")}
                          </p>
                        ) : null}
                        <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{task.action}</p>
                        <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                          验收：{task.evidence}
                        </p>
                      </article>
                    );
                  })
                ) : (
                  <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                    当前无待执行任务。
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                可复制执行计划
              </div>
              <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                {launchWorkplan.copyText}
              </pre>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">目标规划</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                上线交接摘要
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                把收费上线包、生产总门禁、目标后续推进、外部办理、生产变量和证据归档压缩成一份可执行摘要，方便你同步处理主体、域名、备案和支付资质。
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchHandoff.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {launchHandoff.label}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">Go / No-Go</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchHandoff.snapshot.goNoGo.blocking} blocking ·{" "}
                {launchHandoff.snapshot.goNoGo.warning} warning
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">生产总门禁</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchHandoff.productionGate.releaseReady
                  ? "releaseReady=yes"
                  : "releaseReady=no"}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                {launchHandoff.productionGate.summary.blocking} blocking ·{" "}
                {launchHandoff.productionGate.summary.warning} warning
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">生产变量</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchHandoff.snapshot.environment.blocking} blocking ·{" "}
                {launchHandoff.snapshot.environment.warning} warning
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">外部办理</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchHandoff.snapshot.materials.pending} pending
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">Runbook</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchHandoff.snapshot.runbook.blocking} blocking ·{" "}
                {launchHandoff.snapshot.runbook.warning} warning
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">证据归档</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchHandoff.snapshot.evidence.label}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-md border border-[#3a3023] bg-[#080705] p-4">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
              <div>
                <p className="text-sm font-semibold text-[#f0d49a]">生产总门禁交接</p>
                <h3 className="mt-2 font-ritual text-2xl text-[#fff7e8]">
                  {launchHandoff.productionGate.label}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#b9ad99]">
                  {launchHandoff.productionGate.detail}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#d8cab2]">
                  {launchHandoff.productionGate.action}
                </p>
              </div>
              {(() => {
                const style = statusStyle(launchHandoff.productionGate.status);
                const Icon = style.icon;

                return (
                  <span
                    className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                  >
                    <Icon size={15} aria-hidden="true" />
                    {launchHandoff.productionGate.releaseReady
                      ? "releaseReady=yes"
                      : "releaseReady=no"}
                  </span>
                );
              })()}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-md bg-[#12100d] p-3">
                <p className="text-xs text-[#b9ad99]">门禁步骤</p>
                <p className="mt-2 font-semibold leading-6 text-[#fff7e8]">
                  {launchHandoff.productionGate.summary.blocking} blocking ·{" "}
                  {launchHandoff.productionGate.summary.warning} warning
                </p>
              </div>
              <div className="rounded-md bg-[#12100d] p-3">
                <p className="text-xs text-[#b9ad99]">细分检查</p>
                <p className="mt-2 font-semibold leading-6 text-[#fff7e8]">
                  {launchHandoff.productionGate.checkSummary.blocking} blocking ·{" "}
                  {launchHandoff.productionGate.checkSummary.warning} warning
                </p>
              </div>
              <div className="rounded-md bg-[#12100d] p-3">
                <p className="text-xs text-[#b9ad99]">优先项</p>
                <p className="mt-2 font-semibold leading-6 text-[#fff7e8]">
                  {launchHandoff.productionGate.nextActions[0]?.label ?? "暂无"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-md border border-[#3a3023] bg-[#080705] p-4">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
              <div>
                <p className="text-sm font-semibold text-[#f0d49a]">交接线下办理</p>
                <h3 className="mt-2 font-ritual text-2xl text-[#fff7e8]">
                  {launchHandoff.offlineAction.current.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#b9ad99]">
                  {launchHandoff.offlineAction.current.phase} ·{" "}
                  {launchHandoff.offlineAction.current.owner} · 目标日{" "}
                  {launchHandoff.offlineAction.current.dueLabel}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#d8cab2]">
                  {launchHandoff.offlineAction.current.action}
                </p>
              </div>
              {(() => {
                const style = statusStyle(launchHandoff.offlineAction.status);
                const Icon = style.icon;

                return (
                  <span
                    className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                  >
                    <Icon size={15} aria-hidden="true" />
                    {style.label}
                  </span>
                );
              })()}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-md bg-[#12100d] p-3">
                <p className="text-xs text-[#b9ad99]">线下办理当前动作</p>
                <p className="mt-2 font-semibold leading-6 text-[#fff7e8]">
                  {launchHandoff.offlineAction.current.title}
                </p>
              </div>
              <div className="rounded-md bg-[#12100d] p-3">
                <p className="text-xs text-[#b9ad99]">阻断 / 复核</p>
                <p className="mt-2 font-semibold leading-6 text-[#fff7e8]">
                  {launchHandoff.offlineAction.blocking} blocking ·{" "}
                  {launchHandoff.offlineAction.warning} warning
                </p>
              </div>
              <div className="rounded-md bg-[#12100d] p-3">
                <p className="text-xs text-[#b9ad99]">证据</p>
                <p className="mt-2 text-sm leading-6 text-[#d8cab2]">
                  {launchHandoff.offlineAction.current.evidence}
                </p>
              </div>
            </div>
            {launchHandoff.offlineAction.todayActions.length > 0 ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {launchHandoff.offlineAction.todayActions.slice(0, 4).map((item) => {
                  const style = statusStyle(item.status);
                  const Icon = style.icon;

                  return (
                    <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-[#b9ad99]">
                            {item.phase} · {item.owner} · {item.dueLabel}
                          </p>
                          <p className="mt-1 font-semibold text-[#fff7e8]">{item.title}</p>
                        </div>
                        <Icon size={14} aria-hidden="true" />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.action}</p>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="mt-5 rounded-md border border-[#3a3023] bg-[#080705] p-4">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
              <div>
                <p className="text-sm font-semibold text-[#f0d49a]">目标后续推进</p>
                <h3 className="mt-2 font-ritual text-2xl text-[#fff7e8]">
                  {launchHandoff.goalFollowup.label}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#b9ad99]">
                  {launchHandoff.goalFollowup.detail}
                </p>
              </div>
              {(() => {
                const style = statusStyle(launchHandoff.goalFollowup.status);
                const Icon = style.icon;

                return (
                  <span
                    className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                  >
                    <Icon size={15} aria-hidden="true" />
                    {style.label}
                  </span>
                );
              })()}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-md bg-[#12100d] p-3">
                <p className="text-xs text-[#b9ad99]">当前阶段</p>
                <p className="mt-2 font-semibold leading-6 text-[#fff7e8]">
                  {launchHandoff.goalFollowup.currentMilestone.title}
                </p>
                <p className="mt-1 text-xs text-[#b9ad99]">
                  {launchHandoff.goalFollowup.currentMilestone.owner} · 目标日{" "}
                  {launchHandoff.goalFollowup.currentMilestone.targetDate}
                </p>
              </div>
              <div className="rounded-md bg-[#12100d] p-3">
                <p className="text-xs text-[#b9ad99]">今日动作</p>
                <p className="mt-2 font-semibold leading-6 text-[#fff7e8]">
                  {launchHandoff.goalFollowup.summary.actionProgressSaved} 已记录 /{" "}
                  {launchHandoff.goalFollowup.summary.actionProgressDone} 已完成
                </p>
                <p className="mt-1 text-xs text-[#b9ad99]">
                  卡住 {launchHandoff.goalFollowup.summary.actionProgressBlocked}
                </p>
              </div>
              <div className="rounded-md bg-[#12100d] p-3">
                <p className="text-xs text-[#b9ad99]">本周承诺</p>
                <p className="mt-2 font-semibold leading-6 text-[#fff7e8]">
                  {launchHandoff.goalFollowup.summary.weeklyCommitmentCoveragePercent}%
                </p>
                <p className="mt-1 text-xs text-[#b9ad99]">
                  处理中 {launchHandoff.goalFollowup.summary.weeklyCommitmentInProgress} / 完成{" "}
                  {launchHandoff.goalFollowup.summary.weeklyCommitmentDone}
                </p>
              </div>
              <div className="rounded-md bg-[#12100d] p-3">
                <p className="text-xs text-[#b9ad99]">复盘检查</p>
                <p className="mt-2 font-semibold leading-6 text-[#fff7e8]">
                  {launchHandoff.goalFollowup.summary.blocking} 阻断 /{" "}
                  {launchHandoff.goalFollowup.summary.warning} 待补
                </p>
                <p className="mt-1 text-xs text-[#b9ad99]">
                  {launchHandoff.goalFollowup.summary.ready} 已闭合
                </p>
              </div>
              {(() => {
                const style = statusStyle(launchHandoff.goalFollowup.transitionGate.status);

                return (
                  <div className={`rounded-md border p-3 ${style.className}`}>
                    <p className="text-xs text-[#b9ad99]">阶段衔接</p>
                    <p className="mt-2 font-semibold leading-6">
                      {launchHandoff.goalFollowup.transitionGate.canAdvance
                        ? "canAdvance=yes"
                        : "canAdvance=no"}
                    </p>
                    <p className="mt-1 text-xs leading-5">
                      阻断 {launchHandoff.goalFollowup.transitionGate.blocking} · 复核{" "}
                      {launchHandoff.goalFollowup.transitionGate.warning}
                    </p>
                    <p className="mt-1 text-xs leading-5">
                      {launchHandoff.goalFollowup.transitionGate.label}
                    </p>
                  </div>
                );
              })()}
            </div>
            {launchHandoff.goalFollowup.items.length > 0 ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {launchHandoff.goalFollowup.items.slice(0, 4).map((item) => {
                  const style = statusStyle(item.status);
                  const Icon = style.icon;

                  return (
                    <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#fff7e8]">{item.title}</p>
                          <p className="mt-1 text-xs leading-5 text-[#b9ad99]">
                            {item.detail}
                          </p>
                        </div>
                        <Icon size={14} aria-hidden="true" />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.action}</p>
                    </article>
                  );
                })}
              </div>
            ) : null}
            {launchHandoff.goalFollowup.fillIns.length > 0 ? (
              <div className="mt-4 rounded-md border border-[#3a3023] bg-[#12100d] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  目标补齐入口
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {launchHandoff.goalFollowup.fillIns.slice(0, 4).map((item) => {
                    const style = statusStyle(item.status);
                    const Icon = style.icon;

                    return (
                      <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-[#b9ad99]">{item.sectionLabel}</p>
                            <p className="mt-1 font-semibold text-[#fff7e8]">{item.title}</p>
                          </div>
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.action}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <a
                            href={`#${item.sectionId}`}
                            className="rounded-md border border-[#c8a15a]/40 px-2 py-1 font-semibold text-[#f0d49a] hover:text-[#fff7e8]"
                          >
                            跳到填写区
                          </a>
                          <span className="rounded-md bg-[#080705] px-2 py-1 text-[#b9ad99]">
                            {item.api.method} {item.api.path}
                          </span>
                        </div>
                        <p className="mt-2 rounded-md bg-[#080705] p-2 text-xs leading-5 text-[#b9ad99]">
                          {item.payloadHint}
                        </p>
                        <p className="mt-2 text-xs font-semibold text-[#f0d49a]">请求体模板</p>
                        <pre className="mt-2 overflow-auto rounded-md bg-[#080705] p-2 text-xs leading-5 text-[#d8cab2]">
                          {JSON.stringify(item.payloadTemplate, null, 2)}
                        </pre>
                        <p className="mt-2 text-xs font-semibold text-[#f0d49a]">执行命令</p>
                        <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#080705] p-2 text-xs leading-5 text-[#d8cab2]">
                          {item.curlCommand}
                        </pre>
                        <p className="mt-2 text-xs font-semibold text-[#f0d49a]">持久化证据</p>
                        <p className="mt-2 break-words rounded-md bg-[#080705] p-2 text-xs leading-5 text-[#b9ad99]">
                          {item.persistence.store} / feature={item.persistence.feature} / event=
                          {item.persistence.event} / model={item.persistence.model}
                          <br />
                          {item.persistence.purpose}
                        </p>
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                关键摘要
              </div>
              <div className="mt-4 space-y-3">
                {launchHandoff.summaryLines.map((line) => (
                  <p
                    key={line}
                    className="rounded-md bg-[#12100d] p-3 text-sm leading-6 text-[#d8cab2]"
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                可复制交接口径
              </div>
              <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                {launchHandoff.copyText}
              </pre>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-sm font-semibold text-[#f0d49a]">上线阻断</p>
              <div className="mt-4 space-y-3">
                {launchHandoff.blockingFocus.slice(0, 4).map((item) => {
                  const style = statusStyle(item.status);
                  const Icon = style.icon;

                  return (
                    <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-[#b9ad99]">
                            {item.group ?? item.owner ?? "上线项"}
                          </p>
                          <p className="mt-1 font-semibold text-[#fff7e8]">{item.title}</p>
                        </div>
                        <Icon size={14} aria-hidden="true" />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.action}</p>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-sm font-semibold text-[#f0d49a]">变量优先项</p>
              <div className="mt-4 space-y-3">
                {launchHandoff.environmentFocus.slice(0, 4).map((item) => {
                  const style = statusStyle(item.status);
                  const Icon = style.icon;

                  return (
                    <article key={item.key} className={`rounded-md border p-3 ${style.className}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="break-all text-xs text-[#b9ad99]">{item.key}</p>
                          <p className="mt-1 font-semibold text-[#fff7e8]">{item.title}</p>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#080705]/70 px-2 py-1 text-xs">
                          <Icon size={14} aria-hidden="true" />
                          {item.stateLabel}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.action}</p>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-sm font-semibold text-[#f0d49a]">外部办理</p>
              <div className="mt-4 space-y-3">
                {launchHandoff.externalFocus.slice(0, 4).map((item) => {
                  const style = statusStyle(item.status);
                  const Icon = style.icon;

                  return (
                    <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-[#b9ad99]">
                            {item.phase} · {item.owner}
                          </p>
                          <p className="mt-1 font-semibold text-[#fff7e8]">{item.title}</p>
                        </div>
                        <Icon size={14} aria-hidden="true" />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#d8cab2]">
                        {item.currentAction}
                      </p>
                      <p className="mt-2 break-words text-xs leading-5 text-[#b9ad99]">
                        变量：{item.envKeys.join("、") || "无"}
                      </p>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-md border border-[#3a3023] bg-[#080705] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
              <ClipboardCheck size={16} aria-hidden="true" />
              下一步
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {launchHandoff.nextActions.length > 0 ? (
                launchHandoff.nextActions.map((item) => (
                  <p
                    key={item}
                    className="rounded-md bg-[#12100d] p-3 text-sm leading-6 text-[#d8cab2]"
                  >
                    {item}
                  </p>
                ))
              ) : (
                <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                  当前没有新增动作。
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">生产变量核对</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                密钥、域名、数据库与支付配置
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                对照上线变量模板检查当前运行环境，密钥和连接串只显示配置状态与长度，不展示原文。
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-md border border-[#3c8b72] bg-[#3c8b72]/10 p-3">
                <p className="text-xl font-semibold text-[#cfe9df]">
                  {launchEnvChecklist.summary.ready}
                </p>
                <p className="text-xs text-[#b9ad99]">ready</p>
              </div>
              <div className="rounded-md border border-[#c8a15a] bg-[#c8a15a]/10 p-3">
                <p className="text-xl font-semibold text-[#f0d49a]">
                  {launchEnvChecklist.summary.warning}
                </p>
                <p className="text-xs text-[#b9ad99]">warning</p>
              </div>
              <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-3">
                <p className="text-xl font-semibold text-[#f0d2c8]">
                  {launchEnvChecklist.summary.blocking}
                </p>
                <p className="text-xs text-[#b9ad99]">blocking</p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">变量总数</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchEnvChecklist.summary.total}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">未配置</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchEnvChecklist.summary.missing}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">密钥/连接串</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchEnvChecklist.summary.secret}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {launchEnvChecklist.nextItems.slice(0, 8).map((item) => {
              const style = statusStyle(item.status);
              const Icon = style.icon;

              return (
                <article key={item.key} className={`rounded-md border p-4 ${style.className}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="break-all text-xs text-[#b9ad99]">
                        {item.group} · {item.key}
                      </p>
                      <p className="mt-1 font-semibold text-[#fff7e8]">{item.label}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-md bg-[#080705]/70 px-2 py-1 text-xs">
                      <Icon size={14} aria-hidden="true" />
                      {item.stateLabel}
                    </span>
                  </div>
                  <p className="mt-3 break-all rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#d8cab2]">
                    {item.displayValue}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[#d8cab2]">{item.detail}</p>
                  <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#b9ad99]">
                    {item.action}
                  </p>
                  {item.sourceItems.length > 0 ? (
                    <p className="mt-2 text-xs leading-5 text-[#b9ad99]">
                      关联事项：{item.sourceItems.join("、")}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {launchEnvChecklist.groups.slice(0, 8).map((group) => (
              <div key={group.name} className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <p className="font-semibold text-[#fff7e8]">{group.name}</p>
                <p className="mt-2 text-sm leading-6 text-[#b9ad99]">
                  {group.blocking} blocking · {group.warning} warning · {group.ready}/{group.total} ready
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">变量草案</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                生产环境变量生成助手
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchEnvDraft.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchEnvDraft.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchEnvDraft.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {launchEnvDraft.label}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-5">
            <div className="rounded-md border border-[#3c8b72] bg-[#3c8b72]/10 p-4">
              <p className="text-xs text-[#b9ad99]">ready</p>
              <p className="mt-2 text-2xl font-semibold text-[#cfe9df]">
                {launchEnvDraft.summary.ready}
              </p>
            </div>
            <div className="rounded-md border border-[#c8a15a] bg-[#c8a15a]/10 p-4">
              <p className="text-xs text-[#b9ad99]">warning</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d49a]">
                {launchEnvDraft.summary.warning}
              </p>
            </div>
            <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-4">
              <p className="text-xs text-[#b9ad99]">blocking</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchEnvDraft.summary.blocking}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">密钥/连接串</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchEnvDraft.summary.secret}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">分组</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchEnvDraft.summary.groups}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                优先填写变量
              </div>
              <div className="mt-4 space-y-3">
                {launchEnvDraft.priorityEntries.length > 0 ? (
                  launchEnvDraft.priorityEntries.slice(0, 8).map((entry) => {
                    const style = statusStyle(entry.status);
                    const Icon = style.icon;

                    return (
                      <article key={entry.key} className={`rounded-md border p-3 ${style.className}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="break-all text-xs text-[#b9ad99]">
                              {entry.group} · {entry.key}
                            </p>
                            <p className="mt-1 font-semibold text-[#fff7e8]">{entry.label}</p>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#080705]/70 px-2 py-1 text-xs">
                            <Icon size={14} aria-hidden="true" />
                            {entry.stateLabel}
                          </span>
                        </div>
                        <p className="mt-2 break-all rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#d8cab2]">
                          {entry.line}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{entry.action}</p>
                        {entry.platformHints.length > 0 ? (
                          <p className="mt-2 text-xs leading-5 text-[#b9ad99]">
                            来源：{entry.platformHints.slice(0, 3).join("、")}
                          </p>
                        ) : null}
                      </article>
                    );
                  })
                ) : (
                  <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                    当前没有优先填写变量。
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                可复制环境变量草案
              </div>
              <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                {launchEnvDraft.copyText}
              </pre>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {launchEnvDraft.groups.slice(0, 8).map((group) => {
              const style = statusStyle(group.status);
              const Icon = style.icon;

              return (
                <div key={group.name} className={`rounded-md border p-4 ${style.className}`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-[#fff7e8]">{group.name}</p>
                    <Icon size={14} aria-hidden="true" />
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#b9ad99]">
                    {group.blocking} blocking · {group.warning} warning · {group.ready}/{group.total} ready
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">办理资料包</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                外部资质与生产变量准备
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                把你线下要准备的主体、域名、备案、七牛、OpenAI、微信和支付宝材料拆成清单，并对应到生产环境变量和验收凭证。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-4">
              <div className="rounded-md border border-[#3c8b72] bg-[#3c8b72]/10 p-3">
                <p className="text-xl font-semibold text-[#cfe9df]">
                  {launchMaterials.summary.ready}
                </p>
                <p className="text-xs text-[#b9ad99]">已完成</p>
              </div>
              <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-3">
                <p className="text-xl font-semibold text-[#f0d2c8]">
                  {launchMaterials.summary.pending}
                </p>
                <p className="text-xs text-[#b9ad99]">待办理</p>
              </div>
              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-3">
                <p className="text-xl font-semibold text-[#fff7e8]">
                  {launchMaterials.summary.envKeyCount}
                </p>
                <p className="text-xs text-[#b9ad99]">变量</p>
              </div>
              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-3">
                <p className="text-xl font-semibold text-[#fff7e8]">
                  {launchMaterials.summary.materialCount}
                </p>
                <p className="text-xs text-[#b9ad99]">材料项</p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {launchMaterials.nextItems.slice(0, 4).map((item) => {
              const style = statusStyle(item.healthStatus);
              const Icon = style.icon;

              return (
                <article key={item.id} className={`rounded-md border p-4 ${style.className}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-[#b9ad99]">
                        {item.phase} · {item.owner} · {item.statusLabel}
                      </p>
                      <p className="mt-1 font-semibold text-[#fff7e8]">{item.title}</p>
                    </div>
                    <Icon size={15} aria-hidden="true" />
                  </div>
                  {item.blockedBy.length > 0 ? (
                    <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#f0d49a]">
                      前置依赖：{item.blockedBy.join("、")}
                    </p>
                  ) : null}
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-md bg-[#080705]/70 p-3 text-sm leading-6">
                      <p className="font-semibold text-[#fff7e8]">准备材料</p>
                      <p className="mt-1 text-[#b9ad99]">{item.materials.slice(0, 3).join("、")}</p>
                    </div>
                    <div className="rounded-md bg-[#080705]/70 p-3 text-sm leading-6">
                      <p className="font-semibold text-[#fff7e8]">拿到产物</p>
                      <p className="mt-1 text-[#b9ad99]">{item.outputs.slice(0, 3).join("、")}</p>
                    </div>
                  </div>
                  <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#b9ad99]">
                    环境变量：{item.envKeys.join("、") || "无"}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[#d8cab2]">
                    下一步：{item.currentAction}
                  </p>
                </article>
              );
            })}
          </div>

          <div className="mt-5 rounded-md border border-[#3a3023] bg-[#080705] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
              <ClipboardCheck size={16} aria-hidden="true" />
              生产变量总览
            </div>
            <p className="mt-3 break-words text-sm leading-7 text-[#b9ad99]">
              {launchMaterials.envKeys.join("、")}
            </p>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">上线包</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                收费上线包摘要
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchPackage.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchPackage.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchPackage.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {launchPackage.label}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">Go / No-Go</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchPackage.summary.goNoGo.blocking} blocking ·{" "}
                {launchPackage.summary.goNoGo.warning} warning
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">Runbook</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchPackage.summary.runbook.blocking} blocking ·{" "}
                {launchPackage.summary.runbook.warning} warning
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">外部事项</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchPackage.summary.external.ready}/{launchPackage.summary.external.total} ready
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">证据归档</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchPackage.summary.evidence.label}
              </p>
              {launchPackage.summary.evidence.latestArchivedAt ? (
                <p className="mt-1 text-xs text-[#b9ad99]">
                  {launchPackage.summary.evidence.latestArchivedAt.slice(0, 16).replace("T", " ")}
                </p>
              ) : null}
              {launchPackage.summary.evidence.refreshReasons.length > 0 ? (
                <p className="mt-1 text-xs leading-5 text-[#f0d49a]">
                  刷新：{launchPackage.summary.evidence.refreshReasons.join("、")}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                上线前必补
              </div>
              <div className="mt-4 space-y-3">
                {launchPackage.requiredBeforeGo.length > 0 ? (
                  launchPackage.requiredBeforeGo.slice(0, 6).map((item) => {
                    const style = statusStyle(item.status);
                    const Icon = style.icon;

                    return (
                      <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-[#b9ad99]">
                              {item.group ?? item.owner ?? item.type}
                            </p>
                            <p className="mt-1 font-semibold text-[#fff7e8]">{item.title}</p>
                          </div>
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.action}</p>
                      </article>
                    );
                  })
                ) : (
                  <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                    暂无上线前必补项。
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                下一步动作
              </div>
              <div className="mt-4 space-y-3">
                {launchPackage.nextActions.length > 0 ? (
                  launchPackage.nextActions.slice(0, 6).map((item) => {
                    const style = statusStyle(item.status);
                    const Icon = style.icon;

                    return (
                      <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-[#b9ad99]">
                              {item.group ?? item.owner ?? item.type}
                            </p>
                            <p className="mt-1 font-semibold text-[#fff7e8]">{item.title}</p>
                          </div>
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.action}</p>
                      </article>
                    );
                  })
                ) : (
                  <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                    当前上线包没有待处理动作。
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section
          id="launch-evidence-action-center"
          className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5"
        >
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">证据行动中心</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                {launchEvidenceActionCenter.label}
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchEvidenceActionCenter.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchEvidenceActionCenter.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchEvidenceActionCenter.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  补证分组
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-md border border-[#3c8b72] bg-[#3c8b72]/10 p-4">
              <p className="text-xs text-[#b9ad99]">ready</p>
              <p className="mt-2 text-2xl font-semibold text-[#cfe9df]">
                {launchEvidenceActionCenter.summary.ready}
              </p>
            </div>
            <div className="rounded-md border border-[#c8a15a] bg-[#c8a15a]/10 p-4">
              <p className="text-xs text-[#b9ad99]">warning</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d49a]">
                {launchEvidenceActionCenter.summary.warning}
              </p>
            </div>
            <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-4">
              <p className="text-xs text-[#b9ad99]">blocking</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchEvidenceActionCenter.summary.blocking}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">证据类型</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchEvidenceActionCenter.summary.buckets}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">可执行率</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchEvidenceActionCenter.summary.evidenceCoverageScore}%
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">归档状态</p>
              <p className="mt-2 font-semibold leading-6 text-[#fff7e8]">
                {launchEvidenceActionCenter.snapshot.label}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                按证据类型推进
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {launchEvidenceActionCenter.buckets.map((bucket) => {
                  const style = statusStyle(bucket.status);
                  const Icon = style.icon;

                  return (
                    <article key={bucket.kind} className={`rounded-md border p-4 ${style.className}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-[#b9ad99]">{bucket.owner}</p>
                          <p className="mt-1 font-semibold text-[#fff7e8]">
                            {evidenceKindLabel(bucket.kind)}
                          </p>
                        </div>
                        <Icon size={14} aria-hidden="true" />
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[#d8cab2]">{bucket.goal}</p>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-md bg-[#080705]/70 p-2">
                          <p className="font-semibold text-[#f0d2c8]">
                            {bucket.summary.blocking}
                          </p>
                          <p className="text-[#b9ad99]">阻断</p>
                        </div>
                        <div className="rounded-md bg-[#080705]/70 p-2">
                          <p className="font-semibold text-[#f0d49a]">
                            {bucket.summary.warning}
                          </p>
                          <p className="text-[#b9ad99]">复核</p>
                        </div>
                        <div className="rounded-md bg-[#080705]/70 p-2">
                          <p className="font-semibold text-[#fff7e8]">
                            {bucket.summary.total}
                          </p>
                          <p className="text-[#b9ad99]">总数</p>
                        </div>
                      </div>
                      <p className="mt-3 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                        下一步：{bucket.nextItems[0]?.title ?? bucket.action}
                      </p>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  今日优先补证
                </div>
                <div className="mt-4 space-y-3">
                  {launchEvidenceActionCenter.nextItems.length > 0 ? (
                    launchEvidenceActionCenter.nextItems.slice(0, 6).map((item) => {
                      const style = statusStyle(item.status);
                      const Icon = style.icon;

                      return (
                        <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs text-[#b9ad99]">
                                {item.evidenceKinds.map(evidenceKindLabel).join(" / ")}
                              </p>
                              <p className="mt-1 font-semibold text-[#fff7e8]">{item.title}</p>
                            </div>
                            <Icon size={14} aria-hidden="true" />
                          </div>
                          <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.action}</p>
                          <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                            证据：{item.evidence}
                          </p>
                        </article>
                      );
                    })
                  ) : (
                    <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                      当前没有优先补证项。
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  可复制行动中心
                </div>
                <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                  {launchEvidenceActionCenter.copyText}
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">证据闭环</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                上线证据缺口
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchEvidenceGap.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchEvidenceGap.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchEvidenceGap.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {launchEvidenceGap.label}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-5">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">验收可执行率</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchEvidenceGap.coverage.score}%
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                {launchEvidenceGap.coverage.ready}/{launchEvidenceGap.coverage.total} ready
              </p>
            </div>
            <div className="rounded-md border border-[#3c8b72] bg-[#3c8b72]/10 p-4">
              <p className="text-xs text-[#b9ad99]">ready</p>
              <p className="mt-2 text-2xl font-semibold text-[#cfe9df]">
                {launchEvidenceGap.summary.ready}
              </p>
            </div>
            <div className="rounded-md border border-[#c8a15a] bg-[#c8a15a]/10 p-4">
              <p className="text-xs text-[#b9ad99]">warning</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d49a]">
                {launchEvidenceGap.summary.warning}
              </p>
            </div>
            <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-4">
              <p className="text-xs text-[#b9ad99]">blocking</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchEvidenceGap.summary.blocking}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">证据归档</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchEvidenceGap.snapshot.label}
              </p>
              {launchEvidenceGap.snapshot.latestArchivedAt ? (
                <p className="mt-1 text-xs text-[#b9ad99]">
                  {launchEvidenceGap.snapshot.latestArchivedAt.slice(0, 16).replace("T", " ")}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {launchEvidenceGap.evidenceKindSummary.map((item) => {
              const status: HealthStatus =
                item.blocking > 0 ? "blocking" : item.warning > 0 ? "warning" : "ready";
              const style = statusStyle(status);
              const Icon = style.icon;

              return (
                <article key={item.kind} className={`rounded-md border p-3 ${style.className}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-[#b9ad99]">{item.label}</p>
                    <Icon size={14} aria-hidden="true" />
                  </div>
                  <p className="mt-2 text-xl font-semibold text-[#fff7e8]">{item.count}</p>
                  <p className="mt-1 text-xs text-[#b9ad99]">
                    {item.blocking} blocking · {item.warning} warning
                  </p>
                </article>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                优先补证缺口
              </div>
              <div className="mt-4 space-y-3">
                {launchEvidenceGap.nextGaps.length > 0 ? (
                  launchEvidenceGap.nextGaps.slice(0, 6).map((item) => {
                    const style = statusStyle(item.status);
                    const Icon = style.icon;

                    return (
                      <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-[#b9ad99]">
                              {item.group} · {item.owner ?? item.source}
                            </p>
                            <p className="mt-1 font-semibold text-[#fff7e8]">{item.title}</p>
                          </div>
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.action}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.evidenceKinds.map((kind) => (
                            <span
                              key={`${item.id}-${kind}`}
                              className="rounded-md border border-[#6a5431] bg-[#080705]/70 px-2 py-1 text-xs text-[#f0d49a]"
                            >
                              {evidenceKindLabel(kind)}
                            </span>
                          ))}
                        </div>
                        <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                          证据：{item.evidence}
                        </p>
                        {item.routes && item.routes.length > 0 ? (
                          <p className="mt-2 break-words rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                            路径：{item.routes.slice(0, 5).join("、")}
                            {item.routes.length > 5 ? " 等" : ""}
                          </p>
                        ) : null}
                      </article>
                    );
                  })
                ) : (
                  <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                    当前没有证据缺口。
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                可复制补证清单
              </div>
              <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                {launchEvidenceGap.copyText}
              </pre>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">合规与主体落地</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                {launchCompliancePlan.label}
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchCompliancePlan.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchCompliancePlan.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchCompliancePlan.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  主体 / ICP / 协议
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">主体</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchCompliancePlan.subject.entityStatus}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                {launchCompliancePlan.summary.entityReady ? "已闭合" : "未闭合"}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">ICP备案</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchCompliancePlan.subject.icpStatus}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                {launchCompliancePlan.summary.icpReady ? "已闭合" : "未闭合"}
              </p>
            </div>
            <div className="rounded-md border border-[#3c8b72] bg-[#3c8b72]/10 p-4">
              <p className="text-xs text-[#b9ad99]">支付主体</p>
              <p className="mt-2 font-semibold text-[#cfe9df]">
                {launchCompliancePlan.summary.paymentSubjectsReady ? "已一致" : "待核对"}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">协议版本</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchCompliancePlan.subject.legalVersion}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                {launchCompliancePlan.summary.legalDocsReady ? "四件套已闭合" : "四件套待复核"}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">退款口径</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchCompliancePlan.summary.refundBoundaryReady ? "已覆盖" : "待补充"}
              </p>
            </div>
            <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-4">
              <p className="text-xs text-[#b9ad99]">阻断步骤</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchCompliancePlan.summary.blocking}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                {launchCompliancePlan.summary.ready}/{launchCompliancePlan.summary.total} ready
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                主体合规上线步骤
              </div>
              <div className="mt-4 space-y-3">
                {launchCompliancePlan.steps.map((step) => {
                  const style = statusStyle(step.status);
                  const Icon = style.icon;

                  return (
                    <article key={step.id} className={`rounded-md border p-3 ${style.className}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-[#b9ad99]">
                            步骤 {step.order} · {step.owner}
                          </p>
                          <p className="mt-1 font-semibold text-[#fff7e8]">{step.title}</p>
                        </div>
                        <Icon size={14} aria-hidden="true" />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{step.detail}</p>
                      <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                        动作：{step.action}
                      </p>
                      {step.envKeys?.length ? (
                        <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#f0d49a]">
                          变量：{step.envKeys.join("、")}
                        </p>
                      ) : null}
                      {step.externalIds?.length ? (
                        <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                          外部事项：{step.externalIds.join("、")}
                        </p>
                      ) : null}
                      {step.routes?.length ? (
                        <p className="mt-2 break-words rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                          路径：{step.routes.join("、")}
                        </p>
                      ) : null}
                      <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                        证据：{step.evidence}
                      </p>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  优先合规补齐项
                </div>
                <div className="mt-4 space-y-3">
                  {launchCompliancePlan.nextSteps.length > 0 ? (
                    launchCompliancePlan.nextSteps.map((step) => {
                      const style = statusStyle(step.status);
                      const Icon = style.icon;

                      return (
                        <article key={step.id} className={`rounded-md border p-3 ${style.className}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs text-[#b9ad99]">步骤 {step.order}</p>
                              <p className="mt-1 font-semibold text-[#fff7e8]">{step.title}</p>
                            </div>
                            <Icon size={14} aria-hidden="true" />
                          </div>
                          <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{step.action}</p>
                          <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                            证据：{step.evidence}
                          </p>
                        </article>
                      );
                    })
                  ) : (
                    <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                      当前没有合规与主体落地缺口。
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  办理顺序
                </div>
                <div className="mt-4 space-y-3">
                  {launchCompliancePlan.commandGroups.map((group) => (
                    <article key={group.title} className="rounded-md border border-[#3a3023] bg-[#12100d] p-3">
                      <p className="font-semibold text-[#fff7e8]">{group.title}</p>
                      <p className="mt-1 text-xs leading-5 text-[#b9ad99]">{group.when}</p>
                      <div className="mt-3 space-y-2">
                        {group.commands.map((command) => (
                          <div key={`${group.title}-${command.label}`} className="rounded-md bg-[#080705] p-2">
                            <p className="text-xs font-semibold text-[#f0d49a]">
                              {command.label}
                            </p>
                            <p className="mt-1 break-words font-mono text-xs leading-5 text-[#fff7e8]">
                              {command.command}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-[#b9ad99]">
                              {command.detail}
                            </p>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  合规证据清单
                </div>
                <div className="mt-4 space-y-2">
                  {launchCompliancePlan.evidence.map((item) => (
                    <p
                      key={item}
                      className="rounded-md bg-[#12100d] p-2 text-xs leading-5 text-[#d8cab2]"
                    >
                      {item}
                    </p>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  可复制合规计划
                </div>
                <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                  {launchCompliancePlan.copyText}
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">支付落地</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                {launchPaymentPlan.label}
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchPaymentPlan.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchPaymentPlan.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchPaymentPlan.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  支付宝 / 微信支付
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">支付模式</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">{launchPaymentPlan.payment.mode}</p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                旁路：{launchPaymentPlan.payment.devBypassEnabled ? "开启" : "关闭"}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">优先渠道</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchPaymentPlan.payment.preferredChannel}
              </p>
            </div>
            <div className="rounded-md border border-[#3c8b72] bg-[#3c8b72]/10 p-4">
              <p className="text-xs text-[#b9ad99]">完成渠道</p>
              <p className="mt-2 text-2xl font-semibold text-[#cfe9df]">
                {launchPaymentPlan.summary.readyChannels}/2
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">已配渠道</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchPaymentPlan.summary.configuredChannels}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">成功订单</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchPaymentPlan.summary.paidLiveOrders}
              </p>
            </div>
            <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-4">
              <p className="text-xs text-[#b9ad99]">阻断步骤</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchPaymentPlan.summary.blocking}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {launchPaymentPlan.channels.map((channel) => {
              const style = statusStyle(channel.status);
              const Icon = style.icon;

              return (
                <article key={channel.id} className={`rounded-md border p-4 ${style.className}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-[#b9ad99]">
                        {channel.enabled ? "已开启" : "未开启"} · 缺参 {channel.missingFields.length}
                      </p>
                      <p className="mt-1 font-semibold text-[#fff7e8]">{channel.label}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-md bg-[#080705]/70 px-2 py-1 text-xs">
                      <Icon size={14} aria-hidden="true" />
                      {style.label}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-4">
                    <div className="rounded-md bg-[#080705]/70 p-3">
                      <p className="text-xs text-[#b9ad99]">申请</p>
                      <p className="mt-1 font-semibold text-[#fff7e8]">
                        {channel.applicationStatus}
                      </p>
                    </div>
                    <div className="rounded-md bg-[#080705]/70 p-3">
                      <p className="text-xs text-[#b9ad99]">诊断</p>
                      <p className="mt-1 font-semibold text-[#fff7e8]">
                        {channel.diagnosticStatus}
                      </p>
                    </div>
                    <div className="rounded-md bg-[#080705]/70 p-3">
                      <p className="text-xs text-[#b9ad99]">订单</p>
                      <p className="mt-1 font-semibold text-[#fff7e8]">{channel.orderCount}</p>
                    </div>
                    <div className="rounded-md bg-[#080705]/70 p-3">
                      <p className="text-xs text-[#b9ad99]">成功</p>
                      <p className="mt-1 font-semibold text-[#fff7e8]">
                        {channel.paidOrderCount}
                      </p>
                    </div>
                  </div>
                  {channel.nextStep ? (
                    <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-xs leading-5 text-[#f0d49a]">
                      下一步：{channel.nextStep.title} - {channel.nextStep.action}
                    </p>
                  ) : null}
                  <div className="mt-4 space-y-2">
                    {channel.steps.map((step) => {
                      const stepStyle = statusStyle(step.status);
                      const StepIcon = stepStyle.icon;

                      return (
                        <div
                          key={step.id}
                          className={`rounded-md border p-3 ${stepStyle.className}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs text-[#b9ad99]">步骤 {step.order}</p>
                              <p className="font-semibold text-[#fff7e8]">{step.title}</p>
                            </div>
                            <StepIcon size={14} aria-hidden="true" />
                          </div>
                          <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{step.detail}</p>
                          <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                            证据：{step.evidence}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_0.9fr]">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                优先支付落地步骤
              </div>
              <div className="mt-4 space-y-3">
                {launchPaymentPlan.nextSteps.length > 0 ? (
                  launchPaymentPlan.nextSteps.slice(0, 6).map((step) => {
                    const style = statusStyle(step.status);
                    const Icon = style.icon;

                    return (
                      <article key={step.id} className={`rounded-md border p-3 ${style.className}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-[#b9ad99]">
                              {step.channelLabel} · 步骤 {step.order}
                            </p>
                            <p className="mt-1 font-semibold text-[#fff7e8]">{step.title}</p>
                          </div>
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{step.action}</p>
                        <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                          证据：{step.evidence}
                        </p>
                      </article>
                    );
                  })
                ) : (
                  <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                    当前没有支付落地缺口。
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  支付配置顺序
                </div>
                <div className="mt-4 space-y-3">
                  {launchPaymentPlan.commandGroups.map((group) => (
                    <article key={group.title} className="rounded-md border border-[#3a3023] bg-[#12100d] p-3">
                      <p className="font-semibold text-[#fff7e8]">{group.title}</p>
                      <p className="mt-1 text-xs leading-5 text-[#b9ad99]">{group.when}</p>
                      <div className="mt-3 space-y-2">
                        {group.commands.map((command) => (
                          <div key={`${group.title}-${command.label}`} className="rounded-md bg-[#080705] p-2">
                            <p className="text-xs font-semibold text-[#f0d49a]">
                              {command.label}
                            </p>
                            <p className="mt-1 break-words font-mono text-xs leading-5 text-[#fff7e8]">
                              {command.command}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-[#b9ad99]">
                              {command.detail}
                            </p>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  可复制支付计划
                </div>
                <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                  {launchPaymentPlan.copyText}
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">真实支付</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                小额订单验收
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchPaymentAcceptance.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchPaymentAcceptance.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchPaymentAcceptance.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {launchPaymentAcceptance.label}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-6">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">支付模式</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchPaymentAcceptance.paymentMode}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                回调旁路：{launchPaymentAcceptance.devBypassEnabled ? "开启" : "关闭"}
              </p>
            </div>
            <div className="rounded-md border border-[#3c8b72] bg-[#3c8b72]/10 p-4">
              <p className="text-xs text-[#b9ad99]">完成渠道</p>
              <p className="mt-2 text-2xl font-semibold text-[#cfe9df]">
                {launchPaymentAcceptance.summary.completedChannels}/
                {launchPaymentAcceptance.summary.totalChannels}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">真实订单</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchPaymentAcceptance.summary.liveOrders}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">支付成功</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchPaymentAcceptance.summary.paidLiveOrders}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">最近成功</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchPaymentAcceptance.summary.latestPaidAt
                  ? launchPaymentAcceptance.summary.latestPaidAt.slice(0, 16).replace("T", " ")
                  : "暂无"}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">验收证据</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchPaymentAcceptance.summary.evidenceRecords}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                最近：
                {launchPaymentAcceptance.summary.latestEvidenceAt
                  ? launchPaymentAcceptance.summary.latestEvidenceAt.slice(0, 16).replace("T", " ")
                  : "暂无"}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <AdminLaunchPaymentAcceptanceEvidenceForm
              adminToken={adminToken}
              channels={launchPaymentAcceptance.channels}
              records={launchPaymentAcceptance.evidenceRecords}
            />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {launchPaymentAcceptance.channels.map((channel) => {
              const style = statusStyle(channel.status);
              const Icon = style.icon;

              return (
                <article key={channel.id} className={`rounded-md border p-4 ${style.className}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-[#b9ad99]">{channel.provider}</p>
                      <p className="mt-1 font-semibold text-[#fff7e8]">{channel.label}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-md bg-[#080705]/70 px-2 py-1 text-xs">
                      <Icon size={14} aria-hidden="true" />
                      {style.label}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-md bg-[#080705]/70 p-3">
                      <p className="text-xs text-[#b9ad99]">订单</p>
                      <p className="mt-1 font-semibold text-[#fff7e8]">{channel.orderCount}</p>
                    </div>
                    <div className="rounded-md bg-[#080705]/70 p-3">
                      <p className="text-xs text-[#b9ad99]">成功</p>
                      <p className="mt-1 font-semibold text-[#fff7e8]">
                        {channel.paidOrderCount}
                      </p>
                    </div>
                    <div className="rounded-md bg-[#080705]/70 p-3">
                      <p className="text-xs text-[#b9ad99]">缺参</p>
                      <p className="mt-1 font-semibold text-[#fff7e8]">
                        {channel.missingFields.length}
                      </p>
                    </div>
                  </div>

                  {channel.latestPaidOrder ? (
                    <p className="mt-3 break-words rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#d8cab2]">
                      最近成功：{channel.latestPaidOrder.id} ·{" "}
                      {channel.latestPaidOrder.priceLabel} ·{" "}
                      {channel.latestPaidOrder.providerOrderId ?? "缺平台交易号"}
                    </p>
                  ) : channel.latestOrder ? (
                    <p className="mt-3 break-words rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#d8cab2]">
                      最近订单：{channel.latestOrder.id} · {channel.latestOrder.status} ·{" "}
                      {channel.latestOrder.priceLabel}
                    </p>
                  ) : null}

                  {channel.latestEvidence ? (
                    <p className="mt-3 break-words rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#d8cab2]">
                      最近证据：{channel.latestEvidence.metadata.status} ·{" "}
                      {channel.latestEvidence.metadata.orderId ?? "未填订单"} ·{" "}
                      {channel.latestEvidence.metadata.savedAt.slice(0, 16).replace("T", " ")}
                    </p>
                  ) : null}

                  <div className="mt-4 space-y-2">
                    {channel.items.map((item) => {
                      const itemStyle = statusStyle(item.status);
                      const ItemIcon = itemStyle.icon;

                      return (
                        <div
                          key={item.id}
                          className={`rounded-md border p-3 ${itemStyle.className}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="font-semibold text-[#fff7e8]">{item.title}</p>
                            <ItemIcon size={14} aria-hidden="true" />
                          </div>
                          <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.detail}</p>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                优先支付验收项
              </div>
              <div className="mt-4 space-y-3">
                {launchPaymentAcceptance.nextItems.length > 0 ? (
                  launchPaymentAcceptance.nextItems.slice(0, 6).map((item) => {
                    const style = statusStyle(item.status);
                    const Icon = style.icon;

                    return (
                      <article key={item.id} className={`rounded-md border p-3 ${style.className}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-[#b9ad99]">{item.group}</p>
                            <p className="mt-1 font-semibold text-[#fff7e8]">{item.title}</p>
                          </div>
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.action}</p>
                        <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                          证据：{item.evidence}
                        </p>
                      </article>
                    );
                  })
                ) : (
                  <p className="rounded-md bg-[#12100d] p-3 text-sm text-[#b9ad99]">
                    当前没有真实支付验收缺口。
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                可复制支付验收
              </div>
              <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                {launchPaymentAcceptance.copyText}
              </pre>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">外部上线事项</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                资质、域名、云服务与支付跟踪
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                跟踪你需要同步办理的主体、备案、支付、七牛、OpenAI 和生产基础设施状态。
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-md border border-[#3c8b72] bg-[#3c8b72]/10 p-3">
                <p className="text-xl font-semibold text-[#cfe9df]">
                  {launchExternalReadiness.summary.ready}
                </p>
                <p className="text-xs text-[#b9ad99]">ready</p>
              </div>
              <div className="rounded-md border border-[#c8a15a] bg-[#c8a15a]/10 p-3">
                <p className="text-xl font-semibold text-[#f0d49a]">
                  {launchExternalReadiness.summary.warning}
                </p>
                <p className="text-xs text-[#b9ad99]">warning</p>
              </div>
              <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-3">
                <p className="text-xl font-semibold text-[#f0d2c8]">
                  {launchExternalReadiness.summary.blocking}
                </p>
                <p className="text-xs text-[#b9ad99]">blocking</p>
              </div>
            </div>
          </div>

          {launchExternalReadiness.nextItems.length > 0 ? (
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {launchExternalReadiness.nextItems.map((item) => {
                const style = statusStyle(item.healthStatus);
                const Icon = style.icon;

                return (
                  <article key={item.id} className={`rounded-md border p-4 ${style.className}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-[#b9ad99]">{item.group}</p>
                        <p className="mt-1 font-semibold text-[#fff7e8]">{item.title}</p>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#080705]/70 px-2 py-1 text-xs">
                        <Icon size={14} aria-hidden="true" />
                        {style.label}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#d8cab2]">{item.action}</p>
                    {item.receiptNo || item.evidenceUrl ? (
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {item.receiptNo ? (
                          <p className="rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                            回执：{item.receiptNo}
                          </p>
                        ) : null}
                        {item.evidenceUrl ? (
                          <a
                            href={item.evidenceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md bg-[#080705]/70 p-2 text-xs font-semibold leading-5 text-[#f0d49a] hover:text-[#fff7e8]"
                          >
                            查看证据链接
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                    <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#b9ad99]">
                      证据：{item.evidenceNote ?? item.evidence}
                    </p>
                  </article>
                );
              })}
            </div>
          ) : null}

          <AdminLaunchExternalReadinessForm
            adminToken={adminToken}
            items={launchExternalReadiness.items}
          />
        </section>

        <section
          id="launch-evidence-archive"
          className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5"
        >
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">上线证据归档</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                检查记录与联调凭证
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                归档当前 Go / No-Go、Runbook、生产总门禁、落库探针、第三方诊断、支付验收和 AI 成本摘要，用于正式上线前复核。
              </p>
              <AdminLaunchEvidenceActions adminToken={adminToken} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-center text-sm">
              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-3">
                <p className="text-xl font-semibold text-[#fff7e8]">
                  {launchEvidenceArchives.length}
                </p>
                <p className="text-xs text-[#b9ad99]">最近归档</p>
              </div>
              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-3">
                <p className="text-xl font-semibold text-[#fff7e8]">
                  {launchEvidenceArchives[0]
                    ? launchEvidenceArchives[0].metadata.archivedAt.slice(5, 16).replace("T", " ")
                    : "暂无"}
                </p>
                <p className="text-xs text-[#b9ad99]">最近时间</p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {launchEvidenceArchives.length > 0 ? (
              launchEvidenceArchives.map((archive) => {
                const style = statusStyle(archive.metadata.status);
                const Icon = style.icon;

                return (
                  <article key={archive.id} className={`rounded-lg border p-4 ${style.className}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs text-[#b9ad99]">
                          {archive.metadata.archivedAt.slice(0, 19).replace("T", " ")} ·{" "}
                          {archive.metadata.operator}
                        </p>
                        <p className="mt-1 font-semibold text-[#fff7e8]">
                          {archive.metadata.label}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#080705]/70 px-2 py-1 text-xs">
                        <Icon size={14} aria-hidden="true" />
                        {style.label}
                      </span>
                    </div>
                    {archive.metadata.note ? (
                      <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#d8cab2]">
                        {archive.metadata.note}
                      </p>
                    ) : null}
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-md bg-[#080705]/70 p-3 text-sm">
                        <p className="text-xs text-[#b9ad99]">Go / No-Go</p>
                        <p className="mt-1 font-semibold text-[#fff7e8]">
                          {archive.metadata.readiness.summary.blocking} blocking ·{" "}
                          {archive.metadata.readiness.summary.warning} warning
                        </p>
                      </div>
                      <div className="rounded-md bg-[#080705]/70 p-3 text-sm">
                        <p className="text-xs text-[#b9ad99]">Runbook</p>
                        <p className="mt-1 font-semibold text-[#fff7e8]">
                          {archive.metadata.runbook.summary.blocking} blocking ·{" "}
                          {archive.metadata.runbook.summary.warning} warning
                        </p>
                      </div>
                      <div className="rounded-md bg-[#080705]/70 p-3 text-sm">
                        <p className="text-xs text-[#b9ad99]">落库</p>
                        <p className="mt-1 font-semibold text-[#fff7e8]">
                          {archive.metadata.persistence.label}
                        </p>
                      </div>
                      <div className="rounded-md bg-[#080705]/70 p-3 text-sm">
                        <p className="text-xs text-[#b9ad99]">第三方诊断</p>
                        <p className="mt-1 font-semibold text-[#fff7e8]">
                          {archive.metadata.integration.summary.blocking} blocking ·{" "}
                          {archive.metadata.integration.summary.warning} warning
                        </p>
                      </div>
                      <div className="rounded-md bg-[#080705]/70 p-3 text-sm">
                        <p className="text-xs text-[#b9ad99]">变量核对</p>
                        <p className="mt-1 font-semibold text-[#fff7e8]">
                          {archive.metadata.environment.summary.blocking} blocking ·{" "}
                          {archive.metadata.environment.summary.warning} warning
                        </p>
                      </div>
                      <div className="rounded-md bg-[#080705]/70 p-3 text-sm">
                        <p className="text-xs text-[#b9ad99]">支付验收</p>
                        <p className="mt-1 font-semibold text-[#fff7e8]">
                          {archive.metadata.paymentAcceptance.summary.paidLiveOrders} paid ·{" "}
                          {archive.metadata.paymentAcceptance.summary.evidenceRecords} 证据
                        </p>
                      </div>
                      <div className="rounded-md bg-[#080705]/70 p-3 text-sm">
                        <p className="text-xs text-[#b9ad99]">验收留证</p>
                        <p className="mt-1 font-semibold text-[#fff7e8]">
                          {archive.metadata.acceptanceEvidence.summary.total} 条 ·{" "}
                          {archive.metadata.acceptanceEvidence.summary.ready} 通过
                        </p>
                      </div>
                      <div className="rounded-md bg-[#080705]/70 p-3 text-sm">
                        <p className="text-xs text-[#b9ad99]">AI/图片验收</p>
                        <p className="mt-1 font-semibold text-[#fff7e8]">
                          {archive.metadata.aiStorageAcceptance.summary.total} 条 ·{" "}
                          {archive.metadata.aiStorageAcceptance.summary.readyItems} 通过
                        </p>
                      </div>
                      <div className="rounded-md bg-[#080705]/70 p-3 text-sm">
                        <p className="text-xs text-[#b9ad99]">成本样本</p>
                        <p className="mt-1 font-semibold text-[#fff7e8]">
                          {archive.metadata.unitEconomics.summary.costSampleCount} 条 ·{" "}
                          {archive.metadata.unitEconomics.summary.missingOpenaiCostCount} 缺成本
                        </p>
                      </div>
                      <div className="rounded-md bg-[#080705]/70 p-3 text-sm">
                        <p className="text-xs text-[#b9ad99]">生产总门禁</p>
                        <p className="mt-1 font-semibold text-[#fff7e8]">
                          {archive.metadata.productionGate.releaseReady
                            ? "releaseReady=yes"
                            : "releaseReady=no"}{" "}
                          · {archive.metadata.productionGate.summary.blocking} blocking
                        </p>
                      </div>
                      <div className="rounded-md bg-[#080705]/70 p-3 text-sm">
                        <p className="text-xs text-[#b9ad99]">证据阶段门槛</p>
                        <p className="mt-1 font-semibold text-[#fff7e8]">
                          {archive.metadata.goalTransitionGate.canAdvance
                            ? "canAdvance=yes"
                            : "canAdvance=no"}{" "}
                          · {archive.metadata.goalTransitionGate.summary.blocking} blocking
                        </p>
                      </div>
                      <div className="rounded-md bg-[#080705]/70 p-3 text-sm">
                        <p className="text-xs text-[#b9ad99]">归档线下办理</p>
                        <p className="mt-1 font-semibold text-[#fff7e8]">
                          {archive.metadata.offlineAction.currentAction.title} ·{" "}
                          {archive.metadata.offlineAction.summary.blocking} blocking
                        </p>
                      </div>
                    </div>
                    {archive.metadata.productionGate.nextActions.length > 0 ? (
                      <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#b9ad99]">
                        总门禁优先项：{archive.metadata.productionGate.nextActions[0].label} ·{" "}
                        {archive.metadata.productionGate.nextActions[0].status}
                      </p>
                    ) : null}
                    {archive.metadata.goalTransitionGate.canAdvance ? null : (
                      <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#b9ad99]">
                        阶段门槛优先项：
                        {archive.metadata.goalTransitionGate.blockers[0]?.title ??
                          archive.metadata.goalTransitionGate.warnings[0]?.title ??
                          archive.metadata.goalTransitionGate.label}{" "}
                        · {archive.metadata.goalTransitionGate.status}
                      </p>
                    )}
                    {archive.metadata.offlineAction.currentAction.status === "ready" ? null : (
                      <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#b9ad99]">
                        线下办理优先项：{archive.metadata.offlineAction.currentAction.title} ·{" "}
                        {archive.metadata.offlineAction.currentAction.action}
                      </p>
                    )}
                    {archive.metadata.runbook.nextSteps.length > 0 ? (
                      <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#b9ad99]">
                        优先项：{archive.metadata.runbook.nextSteps[0].title}
                      </p>
                    ) : null}
                    {archive.metadata.environment.nextItems.length > 0 ? (
                      <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#b9ad99]">
                        变量优先项：{archive.metadata.environment.nextItems[0].key} ·{" "}
                        {archive.metadata.environment.nextItems[0].stateLabel}
                      </p>
                    ) : null}
                    {archive.metadata.paymentAcceptance.recentEvidence.length > 0 ? (
                      <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#b9ad99]">
                        支付证据：
                        {archive.metadata.paymentAcceptance.recentEvidence[0].channelLabel} ·{" "}
                        {archive.metadata.paymentAcceptance.recentEvidence[0].status} ·{" "}
                        {archive.metadata.paymentAcceptance.recentEvidence[0].orderId ?? "未填订单"}
                      </p>
                    ) : null}
                    {archive.metadata.acceptanceEvidence.recentEvidence.length > 0 ? (
                      <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#b9ad99]">
                        验收证据：
                        {archive.metadata.acceptanceEvidence.recentEvidence[0].caseTitle} ·{" "}
                        {archive.metadata.acceptanceEvidence.recentEvidence[0].status}
                      </p>
                    ) : null}
                    {archive.metadata.aiStorageAcceptance.recentEvidence.length > 0 ? (
                      <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#b9ad99]">
                        AI/图片证据：
                        {archive.metadata.aiStorageAcceptance.recentEvidence[0].itemLabel} ·{" "}
                        {archive.metadata.aiStorageAcceptance.recentEvidence[0].status}
                      </p>
                    ) : null}
                    {archive.metadata.unitEconomics.recentCostSamples.length > 0 ? (
                      <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#b9ad99]">
                        成本样本：
                        {archive.metadata.unitEconomics.recentCostSamples[0].featureCode} ·{" "}
                        {archive.metadata.unitEconomics.recentCostSamples[0].model} ·{" "}
                        {(archive.metadata.unitEconomics.recentCostSamples[0].costCents / 100).toFixed(2)} 元
                      </p>
                    ) : null}
                  </article>
                );
              })
            ) : (
              <p className="rounded-md bg-[#080705] p-4 text-sm text-[#b9ad99]">
                暂无归档记录。完成一次落库探针或第三方诊断后，可先归档当前状态作为上线证据；归档线下办理、阶段推进门槛和生产总门禁会一起进入快照。
              </p>
            )}
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">上线 Runbook</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                联调与收费上线操作清单
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchRunbook.detail}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchRunbook.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {launchRunbook.label}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-[#3c8b72] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">ready</p>
              <p className="mt-2 text-2xl font-semibold text-[#cfe9df]">
                {launchRunbook.summary.ready}
              </p>
            </div>
            <div className="rounded-md border border-[#c8a15a] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">warning</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d49a]">
                {launchRunbook.summary.warning}
              </p>
            </div>
            <div className="rounded-md border border-[#b34c32] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">blocking</p>
              <p className="mt-2 text-2xl font-semibold text-[#f0d2c8]">
                {launchRunbook.summary.blocking}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">步骤</p>
              <p className="mt-2 text-2xl font-semibold text-[#fff7e8]">
                {launchRunbook.summary.total}
              </p>
            </div>
          </div>

          {launchRunbook.nextSteps.length > 0 ? (
            <div className="mt-5 rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                下一步优先处理
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {launchRunbook.nextSteps.map((step) => {
                  const style = statusStyle(step.status);
                  const Icon = style.icon;

                  return (
                    <article key={step.id} className={`rounded-md border p-4 ${style.className}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-[#b9ad99]">{step.owner}</p>
                          <p className="mt-1 font-semibold text-[#fff7e8]">{step.title}</p>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#080705]/70 px-2 py-1 text-xs">
                          <Icon size={14} aria-hidden="true" />
                          {style.label}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[#d8cab2]">{step.action}</p>
                      <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#b9ad99]">
                        验收证据：{step.evidence}
                      </p>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-5 space-y-4">
            {launchRunbook.groups.map((group) => {
              const groupStyle = statusStyle(group.status);
              const GroupIcon = groupStyle.icon;

              return (
                <section key={group.id} className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <h3 className="font-ritual text-2xl text-[#fff7e8]">{group.title}</h3>
                    <span
                      className={`inline-flex w-fit items-center gap-2 rounded-md border px-2 py-1 text-xs font-semibold ${groupStyle.className}`}
                    >
                      <GroupIcon size={14} aria-hidden="true" />
                      {groupStyle.label}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 xl:grid-cols-2">
                    {group.steps.map((step) => {
                      const style = statusStyle(step.status);
                      const Icon = style.icon;

                      return (
                        <article key={step.id} className={`rounded-md border p-4 ${style.className}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs text-[#b9ad99]">{step.owner}</p>
                              <p className="mt-1 font-semibold text-[#fff7e8]">{step.title}</p>
                            </div>
                            <span className="inline-flex items-center gap-1 rounded-md bg-[#080705]/70 px-2 py-1 text-xs">
                              <Icon size={14} aria-hidden="true" />
                              {style.label}
                            </span>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-[#d8cab2]">{step.why}</p>
                          <p className="mt-3 rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#b9ad99]">
                            动作：{step.action}
                          </p>
                          <p className="mt-2 rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#b9ad99]">
                            证据：{step.evidence}
                          </p>
                          {step.relatedIssues.length > 0 ? (
                            <div className="mt-3 space-y-2">
                              {step.relatedIssues.map((issue) => {
                                const issueStyle = statusStyle(issue.status);
                                const IssueIcon = issueStyle.icon;

                                return (
                                  <div
                                    key={`${step.id}-${issue.id}`}
                                    className="rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#b9ad99]"
                                  >
                                    <p className="flex items-center gap-2 font-semibold text-[#fff7e8]">
                                      <IssueIcon size={14} aria-hidden="true" />
                                      {issue.label}
                                    </p>
                                    <p className="mt-1">{issue.detail}</p>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">数据库落地</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                {launchDatabasePlan.label}
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {launchDatabasePlan.detail}
              </p>
              <p className="mt-2 max-w-3xl leading-7 text-[#d8cab2]">
                {launchDatabasePlan.action}
              </p>
            </div>
            {(() => {
              const style = statusStyle(launchDatabasePlan.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  PostgreSQL
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">连接串</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchDatabasePlan.database.configured ? "已配置" : "未配置"}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">存储模式</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchDatabasePlan.database.storeMode}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">外部事项</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchDatabasePlan.database.externalStatusLabel}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">事件覆盖</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchDatabasePlan.database.requiredEventCoverage}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">最近探针</p>
              <p className="mt-2 break-words text-sm font-semibold leading-6 text-[#fff7e8]">
                {launchDatabasePlan.database.lastProbeLabel}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">验收证据</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchDatabasePlan.evidenceSummary.readyItems}/
                {launchDatabasePlan.evidenceSummary.trackedItems || 7}
              </p>
              <p className="mt-1 break-words text-xs leading-5 text-[#b9ad99]">
                {launchDatabasePlan.database.latestEvidenceAt
                  ? launchDatabasePlan.database.latestEvidenceAt.slice(0, 16).replace("T", " ")
                  : "暂无"}
              </p>
            </div>
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <p className="text-xs text-[#b9ad99]">步骤</p>
              <p className="mt-2 font-semibold text-[#fff7e8]">
                {launchDatabasePlan.summary.ready}/{launchDatabasePlan.summary.total}
              </p>
              <p className="mt-1 text-xs text-[#b9ad99]">
                {launchDatabasePlan.summary.blocking} 阻断
              </p>
            </div>
          </div>

          <div className="mt-5">
            <AdminLaunchDatabaseAcceptanceEvidenceForm
              adminToken={adminToken}
              records={launchDatabasePlan.evidenceRecords}
            />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                <ClipboardCheck size={16} aria-hidden="true" />
                数据库落地步骤
              </div>
              <div className="mt-4 space-y-3">
                {launchDatabasePlan.steps.map((step) => {
                  const style = statusStyle(step.status);
                  const Icon = style.icon;

                  return (
                    <article key={step.id} className={`rounded-md border p-3 ${style.className}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-[#b9ad99]">
                            步骤 {step.order} · {step.owner}
                          </p>
                          <p className="mt-1 font-semibold text-[#fff7e8]">{step.title}</p>
                        </div>
                        <Icon size={14} aria-hidden="true" />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{step.detail}</p>
                      <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                        动作：{step.action}
                      </p>
                      {step.command ? (
                        <p className="mt-2 break-words rounded-md bg-[#080705]/70 p-2 font-mono text-xs leading-5 text-[#f0d49a]">
                          {step.command}
                        </p>
                      ) : null}
                      <p className="mt-2 rounded-md bg-[#080705]/70 p-2 text-xs leading-5 text-[#b9ad99]">
                        证据：{step.evidence}
                      </p>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  命令顺序
                </div>
                <div className="mt-4 space-y-3">
                  {launchDatabasePlan.commandGroups.map((group) => (
                    <article key={group.title} className="rounded-md border border-[#3a3023] bg-[#12100d] p-3">
                      <p className="font-semibold text-[#fff7e8]">{group.title}</p>
                      <p className="mt-1 text-xs leading-5 text-[#b9ad99]">{group.when}</p>
                      <div className="mt-3 space-y-2">
                        {group.commands.map((command) => (
                          <div key={command.label} className="rounded-md bg-[#080705] p-2">
                            <p className="text-xs font-semibold text-[#f0d49a]">
                              {command.label}
                            </p>
                            <p className="mt-1 break-words font-mono text-xs leading-5 text-[#fff7e8]">
                              {command.command}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-[#b9ad99]">
                              {command.detail}
                            </p>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  数据库证据清单
                </div>
                <div className="mt-4 space-y-2">
                  {launchDatabasePlan.evidence.map((item) => (
                    <p
                      key={item}
                      className="rounded-md bg-[#12100d] p-2 text-xs leading-5 text-[#d8cab2]"
                    >
                      {item}
                    </p>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-[#3a3023] bg-[#080705] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f0d49a]">
                  <ClipboardCheck size={16} aria-hidden="true" />
                  可复制数据库计划
                </div>
                <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#12100d] p-4 text-xs leading-6 text-[#d8cab2]">
                  {launchDatabasePlan.copyText}
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">生产数据落库</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                PostgreSQL 读写验收
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                {persistenceReadiness.detail}
              </p>
              <AdminPersistenceProbeActions adminToken={adminToken} />
            </div>
            {(() => {
              const style = statusStyle(persistenceReadiness.status);
              const Icon = style.icon;

              return (
                <span
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${style.className}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {persistenceReadiness.label}
                </span>
              );
            })()}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {persistenceReadiness.items.map((item) => {
              const style = statusStyle(item.status);
              const Icon = style.icon;

              return (
                <article key={item.label} className={`rounded-md border p-4 ${style.className}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-[#b9ad99]">{item.label}</p>
                    <Icon size={14} aria-hidden="true" />
                  </div>
                  <p className="mt-2 text-xl font-semibold text-[#fff7e8]">{item.value}</p>
                  <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.detail}</p>
                </article>
              );
            })}
          </div>

          <div className="mt-5 rounded-md border border-[#3a3023] bg-[#080705] p-4">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <p className="text-sm font-semibold text-[#f0d49a]">上线事件持久化</p>
                <p className="mt-2 text-xs leading-5 text-[#b9ad99]">
                  必要事件 {persistenceReadiness.featureCoverage.covered}/
                  {persistenceReadiness.featureCoverage.required} 已有记录，缺口{" "}
                  {persistenceReadiness.featureCoverage.missingRequired} 类。
                </p>
              </div>
              <span className="inline-flex w-fit rounded-md border border-[#6a5431] px-3 py-2 text-xs font-semibold text-[#fff7e8]">
                {persistenceReadiness.featureCoverage.total} 类事件
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {persistenceReadiness.featureCoverage.items.map((item) => {
                const style = statusStyle(item.status);
                const Icon = style.icon;

                return (
                  <article key={item.feature} className={`rounded-md border p-3 ${style.className}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-[#b9ad99]">{item.required ? "必要" : "辅助"}</p>
                        <p className="mt-1 font-semibold text-[#fff7e8]">{item.label}</p>
                      </div>
                      <Icon size={14} aria-hidden="true" />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{item.purpose}</p>
                    <p className="mt-2 rounded-md bg-[#12100d] p-2 text-xs leading-5 text-[#b9ad99]">
                      {item.count} 条 · {item.action}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="mt-4 rounded-md bg-[#080705] p-3 text-sm leading-6 text-[#b9ad99]">
            <Database className="mr-2 inline text-[#c8a15a]" size={15} aria-hidden="true" />
            {persistenceReadiness.action}
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold text-[#c8a15a]">第三方联调诊断</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                AI、存储与支付探针
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-[#b9ad99]">
                对 OpenAI 模型读取、七牛上传 token、支付宝签名和微信支付签名做低风险验收。
              </p>
              <AdminIntegrationProbeActions adminToken={adminToken} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-md border border-[#3c8b72] bg-[#3c8b72]/10 p-3">
                <p className="text-xl font-semibold text-[#cfe9df]">
                  {integrationDiagnostics.summary.ready}
                </p>
                <p className="text-xs text-[#b9ad99]">ready</p>
              </div>
              <div className="rounded-md border border-[#c8a15a] bg-[#c8a15a]/10 p-3">
                <p className="text-xl font-semibold text-[#f0d49a]">
                  {integrationDiagnostics.summary.warning}
                </p>
                <p className="text-xs text-[#b9ad99]">warning</p>
              </div>
              <div className="rounded-md border border-[#b34c32] bg-[#b34c32]/10 p-3">
                <p className="text-xl font-semibold text-[#f0d2c8]">
                  {integrationDiagnostics.summary.blocking}
                </p>
                <p className="text-xs text-[#b9ad99]">blocking</p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {integrationDiagnostics.items.map((probe) => {
              const style = statusStyle(probe.status);
              const Icon = style.icon;

              return (
                <article key={probe.id} className={`rounded-lg border p-4 ${style.className}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-[#fff7e8]">{probe.label}</p>
                      <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{probe.detail}</p>
                      {probe.checkedAt ? (
                        <p className="mt-2 text-xs text-[#6f6455]">
                          最近诊断 {probe.checkedAt.slice(0, 19).replace("T", " ")}
                        </p>
                      ) : null}
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-md bg-[#080705]/70 px-2 py-1 text-xs">
                      <Icon size={14} aria-hidden="true" />
                      {style.label}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {probe.diagnostics.map((diagnostic) => (
                      <div
                        key={`${probe.id}-${diagnostic.label}`}
                        className="rounded-md bg-[#080705]/70 p-3 text-sm"
                      >
                        <p className="text-xs text-[#b9ad99]">{diagnostic.label}</p>
                        <p className={`mt-1 font-semibold ${statusStyle(diagnostic.status).className}`}>
                          {diagnostic.value}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#b9ad99]">
                    {probe.action}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        <div className="space-y-6">
          {groupedChecks.map(([group, groupChecks]) => (
            <section key={group} className="rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
              <h2 className="font-ritual text-3xl text-[#fff7e8]">{group}</h2>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {groupChecks.map((check) => {
                  const style = statusStyle(check.status);
                  const Icon = style.icon;

                  return (
                    <article key={check.id} className={`rounded-lg border p-4 ${style.className}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-[#fff7e8]">{check.label}</p>
                          <p className="mt-2 text-sm leading-6 text-[#d8cab2]">{check.detail}</p>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#080705]/70 px-2 py-1 text-xs">
                          <Icon size={14} aria-hidden="true" />
                          {style.label}
                        </span>
                      </div>
                      <p className="mt-4 rounded-md bg-[#080705]/70 p-3 text-sm leading-6 text-[#b9ad99]">
                        {check.action}
                      </p>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
