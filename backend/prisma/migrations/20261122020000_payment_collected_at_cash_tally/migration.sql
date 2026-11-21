-- Expand only: a nullable column and a new table. Old code keeps working; rollback is a code revert.
ALTER TABLE "Payment" ADD COLUMN "collectedAt" TIMESTAMP(3);

-- Cash taken at the desk before this column existed: the last write to the row is the best available stand-in.
UPDATE "Payment" SET "collectedAt" = "updatedAt"
  WHERE "method" = 'ENTRANCE' AND "status" IN ('SUCCESS', 'REFUNDED') AND "collectedAt" IS NULL;

CREATE INDEX "Payment_collectedById_collectedAt_idx" ON "Payment"("collectedById", "collectedAt");

CREATE TABLE "CashTally" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "collectorId" TEXT NOT NULL,
    "instituteId" TEXT,
    "day" TEXT NOT NULL,
    "countedAmount" DECIMAL(12,2) NOT NULL,
    "systemAmount" DECIMAL(12,2) NOT NULL,
    "variance" DECIMAL(12,2) NOT NULL,
    "paymentCount" INTEGER NOT NULL,
    "note" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "reconciledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CashTally_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CashTally_organizationId_idx" ON "CashTally"("organizationId");
CREATE INDEX "CashTally_collectorId_day_idx" ON "CashTally"("collectorId", "day");
CREATE INDEX "CashTally_day_idx" ON "CashTally"("day");
-- One count per collector, day and branch. Prisma cannot express partial indexes (and a nullable branch needs two), so these
-- live only here; `prisma migrate diff` stays clean. The service also takes an advisory lock, so these are the backstop.
CREATE UNIQUE INDEX "CashTally_collectorId_day_instituteId_key" ON "CashTally"("collectorId", "day", "instituteId") WHERE "instituteId" IS NOT NULL;
CREATE UNIQUE INDEX "CashTally_collectorId_day_noInstitute_key" ON "CashTally"("collectorId", "day") WHERE "instituteId" IS NULL;
ALTER TABLE "CashTally" ADD CONSTRAINT "CashTally_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashTally" ADD CONSTRAINT "CashTally_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashTally" ADD CONSTRAINT "CashTally_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashTally" ADD CONSTRAINT "CashTally_reconciledById_fkey" FOREIGN KEY ("reconciledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
