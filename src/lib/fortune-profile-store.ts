import "server-only";

import { randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { calculateBazi, type BaziInput } from "@/lib/bazi";
import { formatBirthDate, normalizeBirthCalendarType } from "@/lib/birth-calendar";
import { assertDatabaseFallbackAllowed, tryPrisma } from "@/lib/prisma";
import { ensureDbUser } from "@/lib/user-store";

type NullableText = string | null;

export type FortuneProfileInput = {
  name?: string | null;
  gender?: string | null;
  birthDate?: string | null;
  birthTime?: string | null;
  birthPlace?: string | null;
  calendarType?: string | null;
  relationshipStatus?: string | null;
  careerFocus?: string | null;
  recurringTopics?: string[] | string | null;
};

export type FortuneProfileRecord = {
  id: string;
  userId: string;
  name: NullableText;
  gender: NullableText;
  birthDate: NullableText;
  birthTime: NullableText;
  birthPlace: NullableText;
  calendarType: string;
  baziChart: unknown;
  wuxingProfile: unknown;
  zodiac: NullableText;
  recurringTopics: string[];
  relationshipStatus: NullableText;
  careerFocus: NullableText;
  preferences: unknown;
  memorySummary: NullableText;
  completeness: number;
  createdAt: string;
  updatedAt: string;
};

type DbProfileLike = {
  id: string;
  userId: string;
  name: string | null;
  gender: string | null;
  birthday: Date | null;
  birthTime: string | null;
  birthPlace: string | null;
  calendarType: string;
  baziChart: unknown;
  wuxingProfile: unknown;
  zodiac: string | null;
  recurringTopics: unknown;
  relationshipStatus: string | null;
  careerFocus: string | null;
  preferences: unknown;
  memorySummary: string | null;
  createdAt: Date;
  updatedAt: Date;
};

declare global {
  var xuanjiFortuneProfiles: Map<string, FortuneProfileRecord> | undefined;
  var xuanjiFortuneProfilesLoadPromise: Promise<void> | undefined;
  var xuanjiFortuneProfilesWriteQueue: Promise<void> | undefined;
}

const fortuneProfiles =
  globalThis.xuanjiFortuneProfiles ?? new Map<string, FortuneProfileRecord>();

if (!globalThis.xuanjiFortuneProfiles) {
  globalThis.xuanjiFortuneProfiles = fortuneProfiles;
}

const localProfileStorePath = join(process.cwd(), ".data", "fortune-profiles.json");

function canUseLocalProfileStore() {
  return process.env.NODE_ENV !== "production";
}

function requireProfileDatabaseRead() {
  assertDatabaseFallbackAllowed("PostgreSQL 暂时不可用，无法读取命理档案。");
}

function requireProfileDatabaseWrite() {
  assertDatabaseFallbackAllowed("PostgreSQL 暂时不可用，命理档案未保存。");
}

function isProfileRecord(value: unknown): value is FortuneProfileRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const profile = value as Partial<FortuneProfileRecord>;
  return (
    typeof profile.id === "string" &&
    typeof profile.userId === "string" &&
    typeof profile.calendarType === "string" &&
    Array.isArray(profile.recurringTopics) &&
    typeof profile.createdAt === "string" &&
    typeof profile.updatedAt === "string"
  );
}

async function ensureLocalProfilesLoaded() {
  if (!canUseLocalProfileStore()) {
    return;
  }

  if (!globalThis.xuanjiFortuneProfilesLoadPromise) {
    globalThis.xuanjiFortuneProfilesLoadPromise = (async () => {
      try {
        const content = await readFile(localProfileStorePath, "utf8");
        const parsed = JSON.parse(content) as { profiles?: unknown };

        if (!Array.isArray(parsed.profiles)) {
          return;
        }

        for (const profile of parsed.profiles) {
          if (isProfileRecord(profile)) {
            fortuneProfiles.set(profile.userId, profile);
          }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          console.warn("Unable to read the local fortune profile store.");
        }
      }
    })();
  }

  await globalThis.xuanjiFortuneProfilesLoadPromise;
}

