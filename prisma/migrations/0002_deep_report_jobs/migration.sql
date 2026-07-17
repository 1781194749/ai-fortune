-- CreateEnum
CREATE TYPE "DeepReportJobStatus" AS ENUM ('PENDING_DISPATCH', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Report" ADD COLUMN "requestKey" TEXT;

-- AlterTable
ALTER TABLE "UsageLog" ADD COLUMN "idempotencyKey" TEXT;

-- CreateTable
CREATE TABLE "DeepReportJob" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "orderId" TEXT,
    "productCode" TEXT NOT NULL,
    "status" "DeepReportJobStatus" NOT NULL DEFAULT 'PENDING_DISPATCH',
    "inputSnapshot" JSONB NOT NULL,
    "paymentSource" TEXT,
    "entitlementKind" "EntitlementKind",
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "redisJobId" TEXT,
    "lastError" TEXT,
    "queuedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "nextDispatchAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeepReportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Report_requestKey_key" ON "Report"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "DeepReportJob_requestKey_key" ON "DeepReportJob"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "DeepReportJob_reportId_key" ON "DeepReportJob"("reportId");

-- CreateIndex
CREATE INDEX "DeepReportJob_status_nextDispatchAt_updatedAt_idx" ON "DeepReportJob"("status", "nextDispatchAt", "updatedAt");

-- CreateIndex
CREATE INDEX "DeepReportJob_userId_createdAt_idx" ON "DeepReportJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DeepReportJob_orderId_idx" ON "DeepReportJob"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "UsageLog_idempotencyKey_key" ON "UsageLog"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "DeepReportJob" ADD CONSTRAINT "DeepReportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeepReportJob" ADD CONSTRAINT "DeepReportJob_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeepReportJob" ADD CONSTRAINT "DeepReportJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
