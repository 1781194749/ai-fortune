import "server-only";

import { getLaunchCallbackChecklist } from "@/lib/launch-callbacks";
import { getLaunchExternalReadiness } from "@/lib/launch-external-readiness";
import type { HealthStatus } from "@/lib/health-checks";
import {
  getLegalEntity,
  legalDocuments,
  legalVersion,
  type LegalDocument,
} from "@/lib/legal";

type Env = Record<string, string | undefined>;

export type LaunchComplianceItem = {
  id: string;
  group: string;
  title: string;
  status: HealthStatus;
  detail: string;
  action: string;
  evidence: string;
  routes: string[];
};

export type LaunchComplianceChecklist = {
  generatedAt: string;
  status: HealthStatus;
  label: string;
  detail: string;
  action: string;
  version: string;
  summary: {
    ready: number;
    warning: number;
    blocking: number;
    total: number;
  };
  items: LaunchComplianceItem[];
  nextItems: LaunchComplianceItem[];
  copyText: string;
};

const requiredDocs = [
  { slug: "terms", title: "用户协议" },
  { slug: "privacy", title: "隐私政策" },
  { slug: "disclaimer", title: "免责声明" },
  { slug: "upload-consent", title: "图片上传授权" },
] as const;

function statusRank(status: HealthStatus) {
  if (status === "blocking") {
    return 0;
  }

  if (status === "warning") {
    return 1;
  }

  return 2;
}

function textOf(document: LegalDocument | undefined) {
  return [
    document?.title,
    document?.summary,
    ...(document?.sections.flatMap((section) => [section.title, ...section.body]) ?? []),
  ].join("\n");
}

function hasAllWords(text: string, words: string[]) {
  return words.every((word) => text.includes(word));
}

function summarize(items: LaunchComplianceItem[]) {
  return {
    ready: items.filter((item) => item.status === "ready").length,
    warning: items.filter((item) => item.status === "warning").length,
    blocking: items.filter((item) => item.status === "blocking").length,
    total: items.length,
  };
}

function checklistStatus(summary: ReturnType<typeof summarize>): HealthStatus {
  if (summary.blocking > 0) {
    return "blocking";
  }

  if (summary.warning > 0) {
    return "warning";
  }

  return "ready";
}

function checklistCopy(input: {
  status: HealthStatus;
  label: string;
  items: LaunchComplianceItem[];
}) {
  const lines = input.items.map(
    (item, index) =>
      `${index + 1}. [${item.status}] ${item.group} / ${item.title}：${item.action} 证据：${item.evidence}`,
  );

  return [
    "玄机 AI 合规与协议主体一致性核对",
    `状态：${input.label} (${input.status})`,
    `版本日期：${legalVersion}`,
    "",
    ...lines,
  ].join("\n");
}

function item(input: LaunchComplianceItem) {
  return input;
}

