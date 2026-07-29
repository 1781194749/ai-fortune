-- Replace the single-profile constraint with named per-person profiles.
ALTER TABLE "FortuneProfile"
ADD COLUMN "subjectKey" TEXT NOT NULL DEFAULT 'self',
ADD COLUMN "lunarBirthDate" TEXT,
ADD COLUMN "yinliBirthDate" TEXT;

DROP INDEX "FortuneProfile_userId_key";
CREATE UNIQUE INDEX "FortuneProfile_userId_subjectKey_key"
ON "FortuneProfile"("userId", "subjectKey");
CREATE INDEX "FortuneProfile_userId_updatedAt_idx"
ON "FortuneProfile"("userId", "updatedAt");

-- Persist the monthly question allowance and the real profile-count limit.
ALTER TABLE "Membership"
ADD COLUMN "chatQuota" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN "chatUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "profileLimit" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "quotaPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Membership"
SET
  "chatQuota" = CASE "tier"
    WHEN 'TRIAL' THEN 30
    WHEN 'MONTHLY' THEN 30
    WHEN 'PRO' THEN 100
    WHEN 'YEARLY' THEN 200
    ELSE 10
  END,
  "profileLimit" = CASE "tier"
    WHEN 'TRIAL' THEN 10
    WHEN 'MONTHLY' THEN 10
    WHEN 'PRO' THEN 30
    WHEN 'YEARLY' THEN 100
    ELSE 3
  END,
  "quotaPeriodStart" = "startsAt";

-- Quota reservations are refunded independently from legacy star charges.
ALTER TABLE "AiTurn"
ADD COLUMN "quotaUnits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "refundedQuotaUnits" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AiTurn"
ALTER COLUMN "quotaUnits" SET DEFAULT 1;
