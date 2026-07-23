import type { MockReport } from "@/lib/report-store";

const sensitiveKeys = new Set([
  "question",
  "name",
  "gender",
  "birthDate",
  "birthTime",
  "birthPlace",
  "email",
  "emailMasked",
  "relationshipStatus",
  "careerFocus",
  "recurringTopics",
  "memorySummary",
  "profileMemory",
]);

const replacementByKey: Record<string, string> = {
  question: "已隐藏的个人问题",
  name: "用户",
  gender: "已隐藏性别",
  birthDate: "已隐藏日期",
  birthTime: "已隐藏时辰",
  birthPlace: "已隐藏地点",
  email: "已隐藏账户",
  emailMasked: "已隐藏账户",
  relationshipStatus: "已隐藏关系状态",
  careerFocus: "已隐藏事业方向",
  recurringTopics: "已隐藏长期关注",
  memorySummary: "已隐藏个人档案",
  profileMemory: "已隐藏个人档案",
};

type SensitiveEntry = { value: string; replacement: string };

function addSensitiveEntry(
  value: string,
  replacement: string,
  entries: SensitiveEntry[],
) {
  const normalized = value.trim();

  if (normalized.length < 2) {
    return;
  }

  entries.push({ value: normalized, replacement });

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);

  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    entries.push({
      value: `${year}年${Number(month)}月${Number(day)}日`,
      replacement,
    });
    entries.push({ value: `${year}年${month}月${day}日`, replacement });
  }
}

function collectMarkedValues(
  value: unknown,
  replacement: string,
  entries: SensitiveEntry[],
) {
  if (typeof value === "string") {
    addSensitiveEntry(value, replacement, entries);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectMarkedValues(item, replacement, entries));
  }
}

function collectSensitiveStrings(
  value: unknown,
  entries: SensitiveEntry[],
) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectSensitiveStrings(item, entries));
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (sensitiveKeys.has(key)) {
      collectMarkedValues(
        child,
        replacementByKey[key] ?? "已隐藏信息",
        entries,
      );
      continue;
    }

    collectSensitiveStrings(child, entries);
  }
}

function sanitizeText(
  text: string,
  entries: SensitiveEntry[],
) {
  const uniqueEntries = Array.from(
    new Map(entries.map((entry) => [entry.value, entry])).values(),
  );

  return uniqueEntries
    .sort((a, b) => b.value.length - a.value.length)
    .reduce(
      (result, entry) => result.split(entry.value).join(entry.replacement),
      text,
    );
}

export function getPublicReportView(report: MockReport) {
  const entries: SensitiveEntry[] = [];

  collectSensitiveStrings(report.inputSnapshot, entries);

  return {
    title: sanitizeText(report.title, entries),
    summary: sanitizeText(report.summary, entries),
    content: sanitizeText(report.content, entries),
  };
}
