-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('EMAIL', 'WECHAT', 'GOOGLE', 'APPLE');

-- CreateEnum
CREATE TYPE "MembershipTier" AS ENUM ('FREE', 'TRIAL', 'MONTHLY', 'PRO', 'YEARLY');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'CLOSED', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MOCK', 'ALIPAY', 'WECHAT_PAY', 'STRIPE');

-- CreateEnum
CREATE TYPE "WalletEventType" AS ENUM ('GRANT', 'SPEND', 'REFUND', 'EXPIRE', 'ADJUST');

-- CreateEnum
CREATE TYPE "EntitlementKind" AS ENUM ('DEEP_REPORT', 'PALM_READING');

-- CreateEnum
CREATE TYPE "EntitlementEventType" AS ENUM ('GRANT', 'SPEND', 'REFUND', 'EXPIRE', 'ADJUST');

-- CreateEnum
CREATE TYPE "SessionMode" AS ENUM ('CHAT', 'TAROT', 'BAZI', 'BAGUA', 'PALM', 'REPORT');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');

-- CreateEnum
CREATE TYPE "AiTurnStatus" AS ENUM ('GENERATING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('TAROT', 'PALM', 'BAZI_WUXING', 'BAGUA', 'COMPOSITE', 'YEARLY');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('GENERATING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImageKind" AS ENUM ('PALM', 'AVATAR', 'REPORT_ASSET');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'zh-CN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "unionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FortuneProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "gender" TEXT,
    "birthday" TIMESTAMP(3),
    "birthTime" TEXT,
    "birthPlace" TEXT,
    "calendarType" TEXT NOT NULL DEFAULT 'solar',
    "baziChart" JSONB,
    "wuxingProfile" JSONB,
    "zodiac" TEXT,
    "recurringTopics" JSONB,
    "relationshipStatus" TEXT,
    "careerFocus" TEXT,
    "preferences" JSONB,
    "memorySummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FortuneProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" "MembershipTier" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "starBalance" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "turnId" TEXT,
    "type" "WalletEventType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "orderId" TEXT,
    "reportId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntitlementAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "EntitlementKind" NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntitlementAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntitlementTransaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "EntitlementKind" NOT NULL,
    "type" "EntitlementEventType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "orderId" TEXT,
    "reportId" TEXT,
    "idempotencyKey" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntitlementTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "productCode" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "providerOrderId" TEXT,
    "notifyPayload" JSONB,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "SessionMode" NOT NULL,
    "title" TEXT NOT NULL,
    "activeTurnId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiTurn" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" "AiTurnStatus" NOT NULL DEFAULT 'GENERATING',
    "costStars" INTEGER NOT NULL,
    "refundedStars" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT,
    "model" TEXT,
    "usageLogId" TEXT,
    "errorCode" TEXT,
    "result" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "turnId" TEXT,
    "ordinal" INTEGER,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "toolName" TEXT,
    "toolResult" JSONB,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "orderId" TEXT,
    "type" "ReportType" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'GENERATING',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "inputSnapshot" JSONB,
    "toolResults" JSONB,
    "content" TEXT,
    "modelUsed" TEXT,
    "costTokens" INTEGER,
    "shareSlug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageUpload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ImageKind" NOT NULL,
    "qiniuKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "metadata" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "costCents" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "AuthAccount_userId_idx" ON "AuthAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthAccount_provider_providerUserId_key" ON "AuthAccount"("provider", "providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "FortuneProfile_userId_key" ON "FortuneProfile"("userId");

-- CreateIndex
CREATE INDEX "Membership_userId_isActive_idx" ON "Membership"("userId", "isActive");

-- CreateIndex
CREATE INDEX "WalletTransaction_userId_createdAt_idx" ON "WalletTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_turnId_idx" ON "WalletTransaction"("turnId");

-- CreateIndex
CREATE INDEX "EntitlementAccount_userId_idx" ON "EntitlementAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EntitlementAccount_userId_kind_key" ON "EntitlementAccount"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "EntitlementTransaction_idempotencyKey_key" ON "EntitlementTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "EntitlementTransaction_userId_kind_createdAt_idx" ON "EntitlementTransaction"("userId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "EntitlementTransaction_orderId_idx" ON "EntitlementTransaction"("orderId");

-- CreateIndex
CREATE INDEX "EntitlementTransaction_reportId_idx" ON "EntitlementTransaction"("reportId");

-- CreateIndex
CREATE INDEX "Order_userId_status_idx" ON "Order"("userId", "status");

-- CreateIndex
CREATE INDEX "Order_provider_providerOrderId_idx" ON "Order"("provider", "providerOrderId");

-- CreateIndex
CREATE INDEX "AiSession_userId_updatedAt_idx" ON "AiSession"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AiSession_activeTurnId_idx" ON "AiSession"("activeTurnId");

-- CreateIndex
CREATE UNIQUE INDEX "AiTurn_usageLogId_key" ON "AiTurn"("usageLogId");

-- CreateIndex
CREATE INDEX "AiTurn_sessionId_status_idx" ON "AiTurn"("sessionId", "status");

-- CreateIndex
CREATE INDEX "AiTurn_userId_createdAt_idx" ON "AiTurn"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiTurn_userId_clientRequestId_key" ON "AiTurn"("userId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "AiTurn_sessionId_sequence_key" ON "AiTurn"("sessionId", "sequence");

-- CreateIndex
CREATE INDEX "Message_sessionId_createdAt_idx" ON "Message"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_turnId_idx" ON "Message"("turnId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_turnId_ordinal_key" ON "Message"("turnId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "Report_shareSlug_key" ON "Report"("shareSlug");

-- CreateIndex
CREATE INDEX "Report_userId_type_createdAt_idx" ON "Report"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "ImageUpload_userId_kind_createdAt_idx" ON "ImageUpload"("userId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "UsageLog_userId_createdAt_idx" ON "UsageLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageLog_feature_createdAt_idx" ON "UsageLog"("feature", "createdAt");

-- AddForeignKey
ALTER TABLE "AuthAccount" ADD CONSTRAINT "AuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FortuneProfile" ADD CONSTRAINT "FortuneProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "AiTurn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntitlementAccount" ADD CONSTRAINT "EntitlementAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntitlementTransaction" ADD CONSTRAINT "EntitlementTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EntitlementAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntitlementTransaction" ADD CONSTRAINT "EntitlementTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntitlementTransaction" ADD CONSTRAINT "EntitlementTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntitlementTransaction" ADD CONSTRAINT "EntitlementTransaction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSession" ADD CONSTRAINT "AiSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiTurn" ADD CONSTRAINT "AiTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiTurn" ADD CONSTRAINT "AiTurn_usageLogId_fkey" FOREIGN KEY ("usageLogId") REFERENCES "UsageLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "AiTurn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageUpload" ADD CONSTRAINT "ImageUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageLog" ADD CONSTRAINT "UsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