async function persistLocalProfiles() {
  if (!canUseLocalProfileStore()) {
    return;
  }

  const previousWrite = globalThis.xuanjiFortuneProfilesWriteQueue ?? Promise.resolve();
  const nextWrite = previousWrite
    .catch(() => undefined)
    .then(async () => {
      await mkdir(dirname(localProfileStorePath), { recursive: true });
      const temporaryPath = `${localProfileStorePath}.${process.pid}.tmp`;
      const content = JSON.stringify(
        { version: 1, profiles: Array.from(fortuneProfiles.values()) },
        null,
        2,
      );

      await writeFile(temporaryPath, `${content}\n`, "utf8");
      await rename(temporaryPath, localProfileStorePath);
    });

  globalThis.xuanjiFortuneProfilesWriteQueue = nextWrite;

  try {
    await nextWrite;
  } catch {
    console.warn("Unable to persist the local fortune profile store.");
  }
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim().slice(0, maxLength);
  return text || null;
}

function cleanCalendarType(value: unknown) {
  return normalizeBirthCalendarType(typeof value === "string" ? value : null);
}

function cleanBirthDate(value: unknown) {
  const text = cleanText(value, 10);

  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }

  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : text;
}

function cleanBirthTime(value: unknown) {
  const text = cleanText(value, 5);

  if (!text || !/^\d{2}:\d{2}$/.test(text)) {
    return null;
  }

  return text;
}

function cleanTopics(value: FortuneProfileInput["recurringTopics"]) {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,，、]/) : [];
  const topics = raw
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.slice(0, 24));

  return Array.from(new Set(topics)).slice(0, 8);
}

function toJsonValue(value: unknown) {
  if (value === undefined) {
    return undefined as never;
  }

  return JSON.parse(JSON.stringify(value)) as never;
}

function parseJsonStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function formatDate(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : null;
}

function splitCareerFocusForCompleteness(value: string | null) {
  if (!value) {
    return { industry: null, role: null };
  }

  const [industry, ...roleParts] = value.split(" · ");

  if (roleParts.length === 0) {
    return { industry: null, role: value };
  }

  return {
    industry: industry.trim() || null,
    role: roleParts.join(" · ").trim() || null,
  };
}

function calculateCompleteness(profile: Pick<
  FortuneProfileRecord,
  | "name"
  | "birthDate"
  | "careerFocus"
  | "recurringTopics"
>) {
  const career = splitCareerFocusForCompleteness(profile.careerFocus);
  const fields = [
    profile.name,
    profile.birthDate,
    career.industry,
    career.role,
    profile.recurringTopics.length > 0 ? "topics" : null,
  ];
  const filled = fields.filter(Boolean).length;

  return Math.round((filled / fields.length) * 100);
}

