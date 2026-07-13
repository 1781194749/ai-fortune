import "server-only";

import { ensureDbUser } from "@/lib/user-store";
import { tryPrisma } from "@/lib/prisma";

declare global {
  var xuanjiDailyExperienceClaims: Set<string> | undefined;
}

const memoryClaims =
  globalThis.xuanjiDailyExperienceClaims ?? new Set<string>();

if (!globalThis.xuanjiDailyExperienceClaims) {
  globalThis.xuanjiDailyExperienceClaims = memoryClaims;
}

function getShanghaiDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export async function claimDailyExperience(input: {
  userId: string;
  experience: "tarot_daily";
  now?: Date;
}) {
  const dateKey = getShanghaiDateKey(input.now);
  const claimId = `daily:${input.experience}:${input.userId}:${dateKey}`;
  const dbResult = await tryPrisma(async (prisma) => {
    await ensureDbUser(prisma, { userId: input.userId });

    try {
      await prisma.usageLog.create({
        data: {
          id: claimId,
          userId: input.userId,
          provider: "system",
          model: "daily-experience-v1",
          feature: input.experience,
          metadata: {
            event: "daily_experience_claimed",
            experience: input.experience,
            dateKey,
            timeZone: "Asia/Shanghai",
          },
        },
      });

      return true;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        return false;
      }

      throw error;
    }
  });

  if (dbResult.ok) {
    return dbResult.value;
  }

  if (memoryClaims.has(claimId)) {
    return false;
  }

  memoryClaims.add(claimId);
  return true;
}