export async function getLaunchComplianceChecklist(env: Env = process.env) {
  const [callbacks, external] = await Promise.all([
    getLaunchCallbackChecklist(env),
    getLaunchExternalReadiness(),
  ]);
  const legalEntity = getLegalEntity(env);
  const documentMap = new Map(legalDocuments.map((document) => [document.slug, document]));
  const termsText = textOf(documentMap.get("terms"));
  const privacyText = textOf(documentMap.get("privacy"));
  const disclaimerText = textOf(documentMap.get("disclaimer"));
  const uploadConsentText = textOf(documentMap.get("upload-consent"));
  const legalReview = external.items.find((externalItem) => externalItem.id === "legal_review");
  const termsCallback = callbacks.items.find((callback) => callback.id === "legal:terms");
  const privacyCallback = callbacks.items.find((callback) => callback.id === "legal:privacy");
  const docsReady = requiredDocs.every((required) => documentMap.has(required.slug));
  const contentBoundaryReady =
    hasAllWords(termsText, ["娱乐", "参考"]) &&
    hasAllWords(disclaimerText, ["不提供", "医疗", "投资", "法律"]);
  const privacyReady =
    hasAllWords(privacyText, ["支付宝", "微信支付", "七牛", "OpenAI"]) &&
    hasAllWords(privacyText, ["订单", "图片", "AI"]);
  const uploadConsentReady =
    hasAllWords(uploadConsentText, ["合法授权", "存储", "AI 分析", "删除"]) &&
    hasAllWords(uploadConsentText, ["未成年人", "无权处理"]);
  const items = [
    item({
      id: "legal:documents",
      group: "协议四件套",
      title: "用户协议、隐私政策、免责声明和上传授权",
      status: docsReady ? "ready" : "blocking",
      detail: docsReady
        ? `已配置 ${requiredDocs.length} 份协议文档，版本日期 ${legalVersion}。`
        : "协议文档不完整。",
      action: docsReady
        ? "上线前请完成律师或法务复核，并保留版本记录。"
        : "补齐用户协议、隐私政策、免责声明和图片上传授权页面。",
      evidence: requiredDocs.map((doc) => `/legal/${doc.slug}`).join("、"),
      routes: requiredDocs.map((doc) => `/legal/${doc.slug}`),
    }),
    item({
      id: "legal:entity",
      group: "主体一致性",
      title: "协议主体",
      status: legalEntity.hasCompanyName ? "ready" : "blocking",
      detail: legalEntity.companyName
        ? `当前协议主体：${legalEntity.companyName}。`
        : "COMPANY_NAME 尚未配置真实主体名称。",
      action: legalEntity.companyName
        ? "确认该主体与备案主体、支付宝应用主体和微信支付商户主体一致。"
        : "确定公司或个体工商户主体后，配置 COMPANY_NAME，并同步备案、支付和协议材料。",
      evidence: "首页 footer、协议页、支付平台应用和备案主体展示同一主体名称。",
      routes: ["/", "/legal/terms", "/legal/privacy"],
    }),
    item({
      id: "legal:icp",
      group: "主体一致性",
      title: "ICP备案展示",
      status: legalEntity.hasIcpRecordNo ? "ready" : "blocking",
      detail: legalEntity.icpRecordNo
        ? `当前 ICP 备案号：${legalEntity.icpRecordNo}。`
        : "ICP_RECORD_NO 尚未配置真实备案号。",
      action: legalEntity.icpRecordNo
        ? "确认备案号已在页脚和协议页展示，并与备案系统记录一致。"
        : "ICP备案通过后配置 ICP_RECORD_NO，并确认页脚和协议页展示备案号。",
      evidence: "首页 footer、协议页和备案系统记录展示同一备案号。",
      routes: ["/", "/legal/terms", "/legal/privacy"],
    }),
    item({
      id: "legal:links",
      group: "协议入口",
      title: "平台申请协议链接",
      status:
        termsCallback?.status === "ready" && privacyCallback?.status === "ready"
          ? "ready"
          : "blocking",
      detail: `用户协议：${termsCallback?.value ?? "缺失"}；隐私政策：${privacyCallback?.value ?? "缺失"}。`,
      action: "正式域名配置后，把用户协议和隐私政策链接填入微信、支付宝和备案材料。",
      evidence: "第三方回调配置清单中服务协议 URL 和隐私政策 URL 均为正式 HTTPS 地址。",
      routes: ["/api/admin/launch/callbacks", "/legal/terms", "/legal/privacy"],
    }),
    item({
      id: "legal:content-boundary",
      group: "内容边界",
      title: "AI 命理娱乐参考与非专业建议",
      status: contentBoundaryReady ? "ready" : "blocking",
      detail: contentBoundaryReady
        ? "协议和免责声明已覆盖娱乐参考、非医疗、非投资、非法律等边界。"
        : "协议或免责声明没有完整覆盖 AI 命理内容边界。",
      action: "确保协议与页面文案都明确命理内容仅供娱乐、文化参考和自我探索。",
      evidence: "用户协议和免责声明包含娱乐参考、非专业建议和重大决策风险提示。",
      routes: ["/legal/terms", "/legal/disclaimer"],
    }),
    item({
      id: "legal:privacy-suppliers",
      group: "隐私与供应商",
      title: "支付、图片存储和模型供应商披露",
      status: privacyReady ? "ready" : "warning",
      detail: privacyReady
        ? "隐私政策已披露支付、图片存储、AI 模型和业务日志数据。"
        : "隐私政策需要复核第三方供应商和数据类型披露。",
      action: "上线前根据真实供应商和上线地区补齐数据处理、保存期限、联系方式和用户权利说明。",
      evidence: "隐私政策覆盖支付宝/微信支付、七牛、OpenAI、订单、图片和 AI 调用日志。",
      routes: ["/legal/privacy"],
    }),
    item({
      id: "legal:upload-consent",
      group: "图片授权",
      title: "手相图片上传授权与上传前勾选",
      status: uploadConsentReady ? "ready" : "warning",
      detail: uploadConsentReady
        ? "图片上传授权已覆盖合法授权、存储、AI 分析、删除和禁止上传内容。"
        : "图片上传授权需要补充合法授权、删除或禁止上传边界。",
      action: "保持手相上传前授权勾选，正式上线前用真实图片流程复核授权提示。",
      evidence: "手相页上传按钮需勾选图片上传授权后才可保存图片。",
      routes: ["/palm", "/legal/upload-consent"],
    }),
    item({
      id: "legal:external-review",
      group: "法务复核",
      title: "协议、免责声明和模型供应商披露复核",
      status: legalReview?.healthStatus ?? "blocking",
      detail: legalReview
        ? [
            `外部事项状态：${legalReview.status}`,
            legalReview.evidenceNote ?? legalReview.evidence,
            legalReview.receiptNo ? `回执：${legalReview.receiptNo}` : undefined,
            legalReview.evidenceUrl ? `证据链接：${legalReview.evidenceUrl}` : undefined,
          ]
            .filter(Boolean)
            .join("；")
        : "未找到法务复核外部事项。",
      action: legalReview?.status === "ready"
        ? "保留最终协议版本和复核证据，进入上线证据归档。"
        : "完成用户协议、隐私政策、免责声明、图片上传授权和支付退款说明复核。",
      evidence: "外部事项 legal_review 标记已完成，并留有版本记录或复核证据。",
      routes: ["/admin/health", "/api/admin/launch/external-readiness"],
    }),
  ];
  const sortedItems = [...items].sort(
    (a, b) =>
      statusRank(a.status) - statusRank(b.status) ||
      a.group.localeCompare(b.group, "zh-CN") ||
      a.title.localeCompare(b.title, "zh-CN"),
  );
  const summary = summarize(sortedItems);
  const status = checklistStatus(summary);
  const label =
    status === "blocking"
      ? `合规核对有 ${summary.blocking} 个阻断项`
      : status === "warning"
        ? `合规核对有 ${summary.warning} 个待复核项`
        : "合规核对已闭合";

  return {
    generatedAt: new Date().toISOString(),
    status,
    label,
    detail:
      status === "ready"
        ? "主体、备案、协议、免责声明、隐私披露和图片授权均已通过核对。"
        : "正式收费上线前，需要保证主体、备案、支付主体、协议页和外部平台材料一致。",
    action:
      status === "blocking"
        ? "先补齐主体、ICP备案、正式域名协议链接和法务复核证据。"
        : status === "warning"
          ? "复核隐私供应商、图片授权和最终协议版本后归档上线证据。"
          : "归档最终协议版本，并随上线包进入小流量灰度。",
    version: legalVersion,
    summary,
    items: sortedItems,
    nextItems: sortedItems.filter((item) => item.status !== "ready").slice(0, 8),
    copyText: checklistCopy({ status, label, items: sortedItems }),
  } satisfies LaunchComplianceChecklist;
}