function buildDerivedProfile(input: {
  name: string | null;
  gender: string | null;
  birthDate: string | null;
  birthTime: string | null;
  birthPlace: string | null;
  calendarType: string;
  relationshipStatus: string | null;
  careerFocus: string | null;
  recurringTopics: string[];
}) {
  let baziChart: unknown = null;
  let wuxingProfile: unknown = null;
  let zodiac: string | null = null;

  if (input.calendarType === "solar" && input.birthDate && input.birthTime) {
    try {
      const chart = calculateBazi({
        name: input.name ?? undefined,
        gender: input.gender ?? undefined,
        birthDate: input.birthDate,
        birthTime: input.birthTime,
        birthPlace: input.birthPlace ?? undefined,
      } satisfies BaziInput);

      baziChart = {
        solar: chart.solar,
        lunar: chart.lunar,
        bazi: chart.bazi,
        pillars: chart.pillars,
      };
      wuxingProfile = {
        counts: chart.counts,
        strongest: chart.strongest,
        weakest: chart.weakest,
      };
      zodiac = chart.zodiac;
    } catch {
      baziChart = null;
      wuxingProfile = null;
      zodiac = null;
    }
  }

  const memorySummary = [
    input.name ? `姓名/称呼：${input.name}` : null,
    input.birthDate
      ? `出生：${formatBirthDate(input.birthDate, input.calendarType)} ${input.birthTime ?? ""}`.trim()
      : null,
    input.birthPlace ? `出生地：${input.birthPlace}` : null,
    zodiac ? `生肖：${zodiac}` : null,
    input.relationshipStatus ? `关系状态：${input.relationshipStatus}` : null,
    input.careerFocus ? `事业关注：${input.careerFocus}` : null,
    input.recurringTopics.length > 0
      ? `长期关注：${input.recurringTopics.join("、")}`
      : null,
  ]
    .filter(Boolean)
    .join("；");

  return {
    baziChart,
    wuxingProfile,
    zodiac,
    memorySummary: memorySummary || null,
  };
}

function normalizeProfileInput(input: FortuneProfileInput) {
  const normalized = {
    name: cleanText(input.name, 30),
    gender: cleanText(input.gender, 20),
    birthDate: cleanBirthDate(input.birthDate),
    birthTime: cleanBirthTime(input.birthTime),
    birthPlace: cleanText(input.birthPlace, 60),
    calendarType: cleanCalendarType(input.calendarType),
    relationshipStatus: cleanText(input.relationshipStatus, 40),
    careerFocus: cleanText(input.careerFocus, 80),
    recurringTopics: cleanTopics(input.recurringTopics),
  };

  return {
    ...normalized,
    ...buildDerivedProfile(normalized),
    preferences: {
      language: "zh-CN",
      style: "warm_practical",
    },
  };
}

function mapDbProfile(profile: DbProfileLike): FortuneProfileRecord {
  const record = {
    id: profile.id,
    userId: profile.userId,
    name: profile.name,
    gender: profile.gender,
    birthDate: formatDate(profile.birthday),
    birthTime: profile.birthTime,
    birthPlace: profile.birthPlace,
    calendarType: profile.calendarType,
    baziChart: profile.baziChart,
    wuxingProfile: profile.wuxingProfile,
    zodiac: profile.zodiac,
    recurringTopics: parseJsonStringArray(profile.recurringTopics),
    relationshipStatus: profile.relationshipStatus,
    careerFocus: profile.careerFocus,
    preferences: profile.preferences,
    memorySummary: profile.memorySummary,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };

  return {
    ...record,
    completeness: calculateCompleteness(record),
  };
}

export async function getFortuneProfile(userId: string) {
  const dbResult = await tryPrisma(async (prisma) => {
    const profile = await prisma.fortuneProfile.findUnique({ where: { userId } });
    return profile ? mapDbProfile(profile) : null;
  });

  if (dbResult.ok) {
    if (dbResult.value) {
      fortuneProfiles.set(userId, dbResult.value);
    }

    return dbResult.value;
  }

  requireProfileDatabaseRead();

  await ensureLocalProfilesLoaded();

  const fallback = fortuneProfiles.get(userId);

  if (!fallback) {
    return null;
  }

  const refreshed = {
    ...fallback,
    completeness: calculateCompleteness(fallback),
  } satisfies FortuneProfileRecord;

  fortuneProfiles.set(userId, refreshed);
  return refreshed;
}

export async function upsertFortuneProfile(userId: string, input: FortuneProfileInput) {
  const normalized = normalizeProfileInput(input);
  const birthday = normalized.birthDate
    ? new Date(`${normalized.birthDate}T00:00:00.000Z`)
    : null;

  const dbResult = await tryPrisma(async (prisma) => {
    await ensureDbUser(prisma, { userId });

    const profile = await prisma.fortuneProfile.upsert({
      where: { userId },
      update: {
        name: normalized.name,
        gender: normalized.gender,
        birthday,
        birthTime: normalized.birthTime,
        birthPlace: normalized.birthPlace,
        calendarType: normalized.calendarType,
        baziChart: toJsonValue(normalized.baziChart),
        wuxingProfile: toJsonValue(normalized.wuxingProfile),
        zodiac: normalized.zodiac,
        recurringTopics: toJsonValue(normalized.recurringTopics),
        relationshipStatus: normalized.relationshipStatus,
        careerFocus: normalized.careerFocus,
        preferences: toJsonValue(normalized.preferences),
        memorySummary: normalized.memorySummary,
      },
      create: {
        userId,
        name: normalized.name,
        gender: normalized.gender,
        birthday,
        birthTime: normalized.birthTime,
        birthPlace: normalized.birthPlace,
        calendarType: normalized.calendarType,
        baziChart: toJsonValue(normalized.baziChart),
        wuxingProfile: toJsonValue(normalized.wuxingProfile),
        zodiac: normalized.zodiac,
        recurringTopics: toJsonValue(normalized.recurringTopics),
        relationshipStatus: normalized.relationshipStatus,
        careerFocus: normalized.careerFocus,
        preferences: toJsonValue(normalized.preferences),
        memorySummary: normalized.memorySummary,
      },
    });

    return mapDbProfile(profile);
  });

  if (dbResult.ok) {
    fortuneProfiles.set(userId, dbResult.value);
    await persistLocalProfiles();
    return dbResult.value;
  }

  requireProfileDatabaseWrite();

  await ensureLocalProfilesLoaded();
  const current = fortuneProfiles.get(userId);
  const now = new Date().toISOString();
  const record = {
    id: current?.id ?? `profile_${randomUUID()}`,
    userId,
    name: normalized.name,
    gender: normalized.gender,
    birthDate: normalized.birthDate,
    birthTime: normalized.birthTime,
    birthPlace: normalized.birthPlace,
    calendarType: normalized.calendarType,
    baziChart: normalized.baziChart,
    wuxingProfile: normalized.wuxingProfile,
    zodiac: normalized.zodiac,
    recurringTopics: normalized.recurringTopics,
    relationshipStatus: normalized.relationshipStatus,
    careerFocus: normalized.careerFocus,
    preferences: normalized.preferences,
    memorySummary: normalized.memorySummary,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };

  const completed = {
    ...record,
    completeness: calculateCompleteness(record),
  } satisfies FortuneProfileRecord;

  fortuneProfiles.set(userId, completed);
  await persistLocalProfiles();
  return completed;
}

export function hasSavedFortuneProfile(profile: FortuneProfileRecord | null) {
  return Boolean(
    profile &&
      (profile.completeness >= 100 ||
        profile.memorySummary ||
        profile.name ||
        profile.birthDate ||
        profile.careerFocus ||
        profile.recurringTopics.length > 0),
  );
}

export function buildProfileMemory(profile: FortuneProfileRecord | null) {
  if (!profile) {
    return "会员尚未填写命理档案。";
  }

  const wuxing =
    profile.wuxingProfile && typeof profile.wuxingProfile === "object"
      ? (profile.wuxingProfile as { strongest?: string; weakest?: string[] })
      : null;
  const chart =
    profile.baziChart && typeof profile.baziChart === "object"
      ? (profile.baziChart as { bazi?: string[] })
      : null;

  return [
    profile.memorySummary,
    chart?.bazi?.length ? `四柱：${chart.bazi.join("、")}` : null,
    wuxing?.strongest ? `五行偏强：${wuxing.strongest}` : null,
    wuxing?.weakest?.length ? `五行需照顾：${wuxing.weakest.join("、")}` : null,
    `档案完整度：${profile.completeness}%`,
  ]
    .filter(Boolean)
    .join("；");
}
